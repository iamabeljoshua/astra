# PRD v1: a personal AI tutor that teaches out loud on a living board

Status: approved by Abel on 2 November 2026, including the recommendations in section 15. Sections 6.1 and 6.2, the onboarding and home requirements, and P4 record what Abel added with that approval. B11 records the look Abel approved afterward, and then took the particle swarm out of the v1 plan. Abel later set the tagline, the home screen proportions, and normal images in place of dot pictures.
Date: 2 November 2026.
Codename: Astra. The public name is still open (Q1).

## Changes since approval

Abel made these decisions after approving this PRD, and the latest is dated 4 November 2026. Where this table and the body disagree, this table wins. On 4 November the body was corrected where a decision on onboarding, the voice, devices, or 3D had made a line false, and it otherwise reads as approved. `docs/plans/mvp.md` holds the work, and `docs/architecture/live-session.md` holds the reasons for the live session.

| What it overrides | What holds now | Decided |
| --- | --- | --- |
| Q4, Q5, S3, S5, sections 4, 5, and 6.1, on parents | No parent consent, parent alerts, or parent summaries. S1's under-13 rule stays. Section 11's table still describes the law, and a lawyer reviews this before real students. | 4 November 2026 |
| H1, section 6.1 | Onboarding is name, date of birth, class level, interests as a multi-select, a goal, then Home. It has no voice choice and no first exchange with the tutor. | 4 November 2026 |
| Q6 | Sign-in uses a 6-digit email code, not a link. Google stays wired and hidden until credentials exist. | 4 November 2026 |
| Section 2's look row, section 6.1, B11 | Sign-in and onboarding use the look Abel chose, 1 + 4, a dotted Saturn on a star chart on a still dot grid, so the tutor's dot is no longer the only dot. The first line is "Welcome, I am Astra, your personal AI tutor.", and there is no sheet. Pictures stay normal images. | 4 November 2026 |
| P4, Q19 | Home's cards use session history before the learner record exists, in M2.12. Card pictures do not change. | 4 November 2026 |
| Q8, section 9, section 10's paid services, test 4 | ElevenLabs, with Chris as the one voice, not three, chosen by ear on 4 November in place of Casey. Chris stays on Flash unless Abel says otherwise. Muse Voice Transcribe replaces Deepgram, on LiveKit Cloud with a free project until real students. A blind test runs only if Abel still wants one. | 3 and 4 November 2026 |
| Q3, Q13, B3, tests 1 and 3 | Laptop first. Rich scenes target laptops and may require a laptop browser, and phones must not block them. Existing pages keep working at phone width, and a mobile app may come later. | 4 November 2026 |
| Section 8, on sharing scenes | Scenes shared across students come only from the server's own topic list. A typed question's scene stays with that student until a person or a moderated step promotes it. The review is a strict filter and not a truth gate, so "Not yet checked by a person" stays. | 4 November 2026 |
| Q11, on what is prepared | No worker prepares scenes from recommendations before a student arrives, which is post-MVP. Writing next scenes inside a running lesson stays. One curated library of 133 scenes is written once, after M3.14, for about $10 by estimate, with automatic review on every scene and a sample Abel checks. Everything else gets written the first time a student needs it, then saved. | 4 November 2026 |
| Q9 | Sonnet 5.5 runs live turns, with code reacting first and no talking router for now. | 3 November 2026 |
| V1 | Two numbers replace 800 ms and 1.5 s. A first reaction under 200 ms from code, and a first real word as fast as the vendors allow. | 3 November 2026 |
| V2 | The 150 ms runs from the agent's decision to stop, with two limits from the student's first sound, as the live session design says. | 3 November 2026 |
| Q10, Q11, section 8, B5 | The typed scene language stays for the 2D board. Rich scenes are best effort, through one scene command. Voice and the 2D board never wait for a scene, a scene shows only when it is ready and checked, and a scene not ready after about 20 s is dropped from that lesson and saved, with no spinner. On a new question the tutor starts with words and simple 2D, then brings in 3D at a pause. ManimGX takes symbols, plots, grids, flat maps, and code, and our kit takes solid things a camera could film, chosen by a router. Python runs only on a server in a locked container, and the browser plays a stored take. Section 14 still holds, because a scene is code we render, not generated video. | 3 and 4 November 2026 |
| B4, T6, for generated scenes | B4's deck does not hold for generated scenes, and their numbers can come from the model. M3.14 states what replaces both. | 3 November 2026 |
| B8 | Typed work and tasks from the tutor come first, on the shared board in M3.12. Ink and uploads follow in M3.11. | 3 November 2026 |
| Section 8's data shape | Commands sit inside the sentence, not `say` plus `cues` with word counts. | 3 November 2026 |
| Section 10 | The live session design's cost table replaces this one. | 3 November 2026 |

## 1. Summary

A student signs up, tells us what they love and what they already know, and types anything they want to learn. The page fades into a board, and a tutor starts talking. It listens, and the student can interrupt it at any moment. As it speaks, equations rearrange, graphs draw themselves, and forces appear on a board, each in time with its words. It asks before it tells, walks the student to the answer, and remembers them next time.

v1 is a free closed beta for about 100 invited students, ages 13 and up, worldwide. The beta must prove two things. Students learn more, measured by a test one week later. Students come back without being asked.

Aristotle, the closest competitor, already has voice, memory, a shared whiteboard, and interest-based examples, so those features only bring us level. We compete on three things it does not appear to have: a board that moves in time with speech, a tutor with a distinctive presence, and published learning results.

Section 15 lists 21 questions and the recommendation accepted for each. Only Q1 stays open.

## 2. Decisions already made

| Decision | Choice | What it commits us to |
| --- | --- | --- |
| First student | Anyone 13 and up, worldwide | Minors from day one and no under-13s. Section 11 applies in full. |
| Shape of v1 | Free closed beta | About 100 invited students, no billing, and a budget of about $2,000 a month. |
| Tutor on screen | The living dot | No face and no character. The human feel comes from voice and behavior. |
| Visual that must be world class | Living explanations | Animated math and diagrams, rendered live and timed to speech. Simulations and hand drawing exist in simpler form. |
| Stack | React with Vite for the web app, and NestJS with Postgres for the API | `docs/plans/mvp.md` builds on this. |
| Look | Light and warm by default with a dark toggle, a lighter take on SpaceX, with no gradients | Pictures are normal images. Sign-in and onboarding draw a dotted Saturn on a star chart, and elsewhere the only dot is the tutor's presence. `docs/DESIGN.md` records the rules. |

## 3. Evidence shapes four product rules

**Giving answers harms learning.** In a [PNAS field experiment](https://papers.ssrn.com/abstract=4895486) with nearly 1,000 high school math students, unguarded GPT-4 raised practice scores. Once access ended, those students scored 17% lower than students who never had it. A version with tutoring safeguards largely removed the harm.

**A structured AI tutor can beat good teaching.** In a [randomized crossover trial](https://www.iatrox.com/blog/harvard-ai-tutor-trial-what-it-showed-question-banks) with 194 Harvard physics students, students learned more than twice as much as in an active-learning class. They took a median of 49 minutes against 75. The tutor revealed one step at a time and received correct solutions in advance to prevent errors. The trial covered two topics, one course, and short-term tests. Its result does not automatically transfer to a tutor that accepts any topic with no prepared solutions.

**It can work outside elite settings.** A [World Bank evaluation in Edo State, Nigeria](https://blogs.worldbank.org/en/education/From-chalkboards-to-chatbots-Transforming-learning-in-Nigeria) reports gains of about 0.3 standard deviations from a six-week after-school program. That program had teacher support, which a solo app does not.

**Level matters more than interests.** A [meta-analysis of personalized learning in low and middle income countries](https://edtechhub.org/?p=61468) found an effect of 0.18 overall and 0.35 for approaches that adapt to the learner's level. That is significantly more than approaches that only link to interests or provide personalized feedback and support. A [2026 paper](https://arxiv.org/pdf/2602.15876) warns that shallow personalization can raise interest without raising learning.

These findings give us four rules:

- The tutor never hands over the answer early.
- The tutor always knows the correct answer through a computation or a checked source.
- Level and misconceptions drive the teaching.
- Interests make the teaching feel personal, but they do not replace it.

No study we found tests whether an animated board beats a static one. The beta tests it directly (section 12).

## 4. Aristotle is the benchmark, and the board is where we beat it

Aristotle [announced a $5 million seed round and nationwide launch](https://digidai.github.io/2026/09/17/aristotle-ai-tutoring-hours-learning-outcomes/) on 16 September 2026. [Its pricing](https://heyaristotle.com/pricing) is three free one-hour sessions, $49 a month for 8 sessions, and $199 a month for unlimited sessions. [Its homepage](https://heyaristotle.com) reports 5,639 sessions and 103,569 minutes, which works out to about 18 minutes a session. Those counters have no published definitions.

| Capability | Aristotle today | Our v1 position |
| --- | --- | --- |
| Live voice with interruption | [Yes](https://heyaristotle.com/voice-ai-tutor) | Match, and measure latency. |
| Socratic teaching, misconception analysis | [Claimed](https://heyaristotle.com/blog/why-ai-chatbots-make-bad-tutors) | Match, and add a firm rule for dead ends (T3). |
| Memory and a prerequisite map | [Claimed](https://heyaristotle.com/blog/why-ai-chatbots-make-bad-tutors) | Match. |
| Examples from student interests | Launch film turns a Minecraft sword into an equation | Match. This is not a differentiator. |
| Student writes on the board, uploads PDFs and photos | [Yes](https://heyaristotle.com/voice-ai-tutor) | Match. |
| Board | Launch film shows a flat white page with equation tiles, pasted images, and a cursor. The site mentions steps, diagrams, and images, and never mentions animation. | **Beat.** Living explanations timed to speech. |
| Presence | An apple mascot that moves around the board | **Differ.** The living dot. |
| Learning evidence | [None published, per one independent review](https://digidai.github.io/2026/09/17/aristotle-ai-tutoring-hours-learning-outcomes/). Its research page describes planned work. | **Beat.** Publish the beta's delayed-test results. |
| Audience | Ages 13 to 18, sold to parents | **Differ.** Anyone 13 and up, led by the student. |
| Subjects | [65 listed](https://heyaristotle.com), deepest in math and science | Any topic accepted, deepest in math and physics (Q2). |
| Parent tools | Dashboard and session reviews | Consent and a short summary only (Q5). |

This table has a limit. It rests on Aristotle's site, frames from its launch film, and one third-party review. Nobody on our side has used the product, and a launch film may not match the live board. Before the plan locks, use one of the three free sessions to confirm the board row.

General assistants compete too. [ChatGPT Study Mode is available on every plan, including Free](https://echai.ventures/how-founders-use-ai/learning-with-ai/which-ai-assistants-have-a-study-or-learning-mode-and-how-do-i-turn-it-on), per a secondary source. [Gemini Guided Learning adds images, diagrams, videos, and quizzes](https://techcrunch.com/2025/08/06/google-takes-on-chatgpts-study-mode-with-new-guided-learning-tool-in-gemini/). [Penseum](https://www.producthunt.com/products/penseum/launches/penseum-2), [Learnogram](https://betalist.com/startups/learnogram-ai), and [Mindjoy](https://docs.mindjoy.com/en/articles/12890804-using-voice-mode-in-a-tutor) also market voice with a canvas or whiteboard. Voice plus a canvas cannot be our pitch, because it is becoming the standard.

## 5. Three kinds of student share one product

| Student | What they come for | What changes for them |
| --- | --- | --- |
| Ages 13 to 17 | Class, homework, exams, curiosity | Parent consent, stricter data defaults, and break reminders (section 11). |
| University | Coursework and exam rescue | Faster pace and more uploaded material. |
| Adult learner | A new field, a career move, curiosity | Concept mode more often, no parent step. |

The onboarding answers change the tutor's vocabulary, pace, and examples. They do not create separate products.

## 6. The experience, start to finish

### 6.1 Onboarding takes under two minutes

Onboarding is the first time a student meets the tutor, so it gets the same craft as the session. Sign-in and onboarding share one calm page, a dotted Saturn on a star chart on a still dot grid. The tutor's first line is "Welcome, I am Astra, your personal AI tutor." Each screen asks one thing, and the chart answers it, with no sheet beside it. The chart's title reads "A learning app, made for you", and it takes the student's name once they type it. The last screen opens Home.

1. The student signs in with a 6-digit email code (Q6).
2. The student gives a name, and it forms in dots as they type.
3. The student enters a date of birth. A student under 13 stops here and cannot retry.
4. The student states their class level.
5. The student answers "What are you into?" with picks, and each pick lights a star on the chart.
6. The student states what brings them here, and a Start button opens Home.

### 6.2 The home screen offers cards, a prompt, and every past session

A student lands here after onboarding and on every return. A modest greeting opens the screen, at the proportions of Aristotle's logged-in home, with these parts around it.

- **Cards.** Four to six compact cards offer topics, and selecting one starts a session on that topic at once. At launch they are pre-made cards chosen by level and interests. As evidence builds, they are recommended from the student's performance and weaknesses. Each card states its reason, such as "You got stuck on free-body diagrams on Tuesday" or "How a curveball bends, because you follow baseball". A larger "continue" card comes first when a session is unfinished, and it shows a drawing from that session's board.
- **The chat box.** A ChatGPT-style chat box is pinned to the bottom of the screen, below the cards, and the greeting above asks "What do you want to learn next?". The student can type or speak a topic, a question, or a problem, and can attach a photo or PDF. Submitting starts a new session based on what they wrote.
- **The menu.** The menu holds Home and Sessions at launch, with the student's account at the bottom. Sessions lists every session with its title, date, length, and status, so the student can continue or replay any of them. Later items, such as Progress or Library, add a row without changing the layout. The menu shows no placeholder items.

### 6.3 The session opens on the dot

When the student submits, the full stop of their typed line becomes the dot, which is the ending of the Portal trailer made interactive. The page then fades into the board, and the dot stays as the tutor. This takes two to three seconds, and the model prepares its lesson plan in that time. The tutor's first word plays within three seconds of submit.

### 6.4 A session sounds like this

The student plays point guard and asked about projectile motion.

| Tutor says | Board does | Student does |
| --- | --- | --- |
| "You said you play point guard, so let's use your jump shot. Once the ball leaves your hand, what's still pushing it toward the hoop?" | The board draws a side view of a hoop and a ball at the release point. | "Uh, my hand?" |
| "Your hand, right up until it lets go. After that?" | A forward arrow appears on "hand" and fades on "lets go". The dot moves to the ball. | Stays silent for six seconds. The tutor waits. "Nothing?" |
| "Nothing. So its sideways speed never changes. Watch this arrow." | The ball follows a computed arc. The sideways arrow holds its length. The vertical arrow shrinks and flips. | Interrupts: "Wait, then why does it come down?" |
| Stops mid-word. "Good question. What's pulling on it the whole time?" | The ball freezes on the frame the student interrupted. | "Gravity." |
| "Gravity. Now you drive. If you double the sideways speed and leave the upward speed alone, where does it land?" | A slider appears, with a faint ghost arc. | Drags the slider. "Twice as far." |

### 6.5 Two teaching modes cover real requests

Problem mode asks first and reveals steps one at a time. Concept mode explains in short spoken bursts and checks understanding every 60 to 90 seconds. This refines the brief, because a student who asks "How do black holes form?" has nothing to reason from yet. Questioning that student from the first second would feel like a quiz. The tutor picks the mode and changes it during the session when it needs to.

### 6.6 The session ends with proof and a next step

The tutor gives a 30-second spoken recap while the board replays its key moments. The student answers one check question alone. The student can reopen any past session and scrub through the board with captions. Seven days later, a two-minute check measures what stuck and feeds the next recommendation.

## 7. Requirements

All requirements are needed for the beta unless marked otherwise. The numeric targets are proposals, to be confirmed by the tests in section 13.

### Onboarding and home

- **H1.** A new student reaches Home in under two minutes, with one question per screen.
- **H2.** Selecting a card and submitting the prompt both start a session within the limit in section 6.3.
- **H3.** The Sessions list shows every session, newest first, and each one opens to continue or replay.
- **H4.** Adding a menu item is a one-line change to one list.
- **H5.** Light mode is the default, dark mode is one click away, and the choice persists.
- **H6.** All app strings, including the product name, live in one module, so changing the name is a one-line change.

### Tutor behavior

- **T1.** In problem mode, the tutor does not state the final answer until the student has attempted it. It reveals one step at a time.
- **T2.** If the student demands the answer, the tutor encourages one attempt first, then gives it, then sets a near-identical problem for the student to solve alone.
- **T3.** After two failed probes on one point, the tutor shows the next step on the board and hands back a near-identical problem. The student never hears a third question in a row on the same point.
- **T4.** A spoken turn runs at most 20 seconds before the student gets a chance to respond. The student speaks or acts for at least 35% of session time.
- **T5.** After a question, the tutor waits at least 8 seconds without prompting. Words such as "hmm, let me think" do not end the student's turn.
- **T6.** All arithmetic, algebra, plotted values, and simulated motion come from a computation tool. The model's own text never supplies them.
- **T7.** The tutor says when it is unsure and shows a source for factual claims on request (Q18).
- **T8.** The tutor refers to specifics from earlier sessions where they help. The student can see and delete what it remembers.
- **T9.** Interests appear only where the analogy is correct. The student can turn them off.
- **T10.** The tutor writes for the ear, with short sentences, contractions, small reactions, and math spoken as a person would say it.

### Voice and captions

- **V1.** From the end of student speech to the first tutor audio, latency is at most 800 ms at p50 and 1.5 s at p95 on a good connection in a browser. [One published guide](https://www.forasoft.com/blog/article/voice-ai-agents-livekit-guide) reports 550 to 700 ms at p50 for tuned builds and 1.2 to 1.4 s at p95 for untuned ones.
- **V2.** On interruption, speech and board both stop within 150 ms. A backchannel such as "uh-huh" stops neither.
- **V3.** Captions highlight each word as it plays and show the student's words too. A student can complete a full session with typing and captions alone, with no microphone or speakers.
- **V4.** Speech recognition is measured on each invited region's accents and on math vocabulary such as "x squared over two" before that region's invitations go out.
- **V5.** If the connection drops, the tutor pauses and resumes where it stopped. On a weak connection, audio takes priority over visual quality.

### The board

- **B1.** Each visual starts within 100 ms of the word it is tied to.
- **B2.** A turn's first visual appears within one second of its first word.
- **B3.** The 2D board runs at 60 fps on a mid-range laptop and at least 30 fps on a mid-range phone, with quality tiers below that (Q13). Rich scenes target laptops and may require a laptop browser (Q3).
- **B4.** A test deck of 100 scripted scenes produces zero overlaps, overflows, or clipped elements under automated checks.
- **B5.** The launch library covers equations with term-by-term transforms, function plots, number lines, geometry constructions, vectors and free-body diagrams, computed motion with sliders, labeled diagrams, tables, timelines, code blocks, and images from licensed or public-domain sources.
- **B6.** The player can stop, rewind one beat, and resume, and the board stays consistent.
- **B7.** Any session replays exactly from its stored event log, with no stored video.
- **B8.** The student can draw and write on the board and upload photos and PDFs. The tutor can read them and respond.
- **B9.** The dot pulses with speech, moves to the element under discussion, draws strokes, and rests while listening. The board stays still while the student reads. The v1 plan does not include a particle swarm. Morphing and other effects are fine where they help the lesson or the experience, as with an equation rearranging term by term.
- **B10.** The board honors the reduced-motion setting and never flashes more than three times a second.
- **B11.** The product follows `docs/DESIGN.md`. A warm light theme is the default, and a toggle switches to dark. Both themes exist from the first UI PR.

### Personalization

- **P1.** The tutor gauges level in conversation during the first minute and does not run a test.
- **P2.** Each student has a learner record of concepts with a status, the evidence behind it, and known misconceptions. It updates after each session.
- **P3.** When a student is stuck, the tutor traces the difficulty back to a prerequisite and teaches that first.
- **P4.** At launch, cards come from a pre-made library filtered by level and interests. As the learner record fills, cards rank by performance and weaknesses. Each card states its reason.

Safety and data requirements are in section 11.

## 8. Rendering engine: the tutor describes, the engine draws

This is the main technical bet. It is a recommendation, not a final decision. High-level architecture is on the stop list in `CLAUDE.md`, so the architecture step returns to you before implementation.

### The four options

| Option | How it works | Time to first visual | Interruptible | Verdict |
| --- | --- | --- | --- | --- |
| A. Server-rendered video | The model writes Manim code and a server renders it. This is the `agentic-tutor` path. | Minutes. That project held requests open for up to 50 minutes. | No. A video cannot change once rendered. | Reject for live teaching. |
| B. Whiteboard SDK with agent tools | The model creates shapes in a product such as tldraw, which your earlier plan chose. | Instant | Yes | Reject as the renderer. Shapes are its strength, and animation is the visual we chose to win on. Its [production license is quoted by sales](https://tldraw.dev/pricing). |
| C. Model writes code per scene | The model generates HTML and JavaScript that runs in a sandbox. | [A minute or more](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/) in Google's November 2025 report. | Only if each scene adds support for it | Slow path only. It ships in v1 as best-effort rich scenes that never hold up the lesson (Q11). |
| D. Typed scene language with our own renderer | The model emits semantic commands, and the browser renders them from a house library. | Instant | Yes, by design | **Recommended.** |

### Why option D

The tutor never places pixels. It says what to show and when, and the engine decides layout, motion, type, and timing. Your earlier plan named layout errors as the main failure of generated animation, and under option D the model has no way to produce one. Numbers come from computation, so plots and motion are correct. Every scene carries one visual style, which makes the board recognizable. Sessions send small commands, not video, so a weak connection can carry them.

The cost is coverage, since the engine shows only what the library contains. Three things limit that cost. The library targets the deep subjects first (Q2), it can grow continuously, and the board can always fall back to text, diagrams, and ink.

### The data shape

A turn is an ordered list of beats. Each beat pairs one spoken phrase with cues that fire on named words. This keeps the sync insight from `agentic-tutor`, where narration and visuals were authored together so timing was correct by construction, and moves it from a video render to a live player. The sketch below is illustrative, and the architecture step owns the final types.

```ts
type Beat = { id: BeatId; say: string; cues: Cue[] };
type Cue = { atWord: number; command: SceneCommand };
type SceneCommand =
	| { kind: "writeMath"; id: ElementId; tex: string }
	| { kind: "transformMath"; from: ElementId; to: ElementId; tex: string }
	| { kind: "plot"; id: ElementId; expression: string; domain: [number, number] }
	| { kind: "simulate"; id: ElementId; model: SimulationModel; parameters: Parameters }
	| { kind: "focus"; target: ElementId };
```

```text
Student speech -> speech recognition -> tutor model -> ordered beats
                                                        |-- say  -> TTS -> audio + word timestamps
                                                        '-- cues -> scene player in the browser

The player fires each cue when the audio reaches its word.
Interruption cancels the audio and the player together.
Board state is rebuilt from a log of the events that actually played.
The model's next turn is told exactly what the student heard and saw.
```

The stored event log also provides replay (B7) and the static-board comparison in the beta (section 12).

### The layers

1. **The dot.** A small element for the tutor's presence. It needs no particle engine, so it adds almost nothing to the board's frame budget. The swarm in `content-videos/made-of-dots` is not in the v1 plan.
2. **Explanations.** Math, plots, vectors, and computed motion, with equations that morph term by term. [Manim-Web](https://hn.svelte.dev/item/47155375) and [ecmanim](https://github.com/johnhenry/ecmanim) show that browser rendering is possible. Manim-Web's author says parity is still in progress, and commenters report flicker and fuzzy text. Treat them as references, and let test 1 decide whether any of their code is worth adopting.
3. **Ink.** Student and tutor strokes, with a natural freehand look.

Generative video stays out of teaching. Your earlier plan's rule holds. Generated pixels can carry mood, and code-rendered pixels carry truth.

### Rich scenes come when they are ready

Option D runs the 2D board. Rich scenes sit on top of it as best effort, because a student must never be stuck waiting. Voice and the 2D board never wait for a scene, and a scene shows only when it is ready and checked. On a new question the tutor starts with words and simple 2D, setting up what the scene will show, then brings in 3D at a pause. Cards and planned scenes open on 3D where one is ready. A scene not ready after about 20 s is dropped from that lesson and saved. There is no spinner.

Two engines draw these scenes, and a router chooses. ManimGX takes symbols, plots, grids, flat maps, and code. Our kit takes solid things a camera could film. Python runs only on a server in a locked container, and the browser plays a stored take on the board's clock, so it stops, seeks, and replays with the board. This is not option A, because the lesson never waits for a take.

Scenes shared across students come only from the server's own topic list. A typed question's scene stays with that student until a person or a moderated step promotes it. The review is a strict filter and not a truth gate, so a scene says "Not yet checked by a person" until a person checks it.

No worker prepares scenes from recommendations before a student arrives. One curated library of 133 scenes is written once, and everything else gets written the first time a student needs it, then saved. Inside a running lesson the next scenes are still written ahead, because the student is there.

## 9. Voice: a normal model turn, with the voice chosen by ear

### Cascaded pipeline over speech-to-speech

| | Cascaded (speech recognition, then model, then TTS) | Speech-to-speech ([GPT-Live, gpt-realtime, Gemini Live](https://getstream.io/blog/speech-apis/)) |
| --- | --- | --- |
| Word timestamps for board cues | [Documented in Cartesia's API](https://docs.cartesia.ai/api-reference/tts/websocket) | Not verified. This decides the choice. |
| Tutor brain | A normal model turn that we can evaluate and swap | Tied to the vendor's model or a hand-off |
| Voice choice | Any TTS provider | The vendor's voices |
| Latency | 550 to 700 ms at p50 when tuned, per the guide cited in V1 | About 200 ms of model latency, with real voice-to-voice nearer 800 ms over phone networks, per the same guide |
| Cost per minute | Section 10 | [$0.05 for the GPT-Live voice layer, with its backend model billed separately](https://tech-insider.org/openai-realtime-api-gpt-live-1-setup-2026/), [about $0.05 for gpt-realtime-2.1 before cache misses](https://www.layer3labs.io/guides/openai-realtime-api-pricing), and [about $0.005 in and $0.018 out for Gemini 3.8 Live](https://tech-insider.org/openai-vs-google-vs-qwen-voice-ai-apis-2026/). All three come from secondary sources. |

The recommendation is a cascaded pipeline on [LiveKit Agents](https://www.forasoft.com/blog/article/voice-ai-agents-livekit-guide), which handles interruption and audio-based turn detection. Gemini Live's price is attractive enough that it should join test 4 as a benchmark. If it can deliver accurate word timing, reopen this choice.

### The TTS shortlist

| Provider | Why it is on the list | Listed price |
| --- | --- | --- |
| Cartesia Sonic-3.6 | Word timestamps and cancel documented, built for low latency | [$38 to $65 per 1M characters by plan](https://www.cartesia.ai/pricing) |
| ElevenLabs Eleven v4 Turbo | Well known for voice quality | [About $40 per 1M characters](https://www.forasoft.com/blog/article/voice-ai-agents-livekit-guide) |
| Inworld Realtime TTS | [Reported at the top of one quality ranking, built for personas](https://www.coval.ai/blog/best-text-to-speech-providers-in-2026-how-to-choose-(and-why-vendor-benchmarks-lie)/) | Tier-based, not listed |

Vendor latency claims and third-party numbers disagree, so we measured the vendors ourselves, with word timestamps and cancel as entry requirements. Abel chose ElevenLabs on 3 November, then chose the voice by ear on 4 November. The voice is Chris, on Flash. Flash replaces the v4 Turbo row above, because v4 Turbo needs the dialogue socket and restarts its word times at 0 in each message. A blind test with students runs only if Abel still wants one.

Launch with one voice. Use no cloned voices of real people. The tutor's human quality depends more on what it says and when it stops than on the voice itself (T4, T5, T10).

## 10. Cost: about $0.08 to $0.15 a minute, within the beta budget

These are estimates. The token counts and talk ratios are assumptions until test 2 measures them. Model prices come from Anthropic's table as cached on 6 October 2026. Cache writes on Sonnet and Opus are assumed at 1.25 times input, and Haiku is modeled without caching as an upper bound.

| Cost per session minute | Assumption | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
| --- | --- | --- | --- | --- |
| Tutor model | 3 turns a minute, 15,000 cached and 1,000 new input tokens, 400 output tokens. Opus adds 200 thinking tokens. | $0.005 | $0.029 | $0.060 |
| TTS | 500 characters a minute at $45 per 1M | $0.023 | $0.023 | $0.023 |
| Speech recognition | [Deepgram Nova-3 list price](https://www.forasoft.com/blog/article/voice-ai-agents-livekit-guide) | $0.008 | $0.008 | $0.008 |
| Real-time transport | [LiveKit Cloud](https://www.forasoft.com/blog/article/voice-ai-agents-livekit-guide) | $0.010 | $0.010 | $0.010 |
| Background work | Lesson plan, safety checks, board reading, session analysis. This is a guess. | $0.012 | $0.012 | $0.012 |
| **Subtotal** | | **$0.058** | **$0.081** | **$0.112** |
| **With a 30% buffer** | Retries, silence, and tool loops | **$0.075** | **$0.105** | **$0.146** |
| 30-minute session | | $2.25 | $3.15 | $4.38 |
| Beta month | 100 students, 4 sessions, 30 minutes, for 12,000 minutes | $899 | $1,259 | $1,750 |

Adding about $200 for hosting (a guess) keeps the highest case at about $2,000 a month, which sets the budget. Usage above the assumed four sessions needs a cap (Q14).

**Paid services this implies.** The beta needs Anthropic, LiveKit Cloud, Muse Voice Transcribe, ElevenLabs, and hosting. Paid services are on the stop list, so approving this PRD does not approve them. The plan must name each one for your go. Legal review (section 11) is not in the budget, so get a quote.

## 11. Safety and compliance: 13 and up worldwide means minors on day one

This is a product summary, not legal advice. Many rows rest on secondary sources, and counsel must confirm them before any under-18 invitation goes out.

| Where | Rule | What it means for us |
| --- | --- | --- |
| US, federal | [COPPA's amended rule](https://www.akingump.com/en/insights/ai-law-and-regulation-tracker/new-coppa-obligations-for-ai-technologies-collecting-data-from-children) covers under-13s, and its [compliance date was 22 April 2026](https://www.loeb.com/en/insights/publications/2025/05/childrens-online-privacy-in-2025-the-amended-coppa-rule). | Keep under-13s out with a neutral age gate. |
| US, states | [California SB 243](https://fpf.org/blog/understanding-the-new-wave-of-chatbot-legislation-california-sb-243-and-beyond/) covers adaptive, human-like chatbots that can meet social needs and sustain a relationship. The source we read does not say whether tutors are covered. New York, Utah, and Maine also require AI disclosure. | A tutor built to feel human and remember the student could be argued into scope. Build as if covered (S2 to S4). |
| EU | [GDPR Article 8](https://gdpr-info.eu/art-8-gdpr/) requires parental consent under 16, and member states may lower that to 13. [AI Act Article 5(1)(f)](https://artificialintelligenceact.eu/article/5/) bans inferring emotions in education institutions. Education uses that evaluate learning outcomes are high-risk, with [obligations deferred to 2 December 2027](https://cdp.cooley.com/digital-ai-omnibus-delays-key-deadlines-introduces-new-rules/). | Infer no emotions from voice or camera. Counsel must say whether our learner record counts as evaluating learning outcomes. |
| UK | The [Children's Code](https://en.wikipedia.org/wiki/Age_appropriate_design_code) covers services likely to be accessed by under-18s, including non-UK services with UK users. It requires high-privacy defaults and limits profiling and engagement nudges. | No streak pressure for minors. Counsel must review the learner record. |
| Nigeria | [Data Protection Act section 31](https://uubo.org/document/personal-data-of-a-minor-what-you-must-know) requires guardian consent for under-18s, with age verification. | The parent consent step applies. |
| India | [DPDP Rules](https://www.livelaw.in/amp/top-stories/digital-personal-data-protection-rules-2025-notified-309928) require verifiable parental consent under 18. [One summary](https://www.ey.com/content/dam/ey-unified-site/ey-com/en-in/pdf/2025/11/ey-india-dpdp-act-2023-and-rules-2025-pov.pdf) says they prohibit behavioral monitoring of children, with limited exemptions for educational institutions. | The learner record may conflict with this. Do not invite Indian minors until counsel clears it. Commencement dates are unverified. |
| Model providers | [Anthropic](https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors) requires AI disclosure and legal compliance stated publicly, recommends age checks, moderation, and monitoring, and audits. [OpenAI](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance) requires age-appropriate content and may audit. | These apply to any model we choose for live teaching. |

### Product requirements

- **S1.** A neutral date-of-birth gate blocks under-13s. If we learn that a user is under 13, we close the account and delete the data.
- **S2.** The tutor states that it is an AI at signup and at each session start, and again after every three hours of continuous use.
- **S3.** A separate check reviews every student and tutor turn. A self-harm signal stops the teaching, shows local help resources, and creates a flag. People review all flags within 24 hours, and confirmed concerns about a minor can reach a parent. [Aristotle describes a similar process](https://digidai.github.io/2026/09/17/aristotle-ai-tutoring-hours-learning-outcomes/). Someone must staff this (Q20).
- **S4.** The tutor stays a tutor. It claims no feelings or friendship, never engages romantically, never encourages secrecy, and nudges minors to take breaks.
- **S5.** Raw audio is processed live and not stored. Transcripts and board events persist while the account is active, and the student or parent can delete them (Q15).
- **S6.** The product has no ads, no data sales, and no model training on under-18 data. Adults opt in to any training use.
- **S7.** The product uses no camera, no voiceprints, and no emotion inference. The tutor understands a student through their words, pauses, answers, and ink (Q17).

## 12. The beta passes on learning and return

These thresholds are proposals, not benchmarks. Report the results either way.

| Question | Measure | Target |
| --- | --- | --- |
| Do students learn? | Gain from pre-test to a test seven days later, on the same concept | Normalized gain of at least 0.3 |
| Does the living board matter? | Each student learns two comparable concepts at random, one with the living board and one with final frames only. Compare seven-day scores. | Living board ahead. With about 100 students, read this as a direction, not proof. |
| Do they come back? | Unprompted second session within 7 days, and activity in week 4 | At least 40%, and at least 25% |
| Does it hold attention? | Median session length | At least 15 minutes |
| Does it feel like a real tutor? | Post-session rating | At least 4.7 out of 5, Aristotle's [reported](https://heyaristotle.com) average |
| Is it correct? | Math errors in an audited sample | At most 1 per 200 minutes |
| Does it teach instead of tell? | Answer leaks and dead ends under T1 and T3 in sampled sessions | Under 2% of exchanges, and zero |
| Is the craft there? | V1, V2, B1, and B3 from real sessions, and reported board defects | Requirements met, and at most 1 defect per 100 scenes |
| Is it safe? | Flags reviewed within 24 hours | 100% |
| Can it pay for itself? | Cost per session minute, and paid conversion at the end (Q21) | At most $0.15, and at least 20% of active students |

## 13. Five short tests settle the factual unknowns

These are throwaway experiments that answer factual questions. They are not a build plan. They run first once you approve this PRD and allow the paid accounts they need.

1. **Scene player.** Run scripted beats with real TTS in a browser, on a laptop and at phone width. Pass means B1, B2, B6, and V2 are met.
2. **Tutor model.** Test whether Opus 5.5 at low effort, Sonnet 5.5, and Haiku 5.5 can stream valid beats within V1, scored on an evaluation of 30 scripted student turns. Measure real token counts here. Opus 5.5 and Sonnet 5.5 return text between tool calls as thinking-block progress updates, so speech interleaved with tool calls would not stream as text. Beats should arrive as one ordered structure.
3. **Board in real time.** Measure the board's frame rate against B3, in both light and dark themes, on an older laptop and, for the 2D board, a budget Android phone.
4. **Voice.** Run the Gemini Live benchmark and speech recognition tests on accents from each invited region. The blind TTS test runs only if Abel still wants one.
5. **Five students, one human tutor.** A person drives the scene player behind the tutor's voice for five real students. This tests whether the living board changes attention and understanding before the full system exists. Your earlier plan proposed the same test.

## 14. Out of scope for v1

- Users under 13.
- Billing, beyond one payment link at the end of the beta.
- Native iOS and Android apps.
- Classrooms and teacher tools.
- A face or a character for the tutor.
- Camera input.
- Generated video or images used to teach.
- Group sessions.
- Exam curricula and long-term study plans.
- A full parent dashboard.

## 15. Open questions and recommendations

| # | Question | Recommendation | Why |
| --- | --- | --- | --- |
| Q1 | What is the product called? | Still open. Astra is the codename for the repo and prototypes. Choose a distinct public name before any public mention. | [Astra AI](https://www.startup.si/en-us/blog/meet-astra-ai-slovenian-start-up-of-the-year-winner) is already an AI tutor with [an App Store listing](https://apps.apple.com/app/id6751030141), and it reports over 100,000 users. [Google's Project Astra](https://techcrunch.com/2025/05/20/project-astra-comes-to-google-search-gemini-and-developers) is a well-known AI assistant. A trademark search has not been run. |
| Q2 | How deep across subjects? | Accept any topic. Go deepest in math and physics, then chemistry and computer science. Elsewhere, teach with diagrams, timelines, and text. | Animation and computation give the most in these subjects, and T6 can verify their answers. |
| Q3 | Which platforms? | Laptop first, in the browser. Rich scenes target laptops and may require a laptop browser. Existing pages keep working at phone width, and a mobile app may come later. | Worldwide invitations need zero install, and the board needs room. A tablet with a stylus is the best ink device. |
| Q4 | How do minors enter? | Adults worldwide from day one. Every under-18 needs parent consent by email link, and each country's under-18 invitations wait for counsel. | One strict rule is simpler than a country matrix. Some countries may need stronger verification than email. |
| Q5 | What do parents see? | Consent, a short summary after each session, and alerts for confirmed safety concerns. No transcripts by default. | Teens will not speak openly if a parent reads every word. |
| Q6 | How do students sign in? | A 6-digit email code and Google sign-in through a managed auth provider, with no passwords. | This is the shortest path for students. Auth is on the stop list, so you approve the provider in the plan. |
| Q7 | Which voice architecture? | Cascaded on LiveKit Agents (section 9). | Word timing and a tutor brain we control decide it. |
| Q8 | Which TTS and how many voices? | ElevenLabs, voice Chris on Flash, and one voice. A blind test runs only if Abel still wants one. | Word timing and cancel were the entry requirements, and Abel chose the voice by ear. |
| Q9 | Which model runs live turns? | Start with Opus 5.5 at low effort, and move to Sonnet 5.5 or Haiku 5.5 only if test 2 shows it holds teaching quality or is needed to meet V1. Run lesson planning and session analysis on Opus 5.5. | Teaching quality is the product. The cost gap is about $0.04 a minute, and first-token latency is the real unknown. |
| Q10 | Which rendering architecture? | Option D, the typed scene language with our renderer, for the 2D board, with best-effort rich scenes on top (section 8). | It is the only option that is both instant and interruptible while also being animation-led. |
| Q11 | Do generated simulations ship in v1? | Yes, as best-effort rich scenes. Voice and the 2D board never wait for one, a scene shows only when it is ready and checked, and after about 20 s it is dropped from that lesson and saved. Library simulations with sliders ship too. | A minute of waiting breaks a live conversation, so nobody waits. |
| Q12 | Which languages? | English for the first cohort, with language stored as a session setting from day one. Add languages after English passes section 12. | Each language needs its own speech recognition, TTS, and math vocabulary checks. Worldwide reach first means English with many accents. |
| Q13 | What about weak devices? | Three quality tiers set by measured frame rate. The lowest simplifies board animation. The dot and audio never degrade. | Older laptops and phone widths still need the teaching, and it survives with simpler animation. |
| Q14 | How much free use? | 4 hours a month per student, with a warning 5 minutes before the limit and an alert at $2,000 total spend. Never cut a student off mid-sentence. | Every student at the cap would cost at most $3,600 a month at $0.15 a minute, and most will use far less. |
| Q15 | What do we store? | Transcripts, board events, and the learner record. No raw audio. Deletion on request. | Replay and memory need these records, and raw audio is the riskiest data with the least value. |
| Q16 | Can the board show images from a student's interests? | Mention names and concepts in speech, and draw everything in our own style. No third-party game, film, or team images on the board. | Aristotle's film pastes a Minecraft screenshot. We avoid that rights risk, and our own drawing reinforces the brand. |
| Q17 | Should the tutor use the camera? | No. | It adds privacy risk with minors, conflicts with the emotion-inference limits, and uses bandwidth. Words, pauses, and ink carry most of the signal. |
| Q18 | How do we keep non-math facts accurate? | Ground factual claims in search or trusted sources, show sources on request, and audit a sample. | T6 cannot compute history. The Harvard tutor received correct solutions, and we will not have those for any topic. |
| Q19 | Where do recommendations come from? | Cards start from a pre-made library of about 60 topics. A hand-checked graph of about 300 concepts covers the deep subjects, with model-generated maps elsewhere. | The graph also powers prerequisite tracing (P3) and later card ranking. Both numbers are estimates. |
| Q20 | Who reviews safety flags? | You and one trained backup, with the minor cohort capped at what two people can review within 24 hours. | This is a real, ongoing commitment. It sets the size of the 13 to 17 cohort. |
| Q21 | What happens at the end of the beta? | Offer a founding plan through a payment link at $49 a month for 5 hours. Payments stay on the stop list, so you approve it first. | Five hours costs about $23 to $44 at the buffered rates. It matches Aristotle's entry price and tests real willingness to pay. Regional prices come after. |

### Cohort for the first 100

The recommended mix is 40 students aged 13 to 17 where counsel has cleared invitations, 30 university students, and 30 adult learners, from at least three countries. Recruit from a waitlist fed by the trailers, and weight toward math and physics learners, because the board will be strongest there.

## 16. What we reuse and where we diverge

- `agentic-tutor/docs/NORTH_STAR_PLAN.md` already chose a cascaded voice pipeline on LiveKit, session records, and the sync insight. This PRD keeps those. It replaces tldraw and live Manim as the board's renderer, because living explanations are now the visual we must win on. ManimGX comes back only for rich scenes, which never hold up the lesson (section 8).
- The Portal trailer's ending provides the dot and the opening moment. The swarm and dot pictures in `content-videos/made-of-dots` are not in the v1 plan.
- The [look prototype](https://claude.ai/artifact/3Kw7Ggukb39GerA4E5pK7u) sets the type and the palette. The [app prototype](https://claude.ai/artifact/YJRK2QzMdDdm4c4DQhwWZq) applies them to onboarding and the home screen.
- The `agentic-tutor` user study had 8 participants and one topic. Your earlier plan says not to cite it externally, and that still stands.

## Sources

Links marked with an asterisk were read through search extracts, not in full. Treat vendor and blog figures as starting points that the section 13 tests will replace.

**Name.** [Astra AI on Startup.si](https://www.startup.si/en-us/blog/meet-astra-ai-slovenian-start-up-of-the-year-winner), [Astra AI on the App Store*](https://apps.apple.com/app/id6751030141), [TechCrunch on Project Astra*](https://techcrunch.com/2025/05/20/project-astra-comes-to-google-search-gemini-and-developers).

**Competitor.** [Aristotle homepage](https://heyaristotle.com), [pricing](https://heyaristotle.com/pricing), [voice tutor page](https://heyaristotle.com/voice-ai-tutor), [blog post on chatbots](https://heyaristotle.com/blog/why-ai-chatbots-make-bad-tutors), launch film at `heyaristotle.com/videos/aristotle-launch.mp4` (frames reviewed), [independent review by Gene Dai](https://digidai.github.io/2026/09/17/aristotle-ai-tutoring-hours-learning-outcomes/), [study mode availability](https://echai.ventures/how-founders-use-ai/learning-with-ai/which-ai-assistants-have-a-study-or-learning-mode-and-how-do-i-turn-it-on), [TechCrunch on Guided Learning](https://techcrunch.com/2025/08/06/google-takes-on-chatgpts-study-mode-with-new-guided-learning-tool-in-gemini/), [Penseum*](https://www.producthunt.com/products/penseum/launches/penseum-2), [Learnogram*](https://betalist.com/startups/learnogram-ai), [Mindjoy*](https://docs.mindjoy.com/en/articles/12890804-using-voice-mode-in-a-tutor).

**Learning research.** [Bastani et al., PNAS 2025*](https://papers.ssrn.com/abstract=4895486), [summary of Kestin et al., Scientific Reports 2025](https://www.iatrox.com/blog/harvard-ai-tutor-trial-what-it-showed-question-banks), [World Bank on Edo State](https://blogs.worldbank.org/en/education/From-chalkboards-to-chatbots-Transforming-learning-in-Nigeria), [Major, Francis and Tsapali 2021](https://edtechhub.org/?p=61468), [arXiv 2602.15876*](https://arxiv.org/pdf/2602.15876).

**Voice and cost.** [LiveKit voice agents guide](https://www.forasoft.com/blog/article/voice-ai-agents-livekit-guide), [Cartesia pricing](https://www.cartesia.ai/pricing), [Cartesia TTS API](https://docs.cartesia.ai/api-reference/tts/websocket), [Coval TTS roundup](https://www.coval.ai/blog/best-text-to-speech-providers-in-2026-how-to-choose-(and-why-vendor-benchmarks-lie)/), [speech-to-speech API comparison*](https://getstream.io/blog/speech-apis/), [GPT-Live setup and pricing](https://tech-insider.org/openai-realtime-api-gpt-live-1-setup-2026/), [OpenAI Realtime pricing](https://www.layer3labs.io/guides/openai-realtime-api-pricing), [Gemini Live pricing](https://tech-insider.org/openai-vs-google-vs-qwen-voice-ai-apis-2026/), Anthropic model table from the Claude API reference (cached 6 October 2026).

**Rendering.** [Google Research on generative UI*](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/), [tldraw pricing*](https://tldraw.dev/pricing), [Manim-Web discussion](https://hn.svelte.dev/item/47155375), [ecmanim*](https://github.com/johnhenry/ecmanim).

**Law and policy.** [Akin on COPPA and AI*](https://www.akingump.com/en/insights/ai-law-and-regulation-tracker/new-coppa-obligations-for-ai-technologies-collecting-data-from-children), [Loeb on the amended COPPA rule](https://www.loeb.com/en/insights/publications/2025/05/childrens-online-privacy-in-2025-the-amended-coppa-rule), [Future of Privacy Forum on SB 243](https://fpf.org/blog/understanding-the-new-wave-of-chatbot-legislation-california-sb-243-and-beyond/), [GDPR Article 8](https://gdpr-info.eu/art-8-gdpr/), [AI Act Article 5](https://artificialintelligenceact.eu/article/5/), [Cooley on the Digital Omnibus*](https://cdp.cooley.com/digital-ai-omnibus-delays-key-deadlines-introduces-new-rules/), [UK Children's Code on Wikipedia](https://en.wikipedia.org/wiki/Age_appropriate_design_code), [UUBO on Nigerian minors' data*](https://uubo.org/document/personal-data-of-a-minor-what-you-must-know), [LiveLaw on India's DPDP Rules*](https://www.livelaw.in/amp/top-stories/digital-personal-data-protection-rules-2025-notified-309928), [EY on DPDP*](https://www.ey.com/content/dam/ey-unified-site/ey-com/en-in/pdf/2025/11/ey-india-dpdp-act-2023-and-rules-2025-pov.pdf), [Anthropic on serving minors](https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors), [OpenAI under-18 guidance*](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance).
