import { createServer, type Socket } from 'node:net';
import { connect } from 'node:net';

export interface CutProxy {
  port: number;
  cut(): void;
  restore(): void;
  close(): void;
}

// A proxy the browser must send everything through, WebRTC included, so cutting it is a real dropped network for that browser alone.
export async function startCutProxy(): Promise<CutProxy> {
  const sockets = new Set<Socket>();
  let isCut = false;
  const server = createServer((client) => {
    if (isCut) return client.destroy();
    sockets.add(client);
    client.on('error', () => {});
    client.on('close', () => sockets.delete(client));
    client.once('data', (head) => {
      const target = /^CONNECT ([^:\s]+):(\d+)/.exec(head.toString());
      if (!target) return client.destroy();
      const upstream = connect(Number(target[2]), target[1], () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        client.pipe(upstream);
        upstream.pipe(client);
      });
      sockets.add(upstream);
      upstream.on('error', () => client.destroy());
      upstream.on('close', () => {
        sockets.delete(upstream);
        client.destroy();
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  return {
    port: address.port,
    cut() {
      isCut = true;
      sockets.forEach((socket) => socket.destroy());
    },
    restore() {
      isCut = false;
    },
    close() {
      sockets.forEach((socket) => socket.destroy());
      server.close();
    },
  };
}
