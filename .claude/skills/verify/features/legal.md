# Terms and Privacy Policy

A student opens `/terms` or `/privacy` from the words under the sign-in button, with no account. Each page says at the top that it is a draft a lawyer has not yet reviewed, and labels what is planned. Coming back keeps the sign-in step and the typed address.

## Sub-features

- `legal-open` opens both pages signed out, with focus on the heading.
- `legal-links` links the words `Terms` and `Privacy Policy` on the welcome step and the email step.
- `legal-keep-draft` keeps the typed address after `Back to Astra` and after browser Back.
- `legal-themes` shows both pages in light and dark, at laptop and phone widths.

## How to get to it (user POV)

- On the sign-in page, follow `Terms` or `Privacy Policy` in `By continuing you agree to the Terms and the Privacy Policy.`
- Open `/terms` or `/privacy` directly, signed in or signed out.

## Driving it with pnpm verify

Preconditions:

- `pnpm db:up` ran in this checkout, because it writes `apps/web/.env.development.local`.
- `pnpm verify doctor` passes.

- **Open both pages by keyboard and come back.** Run `pnpm verify drive --journey legal`. The `journey`, `identity`, `screenshot`, and `main region` checks print `PASS` for `laptop` and `phone`, and the command exits 0.
- **Proof.** After a run that printed `PASSED`, open the `legal-laptop-*` and `legal-phone-*` images in `.verify/evidence/`. They show `terms-light`, `terms-dark`, `privacy-dark`, `privacy-light`, and `kept-address`.

## Gotchas

- A reload on a legal page clears the typed address, because it lives in memory.
- The driver presses keys through Playwright, and browser Back is `page.goBack()`, because headless Chromium ignores the Back shortcut.
