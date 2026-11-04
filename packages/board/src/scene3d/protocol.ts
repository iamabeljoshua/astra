export type KitTheme = 'light' | 'dark';

/** What a scene is given and all it is given. Saved scenes and live scenes reach the page in this one shape. */
export interface KitTake {
  code: string;
  timing: { moments: Record<string, number>; duration: number };
}

/** The page's only ways in. No student data goes through any of them. */
export type KitFrameCommand =
  | { type: 'load'; timing: KitTake['timing']; textures: Record<string, Blob>; quality?: 'high' | 'med' | 'low'; theme: KitTheme }
  | { type: 'render'; seconds: number }
  | { type: 'resize' }
  | { type: 'dispose' }
  | { type: 'ping'; id: number }
  /** Reads the frame back, for the checks. A session never sends these. */
  | { type: 'gate'; times: number[] }
  | { type: 'snapshot'; times: number[] }
  | { type: 'audit'; times: number[] }
  | { type: 'flash'; times: number[]; cols: number; rows: number }
  | { type: 'picture'; seconds: number; id: number };

export type KitFrameReply =
  | { type: 'loaded' }
  | { type: 'ready'; issues: string[]; unusedMoments: string[]; parts: string[]; params: Record<string, unknown>; sinceStartMs: number; buildMs: number; buffer: [number, number, number] }
  | { type: 'drawn'; seconds: number; costMs: number }
  | { type: 'pong'; id: number }
  | { type: 'error'; phase: 'script' | 'promise' | 'shader' | 'build' | 'render'; message: string; stack?: string; line?: number; col?: number; seconds?: number }
  | { type: 'gate'; result?: { samples: { t: number; mean: number; std: number; lit: number; hash: number }[]; deterministic: boolean; mismatches: number[]; costMean: number }; error?: string; issues: string[] }
  | { type: 'snapshot'; result: unknown[]; params?: Record<string, unknown>; error?: string }
  | { type: 'audit'; result: unknown[]; error?: string }
  | { type: 'flash'; result: { t: number; mean: number; tiles: number[] }[]; error?: string }
  | { type: 'picture'; url: string; id: number };
