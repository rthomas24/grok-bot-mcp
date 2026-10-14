// A small, dependency-free MCP server over stdio: newline-delimited JSON-RPC 2.0.
// Implements initialize, ping, tools/list and tools/call, with cancellation and progress.
// https://modelcontextprotocol.io/specification
import readline from 'node:readline';

// Newest first. If a client asks for a version we don't know, we offer the newest one.
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export function startServer({ info, instructions, tools, input = process.stdin, output = process.stdout }) {
  const inflight = new Map(); // request id -> AbortController

  function send(message) {
    output.write(JSON.stringify(message) + '\n');
  }

  function respond(id, result) {
    send({ jsonrpc: '2.0', id, result });
  }

  function error(id, code, message) {
    send({ jsonrpc: '2.0', id, error: { code, message } });
  }

  async function callTool(id, params) {
    const tool = tools.find(t => t.name === params.name);
    if (!tool) return error(id, -32602, `Unknown tool: ${params.name}`);
    const controller = new AbortController();
    inflight.set(id, controller);
    const token = params._meta?.progressToken;
    const progress = token === undefined ? undefined : (value, message) => {
      if (!controller.signal.aborted) {
        send({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: value, message } });
      }
    };
    try {
      const result = await tool.handler(params.arguments ?? {}, { signal: controller.signal, progress });
      if (controller.signal.aborted) return; // the client cancelled: it expects no response
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      respond(id, { content: [{ type: 'text', text }] });
    } catch (err) {
      if (controller.signal.aborted) return;
      respond(id, { isError: true, content: [{ type: 'text', text: String(err?.message ?? err) }] });
    } finally {
      inflight.delete(id);
    }
  }

  function handle(msg) {
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      // Responses to us (we never send requests) and junk without an id are ignored.
      if (msg && typeof msg === 'object' && msg.id !== undefined && msg.method !== undefined) {
        error(msg.id, -32600, 'Invalid request');
      }
      return;
    }
    const { id, method } = msg;
    const params = msg.params ?? {};

    if (id === undefined || id === null) {
      // Notifications get no response.
      if (method === 'notifications/cancelled') inflight.get(params.requestId)?.abort();
      return;
    }

    switch (method) {
      case 'initialize':
        return respond(id, {
          protocolVersion: PROTOCOL_VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: info,
          instructions,
        });
      case 'ping':
        return respond(id, {});
      case 'tools/list':
        return respond(id, { tools: tools.map(({ handler, ...definition }) => definition) });
      case 'tools/call':
        return callTool(id, params);
      default:
        return error(id, -32601, `Method not found: ${method}`);
    }
  }

  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  rl.on('line', line => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return error(null, -32700, 'Parse error');
    }
    for (const m of Array.isArray(msg) ? msg : [msg]) handle(m);
  });
  rl.on('close', () => process.exit(0));
  output.on('error', () => process.exit(0)); // the client went away
}
