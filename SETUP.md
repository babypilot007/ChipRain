# Poker Chips — React + Netlify + Supabase

## Update an existing deployment

1. Replace your GitHub repository files with this project's files.
2. Keep the existing Netlify environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. In Supabase Dashboard → SQL Editor, run `supabase-migration.sql` once. This adds the `max_stack` column to existing player rows; it does not delete room/player data.
4. Ensure `poker_rooms` and `poker_players` are enabled for Supabase Realtime.
5. Commit/push to GitHub and let Netlify redeploy.

## Behavior

- Players can add/remove chips only on their own stack.
- The host sets each player's maximum stack/buy-in in the admin page.
- A player's stack cannot be increased above that limit through the app controls.
- The player can move their whole stack into the center pot with **Move entire stack to pot**. This subtracts it from their stack and adds the same value to the shared pot.
- The admin can adjust the pot, adjust any stack, award the entire pot to a selected player, and reset all stacks and the pot.
- A player's own aggregate stack total is masked; other players can see it.

## Security limitation

This is still a casual-game prototype. The current open Supabase RLS policies allow direct client database writes, so UI restrictions are not a security boundary and can be bypassed by a technically capable user. Do not use for real-money games or untrusted public rooms. Before production, implement authenticated users, strict RLS, and server-side RPC/Edge Functions that atomically validate chip limits, betting, pot changes, and host permissions.
