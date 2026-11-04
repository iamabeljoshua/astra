import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';

export interface FakeMuseWire {
  makeSocket(_url: string, options: object): WebSocket;
  getHandshakes(): Record<string, unknown>[];
  getConnectionCount(): number;
  getBytesHeard(): number;
  /** Closes every socket as Muse does when frames stop, 1008. */
  closeAll(code: number): void;
  close(): Promise<void>;
}

const BYTES_PER_INTERIM = 4800;

// Speaks what the plugin expects of Muse's socket: a handshake answered with a session id, interim text as audio arrives, then a final.
export async function startFakeMuseWire({ words = ['one', 'two', 'three'], handshakeMs = 0 }: { words?: string[]; handshakeMs?: number } = {}): Promise<FakeMuseWire> {
  const server = createServer();
  const sockets = new WebSocketServer({ server });
  const handshakes: Record<string, unknown>[] = [];
  let connections = 0;
  let bytesHeard = 0;
  sockets.on('connection', (socket) => {
    connections += 1;
    let hasHandshake = false;
    let bytes = 0;
    let said = 0;
    let turn = 0;
    const send = (message: object) => socket.send(JSON.stringify(message));
    const finishTurn = () => {
      send({ type: 'speechEnd', turnId: `turn-${turn}` });
      send({ type: 'speechComplete', turnId: `turn-${turn}`, transcript: `${words.join(' ')}.` });
      turn += 1;
      said = 0;
    };
    socket.on('message', (raw, isBinary) => {
      if (!isBinary) {
        const message = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (!hasHandshake) {
          hasHandshake = true;
          handshakes.push(message);
          setTimeout(() => send({ sessionId: `session-${connections}` }), handshakeMs);
        } else if (message.type === 'endStream') {
          if (said > 0) finishTurn();
          socket.close(1000);
        }
        return;
      }
      bytes += (raw as Buffer).length;
      bytesHeard += (raw as Buffer).length;
      const isSilence = (raw as Buffer).every((byte) => byte === 0);
      if (isSilence) {
        if (said > 0) finishTurn();
        return;
      }
      if (bytes < BYTES_PER_INTERIM) return;
      bytes = 0;
      if (said === 0) send({ type: 'speechStart', turnId: `turn-${turn}` });
      said = Math.min(said + 1, words.length);
      send({ type: 'transcript', turnId: `turn-${turn}`, transcript: words.slice(0, said).join(' ') });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    makeSocket: (_url, options) => new WebSocket(`ws://127.0.0.1:${port}`, options),
    getHandshakes: () => handshakes,
    getConnectionCount: () => connections,
    getBytesHeard: () => bytesHeard,
    closeAll(code) {
      sockets.clients.forEach((socket) => socket.close(code));
    },
    async close() {
      sockets.clients.forEach((socket) => socket.terminate());
      await new Promise((resolve) => sockets.close(resolve));
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
