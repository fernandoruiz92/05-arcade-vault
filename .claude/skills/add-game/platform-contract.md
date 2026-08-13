# Platform contract — what Arcade Vault requires of a game

Everything on this page was verified against the live repo and the live Supabase project. If something here disagrees with the code, the code wins — re-verify before proceeding.

---

## 1. The four things a game needs

| #   | Artifact          | Path                                                    |
| --- | ----------------- | ------------------------------------------------------- |
| 1   | Game component    | `components/games/<Name>Game.tsx`                       |
| 2   | Play route        | `app/games/<id>/play/page.tsx`                          |
| 3   | Cover art CSS     | a `.cover-<slug>` block in `app/globals.css`            |
| 4   | Database row      | one row in the Supabase `games` table                   |

Plus `public/games/<id>/…` if the game ships binary assets.

**Nothing else changes.** `/games`, `/games/[id]` and `/hall-of-fame` read from Supabase and pick the new game up with zero code changes. If you find yourself editing them, stop and re-read this file.

`<id>` is one string used in three places and they must match exactly: the `games.id` primary key, the route folder name, and the `game_id` written into every score row.

---

## 2. Supabase

Project schema, as it exists today:

### `games`

| Column       | Type          | Notes                                             |
| ------------ | ------------- | ------------------------------------------------- |
| `id`         | `text`        | PK, e.g. `'asteroids'`                            |
| `title`      | `text`        | uppercase, e.g. `'ASTEROIDS'`                     |
| `short`      | `text`        | one line, shown on the card                       |
| `long`       | `text`        | 2–3 sentences, shown on the detail page           |
| `cat`        | `text`        | **CHECK** — `'ARCADE'`, `'PUZZLE'` or `'SHOOTER'` |
| `cover`      | `text`        | the CSS class name, e.g. `'cover-rocas'`          |
| `color`      | `text`        | **CHECK** — `'cyan'`, `'magenta'`, `'yellow'` or `'green'` |
| `created_at` | `timestamptz` | default `now()`                                   |

There is **no `best` and no `plays` column**. `best` is derived at query time as the top row of the game's scores.

### `scores`

| Column        | Type          | Notes                              |
| ------------- | ------------- | ---------------------------------- |
| `id`          | `uuid`        | PK, default `gen_random_uuid()`    |
| `game_id`     | `text`        | FK → `games.id`                    |
| `player_name` | `text`        |                                    |
| `score`       | `integer`     |                                    |
| `user_id`     | `uuid`        | nullable, always `null` for now    |
| `created_at`  | `timestamptz` | default `now()`                    |

The FK means **the `games` row must exist before any score can be inserted**. Register the game before testing a round.

### RLS — this is why the insert goes through MCP

RLS is **enabled** on both tables. Current policies:

| Table    | Policy               | Command  |
| -------- | -------------------- | -------- |
| `games`  | Public read access   | `SELECT` |
| `scores` | Public read access   | `SELECT` |
| `scores` | Public insert access | `INSERT` |

There is **no public `INSERT` policy on `games`**. A `supabase.from('games').insert(...)` from the browser client will silently fail. Registering a game is a privileged operation and goes through the `supabase` MCP server.

### Registering the game

```
mcp__supabase__list_tables      # confirm the schema has not drifted
mcp__supabase__execute_sql      # the insert below
mcp__supabase__execute_sql      # SELECT to verify
```

```sql
INSERT INTO games (id, title, short, long, cat, cover, color)
VALUES (
  '<id>',
  '<TITLE>',
  '<short>',
  '<long>',
  '<ARCADE|PUZZLE|SHOOTER>',
  'cover-<slug>',
  '<cyan|magenta|yellow|green>'
);
```

Then:

```sql
SELECT id, title, cat, cover, color FROM games ORDER BY created_at;
```

If the user insists on a `cat` or `color` outside the allowed sets, that is a schema change, not an insert. It needs `mcp__supabase__apply_migration` with a `DROP CONSTRAINT` / `ADD CONSTRAINT` pair, and it affects every existing game. Make that an explicit, separate step in the spec — never fold it in silently.

### Supabase clients in app code

Both files export a function called `createClient`; the import path is what disambiguates them.

```ts
import { createClient } from '@/lib/supabase/client'; // browser, synchronous
const supabase = createClient();

import { createClient } from '@/lib/supabase/server'; // server, async
const supabase = await createClient();
```

Row types live in `lib/supabase/types.ts` (`GameRow`, `ScoreRow`), hand-written. There are no generated types.

---

## 3. `components/games/types.ts`

The contract every game component implements. Create this file if it does not exist.

```ts
export interface GameApi {
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
}
```

This is **structurally identical** to the props `AsteroidsGame` already declares, which is why extracting the shell does not require touching it.

The shape is fixed even when a game has no lives or no levels — the *labels* adapt, not the interface. Tetris feeds line count through `onLivesChange` and the play-page labels it `Líneas`. A game with no second metric passes `livesLabel={null}` and never calls the callback.

---

## 4. `components/games/PlayShell.tsx`

The shared play-page shell. It owns all the platform chrome — HUD, CRT frame, pause overlay, game-over modal, score persistence, restart — so a per-game play-page is ~15 lines.

It is a behaviour-preserving extraction of `app/games/asteroids/play/page.tsx`. When you create it, the Asteroids play-page must be migrated onto it in the same step and must behave identically.

```tsx
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useUser } from '@/app/context/UserContext';
import { createClient } from '@/lib/supabase/client';
import type { GameApi } from './types';

export interface PlayShellProps {
  /** Must match games.id and the route folder. Used for scores.game_id and the SALIR link. */
  gameId: string;
  /** Uppercase title shown on the CRT bezel, e.g. 'ASTEROIDS'. */
  gameTitle: string;
  children: (api: GameApi) => ReactNode;
  initialLives?: number;
  initialLevel?: number;
  /** null hides the stat entirely. */
  livesLabel?: string | null;
  levelLabel?: string | null;
  livesDisplay?: 'hearts' | 'number';
}

export default function PlayShell({
  gameId,
  gameTitle,
  children,
  initialLives = 3,
  initialLevel = 1,
  livesLabel = 'Vidas',
  levelLabel = 'Nivel',
  livesDisplay = 'hearts',
}: PlayShellProps) {
  const { user } = useUser();

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(initialLives);
  const [level, setLevel] = useState(initialLevel);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [name, setName] = useState(user ?? 'INVITADO');
  const [saved, setSaved] = useState(false);
  const [gameKey, setGameKey] = useState(0);

  const onScoreChange = useCallback((s: number) => setScore(s), []);
  const onLivesChange = useCallback((l: number) => setLives(l), []);
  const onLevelChange = useCallback((l: number) => setLevel(l), []);
  const onGameOver = useCallback((finalScore: number) => {
    setScore(finalScore);
    setOver(true);
  }, []);

  useEffect(() => {
    if (over) {
      const stored = localStorage.getItem('av_player_name');
      if (stored) setName(stored);
    }
  }, [over]);

  function restart() {
    setScore(0);
    setLives(initialLives);
    setLevel(initialLevel);
    setPaused(false);
    setOver(false);
    setSaved(false);
    setName(user ?? 'INVITADO');
    setGameKey((k) => k + 1);
  }

  async function saveScore() {
    setSaved(true);
    localStorage.setItem('av_player_name', name);
    const supabase = createClient();
    await supabase.from('scores').insert({
      game_id: gameId,
      player_name: name,
      score,
      user_id: null,
    });
  }

  return (
    <div className="av-player fade-in">
      <div className="player-hud">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div className="hud-stat">
            <div className="l">Jugador</div>
            <div className="v" style={{ color: 'var(--ink)' }}>
              {name}
            </div>
          </div>
          <div className="hud-stat">
            <div className="l">Puntuación</div>
            <div className="v">{score.toLocaleString('es-ES')}</div>
          </div>
          {livesLabel !== null && (
            <div className="hud-stat lives">
              <div className="l">{livesLabel}</div>
              <div className="v">
                {livesDisplay === 'hearts'
                  ? '♥ '.repeat(Math.max(0, lives)).trim() || '—'
                  : lives.toLocaleString('es-ES')}
              </div>
            </div>
          )}
          {levelLabel !== null && (
            <div className="hud-stat level">
              <div className="l">{levelLabel}</div>
              <div className="v">{String(level).padStart(2, '0')}</div>
            </div>
          )}
        </div>
        <div className="hud-actions">
          <button className="btn yellow" onClick={() => setPaused((p) => !p)}>
            {paused ? 'REANUDAR' : 'PAUSA'}
          </button>
          <button className="btn magenta" onClick={() => setOver(true)}>
            FIN
          </button>
          <Link href={`/games/${gameId}`} className="btn ghost">
            SALIR
          </Link>
        </div>
      </div>

      <div className="crt">
        <div className="crt-screen">
          {/* key remounts the game on "JUGAR DE NUEVO" — the effect tears down and re-runs */}
          <div key={gameKey} style={{ display: 'contents' }}>
            {children({
              paused,
              onScoreChange,
              onLivesChange,
              onLevelChange,
              onGameOver,
            })}
          </div>
          {paused && (
            <div
              className="crt-content"
              style={{ background: 'rgba(0,0,0,0.6)', zIndex: 5 }}
            >
              <div>
                <div className="pixel neon-yellow" style={{ fontSize: 22 }}>
                  EN PAUSA
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: 'var(--ink-dim)',
                    marginTop: 10,
                    letterSpacing: '0.16em',
                  }}
                >
                  PULSA REANUDAR PARA CONTINUAR
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="crt-bottom">
          <span className="led">SEÑAL OK</span>
          <span>{gameTitle} · CRT-83 · 60 HZ</span>
          <span>CARGA · 1MB</span>
        </div>
      </div>

      {over && (
        <div className="modal-bd">
          <div className="modal">
            <h2>FIN DEL JUEGO</h2>
            <div className="final-label">PUNTUACIÓN FINAL</div>
            <div className="final">{score.toLocaleString('es-ES')}</div>
            {!saved ? (
              <div className="input-row">
                <input
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value.toUpperCase().slice(0, 10))
                  }
                  placeholder="TUS INICIALES"
                />
                <button className="btn yellow" onClick={saveScore}>
                  GUARDAR PUNTUACIÓN
                </button>
              </div>
            ) : (
              <div className="toast-saved">▸ PUNTUACIÓN GUARDADA_</div>
            )}
            <div className="actions">
              <button className="btn" onClick={restart}>
                JUGAR DE NUEVO
              </button>
              <Link href="/games" className="btn magenta">
                VOLVER AL VAULT
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Notes on the remount wrapper.** `display: contents` makes the wrapper generate no box, so the canvas keeps `.crt-screen` as its containing block and `width/height: 100%` resolve exactly as they do today. If a game turns out to be sensitive to it, swap the wrapper for `style={{ position: 'absolute', inset: 0 }}` — do not move the `key` onto the game component, because the render-prop caller would then have to remember it.

**`setSaved(true)` fires before the insert awaits.** That is deliberate — it disables the button immediately and prevents a double submission. Keep it.

---

## 5. Per-game play-page

```tsx
'use client';

import dynamic from 'next/dynamic';
import PlayShell from '@/components/games/PlayShell';

const TetrisGame = dynamic(() => import('@/components/games/TetrisGame'), {
  ssr: false,
});

export default function TetrisPlay() {
  return (
    <PlayShell
      gameId="tetris"
      gameTitle="TETRIS"
      livesLabel="Líneas"
      livesDisplay="number"
      initialLives={0}
    >
      {(api) => <TetrisGame {...api} />}
    </PlayShell>
  );
}
```

`dynamic(..., { ssr: false })` is **mandatory**: the game's effect touches `window`, `document` and `requestAnimationFrame`, none of which exist during SSR.

The static route `app/games/<id>/play/` wins over the dynamic `app/games/[id]/play/` in the App Router, so the generic fake player is bypassed automatically. Leave that file alone.

---

## 6. CSS contract (`app/globals.css`)

### Cover art

Find the section marked:

```css
/* ===== Cover art generators (pure CSS) ===== */
```

`.cover-bg { position: absolute; inset: 0; }` is the wrapper the cards and detail page render; each game supplies exactly one `.cover-<slug>` class. Consumed as:

```tsx
<div className={`cover-bg ${game.cover}`} />
```

The house pattern: a `background` gradient on the class itself, then a `::after` (and optionally a `::before`) with `content: ""; position: absolute; inset: 0;` that draws shapes with layered `radial-gradient` / `linear-gradient`, finished with a `filter: drop-shadow(0 0 Npx rgba(<accent>, 0.4–0.6))`. Pure CSS — no images, no SVG files. Read `.cover-rocas`, `.cover-tetro` and `.cover-invaders` before writing a new one.

Add the new block **after the last existing `.cover-*` rule**, still inside the section.

### Design tokens

```css
--bg: #0a0a0f;  --ink: #e6e9ff;  --ink-dim: #8a8fb5;  --ink-faint: #4a4f70;
--cyan: #00f5ff;  --magenta: #ff006e;  --yellow: #f5ff00;  --green: #00ff88;
--gold: #ffcf3a;  --silver: #c7d0e0;  --bronze: #d97a3a;
--line: rgba(0, 245, 255, 0.18);
--pixel: "Press Start 2P", system-ui, monospace;
--mono: "JetBrains Mono", "Courier Prime", "Courier New", monospace;
```

Utilities: `.pixel`, `.mono`, `.neon-cyan`, `.neon-magenta`, `.neon-yellow`, `.neon-green`, `.fade-in`, `.blink`, `.flicker`, `.reveal`.
Buttons: `.btn` plus `.magenta`, `.yellow`, `.ghost`, `.lg`, `.xl`, `.pulse`, `.press`. There is no `.cyan` modifier — cyan is the default.

### Classes `PlayShell` depends on

`.av-player`, `.player-hud`, `.hud-stat` (with `.l` / `.v`, and the `.lives` / `.level` variants that recolour `.v`), `.hud-actions`, `.crt`, `.crt-screen`, `.crt-content`, `.crt-bottom`, `.led`, `.modal-bd`, `.modal`, `.final-label`, `.final`, `.input-row`, `.actions`, `.toast-saved`.

**`.crt-screen` has `aspect-ratio: 4/3`.** A game whose canvas is not 4:3 will letterbox inside it. That is fine — `objectFit: 'contain'` on the canvas handles it — but for anything far from 4:3 (Tetris is 1:2) compose the whole playfield into an 800×600 backing store instead of stretching a tall canvas across a wide screen.

The app is ~99% hand-written CSS. Tailwind v4 is installed but only `app/layout.tsx` uses it. Do not introduce Tailwind classes into game UI.

---

## 7. Routes that pick the game up for free

| Route                | Rendering              | What it does                                                                   |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `/games`             | async Server Component | `select('*').order('created_at')` → passes `GameRow[]` to the client grid       |
| `/games/[id]`        | async Server Component | game by id `.single()` + top 10 scores `order('score', desc).limit(10)`; `notFound()` if missing |
| `/hall-of-fame`      | server + client tabs   | all games for the tabs, top 12 scores per tab                                  |
| `/games/<id>/play`   | client                 | yours                                                                          |

Empty leaderboards already render "Sé el primero en entrar al salón de la fama" — a new game with no scores looks correct on day one.

Dynamic route `params` is a `Promise` in this Next.js version. Server pages `await params`; the client one uses `use(params)`.

---

## 8. Integration checklist

Walk this at the end of every run and report what you actually observed:

- [ ] `components/games/<Name>Game.tsx` exists and its props are `GameApi`
- [ ] `app/games/<id>/play/page.tsx` exists and uses `dynamic(..., { ssr: false })`
- [ ] `.cover-<slug>` block added to `app/globals.css`
- [ ] Row present in `games` — confirmed with a `SELECT`, not assumed
- [ ] Assets, if any, served from `public/games/<id>/` with rewritten paths
- [ ] `npm run build` completes with no TypeScript errors
- [ ] `/games` shows the new card with its cover art
- [ ] `/games/<id>` shows the detail and the (initially empty) leaderboard
- [ ] `/games/<id>/play` is playable; PAUSA freezes it; the game-over modal appears
- [ ] Saving a score inserts into `scores` and the name persists to `av_player_name`
- [ ] The score appears on `/games/<id>` and `/hall-of-fame` after a reload
- [ ] `/games/asteroids/play` still works — no regression from the `PlayShell` extraction
