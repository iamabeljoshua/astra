import { useState } from 'react';
import { api } from '../api/client';
import { PRODUCT_NAME, VOICE_TEST_LABELS } from '../strings';
import { StudentCaption, TutorCaption } from '../voice/Captions';
import { useLiveVoice } from '../voice/useLiveVoice';

const BUTTON = 'button button-outline';

/** Read in a noisy room, on the built-in microphone, with speech cleanup on and then off. */
const LINES = [
  'It lands twice as far.',
  'Wait, then why does it come down?',
  'Show me the ball.',
  'x squared over two',
  'Is the numerator bigger than the denominator?',
  'The discriminant is b squared minus four a c.',
  'Uh-huh.',
  'Hmm, let me think.',
  'Wait.',
  '42',
  'If I throw a ball straight up, how fast was it going when it left my hand?',
  'No, I mean the denominator, not the numerator.',
];

function VoiceTest({ sessionId, usesSpeechCleanup }: { sessionId: string; usesSpeechCleanup: boolean }) {
  const { view, voice, toggleTalk } = useLiveVoice({ sessionId, usesSpeechCleanup });
  const [lineIndex, setLineIndex] = useState(-1);
  const line = LINES[lineIndex];

  const nextLine = () => {
    const next = lineIndex + 1;
    setLineIndex(next);
    const text = LINES[next];
    if (text) voice?.mark({ line: text, cleanup: usesSpeechCleanup });
  };

  return (
    <div className="flex flex-col gap-4">
      {!view && (
        <button type="button" className="button self-start" onClick={() => void toggleTalk()}>
          {VOICE_TEST_LABELS.start}
        </button>
      )}
      {view && (
        <>
          <p className="text-fine text-ink-2">{view.mic === 'on' ? VOICE_TEST_LABELS.micOn : VOICE_TEST_LABELS.micOff}</p>
          {lineIndex < LINES.length && (
            <>
              {line && (
                <div>
                  <p className="label text-ink-2">{VOICE_TEST_LABELS.lineOf(lineIndex + 1, LINES.length)}</p>
                  <p className="text-heading font-semibold wrap-anywhere">{line}</p>
                </div>
              )}
              <button type="button" className={`${BUTTON} self-start`} onClick={nextLine}>
                {lineIndex < 0 ? VOICE_TEST_LABELS.first : VOICE_TEST_LABELS.next}
              </button>
            </>
          )}
          {lineIndex >= LINES.length && <p>{VOICE_TEST_LABELS.done}</p>}
          <TutorCaption heard={view.tutorHeard} coming={view.tutorComing} />
          <StudentCaption lines={view.studentLines} />
        </>
      )}
    </div>
  );
}

// Development-only page for a real microphone in a real room. The agent's trace holds the timings, read afterwards with `read-mic-test.ts`.
export default function VoiceTestPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [usesSpeechCleanup, setUsesSpeechCleanup] = useState(true);

  const open = async (cleanup: boolean) => {
    setUsesSpeechCleanup(cleanup);
    const session = await api.post('/sessions', { body: { title: VOICE_TEST_LABELS.title, subject: VOICE_TEST_LABELS.title, language: 'en' } });
    setSessionId(session.id);
  };

  return (
    <main className="mx-auto flex min-h-svh max-w-column flex-col gap-5 bg-paper p-6 text-ink">
      <title>{PRODUCT_NAME}</title>
      <h1 className="text-heading font-semibold">{VOICE_TEST_LABELS.title}</h1>
      <p className="text-fine text-ink-2">{VOICE_TEST_LABELS.intro}</p>
      {sessionId ? (
        <VoiceTest key={sessionId} sessionId={sessionId} usesSpeechCleanup={usesSpeechCleanup} />
      ) : (
        <div className="flex flex-wrap gap-2.5">
          <button type="button" className={BUTTON} onClick={() => void open(true)}>
            {VOICE_TEST_LABELS.openWithCleanup}
          </button>
          <button type="button" className={BUTTON} onClick={() => void open(false)}>
            {VOICE_TEST_LABELS.openWithoutCleanup}
          </button>
        </div>
      )}
    </main>
  );
}
