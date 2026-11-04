export type TapPoint = 'arriving' | 'output';

export interface PcmRecorder {
  tap(point: TapPoint, source: AudioNode): void;
  /** Base64 of 16-bit samples at half the graph's rate, with the graph frame the first sample came from. */
  take(point: TapPoint): { firstFrame: number | null; base64: string };
}

function toBase64(chunks: Float32Array[]): string {
  const sampleCount = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const samples = new Int16Array(sampleCount);
  let offset = 0;
  for (const chunk of chunks) {
    for (const sample of chunk) samples[offset++] = Math.max(-1, Math.min(1, sample)) * 32767;
  }
  const bytes = new Uint8Array(samples.buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
}

export function createPcmRecorder(audioContext: AudioContext): PcmRecorder {
  const tapped = new Map<TapPoint, { firstFrame: number | null; chunks: Float32Array[] }>();
  return {
    tap(point, source) {
      const record = { firstFrame: null as number | null, chunks: [] as Float32Array[] };
      tapped.set(point, record);
      const node = new AudioWorkletNode(audioContext, 'pcm-tap');
      node.port.onmessage = ({ data }) => {
        record.firstFrame ??= data.firstFrame;
        record.chunks.push(data.samples);
      };
      source.connect(node);
    },
    take(point) {
      const record = tapped.get(point);
      return { firstFrame: record?.firstFrame ?? null, base64: toBase64(record?.chunks ?? []) };
    },
  };
}
