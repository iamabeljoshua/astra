# Appearance

A student chooses a light or dark theme with the `Light` and `Dark` buttons in the sidebar. The choice survives a reload.

## Sub-features

- `appearance-toggle` switches the theme and marks the chosen button as pressed.
- `appearance-saved` keeps the theme after a reload, with no flash of the other theme.

## How to get to it (user POV)

- On a laptop, use the `Appearance` group at the bottom of the sidebar on any page.
- On a phone, press `Menu` in the header first.

## Driving it with pnpm verify

Preconditions:

- `pnpm verify doctor` passes.

- **Choose dark and reload.** Run `pnpm verify drive --journey appearance`. The `journey`, `identity`, and `screenshot` checks print `PASS` for `laptop` and `phone`, and the command exits 0.
- **Proof.** Open `.verify/evidence/appearance-laptop-dark.png` and `.verify/evidence/appearance-laptop-dark-after-reload.png`, and the two `phone` images. Each shows the dark theme.

## Gotchas

- The driver does not use the system color setting, because the theme is a toggle.
- Each viewport gets a new browser context with empty storage, so every run starts light.
