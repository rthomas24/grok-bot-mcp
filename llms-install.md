# Installing Grok Bot MCP (for AI agents)

You're helping a user install Grok Bot MCP, which lets their AI agent drive the Grok Bot desktop app on macOS. Follow these steps in order and tell the user what you're doing.

## 1. Check the requirements

- `uname -s` prints `Darwin` (macOS only).
- `node -v` prints v18 or newer. If not, ask the user to install Node.js from https://nodejs.org.
- The Grok Bot app is installed (usually `/Applications/Grok Bot.app`) and open. If not, point the user to https://docs.x.ai/grok-bot/get-started.

## 2. Register the MCP server with the client you're running in

- **Claude Code**, plugin with server and skill (preferred):
  `claude plugin marketplace add rthomas24/grok-bot-mcp && claude plugin install grok-bot@grok-bot-mcp`
- **Claude Code**, server only:
  `claude mcp add grok-bot --scope user -- npx -y github:rthomas24/grok-bot-mcp`
- **Codex**: `codex mcp add grok-bot -- npx -y github:rthomas24/grok-bot-mcp`, then in `~/.codex/config.toml` add `startup_timeout_sec = 60` and `tool_timeout_sec = 900` under `[mcp_servers.grok-bot]`.
- **Cursor**: add this to `~/.cursor/mcp.json`. **VS Code**: add it to the user `mcp.json`, under `"servers"` instead of `"mcpServers"`. **Other clients**: add it to their MCP config:
  ```json
  { "mcpServers": { "grok-bot": { "command": "npx", "args": ["-y", "github:rthomas24/grok-bot-mcp"] } } }
  ```

Before editing a config file, read it and merge the entry; don't overwrite other servers.

## 3. Optional: install the skill

If you're not using the Claude Code plugin, `npx skills add rthomas24/grok-bot-mcp` installs the `grok-bot` skill for Codex, Cursor and other agents.

## 4. Check macOS permissions

Run `npx -y github:rthomas24/grok-bot-mcp doctor`. If it reports a missing permission, you can't grant it yourself. Tell the user:

- **Accessibility:** System Settings → Privacy & Security → Accessibility → turn on the app the agent runs in (Terminal, iTerm2, Cursor, VS Code, Claude, Codex…), then restart that app.
- **Automation:** allow that app to control "System Events" and "Grok Bot" when macOS asks, or under System Settings → Privacy & Security → Automation.

## 5. Finish

Tell the user to restart their agent so it loads the server, then to try: "List my Grok Bot agents". Verify with `list_agents` only. Don't send messages to the user's Bots as a test unless they ask.
