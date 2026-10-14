---
name: grok-bot
description: Drive the Grok Bot desktop app on the user's Mac through the grok-bot MCP server. List the user's Bots (agents), read their chats, send them messages and answer their multiple-choice questions while the user watches. Use when the user mentions Grok Bot or one of their Bots ("ask my Researcher bot…", "what did the Coder bot say?", "check on my bots"), or wants to delegate work to, follow up with, or reply to a Grok Bot agent.
license: MIT
compatibility: macOS with the Grok Bot desktop app running and the grok-bot MCP server installed (https://github.com/rthomas24/grok-bot-mcp).
metadata:
  author: rthomas24
  version: "1.0.0"
---

# Grok Bot

You can operate the user's Grok Bot desktop app live through the `grok-bot` MCP server. Each Bot is an AI agent with its own chat, running on its own cloud computer. The user sees every click on their screen.

## Tools

| Tool | Use it to |
| --- | --- |
| `list_agents` | See the Bots in the sidebar and which chat is open. Call it first. |
| `read_messages(agent?, count?)` | Read a chat's recent messages, including a multiple-choice question the Bot is waiting on. |
| `send_message(agent, message, wait_for_reply?, timeout_seconds?, quiet_seconds?)` | Type a message into a Bot's chat, press Enter and (by default) return its reply. |
| `answer_choice(choice, agent?)` | Click an option on the Bot's multiple-choice question: a letter ("A") or the start of the option text. |

Depending on the client, the tools may be prefixed, for example `mcp__grok-bot__send_message`.

## Workflow

1. **Check the connection.** Call `list_agents` first. If it fails, see [Troubleshooting](#troubleshooting).
2. **Catch up before you speak.** Before messaging a Bot, call `read_messages` for that agent (count 5–10) so you know where the conversation stands. Don't re-ask what the Bot already answered.
3. **One tool at a time.** Every tool drives the same window. Never call two grok-bot tools in parallel.
4. **Summarize replies.** After a reply comes back, give the user a short summary, not the whole transcript (unless they ask for it).
5. **Handle multiple-choice questions.** When a message has `question` and `choices`, show the options as A, B, C… Recommend one with a one-line reason, or ask the user which to pick. Call `answer_choice` only after the user picks, or when the answer clearly follows from what they already asked for.
6. **Ask before committing the user to anything.** Get an explicit yes before sending a message, or picking a choice, that makes a Bot act outside the app: emailing or messaging people, submitting applications or forms, purchases or payments, bookings, account or settings changes, public posts. Show the exact text you plan to send.

## Waiting for replies

- `send_message` waits up to `timeout_seconds` (default 180). It treats the reply as finished after `quiet_seconds` (default 12) with no new messages, or as soon as the Bot asks a multiple-choice question.
- `timedOut: true` means the Bot is still working. Tell the user, then check later with `read_messages` instead of sending the message again.
- Bots that research often post a "working on it" message first. If the reply is a status update, wait and read again; don't nudge.
- For a fire-and-forget message, pass `wait_for_reply: false`. For long jobs, pass a larger `timeout_seconds` (max 900).

## Writing good messages to a Bot

- Bots keep context per chat. Refer to earlier messages instead of restating everything.
- Be specific about the deliverable and its format, e.g. "Reply with 5 bullets and a link for each."
- Use the agent name exactly as `list_agents` shows it.

## Troubleshooting

| The error mentions | Tell the user |
| --- | --- |
| Grok Bot is not running | Open the Grok Bot app (and sign in), then try again. |
| Accessibility | System Settings → Privacy & Security → Accessibility: turn on the app this agent runs in (Terminal, iTerm2, Cursor, VS Code, Claude, Codex…), then restart that app. |
| Automation / Apple events | System Settings → Privacy & Security → Automation: allow that app to control "System Events" and "Grok Bot". |
| No agent named "X" | Pick one of the names listed in the error. |
| The tools don't exist | Install the MCP server: `claude mcp add grok-bot --scope user -- npx -y github:rthomas24/grok-bot-mcp` (other clients: see the README), then restart the agent. |

The user can check every requirement at once by running `npx -y github:rthomas24/grok-bot-mcp doctor` in a terminal.
