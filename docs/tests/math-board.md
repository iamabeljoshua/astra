# Math on the board: what was measured

This is the record for M3.3. A student hears the tutor explain algebra and sees correct equations form in step with the words. Every figure here comes from the real lab page, on the real player, on Abel's Mac under load from other agents, at a load average of 6 to 25. All text is test text.

No figure here spends voice credits. The voice is the fake tone, which fires a word every 280 ms, or the stored line of Casey saying "Let me work that out." The recording uses the Mac's free `say` voice, so a person can follow it, and no timing proof uses that voice.

To run it all again, with `livekit-server` on the path and a free web port:

```sh
export WEB_PORT=6240 LAB_LIVEKIT_PORT=7940 LAB_LIVEKIT_UDP_PORT=7942 LAB_RELAY_PORT=7943
pnpm --filter @astra/agent math-proof --out /tmp/m3-3-proof
pnpm --filter @astra/agent proof --fake --only math-algebra,math-every-word,math-dense-phone,math-hostile --out /tmp/m3-3-timing
pnpm --filter @astra/agent math-load --out /tmp/m3-3-load
```

## The data shape

Commands sit inside the sentence, as the design says. The board holds each equation as a `MathLine`, the source plus its `MathTerm` list. `getMathParts` splits source math at its top level into terms, operators, and relations. `transformMathLine` keeps a term's id through a rearrangement: order-keeping matches first, then a term that crossed the equals sign. So the `3` in `2x + 3 = 11` is the same `t3` in `2x = 11 - 3`. This runs anywhere, with no DOM, so the agent can read terms too.

At rest the DOM is plain KaTeX. KaTeX keeps no ids under `trust: false`, so a hidden copy wraps each term in a marker color, which passes through to every span it sets. That shows which ink each term made, and the visible tree stays exactly what KaTeX built.

A rearrangement uses the player's `entrance` motion, so a stop, a freeze frame, and a replay needed no new rules. Each piece of ink flies from its old place to its new one as a pure function of that one number. A glyph whose term changed still travels, so the 2 in `2x = 8` lands under the 8 in `x = 8/2`.

## Results

@@RESULTS@@

## Choices worth keeping

- The newest element always stays on the board, and the oldest leaves whole. The tutor is talking about what it just wrote, and a line cut in half reads as a bug.
- Math KaTeX refuses never reaches the student. The last good equation stays, and the refusal goes to `onMathRefused`.
- A rewrite with more than six loose glyphs fades instead of flying. A student can follow a few pieces moving, and a crowd crossing each other reads as noise, which the matrix step showed when it flew.
- The `say` voice exists only so a person can follow the recording. Its word times are each word's share of the phrase, so no timing proof uses it.
- A full board makes room in the first third of a new element's entrance, and the writing starts once it has, so no ink is drawn below the edge.

## Why KaTeX

The plan and the approved design name KaTeX. I measured the alternatives before keeping it, on this Mac on 4 November 2026.

| Library | Version | Script, minified | Script, gzipped | What it builds |
| --- | --- | --- | --- | --- |
| KaTeX | 0.19.1 | 273 KB | 76.5 KB, plus 3.6 KB of CSS | Plain spans with a box for each glyph, in its own fonts |
| Temml | 0.14.0 | 168 KB | 49.7 KB, plus 2.8 KB of CSS | MathML, which the browser lays out |
| MathJax | 4.1.3 | 997 KB | 282.5 KB | Its own output, with more of TeX |

KaTeX is what makes the term by term move possible. Each glyph is an element with a box we can measure and move, the output is the same in every browser, and its fonts are served by us. MathJax costs nearly four times the bytes for parts of TeX a school lesson does not use. Temml saves 27 KB, but MathML leaves layout to each browser, so glyph positions and flights would differ between them, and I did not try to animate it. That last point is my reading and not a measurement.

Math rendering stays out of Home. The lab is development only, so `katex` is in no production chunk today, and M3.10 should load the board as a route chunk, the way `math-load` does.

## Limits

- Handwriting is the EMS Tech stroke set, which covers Latin letters. A line with any other character shows as plain text. Math is set with KaTeX's own fonts, and it is written glyph by glyph rather than stroke by stroke, because a font glyph has no strokes to follow.
- `hide` and `clearBoard` remove an element at once, so lines below a hidden one jump up. `docs/DESIGN.md` allows a quiet fade here, and M3.5 can add it.
- A `transformMath` that lands while another is still running starts from the plain tree of the one before. A tutor who rearranges on every word gets correct equations and a small jump, and the stored line and the every-word lesson show this.
- `annotate.label` is not drawn on math yet. M3.12 owns notes beside a line.
- No real voice has spoken these lessons. The stored line is the only real speech here, 5 words with a cue on each. M3.7 is the first real model writing math, and it should check `canRenderTex` from `@astra/board/tex-check`, which plain Node can import, before a command reaches a student.
- Safari, Firefox, and real phones are untested. M3.6 and M3.10 own those.
