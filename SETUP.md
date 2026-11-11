# Poker Chips — React + Netlify + Supabase

A live multi-device poker chip counter. One person creates a room; others join using its code or invite URL. Player stacks and central pot sync through Supabase Realtime.

## 1. Set up Supabase
1. Create a project at https://supabase.com.
2. Open **SQL Editor → New query**, paste all of `supabase.sql`, and run it.
3. Copy your **Project URL** and **publishable/anon key** from Project Settings → API (or Connect).
4. If realtime updates do not arrive, open Database → Replication and enable `poker_rooms` and `poker_players` for Realtime.

## 2. Run locally
```bash
npm install
cp .env.example .env
```
Add your Supabase values to `.env`, then:
```bash
npm run dev
```

## 3. Deploy with GitHub + Netlify
1. Push this folder to a GitHub repository.
2. In Netlify choose **Add new site → Import an existing project** and select that repository.
3. Build command: `npm run build`; publish directory: `dist`.
4. Add environment variables in Netlify → Site configuration → Environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy (and redeploy after changing environment variables).

## MVP security note
This starter has no user accounts. Anyone with a room code can read the room and update stacks. That is acceptable only for a casual, trusted home-game prototype—not real-money play or adversarial/public use. Before public production use, add authentication and server-side authorization/RPC functions that validate room membership and host permissions. Never put a Supabase service-role key in the frontend.
