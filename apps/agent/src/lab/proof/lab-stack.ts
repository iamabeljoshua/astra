/// <reference lib="dom" />
import { type ChildProcess, spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '../../../../..');
export const AGENT_ROOT = join(REPO_ROOT, 'apps/agent');
export const LIVEKIT_PORT = Number(process.env.LAB_LIVEKIT_PORT ?? 7930);
export const LIVEKIT_UDP_PORT = Number(process.env.LAB_LIVEKIT_UDP_PORT ?? 7932);
export const RELAY_PORT = Number(process.env.LAB_RELAY_PORT ?? 7933);
export const WEB_PORT = Number(process.env.WEB_PORT ?? 6130);
export const LIVEKIT_URL = `ws://127.0.0.1:${LIVEKIT_PORT}`;
export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

const LAN_ADDRESS = Object.values(networkInterfaces()).flat().find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address;
const SERVER_CONFIG = `port: ${LIVEKIT_PORT}\nrtc:\n  udp_port: ${LIVEKIT_UDP_PORT}\n  tcp_port: ${LIVEKIT_PORT + 1}\n  use_external_ip: false\nkeys:\n  devkey: secret\nlogging:\n  level: warn\n`;

export const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function waitForHttp(url: string, limitMs: number): Promise<void> {
  const deadline = Date.now() + limitMs;
  while (Date.now() < deadline) {
    const isUp = await fetch(url).then(
      () => true,
      () => false,
    );
    if (isUp) return;
    await delay(200);
  }
  throw new Error(`${url} did not answer within ${limitMs} ms`);
}

export interface LabStack {
  stop(): void;
}

export async function startLabStack(): Promise<LabStack> {
  const processes: ChildProcess[] = [];
  processes.push(spawn('livekit-server', ['--config-body', SERVER_CONFIG, '--bind', '127.0.0.1'], { stdio: 'ignore' }));
  const isWebUp = await fetch(WEB_URL).then(
    () => true,
    () => false,
  );
  if (!isWebUp) processes.push(spawn('pnpm', ['--filter', '@astra/web', 'exec', 'vite'], { cwd: REPO_ROOT, stdio: 'ignore', env: { ...process.env, WEB_PORT: String(WEB_PORT) }, detached: true }));
  await waitForHttp(`http://127.0.0.1:${LIVEKIT_PORT}`, 15_000);
  await waitForHttp(WEB_URL, 60_000);
  return {
    stop() {
      for (const child of processes) {
        if (child.spawnfile === 'pnpm' && child.pid) process.kill(-child.pid);
        else child.kill('SIGKILL');
      }
    },
  };
}

export interface NetworkProfile {
  delayMs: number;
  jitterMs: number;
  lossPercent: number;
}

export const NETWORKS = {
  uneven: { delayMs: 40, jitterMs: 30, lossPercent: 1 },
  poor: { delayMs: 100, jitterMs: 70, lossPercent: 4 },
} as const satisfies Record<string, NetworkProfile>;

function getJitterMs(jitterMs: number): number {
  return jitterMs * Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

// Delays and drops the room's WebRTC packets, so a run sees a real jitter buffer working.
export function startRelay({ delayMs, jitterMs, lossPercent }: NetworkProfile) {
  const toBrowser = createSocket('udp4');
  const toServer = createSocket('udp4');
  let browser: { port: number; address: string } | null = null;
  let isClosed = false;
  const forward = (socket: typeof toBrowser, message: Buffer, port: number, address: string | undefined) => {
    if (Math.random() * 100 < lossPercent) return;
    setTimeout(() => {
      if (!isClosed) socket.send(message, port, address);
    }, Math.max(0, delayMs + getJitterMs(jitterMs)));
  };
  toBrowser.on('message', (message, remote) => {
    browser = remote;
    forward(toServer, message, LIVEKIT_UDP_PORT, LAN_ADDRESS);
  });
  toServer.on('message', (message) => {
    if (browser) forward(toBrowser, message, browser.port, browser.address);
  });
  toBrowser.bind(RELAY_PORT, '0.0.0.0');
  toServer.bind(0, '0.0.0.0');
  return {
    close() {
      isClosed = true;
      toBrowser.close();
      toServer.close();
    },
  };
}

// Runs in the page before anything else: sends WebRTC through the relay by rewriting what the server offers.
export function routeThroughRelay({ serverPort, relayPort }: { serverPort: number; relayPort: number }): void {
  const isIpv4Udp = (line: string) => / udp /.test(line) && /\d+\.\d+\.\d+\.\d+ /.test(line) && line.includes(' typ host');
  const rewriteLine = (line: string) => line.replace(` ${serverPort} typ host`, ` ${relayPort} typ host`);
  const rewriteSdp = (sdp: string) =>
    sdp
      .split('\r\n')
      .filter((line) => !line.startsWith('a=candidate') || isIpv4Udp(line))
      .map((line) => (line.startsWith('a=candidate') ? rewriteLine(line) : line))
      .join('\r\n');
  const descriptor = Object.getOwnPropertyDescriptor(RTCPeerConnection.prototype, 'onicecandidate') as PropertyDescriptor;
  Object.defineProperty(RTCPeerConnection.prototype, 'onicecandidate', {
    get() {
      return descriptor.get?.call(this);
    },
    set(handler) {
      descriptor.set?.call(this, (event: RTCPeerConnectionIceEvent) => {
        if (!event.candidate) handler(event);
      });
    },
  });
  const addIceCandidate = RTCPeerConnection.prototype.addIceCandidate;
  RTCPeerConnection.prototype.addIceCandidate = function (this: RTCPeerConnection, candidate?: RTCIceCandidateInit | null) {
    if (!candidate?.candidate) return (addIceCandidate as (init?: RTCIceCandidateInit | null) => Promise<void>).call(this, candidate);
    if (!isIpv4Udp(candidate.candidate)) return Promise.resolve();
    const init = candidate instanceof RTCIceCandidate ? candidate.toJSON() : candidate;
    return (addIceCandidate as (init: RTCIceCandidateInit) => Promise<void>).call(this, { ...init, candidate: rewriteLine(candidate.candidate) });
  } as typeof addIceCandidate;
  const setRemoteDescription = RTCPeerConnection.prototype.setRemoteDescription;
  RTCPeerConnection.prototype.setRemoteDescription = function (this: RTCPeerConnection, description: RTCSessionDescriptionInit) {
    return (setRemoteDescription as (init: RTCSessionDescriptionInit) => Promise<void>).call(this, { type: description.type, sdp: rewriteSdp(description.sdp ?? '') });
  } as typeof setRemoteDescription;
}
