# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Arcade Vault — an online gaming platform where users play and compete for points. Uses **Spec Driven Design** via the `/spec` and `/spec-impl` skills from `npx skills@latest add Klerith/fernando-skills`.

## Stack

- **Next.js 16.2.6** with App Router (`app/` directory) — read `node_modules/next/dist/docs/` before writing Next.js code; APIs differ from training data
- **React 19.2.4**
- **Tailwind CSS v4** (PostCSS plugin via `@tailwindcss/postcss`)
- **TypeScript**
- **Supabase** (`@supabase/supabase-js`, `@supabase/ssr`) — data backend for games and scores (see below). Not yet used for auth.
- **Resend** — transactional email for the About/contact form

No test runner is configured yet.

## Skills

Usa siempre /frontend-design para diseñar la interfaz de usuario.

- `/spec` — guided, question-driven spec designer; writes specs section-by-section into `specs/` from `specs/template.md`. Does not write code.
- `/spec-impl <NN-spec-name>` — implements an approved spec: verifies it's marked "Approved", creates/switches to a spec-named branch, implements step by step with diff-review pauses.
- `/add-game <game>` — end-to-end flow for adding a new playable game: ports a canvas game to a React component, creates its `/games/<id>/play` route, generates cover-art CSS, registers the row in the Supabase `games` table (via MCP), and wires the leaderboard. Companion docs: `.claude/skills/add-game/platform-contract.md` (schema/route/PlayShell contract) and `porting-recipe.md` (canvas→React steps).
- `/frontend-design` — aesthetic direction, typography, and UI design guidance.

## Agents

- `game-planner` (`.claude/agents/game-planner.md`) — catalog planner for deciding what game to add next, evaluating whether a proposed idea fits the platform, and logging every game suggestion (even off-hand ones). Reads `references/game-suggestions-todo.md` (persistent suggestion log, status `pending`/`accepted`/`rejected`/`implemented`), `references/implemented-games.md`, `.claude/skills/add-game/platform-contract.md`, and `specs/*.md` before opining. Appends new suggestions as audit-log rows (never rewrites/deletes existing ones) and only edits a row's `Status` when told a past suggestion changed state. Doesn't implement games — invoke it before running `/spec` or `/add-game` on a new idea, or whenever someone proposes a game so it gets recorded.

## Architecture

Uses Next.js **App Router** exclusively — no `pages/` directory. Entry points:

- `app/layout.tsx` — root layout with Geist font variables and global CSS
- `app/globals.css` — Tailwind base styles
- `app/page.tsx` — home route (`/`) — hero + live games list pulled from Supabase

### Current routes (Supabase-backed)

- `app/games/page.tsx` — game library/grid, reads the `games` table
- `app/games/[id]/page.tsx` — game detail page (info + scores)
- `app/games/{asteroids,tetris,arkanoid,snake}/play/page.tsx` — one static play route per shipped game; each just wraps `components/games/PlayShell.tsx` around the game's dynamically-imported component
- `app/hall-of-fame/page.tsx` — global leaderboard, reads `games`/`scores`
- `app/about/page.tsx` — about/contact page, sends mail via Resend
- `app/auth/page.tsx` — sign-in/sign-up UI. **Not wired to Supabase Auth yet** — `login()` just stores a username string in `localStorage` via `app/context/UserContext.tsx`; the Google/GitHub buttons and password fields are decorative for now
- `app/games/[id]/play/page.tsx` — generic placeholder play page (fake auto-incrementing score); not used by any shipped game

### Legacy (do not extend)

`app/juego/[id]`, `app/jugar/[id]`, `app/salon`, and `components/GameCard.tsx` / `GamePlayer.tsx` / `GameOverModal.tsx` / `Leaderboard.tsx` are a pre-Supabase mock-data prototype driven by `lib/games.ts` / `lib/session.tsx` (static arrays, seeded fake scores). They predate the Supabase migration and are unused by the current game routes — treat as dead code, not a pattern to follow. `app/data/*.ts` files are empty/vestigial.

### Games implemented

Four playable games so far, each following the same pattern (canvas game component + `components/games/types.ts`'s `GameApi` contract + a `games` table row):

1. **Asteroids** — `components/games/AsteroidsGame.tsx`
2. **Tetris** — `components/games/TetrisGame.tsx`
3. **Arkanoid** — `components/games/ArkanoidGame.tsx` (+ `arkanoid/levels.ts`, `arkanoid/spritesheet.ts`)
4. **Snake** — `components/games/SnakeGame.tsx` (+ `snake/sprites.ts`)
5. and more... (see  `references/mplemented-games.md`) when you need to check wich games are implemented new onces.

Shared play-page chrome (HUD, CRT frame, pause overlay, game-over modal, score persistence to Supabase, restart) lives in `components/games/PlayShell.tsx` — new games should use `/add-game` rather than hand-rolling this.

### Supabase

- Clients: `lib/supabase/client.ts` (browser) and `lib/supabase/server.ts` (server, async)
- Types: `lib/supabase/types.ts` — hand-written `GameRow`, `ScoreRow` (no generated types yet)
- Health check: `app/api/supabase-health/route.ts`
- **`games` table**: `id` (text PK), `title`, `short`, `long`, `cat` (CHECK: `ARCADE`|`PUZZLE`|`SHOOTER`), `cover` (CSS class name), `color` (CHECK: `cyan`|`magenta`|`yellow`|`green`), `created_at`
- **`scores` table**: `id` (uuid PK), `game_id` (FK → `games.id`), `player_name`, `score` (int), `user_id` (nullable, unused today), `created_at`
- RLS on both tables: public `SELECT`; public `INSERT` only on `scores`. Writing to `games` requires the Supabase MCP server (privileged), not the browser client — this is how `/add-game` registers new games.
- Full contract documented in `.claude/skills/add-game/platform-contract.md` and specs `04-supabase-integration.md` / `06-games-table-leaderboard-supabase.md`.

New routes go under `app/` as folders with `page.tsx`. Shared UI goes in `components/`. Server Components are the default; mark client components with `"use client"` only when needed.
