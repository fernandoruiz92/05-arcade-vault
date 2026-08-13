# Porting recipe — vanilla canvas game → Arcade Vault React component

`components/games/AsteroidsGame.tsx` is the worked example of everything on this page. Read it before and after you port anything.

The single most important rule: **the game logic does not change.** Physics, collision math, constants, drawing code, the state machine — all of it is copied across verbatim. Every transformation below is structural. When the port is done, a diff against the original should show only the moves listed here. If you found yourself rewriting how the game plays, you went too far.

---

## The shape of the result

```tsx
'use client';

import { useEffect, useRef } from 'react';
import type { GameApi } from './types';

export default function ExampleGame({
  paused,
  onScoreChange,
  onLivesChange,
  onLevelChange,
  onGameOver,
}: GameApi) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── T4: props mirrored into refs, so the main effect can have [] deps ──
  const pausedRef = useRef(paused);
  const cbScore = useRef(onScoreChange);
  const cbLives = useRef(onLivesChange);
  const cbLevel = useRef(onLevelChange);
  const cbOver = useRef(onGameOver);

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { cbScore.current = onScoreChange; }, [onScoreChange]);
  useEffect(() => { cbLives.current = onLivesChange; }, [onLivesChange]);
  useEffect(() => { cbLevel.current = onLevelChange; }, [onLevelChange]);
  useEffect(() => { cbOver.current = onGameOver; }, [onGameOver]);

  useEffect(() => {
    // ── T3: canvas from the ref, not document.getElementById ──
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const W = 800;
    const H = 600;

    // ── T5: everything that was module scope in the original lives here ──
    //        plain `let`, NOT useRef. Classes, constants, utils, state.
    const keys: Record<string, boolean> = {};
    let score: number, lives: number, level: number;
    let state: 'playing' | 'dead' | 'gameover';

    // ── T12: the React bridge. New code with no original counterpart. ──
    let gameOverFired = false;
    let prevScore = -1, prevLives = -1, prevLevel = -1;

    function initGame() {
      score = 0; lives = 3; level = 1; state = 'playing';
      gameOverFired = false;
      prevScore = -1; prevLives = -1; prevLevel = -1;
      // …reset every other game variable…
    }

    function update(dt: number) { /* unchanged from the original */ }
    function draw() { /* unchanged, minus the game-over overlay (T10) */ }

    // ── T6: named handlers, so cleanup can remove them ──
    function onKeyDown(e: KeyboardEvent) { /* … */ }
    function onKeyUp(e: KeyboardEvent) { keys[e.code] = false; }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let rafId: number;
    let lastTime: number | null = null;

    function loop(ts: number) {
      // dt in seconds, capped — see "Rules the recipe adds"
      const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
      lastTime = ts;

      if (!pausedRef.current) update(dt); // ── T9: pause freezes update, keeps drawing
      draw();

      if (score !== prevScore) { cbScore.current(score); prevScore = score; }
      if (lives !== prevLives) { cbLives.current(lives); prevLives = lives; }
      if (level !== prevLevel) { cbLevel.current(level); prevLevel = level; }
      if (state === 'gameover' && !gameOverFired) {
        gameOverFired = true;
        cbOver.current(score);
      }

      rafId = requestAnimationFrame(loop); // ── T7: handle captured
    }

    initGame();
    rafId = requestAnimationFrame(loop);

    // ── T8: cleanup. The biggest correctness win of the whole port. ──
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // ── T14 ──
  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={600}
      style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
    />
  );
}
```

---

## The transformations

| #   | Transformation                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | `'use strict'` → `'use client'` + `import { useEffect, useRef } from 'react'`                                                                                                                          |
| T2  | Declare the props as `GameApi` (from `components/games/types.ts`)                                                                                                                                      |
| T3  | `document.getElementById('canvas')` → `useRef<HTMLCanvasElement>(null)`; read it inside the effect                                                                                                      |
| T4  | Mirror every prop into a ref, each with its own one-line sync effect. This is what lets the main effect keep `[]` deps while still seeing current props.                                                |
| T5  | Move the entire script body into one `useEffect(() => { … }, [])`. Module-scope `let`/`const` become effect-scope `let`/`const` — **plain closure variables, not `useRef`.** Only props become refs.    |
| T6  | Inline arrow listeners → named functions. Keyboard on `window`; pointer events on `canvasRef.current`.                                                                                                  |
| T7  | Capture the RAF handle: `rafId = requestAnimationFrame(loop)` at boot and inside the loop.                                                                                                              |
| T8  | Return a cleanup that calls `cancelAnimationFrame(rafId)` and removes **every** listener you added.                                                                                                     |
| T9  | Gate the loop: `if (!pausedRef.current) update(dt); draw();`                                                                                                                                            |
| T10 | Delete the in-canvas GAME OVER / WIN overlay (function **and** call site). Leave a one-line comment where the call was. The React modal replaces it.                                                     |
| T11 | Delete the in-game restart (a key handler, a DOM button, whatever it is). `PlayShell` remounts the component by changing its `key`.                                                                      |
| T12 | Add the change-detection bridge: `prevScore` / `prevLives` / `prevLevel` sentinels initialised to `-1`, and a `gameOverFired` latch. Fire the callbacks at the tail of `loop()`, after `draw()`.         |
| T13 | Add TypeScript annotations: class fields typed (use `!` when assigned in `reset()` rather than the constructor), `keys` as `Record<string, boolean>`, the state string as a literal union, return types. |
| T14 | Canvas markup → JSX. Keep the original `width`/`height` as attributes (the backing store, and all the game math, stay untouched); make the CSS size fluid.                                               |

`initGame()` must also reset `gameOverFired` and the three `prev*` sentinels — otherwise a remount that reuses stale values silently swallows the first callback of the new round.

The `prev*` guards are not an optimisation, they are load-bearing: without them you call `setState` 60 times a second on every metric.

---

## Rules the recipe adds even when the original lacks them

- **Cap the delta.** `Math.min((ts - lastTime) / 1000, 0.05)`. Without it, switching browser tabs produces a huge `dt` and objects tunnel through walls on the next frame. Asteroids has this; Arkanoid and Tetris do not — add it.
- **No private leaderboard.** Delete any `localStorage` high-score table the game ships with. The leaderboard is the Supabase `scores` table, and `PlayShell` owns writing to it.
- **`localStorage` is SSR-unsafe.** Any remaining use must be inside the effect, never at module scope.
- **Async asset loaders need an unmount guard.** If the game boots from a callback (`loadSpritesheet(cb)`), set `let cancelled = false;`, check it inside the callback before starting the loop, and set `cancelled = true` in the cleanup. Otherwise a fast unmount leaves an orphan RAF chain running.
- **Audio needs a user gesture.** `new Audio(...).play()` before the first interaction throws in Chrome. Wrap playback in `.play().catch(() => {})`.
- **Keep the canvas HUD.** Spec 05 decided the canvas keeps drawing its own score/lives/level while React shows the same values — deliberate double HUD. Do not remove it.
- **Delete the DOM HUD.** If the game writes its HUD into DOM nodes (`getElementById(...).textContent = …`), those nodes do not exist here. Remove the handles and the update function; the values now travel through the callbacks.
- **Pointer coordinates need scale correction.** The canvas backing store is 800×600 but it is displayed at `width: 100%`. Any `mousemove` / `click` handler must convert:

  ```ts
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;
  ```

- **Assets move to `public/`.** `assets/sprite.png` → `public/games/<id>/sprite.png`, referenced as `/games/<id>/sprite.png`. Relative paths do not resolve from a Next.js route.
- **Cross-file globals become imports.** A game split across `spritesheet.js` + `levels.js` + `game.js` that relies on script load order must become real ES modules (or be inlined into the component). Pure data files like a levels table port cleanly as a `const` export.

---

## Notes per reference game

### `references/started-games/02-asteroids` — already integrated

The worked example. 423 lines of vanilla → 523 lines of TSX, all logic identical. Use it to check your work; do not port it again.

### `references/started-games/04-arkanoid` — medium difficulty

- Canvas `#game` 800×600. Uses `canvas.width` / `canvas.height` directly rather than `W`/`H` constants — fine, keep it.
- Three scripts loaded in order (`assets/spritesheet.js` → `levels.js` → `game.js`) communicating through globals. Convert to ES modules.
- Binary assets: `spritesheet-breakout.png`, `ball-bounce.mp3`, `break-sound.mp3` → `public/games/arkanoid/`. `spritesheet.js` hardcodes `'assets/spritesheet-breakout.png'` — rewrite it.
- **Async boot:** `loadSpritesheet(() => { initPaddle(); loadLevel(1); requestAnimationFrame(loop); })`. Needs the `cancelled` guard.
- Input: `document` keydown/keyup using `e.key` (not `e.code`), **plus** `canvas` `mousemove` (paddle follows the cursor) and `canvas` `click`. The existing mouse code already does `getBoundingClientRect()` scaling — keep it, it is exactly right.
- The click handler hit-tests five level-skip buttons drawn on the canvas inside `drawPauseOverlay()`. Remove the overlay, the buttons, the `PAUSE_BTN_*` constants and the click handler — `PlayShell` owns pause.
- `isPaused` already gates `update(dt)` while `draw()` always runs, so T9 maps one-to-one onto the existing structure.
- **There is no restart path at all** — `'gameover'` and `'win'` are terminal. That is fine; the remount handles it. But note there is a `'win'` state as well as `'gameover'`: both must fire `onGameOver(score)`.
- No `dt` cap. Add it.
- `levels.js` exports 5 levels as pure data — port as a `const`.
- Read `04-arkanoid/CLAUDE.md` first; it documents the architecture (and note it disagrees with the code on `paddle.w` — the code says 81, the doc says 162; trust the code).

### `references/started-games/03-tetris` — hardest

- **Two canvases:** `#board` 300×600 (`COLS 10 × ROWS 20 × BLOCK 30`) and `#next-canvas` 120×120.
- **Aspect ratio conflict.** The board is 1:2; `.crt-screen` is 4:3. Do not stretch it. Compose both playfield and next-piece preview into a single 800×600 backing store — board centred, preview and any decoration beside it — and let `objectFit: contain` letterbox the result. This is the one place where the port legitimately changes layout code.
- **The HUD, pause menu, game-over overlay, records table, theme toggle and skin selector are all DOM** — roughly 25 `getElementById` handles and 8 click listeners. All of it goes. `updateHUD()` becomes the callback bridge.
- **Three `localStorage` keys:** `tetris_records`, `tetris-theme`, `tetris-skin`. Delete the records module entirely (Supabase owns the leaderboard). Themes and skins are out of scope for the port unless the spec says otherwise — pick one skin and hardcode it.
- `drawGrid()` reads `getComputedStyle(document.body).getPropertyValue('--grid-line')`. Replace with a literal colour constant; the game no longer lives inside `03-tetris/style.css`.
- The loop uses `dt` in **milliseconds** accumulated into `dropAccum` vs `dropInterval` — that is fine, keep the ms accumulator, but still clamp the raw delta.
- `endGame()` and `togglePause()` call `cancelAnimationFrame(animId)` and restart the chain. Rewrite to the flag-gate pattern (T9): one owner for `rafId`, and `loop()` never returns early.
- **Movement happens inside the keydown handler, not in `update()`.** So the `paused` gate must also be applied inside the handler, not only around `update(dt)`.
- Metric mapping: there are no lives. Feed `lines` through `onLivesChange` and set `livesLabel="Líneas"` / `livesDisplay="number"` on `PlayShell`.

---

## Case C — authoring a game from scratch

No port, same contract. Write it directly as the component:

- Canvas 800×600 (4:3, matching `.crt-screen`).
- One `requestAnimationFrame` loop, `dt` in seconds, capped at `0.05`.
- `score`, `lives`, `level` as plain numbers in the effect closure.
- An idempotent `initGame()` that resets every variable including the bridge sentinels.
- A single string state variable for the machine (`'playing' | 'dead' | 'gameover'`).
- Canvas-drawn HUD, matching the Asteroids layout: score left, level centre, life icons right.
- **No** game-over overlay, **no** restart key, **no** pause UI, **no** `localStorage`.
- Every listener registered inside the effect and removed in the cleanup.

---

## Self-check before declaring the port done

- Unmounting the component leaves **no** running RAF and **no** attached listeners.
- Pressing PAUSA freezes motion but the canvas keeps repainting.
- The React HUD updates in real time and matches the canvas HUD.
- Losing the last life opens the React modal exactly once, with the correct final score.
- "JUGAR DE NUEVO" starts a genuinely fresh round — no leftover entities, no stale score.
- Switching to another browser tab for 30 seconds and coming back does not teleport anything.
- `npx tsc --noEmit` is clean.
- The game's original in-canvas / in-DOM game-over and restart affordances are gone.
