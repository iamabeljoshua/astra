# Astra design

Status: look approved by Abel on 2 November 2026 from the [prototype](https://claude.ai/artifact/3Kw7Ggukb39GerA4E5pK7u). Its source is in `docs/design/look-prototype/`. Follow this file for all product UI.

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

- **Barlow** for the interface. Headlines are weight 600 and uppercase. Labels are 12px, weight 500, uppercase, with 0.14em letter spacing.
- **Newsreader** for the tutor's spoken words, so its voice reads warmer than the interface around it.
- Never set text in all caps when someone has to read more than a short line of it.

## Surfaces

- No gradients and no shadows. Depth comes from `panel` against `paper` and from 1px rules.
- Square corners. Controls are outlined with a 1px border, and only the selected state is filled.
- Text on one side and one object on the other, stacked on a phone.
- Use a bordered panel for the board, and rules rather than cards for lists.

## Motion

- The page is still at rest, and stays still while the student reads.
- Motion needs a cause: the tutor's word or the student's action.
- The main motion is the board drawing itself in time with speech.
- Changing a view is a quiet fade of about half a second.
- No decorative morphing, flying particles, or ambient animation. An equation rearranging term by term is teaching, so it stays.
- Honor the reduced-motion setting, and follow PRD B10 on flashing.

## The dot

The dot is the tutor's presence. It is a small solid circle in `ink` that rests while listening and pulses while speaking (PRD B9).

## Pictures made of dots

Dots are a print style for pictures. They are not a transition.

- **Light:** dots behave as ink on paper. Light areas lose their dots and dark areas print heavier, with no glow.
- **Dark:** dots behave as light on black, as in the Made of Dots film.
- Use public-domain art and our own drawings.

## Marketing demos

Use the `stageshow` skill for marketing and demo illustrations only, and never for real product screens. Its kit bundles other companies' logos and app icons, and those stay out of anything we publish.
