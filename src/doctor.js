// `grok-bot-mcp doctor`: checks everything the server needs and says how to fix what's missing.
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { grok, settings } from './grok.js';

const tty = process.stdout.isTTY;
const paint = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const ok = s => console.log(`${paint(32, '✓')} ${s}`);
const bad = (s, fix) => console.log(`${paint(31, '✗')} ${s}${fix ? `\n  ${paint(2, '→ ' + fix)}` : ''}`);

export async function doctor(version) {
  console.log(paint(1, `Grok Bot MCP ${version} doctor\n`));

  if (process.platform !== 'darwin') {
    bad(`This is ${os.type()}. Grok Bot MCP runs on macOS only.`);
    return 1;
  }
  let macos = '';
  try { macos = execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim(); } catch {}
  ok(`macOS ${macos || `(Darwin ${os.release()})`}`);

  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) {
    bad(`Node.js ${process.version}`, 'Install Node.js 18 or newer from https://nodejs.org');
    return 1;
  }
  ok(`Node.js ${process.version}`);

  let status;
  try {
    status = await grok('status');
  } catch (err) {
    bad('Could not run osascript', err.message);
    return 1;
  }

  if (!status.installed) {
    bad(`${settings.appName} app not found`, 'Install Grok Bot from https://docs.x.ai/grok-bot/get-started');
    return 1;
  }
  ok(`${settings.appName} ${status.version ?? ''} installed at ${status.path}`);

  if (!status.running) {
    bad(`${settings.appName} is not running`, `Open ${settings.appName}, sign in, then run this again.`);
    return 1;
  }
  ok(`${settings.appName} is running (pid ${status.pid})`);

  try {
    const { agents, current } = await grok('list_agents');
    ok(`Accessibility and Automation access work. Found ${agents.length} agent${agents.length === 1 ? '' : 's'}: ${agents.join(', ')}${current ? ` (open: ${current})` : ''}`);
  } catch (err) {
    bad('Could not read the Grok Bot window', err.message);
    if (!status.accessibilityTrusted) {
      console.log(`  ${paint(2, '→ Tip: run this in the same app your AI agent runs in, so macOS asks that app for access.')}`);
    }
    return 1;
  }

  console.log(`\n${paint(32, 'All good!')} Ask your agent: "List my Grok Bot agents".`);
  return 0;
}
