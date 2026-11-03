# Menu

The menu moves a student between Home and Sessions. On a laptop it is always in the sidebar. On a phone it opens from the `Menu` button in the header.

## Sub-features

- `menu-laptop` shows `Home` and `Sessions` links in the sidebar.
- `menu-phone` hides the sidebar until the student opens `Menu`, and closes it after a choice.
- `menu-sessions` opens the Sessions page, which says that sessions will appear there.

## How to get to it (user POV)

- Sign in first. See [Sign-in](./sign-in.md).
- On a laptop, use the sidebar on any page.
- On a phone, press `Menu` in the header on any page.
- Open `/sessions` directly. An unknown path goes to Home.

## Driving it with pnpm verify

Preconditions:

- `pnpm db:up` ran in this checkout, and `pnpm db:seed` ran on this lane's database before the journey, because the journey signs in as `maya@astra.test` and starts on Home.
- `pnpm verify doctor` passes.

- **Open Sessions from the menu.** Run `pnpm verify drive --journey menu`. The `journey`, `identity`, `screenshot`, and `main region` checks print `PASS` for `laptop` and `phone`, and the command exits 0.
- **Proof.** After a run that printed `PASSED`, open `.verify/evidence/menu-laptop-sessions.png` and `.verify/evidence/menu-phone-sessions.png`. Each shows the `Sessions` heading. A labeled image keeps its name in a failed run.

## Gotchas

- `Menu` is both the phone button and the name of the navigation landmark. Scope a link with `getByRole('navigation', { name: 'Menu' })`.
- On a phone, the sidebar links are not visible until `Menu` is open, so a click without it times out.
- On a phone, `main` is hidden while `Menu` is open, so a journey that ends there fails `main region`.
