# Live scene words

What `ASTRA_LIVE_SCENE_WORDS=1` does, how to run it, and what it measured on 5 November 2026. It is off by default on main and on in the demo.

## The shape

A saved scene is a fixed picture. Its moments are nominal times, and `overWords` lands each one on its word, so other words can drive the same picture. So the scene store does not change. `apps/agent/src/scenes/live-words/` writes a `SceneSpeech`, which is a scene's setup, narration, and close for one student, and `tutor-scenes.ts` builds the beats from it in place of the saved words. Nothing else moves: not the take, the moments, the parts, or the cues.

Every picture that reaches a lesson comes through the same `ready` state, so this covers saved scenes, the starter recipes, fresh drawings, and live 3D with no branch on where a scene came from. Their marks are the same marks. A recipe has no close, so its live words have none. The lesson service, which is the stand-in for proofs, stays on saved words, because it does not know its student.

## The call

There is one call for each scene played, started when the scene is matched or when the tutor asks for a scene the queue already holds. If the tutor's reply has written no words yet, the call waits for them, at most 1.5 s, so the new words can carry on from them. A queued scene is not written for ahead of its ask. Its words would no longer follow what was just said, and it may never play. For the same reason, words older than 30 s are not used. A scene asked again after that gets one new call.

The call reads the saved words, what each moment shows, the moment ids, labels, `declared`, `values`, and the only numbers allowed. From the tutor it reads the student's level, interests, notes on this same idea, the last words said, and the student's last line. The voice rules come from the live prompt, so they change with it. The student's id and name are not in it. A note on another idea does not leave the tutor.

`ASTRA_SCENE_WORDS_MODEL` picks the model. The default is `sonnet-5-5`, Sonnet 5.5 with thinking off, and `haiku-5-5` and `gpt-5.4-mini` are the other choices. The tables below are why. The call also reads how many words the saved setup, each moment, and the close use, because a model told only to keep about the same length writes long.

## What code checks

`check-speech.ts` reads every reply, and any problem means the saved words play.

- **Marks.** The same ids, in the same order, each with words of its own, and no words before the first mark if the saved words have none.
- **Numbers.** Every amount, in digits or words, must be in the saved words, `declared`, or `values`. A sign is not read. "One" alone is usually a pronoun, so it counts only in front of a measure or after a word such as minus.
- **Names.** A capital inside a sentence that the scene's words, its plan, its topic, and the student's interests never used is refused, and so is a listed name pair or a run of capitals. Clearing a name would be a second call.
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

Each scene adds about $0.008 of model spending on Sonnet, and $0.002 on `gpt-5.4-mini`, booked through `caps.addScene`, so it counts in the session's spend. A session never kept its voice, so a scene's words were always spoken fresh there, and live words add no characters beyond their length. What changes is who pays. Saved words on a shared scene count as a shared play. Live words are this student's, so they count on the student's own day and session and do not count toward the shared plays. The lesson service's stored lines are not used here.

## Run it

```sh
ANTHROPIC_BASE_URL=<proxy> node apps/agent/src/scenes/proof/scene-words-proof.ts --model sonnet --store <store> --out <file.jsonl> --students 'football|struggled|nothingKnown'
```

`--model` takes `sonnet`, `haiku`, or `openai`, and `openai` reads `OPENAI_BASE_URL`.

The proof makes one call for each scene, from the 4 it names or from `--topics`, plus any named by `--scene`, for 4 students unless `--students` names fewer: football with a line said before the scene, a struggle on this idea, nothing known, and football as the first thing heard. `--limit` keeps the first n scenes. It uses no voice and does not write to the store, and it prints the fallback rate and call times.

## Measured

On 5 November 2026 on Abel's Mac, with load 7 to 14 on 12 cores, from a West African network, through a capped proxy.

**Which model.** The same prompt, 5 scenes for 3 students each. Haiku's refusals were 8 for length, and 4 for opening on "Here's", which it copied from the saved words.

| Model | Fell back to saved words | Call p50 | Call p95 | Cost a call |
| --- | --- | --- | --- | --- |
| Haiku 5.5 | 10 of 15 | 2472 ms | 2863 ms | $0.00036 |
| `gpt-5.4-mini` | 1 of 15, on a number the check caught | 2028 ms | 2527 ms | $0.00166 |

**Claude only.** Later the same day, with load 3 to 6, on the prompt that gives word counts and bans "Here is" and "There's a" even where the saved words use them. The same 5 scenes and 3 students, one run of 15 calls each, Haiku and Sonnet at the same time. "Ready" is the time from the call starting to checked words. "At the real wait" crosses those 15 times with the room each of 20 real scenes had, described under the wait below, and counts a reply that failed its check as a fallback in every scene. The cost is at the repo's prices.

| Model | Failed a check | Ready p50 | Ready p90 | Falls back at the real wait | Cost a scene |
| --- | --- | --- | --- | --- | --- |
| Haiku 5.5 | 9 of 15: 5 for length, 4 for "Here's" | 2082 ms | 2942 ms | 62% | $0.00043 |
| Sonnet 5.5, thinking off | 3 of 15, all for length, all on the rocket | 3303 ms | 3904 ms | 36%: 20% on checks, 16% late. 27% on early saved scenes | $0.0084 |

Every Sonnet reply that passed kept its marks in the saved order. Read by eye, its words for a struggling student and for a student with nothing known held no false line. All of its faults came from the football interest: "It sinks and rises like a ball kicked up and coming back down" for a U, which is the wrong way up, "like a spiral that never wobbles" for Earth's tilt, a likeness the prompt rules out, and "like a winger cutting hard across the pitch" for violet light, which names a player. Haiku said the same wrong thing to a student with no interest at all, "Think of a ball tossed up and caught again. Our curve here is a U shape", and said "through water" of light in a glass prism. That is why Sonnet is the default, and why the interest likeness is the next thing to fix.

**The room a call has.** 20 scenes from 17 real traces. For 15 of the 16 that were not queued, the call already starts within 3 ms of the first moment the scene is known: an early saved scene is known when it starts making, and a drawn one only exists at ready. Starting earlier gains 1 s in the remaining scene, which already had 10.4 s. The room ends 1.5 s after the scene could first land: at the end of the greeting for an early saved scene, and at the next break after the drawing for a drawn one. From the call's start that left 2.1 to 10.4 s, p50 3.9 s, for the 16, and 4.7 to 13.4 s for the 4 queued scenes. At an early saved scene the wait is silence, because the reply's first word waits for the picture.

**Fallback.** 10 of 157 calls to `gpt-5.4-mini`, or 6%, over the prompt's 10 versions and 7 saved, starter, and fresh scenes. 7 were for length, 2 for a banned opener, and 1 for a number. The last version had 4 calls and none fell back. One real lesson fell back too, on a setup 24 words long. Every reply that passed played its marks in the saved order, read from the cues of all 157.

**Timing.**

| Check | Result |
| --- | --- |
| A real Chris run, a moment against its word | p50 4 ms, p95 and worst 22 ms, on 6 cues, against the 100 ms rule. With so few cues a p95 is the worst cue |
| The tone voice, a moment against its word | Worst 4 ms, on 6 cues, 2 lessons |
| A match to ready words | 2.4 s on real Chris. 1.8, 3.3, and 3.3 s on the tone voice: one 3.3 s was a slow call, and the other held 1.5 s for first words an early picture would replace, which no longer happens. In Node, call p50 1.6 to 2.1 s, p95 2.0 to 3.5 s across the versions |
| What a scene waited on its words | 0 ms and 0 ms on a real Chris run and a tone run, 274 ms and 1271 ms on two others. The longest wait allowed is 1.5 s |
| Pressing Start to the picture | 4.7 s on real Chris, and 4.7, 5.7, and 6.3 s on the tone voice. Not measured with the switch off on this code |

A call takes longer than the wait allows. So a scene that could land the moment it is matched, at a pause with nothing to hear, says its saved words. In every lesson here the greeting or a sentence left enough room. A slower call or a shorter greeting would lower that.

**Replay.** On both scenes in Light, 7 seeks forward and back read the same captions at the same second, and they were the live words. The 3D rocket came back in its frame at each seek.

**Voice.** 114 credits for one rocket lesson of 507 characters on `eleven_v4_turbo`, about 0.22 a character.

## What this does not prove

- That Sonnet falls back at most 1 in 10. It falls back about 1 in 3 at the 1.5 s wait, as measured above.
- That the words are true. Code reads marks, numbers, names, and banned lines, and no claim. Sonnet's false lines are above. On `gpt-5.4-mini`, reading a full run of 20 by eye, on the version before the last two, found 2 false lines: "it's a lot of air to outrun" of a rocket in space, and "throwing a ball up is why this rocket needs a big start". It found 2 smaller faults: "Close, but not quite" to a student who had said no such thing, and "the ball turns sideways" for a ball that spins sideways. Nobody reviews live words before a student hears them, as a person's review and the scene review read only the saved words.
- That it sounds personal. On that run it connected to what was said far more often than it used what is known. An interest reached the words in 1 of 10 football cases on that run, and that one was empty: "like a football swerving round a gap". A struggling student sounds much like anyone else. None of the words read as creepy, on any run.
- That the first thing heard is theirs. A lesson opened from Home often has nothing said yet, and on the page the words were close to the saved ones. On the last version, in Node, a football student's first words included "Think of a ball arcing up and back down. This curve is a U shape", and a ball's arc is not a U.
- A crisis on a real page. The check is in tests here, and the budget went elsewhere.
- That a student who comes back in a new job stays on saved words after a safety reply. The rule lasts one room.
