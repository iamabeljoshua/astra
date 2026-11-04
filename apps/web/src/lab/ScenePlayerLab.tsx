import { type BoardState } from '@astra/board';
import { type SessionEvent } from '@astra/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { LAB_LABELS, PRODUCT_NAME } from '../strings';
import { BoardView } from './BoardView';
import { type LabSession, startLabSession } from './labSession';

type LabPhase = 'waiting' | 'connecting' | 'ready' | 'replaying';

interface BoardFrame {
  board: BoardState;
  atMs: number;
}

const LESSON_TURNS = 2;

const BUTTON = 'rounded border border-line px-3 py-1.5 text-control text-ink disabled:opacity-40';

interface HeldFrame {
  atMs: number;
  source: 'live' | 'replay';
}

declare global {
  interface Window {
    sceneLab?: LabSession;
    /** Pins the board to one moment, so a proof can compare a live frame with its replay pixel by pixel. */
    holdBoardFrame?(frame: HeldFrame | null): void;
  }
}

function getReplayEndMs(log: readonly SessionEvent[]): number {
  return log.reduce((endMs, event) => Math.max(endMs, event.atMs + ('durationMs' in event ? event.durationMs : 0)), 0);
}

// Development-only bench for the player, exposing what a proof run needs on window.sceneLab.
export default function ScenePlayerLab() {
  const [params] = useSearchParams();
  const url = params.get('url');
  const token = params.get('token');
  const [phase, setPhase] = useState<LabPhase>('waiting');
  const [frame, setFrame] = useState<BoardFrame | null>(null);
  const [log, setLog] = useState<readonly SessionEvent[]>([]);
  const [caption, setCaption] = useState('');
  const [nextLessonTurn, setNextLessonTurn] = useState(0);
  const sessionRef = useRef<LabSession | null>(null);
  const replayRef = useRef<{ startedAtMs: number; fromMs: number; endMs: number } | null>(null);
  const heldRef = useRef<HeldFrame | null>(null);

  useEffect(() => {
    window.holdBoardFrame = (held) => {
      heldRef.current = held;
    };
    let animationFrame = requestAnimationFrame(function draw() {
      animationFrame = requestAnimationFrame(draw);
      const session = sessionRef.current;
      if (!session) return;
      const held = heldRef.current;
      if (held) {
        setFrame({ board: held.source === 'replay' ? session.getReplayBoard(held.atMs) : session.player.getBoard(held.atMs), atMs: held.atMs });
        return;
      }
      const replay = replayRef.current;
      if (replay) {
        const atMs = Math.min(replay.fromMs + performance.now() - replay.startedAtMs, replay.endMs);
        setFrame({ board: session.getReplayBoard(atMs), atMs });
        return;
      }
      const live = session.getBoardNow();
      session.records.frames.push({ atMs: live.atMs, ms: performance.now() });
      setFrame(live);
      setCaption(session.player.getCaption());
    });
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const connect = useCallback(async () => {
    if (!url || !token) return;
    setPhase('connecting');
    const session = await startLabSession({
      url,
      token,
      shouldRecordPcm: params.get('record') === '1',
      onAgentReady: () => setPhase('ready'),
      onLogChange: (events) => setLog([...events]),
    });
    sessionRef.current = session;
    window.sceneLab = session;
  }, [params, token, url]);

  // Only the blocked-audio proof connects with no click, because that is what leaves the audio suspended.
  useEffect(() => {
    if (params.get('autoconnect') === '1') void connect();
  }, [connect, params]);

  const replay = () => {
    const session = sessionRef.current;
    if (!session) return;
    const fromMs = session.records.log[0]?.atMs ?? 0;
    replayRef.current = { startedAtMs: performance.now(), fromMs, endMs: getReplayEndMs(session.records.log) };
    setPhase('replaying');
  };

  const backToLive = () => {
    replayRef.current = null;
    setPhase('ready');
  };

  const send = (command: object) => {
    replayRef.current = null;
    setPhase('ready');
    sessionRef.current?.command(command);
  };

  const isReady = phase === 'ready' || phase === 'replaying';

  return (
    <main className="grid min-h-svh grid-cols-1 gap-6 bg-paper p-4 text-ink md:grid-cols-12 md:p-6">
      <title>{PRODUCT_NAME}</title>
      <section aria-label={LAB_LABELS.board} className="h-[60svh] md:col-span-7 md:h-auto">
        {frame ? <BoardView board={frame.board} atMs={frame.atMs} onElementDrawn={phase === 'replaying' ? undefined : (id) => sessionRef.current?.noteDrawn(id)} onMathRefused={(tex) => sessionRef.current?.records.refused.push(`math: ${tex}`)} /> : <BoardView board={{ elements: new Map(), focus: null }} atMs={0} />}
      </section>
      <section aria-label={LAB_LABELS.controls} className="flex flex-col gap-4 md:col-span-5">
        <h1 className="text-heading">{LAB_LABELS.title}</h1>
        <p className="text-fine text-ink-2">{url && token ? LAB_LABELS.intro : LAB_LABELS.noRoom}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BUTTON} disabled={!url || !token || phase !== 'waiting'} onClick={() => void connect()}>
            {LAB_LABELS.connect}
          </button>
          <button
            type="button"
            className={BUTTON}
            disabled={!isReady}
            onClick={() => {
              const lesson = params.get('lesson');
              send(lesson ? { type: 'play', lesson } : { type: 'play', lessonTurn: nextLessonTurn });
              setNextLessonTurn((turn) => (turn + 1) % LESSON_TURNS);
            }}
          >
            {LAB_LABELS.play}
          </button>
          <button type="button" className={BUTTON} disabled={!isReady} onClick={() => send({ type: 'interrupt' })}>
            {LAB_LABELS.interrupt}
          </button>
          <button type="button" className={BUTTON} disabled={!isReady} onClick={() => send({ type: 'resume' })}>
            {LAB_LABELS.resume}
          </button>
          <button type="button" className={BUTTON} disabled={!isReady || log.length === 0} onClick={phase === 'replaying' ? backToLive : replay}>
            {phase === 'replaying' ? LAB_LABELS.backToLive : LAB_LABELS.replay}
          </button>
        </div>
        <p data-testid="caption" className="font-voice text-lead text-ink">
          {caption}
        </p>
        <p className="text-fine text-ink-2">
          {LAB_LABELS.logEvents} {log.length}
        </p>
      </section>
    </main>
  );
}
