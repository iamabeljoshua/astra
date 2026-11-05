# Live scene words

What `ASTRA_LIVE_SCENE_WORDS=1` does, how to run it, and what it measured on 5 November 2026. It is off by default on main and on in the demo.

## The shape

A saved scene is a fixed picture. Its moments are nominal times, and `overWords` lands each one on its word, so other words can drive the same picture. So the scene store does not change. `apps/agent/src/scenes/live-words/` writes a `SceneSpeech`, which is a scene's setup, narration, and close for one student, and `tutor-scenes.ts` builds the beats from it in place of the saved words. Nothing else moves: not the take, the moments, the parts, or the cues.

Every picture that reaches a lesson comes through the same `ready` state, so this covers saved scenes, the starter recipes, fresh drawings, and live 3D with no branch on where a scene came from. Their marks are the same marks. A recipe has no close, so its live words have none. The lesson service, which is the stand-in for proofs, stays on saved words, because it does not know its student.

## The call

There is one call for each scene played, started when the scene is matched or when the tutor asks for a scene the queue already holds. If the tutor's reply has written no words yet, the call waits for them, at most 1.5 s, so the new words can carry on from them. A queued scene is not written for ahead of its ask. Its words would no longer follow what was just said, and it may never play.

The call reads the saved words, what each moment shows, the moment ids, labels, `declared`, `values`, and the only numbers allowed. From the tutor it reads the student's level, interests, notes on this same idea, the last words said, and the student's last line. The voice rules come from the live prompt, so they change with it. The student's id and name are not in it. A note on another idea does not leave the tutor.

`ASTRA_SCENE_WORDS_MODEL` picks the model. The default is `gpt-5.4-mini`, and `haiku-5-5` is the other choice. The table below is why.

## What code checks

`check-speech.ts` reads every reply, and any problem means the saved words play.

- **Marks.** The same ids, in the same order, each with words of its own, and no words before the first mark if the saved words have none.
- **Numbers.** Every amount, in digits or words, must be in the saved words, `declared`, or `values`. "One" alone is usually a pronoun, so it counts only in front of a measure.
- **Names.** A capital inside a sentence that the saved words never used is refused, and so is a listed name pair or a run of capitals. Clearing a name would be a second call.
- **Banned lines.** Anything that says what the tutor holds on a student, such as "since you like" or "last time". The tutor's own banned hype, and any line that claims a feeling, reads like a safety line, or points at an animation.
- **Length and shape.** 0.7 to 1.4 of the saved length, a setup of at most 20 words, a close only if the scene has one, ending on a question, and no bracket, dash, or markup.

Code cannot read a claim. A model can reword a true sentence into a false one with no new number or name, and only the prompt stands against that. The table of what was false below says how often it happened.

## The wait

A scene that could land while its words are being written waits up to 1.5 s, `LIVE_WORDS_WAIT_MS`, and then says its saved words. At a sentence break the student is hearing the tutor, so that wait adds no silence, and the scene takes the next break or pause. At a pause it is the only silence this can add. If the words arrive inside the wait, the scene lands at once.

## Privacy

Nothing here calls the store. The live words live in the beats, which the session's log keeps, and that is how replay shows what was heard. A shared copy of a recipe is made from its plain saved words, before or after any of this. Traces carry the words only under `ASTRA_VOICE_TRACE_WORDS=1`, as they do for every other line, and otherwise carry only the outcome, the problem kinds, the time, and the cost.

## Crisis and stop

`Staying safe` and the safety check are unchanged. After any safety reply the rest of that room hears only saved words, and a call still running is ignored, so no interest of theirs comes near it. No call is made when the student's last line matches the words the tutor treats as maybe about safety. A stop works as before, because a scene's words are ordinary beats.

## Cost

Each scene adds about $0.002 of model spending, booked through `caps.addScene`, so it counts in the session's spend. A session never kept its voice, so a scene's words were always spoken fresh there, and live words add no characters beyond their length. What changes is who pays. Saved words on a shared scene count as a shared play. Live words are this student's, so they count on the student's own day and session and do not count toward the shared plays. The lesson service's stored lines are not used here.

## Run it

```sh
OPENAI_BASE_URL=<proxy>/v1 node apps/agent/src/scenes/proof/scene-words-proof.ts --model openai --store <store> --out <file.jsonl>
```

The proof makes one call for each of 4 saved scenes and any scene named by `--scene` or `--topics`, for 3 students, with no voice and no writes to the store, and prints the fallback rate and call times.
