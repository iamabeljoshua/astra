# Safety

What M4.5 gives a person to check. Each journey below drives the real app.

- **Review the flag queue.** Run `SAFETY_REVIEWER_IDS=00000000-0000-4000-8000-0000000000a1 ASTRA_AGENT_KEY=<any value> pnpm verify run --journey review`. Maya reads `/review`, marks one flag reviewed, and Tola is sent home from the same path.
- **Delete my data.** Run `pnpm verify run --journey delete-my-data`, after `pnpm db:seed`. The control under Your notes asks first, deletes, and signs out. Without `SUPABASE_SECRET_KEY` the sign-in stays in Auth and the log says so.
- **See the picture credits.** Run `pnpm verify run --journey credits`. The page opens from the sign-in screen and from the sidebar.
- **Close an account under 13.** See `onboarding-under-13` in `onboarding.md`. Against a local stack without `SUPABASE_SECRET_KEY`, the account closes and stays in Auth. `apps/api/src/students/closed-address.spec.ts` proves the erase on Auth's real tables.
