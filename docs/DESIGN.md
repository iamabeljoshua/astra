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

- No gradients and no shadows. Depth comes from `panel` against `paper` and from 1px rules.
- Square corners. Controls are outlined with a 1px border, and only the selected state is filled.
- Text on one side and one object on the other, stacked on a phone.
- Use a bordered panel for the board, and rules rather than cards for lists. The compact picks on the home screen are the exception.

## Home screen

Aristotle's logged-in home sets the proportions, in our type and palette. A sidebar holds the menu, recent sessions, and the account. A centered column of about 1,020px holds a modest greeting, one continue card, and compact picks, with a ChatGPT-style chat box pinned to the bottom of the screen. Abel chose the bottom position on 2 November 2026. Nothing is oversized, and the main content fits on a laptop screen without scrolling.

## Onboarding

The question gets the room. Each screen asks one thing. A small sheet headed "Made for you" sits beside it and records each answer, and it shows the student's name as they type it, so the tagline "A learning app, made for you" comes true on screen. No picture panel and no captions.

## Motion

- The page is still at rest, and stays still while the student reads.
- Motion needs a cause: the tutor's word or the student's action.
- The main motion is the board drawing itself in time with speech.
- By default, changing a view is a quiet fade of about half a second.
- Morphing and particle effects are a judgment call. Use them where they help the lesson or the experience, and avoid them as decoration.
- Honor the reduced-motion setting, and follow PRD B10 on flashing.

## The dot

The dot is the tutor's presence. It is a small solid circle in `ink` that rests while listening and pulses while speaking (PRD B9).

## Pictures

Pictures are normal images. Abel ruled out rendering them as dots on 2 November 2026.

- Use public-domain art, licensed images, and our own vector drawings.
- Draw our own diagrams in `ink` strokes on `panel`, so the board can reveal them stroke by stroke in time with speech.

## Marketing demos

Use the `stageshow` skill for marketing and demo illustrations only, and never for real product screens. Its kit bundles other companies' logos and app icons, and those stay out of anything we publish.
