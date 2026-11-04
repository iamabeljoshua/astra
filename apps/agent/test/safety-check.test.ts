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
  const model = makeFakeTutorModel(getReply);
  const brain = createTutorBrain({ model, timeouts: QUICK, safety, trace, onTurnEnd: (summary) => summaries.push(summary) });
  return { brain, model, safety, flags, traced, shown, summaries };
}

async function say(brain: ReturnType<typeof setup>['brain'], text = STUDENT_WORDS): Promise<string> {
  const beats: Beat[] = [];
  for await (const beat of brain.reply({ text }, new AbortController().signal)) beats.push(beat);
  return beats.map(getBeatText).join(' ');
}

describe('a signal stops the teaching, shows help, and raises a flag', () => {
  it('says help in place of a reply that only asks a question', async () => {
    const { brain, flags, shown } = setup({ getReply: () => ({ pieces: ['Hmm, cut what exactly?'] }) });
    const spoken = await say(brain);
    expect(spoken).toBe(SPOKEN_LINES.safetyStop[0]);
    expect(flags).toEqual([{ kind: 'self_harm', source: 'student' }]);
    expect(shown).toHaveLength(1);
  });

  it('says it is not their fault only when someone is hurting them', async () => {
    const hurt = setup({ reading: 'abuse', getReply: () => ({ pieces: ['Tell me more about that.'] }) });
    expect(await say(hurt.brain, 'my uncle touches me')).toMatch(/not your fault/);
    const alone = setup({ reading: 'self_harm', getReply: () => ({ pieces: ['Tell me more about that.'] }) });
    expect(await say(alone.brain, 'i want to die')).not.toMatch(/fault/);
  });

  it('says help as soon as the check reads danger, with no wait on a slow model', async () => {
    const { brain } = setup({ readAfterMs: 10, getReply: () => ({ firstTextMs: 250, pieces: ['That sounds serious.'] }) });
    const startedAt = performance.now();
    expect(await say(brain)).toBe(SPOKEN_LINES.safetyStop[0]);
    expect(performance.now() - startedAt).toBeLessThan(150);
  });

  it('keeps a reply the check agrees with, and asks the model only once', async () => {
    const { brain, model } = setup({ getReply: () => ({ pieces: ['That sounds serious. Please tell an adult you trust now. Are you safe right now?'] }) });
    expect(await say(brain)).toBe('That sounds serious. Please tell an adult you trust now. Are you safe right now?');
    expect(model.requests).toHaveLength(1);
  });

  it('lets a reply in the student\'s own language finish when it names help', async () => {
    const { brain, model } = setup({ getReply: () => ({ pieces: ['Eso suena serio. ', 'Cuéntaselo ahora mismo a un adulto de confianza. ¿Estás a salvo?'], msPerPiece: 5 }) });
    expect(await say(brain, 'quiero matarme')).toMatch(/adulto de confianza/);
    expect(model.requests).toHaveLength(1);
  });

  it('asks again in the student\'s language when that reply names no help, then names it in code', async () => {
    const { brain, model } = setup({ getReply: () => ({ pieces: ['Hola, cuéntame más.'] }) });
    const spoken = await say(brain, 'quiero matarme');
    expect(model.requests).toHaveLength(2);
    expect(spoken).toContain(SPOKEN_LINES.safetyHelp[0]);
  });

  it('stops teaching at the next beat when the signal comes after the first words', async () => {
    const { brain } = setup({ readAfterMs: 30, getReply: () => ({ pieces: ['Nothing moves instantly, not even light. ', 'It takes time to cross any distance, so a train cannot do it.'], msPerPiece: 80 }) });
    const spoken = await say(brain);
    expect(spoken).toMatch(/^Nothing moves instantly/);
    expect(spoken).toContain(SPOKEN_LINES.safetyStop[0]);
    expect(spoken).not.toMatch(/cross any distance/);
  });

  it('waits for a slow read when the reply ended first, so help still comes after the question', async () => {
    const { brain } = setup({ readAfterMs: 60, getReply: () => ({ pieces: ['Quicker for what, though?'] }) });
    const spoken = await say(brain);
    expect(spoken).toMatch(/^Quicker for what/);
    expect(spoken).toContain(SPOKEN_LINES.safetyStop[0]);
  });

  it('plays no filler before help on a slow model in another language', async () => {
    const { brain } = setup({ getReply: () => ({ firstTextMs: 200, pieces: ['Eso suena serio.'] }) });
    const spoken = await say(brain, 'quiero matarme');
    expect(spoken).toContain(SPOKEN_LINES.safetyStop[0]);
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
