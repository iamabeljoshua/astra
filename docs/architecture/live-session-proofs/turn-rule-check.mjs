import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getNextTurnState, INITIAL_TURN_STATE, TURN_TIMINGS } from './turn-rule.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ON = { type: 'voiceStarted' };
const OFF = { type: 'voiceEnded' };
const THINKING = { type: 'tutorThinking' };
const SPEAKING = { type: 'tutorStarted' };
const FINISHED = { type: 'tutorFinished' };
const QUESTION_HEARD = { type: 'questionHeard' };
const LINK_LOST = { type: 'linkLost' };
const words = (text, isFinal = true) => ({ type: 'words', text, isFinal });
const timer = (name) => ({ type: 'timer', name });
const WORDLESS = `start wordlessStop ${TURN_TIMINGS.wordlessStopMs}`;
const GRACE = `start transcriptGrace ${TURN_TIMINGS.transcriptGraceMs}`;

function describeAction(action) {
  return action.do === 'startTimer' ? `start ${action.name} ${action.ms}` : action.do;
}

function play(events) {
  let state = INITIAL_TURN_STATE;
  const heard = [];
  for (const event of events) {
    const next = getNextTurnState(state, event);
    state = next.state;
    heard.push(...next.actions.filter((action) => action.do !== 'cancelTimer').map(describeAction));
  }
  return { actions: heard, phase: state.phase };
}

const STORIES = [
  ['the timings are the ones the design names', [], [], 'clear', () => TURN_TIMINGS.wordlessStopMs === 1000 && TURN_TIMINGS.transcriptGraceMs === 700],
  ['a real sentence stops the tutor on its first word', [SPEAKING, ON, words('Wait, then', false)], ['yield', WORDLESS, 'stop'], 'stopped'],
  ['"Wait." with the final after the voice ended still stops', [SPEAKING, ON, OFF, words('Wait.')], ['yield', WORDLESS, GRACE, 'stop'], 'stopped'],
  ['"Wait." with the final after the grace still stops', [SPEAKING, ON, OFF, timer('transcriptGrace'), words('Wait.')], ['yield', WORDLESS, GRACE, 'unyield', 'stop'], 'stopped'],
  ['a real word with no voice event stops the tutor, however late', [SPEAKING, words('Gravity.')], ['stop'], 'stopped'],
  ['a real word while the reply is still thinking stops it, so the SDK does not drop the turn', [THINKING, words('It lands twice as far.')], ['stop'], 'stopped'],
  ['a voice already on when the tutor starts yields at once', [THINKING, ON, SPEAKING], ['yield', WORDLESS], 'yielding'],
  ['and its real words then stop the tutor', [THINKING, ON, SPEAKING, OFF, words('It lands twice as far.')], ['yield', WORDLESS, GRACE, 'stop'], 'stopped'],
  ['"uh-huh" releases the yield and clears what the SDK held', [SPEAKING, ON, OFF, words('Uh-huh.')], ['yield', WORDLESS, GRACE, 'unyield', 'clearHeldWords'], 'clear'],
  ['a final "uh-huh" before the voice ends releases at the voice end', [SPEAKING, ON, words('Uh-huh.'), OFF], ['yield', WORDLESS, 'unyield', 'clearHeldWords'], 'clear'],
  ['an interim "uh-huh" with no final clears at the grace', [SPEAKING, ON, words('Uh-huh', false), OFF, timer('transcriptGrace')], ['yield', WORDLESS, GRACE, 'unyield', 'clearHeldWords'], 'clear'],
  ['a late "uh-huh" still clears what the SDK held', [SPEAKING, ON, OFF, timer('transcriptGrace'), words('Uh-huh.')], ['yield', WORDLESS, GRACE, 'unyield', 'clearHeldWords'], 'clear'],
  ['with the tutor silent, the rule leaves words alone', [words('Yes.')], [], 'clear'],
  ['punctuation is not a word', [SPEAKING, ON, words('...', false)], ['yield', WORDLESS], 'yielding'],
  ['the tutor finishing releases the yield', [SPEAKING, ON, FINISHED], ['yield', WORDLESS, 'unyield'], 'clear'],
  ['reactions clear the 1 s rule while the voice goes on', [SPEAKING, ON, words('yeah yeah', false), timer('wordlessStop')], ['yield', WORDLESS], 'yielding'],
  ['"uh-huh" over a question beat does not stop the tutor', [SPEAKING, ON, OFF, words('Uh-huh.')], ['yield', WORDLESS, GRACE, 'unyield', 'clearHeldWords'], 'clear'],
  ['"yes" before the question has been heard is a reaction', [SPEAKING, ON, words('Yes.'), OFF], ['yield', WORDLESS, 'unyield', 'clearHeldWords'], 'clear'],
  ['"yes" once its last word has been heard is an answer', [SPEAKING, QUESTION_HEARD, ON, words('Yes.')], ['yield', WORDLESS, 'stop'], 'stopped'],
  ['a new reply forgets that the last question was heard', [SPEAKING, QUESTION_HEARD, FINISHED, SPEAKING, ON, words('Yes.'), OFF], ['yield', WORDLESS, 'unyield', 'clearHeldWords'], 'clear'],
  ['a cough with no words releases the yield', [SPEAKING, ON, OFF, timer('transcriptGrace')], ['yield', WORDLESS, GRACE, 'unyield'], 'clear'],
  ['1 s of sound with no words cuts the tutor, then resumes', [SPEAKING, ON, timer('wordlessStop'), OFF, timer('transcriptGrace')], ['yield', WORDLESS, 'stop', GRACE, 'resume'], 'clear'],
  ['words after the cut cancel the resume', [SPEAKING, ON, timer('wordlessStop'), words('Wait, why'), OFF], ['yield', WORDLESS, 'stop'], 'stopped'],
  ['a reaction after the cut resumes at once', [SPEAKING, ON, timer('wordlessStop'), OFF, words('Mm.')], ['yield', WORDLESS, 'stop', GRACE, 'clearHeldWords', 'resume'], 'clear'],
  ['a reaction during the cut is cleared before the resume', [SPEAKING, ON, timer('wordlessStop'), words('Mm.'), OFF, timer('transcriptGrace')], ['yield', WORDLESS, 'stop', GRACE, 'clearHeldWords', 'resume'], 'clear'],
  ['more sound during the grace keeps the tutor held', [SPEAKING, ON, timer('wordlessStop'), OFF, ON, OFF, timer('transcriptGrace')], ['yield', WORDLESS, 'stop', GRACE, GRACE, 'resume'], 'clear'],
  ['interim words that never became final resume, so the session does not go silent', [SPEAKING, ON, words('Wait then', false), OFF, timer('transcriptGrace')], ['yield', WORDLESS, 'stop', GRACE, 'resume'], 'clear'],
  ['a final after an interim cancels that resume', [SPEAKING, ON, words('Wait then', false), OFF, words('Wait then why'), timer('transcriptGrace')], ['yield', WORDLESS, 'stop', GRACE], 'stopped'],
  ['no yield while the tutor is silent', [ON, OFF], [], 'clear'],
  ['a dropped link forgets the voice and every timer', [SPEAKING, ON, LINK_LOST], ['yield', WORDLESS], 'clear'],
  ['after a rejoin, real words still stop a tutor who kept speaking', [SPEAKING, ON, LINK_LOST, ON, words('Wait, then', false)], ['yield', WORDLESS, 'yield', WORDLESS, 'stop'], 'stopped'],
];

const REAL_WORDS = 'Wait why';
const REACTION = 'Uh-huh.';

function searchEveryOrder() {
  const violations = { realWordsNotStopped: [], reactionStopped: [], resumeWhileVoiceOn: [], resumeAfterFinalWords: [], stopWhileSilent: [], doubleYield: [], stuckYielded: [], silentForever: [] };
  const seen = new Set();
  let transitions = 0;
  const queue = [{ state: INITIAL_TURN_STATE, armed: [], isYielded: false, isCut: false, hasFinalWords: false, path: [] }];
  const stepTutor = { tutorThinking: 'thinking', tutorStarted: 'speaking', tutorFinished: 'silent' };
  const movesFrom = ({ state, armed }) => [
    state.isVoiceOn ? OFF : ON,
    words(REAL_WORDS, false),
    words(REAL_WORDS),
    words(REACTION, false),
    words(REACTION),
    QUESTION_HEARD,
    LINK_LOST,
    ...Object.keys(stepTutor).filter((type) => stepTutor[type] !== state.tutor).map((type) => ({ type })),
    ...armed.map(timer),
  ];
  while (queue.length > 0) {
    const node = queue.shift();
    const key = JSON.stringify([node.state, [...node.armed].sort(), node.isYielded, node.isCut, node.hasFinalWords]);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const move of movesFrom(node)) {
      transitions += 1;
      const next = getNextTurnState(node.state, move);
      const armed = new Set(node.armed);
      if (move.type === 'timer') armed.delete(move.name);
      let { isYielded, isCut, hasFinalWords } = node;
      // A dropped link hands the cut turn to the reconnect path, so this rule starts clean.
      if (move.type === 'tutorThinking' || move.type === 'tutorStarted' || move.type === 'linkLost') {
        isCut = false;
        isYielded = false;
        hasFinalWords = false;
      }
      const isReplyActive = node.state.tutor !== 'silent';
      const path = [...node.path, move.type === 'timer' ? `timer:${move.name}` : move.type === 'words' ? `${move.text}${move.isFinal ? '' : '(interim)'}` : move.type];
      const hasStop = next.actions.some((action) => action.do === 'stop');
      for (const action of next.actions) {
        if (action.do === 'startTimer') armed.add(action.name);
        if (action.do === 'cancelTimer') armed.delete(action.name);
        if (action.do === 'yield') {
          if (isYielded) violations.doubleYield.push(path);
          isYielded = true;
        }
        if (action.do === 'unyield') isYielded = false;
        if (action.do === 'stop') {
          if (!isReplyActive) violations.stopWhileSilent.push(path);
          isCut = true;
          isYielded = false;
        }
        if (action.do === 'resume') {
          if (next.state.isVoiceOn) violations.resumeWhileVoiceOn.push(path);
          if (hasFinalWords) violations.resumeAfterFinalWords.push(path);
          isCut = false;
        }
      }
      if (move.type === 'words' && move.text === REAL_WORDS) {
        if (isReplyActive && !node.isCut && !hasStop) violations.realWordsNotStopped.push(path);
      }
      if (move.type === 'words' && move.text === REACTION && hasStop && !node.state.isQuestionHeard) violations.reactionStopped.push(path);
      const isAnswer = move.type === 'words' && (move.text === REAL_WORDS || node.state.isQuestionHeard);
      if (isAnswer && move.isFinal && isCut) hasFinalWords = true;
      if (armed.size === 0 && !next.state.isVoiceOn && isYielded && next.state.tutor === 'speaking') violations.stuckYielded.push(path);
      if (armed.size === 0 && !next.state.isVoiceOn && isCut && !hasFinalWords && next.state.tutor === 'silent') violations.silentForever.push(path);
      queue.push({ state: next.state, armed: [...armed], isYielded, isCut, hasFinalWords, path });
    }
  }
  return { statesReached: seen.size, transitions, violationCounts: Object.fromEntries(Object.entries(violations).map(([name, paths]) => [name, paths.length])), shortestViolations: Object.fromEntries(Object.entries(violations).filter(([, paths]) => paths.length > 0).map(([name, paths]) => [name, [...paths].sort((a, b) => a.length - b.length)[0]])) };
}

const rows = STORIES.map(([story, events, expectedActions, expectedPhase, extra]) => {
  const result = play(events);
  return { story, passed: result.phase === expectedPhase && JSON.stringify(result.actions) === JSON.stringify(expectedActions) && (extra?.() ?? true), ...result };
});
const failed = rows.filter((row) => !row.passed);
const search = searchEveryOrder();
const violationTotal = Object.values(search.violationCounts).reduce((sum, count) => sum + count, 0);
const summary = { stories: rows.length, passed: rows.length - failed.length, search, rows };
writeFileSync(join(HERE, 'results', 'turn-rule.json'), `${JSON.stringify(summary, null, 1)}\n`);
console.log(`${summary.passed} of ${summary.stories} stories pass. ${search.statesReached} states and ${search.transitions} transitions searched, ${violationTotal} violations.`);
if (failed.length > 0 || violationTotal > 0) {
  console.log(JSON.stringify({ failed, violations: search.violationCounts, shortest: search.shortestViolations }, null, 1));
  process.exit(1);
}
