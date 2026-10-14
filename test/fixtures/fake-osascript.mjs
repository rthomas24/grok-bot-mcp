#!/usr/bin/env node
// Stands in for `osascript -l JavaScript grok-bot.js <action> <json>` in tests.
// Keeps a pretend Grok Bot window in the JSON file named by FAKE_GROK_STATE. Like the real
// app, a chat only renders its last few messages (FAKE_GROK_WINDOW, default 3).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const [, , , , , action, json] = process.argv;
const args = json ? JSON.parse(json) : {};
const file = process.env.FAKE_GROK_STATE;
const WINDOW = Number(process.env.FAKE_GROK_WINDOW) || 3;

if (process.env.FAKE_GROK_STDERR) {
  process.stderr.write(process.env.FAKE_GROK_STDERR);
  process.exit(1);
}

const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {
  clock: 0,
  current: 'Researcher',
  agents: ['Grok Bot', 'Researcher', 'Coder'],
  chats: { Researcher: [{ sender: 'Researcher', time: '9:00:00 AM', text: 'Ready when you are.' }] },
  pending: null,
};

const label = m => `${m.sender} ${m.time}`;
const tick = () => `9:${String(Math.floor(++state.clock / 60) + 1).padStart(2, '0')}:${String(state.clock % 60).padStart(2, '0')} AM`;

function deliver() {
  if (state.pending && Date.now() >= state.pending.at) {
    const { agent, message } = state.pending;
    (state.chats[agent] ||= []).push({ ...message, time: tick() });
    state.pending = null;
  }
}

function open(agent) {
  if (!agent) return state.current;
  const hit = state.agents.find(a => a.toLowerCase().startsWith(agent.toLowerCase()));
  if (!hit) throw new Error(`No agent named "${agent}". Available: ${state.agents.join(', ')}`);
  state.current = hit;
  return hit;
}

const chat = () => (state.chats[state.current] ||= []);
const rendered = () => chat().slice(-WINDOW);

function reply(agent, message, delayMs = 150) {
  state.pending = { agent, at: Date.now() + delayMs, message };
}

const actions = {
  status: () => ({ installed: true, path: '/Applications/Grok Bot.app', version: '0.0.0', running: true, pid: 1, accessibilityTrusted: true }),
  list_agents: () => ({ current: state.current, agents: state.agents }),
  read: ({ agent, count }) => {
    const name = open(agent);
    deliver();
    return { agent: name, messages: rendered().slice(-(count || 10)) };
  },
  after: ({ agent, marker }) => {
    if (agent) open(agent);
    deliver();
    const msgs = rendered();
    const i = msgs.map(label).lastIndexOf(marker);
    return { found: i >= 0, messages: i >= 0 ? msgs.slice(i + 1) : [] };
  },
  send: ({ agent, message }) => {
    const name = open(agent);
    const mine = { sender: 'You', time: tick(), text: message };
    chat().push(mine);
    reply(name, message.includes('choose')
      ? { sender: name, text: 'Which one?', question: 'Which one?', choices: ['Option one', 'Option two'] }
      : { sender: name, text: `Echo: ${message}` });
    return { agent: name, sent: true, time: mine.time, marker: label(mine) };
  },
  choose: ({ agent, choice }) => {
    const name = open(agent);
    const last = chat().at(-1);
    if (!last?.choices) throw new Error('There is no open question with choices in this chat');
    const picked = /^[A-Z]$/i.test(choice) ? last.choices[choice.toUpperCase().charCodeAt(0) - 65] : last.choices.find(c => c.toLowerCase().startsWith(choice.toLowerCase()));
    chat().push({ sender: 'You', time: tick(), text: picked });
    reply(name, { sender: name, text: `You picked ${picked}` });
    return { agent: name, chose: picked, marker: label(last) };
  },
};

let out;
try {
  out = { ok: true, result: actions[action](args) };
} catch (err) {
  out = { ok: false, error: err.message };
}
if (process.env.FAKE_GROK_ERROR) out = { ok: false, error: process.env.FAKE_GROK_ERROR };
writeFileSync(file, JSON.stringify(state));
console.log(JSON.stringify(out));
