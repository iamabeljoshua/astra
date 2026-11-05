import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Beat, parseBeat, type SceneAgentMessage } from '@astra/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { PlanMove } from '../src/lesson-plan/lesson-plan.ts';
import { createLessonPlanner } from '../src/lesson-plan/lesson-planner.ts';
import type { ModelEvent, TutorModelAdapter, TutorModelRequest } from '../src/providers/types.ts';
import { createSceneStore } from '../src/scenes/scene-store.ts';
import type { LessonPlan, SceneRoute, StoredScene } from '../src/scenes/scene-types.ts';
import { createTutorBrain, type TutorBeat } from '../src/tutor/brain.ts';
import { TUTOR_PROMPT, withScenes } from '../src/tutor/prompt.ts';
import { createTutorScenes } from '../src/tutor/tutor-scenes.ts';

const USAGE = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const ROUTE_USAGE = { model: 'fake', ms: 1, costUsd: 0 };
const OLD_TOPIC = 'what the slope of a line tells you';
const SCENE_PLAN: LessonPlan = { opening: [{ say: 'x' }], more: [], setup: 'Watch the line tilt.', narration: '[[a]] The line climbs. [[b]] It climbs at one steady rate.', plan: 'a: a\nb: b', close: 'What would a steeper line tell you?' };
const SCENE: StoredScene = { id: `scene-${'a'.repeat(40)}`, engine: 'manimgx', topic: OLD_TOPIC, moments: { a: 0, b: 2 }, parts: [], durationSeconds: 5, plan: SCENE_PLAN, ownerId: 'maya' } as unknown as StoredScene;
const SLOPES: PlanMove = { move: 'new', plan: { topic: 'Slopes', kind: 'handsOn', steps: [{ teach: 'Slope is steepness', exercise: 'Find the slope of y = 2x' }] } };
const CRISIS = 'That sounds serious. Please tell an adult you trust now, or call your local emergency number.';

function makeModel(...replies: string[]) {
  const requests: TutorModelRequest[] = [];
  const model = {
    name: 'fake',
    warm: async () => {},
    getCostUsd: () => 0,
    compact: async () => null,
    async *stream(request: TutorModelRequest): AsyncGenerator<ModelEvent> {
      requests.push(request);
      yield { type: 'started', usage: USAGE };
      yield { type: 'text', text: replies.shift() ?? 'Okay, carrying on.', isNewBlock: false };
      yield { type: 'finished', usage: USAGE, stopReason: 'finished', refusalCategory: null };
    },
  } as unknown as TutorModelAdapter;
  return { model, requests };
}

const flush = async () => {
  for (let tick = 0; tick < 6; tick += 1) await new Promise((resolve) => setImmediate(resolve));
};

function makeScenes() {
  const sent: SceneAgentMessage[] = [];
  const spoken: (readonly Beat[])[] = [];
  const ended: string[] = [];
  const scenes = createTutorScenes({
    router: { route: vi.fn(async () => ({ engine: 'manimgx', kind: 'graph', topic: OLD_TOPIC, ...ROUTE_USAGE }) as SceneRoute) },
    runs: { join: vi.fn(() => ({ plan: Promise.resolve(SCENE_PLAN), firstLine: Promise.resolve(null), getScene: async () => ({ isOk: true as const, scene: SCENE }), leave: vi.fn() })) } as never,
    store: createSceneStore(mkdtempSync(join(tmpdir(), 'scene-lesson-'))),
    getCardTitle: () => null,
    getNowMs: () => performance.now(),
    send: (message) => void sent.push(message),
    canSpeak: () => true,
    speak(beats) {
      spoken.push(beats);
      return true;
    },
    onShown: () => {},
    trace(name, fields = {}) {
      if (name === 'sceneEnded') ended.push(String(fields.how));
    },
  });
  scenes.onPage({ type: 'sceneDevice', canPlay: true }, 'maya');
  return { scenes, sent, spoken, ended };
}

// The real brain, the real planner, and the real scene module, joined as the worker joins them.
function makeLesson(replies: string[], moves: readonly PlanMove[] = [SLOPES]) {
  const { model, requests } = makeModel(...replies);
  const { scenes, ...sceneRecord } = makeScenes();
  const titles: string[] = [];
  let moveIndex = 0;
  const planner = createLessonPlanner({
    ask: () => {
      const move = moves[Math.min(moveIndex, moves.length - 1)] ?? null;
      moveIndex += 1;
      return Promise.resolve({ move, costUsd: 0 });
    },
    canSpend: () => true,
    charge: () => {},
    onTitleChange(title) {
      titles.push(title);
      scenes.noteTopic(title);
    },
    trace: () => {},
  });
  const brain = createTutorBrain({ model, prompt: withScenes(TUTOR_PROMPT), lessonPlanner: planner, onAskScene: (topic) => scenes.ask(topic), onSafetyReply: () => scenes.noteSafetyReply() });
  const say = async (text: string) => {
    scenes.noteStudentTurn();
    const said: TutorBeat[] = [];
    for await (const beat of brain.reply({ text }, new AbortController().signal)) said.push(beat);
    await planner.whenSettled();
    return said;
  };
  return { brain, planner, scenes, requests, say, titles, ...sceneRecord };
}

const getSystemNotes = (request: TutorModelRequest | undefined) => JSON.stringify((request?.turns ?? []).filter((turn) => 'text' in turn && turn.role === 'system'));
const hasTask = (beats: readonly Beat[]) => beats.some((beat) => beat.script.some((part) => typeof part !== 'string' && part.kind === 'task'));
const sceneBeat = (): Beat => {
  const parsed = parseBeat({ id: 'n1-scene-setup', script: ['Watch the line tilt.'], expectsReply: false });
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.value;
};

describe('a safety reply in a lesson with scenes', () => {
  it('ends the ask made in that same reply, and restarts the count to the exercise', async () => {
    const { planner, say, ended, sent, spoken, scenes } = makeLesson(['Slope is steepness.', `{"kind":"askScene","topic":"${OLD_TOPIC}"}${CRISIS}`]);
    await say('teach me slopes');
    expect(planner.getStepNote()).toMatchObject({ exercise_due: true });
    await say('i keep thinking about it');
    await flush();
    expect(ended).toContain('safetyReply');
    expect(planner.getStepNote()).not.toHaveProperty('exercise_due');
    scenes.notePause();
    expect(sent.filter((message) => message.type === 'loadScene')).toEqual([]);
    expect(spoken).toEqual([]);
  });

  it('takes no ask until the student speaks again', async () => {
    const { say, scenes, sent } = makeLesson([CRISIS]);
    await say('i keep thinking about it');
    scenes.ask(OLD_TOPIC);
    await flush();
    expect(sent.filter((message) => message.type === 'loadScene')).toEqual([]);
  });

  it('keeps the picture aside for the whole reply, even when the model writes a teach command beside the help', async () => {
    const { brain, say } = makeLesson([`{"kind":"boardMode","mode":"teach"}${CRISIS} {"kind":"boardMode","mode":"teach"}Are you safe right now?`]);
    const parsed = parseBeat({ id: 'n1-scene-setup', script: [{ kind: 'richScene', id: 'scene-1', engine: 'manimgx', sceneId: 'slope-1a2b3c4d', moments: { a: 1 }, parts: [], durationSeconds: 5 }, 'Watch the line tilt.'], expectsReply: false });
    if (!parsed.ok) throw new Error(parsed.problem);
    brain.noteSceneTurn?.({ topic: OLD_TOPIC, beats: [parsed.value] });
    brain.notePlayed?.({ beatId: parsed.value.id, playedWords: 4, firedCues: 1 });
    const said = await say('i keep thinking about it');
    const modes = said.flatMap((beat) => beat.script.flatMap((part) => (typeof part !== 'string' && part.kind === 'boardMode' ? [part.mode] : [])));
    expect(modes).toEqual(['handsOn']);
  });

  it('never carries a plan step from a scene turn into words that may be serious', async () => {
    const { brain, requests, say } = makeLesson(['Slope is steepness.', CRISIS]);
    await say('teach me slopes');
    brain.noteSceneTurn?.({ topic: OLD_TOPIC, beats: [sceneBeat()] });
    await say('i want to die');
    expect(getSystemNotes(requests[1])).not.toContain('exercise_due');
  });
});

describe('a scene ask on a turn with an exercise due', () => {
  const SETS_THE_TASK = `{"kind":"askScene","topic":"${OLD_TOPIC}"}Let's try it together. {"kind":"boardMode","mode":"handsOn"}{"kind":"writeMath","id":"p1","tex":"15 + 27","claim":"new"}Fifteen plus twenty-seven. {"kind":"task","id":"a1","way":"write","on":"p1"}Have a go at the first line.`;

  it('keeps the task on the board and in the lesson, and the ask goes on', async () => {
    const { planner, requests, say, sent } = makeLesson(['Slope is steepness.', SETS_THE_TASK]);
    await say('teach me slopes');
    const said = await say('okay what next');
    await flush();
    expect(getSystemNotes(requests[1])).toContain('exercise_due');
    expect(hasTask(said)).toBe(true);
    expect(planner.getStepNote()).not.toHaveProperty('exercise_due');
    expect(sent.filter((message) => message.type === 'loadScene')).toHaveLength(1);
  });

  it('keeps a task written after the last sentence, with the ask first', async () => {
    const { planner, say } = makeLesson(['Slope is steepness.', `{"kind":"askScene","topic":"${OLD_TOPIC}"}Let's try it. {"kind":"writeMath","id":"p1","tex":"15 + 27","claim":"new"}{"kind":"task","id":"a1","way":"write","on":"p1"}`]);
    await say('teach me slopes');
    const said = await say('okay what next');
    expect(hasTask(said)).toBe(true);
    expect(planner.getStepNote()).not.toHaveProperty('exercise_due');
  });

  it('still tells the next turn the exercise is due after a scene lands in between', async () => {
    const { brain, requests, say } = makeLesson(['Slope is steepness.', 'Okay.']);
    await say('teach me slopes');
    brain.noteSceneTurn?.({ topic: OLD_TOPIC, beats: [sceneBeat()] });
    await say('i think i see it');
    expect(getSystemNotes(requests[1])).toContain('exercise_due');
  });
});

describe('a switch to a new topic', () => {
  const BLACK_HOLES: PlanMove = { move: 'new', plan: { topic: 'Black holes', kind: 'teachFirst', steps: [{ teach: 'Gravity traps light', exercise: 'Say why light cannot leave' }] } };
  const LOADED = { type: 'sceneLoaded', sceneId: SCENE.id } as const;

  it('ends a scene pending for the old topic, so it does not land after the switch', async () => {
    const { say, scenes, sent, spoken } = makeLesson(['Slope is steepness.', `{"kind":"askScene","topic":"${OLD_TOPIC}"}Sure, black holes.`], [SLOPES, BLACK_HOLES]);
    await say('teach me slopes');
    await say('actually teach me black holes');
    await flush();
    scenes.onPage(LOADED, 'maya');
    scenes.notePause();
    expect(sent.filter((message) => message.type === 'loadScene')).toEqual([]);
    expect(spoken).toEqual([]);
  });

  it('renames the lesson when the student cuts a card\'s opening scene for a new topic, before the tutor heard the title', async () => {
    const { brain, say, titles } = makeLesson(['Sure, black holes.'], [BLACK_HOLES]);
    const beat = sceneBeat();
    brain.noteSceneTurn?.({ topic: OLD_TOPIC, beats: [beat] });
    brain.noteCut?.(new Map([[beat.id, 3]]));
    await say('actually teach me black holes');
    expect(titles).toEqual(['Black holes']);
  });

  it('never renames on the card\'s own title after its scene played whole', async () => {
    const { brain, say, titles } = makeLesson(['A derivative measures change.'], [BLACK_HOLES]);
    brain.noteSceneTurn?.({ topic: OLD_TOPIC, beats: [sceneBeat()] });
    await say('I would like to learn about black holes');
    expect(titles).toEqual([]);
  });

  it('stops a scene still being written for the old topic from loading once it is ready', async () => {
    const { scenes, sent, spoken, ended } = makeScenes();
    scenes.ask(OLD_TOPIC);
    scenes.noteTopic('Black holes');
    expect(ended).toEqual(['topicChanged']);
    await flush();
    scenes.notePause();
    expect(sent.filter((message) => message.type === 'loadScene')).toEqual([]);
    expect(spoken).toEqual([]);
  });

  it('refuses an old-topic ask the same reply makes after the switch, and allows the new topic', async () => {
    const { scenes, ended, sent } = makeScenes();
    scenes.noteTopic('Black holes');
    scenes.ask(OLD_TOPIC);
    await flush();
    expect(sent.filter((message) => message.type === 'loadScene')).toEqual([]);
    scenes.ask('how black holes bend light');
    await flush();
    expect(sent.filter((message) => message.type === 'loadScene')).toHaveLength(1);
    expect(ended).toEqual([]);
  });

  it('keeps a scene the switching reply asked for the new topic', async () => {
    const { scenes, ended, sent, spoken } = makeScenes();
    scenes.ask('how black holes bend light');
    scenes.noteTopic('Black holes');
    await flush();
    expect(ended).toEqual([]);
    scenes.onPage(LOADED, 'maya');
    scenes.notePause();
    expect(sent.filter((message) => message.type === 'loadScene')).toHaveLength(1);
    expect(spoken).toHaveLength(1);
  });

  it('trusts the tutor again from the next student turn, since that reply has heard the new plan', async () => {
    const { scenes, sent } = makeScenes();
    scenes.noteTopic('Black holes');
    scenes.noteStudentTurn();
    scenes.ask('why light cannot get out');
    await flush();
    expect(sent.filter((message) => message.type === 'loadScene')).toHaveLength(1);
  });

  it('lets the old topic be asked again when the student goes back to it', async () => {
    const { scenes, ended, sent } = makeScenes();
    scenes.ask(OLD_TOPIC);
    scenes.noteTopic('Black holes');
    expect(ended).toEqual(['topicChanged']);
    scenes.noteStudentTurn();
    scenes.noteTopic('What the slope of a line tells you');
    scenes.ask(OLD_TOPIC);
    await flush();
    expect(sent.filter((message) => message.type === 'loadScene')).toHaveLength(1);
  });

  it('ignores the same title told again to a page that reloaded', async () => {
    const { scenes, ended } = makeScenes();
    scenes.noteTopic('Black holes');
    scenes.noteStudentTurn();
    scenes.ask('why light cannot get out');
    scenes.noteTopic('Black holes');
    expect(ended).toEqual([]);
  });
});
