# Contributing to Grok Bot MCP

Thanks for helping! Bug reports, fixes for new Grok Bot versions and support for more platforms are all welcome.

## Set up

You need macOS, Node.js 18+ and, for live testing, the Grok Bot desktop app.

```bash
git clone https://github.com/rthomas24/grok-bot-mcp && cd grok-bot-mcp
npm test                  # no install step: the project has no dependencies
node src/index.js doctor  # check your setup against the real app
```

To try your changes in Claude Code, point it at your checkout:

```bash
claude mcp add grok-bot-dev -- node "$PWD/src/index.js"
```

## How the code is organized

| File | Responsibility |
| --- | --- |
| `src/server.js` | MCP over stdio (newline-delimited JSON-RPC 2.0). No SDK. |
| `src/tools.js` | Tool schemas, argument checks, waiting for replies. |
| `src/grok.js` | Runs the JXA script through `osascript`, explains macOS permission errors. |
| `src/jxa/grok-bot.js` | Reads and drives the Grok Bot window through the Accessibility API. |
| `skills/grok-bot/SKILL.md` | The Agent Skill. Keep it in sync with the tools. |

## Ground rules

- **No runtime dependencies.** One-line `npx` installs stay fast and the supply chain stays small. Dev-only tooling is fine if it's worth it.
- **Never write to stdout** except MCP messages from `src/server.js`. Log to stderr.
- **Never retry an action after it has clicked or typed.** `committed` in the JXA script guards this, so a flaky read can't send a message twice.
- **Test without the app.** `test/fixtures/fake-osascript.mjs` stands in for the real app; extend it when you add behavior.
- **When Grok Bot changes its UI**, update the labels in `src/jxa/grok-bot.js` and mention the Grok Bot version in your PR.
- **Don't send real messages to other people's Bots** when testing; use your own.

## Pull requests

1. Fork and branch from `main`.
2. Make your change, then add or update tests.
3. Run `npm test` and `npm run check:jxa`.
4. Update `README.md`, `skills/grok-bot/SKILL.md` and `CHANGELOG.md` if behavior changed.
5. Open a PR describing what changed and how you tested it, including your macOS and Grok Bot versions.

## Releasing

1. Bump the version in `package.json`, `server.json` (both fields) and `.claude-plugin/plugin.json`, and add a `CHANGELOG.md` entry.
2. Tag the release: `git tag v1.2.3 && git push --tags`, then create a GitHub release from the tag.
3. Optional: `npm publish`, then `mcp-publisher publish` to update the [MCP Registry](https://registry.modelcontextprotocol.io) listing.

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE) and that you'll follow the [Code of Conduct](CODE_OF_CONDUCT.md).
