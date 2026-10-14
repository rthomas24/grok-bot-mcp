// Runs the JXA automation script (src/jxa/grok-bot.js) through osascript.
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./jxa/grok-bot.js', import.meta.url));
const OSASCRIPT = process.env.GROK_BOT_OSASCRIPT || 'osascript';

export const settings = {
  appName: process.env.GROK_BOT_APP_NAME || 'Grok Bot',
  bundleId: process.env.GROK_BOT_BUNDLE_ID || 'com.anysphere.sand',
};

function exec(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 120_000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || '').trim() || err.message));
      else resolve(stdout);
    });
  });
}

// Turn macOS permission errors into steps the user can follow.
export function explain(message) {
  const msg = String(message);
  if (/-1719|-25211|assistive access/i.test(msg)) {
    return 'macOS blocked Accessibility access. Open System Settings → Privacy & Security → Accessibility, '
      + 'turn on the app your AI agent runs in (Terminal, iTerm2, Cursor, VS Code, Claude, Codex…), '
      + `then restart that app. (${msg})`;
  }
  if (/-1743|not authorized to send apple events/i.test(msg)) {
    return 'macOS blocked Automation access. Open System Settings → Privacy & Security → Automation and '
      + `allow the app your AI agent runs in to control "System Events" and "${settings.appName}". (${msg})`;
  }
  return msg;
}

export async function grok(action, args = {}) {
  if (process.platform !== 'darwin' && !process.env.GROK_BOT_OSASCRIPT) {
    throw new Error('Grok Bot MCP runs on macOS only: it drives the Grok Bot app through the macOS Accessibility API.');
  }
  const payload = JSON.stringify({ ...args, appName: settings.appName, bundleId: settings.bundleId });
  let stdout;
  try {
    stdout = await exec(OSASCRIPT, ['-l', 'JavaScript', SCRIPT, action, payload]);
  } catch (err) {
    throw new Error(explain(err.message));
  }
  const line = stdout.trim().split('\n').pop() || '';
  let res;
  try {
    res = JSON.parse(line);
  } catch {
    throw new Error(`Unexpected output from osascript: ${line.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(explain(res.error));
  return res.result;
}

// Serialize all UI automation so two calls never fight over the window.
let queue = Promise.resolve();
export function serial(fn) {
  const p = queue.then(fn, fn);
  queue = p.catch(() => {});
  return p;
}
