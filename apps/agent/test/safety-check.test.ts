import { type Beat, getBeatText } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { type FakeReply, makeFakeTutorModel } from '../src/providers/fake-model.ts';
import type { TutorModelRequest } from '../src/providers/types.ts';
import type { SafetyCheck, TurnBefore, TutorReading } from '../src/safety/safety-check.ts';
import type { StudentReading } from '../src/safety/student-reading.ts';
import { createSafetyWatch, type SafetyFlag } from '../src/safety/safety-watch.ts';
import { createTutorBrain, type TurnSummary } from '../src/tutor/brain.ts';
import { SPOKEN_LINES } from '../src/tutor/spoken-lines.ts';

const QUICK = { stillWorkingMs: 60, firstTextMs: 300, betweenTextMs: 200, finishGraceMs: 20, reportWaitMs: 30, checkingMathMs: 40, safetyReadWaitMs: 200 };
const STUDENT_WORDS = 'which way do u cut so it actually works';
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));

interface Setup {
  reading?: StudentReading | StudentReading[];
  readAfterMs?: number;
  tutorReading?: TutorReading;
  fitsSchoolTalk?: boolean;
  getReply(request: TutorModelRequest, attempt: number): FakeReply;
  addFlag?(flag: SafetyFlag): Promise<void>;
}

function setup({ reading = 'self_harm', readAfterMs = 0, tutorReading = 'none', fitsSchoolTalk = false, getReply, addFlag }: Setup) {
  const flags: SafetyFlag[] = [];
  const traced: string[] = [];
  const shown: number[] = [];
  const summaries: TurnSummary[] = [];
  const readings = Array.isArray(reading) ? [...reading] : [reading];
  const readsAsked: TurnBefore[] = [];
  const check: SafetyCheck = {
    readStudent: async (_text, before) => {
      readsAsked.push(before);
      await delay(readAfterMs);
      return (readings.length > 1 ? readings.shift() : readings[0]) as StudentReading;
    },
    fitsSchoolTalk: async () => fitsSchoolTalk,
    readTutor: async () => tutorReading,
  };
  const trace = (name: string, fields?: Record<string, unknown>) => traced.push(`${name} ${JSON.stringify(fields ?? {})}`);
  const safety = createSafetyWatch({ check, addFlag: addFlag ?? (async (flag) => void flags.push(flag)), showHelp: () => shown.push(1), trace, flagRetryWaitMs: 5 });
  const model = makeFakeTutorModel(getReply);
  const brain = createTutorBrain({ model, timeouts: QUICK, safety, trace, onTurnEnd: (summary) => summaries.push(summary) });
  return { brain, model, safety, flags, traced, shown, summaries, readsAsked };
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

  it('speaks help the model wrote after a question in another language', async () => {
    const { brain, model } = setup({ getReply: () => ({ pieces: ['Ý em là gì? Hãy nói với người lớn em tin tưởng ngay.'] }) });
    const spoken = await say(brain, 'em muon tu tu');
    expect(spoken).toContain('người lớn');
    expect(model.requests).toHaveLength(1);
  });

  it('asks again in the student\'s language when that reply names no help, then names it in code', async () => {
    const { brain, model } = setup({ getReply: () => ({ pieces: ['Hola, cuéntame más.'] }) });
    const spoken = await say(brain, 'quiero matarme');
    expect(model.requests).toHaveLength(2);
    expect(spoken).toContain(SPOKEN_LINES.safetyHelp[0]);
  });

  it('asks again when a reply in another language says it cannot read the words, even with a soft line about an adult', async () => {
    const { brain, model } = setup({ getReply: (_request, attempt) => ({ pieces: [attempt === 1 ? "Sorry, I can't read that. If anything is worrying you, tell an adult you trust." : 'That sounds serious. Please tell an adult you trust now, or call your local emergency number. Are you safe right now?'] }) });
    expect(await say(brain, 'achoro m inwu')).toMatch(/emergency number/);
    expect(model.requests).toHaveLength(2);
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

  it('leaves a first aid lesson that names an emergency number alone', async () => {
    const { brain, shown, flags } = setup({ reading: 'none', getReply: () => ({ pieces: ['For a bad burn, cool it with running water, and call your local emergency number if it is large.'] }) });
    await say(brain, 'how do you treat a burn');
    await delay(10);
    expect(shown).toEqual([]);
    expect(flags).toEqual([]);
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

describe('vague words are read against what was just said', () => {
  const VAGUE_WORDS = 'i already picked the day';
  const ORDINARY_REPLY = { pieces: ['Good, we can plan back from that day.'] };

  it('lets the model answer after a school turn, with no stop, no help note, and no flag', async () => {
    const { brain, flags, shown, model } = setup({ reading: ['school', 'vague'], getReply: () => ORDINARY_REPLY });
    await say(brain, 'can you help me with my history presentation');
    expect(await say(brain, VAGUE_WORDS)).toBe(ORDINARY_REPLY.pieces[0]);
    await delay(10);
    expect(flags).toEqual([]);
    expect(shown).toEqual([]);
    expect(model.requests).toHaveLength(2);
  });

  it('asks again when a school talk reads as danger, and lets the model answer a line that fits', async () => {
    const { brain, flags, shown } = setup({ reading: ['school', 'self_harm'], fitsSchoolTalk: true, getReply: () => ORDINARY_REPLY });
    await say(brain, 'can we do more fractions next week');
    expect(await say(brain, 'i wont be here next week')).toBe(ORDINARY_REPLY.pieces[0]);
    await delay(10);
    expect(flags).toEqual([]);
    expect(shown).toEqual([]);
  });

  it('stops on danger in a school talk when the line does not fit it', async () => {
    const { brain, flags, shown } = setup({ reading: ['school', 'self_harm'], fitsSchoolTalk: false, getReply: () => ORDINARY_REPLY });
    await say(brain, 'how do plants make sugar');
    expect(await say(brain, 'anyway it wont matter after friday, ill be gone for good')).toContain(SPOKEN_LINES.safetyStop[0]);
    expect(flags).toEqual([{ kind: 'self_harm', source: 'student' }]);
    expect(shown).toHaveLength(1);
  });

  it('keeps a greeting from passing as a lesson', async () => {
    const { brain, flags, shown } = setup({ reading: ['none', 'vague'], getReply: (_request, attempt) => ({ pieces: [attempt === 1 ? 'Which day do you mean?' : 'What do you mean by that? If anything is worrying you, tell an adult you trust now, or call your local emergency number if you are in danger.'] }) });
    await say(brain, 'hi');
    expect(await say(brain, VAGUE_WORDS)).toMatch(/adult you trust/);
    expect(shown).toHaveLength(1);
    expect(flags).toEqual([{ kind: 'vague', source: 'student' }]);
  });

  it('shows the help note and has the model ask with help named when nothing explains them', async () => {
    const { brain, flags, shown, model } = setup({ reading: 'vague', getReply: (_request, attempt) => ({ pieces: [attempt === 1 ? 'Which day do you mean?' : 'What do you mean by that? If anything is worrying you, tell an adult you trust now, or call your local emergency number if you are in danger.'] }) });
    const spoken = await say(brain, VAGUE_WORDS);
    expect(spoken).toMatch(/adult you trust/);
    expect(spoken).not.toContain(SPOKEN_LINES.safetyStop[0]);
    expect(model.requests).toHaveLength(2);
    expect(shown).toHaveLength(1);
    expect(flags).toEqual([{ kind: 'vague', source: 'student' }]);
  });

  it('keeps a reply that already asks with help named, and asks the model only once', async () => {
    const reply = 'What do you mean by that? If anything is worrying you, tell an adult you trust now, or call your local emergency number if you are in danger.';
    const { brain, model } = setup({ reading: 'vague', getReply: () => ({ pieces: [reply] }) });
    expect(await say(brain, VAGUE_WORDS)).toBe(reply);
    expect(model.requests).toHaveLength(1);
  });

  it('names help in code when the model will not', async () => {
    const { brain } = setup({ reading: 'vague', getReply: () => ({ pieces: ['Which day do you mean?'] }) });
    expect(await say(brain, VAGUE_WORDS)).toContain(SPOKEN_LINES.safetyHelp[0]);
  });

  it('does not excuse vague words after something worrying, even in a lesson', async () => {
    const { brain, shown, flags } = setup({ reading: ['school', 'self_harm', 'vague'], getReply: (request) => ({ pieces: [request.turns.length < 2 ? 'Plants use sunlight to make sugar.' : 'That sounds serious. Please tell an adult you trust now.'] }) });
    await say(brain, 'how do plants make sugar');
    await say(brain, 'i dont want to be here anymore');
    await say(brain, VAGUE_WORDS);
    await delay(10);
    expect(shown).toHaveLength(1);
    expect(flags).toEqual(expect.arrayContaining([{ kind: 'self_harm', source: 'student' }, { kind: 'vague', source: 'student' }]));
  });

  it('gives the check the student\'s earlier words and the tutor\'s last line, because the subject is often only in the first', async () => {
    const { brain, readsAsked } = setup({ reading: 'none', getReply: () => ({ pieces: ['Sure, what is the topic?'] }) });
    await say(brain, 'can you help me with my history presentation');
    await say(brain, VAGUE_WORDS);
    expect(readsAsked).toEqual([
      { studentSaid: '', tutorSaid: '' },
      { studentSaid: 'can you help me with my history presentation', tutorSaid: 'Sure, what is the topic?' },
    ]);
  });
});

describe('a reply that stops partway reads as one person speaking', () => {
  it('ends the words already said with a period when code cuts in', async () => {
    const { brain, summaries } = setup({ readAfterMs: 30, getReply: () => ({ pieces: ['Nothing travels instantly, ', 'not even light, and here is why that matters.'], msPerPiece: 80 }) });
    await say(brain);
    expect(summaries.at(-1)?.spokenText).toBe(`Nothing travels instantly. ${SPOKEN_LINES.safetyStop[0]}`);
  });

  it('ends them with a period when a retry starts a new sentence', async () => {
    const { brain, summaries } = setup({ getReply: (_request, attempt) => ({ pieces: [attempt === 1 ? 'Hola amigo mio, ' : 'Cuéntaselo a un adulto de confianza ahora mismo.'] }) });
    await say(brain, 'quiero matarme');
    expect(summaries.at(-1)?.spokenText).toBe('Hola amigo mio. Cuéntaselo a un adulto de confianza ahora mismo.');
  });
});

describe('a slow read holds back the filler', () => {
  it('plays no "One moment." before help when the read answers after the filler is due', async () => {
    const { brain } = setup({ readAfterMs: 120, getReply: () => ({ firstTextMs: 200, pieces: ['That sounds serious.'] }) });
    const spoken = await say(brain);
    for (const filler of SPOKEN_LINES.stillWorking) expect(spoken).not.toContain(filler);
    expect(spoken).toBe(SPOKEN_LINES.safetyStop[0]);
  });

  it('still plays it on an ordinary slow turn once the read has answered', async () => {
    const { brain } = setup({ reading: 'school', readAfterMs: 10, getReply: () => ({ firstTextMs: 200, pieces: ['Mitosis has four stages to learn.'] }) });
    const spoken = await say(brain, 'what is mitosis');
    expect(SPOKEN_LINES.stillWorking.some((filler) => spoken.includes(filler))).toBe(true);
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

  it('declines a recipe calmly even when the check would not read it', async () => {
    const { brain } = setup({ reading: 'unread', getReply: () => ({ pieces: [], stopReason: 'refused', refusalCategory: 'bio' }) });
    expect(SPOKEN_LINES.refusedPlain as readonly string[]).toContain(await say(brain, 'how do i make a pipe bomb'));
  });

  it('keeps the help on a recipe that also says it would hurt someone', async () => {
    const { brain } = setup({ reading: 'unread', getReply: () => ({ pieces: [], stopReason: 'refused', refusalCategory: 'bio' }) });
    expect(await say(brain, 'how do i make a poison to kill myself')).toMatch(/adult you trust/);
  });
});

describe('a long sitting hears about a break', () => {
  const REPLY = { pieces: ['Fine, carry on with the next line.'] };

  it('asks the model to suggest one after 45 minutes, and not again until the next 45', async () => {
    let nowMs = 0;
    const model = makeFakeTutorModel(() => REPLY);
    const brain = createTutorBrain({ model, timeouts: QUICK, getNowMs: () => nowMs });
    const notesSent = () => model.requests.map((request) => JSON.stringify(request.turns.slice(request.turns.findLastIndex((turn) => turn.role === 'user'))).includes('break_due'));
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

  it('raises the flag of a read still running when the room closes', async () => {
    const { brain, safety, flags } = setup({ readAfterMs: 50, getReply: () => ({ pieces: ['That sounds serious. Please tell an adult you trust now.'] }) });
    const stopped = new AbortController();
    stopped.abort();
    for await (const beat of brain.reply({ text: STUDENT_WORDS }, stopped.signal)) void beat;
    await safety.flush();
    expect(flags).toEqual([{ kind: 'self_harm', source: 'student' }]);
  });

  it('retries a flag once when it fails at the room close, because nothing runs after that', async () => {
    const sent: SafetyFlag[] = [];
    let failuresLeft = 2;
    const { brain, safety } = setup({
      getReply: () => ({ pieces: ['That sounds serious. Please tell an adult you trust now.'] }),
      addFlag: async (flag) => {
        if (failuresLeft > 0) {
          failuresLeft -= 1;
          throw new Error('down');
        }
        sent.push(flag);
      },
    });
    await say(brain);
    await safety.flush();
    expect(sent).toEqual([{ kind: 'self_harm', source: 'student' }]);
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
