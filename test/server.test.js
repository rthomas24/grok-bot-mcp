// Protocol and tool tests. They run against a fake osascript, so they need neither macOS
// permissions nor the Grok Bot app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'src/index.js');
const fake = path.join(root, 'test/fixtures/fake-osascript.mjs');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

function startServer(env = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'grok-bot-mcp-'));
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, GROK_BOT_OSASCRIPT: fake, FAKE_GROK_STATE: path.join(dir, 'state.json'), GROK_BOT_POLL_MS: '100', ...env },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const waiting = new Map();
  const notifications = [];
  let buffer = '';
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const msg = JSON.parse(buffer.slice(0, i));
      buffer = buffer.slice(i + 1);
      if (msg.id !== undefined && waiting.has(msg.id)) {
        waiting.get(msg.id)(msg);
        waiting.delete(msg.id);
      } else {
        notifications.push(msg);
      }
    }
  });
  let nextId = 1;
  return {
    notifications,
    raw(line) {
      child.stdin.write(line + '\n');
    },
    request(method, params, extra = {}) {
      const id = nextId++;
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params, ...extra }) + '\n');
      return new Promise(resolve => waiting.set(id, resolve));
    },
    waitFor(id) {
      return new Promise(resolve => waiting.set(id, resolve));
    },
    async call(name, args, meta) {
      const res = await this.request('tools/call', { name, arguments: args, ...(meta && { _meta: meta }) });
      assert.ok(res.result, `expected a result, got ${JSON.stringify(res)}`);
      const text = res.result.content[0].text;
      return { isError: res.result.isError === true, text, data: res.result.isError ? null : JSON.parse(text) };
    },
    close() {
      child.stdin.end();
      child.kill();
    },
  };
}

test('initialize negotiates the protocol version and describes the server', async () => {
  const s = startServer();
  const known = await s.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert.equal(known.result.protocolVersion, '2025-06-18');
  assert.deepEqual(known.result.serverInfo, { name: 'grok-bot', title: 'Grok Bot', version });
  assert.deepEqual(known.result.capabilities, { tools: { listChanged: false } });
  assert.match(known.result.instructions, /list_agents/);
  const unknown = await s.request('initialize', { protocolVersion: '1999-01-01', capabilities: {} });
  assert.equal(unknown.result.protocolVersion, '2025-11-25');
  s.close();
});

test('tools/list returns the four tools with schemas and annotations', async () => {
  const s = startServer();
  const { result } = await s.request('tools/list', {});
  assert.deepEqual(result.tools.map(t => t.name), ['list_agents', 'read_messages', 'send_message', 'answer_choice']);
  for (const t of result.tools) {
    assert.equal(t.inputSchema.type, 'object');
    assert.equal(typeof t.description, 'string');
    assert.equal(typeof t.annotations.readOnlyHint, 'boolean');
    assert.equal(t.handler, undefined);
  }
  assert.deepEqual(result.tools.find(t => t.name === 'send_message').inputSchema.required, ['agent', 'message']);
  s.close();
});

test('ping, unknown methods, unknown tools and bad JSON follow JSON-RPC', async () => {
  const s = startServer();
  assert.deepEqual((await s.request('ping')).result, {});
  assert.equal((await s.request('resources/list', {})).error.code, -32601);
  assert.equal((await s.request('tools/call', { name: 'nope', arguments: {} })).error.code, -32602);
  const parseError = s.waitFor(null);
  s.raw('{not json');
  assert.equal((await parseError).error.code, -32700);
  s.close();
});

test('list_agents and read_messages return what the app shows', async () => {
  const s = startServer();
  const agents = await s.call('list_agents', {});
  assert.deepEqual(agents.data, { current: 'Researcher', agents: ['Grok Bot', 'Researcher', 'Coder'] });
  const read = await s.call('read_messages', { agent: 'res', count: 5 });
  assert.equal(read.data.agent, 'Researcher');
  assert.equal(read.data.messages[0].text, 'Ready when you are.');
  s.close();
});

test('send_message waits for the reply and reports progress', async () => {
  const s = startServer();
  const res = await s.call('send_message', { agent: 'Coder', message: 'Build it', quiet_seconds: 2 }, { progressToken: 'p1' });
  assert.equal(res.data.agent, 'Coder');
  assert.equal(res.data.timedOut, false);
  assert.deepEqual(res.data.replies.map(r => r.text), ['Echo: Build it']);
  assert.ok(s.notifications.some(n => n.method === 'notifications/progress' && n.params.progressToken === 'p1'));
  s.close();
});

test('send_message can skip waiting', async () => {
  const s = startServer();
  const res = await s.call('send_message', { agent: 'Coder', message: 'Fire and forget', wait_for_reply: false });
  assert.equal(res.data.agent, 'Coder');
  assert.equal(res.data.sent, true);
  assert.match(res.data.time, /AM$/);
  assert.equal(res.data.marker, undefined);
  s.close();
});

test('replies are found even when older messages scroll out of the rendered window', async () => {
  // The app only renders recent messages, so the message count can stay flat as replies arrive.
  const s = startServer({ FAKE_GROK_WINDOW: '2' });
  await s.call('send_message', { agent: 'Researcher', message: 'one', quiet_seconds: 2 });
  const res = await s.call('send_message', { agent: 'Researcher', message: 'two', quiet_seconds: 2 });
  assert.equal(res.data.timedOut, false);
  assert.deepEqual(res.data.replies.map(r => r.text), ['Echo: two']);
  s.close();
});

test('a multiple-choice question ends the wait, and answer_choice picks by letter', async () => {
  const s = startServer();
  const asked = await s.call('send_message', { agent: 'Coder', message: 'please choose' });
  assert.deepEqual(asked.data.replies.at(-1).choices, ['Option one', 'Option two']);
  const answered = await s.call('answer_choice', { agent: 'Coder', choice: 'B', quiet_seconds: 2 });
  assert.equal(answered.data.chose, 'Option two');
  assert.deepEqual(answered.data.replies.map(r => r.text), ['You picked Option two']);
  s.close();
});

test('bad arguments come back as tool errors the model can fix', async () => {
  const s = startServer();
  const missing = await s.call('send_message', { agent: 'Coder' });
  assert.ok(missing.isError);
  assert.match(missing.text, /"message" is required/);
  const range = await s.call('read_messages', { count: 500 });
  assert.ok(range.isError);
  assert.match(range.text, /between 1 and 50/);
  const unknownAgent = await s.call('read_messages', { agent: 'Nobody' });
  assert.ok(unknownAgent.isError);
  assert.match(unknownAgent.text, /Available: Grok Bot, Researcher, Coder/);
  s.close();
});

test('macOS permission errors explain how to fix them', async () => {
  const s = startServer({ FAKE_GROK_ERROR: 'System Events got an error: osascript is not allowed assistive access. (-1719)' });
  const res = await s.call('list_agents', {});
  assert.ok(res.isError);
  assert.match(res.text, /Privacy & Security → Accessibility/);
  s.close();
  const s2 = startServer({ FAKE_GROK_STDERR: 'execution error: Not authorized to send Apple events to System Events. (-1743)' });
  const res2 = await s2.call('list_agents', {});
  assert.match(res2.text, /Privacy & Security → Automation/);
  s2.close();
});

test('cancelling a call stops the wait without a response', async () => {
  const s = startServer();
  const id = 99;
  let answered = false;
  s.waitFor(id).then(() => { answered = true; });
  s.raw(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'send_message', arguments: { agent: 'Coder', message: 'slow', quiet_seconds: 60 } } }));
  await new Promise(r => setTimeout(r, 600));
  s.raw(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id, reason: 'test' } }));
  await new Promise(r => setTimeout(r, 800));
  assert.equal(answered, false);
  assert.deepEqual((await s.request('ping')).result, {}); // still serving
  s.close();
});

test('the CLI prints its version and help', () => {
  assert.equal(execFileSync(process.execPath, [entry, '--version'], { encoding: 'utf8' }).trim(), version);
  assert.match(execFileSync(process.execPath, [entry, '--help'], { encoding: 'utf8' }), /grok-bot-mcp doctor/);
});
