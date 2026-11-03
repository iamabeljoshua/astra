import { type BoardState } from '@astra/board';
import { type SessionEvent } from '@astra/contracts';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { LAB_LABELS } from '../strings';
import { BoardView } from './BoardView';
import { type LabSession, startLabSession } from './labSession';

type LabPhase = 'waiting' | 'connecting' | 'ready' | 'replaying';

interface BoardFrame {
  board: BoardState;
  atMs: number;
}

const BUTTON = 'rounded border border-line px-3 py-1.5 text-control text-ink disabled:opacity-40';

declare global {
  interface Window {
    sceneLab?: LabSession;
  }
}

function getReplayEndMs(log: readonly SessionEvent[]): number {
  return log.reduce((endMs, event) => Math.max(endMs, event.atMs + ('durationMs' in event ? event.durationMs : 0)), 0);
}

// Development only. A test bench for the player: it shows a real voice driving a real board, and exposes what a proof run needs on window.sceneLab.
export default function ScenePlayerLab() {
  const [params] = useSearchParams();
  const url = params.get('url');
  const token = params.get('token');
  const [phase, setPhase] = useState<LabPhase>('waiting');
  const [frame, setFrame] = useState<BoardFrame | null>(null);
  const [log, setLog] = useState<readonly SessionEvent[]>([]);
  const sessionRef = useRef<LabSession | null>(null);
  const replayRef = useRef<{ startedAtMs: number; fromMs: number; endMs: number } | null>(null);

  useEffect(() => {
    let animationFrame = requestAnimationFrame(function draw() {
      animationFrame = requestAnimationFrame(draw);
      const session = sessionRef.current;
      if (!session) return;
      const replay = replayRef.current;
      if (replay) {
        const atMs = Math.min(replay.fromMs + performance.now() - replay.startedAtMs, replay.endMs);
        setFrame({ board: session.getReplayBoard(atMs), atMs });
        return;
      }
      session.records.frames.push({ atMs: session.getBoardNow().atMs, ms: performance.now() });
      setFrame(session.getBoardNow());
    });
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const connect = async () => {
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
  };

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
      <section aria-label={LAB_LABELS.board} className="h-[60svh] md:col-span-7 md:h-auto">
        {frame ? <BoardView board={frame.board} atMs={frame.atMs} onElementDrawn={phase === 'replaying' ? undefined : (id) => sessionRef.current?.noteDrawn(id)} /> : <BoardView board={{ elements: new Map(), focus: null }} atMs={0} />}
      </section>
      <section aria-label={LAB_LABELS.controls} className="flex flex-col gap-4 md:col-span-5">
        <h1 className="text-heading">{LAB_LABELS.title}</h1>
        <p className="text-fine text-ink-2">{url && token ? LAB_LABELS.intro : LAB_LABELS.noRoom}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BUTTON} disabled={!url || !token || phase !== 'waiting'} onClick={() => void connect()}>
            {LAB_LABELS.connect}
          </button>
          <button type="button" className={BUTTON} disabled={!isReady} onClick={() => send({ type: 'play', lessonTurn: 0 })}>
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
        <p className="text-fine text-ink-2">
          {LAB_LABELS.logEvents} {log.length}
        </p>
      </section>
    </main>
  );
}
