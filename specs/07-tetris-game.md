# SPEC 07 — Integración del juego Tetris

> **Estado:** Implementado
> **Depende de:** 06-games-table-leaderboard-supabase
> **Fecha:** 2026-08-13
> **Objetivo:** Integrar Tetris (canvas puro) como segundo juego jugable de la plataforma
> con ID `tetris`, extrayendo en el mismo movimiento el shell compartido `PlayShell` que
> el spec 05 dejó aplazado hasta la llegada de este segundo juego canvas.

---

## Scope

**In:**

- Crear `components/games/types.ts` con la interfaz `GameApi` — el contrato que implementa
  todo componente de juego (`paused`, `onScoreChange`, `onLivesChange`, `onLevelChange`,
  `onGameOver`).
- Crear `components/games/PlayShell.tsx` — extracción **sin cambio de comportamiento** de
  `app/games/asteroids/play/page.tsx`. Concentra el chrome de la plataforma: HUD React,
  marco CRT, overlay de pausa, modal de fin de partida, persistencia del score en Supabase
  y reinicio por remonte (`key`). Expone el juego vía render-prop.
- Migrar `app/games/asteroids/play/page.tsx` para que consuma `PlayShell`. La salida
  renderizada y el comportamiento deben ser idénticos a los actuales.
  `components/games/AsteroidsGame.tsx` **no se toca**.
- Crear `components/games/TetrisGame.tsx` — port de
  `references/started-games/03-tetris/game.js` siguiendo `porting-recipe.md`. Sus props
  son `GameApi`. La lógica del juego (colisión, rotación con wall kicks, limpieza de
  líneas, puntuación, curva de velocidad) se copia sin modificar.
- Componer los dos canvas del original (tablero 300×600 + preview 120×120) en un único
  backing store de 800×600, con layout simétrico y HUD dibujado en canvas.
- Fijar el skin **Neon** como único skin del port.
- Pantalla de inicio dibujada en canvas para elegir el nivel inicial (1–15) antes de
  empezar la partida.
- Crear `app/games/tetris/play/page.tsx` — play-page de ~15 líneas sobre `PlayShell`,
  con `livesLabel="Líneas"`, `livesDisplay="number"` e `initialLives={0}`.
- Añadir el bloque `.cover-tetris` a `app/globals.css`, dentro de la sección
  `/* ===== Cover art generators (pure CSS) ===== */` y después de la última regla
  `.cover-*` existente (`.cover-duelo`).
- Registrar la fila `tetris` en la tabla `games` de Supabase vía el servidor MCP.

**Fuera de alcance:**

- **Assets binarios** — el juego no tiene ninguno; todo se dibuja por código. No se crea
  `public/games/tetris/`.
- **Ghost piece** — se deja de dibujar (ver Decisions). `ghostY()` se conserva porque
  `hardDrop()` la necesita.
- **Skins seleccionables** (Retro / Pastel / Pixel) y su `<select>`.
- **Toggle de tema claro/oscuro** y la clave `tetris-theme` de `localStorage`.
- **Tabla de récords en `localStorage`** (`tetris_records`), su UI y el módulo completo
  (`loadRecords`, `saveRecord`, `isTopScore`, `clearRecords`, `renderLeaderboard`,
  `showStartLeaderboard`, `submitRecord`). El leaderboard es la tabla `scores` de Supabase.
- **Menú de pausa DOM** y el atajo de teclado `P` / `Esc`. `PlayShell` es el único dueño
  de la pausa.
- **Ampliar `GameApi`** con un callback de pausa (`onRequestPause`) — el contrato queda
  con los cinco miembros actuales.
- **`.cover-tetro`** — regla huérfana heredada del spec 01; se deja intacta y sin usar.
- Controles táctiles o móviles.
- Modificar `app/games/page.tsx`, `app/games/[id]/page.tsx`, `app/hall-of-fame/**` o
  `app/games/[id]/play/page.tsx`. Leen de Supabase y recogen el juego nuevo solos.

---

## Data model

### Fila en la tabla `games` (Supabase)

```sql
INSERT INTO games (id, title, short, long, cat, cover, color)
VALUES (
  'tetris',
  'TETRIS',
  'Encaja las piezas antes de que el pozo se te llene.',
  'Siete tetrominós y una tuerca metálica caen sin descanso en un pozo de diez columnas. Rota, desplaza y suéltalas para completar líneas: cada diez líneas sube el nivel y la caída se acelera. Encadena limpiezas seguidas para inflar el combo.',
  'PUZZLE',
  'cover-tetris',
  'cyan'
);
```

`cat = 'PUZZLE'` y `color = 'cyan'` respetan los CHECK constraints existentes
(`cat ∈ {ARCADE, PUZZLE, SHOOTER}`, `color ∈ {cyan, magenta, yellow, green}`). No hace
falta ninguna migración de esquema.

`id = 'tetris'` es la misma cadena en tres sitios: PK de `games`, carpeta de ruta
`app/games/tetris/play/` y `scores.game_id` de cada partida guardada.

### `components/games/types.ts`

```ts
export interface GameApi {
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
}
```

Estructuralmente idéntica a las props que `AsteroidsGame` ya declara — por eso la
extracción no obliga a tocarlo.

### Props de `PlayShell`

```ts
export interface PlayShellProps {
  gameId: string;                          // = games.id y carpeta de ruta
  gameTitle: string;                       // rótulo del bisel CRT
  children: (api: GameApi) => ReactNode;
  initialLives?: number;                   // default 3
  initialLevel?: number;                   // default 1
  livesLabel?: string | null;              // default 'Vidas'; null oculta el stat
  levelLabel?: string | null;              // default 'Nivel'; null oculta el stat
  livesDisplay?: 'hearts' | 'number';      // default 'hearts'
}
```

Valores para cada juego:

| Juego     | `initialLives` | `livesLabel` | `livesDisplay` | `initialLevel` | `levelLabel` |
| --------- | -------------- | ------------ | -------------- | -------------- | ------------ |
| asteroids | 3 (default)    | `Vidas`      | `hearts`       | 1              | `Nivel`      |
| tetris    | `0`            | `Líneas`     | `number`       | 1              | `Nivel`      |

### Mapeo de métricas del juego a los callbacks

| Variable interna | Callback         | Etiqueta en el HUD React |
| ---------------- | ---------------- | ------------------------ |
| `score`          | `onScoreChange`  | Puntuación               |
| `lines`          | `onLivesChange`  | Líneas                   |
| `level`          | `onLevelChange`  | Nivel                    |

`maxCombo` y `currentCombo` no viajan por el contrato: se pintan sólo en el HUD del canvas.

### Composición del backing store 800×600

El tablero se dibuja con las constantes originales intactas (`COLS 10`, `ROWS 20`,
`BLOCK 30` → 300×600) dentro de un `ctx.save()` / `translate` / `scale(0.9)` / `restore()`,
de modo que **ninguna coordenada de dibujo del original cambia**.

| Zona                    | Origen (x, y) | Tamaño efectivo | Contenido                          |
| ----------------------- | ------------- | --------------- | ---------------------------------- |
| Columna izquierda       | 30, 60        | ~215 × 480      | `SCORE`, `LÍNEAS`, `NIVEL`         |
| Tablero (escala 0.9)    | 265, 30       | 270 × 540       | rejilla, pila, pieza actual        |
| Preview `NEXT`          | 585, 90       | 120 × 120       | pieza siguiente, `NB = 30`, sin escalar |
| Bloque `COMBO`          | 585, 260      | ~185 × 90       | combo actual y máximo de la partida |

Fondo del tablero: `#000000` (el `boardBg` del skin Neon).
Rejilla: color literal `#22222e` — el valor de `--grid-line` del tema oscuro de
`03-tetris/style.css`, que ya no se puede leer con `getComputedStyle`.

### Máquina de estados del componente

```
'start'  ──ENTER/ESPACIO──▶  'playing'  ──spawn() colisiona──▶  'gameover'
   ▲                                                                │
   └──────────── remonte por key de PlayShell ◀─────────────────────┘
```

- `'start'` — pantalla de título con el selector de nivel inicial. `←` / `→` ajustan
  `startLevel` entre 1 y 15. `level` refleja `startLevel` en vivo, así que el HUD React
  acompaña la selección. No se acumula `dropAccum`.
- `'playing'` — partida normal.
- `'gameover'` — el loop sigue llamando a `draw()` pero no actualiza nada; el bridge
  dispara `onGameOver(score)` una sola vez.

No hay estado persistente nuevo: el score se guarda en `scores` vía `PlayShell` y el
nombre del jugador en la clave `av_player_name` de `localStorage`, ambos ya existentes.

---

## Implementation plan

1. **Crear el shell compartido y migrar Asteroids encima.**
   - `components/games/types.ts` con `GameApi`.
   - `components/games/PlayShell.tsx` con el contenido íntegro del chrome que hoy vive en
     `app/games/asteroids/play/page.tsx`: HUD React, marco CRT, overlay de pausa, modal de
     fin de partida, `saveScore()` contra Supabase, `restart()` por incremento de `gameKey`
     y lectura de `av_player_name` al abrir el modal.
   - Los stats `Vidas` y `Nivel` se vuelven opcionales vía `livesLabel` / `levelLabel`
     (`null` los oculta) y `livesDisplay` alterna entre corazones y número.
   - El render-prop se envuelve en un `<div key={gameKey} style={{ display: 'contents' }}>`
     para que el remonte no introduzca una caja que rompa el `width/height: 100%` del canvas.
   - Reescribir `app/games/asteroids/play/page.tsx` para que use `PlayShell` con
     `gameId="asteroids"`, `gameTitle="ASTEROIDS"` y los valores por defecto.
   - `components/games/AsteroidsGame.tsx` no se modifica.
     Verificación: `/games/asteroids/play` se juega una partida completa — HUD en tiempo
     real, PAUSA congela, modal al perder la última vida, guardar puntuación inserta en
     `scores`, JUGAR DE NUEVO arranca limpio. Todo idéntico a antes del cambio.

2. **Crear `components/games/TetrisGame.tsx`.**
   Port de `game.js` aplicando las transformaciones de `porting-recipe.md`:
   - Todo el cuerpo del script pasa a un único `useEffect(() => { … }, [])`; las variables
     de módulo se vuelven variables de closure (`let` / `const`), no `useRef`.
   - Props reflejadas en refs con su effect de sincronización de una línea cada una.
   - Canvas desde `useRef`, `800×600`, sin `document.getElementById`.
   - Se eliminan los ~25 handles al DOM y sus 8 listeners: HUD lateral, overlays, menú de
     pausa, tabla de récords, toggle de tema y selector de skins. `updateHUD()` desaparece
     junto a sus llamadas en `clearLines()`, `softDrop()`, `init()` y el handler de teclado.
   - `activeSkin` se fija a la definición **Neon** como constante; se borran las otras tres
     y `applySkin()`.
   - `drawGrid()` usa el literal `#22222e` en lugar de
     `getComputedStyle(document.body).getPropertyValue('--grid-line')`.
   - El bloque que dibuja el ghost en `draw()` se elimina; `ghostY()` permanece porque
     `hardDrop()` la usa.
   - `draw()` pasa a componer el frame completo de 800×600: fondo, tablero trasladado y
     escalado, HUD de la columna izquierda, preview `NEXT` y bloque `COMBO`, según la tabla
     de composición del Data model.
   - Nuevo estado `'start'` con la pantalla de selección de nivel inicial, sustituyendo al
     selector del menú de pausa DOM.
   - Loop: un único dueño de `rafId`; `loop()` nunca hace `return` anticipado ni cancela el
     RAF; `endGame()` sólo marca el estado. `dt` se sigue acumulando en milisegundos contra
     `dropInterval`, pero el delta crudo se limita con `Math.min(ts - lastTime, 50)` para
     que volver de otra pestaña no dispare una cascada de drops.
   - El gate de pausa se aplica en dos sitios: alrededor de la actualización dentro de
     `loop()` **y** dentro del handler de `keydown`, porque el movimiento vive ahí.
   - Listeners de teclado sobre `window` (no `document`), con nombre, y `preventDefault()`
     para flechas y espacio para que la página no haga scroll.
   - Bridge a React al final de `loop()`: sentinelas `prevScore` / `prevLines` / `prevLevel`
     inicializadas a `-1` y latch `gameOverFired`. `initGame()` resetea las cuatro.
   - Cleanup del effect: `cancelAnimationFrame(rafId)` y retirada de ambos listeners.
     Verificación: `npx tsc --noEmit` no reporta ningún error en el archivo nuevo.

3. **Crear `app/games/tetris/play/page.tsx`.**
   `'use client'`, import dinámico con `dynamic(..., { ssr: false })` y un `PlayShell` con
   `gameId="tetris"`, `gameTitle="TETRIS"`, `livesLabel="Líneas"`, `livesDisplay="number"`
   e `initialLives={0}`.
   Verificación: `/games/tetris/play` carga sin error de SSR y el juego es jugable; el HUD
   React muestra Jugador · Puntuación · Líneas · Nivel.

4. **Añadir `.cover-tetris` a `app/globals.css`.**
   Invocar `/frontend-design` para la dirección visual antes de escribir el CSS. Concepto
   «Pozo»: pila irregular de bloques en el tercio inferior, una pieza I cayendo con estela
   cyan y una rejilla tenue de fondo. CSS puro con `radial-gradient` / `linear-gradient` y
   `filter: drop-shadow(...)`, sin imágenes ni SVG. Se inserta después de `.cover-duelo`,
   dentro de la sección de generadores de portada.
   Verificación: la card de Tetris en `/games` muestra la portada una vez exista la fila en
   Supabase (paso 5).

5. **Registrar el juego en Supabase.**
   Vía servidor MCP `supabase`, en este orden: `list_tables` para confirmar que el esquema
   no ha derivado, `execute_sql` con el `INSERT` del Data model, y `execute_sql` con un
   `SELECT id, title, cat, cover, color FROM games ORDER BY created_at` para comprobar que
   la fila aterrizó. **No** se inserta desde el cliente browser: RLS permite `SELECT` público
   sobre `games` pero no `INSERT`.
   Verificación: el `SELECT` devuelve dos filas, `asteroids` y `tetris`.

6. **Build y recorrido de rutas.**
   `npm run build`, y después recorrer y reportar lo observado realmente en `/games`,
   `/games/tetris`, `/games/tetris/play`, `/hall-of-fame` y `/games/asteroids/play`
   (regresión del paso 1).
   Verificación: el build termina sin errores de TypeScript y ninguna ruta devuelve 500.

---

## Acceptance criteria

- [ ] `components/games/types.ts` exporta `GameApi` con los cinco miembros del contrato.
- [ ] `components/games/PlayShell.tsx` existe y expone el juego mediante render-prop.
- [ ] `app/games/asteroids/play/page.tsx` usa `PlayShell` y `AsteroidsGame.tsx` no ha sido
      modificado.
- [ ] `/games/asteroids/play` sigue comportándose exactamente igual: HUD en tiempo real,
      PAUSA, modal de fin de partida, guardado de score y JUGAR DE NUEVO.
- [ ] `components/games/TetrisGame.tsx` existe y sus props son `GameApi`.
- [ ] `/games/tetris/play` carga sin errores de SSR ni de TypeScript.
- [ ] La pantalla de inicio permite elegir el nivel inicial entre 1 y 15 con `←` / `→` y
      arrancar con `ENTER` o `ESPACIO`.
- [ ] El tablero, el preview `NEXT`, el HUD y el bloque `COMBO` se dibujan en un único
      canvas 800×600 sin deformarse dentro del marco CRT 4:3.
- [ ] Los controles funcionan: `←` `→` mover, `↑` / `X` rotar, `↓` soft drop,
      `ESPACIO` hard drop. Ninguno hace scroll de la página.
- [ ] Las líneas completas se limpian, `lines` sube, el nivel sube cada 10 líneas y la
      caída se acelera.
- [ ] El HUD React refleja en tiempo real puntuación, líneas y nivel, y coincide con el HUD
      del canvas.
- [ ] La pieza «tuerca» aparece en la rotación de piezas.
- [ ] El combo se muestra en el HUD del canvas y se reinicia cuando una pieza se bloquea sin
      completar líneas.
- [ ] La ghost piece ya no se dibuja.
- [ ] El botón PAUSA congela el juego — incluido el movimiento por teclado — y REANUDAR lo
      reanuda. `P` y `Esc` no hacen nada.
- [ ] Cuando una pieza no cabe al aparecer, se abre el modal React de fin de partida una
      sola vez, con la puntuación final correcta.
- [ ] JUGAR DE NUEVO devuelve a la pantalla de inicio con tablero vacío, score 0 y líneas 0.
- [ ] Al desmontar el componente no queda ningún `requestAnimationFrame` activo ni ningún
      listener de teclado enganchado.
- [ ] Cambiar de pestaña 30 segundos y volver no provoca una cascada de piezas.
- [ ] Ninguna clave `tetris_records`, `tetris-theme` ni `tetris-skin` se escribe en
      `localStorage`.
- [ ] `.cover-tetris` está en `app/globals.css` después de `.cover-duelo`, es CSS puro y no
      referencia ninguna imagen.
- [ ] La fila `tetris` está en la tabla `games`, confirmada con un `SELECT` real.
- [ ] `/games` muestra la card de Tetris con su portada y categoría `PUZZLE`.
- [ ] `/games/tetris` muestra el detalle y el leaderboard vacío con el mensaje
      «Sé el primero en entrar al salón de la fama».
- [ ] Guardar una puntuación la inserta en `scores` con `game_id = 'tetris'`, y aparece en
      `/games/tetris` y en `/hall-of-fame` al recargar.
- [ ] `npm run build` completa sin errores de TypeScript.

---

## Decisions

- **Sí: Extraer `PlayShell` en este spec.** El spec 05 registró explícitamente
  «No: Componente genérico `CanvasGame` — se extrae cuando llegue el segundo juego canvas».
  Tetris es ese segundo juego, así que la condición se cumple y la extracción entra como
  paso 1 del plan. Razón: duplicar 180 líneas de chrome por juego es exactamente lo que
  aquella decisión quería evitar.

- **Sí: La migración de Asteroids es un refactor puro.** Salida renderizada y comportamiento
  idénticos, y `AsteroidsGame.tsx` intacto. Razón: si el paso 1 cambia algo visible,
  cualquier fallo posterior se vuelve imposible de atribuir.

- **Sí: Componer los dos canvas en un backing store 800×600.** El tablero es 1:2 y
  `.crt-screen` es 4:3; estirar un canvas alto sobre una pantalla ancha lo deforma. Razón:
  es el único punto donde `porting-recipe.md` autoriza cambiar layout, y `objectFit: contain`
  hace el resto.

- **Sí: Escalar el tablero con `ctx.scale(0.9)` en lugar de tocar `BLOCK`.** Razón: `BLOCK`
  es una constante del original; escalar en el contexto deja todas las coordenadas de dibujo
  literalmente iguales a `game.js`.

- **Sí: Skin Neon fijo.** Bloques translúcidos con contorno y `shadowBlur` sobre fondo negro.
  Razón: es el único de los cuatro que habla el idioma neón-CRT de la plataforma; Pastel
  además pintaría un rectángulo blanco de 300×600 dentro del marco oscuro.

- **Sí: `lines` ocupa el hueco de `onLivesChange`, etiquetado «Líneas».** Razón: Tetris no
  tiene vidas, pero el contrato de `GameApi` es fijo; las líneas son la métrica secundaria
  natural y la que explica por qué sube el nivel.

- **Sí: Conservar la 8ª pieza «tuerca».** Anillo 3×3 que sale 1 de cada 8 veces. Razón: es
  lo que distingue a esta versión, y quitarla sería modificar la lógica del juego, cosa que
  `porting-recipe.md` prohíbe.

- **Sí: Conservar el combo y pintarlo en el HUD del canvas.** Razón: sólo alimentaba la tabla
  de récords que este spec elimina; sin un sitio donde mostrarse, todo el cálculo de
  `currentCombo` / `maxCombo` quedaría muerto.

- **Sí: Pantalla de inicio en canvas para el nivel inicial.** Estado `'start'` dentro del
  propio componente, con `←` / `→` y `ENTER`. Razón: conserva la función del menú de pausa
  DOM sin añadir superficie a `PlayShell` ni romper la regla de que una play-page son ~15
  líneas.

- **Sí: HUD dibujado en canvas además del HUD React.** Razón: continuidad con la decisión
  «Doble HUD» del spec 05 — el juego debe funcionar como standalone dentro del canvas.

- **Sí: Limitar el delta a 50 ms.** Razón: el original no lo hace; sin el límite, volver de
  otra pestaña acumula segundos en `dropAccum` y suelta una cascada de piezas.

- **No: Dibujar la ghost piece.** Se elimina el bloque de `draw()`; `ghostY()` se mantiene
  porque `hardDrop()` la necesita para calcular la caída. Razón: decisión explícita del
  usuario al definir el alcance de los extras.

- **No: Atajo de pausa `P` / `Esc`.** Razón: `PlayShell` es el dueño del estado `paused` y
  el componente sólo lo recibe; recuperarlo exigiría ampliar `GameApi` con un callback en el
  mismo spec que estrena el contrato.

- **No: Skins seleccionables ni toggle de tema.** Razón: su UI era DOM y desaparece con el
  port; la plataforma tiene un único tema oscuro y un `<select>` de skins competiría con el
  chrome del CRT.

- **No: Tabla de récords en `localStorage`.** Se borra el módulo completo. Razón: el
  leaderboard de la plataforma es la tabla `scores` de Supabase, y dos fuentes de verdad
  para la misma información es una de más.

- **No: Migración de esquema en Supabase.** `PUZZLE` y `cyan` ya están dentro de los CHECK
  constraints. Razón: ampliarlos afectaría a todos los juegos y no hay motivo para hacerlo.

- **No: Tocar `app/games/page.tsx`, `app/games/[id]/page.tsx` ni `app/hall-of-fame/**`.**
  Razón: leen de Supabase; si hiciera falta editarlos, sería señal de que la integración se
  hizo mal.
