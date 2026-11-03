import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getNextTurnState, INITIAL_TURN_STATE } from './turn-rule.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const VOICE_ON = { type: 'voiceStarted', isTutorSpeaking: true };
const VOICE_OFF = { type: 'voiceEnded' };
const words = (text, isFinal = true, expectsReply = false, isTutorSpeaking = true) => ({ type: 'words', text, isFinal, expectsReply, isTutorSpeaking });
const timer = (name) => ({ type: 'timer', name });

function play(events) {
  let state = INITIAL_TURN_STATE;
  const heard = [];
  for (const event of events) {
    const next = getNextTurnState(state, event);
    state = next.state;
    heard.push(...next.actions.filter((action) => !action.do.endsWith('Timer')).map((action) => action.do));
  }
  return { actions: heard, phase: state.phase };
}

const STORIES = [
  ['a real sentence stops the tutor on its first word', [VOICE_ON, words('Wait, then', false)], ['yield', 'stop'], 'stopped'],
  ['"Wait." with the final after the voice ended still stops', [VOICE_ON, VOICE_OFF, words('Wait.')], ['yield', 'stop'], 'stopped'],
  ['"Wait." with the final after the grace still stops', [VOICE_ON, VOICE_OFF, timer('transcriptGrace'), words('Wait.')], ['yield', 'unyield', 'stop'], 'stopped'],
  ['a word after the late window is left to the next turn', [VOICE_ON, VOICE_OFF, timer('transcriptGrace'), timer('lateWord'), words('Wait.')], ['yield', 'unyield'], 'clear'],
  ['"uh-huh" releases the yield and clears what the SDK held', [VOICE_ON, VOICE_OFF, words('Uh-huh.')], ['yield', 'unyield', 'clearHeldWords'], 'clear'],
  ['a final "uh-huh" before the voice ends releases at the voice end', [VOICE_ON, words('Uh-huh.'), VOICE_OFF], ['yield', 'unyield', 'clearHeldWords'], 'clear'],
  ['an interim "uh-huh" with no final clears at the grace', [VOICE_ON, words('Uh-huh', false), VOICE_OFF, timer('transcriptGrace')], ['yield', 'unyield', 'clearHeldWords'], 'clear'],
  ['a late "uh-huh" still clears what the SDK held', [VOICE_ON, VOICE_OFF, timer('transcriptGrace'), words('Uh-huh.')], ['yield', 'unyield', 'clearHeldWords'], 'clear'],
  ['with the tutor silent, the rule leaves words alone', [words('Yes.', true, false, false)], [], 'clear'],
  ['the tutor finishing releases the yield', [VOICE_ON, { type: 'tutorFinished' }], ['yield', 'unyield'], 'clear'],
  ['reactions clear the 1 s rule while the voice goes on', [VOICE_ON, words('yeah yeah', false), timer('wordlessStop')], ['yield'], 'yielding'],
  ['after a question, "yes" is an answer', [VOICE_ON, words('Yes.', true, true)], ['yield', 'stop'], 'stopped'],
  ['a cough with no words releases the yield', [VOICE_ON, VOICE_OFF, timer('transcriptGrace')], ['yield', 'unyield'], 'clear'],
  ['1 s of sound with no words cuts the tutor, then resumes', [VOICE_ON, timer('wordlessStop'), VOICE_OFF, timer('transcriptGrace')], ['yield', 'stop', 'resume'], 'clear'],
  ['words after the cut cancel the resume', [VOICE_ON, timer('wordlessStop'), words('Wait, why', false), VOICE_OFF, timer('transcriptGrace')], ['yield', 'stop'], 'stopped'],
  ['a reaction after the cut resumes at once', [VOICE_ON, timer('wordlessStop'), VOICE_OFF, words('Mm.')], ['yield', 'stop', 'clearHeldWords', 'resume'], 'clear'],
  ['more sound during the grace keeps the tutor held', [VOICE_ON, timer('wordlessStop'), VOICE_OFF, VOICE_ON, VOICE_OFF, timer('transcriptGrace')], ['yield', 'stop', 'resume'], 'clear'],
  ['no yield while the tutor is silent', [{ type: 'voiceStarted', isTutorSpeaking: false }, VOICE_OFF], [], 'clear'],
];

const rows = STORIES.map(([story, events, expectedActions, expectedPhase]) => {
  const result = play(events);
  return { story, passed: result.phase === expectedPhase && JSON.stringify(result.actions) === JSON.stringify(expectedActions), ...result };
});
const failed = rows.filter((row) => !row.passed);
const summary = { stories: rows.length, passed: rows.length - failed.length, rows };
writeFileSync(join(HERE, 'results', 'turn-rule.json'), `${JSON.stringify(summary, null, 1)}\n`);
console.log(`${summary.passed} of ${summary.stories} stories pass`);
if (failed.length > 0) {
  console.log(JSON.stringify(failed, null, 1));
  process.exit(1);
}
