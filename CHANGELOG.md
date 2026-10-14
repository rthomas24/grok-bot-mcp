# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-13

### Added

- MCP server for the Grok Bot desktop app on macOS with four tools: `list_agents`, `read_messages`, `send_message` and `answer_choice`.
- Zero runtime dependencies: a built-in MCP stdio server with protocol version negotiation, cancellation and progress notifications.
- `grok-bot-mcp doctor` to check macOS, Node.js, the Grok Bot app and Accessibility/Automation access.
- Reply detection that follows the sent message, so it works while the app's transcript scrolls.
- Clipboard save and restore around each paste (all items and formats), with a transient marker for clipboard managers.
- Claude Code plugin and marketplace, and a `grok-bot` Agent Skill for Claude Code, Codex and other agents.

[1.0.0]: https://github.com/rthomas24/grok-bot-mcp/releases/tag/v1.0.0
