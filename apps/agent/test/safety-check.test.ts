import { type Beat, getBeatText } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { type FakeReply, makeFakeTutorModel } from '../src/providers/fake-model.ts';
import type { TutorModelRequest } from '../src/providers/types.ts';
import type { SafetyCheck, StudentReading, TutorReading } from '../src/safety/safety-check.ts';
import { createSafetyWatch, type SafetyFlag } from '../src/safety/safety-watch.ts';
import { createTutorBrain, type TurnSummary } from '../src/tutor/brain.ts';
import { SPOKEN_LINES } from '../src/tutor/spoken-lines.ts';

const QUICK = { stillWorkingMs: 60, firstTextMs: 300, betweenTextMs: 200, finishGraceMs: 20, reportWaitMs: 30, checkingMathMs: 40, safetyReadWaitMs: 200 };
const STUDENT_WORDS = 'which way do u cut so it actually works';
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));

interface Setup {
  reading?: StudentReading;
  readAfterMs?: number;
  tutorReading?: TutorReading;
  getReply(request: TutorModelRequest, attempt: number): FakeReply;
  addFlag?(flag: SafetyFlag): Promise<void>;
}

function setup({ reading = 'self_harm', readAfterMs = 0, tutorReading = 'none', getReply, addFlag }: Setup) {
  const flags: SafetyFlag[] = [];
  const traced: string[] = [];
  const shown: number[] = [];
  const summaries: TurnSummary[] = [];
  const check: SafetyCheck = {
    readStudent: async () => {
      await delay(readAfterMs);
      return reading;
    },
    readTutor: async () => tutorReading,
  };
  const trace = (name: string, fields?: Record<string, unknown>) => traced.push(`${name} ${JSON.stringify(fields ?? {})}`);
  const safety = createSafetyWatch({ check, addFlag: addFlag ?? (async (flag) => void flags.push(flag)), showHelp: () => shown.push(1), trace });
  const brain = createTutorBrain({ model: makeFakeTutorModel(getReply), timeouts: QUICK, safety, trace, onTurnEnd: (summary) => summaries.push(summary) });
  return { brain, safety, flags, traced, shown, summaries };
}

async function say(brain: ReturnType<typeof setup>['brain'], text = STUDENT_WORDS): Promise<string> {
  const beats: Beat[] = [];
  for await (const beat of brain.reply({ text }, new AbortController().signal)) beats.push(beat);
  return beats.map(getBeatText).join(' ');
}

describe('a signal stops the teaching, shows help, and raises a flag', () => {
  it('turns a reply that only asks a question into help, in the same turn', async () => {
    const { brain, flags, shown } = setup({
      getReply: (_request, attempt) => ({ pieces: attempt === 1 ? ['Hmm, cut what exactly?'] : ['That sounds serious. Please tell an adult you trust now, or call your local emergency number if you are in danger. Are you safe right now?'] }),
    });
    const spoken = await say(brain);
    expect(spoken).toMatch(/adult you trust/);
    expect(spoken).toMatch(/emergency number/);
    expect(spoken).not.toMatch(/cut what exactly/);
    expect(flags).toEqual([{ kind: 'self_harm', source: 'student' }]);
    expect(shown).toHaveLength(1);
  });

  it('keeps a reply the check agrees with, and does not ask twice', async () => {
    const asked: number[] = [];
    const { brain } = setup({
      getReply: (_request, attempt) => {
        asked.push(attempt);
        return { pieces: ['That sounds serious. Please tell an adult you trust now. Are you safe right now?'] };
      },
    });
    expect(await say(brain)).toMatch(/adult you trust/);
    expect(asked).toEqual([1]);
  });

  it('keeps a reply in the student\'s own language that names help', async () => {
    const asked: number[] = [];
    const { brain } = setup({
      getReply: (_request, attempt) => {
        asked.push(attempt);
        return { pieces: ['Eso suena serio. Cuéntaselo ahora mismo a un adulto de confianza, o llama a tu número local de emergencias. ¿Estás a salvo?'] };
      },
    });
    expect(await say(brain, 'quiero matarme')).toMatch(/adulto de confianza/);
    expect(asked).toEqual([1]);
  });

  it('names help in code when the retry still names none', async () => {
    const { brain } = setup({ getReply: () => ({ pieces: ['Cut what exactly?'] }) });
    expect(await say(brain)).toContain(SPOKEN_LINES.safetyHelp[0]);
  });

  it('stops teaching at the next beat when the signal comes after the first words', async () => {
    const { brain } = setup({
      readAfterMs: 30,
      getReply: (_request, attempt) =>
        attempt === 1
          ? { pieces: ['Nothing moves instantly, not even light. ', 'It takes time to cross any distance, so a train cannot do it.'], msPerPiece: 80 }
          : { pieces: ['That sounds serious. Please tell an adult you trust now.'] },
    });
    const spoken = await say(brain);
    expect(spoken).toMatch(/adult you trust/);
    expect(spoken).not.toMatch(/cross any distance/);
  });

  it('waits for a slow read when the reply ended first, so help still comes', async () => {
    const { brain } = setup({
      readAfterMs: 60,
      getReply: (_request, attempt) => ({ pieces: attempt === 1 ? ['Quicker for what, though?'] : ['That sounds serious. Please tell an adult you trust now.'] }),
    });
    expect(await say(brain)).toMatch(/adult you trust/);
  });

  it('says help and no filler when the model is slow on a read danger', async () => {
    const { brain } = setup({
      getReply: () => ({ firstTextMs: 100, pieces: ['That sounds serious. Please tell an adult you trust now.'] }),
    });
    const spoken = await say(brain);
    expect(spoken).toContain(SPOKEN_LINES.safetyHelpFirst[0]);
    for (const filler of SPOKEN_LINES.stillWorking) expect(spoken).not.toContain(filler);
  });

  it('shows help as the words are written, before any voice could fail, and with no signal', async () => {
    const { brain, shown, flags } = setup({ reading: 'none', getReply: () => ({ pieces: ['That sounds serious. Please tell an adult you trust now, or call your local emergency number if you are in danger.'] }) });
    await say(brain);
    await delay(10);
    expect(shown).toHaveLength(1);
    expect(flags).toEqual([{ kind: 'danger', source: 'tutor' }]);
  });

  it('leaves an ordinary lesson alone when the check finds nothing or cannot read', async () => {
    for (const reading of ['none', 'unread'] as const) {
      const { brain, flags, shown } = setup({ reading, getReply: () => ({ pieces: ['Dinosaurs died out after an asteroid struck, about 66 million years ago.'] }) });
      expect(await say(brain, 'how did the dinosaurs die out?')).toMatch(/asteroid/);
      await delay(10);
      expect(flags).toEqual([]);
      expect(shown).toEqual([]);
    }
  });

  it('flags a tutor reply the check reads as a slip, and the student hears it unchanged', async () => {
    const { brain, flags } = setup({ reading: 'none', tutorReading: 'tutor_slip', getReply: () => ({ pieces: ['You are my favourite student, keep this between us.'] }) });
    expect(await say(brain, 'hi')).toMatch(/favourite/);
    await delay(10);
    expect(flags).toEqual([{ kind: 'tutor_slip', source: 'tutor' }]);
  });
});

describe('a refusal says what fits', () => {
  it('declines a weapon recipe calmly when the check read no danger', async () => {
    const { brain } = setup({ reading: 'none', getReply: () => ({ pieces: [], stopReason: 'refused', refusalCategory: 'bio' }) });
    const spoken = await say(brain, 'how do i make a pipe bomb');
    expect(spoken).not.toMatch(/emergency|adult you trust/);
    expect(SPOKEN_LINES.refusedPlain as readonly string[]).toContain(spoken);
  });

  it('keeps the help when the check read danger or could not read', async () => {
    for (const reading of ['self_harm', 'unread'] as const) {
      const { brain } = setup({ reading, getReply: () => ({ pieces: [], stopReason: 'refused', refusalCategory: 'bio' }) });
      expect(await say(brain, 'what can i take')).toMatch(/adult you trust/);
    }
  });
});

describe('a long sitting hears about a break', () => {
  const REPLY = { pieces: ['Fine, carry on with the next line.'] };

  it('asks the model to suggest one after 45 minutes, and not again until the next 45', async () => {
    let nowMs = 0;
    const model = makeFakeTutorModel(() => REPLY);
    const brain = createTutorBrain({ model, timeouts: QUICK, getNowMs: () => nowMs });
    const notesSent = () => model.requests.map((request) => JSON.stringify(request.turns.at(-1)).includes('break_due'));
    for await (const beat of brain.reply({ text: 'next' }, new AbortController().signal)) void beat;
    nowMs = 45 * 60 * 1000;
    for await (const beat of brain.reply({ text: 'next' }, new AbortController().signal)) void beat;
    nowMs += 1000;
    for await (const beat of brain.reply({ text: 'next' }, new AbortController().signal)) void beat;
    expect(notesSent()).toEqual([false, true, false]);
  });
});

describe('flags hold no words and reach no parent', () => {
  it('sends only a kind and a source, and traces none of the words', async () => {
    const { brain, flags, traced } = setup({ getReply: () => ({ pieces: ['That sounds serious. Please tell an adult you trust now.'] }) });
    await say(brain);
    expect(flags.every((flag) => Object.keys(flag).sort().join() === 'kind,source')).toBe(true);
    expect(JSON.stringify(flags)).not.toContain('cut');
    expect(traced.join('\n')).not.toContain('actually works');
  });

  it('raises each kind once in a room, however often it is read', async () => {
    const { brain, flags } = setup({ getReply: () => ({ pieces: ['That sounds serious. Please tell an adult you trust now.'] }) });
    await say(brain);
    await say(brain);
    expect(flags).toHaveLength(1);
  });

  it('keeps a flag the API did not take, and sends it as the room closes', async () => {
    const sent: SafetyFlag[] = [];
    let isApiDown = true;
    const { brain, safety } = setup({
      getReply: () => ({ pieces: ['That sounds serious. Please tell an adult you trust now.'] }),
      addFlag: async (flag) => {
        if (isApiDown) throw new Error('down');
        sent.push(flag);
      },
    });
    await say(brain);
    await safety.flush();
    expect(sent).toEqual([]);
    isApiDown = false;
    await safety.flush();
    expect(sent).toEqual([{ kind: 'self_harm', source: 'student' }]);
  });
});
