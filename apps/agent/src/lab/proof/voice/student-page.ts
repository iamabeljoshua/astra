/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { makeSayClip, type SpokenLine } from './make-speech.ts';
import { installSpeechInPage } from './speech-in-page.ts';
import { WEB_URL } from './stack.ts';

declare global {
  interface Window {
    astraVoice?: { getView(): { phase: string; [field: string]: unknown }; records: Record<string, unknown>; player: { getOperations(): { kind: string; atMs: number }[] } };
  }
}

const SPEECH_FOLDER = '/Users/abel/.claude/orchestrate/astra-mvp/vendor-test/speech';

export interface SpeechClip {
  voice: string;
  id: string;
  text: string;
  firstMs: number;
  lastMs: number;
  durationMs: number;
  base64: string;
}

interface Manifest {
  [voice: string]: { [id: string]: { text: string; firstMs: number; lastMs: number; durationMs: number } };
}

export function loadClip(voice: string, id: string, folder = SPEECH_FOLDER): SpeechClip {
  const manifest = JSON.parse(readFileSync(`${folder}/manifest.json`, 'utf8')) as Manifest;
  const entry = manifest[voice]?.[id];
  if (!entry) throw new Error(`no clip ${voice}/${id}`);
  return { voice, id, ...entry, base64: readFileSync(`${folder}/${voice}/${id}.pcm`).toString('base64') };
}

export function clipFromSay(voice: string, line: SpokenLine, folder: string): SpeechClip {
  const { pcm, firstMs, lastMs, durationMs } = makeSayClip({ voice, line, folder });
  return { voice, id: line.id, text: line.text, firstMs, lastMs, durationMs, base64: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64') };
}

export interface StudentPage {
  context: BrowserContext;
  page: Page;
  sessionId: string;
  sessionUrl: string;
  /** Plays a clip into the fake microphone, and says when its first and last sound left. */
  say(clip: SpeechClip): Promise<{ firstSoundEpochMs: number; lastSoundEpochMs: number; endedEpochMs: number }>;
  setNoise(level: number): Promise<void>;
  pressTalk(): Promise<void>;
  waitForLive(): Promise<void>;
  getTrace(): Promise<PageTrace>;
  getRoundTripMs(): Promise<number | null>;
  /** The state of every track the page captured, and of every audio sender with the bytes it has sent. */
  getMicEvidence(): Promise<{ tracks: string[]; senders: { state: string; bytes: number }[] }>;
  videoStartedEpochMs: number;
}

export interface PageTrace {
  firstAudioEpochMs: Record<string, number>;
  turnStartedEpochMs: Record<string, number>;
  stopEpochMs: Record<string, number>;
  heardEpochMs: number[];
  yieldEpochMs: { turnId: string; isYielding: boolean; atMs: number }[];
  localYieldEpochMs: number[];
  fired: { turnId: string; firedEpochMs: number; atWord: number }[];
  refused: string[];
  clockKinds: string[];
  view: { phase: string; mic: string; tutorHeard: string[]; tutorComing: string[]; studentLines: { text: string; isFinal: boolean }[]; isSoundBlocked: boolean };
  outputLatencyMs: number;
}

export async function launchProofBrowser({ proxy, captureFile, usesFullChromium = false }: { proxy?: string; captureFile?: string; usesFullChromium?: boolean } = {}): Promise<Browser> {
  const args = ['--use-mock-keychain', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--no-sandbox'];
  if (captureFile) args.push('--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${captureFile}`);
  if (proxy) args.push(`--proxy-server=${proxy}`, '--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
  return chromium.launch({ headless: true, args, ...(usesFullChromium ? { channel: 'chromium' } : {}) });
}

const ALREADY_SIGNED_OUT = 'Development sign-in';

// A student with no speakers and a browser that blocks sound, so the board and captions must run on the timer.
function blockTutorAudio(): void {
  const Original = AudioContext;
  window.AudioContext = class extends Original {
    constructor(options?: AudioContextOptions) {
      super(options);
      void this.suspend();
    }
    override resume(): Promise<void> {
      return Promise.resolve();
    }
  };
}

// Signs in as a seeded student through the real sign-in page, starts a real session, and opens its real screen.
export async function openStudentPage(browser: Browser, { email, title, recordVideoDir, blocksAudio = false, usesRealCapture = false, viewport = { width: 1440, height: 900 } }: { email: string; title: string; recordVideoDir?: string; blocksAudio?: boolean; usesRealCapture?: boolean; viewport?: { width: number; height: number } }): Promise<StudentPage> {
  const context = await browser.newContext({ baseURL: WEB_URL, viewport, recordVideo: recordVideoDir ? { dir: recordVideoDir, size: viewport } : undefined, permissions: ['microphone'] });
  const videoStartedEpochMs = Date.now();
  const page = await context.newPage();
  if (!usesRealCapture) await page.addInitScript(installSpeechInPage);
  await page.addInitScript(() => {
    const capturedTracks: MediaStreamTrack[] = [];
    (window as unknown as { capturedTracks: MediaStreamTrack[] }).capturedTracks = capturedTracks;
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await getUserMedia(constraints);
      capturedTracks.push(...stream.getAudioTracks());
      return stream;
    };
    const Original = RTCPeerConnection;
    const connections: RTCPeerConnection[] = [];
    (window as unknown as { peerConnections: RTCPeerConnection[] }).peerConnections = connections;
    window.RTCPeerConnection = class extends Original {
      constructor(...args: ConstructorParameters<typeof RTCPeerConnection>) {
        super(...args);
        connections.push(this);
      }
    };
  });
  if (blocksAudio) await page.addInitScript(blockTutorAudio);
  await page.goto('/');
  await page.getByRole('button', { name: ALREADY_SIGNED_OUT }).click();
  await page.getByRole('button', { name: email }).click();
  const signedIn = await page.waitForFunction(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const value = localStorage.getItem(localStorage.key(index) as string) ?? '';
      if (value.includes('access_token')) return (JSON.parse(value) as { access_token: string }).access_token;
    }
    return null;
  }, undefined, { timeout: 20_000 });
  const token = await signedIn.jsonValue();
  const created = await page.request.post(`${WEB_URL}/api/sessions`, { headers: { authorization: `Bearer ${token}` }, data: { title, subject: 'Physics', language: 'en' } });
  if (!created.ok()) throw new Error(`could not start a session: ${created.status()} ${await created.text()}`);
  const { id: sessionId } = (await created.json()) as { id: string };
  const sessionUrl = `/sessions/${sessionId}`;
  await page.goto(sessionUrl);
  await page.getByRole('textbox', { name: 'Your reply' }).waitFor();
  return {
    context,
    page,
    videoStartedEpochMs,
    sessionId,
    sessionUrl,
    async say(clip) {
      const { startedEpochMs, endedEpochMs } = await page.evaluate(({ base64 }) => window.speechInPage.play(base64, 24000), { base64: clip.base64 });
      return { firstSoundEpochMs: startedEpochMs + clip.firstMs, lastSoundEpochMs: startedEpochMs + clip.lastMs, endedEpochMs };
    },
    setNoise: (level) => page.evaluate((value) => window.speechInPage.setNoise(value), level),
    pressTalk: () => page.getByRole('button', { name: 'Talk' }).click(),
    async waitForLive() {
      await page.waitForFunction(() => window.astraVoice?.getView().phase === 'live', undefined, { timeout: 30_000 });
    },
    getMicEvidence: () =>
      page.evaluate(async () => {
        const { capturedTracks, peerConnections } = window as unknown as { capturedTracks: MediaStreamTrack[]; peerConnections: RTCPeerConnection[] };
        const senders: { state: string; bytes: number }[] = [];
        for (const connection of peerConnections) {
          for (const sender of connection.getSenders()) {
            let bytes = 0;
            let isAudio = sender.track?.kind === 'audio';
            (await sender.getStats()).forEach((report: { type: string; kind?: string; bytesSent?: number }) => {
              if (report.type !== 'outbound-rtp') return;
              bytes += report.bytesSent ?? 0;
              isAudio ||= report.kind === 'audio';
            });
            if (isAudio) senders.push({ state: sender.track?.readyState ?? 'removed', bytes });
          }
        }
        return { tracks: capturedTracks.map((track) => track.readyState), senders };
      }),
    getRoundTripMs: () =>
      page.evaluate(async () => {
        const list = (window as unknown as { peerConnections: RTCPeerConnection[] }).peerConnections;
        for (const connection of list) {
          let found: number | null = null;
          (await connection.getStats()).forEach((report: { type: string; nominated?: boolean; currentRoundTripTime?: number }) => {
            if (report.type === 'candidate-pair' && report.nominated && report.currentRoundTripTime !== undefined) found = report.currentRoundTripTime * 1000;
          });
          if (found !== null) return found;
        }
        return null;
      }),
    getTrace: () =>
      page.evaluate(() => {
        const voice = window.astraVoice;
        if (!voice) throw new Error('no live voice on this page');
        const { firstAudioEpochMs, turnStartedEpochMs, stopEpochMs, heardEpochMs, yieldEpochMs, localYieldEpochMs, fired, refused, clockKinds } = voice.records;
        return { firstAudioEpochMs, turnStartedEpochMs, stopEpochMs, heardEpochMs, yieldEpochMs, localYieldEpochMs, fired, refused, clockKinds, view: voice.getView(), outputLatencyMs: 0 } as unknown as PageTrace;
      }),
  };
}
