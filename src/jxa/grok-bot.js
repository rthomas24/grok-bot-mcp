// JXA automation for the Grok Bot desktop app. Run by src/grok.js through osascript:
//
//   osascript -l JavaScript grok-bot.js <action> '<json args>'
//
// Prints one line of JSON: {"ok":true,"result":...} or {"ok":false,"error":"..."}.
// It reads and drives the app through the macOS Accessibility API, the same way VoiceOver does.

ObjC.import('AppKit');
ObjC.import('ApplicationServices');

const se = Application('System Events');
let APP = 'Grok Bot';
let BUNDLE_ID = 'com.anysphere.sand';

// Each message is a group labelled "<sender> <time>", e.g. "Researcher 9:55:21 PM".
const MSG_RE = /^(.+) (\d{1,2}:\d{2}:\d{2}(?:\s?[AP]M)?)$/i;
const TIME_RE = /^\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?$/i;
const NOT_AGENTS = ['Toggle compact sidebar', 'Search', 'New chat', 'Connect apps'];

// A definite answer (unknown agent, no such choice): retrying won't help.
class Final extends Error {}

// Set once a keystroke or click has reached the app. After that an action is never retried,
// so a flaky read can't make us send the same message twice.
let committed = false;

function attr(el, name) {
  try { const v = el[name](); return v == null ? '' : String(v); } catch (e) { return ''; }
}

function label(el) { return attr(el, 'name') || attr(el, 'description'); }

function runningApp() {
  const byId = $.NSRunningApplication.runningApplicationsWithBundleIdentifier(BUNDLE_ID);
  if (byId.count > 0) return byId.objectAtIndex(0);
  const all = $.NSWorkspace.sharedWorkspace.runningApplications;
  for (let i = 0; i < all.count; i++) {
    const app = all.objectAtIndex(i);
    if (ObjC.unwrap(app.localizedName) === APP) return app;
  }
  return null;
}

function proc() {
  const p = se.processes.byName(APP);
  if (!p.exists()) throw new Final(`${APP} is not running. Open the ${APP} app and try again.`);
  return p;
}

function win() {
  const p = proc();
  if (p.windows.length === 0) throw new Final(`${APP} has no open window. Open its main window and try again.`);
  return p.windows[0];
}

// Chromium only builds the web page's accessibility tree when something asks for it, and
// Electron apps take AXManualAccessibility as that request. Setting it rebuilds the tree,
// so this only runs after a lookup fails.
function enableAccessibility() {
  const app = runningApp();
  if (!app) return;
  const el = $.AXUIElementCreateApplication(app.processIdentifier);
  $.AXUIElementSetAttributeValue(el, $('AXManualAccessibility'), $.NSNumber.numberWithBool(true));
}

function find(root, pred, maxDepth) {
  // Breadth-first search for the first element matching pred.
  let level = [root];
  for (let d = 0; d <= (maxDepth || 40) && level.length; d++) {
    const next = [];
    for (const el of level) {
      if (pred(el)) return el;
      try { next.push(...el.uiElements()); } catch (e) {}
    }
    level = next;
  }
  return null;
}

function sidebar() {
  const list = find(win(), el => attr(el, 'description') === 'Bots' || attr(el, 'name') === 'Bots');
  if (!list) throw new Error('Could not find the bot list in the sidebar');
  return list;
}

function listAgents() {
  const agents = [];
  for (const el of sidebar().entireContents()) {
    if (attr(el, 'role') !== 'AXButton') continue;
    const name = label(el).split(',')[0].trim();
    if (name && !NOT_AGENTS.includes(name)) agents.push({ name, button: el });
  }
  if (!agents.length) throw new Error('The bot list in the sidebar is empty');
  return agents;
}

function agentButton(agent) {
  const want = String(agent).trim().toLowerCase();
  const agents = listAgents();
  const hit = agents.find(a => a.name.toLowerCase() === want)
    || agents.find(a => a.name.toLowerCase().startsWith(want))
    || agents.find(a => a.name.toLowerCase().includes(want));
  if (!hit) throw new Final(`No agent named "${agent}". Available: ${agents.map(a => a.name).join(', ')}`);
  return hit;
}

function currentAgent() {
  const h = find(win(), el => attr(el, 'role') === 'AXHeading');
  return h ? attr(h, 'description') || attr(h, 'title') || attr(h, 'name') : '';
}

function openAgent(agent) {
  const hit = agentButton(agent);
  if (currentAgent() !== hit.name) {
    hit.button.actions.byName('AXPress').perform();
    for (let i = 0; i < 20 && currentAgent() !== hit.name; i++) delay(0.25);
    delay(0.5);
  }
  return hit.name;
}

function transcript() {
  return find(win(), el => attr(el, 'description') === 'Conversation transcript');
}

// The message groups the transcript has rendered, oldest first. The app only renders recent
// messages, so this is a sliding window: its length doesn't grow with every new message.
function messageGroups() {
  const t = transcript();
  if (!t) {
    sidebar(); // throws if the tree isn't ready; otherwise this chat is simply empty
    return [];
  }
  const groups = [];
  (function collect(el, d) {
    if (d > 4) return;
    for (const k of el.uiElements()) {
      const name = attr(k, 'name');
      const m = MSG_RE.exec(name);
      if (m) groups.push({ el: k, label: name, sender: m[1], time: m[2] });
      else collect(k, d + 1);
    }
  })(t, 0);
  return groups;
}

function parseGroup(g) {
  const texts = [];
  const choices = [];
  let skippedSender = false;
  for (const el of g.el.entireContents()) {
    const role = attr(el, 'role');
    if (role === 'AXButton') {
      const l = label(el);
      if (l && l !== 'Dismiss question') choices.push(l);
      continue;
    }
    if (role !== 'AXStaticText' && role !== 'AXListMarker') continue;
    // Skip text that belongs to a choice button; it's already in `choices`.
    let parentRole = '';
    try { parentRole = attr(el.attributes.byName('AXParent').value(), 'role'); } catch (e) {}
    if (parentRole === 'AXButton') continue;
    const s = (attr(el, 'value') || attr(el, 'name')).trim();
    if (!s || TIME_RE.test(s)) continue;
    if (!skippedSender && s === g.sender) { skippedSender = true; continue; }
    texts.push(s);
  }
  // Join list markers ("1.", "•") with the text that follows them.
  const joined = [];
  for (const s of texts) {
    if (/^\d+\.$|^[•\-]$/.test(s)) joined.push(s + ' ');
    else if (joined.length && /\s$/.test(joined[joined.length - 1])) joined[joined.length - 1] += s;
    else joined.push(s);
  }
  const msg = { sender: g.sender, time: g.time, text: joined.join('\n\n') };
  if (choices.length) {
    msg.question = texts.length ? texts[texts.length - 1] : '';
    msg.choices = choices;
  }
  return msg;
}

// Index of the newest group with this label ("<sender> <time>"), or -1.
function indexOfLabel(groups, label) {
  for (let i = groups.length - 1; i >= 0; i--) if (groups[i].label === label) return i;
  return -1;
}

function prompt() {
  const p = find(win(), el => attr(el, 'role') === 'AXTextArea' && attr(el, 'description') === 'Prompt')
    || find(win(), el => attr(el, 'role') === 'AXTextArea' && attr(el, 'name') === 'Prompt');
  if (!p) throw new Error('Could not find the message box');
  return p;
}

// Put `text` on the clipboard for the duration of fn, then put back everything that was
// there before (text, images, files: every item and every type).
function withClipboard(text, fn) {
  const pb = $.NSPasteboard.generalPasteboard;
  const saved = [];
  const items = pb.pasteboardItems;
  for (let i = 0; items && !items.isNil() && i < items.count; i++) {
    const item = items.objectAtIndex(i);
    const types = item.types;
    const entry = [];
    for (let j = 0; j < types.count; j++) {
      const type = types.objectAtIndex(j);
      const data = item.dataForType(type);
      if (data && !data.isNil()) entry.push([type, data]);
    }
    if (entry.length) saved.push(entry);
  }
  pb.clearContents;
  pb.setStringForType($(text), $.NSPasteboardTypeString);
  // Ask clipboard managers not to record the message.
  pb.setStringForType($(''), $('org.nspasteboard.TransientType'));
  try {
    return fn();
  } finally {
    pb.clearContents;
    if (saved.length) {
      pb.writeObjects($(saved.map(entry => {
        const item = $.NSPasteboardItem.alloc.init;
        for (const [type, data] of entry) item.setDataForType(data, type);
        return item;
      })));
    }
  }
}

const actions = {
  // Never throws; doesn't need Accessibility or Automation access.
  status() {
    const ws = $.NSWorkspace.sharedWorkspace;
    const url = ws.URLForApplicationWithBundleIdentifier(BUNDLE_ID);
    let path = url && !url.isNil() ? ObjC.unwrap(url.path) : null;
    if (!path) {
      const p = ws.fullPathForApplication(APP);
      path = p && !p.isNil() ? ObjC.unwrap(p) : null;
    }
    let version = null;
    if (path) {
      const bundle = $.NSBundle.bundleWithPath(path);
      const v = bundle && !bundle.isNil() ? bundle.objectForInfoDictionaryKey('CFBundleShortVersionString') : null;
      version = v && !v.isNil() ? ObjC.unwrap(v) : null;
    }
    const app = runningApp();
    return {
      installed: Boolean(path),
      path,
      version,
      running: Boolean(app),
      pid: app ? app.processIdentifier : null,
      accessibilityTrusted: Boolean($.AXIsProcessTrusted()),
    };
  },

  list_agents() {
    return { current: currentAgent(), agents: listAgents().map(a => a.name) };
  },

  read({ agent, count }) {
    const name = agent ? openAgent(agent) : currentAgent();
    return { agent: name, messages: messageGroups().slice(-(count || 10)).map(parseGroup) };
  },

  // Messages that came after the group labelled `marker`. Used to wait for replies; only
  // pass `agent` when it's fine to click (polls don't, so they never fight the user).
  after({ agent, marker }) {
    if (agent) openAgent(agent);
    const groups = messageGroups();
    const i = indexOfLabel(groups, marker);
    return { found: i >= 0, messages: i >= 0 ? groups.slice(i + 1).map(parseGroup) : [] };
  },

  send({ agent, message }) {
    if (!message) throw new Final('The message is empty');
    const name = openAgent(agent);
    const seen = {};
    for (const g of messageGroups()) seen[g.label] = true;
    Application(APP).activate();
    delay(0.3);
    const box = prompt();
    try { box.focused = true; } catch (e) {}
    try { box.actions.byName('AXPress').perform(); } catch (e) {}
    delay(0.2);
    committed = true;
    withClipboard(message, () => {
      se.keystroke('a', { using: 'command down' });
      se.keyCode(51); // delete any draft
      se.keystroke('v', { using: 'command down' });
      delay(0.4);
    });
    se.keyCode(36); // return
    // Find our message: the newest "You" group that wasn't there before.
    for (let i = 0; i < 24; i++) {
      delay(0.25);
      let groups = [];
      try { groups = messageGroups(); } catch (e) { continue; }
      for (let k = groups.length - 1; k >= 0; k--) {
        if (groups[k].sender === 'You' && !seen[groups[k].label]) {
          return { agent: name, sent: true, time: groups[k].time, marker: groups[k].label };
        }
      }
    }
    throw new Final(`Pressed Return, but the message didn't show up in the chat. Check ${APP} before sending it again.`);
  },

  choose({ agent, choice }) {
    const name = agent ? openAgent(agent) : currentAgent();
    const t = transcript();
    if (!t) throw new Error('No conversation is visible');
    const isChoice = el => attr(el, 'role') === 'AXButton' && label(el) && label(el) !== 'Dismiss question';
    const buttons = t.entireContents().filter(isChoice);
    if (!buttons.length) throw new Final('There is no open question with choices in this chat');
    const c = String(choice).trim();
    let btn = null;
    if (/^[A-Za-z]$/.test(c)) {
      // A letter picks by position among the options of the open question.
      const dismiss = find(t, el => attr(el, 'role') === 'AXButton' && label(el) === 'Dismiss question');
      const group = dismiss ? dismiss.attributes.byName('AXParent').value() : null;
      const pool = group ? group.entireContents().filter(isChoice) : buttons;
      btn = pool[c.toUpperCase().charCodeAt(0) - 65];
    } else {
      const lc = c.toLowerCase();
      btn = buttons.slice().reverse().find(b => label(b).toLowerCase().startsWith(lc))
        || buttons.slice().reverse().find(b => label(b).toLowerCase().includes(lc));
    }
    if (!btn) throw new Final(`No choice matching "${choice}". Options: ${buttons.map(b => label(b)).join(' / ')}`);
    // Replies will come after the newest message, which is the one asking the question.
    const groups = messageGroups();
    const marker = groups.length ? groups[groups.length - 1].label : null;
    const chose = label(btn);
    Application(APP).activate();
    committed = true;
    btn.actions.byName('AXPress').perform();
    delay(0.5);
    return { agent: name, chose, marker };
  },
};

function run(argv) {
  let args = {};
  try { args = argv[1] ? JSON.parse(argv[1]) : {}; } catch (e) {
    return JSON.stringify({ ok: false, error: 'Arguments must be JSON' });
  }
  if (args.appName) APP = args.appName;
  if (args.bundleId) BUNDLE_ID = args.bundleId;
  const fn = actions[argv[0]];
  if (!fn) return JSON.stringify({ ok: false, error: 'Unknown action ' + argv[0] });
  let err;
  // The accessibility tree can be missing (Chromium dropped it) or briefly empty while the
  // app re-renders, so lookups get a few tries.
  for (let i = 0; i < 5; i++) {
    try { return JSON.stringify({ ok: true, result: fn(args) }); }
    catch (e) {
      err = e;
      if (e instanceof Final || committed) break;
      if (i === 0) enableAccessibility();
      delay(1);
    }
  }
  return JSON.stringify({ ok: false, error: String((err && err.message) || err) });
}
