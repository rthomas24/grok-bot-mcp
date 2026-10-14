# Security policy

## Reporting a vulnerability

Please **don't** open a public issue. Report it privately through [GitHub's private vulnerability reporting](https://github.com/rthomas24/grok-bot-mcp/security/advisories/new) and include steps to reproduce. You'll get a reply within a few days, and a fix or mitigation as soon as possible after that.

## Supported versions

Security fixes go into the latest release.

## How Grok Bot MCP touches your Mac

These are useful context for a report:

- It runs locally as a child process of your MCP client and communicates only over stdio. It makes **no network requests** and has **no runtime dependencies**.
- It uses `osascript` (JavaScript for Automation) and the macOS Accessibility API to read the Grok Bot window, click it and type into it. This needs the Accessibility and Automation permissions that you grant to the app your agent runs in.
- To type a message it briefly replaces the clipboard, then restores every item and format that was there.
- It acts only on the Grok Bot app (`GROK_BOT_APP_NAME`, default "Grok Bot") and on System Events.

Anything that makes it act on another app, send a message the user didn't ask for, lose clipboard data or leak data off the machine is in scope.
