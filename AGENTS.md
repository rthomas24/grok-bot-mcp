# AGENTS.md

Guidance for AI coding agents working **on this repository**. To install Grok Bot MCP for a user, follow [llms-install.md](llms-install.md) instead.

## What this is

An MCP server (Node.js, ESM, zero runtime dependencies) that drives the Grok Bot desktop app on macOS through JXA and the Accessibility API. It ships as an npm-style package (`src/index.js` is the bin), a Claude Code plugin (`.claude-plugin/`) and an Agent Skill (`skills/grok-bot/`).

## Commands

- `npm test`: protocol and tool tests against `test/fixtures/fake-osascript.mjs`. No app or permissions needed.
- `npm run check:jxa`: syntax-check the JXA script with `osacompile`.
- `node src/index.js doctor`: check the real app (macOS, needs Accessibility access).
- `claude plugin validate .`: validate the plugin and marketplace manifests.

## Rules

- Don't add runtime dependencies.
- Only `src/server.js` writes to stdout, and only MCP messages. Log to stderr.
- In `src/jxa/grok-bot.js`, set `committed = true` before the first click or keystroke of any action, and never retry after that.
- Keep tool names, parameters and defaults in sync across `src/tools.js`, `README.md` and `skills/grok-bot/SKILL.md`.
- Keep versions in sync across `package.json`, `server.json` and `.claude-plugin/plugin.json`.
- Don't send messages to a user's Bots while testing unless they asked you to. Use `list_agents` and `read_messages` to verify things live.
