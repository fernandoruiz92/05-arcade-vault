---
name: add-game
description: Adds a fully playable game to Arcade Vault — ports the canvas game to a React component, creates its play-page, generates the cover art CSS, registers the row in the Supabase `games` table and wires the leaderboard. Use it whenever the user wants to integrate a new game into the platform, whether or not it comes from `references/started-games/`. Invoked as /add-game <game>.
argument-hint: '<game-id> | references/started-games/<folder> | NN-spec-slug'
---

# /add-game — Arcade Vault game integrator

This skill takes a game from wherever it lives today — a folder in `references/started-games/`, code the user hands you, or nothing at all — and leaves it **playable inside the platform with a working leaderboard**.

It follows the repo's spec-driven method: **first you write the spec, then the user approves it, then you implement it**. You never do both in the same invocation.

Two supporting files live next to this one. Read them before touching code:

- **`platform-contract.md`** — what the platform requires: routes, CSS class names, the Supabase schema and its constraints, the `PlayShell` API, and the integration checklist.
- **`porting-recipe.md`** — how to turn a vanilla canvas game into a React component: the exact transformations, the annotated skeleton, and per-source notes for the games in `references/started-games/`.

---

## Session context

Reference games available:
!`ls references/started-games/ 2>/dev/null || echo "references/started-games/ does not exist"`

Games already integrated (each has its own play route):
!`ls -d app/games/*/play 2>/dev/null || echo "none"`

Game components already ported:
!`ls components/games/ 2>/dev/null || echo "components/games/ does not exist"`

Existing specs:
!`ls specs/ 2>/dev/null || echo "The specs/ folder does not exist"`

Current branch:
!`git branch --show-current`

Working tree:
!`git status --short`

---

## Command flow

- Follow the phases in order. **Do not advance to the next phase if the previous one did not complete correctly.**
- Your replies must be in the same language as the initial prompt. E.g.: if the initial prompt is in Spanish, your replies must be in Spanish; if it is in English, your replies must be in English. The spec file itself is written in the language the repo's other specs use (currently Spanish).
- The received argument is: `$ARGUMENTS`

### Routing — which phase do I start in?

Look at `$ARGUMENTS` and the `specs/` listing above:

| `$ARGUMENTS` looks like                                                   | Start in    |
| ------------------------------------------------------------------------- | ----------- |
| The name, number or slug of a file that **already exists** in `specs/`     | **Phase 4** |
| Anything else (a game name, a reference folder, a description, or empty)   | **Phase 1** |

If it is ambiguous — e.g. `tetris` and `specs/07-tetris-game.md` both exist — ask the user which one they mean. Do not guess.

---

### Phase 1 — Context and source of the game

1. Read `CLAUDE.md` and `AGENTS.md`.
2. Read `platform-contract.md` (next to this file).
3. Read the two most recent files in `specs/` to pick up the repo's conventions. `specs/05-asteroids-game.md` and `specs/06-games-table-leaderboard-supabase.md` are the ones that created the current integration — they are the best reference for what a game spec looks like here.
4. Read `components/games/AsteroidsGame.tsx` and `app/games/asteroids/play/page.tsx`. Asteroids is the reference implementation; everything you build must look like it.

Then classify the source into one of three cases and say out loud which one you picked:

- **Case A — a folder in `references/started-games/`.** Read that folder's own `CLAUDE.md` first (each one documents its architecture), then `index.html`, then the game script(s). Check `porting-recipe.md` for the per-game notes.
- **Case B — code the user provides** (a path, a repo, a paste). Read all of it before asking anything. Identify: canvas size, the game loop, the state variables that map to score/lives/level, the input surface, where game over is handled, and any external assets.
- **Case C — a brand-new game written from scratch.** There is no source to port. You will author the game following the authoring contract in `porting-recipe.md`.

If `$ARGUMENTS` is empty, list the folders in `references/started-games/` that are not yet integrated, and ask the user which game they want — or whether they want a new one written from scratch. Stop and wait.

**Report before moving on.** A short summary: source case, canvas dimensions, controls, which variables carry score/lives/level, whether there are binary assets, and how game over is currently handled. This is what the questions in Phase 2 are built on.

---

### Phase 2 — Clarify through questions

Ask in blocks of 3 to 5 questions. After each block, wait for an answer. Mark your recommendation and say why. Do not assume.

**Always cover these:**

1. **`id`** — lowercase kebab-case. It is the primary key in the `games` table **and** the route folder `app/games/<id>/play/` **and** the value of `game_id` in every score row. It cannot change later without a data migration. Propose one derived from the game name.
2. **`title`** — uppercase, shown on the card and in the HUD (e.g. `ASTEROIDS`).
3. **`short`** — one line for the card. **`long`** — 2–3 sentences for the detail page.
4. **`cat`** — one of `ARCADE`, `PUZZLE`, `SHOOTER`. Nothing else.
5. **`color`** — one of `cyan`, `magenta`, `yellow`, `green`. Nothing else.
6. **Cover art** — what should the `.cover-<slug>` CSS evoke? Offer 2–3 concrete visual concepts. Point out that it is pure CSS, no images.
7. **HUD metric mapping** — the component contract is fixed (`onScoreChange`, `onLivesChange`, `onLevelChange`), but the labels are not. If the game has no lives, ask what should sit in that slot (e.g. Tetris → `Líneas`) or whether to hide it. Same for level.
8. **Controls** — which keys, and whether there is mouse input.
9. **Assets** — images, audio, extra scripts. Confirm they can be copied into `public/games/<id>/`.

**Hard constraint — do not negotiate around it.** `games.cat` and `games.color` have CHECK constraints in Supabase:

```
cat   = ANY (ARRAY['ARCADE','PUZZLE','SHOOTER'])
color = ANY (ARRAY['cyan','magenta','yellow','green'])
```

If the user asks for a value outside those lists, **stop and tell them**: the insert will fail, and widening the constraint means an `ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT` migration that affects every game. Offer the closest allowed value, or offer to add the constraint change as an explicit step in the spec. Never silently invent a value.

**Stop asking when** you can answer these three without assuming anything: which files will appear or change; what is the first and last executable step; how you verify the game is finished.

---

### Phase 3 — Write the spec

**You do not write a single line of application code in this phase.**

1. Determine `NN` by looking at `specs/`. If the last one is `06-...`, this one is `07-`.
2. Generate a short slug from the game (e.g. `tetris-game`, `arkanoid-game`).
3. **Ask the user whether `specs/NN-<slug>.md` works as a filename** before writing it.
4. Write the file following the shape of `specs/05-asteroids-game.md` and `specs/06-games-table-leaderboard-supabase.md`:

   ```markdown
   # SPEC NN — <Título corto>

   > **Estado:** Draft
   > **Depende de:** 06-games-table-leaderboard-supabase
   > **Fecha:** YYYY-MM-DD
   > **Objetivo:** <una sola frase>
   ```

   Sections, in order: `## Scope` (with `**In:**` and `**Fuera de alcance:**`, both mandatory), `## Data model`, `## Implementation plan` (numbered, each step ending with a `Verificación:` line), `## Acceptance criteria` (boolean checklist), `## Decisions` (`**Sí:** …` / `**No:** …` with a reason each).

5. The implementation plan must mirror Phase 4's steps below, named with the real file paths for this game. If `components/games/PlayShell.tsx` does not exist yet, **step 1 of the plan is creating it and migrating the Asteroids play-page onto it** — record that as an explicit decision in `## Decisions`, referencing that spec 05 deferred the extraction until the second canvas game arrived.
6. Leave the state as `Draft`. **Never mark it `Aprobado` yourself.**
7. Confirm to the user: the path of the file, that it is in `Draft`, that they should re-read it and change the state to `Aprobado` by hand, and that the next step is `/add-game NN-<slug>`.

**Stop here.** Do not continue to Phase 4 in the same invocation.

---

### Phase 4 — Implement (approved specs only)

**Gate.** Read the spec file and find its state line. You may only continue if the state **means "Approved"** in any language (`Approved`, `Aprobado`, `Aprovado`, `Approuvé`, …). Anything else — `Draft`, `Borrador`, `En revisión`, `Implementado`, `Obsoleto`, an unrecognised value, or no state line at all — means stop and print:

```
❌ No puedo implementar este spec.

Estado actual: [ESTADO ENCONTRADO]
Sólo trabajo con specs cuyo estado significa "Aprobado".

Para continuar tienes dos opciones:
  1. Si el spec está listo, ábrelo y cambia el estado a "Aprobado"
     manualmente. Ese cambio lo hace el humano, no el agente.
  2. Si el spec necesita más trabajo, vuelve a /add-game para retomarlo.
```

Do not offer alternatives. Do not create the branch. Do not touch code. The block is intentional.

**Branch.** Derive `spec-NN-<slug>` from the spec filename. If it does not exist, `git checkout -b spec-NN-<slug>`. If it does, say so (work is being resumed) and check it out. Confirm you are on it before continuing.

**Then show the spec's objective, scope, plan and acceptance criteria**, and ask: `¿Empezamos por el paso 1?` Wait for explicit confirmation.

Implement one step at a time. After each step, summarise the files you touched and ask `Paso N completado. ¿Revisas el diff y continúo con el paso N+1?`. Wait.

The steps, in this order:

**Step 1 — `PlayShell` (only if `components/games/PlayShell.tsx` does not exist).**
Create `components/games/types.ts` and `components/games/PlayShell.tsx` exactly as specified in `platform-contract.md`, then rewrite `app/games/asteroids/play/page.tsx` to use it. This is a pure refactor: **the rendered output and every behaviour must be identical**. `AsteroidsGame.tsx` is not touched — its existing props interface is structurally the same as `GameApi`. Verify by loading `/games/asteroids/play` and playing a full round before moving on.

**Step 2 — Port the game component.**
Create `components/games/<Name>Game.tsx` following `porting-recipe.md` to the letter. Its props are `GameApi`. Verification: `npx tsc --noEmit` is clean for the new file.

**Step 3 — Assets (skip if there are none).**
Copy binaries into `public/games/<id>/` and rewrite every hardcoded relative path to the absolute public URL (`assets/foo.png` → `/games/<id>/foo.png`). Convert cross-file globals into ES module imports. Verification: the network tab shows 200s, not 404s.

**Step 4 — Play-page.**
Create `app/games/<id>/play/page.tsx`. It is ~15 lines: `'use client'`, the `dynamic(..., { ssr: false })` import, and a `PlayShell` with the render-prop. Template in `platform-contract.md`.

**Step 5 — Cover art.**
Invoke `/frontend-design` for the visual direction (`CLAUDE.md` requires it for UI work), then add the `.cover-<slug>` block to `app/globals.css` inside the `/* ===== Cover art generators (pure CSS) ===== */` section, after the last existing `.cover-*` rule. Pure CSS, no images. Verification: the card renders on `/games` once step 6 is done.

**Step 6 — Register the game in Supabase.**
Use the `supabase` MCP server. First `mcp__supabase__list_tables` to confirm the schema has not drifted, then `mcp__supabase__execute_sql` with the insert (template in `platform-contract.md`), then a `SELECT` to verify the row landed. Do **not** try to insert from the browser client: RLS allows public `SELECT` on `games` but no public `INSERT`.

**Step 7 — Build and verify.**
`npm run build`. Then walk the routes and report what you actually saw, not what you expect: `/games`, `/games/<id>`, `/games/<id>/play`, `/hall-of-fame`, and `/games/asteroids/play` for regressions.

**If you hit an ambiguity the spec does not resolve:** stop, describe it, offer two or three concrete options, wait. Do not improvise.

**If the user asks for something outside the spec's scope:** remind them it is out of scope, suggest noting it for the next spec, do not implement it on this branch.

---

### Phase 5 — Acceptance criteria

Walk the spec's checklist one item at a time and report the **real** result of each. If something fails, say so with the output — do not tick it optimistically.

When they all pass:

```
✅ Todos los pasos del plan están implementados y los criterios de aceptación pasan.

Siguiente paso: cambia el estado del spec a "Implementado" y haz el commit
final antes de mergear la rama spec-NN-<slug>.
```

---

## Hard rules

- **Never write application code in Phase 3.** Only the spec's `.md`.
- **Never implement a spec that is not `Aprobado`.** The gate has no override.
- **Never invent `cat` or `color` values** outside the CHECK constraints.
- **Never insert into `games` from the browser client.** RLS blocks it — it goes through the Supabase MCP server.
- **Do not touch these — they are dead or auto-updating:**
  - `app/data/games.ts`, `app/data/scores.ts`, `app/data/index.ts` — all three are empty since spec 06. Nothing imports them. New games go into Supabase, not here.
  - `app/juego/`, `app/jugar/`, `app/salon/`, `lib/games.ts`, `lib/session.tsx`, `components/GameCard.tsx`, `components/GamePlayer.tsx`, `components/GameOverModal.tsx`, `components/Leaderboard.tsx` — legacy from spec 01, unreachable from the live tree.
  - `app/games/page.tsx`, `app/games/[id]/page.tsx`, `app/hall-of-fame/**` — they read from Supabase and pick the new game up on their own. Changing them means you did something wrong.
  - `app/games/[id]/play/page.tsx` — the generic fake player. The static route `app/games/<id>/play/` takes precedence over it in the App Router; leave it alone.
- **Read `node_modules/next/dist/docs/` before writing Next.js code.** `AGENTS.md` requires it — this Next.js version's APIs differ from training data. In particular, dynamic route `params` is a `Promise`.
- **Use `/frontend-design` for anything visual.** `CLAUDE.md` requires it.
- **One game per spec.** If the user wants three games, that is three specs and three runs.

---

## Arguments

- `/add-game 03-tetris` or `/add-game tetris` → Phase 1, Case A, using the reference folder.
- `/add-game 07-tetris-game` (a file that exists in `specs/`) → Phase 4, implementation.
- `/add-game un clon de Snake` → Phase 1, Case C, authored from scratch.
- `/add-game` with no arguments → list the un-integrated reference folders and ask.

---

## Summary of expected behavior

```
/add-game 04-arkanoid            (specs/ has 01..06)

  Routing →  "04-arkanoid" is not a file in specs/ → Phase 1
  Phase 1 →  Reads CLAUDE.md, AGENTS.md, platform-contract.md, specs 05 + 06,
             AsteroidsGame.tsx, the asteroids play-page, and the arkanoid folder.
             Case A. Reports: 800×600, mouse + arrows, no restart path,
             spritesheet PNG + 2 MP3s, canvas GAME OVER overlay.
  Phase 2 →  Asks in blocks: id/title/short/long → cat/color/cover → HUD/controls/assets
  Phase 3 →  Writes specs/07-arkanoid-game.md in Draft. STOPS.
             Plan step 1 = create PlayShell + migrate the asteroids play-page.

/add-game 07-arkanoid-game       (state: Draft)

  Routing →  matches specs/07-arkanoid-game.md → Phase 4
  Phase 4 →  Reads the state → "Draft" → ❌ stops with the block message.
             No branch, no code.

/add-game 07-arkanoid-game       (state: Aprobado)

  Routing →  Phase 4
  Phase 4 →  ✅ git checkout -b spec-07-arkanoid-game
             Shows objective / scope / plan / criteria → waits for "sí"
             Step 1  PlayShell + types.ts + asteroids play-page migrated   → pause
             Step 2  components/games/ArkanoidGame.tsx                     → pause
             Step 3  public/games/arkanoid/{spritesheet.png,*.mp3}         → pause
             Step 4  app/games/arkanoid/play/page.tsx                      → pause
             Step 5  /frontend-design → .cover-ladrillos in globals.css    → pause
             Step 6  MCP: INSERT INTO games → SELECT verifies the row      → pause
             Step 7  npm run build + walks /games, /games/arkanoid,
                     /games/arkanoid/play, /hall-of-fame, and asteroids
  Phase 5 →  Walks the acceptance criteria, reports real results,
             reminds to set the state to "Implementado" and commit.
```
