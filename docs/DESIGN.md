# Astra design

Status: look approved by Abel on 2 November 2026 from the [look prototype](https://claude.ai/artifact/3Kw7Ggukb39GerA4E5pK7u), whose source is in `docs/design/look-prototype/`. The [app prototype](https://claude.ai/artifact/YJRK2QzMdDdm4c4DQhwWZq) applies it to onboarding and the home screen. Follow this file for all product UI.

## The idea

A warm, lighter take on SpaceX: one object per screen, plain type, thin rules, and real numbers. Astra's visuals exist to teach. The product can draw many things because the tutor is explaining them, so a drawing always has a reason to be there.

## Themes

Light is the default. A toggle switches to dark, and the choice is remembered. Build every screen in both from the first PR, and take every color from a token.

| Token | Use | Light | Dark |
| --- | --- | --- | --- |
| `paper` | Page background | `#F6F1E6` | `#000000` |
| `panel` | The board and other raised surfaces | `#EFE8DA` | `#0E0D0B` |
| `ink` | Main text and marks | `#1B1815` | `#FFFBF5` |
| `ink-2` | Secondary text | `#5F574C` | `#A79F92` |
| `line` | Rules and quiet borders | `#CFC6B5` | `#2B2823` |
| `accent` | Focus rings and links on hover | `#1B1815` | `#FFCC94` |

Other color comes only from the content, such as a painting or a plotted series.

## Type

- **Barlow** for the interface. App screens use sentence case at normal reading sizes, with weight 600 for headings. Labels are 11 to 12px, weight 500, uppercase, with 0.14em letter spacing.
- Large uppercase display type is for the welcome tagline only. A large headline on an everyday screen reads as a poster.
- **Newsreader** for the tutor's spoken words and the home greeting, so its voice reads warmer than the interface around it.
- Never set text in all caps when someone has to read more than a short line of it.

## Surfaces

- No gradients and no shadows. Depth comes from `panel` against `paper` and from 1px rules. The one exception is a 1px `paper` shadow under the phone chat dock, which hides a strip of card at fractional display scales and cannot be seen.
- Square corners. Controls are outlined with a 1px border, and only the selected state is filled. A screen's one main action, such as Send, is the exception and is filled at rest.
- Text on one side and one object on the other, stacked on a phone.
- Use a bordered panel for the board, and rules rather than cards for lists. The compact picks on the home screen are the exception.

## Home screen

Aristotle's logged-in home sets the proportions, in our type and palette. A sidebar holds the menu, recent sessions, and the account. A centered column of about 1,020px holds a modest greeting, one continue card, and compact picks, with a ChatGPT-style chat box pinned to the bottom of the screen. Abel chose the bottom position on 2 November 2026. Nothing is oversized, and the main content fits on a laptop screen without scrolling.

## Onboarding

The question gets the room. Each screen asks one thing, on the same dot page as sign-in. The tutor's line types out, then the field appears. The chart beside it records the answers: the student's name forms in the planet's dots as they type it, the chart's title says "made for" that name, and each interest picked lights a new labelled star. The level and goal steps give the dots a fitting shape, and the other steps hold the name. No picture panel and no captions.

## Motion

- The page is still at rest, and stays still while the student reads.
- Motion needs a cause: the tutor's word or the student's action.
- The main motion is the board drawing itself in time with speech.
- By default, changing a view is a quiet fade of about half a second.
- On a dot page, a shape made of dots forms when a step changes or a student acts, and is still otherwise. The sign-in page's dots gather once when it opens. A path leg draws when a digit is typed, and a star lights when a chip is picked. The tutor's line types out, then the field appears. The dot grid and the chart's rings, spokes, and scattered stars never move, with no ripple and no expansion. Abel chose this on 4 November 2026.
- Other morphing and particle effects are a judgment call. Use them where they help the lesson or the experience, and avoid them as decoration.
- Honor the reduced-motion setting by showing everything at once, and follow PRD B10 on flashing.

## The dot

The dot is the tutor's presence. It is a small solid circle in `ink` that rests while listening and pulses while speaking (PRD B9), which includes while its line types out.

## Dot pages

Sign-in, onboarding, and the account notices are one calm page and not two halves, built on `DotStage`. Abel chose this look, the dotted Saturn on the star chart, on 4 November 2026. The question sits on the left and the chart fills the right, with the planet at its center. Below 1,021px the chart is a band across the top, with the form below it.

- A still grid of dots in `ink` fills the page and fades out around the question. The chart's dotted rings, spokes, and scattered stars are drawn once.
- Eight labelled subject stars form a horseshoe around the planet, joined by a faint dotted path: Motion, Light, Waves, Music, Cells, Code, Stars, and History. The email step draws the first leg, and each digit of the code draws the next, so the last digit finishes the path.
- The planet's near dots are larger than its far ones, and it is shaded by how many dots land on it, with rings passing in front and behind.
- The chart's title sits at the bottom right in Newsreader italic. It reads "A learning app, made for you", and it takes the student's name once they type one. Beside the chart it stays on one line, so a very long name ends in an ellipsis instead of running over the stars.

A browser with no canvas gets the same page without the chart. A browser that refuses a canvas read, or answers it with noise, keeps the planet, and the name shows in the title only. A shape or a name may be made of dots. Pictures may not, as the next section says.

## Pictures

Pictures are normal images. Abel ruled out rendering them as dots on 2 November 2026.

- Use public-domain art, licensed images, and our own vector drawings.
- Draw our own diagrams in `ink` strokes on `panel`, so the board can reveal them stroke by stroke in time with speech.
- Interest chips carry a small drawing each, in the same 1.3px strokes as Home's card drawings, in the chip's text color. These drawings are decorative, and the chip's name is what a screen reader reads.

## Marketing demos

Use the `stageshow` skill for marketing and demo illustrations only, and never for real product screens. Its kit bundles other companies' logos and app icons, and those stay out of anything we publish.
