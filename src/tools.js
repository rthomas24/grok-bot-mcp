// The MCP tools: definitions (JSON Schema) and handlers.
import { grok, serial } from './grok.js';

const POLL_MS = Number(process.env.GROK_BOT_POLL_MS) || 2000;

function sleep(ms, signal) {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

// Argument checks. A bad argument comes back to the model as a tool error it can fix.
function string(args, key, required) {
  const v = args[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw new Error(`"${key}" is required`);
    return undefined;
  }
  if (typeof v !== 'string') throw new Error(`"${key}" must be a string`);
  return v;
}

function number(args, key, { min, max, fallback, integer = false }) {
  const v = args[key];
  if (v === undefined || v === null) return fallback;
  if (typeof v !== 'number' || Number.isNaN(v) || (integer && !Number.isInteger(v))) {
    throw new Error(`"${key}" must be ${integer ? 'an integer' : 'a number'}`);
  }
  if (v < min || v > max) throw new Error(`"${key}" must be between ${min} and ${max}`);
  return v;
}

function boolean(args, key, fallback) {
  const v = args[key];
  if (v === undefined || v === null) return fallback;
  if (typeof v !== 'boolean') throw new Error(`"${key}" must be true or false`);
  return v;
}

const agentReplies = messages => messages.filter(m => m.sender !== 'You');

// Wait for the agent's replies after the message labelled `marker` ("<sender> <time>"), until
// the chat goes quiet or the agent asks a multiple-choice question.
async function waitForReply({ agent, marker, timeoutS, quietS, signal, progress }) {
  const started = Date.now();
  const deadline = started + timeoutS * 1000;
  let lastSeen = '';
  let stableSince = Date.now();
  while (Date.now() < deadline && !signal?.aborted) {
    await sleep(POLL_MS, signal);
    if (signal?.aborted) break;
    const replies = agentReplies((await grok('after', { marker })).messages);
    const last = replies[replies.length - 1];
    const seen = `${replies.length}\n${last ? last.text : ''}`;
    if (seen !== lastSeen) {
      lastSeen = seen;
      stableSince = Date.now();
    }
    progress?.(Math.round((Date.now() - started) / 1000), last ? `${agent} is replying…` : `Waiting for ${agent} to reply…`);
    if (last?.choices) break; // the agent is waiting on a choice
    if (last && Date.now() - stableSince >= quietS * 1000) break;
  }
  if (signal?.aborted) return { cancelled: true };
  // Read once more with the agent named, which reopens its chat if the user switched away.
  const { found, messages } = await grok('after', { agent, marker });
  if (!found) {
    const recent = await grok('read', { agent, count: 5 });
    return { timedOut: false, replies: [], recent: recent.messages, note: `Couldn't find the message in ${agent}'s chat any more. These are its latest messages.` };
  }
  const replies = agentReplies(messages);
  const timedOut = Date.now() >= deadline;
  const result = { timedOut, replies };
  if (timedOut) {
    result.note = replies.length
      ? `${agent} was still writing when the wait ended. Call read_messages later to see the rest.`
      : `${agent} hasn't replied yet. It may still be working: call read_messages later to check.`;
  }
  return result;
}

const agentParam = {
  type: 'string',
  description: 'Agent name as shown by list_agents, e.g. "Researcher". Case-insensitive; a unique prefix works too.',
};

const waitParams = {
  wait_for_reply: {
    type: 'boolean',
    default: true,
    description: 'Wait for the agent to reply and return the reply (default true).',
  },
  timeout_seconds: {
    type: 'number',
    minimum: 5,
    maximum: 900,
    default: 180,
    description: 'Longest time to wait for a reply, in seconds (default 180).',
  },
  quiet_seconds: {
    type: 'number',
    minimum: 2,
    maximum: 120,
    default: 12,
    description: 'Treat the reply as finished after this many seconds with no new messages (default 12).',
  },
};

function waitArgs(args) {
  return {
    wait: boolean(args, 'wait_for_reply', true),
    timeoutS: number(args, 'timeout_seconds', { min: 5, max: 900, fallback: 180 }),
    quietS: number(args, 'quiet_seconds', { min: 2, max: 120, fallback: 12 }),
  };
}

export const tools = [
  {
    name: 'list_agents',
    title: 'List Grok Bot agents',
    description: 'List the agents (Bots) in the Grok Bot desktop app sidebar, and which chat is open. Call this first to check that the app is reachable.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: 'List Grok Bot agents', readOnlyHint: true, openWorldHint: false },
    handler: () => serial(() => grok('list_agents')),
  },
  {
    name: 'read_messages',
    title: 'Read Grok Bot messages',
    description: 'Read recent messages from an agent chat in Grok Bot, including any multiple-choice question the agent is waiting on. Opens that chat in the app if an agent is given.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { ...agentParam, description: `${agentParam.description} Defaults to the open chat.` },
        count: { type: 'integer', minimum: 1, maximum: 50, default: 10, description: 'How many recent messages to return (default 10).' },
      },
      additionalProperties: false,
    },
    annotations: { title: 'Read Grok Bot messages', readOnlyHint: true, openWorldHint: false },
    handler: args => {
      const agent = string(args, 'agent');
      const count = number(args, 'count', { min: 1, max: 50, fallback: 10, integer: true });
      return serial(() => grok('read', { agent, count }));
    },
  },
  {
    name: 'send_message',
    title: 'Send a message to a Grok Bot agent',
    description: 'Send a message to an agent in the Grok Bot desktop app. Visibly switches to that chat, types the message and presses Enter. By default waits for the agent to finish replying and returns its reply messages (including any multiple-choice question). Ask the user first if the message would make the agent act outside the app (email, purchases, applications, account changes).',
    inputSchema: {
      type: 'object',
      properties: {
        agent: agentParam,
        message: { type: 'string', minLength: 1, description: 'The message to send.' },
        ...waitParams,
      },
      required: ['agent', 'message'],
      additionalProperties: false,
    },
    annotations: { title: 'Send a message to a Grok Bot agent', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: (args, ctx) => {
      const agent = string(args, 'agent', true);
      const message = string(args, 'message', true);
      const { wait, timeoutS, quietS } = waitArgs(args);
      return serial(async () => {
        const { marker, ...sent } = await grok('send', { agent, message });
        if (!wait) return sent;
        return { agent: sent.agent, ...(await waitForReply({ agent: sent.agent, marker, timeoutS, quietS, ...ctx })) };
      });
    },
  },
  {
    name: 'answer_choice',
    title: 'Answer a Grok Bot question',
    description: 'Click an option on a multiple-choice question an agent asked in Grok Bot (e.g. "What should we tackle next?"). Pass a letter ("A", "B"…) or the start of the option text. Waits for the reply by default.',
    inputSchema: {
      type: 'object',
      properties: {
        choice: { type: 'string', minLength: 1, description: 'Letter ("A", "B"…) or the start of the option text.' },
        agent: { ...agentParam, description: `${agentParam.description} Defaults to the open chat.` },
        ...waitParams,
      },
      required: ['choice'],
      additionalProperties: false,
    },
    annotations: { title: 'Answer a Grok Bot question', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: (args, ctx) => {
      const choice = string(args, 'choice', true);
      const agent = string(args, 'agent');
      const { wait, timeoutS, quietS } = waitArgs(args);
      return serial(async () => {
        const { marker, ...res } = await grok('choose', { agent, choice });
        if (!wait || !marker) return res;
        return { ...res, ...(await waitForReply({ agent: res.agent, marker, timeoutS, quietS, ...ctx })) };
      });
    },
  },
];
