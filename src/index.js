#!/usr/bin/env node
// Grok Bot MCP: let Claude Code, Codex, Cursor or any MCP client drive the Grok Bot desktop app on macOS.
import { readFileSync } from 'node:fs';
import { startServer } from './server.js';
import { tools } from './tools.js';
import { doctor } from './doctor.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const instructions = `Controls the Grok Bot desktop app on the user's Mac; the user watches it happen on screen.
- Call list_agents first to check that the app is reachable.
- Before messaging an agent, read its recent messages so you know where the conversation stands.
- Call these tools one at a time, never in parallel: they all share one app window.
- After a reply, summarize it for the user. If the agent asked a multiple-choice question, show the options and recommend one or ask the user which to pick.
- Ask the user before sending anything (or picking a choice) that commits them to something: emails, applications, payments, account changes, or anything the agent would do outside the app.`;

const HELP = `grok-bot-mcp ${version}
MCP server that lets AI agents drive the Grok Bot desktop app on macOS.

Usage:
  grok-bot-mcp            Start the MCP server on stdio (your MCP client runs this)
  grok-bot-mcp doctor     Check macOS permissions and that Grok Bot is reachable
  grok-bot-mcp --version  Print the version
  grok-bot-mcp --help     Show this help

Add it to Claude Code:
  claude mcp add grok-bot --scope user -- npx -y github:rthomas24/grok-bot-mcp

Docs: https://github.com/rthomas24/grok-bot-mcp`;

const cmd = process.argv[2];

if (!cmd) {
  if (process.stdin.isTTY) {
    console.error(`Grok Bot MCP ${version} is running on stdio and waiting for an MCP client.\nRun "grok-bot-mcp doctor" to check your setup, or press Ctrl+C to quit.`);
  }
  startServer({
    info: { name: 'grok-bot', title: 'Grok Bot', version },
    instructions,
    tools,
  });
} else if (cmd === 'doctor') {
  process.exitCode = await doctor(version);
} else if (cmd === '--version' || cmd === '-v') {
  console.log(version);
} else if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
  console.log(HELP);
} else {
  console.error(`Unknown command: ${cmd}\n\n${HELP}`);
  process.exitCode = 1;
}
