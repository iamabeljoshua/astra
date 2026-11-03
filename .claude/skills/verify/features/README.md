# Astra verification map

This folder is the maintained source for verifying what a student can do in Astra. Read the index, then use the matching feature file as the recipe.

## Baseline preconditions

- Your own checkout, with the setup commands in `../SKILL.md` done, including the seed.
- `pnpm verify start` succeeded in this checkout, or use `pnpm verify run`.
- Never drive an instance that this run did not start.

## Driving conventions

- A journey in `../journeys/` is the rerunnable recipe for a feature. Run it with `pnpm verify drive --journey <name>`.
- Prefer ARIA roles and accessible names over CSS selectors or position. Use exact text only when the element has no role.
- Check every path a student has to a feature, at laptop and phone widths.

## Proof and skip reporting

- Save a screenshot after each action that matters, with `capture('<label>')`, plus the final screenshot that `drive` saves.
- Report an unreachable path with the command you tried and the precondition that was missing.
- Do not report a skipped path as verified through a different path.

## Feature entry contract

Each feature file has an H1 title and one paragraph on the behavior a student sees. It then has exactly these H2 sections, in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every entry point a student has.
3. `Driving it with pnpm verify` starts with `Preconditions:`, and each bullet pairs a student action with an exact command and an observable result.
4. `Gotchas` lists traps that can waste or invalidate a run.

A PR that adds or changes a screen updates its feature file and its journey in the same PR.

## Features

- [Sign-in](./sign-in.md) covers the email link, the date of birth question, the closed page, and sign-out.
- [Onboarding](./onboarding.md) covers the questions and the sheet after sign-in, parent consent, the tutor's first hello, and changing answers later.
- [Terms and Privacy Policy](./legal.md) covers the two public draft pages, and keeping the typed address when a student opens one.
- [Home](./home.md) covers the page a student opens first, with its greeting, cards, and chat box.
- [Menu](./menu.md) covers moving between Home and Sessions, at laptop and phone widths.
- [Appearance](./appearance.md) covers the light and dark themes, and that the choice survives a reload.
