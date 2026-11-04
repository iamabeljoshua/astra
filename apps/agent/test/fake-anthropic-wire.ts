import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface WireReply {
  status?: number;
  errorType?: string;
  text?: readonly string[];
  stopReason?: string;
  refusalCategory?: string;
  /** Keeps the stream open after its text, as a model still writing does. */
  staysOpen?: boolean;
}

export interface WireRequest {
  body: { messages: { role: string; content: unknown }[] };
  wasClosedEarly: boolean;
  textSent: string;
}

const USAGE = { input_tokens: 40, output_tokens: 0, cache_read_input_tokens: 2078, cache_creation_input_tokens: 30 };

function sendEvent(response: ServerResponse, type: string, data: object) {
  response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
}

function sendStream(response: ServerResponse, reply: WireReply, request: WireRequest) {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  sendEvent(response, 'message_start', { message: { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null, usage: USAGE } });
  sendEvent(response, 'content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
  for (const text of reply.text ?? []) {
    request.textSent += text;
    sendEvent(response, 'content_block_delta', { index: 0, delta: { type: 'text_delta', text } });
  }
  if (reply.staysOpen) return;
  sendEvent(response, 'content_block_stop', { index: 0 });
  const stopDetails = reply.refusalCategory ? { type: 'refusal', category: reply.refusalCategory, explanation: null } : null;
  sendEvent(response, 'message_delta', { delta: { stop_reason: reply.stopReason ?? 'end_turn', stop_sequence: null, stop_details: stopDetails }, usage: { output_tokens: 10 } });
  sendEvent(response, 'message_stop', {});
  response.end();
}

/** A local server that speaks Anthropic's streaming format, so a test runs the real SDK and sees what really goes over the wire. */
export async function startFakeAnthropic(getReply: (request: WireRequest, index: number) => WireReply) {
  const requests: WireRequest[] = [];
  const server: Server = createServer((incoming, response) => {
    let body = '';
    incoming.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    incoming.on('end', () => {
      const request: WireRequest = { body: JSON.parse(body) as WireRequest['body'], wasClosedEarly: false, textSent: '' };
      requests.push(request);
      const reply = getReply(request, requests.length);
      response.on('close', () => {
        request.wasClosedEarly = !response.writableFinished;
      });
      if (reply.status) {
        response.writeHead(reply.status, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ type: 'error', error: { type: reply.errorType ?? 'invalid_request_error', message: 'boom' } }));
        return;
      }
      sendStream(response, reply, request);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    close: () => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
