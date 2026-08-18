# SPEC 09 — Integración del juego Snake

> **Estado:** Implementado
> **Depende de:** 06-games-table-leaderboard-supabase, 07-tetris-game
> **Fecha:** 2026-08-14
> **Objetivo:** Integrar Snake, escrito desde cero (no hay código fuente del juego, sólo un
> spritesheet de frutas), como cuarto juego jugable de la plataforma con ID `snake`,
> reutilizando el `PlayShell` existente.

---

## Scope

**In:**

- Crear `components/games/snake/sprites.ts` — port de
  `references/source-assets/snake-assets/sprites.js` como módulo ES: se elimina el global
  `window.SPRITE_ATLAS` y se exporta `export const SPRITE_ATLAS = { fruits: { ... } }` con
  las 22 entradas `{ x, y, w, h }` intactas (fila pixel-art, y=136–295, de `fruits.png`).
  La ruta de la imagen pasa a `/games/snake/fruits.png`.
- Copiar `fruits.png` a `public/games/snake/fruits.png`.
- Crear `components/games/SnakeGame.tsx` — juego nuevo (Caso C de `porting-recipe.md`, sin
  código de referencia que portar). Tablero de cuadrícula clásico, movimiento por tick,
  fruta dibujada con el spritesheet, cuerpo dibujado con formas de canvas.
- Crear `app/games/snake/play/page.tsx` — play-page de ~15 líneas sobre `PlayShell` con
  `livesLabel="Longitud"`, `livesDisplay="number"`, `initialLives={1}`.
- Añadir el bloque `.cover-snake` a `app/globals.css`, dentro de la sección
  `/* ===== Cover art generators (pure CSS) ===== */` y después de la última regla
  `.cover-*` existente (`.cover-arkanoid`).
- Registrar la fila `snake` en la tabla `games` de Supabase vía el servidor MCP.

**Fuera de alcance:**

- **Wrap-around en los bordes.** Se descartó explícitamente: tocar cualquier borde del
  tablero es game over, igual que chocar contra el propio cuerpo.
- **Ciclo fijo de frutas.** Cada spawn elige una fruta aleatoria de las 22 del atlas; no
  hay una secuencia determinista.
- **Obstáculos, power-ups, múltiples frutas simultáneas, comida especial temporizada.**
- **Ampliar `GameApi`** con nuevos callbacks. El contrato queda con los cinco miembros
  actuales.
- **Menú de pausa propio, overlay de game over en canvas, tabla de récords en
  `localStorage`.** `PlayShell` es el único dueño de la pausa, el modal de fin de partida y
  el guardado de puntuación.
- Controles táctiles o móviles.
- Migración de esquema en Supabase — `ARCADE` y `green` ya están dentro de los CHECK
  constraints.
- Modificar `app/games/page.tsx`, `app/games/[id]/page.tsx`, `app/hall-of-fame/**` o
  `app/games/[id]/play/page.tsx`. Leen de Supabase y recogen el juego nuevo solos.
- `components/games/AsteroidsGame.tsx`, `TetrisGame.tsx`, `ArkanoidGame.tsx` y
  `PlayShell.tsx` no se modifican.

---

## Data model

### Fila en la tabla `games` (Supabase)

```sql
INSERT INTO games (id, title, short, long, cat, cover, color)
VALUES (
  'snake',
  'SNAKE',
  'Come, crece y no te muerdas la cola.',
  'Guía a la serpiente por el tablero para devorar fruta tras fruta. Cada bocado la alarga y acelera el ritmo del juego — un golpe contra el borde o contra tu propio cuerpo termina la partida al instante.',
  'ARCADE',
  'cover-snake',
  'green'
);
```

`cat = 'ARCADE'` y `color = 'green'` respetan los CHECK constraints existentes
(`cat ∈ {ARCADE, PUZZLE, SHOOTER}`, `color ∈ {cyan, magenta, yellow, green}`). No hace
falta ninguna migración de esquema. `green` es el único color de acento aún libre
(`asteroids` usa `yellow`, `tetris` usa `cyan`, `arkanoid` usa `magenta`).

`id = 'snake'` es la misma cadena en tres sitios: PK de `games`, carpeta de ruta
`app/games/snake/play/` y `scores.game_id` de cada partida guardada.

### Mapeo de métricas del juego a los callbacks

| Variable interna | Callback         | Etiqueta en el HUD React | Display  |
| ----------------- | ---------------- | ------------------------ | -------- |
| `score`           | `onScoreChange`  | Puntuación                | número   |
| `snake.length`    | `onLivesChange`  | Longitud                  | `number` |
| `level`           | `onLevelChange`  | Nivel                     | `01`–…   |

Snake clásico no tiene vidas; el hueco de `onLivesChange` lo ocupa la longitud actual de la
serpiente, siguiendo el mismo patrón que spec 07 usó para `lines` en Tetris (etiqueta que
no es literalmente "vidas" pero usa el mismo canal).

| Juego     | `initialLives` | `livesLabel` | `livesDisplay` | `initialLevel` | `levelLabel` |
| --------- | --------------- | ------------ | --------------- | --------------- | ------------ |
| asteroids | 3 (default)     | `Vidas`      | `hearts`        | 1                | `Nivel`      |
| tetris    | `0`             | `Líneas`     | `number`        | 1                | `Nivel`      |
| arkanoid  | 3 (default)     | `Vidas`      | `hearts`        | 1                | `Nivel`      |
| snake     | `1`             | `Longitud`   | `number`        | 1                | `Nivel`      |

### Tablero y reglas

- Cuadrícula clásica: `COLS = 32`, `ROWS = 24`, `CELL = 25` → backing store `800×600`,
  igual que el resto de juegos (4:3, coincide con `.crt-screen`).
- La serpiente se mueve por tick de tiempo fijo (no por frame): `tickInterval` empieza en
  `150 ms` y decrece con cada subida de nivel, con un piso (`minTickInterval`) para que
  nunca se vuelva injugable.
- `level` sube cada 5 frutas comidas; cada subida reduce `tickInterval` en un 8%,
  redondeado, sin bajar de `70 ms`.
- Un único input por tick: la dirección se actualiza en el handler de teclado pero el
  giro sólo se aplica en el siguiente tick, y nunca se acepta un giro de 180° directo
  (por ejemplo, ir a la derecha y pulsar izquierda en el mismo tick) porque eso mataría a
  la serpiente contra su propio segundo segmento de forma instantánea e injusta para el
  jugador.
- La fruta se coloca en una celda libre aleatoria (no ocupada por el cuerpo) al arrancar y
  cada vez que se come una. El sprite de cada fruta se elige aleatoriamente entre las 22
  entradas de `SPRITE_ATLAS.fruits` en cada spawn; todas otorgan el mismo puntaje
  (`+10` por fruta).
- Game over: la cabeza sale de los límites del tablero (`x < 0 || x >= COLS || y < 0 || y
  >= ROWS`) o colisiona con cualquier segmento de su propio cuerpo.

### Assets

| Origen                                                       | Destino en `public/`             | Referencia en código          |
| ------------------------------------------------------------ | --------------------------------- | ------------------------------ |
| `references/source-assets/snake-assets/fruits.png`           | `public/games/snake/fruits.png`   | `/games/snake/fruits.png`      |

`sprites.js` no es un binario — se reescribe como módulo TS (`components/games/snake/sprites.ts`)
en vez de copiarse a `public/`.

### Tipos TypeScript nuevos (T13)

```ts
interface Point { x: number; y: number }
type Direction = 'up' | 'down' | 'left' | 'right';
type GameState = 'playing' | 'gameover';
interface FruitFrame { x: number; y: number; w: number; h: number }
```

No se introduce ningún modelo de datos persistente nuevo: el score va a la tabla `scores`
vía `PlayShell` y el nombre del jugador a la clave `av_player_name` de `localStorage`,
ambos ya existentes.

### Máquina de estados del componente

```
'playing' ──sale del tablero o choca contra su cuerpo──▶ 'gameover' ──▶ onGameOver(score) (una sola vez)
   ▲                                                                          │
   └────────────────────── remonte por key de PlayShell ◀─────────────────────┘
```

No hay estado de pausa propio ni de inicio: `PlayShell` controla la pausa vía la prop
`paused`, y la partida arranca directamente en `'playing'` al montar el componente (Snake
no necesita pantalla de selección de nivel inicial como Tetris).

---

## Implementation plan

> El paso de crear `PlayShell` **no existe en este plan**: el spec 07 ya lo extrajo y
> migró Asteroids encima. Este spec arranca directamente por los assets y el port.

1. **Crear `components/games/snake/sprites.ts`.**
   Port literal de `sprites.js`: se elimina `window.SPRITE_ATLAS` y se exporta
   `export const SPRITE_ATLAS` con la misma estructura (`fruits: { banana: {x,y,w,h}, ... }`,
   22 entradas). Ninguna coordenada cambia. La referencia de imagen pasa a
   `/games/snake/fruits.png`.
   Verificación: `npx tsc --noEmit` limpio; `Object.keys(SPRITE_ATLAS.fruits).length === 22`.

2. **Copiar `fruits.png` a `public/games/snake/fruits.png`.**
   Verificación: la pestaña Network devuelve **200** para `/games/snake/fruits.png` — no 404.

3. **Crear `components/games/SnakeGame.tsx`.**
   Juego nuevo siguiendo el contrato de autoría de `porting-recipe.md` (Caso C) y las
   transformaciones estándar del port:
   - `'use client'`; canvas desde `useRef`, `width={800} height={600}`.
   - Props reflejadas en refs (`pausedRef`, `cbScore`, `cbLives`, `cbLevel`, `cbOver`) con
     su effect de sincronización de una línea cada una.
   - Todo el cuerpo del juego vive en un único `useEffect(() => { ... }, [])`; variables de
     estado como `let`/`const` de closure, no `useRef`.
   - Se carga `fruits.png` en una `Image` dentro del effect (`img.src =
     '/games/snake/fruits.png'`), con guard `imgLoaded` — el juego puede arrancar antes de
     que cargue y dibujar la fruta como un círculo de respaldo hasta que la imagen esté
     lista, para no bloquear el primer frame.
   - `initGame()` idempotente: resetea la serpiente a 1 segmento en el centro del tablero,
     `direction` inicial fija, `score = 0`, `level = 1`, `tickInterval = 150`, coloca la
     primera fruta, resetea `gameOverFired` y las tres sentinelas `prev*` a `-1`.
   - Listeners de teclado con nombre sobre `window` (flechas y WASD mapeados a las cuatro
     direcciones), con `preventDefault()` en las flechas para que la página no haga scroll.
     El handler sólo actualiza `nextDirection`; nunca aplica un giro de 180° respecto a la
     dirección actual.
   - Loop por RAF con acumulador de tiempo en ms contra `tickInterval` (patrón de Tetris:
     acumular hasta superar el intervalo, entonces avanzar un paso lógico), con el delta
     crudo limitado a `Math.min(ts - lastTime, 50)` para que volver de otra pestaña no
     dispare varios pasos de golpe.
   - `step()`: aplica `nextDirection` a `direction`, calcula la nueva celda de cabeza,
     comprueba límites y auto-colisión → `gameover`; si la cabeza cae en la celda de la
     fruta, crece (no recorta la cola), suma `+10` a `score`, sube `level` cada 5 frutas y
     reduce `tickInterval` un 8% (piso `70`), y coloca una fruta nueva en una celda libre
     con un sprite aleatorio de `SPRITE_ATLAS.fruits`; si no, avanza recortando la cola.
   - `draw()`: fondo, rejilla tenue, cuerpo de la serpiente con rectángulos redondeados
     (cabeza distinguible del resto), fruta dibujada con `ctx.drawImage` usando el frame
     del atlas (`sx, sy, sw, sh` → celda destino), y HUD en canvas (`SCORE`, `NIVEL`,
     `LONGITUD`) siguiendo el layout de Asteroids: score izquierda, nivel centro,
     longitud derecha.
   - Bridge a React al final de `loop()`: sentinelas `prevScore` / `prevLength` /
     `prevLevel` inicializadas a `-1` y latch `gameOverFired`; `onGameOver(score)` se
     dispara una sola vez al entrar en `'gameover'`.
   - Gate de pausa: `if (!pausedRef.current) { accumulate + step() si toca }; draw();` —
     el movimiento vive dentro del gate, así que un único punto controla la pausa.
   - Cleanup del effect: `cancelAnimationFrame(rafId)` y retirada de los listeners de
     teclado.
     Verificación: `npx tsc --noEmit` no reporta ningún error en los archivos nuevos.

4. **Crear `app/games/snake/play/page.tsx`.**
   `'use client'`, import dinámico con `dynamic(..., { ssr: false })` y un `PlayShell` con
   `gameId="snake"`, `gameTitle="SNAKE"`, `livesLabel="Longitud"`, `livesDisplay="number"`,
   `initialLives={1}`.
   Verificación: `/games/snake/play` carga sin error de SSR y el juego es jugable; el HUD
   React muestra Jugador · Puntuación · Longitud · Nivel.

5. **Añadir `.cover-snake` a `app/globals.css`.**
   Invocar `/frontend-design` para la dirección visual antes de escribir el CSS. Concepto
   «Serpiente de neón en rejilla»: un trazo verde neón en zigzag sobre una rejilla tenue de
   fondo tipo tablero, con un punto de "fruta" brillante como acento. CSS puro con
   `radial-gradient` / `linear-gradient` y `filter: drop-shadow(...)`, sin imágenes ni SVG.
   Se inserta después de `.cover-arkanoid`, dentro de la sección de generadores de portada.
   Verificación: la card de Snake en `/games` muestra la portada una vez exista la fila en
   Supabase (paso 6).

6. **Registrar el juego en Supabase.**
   Vía servidor MCP `supabase`, en este orden: `list_tables` para confirmar que el esquema
   no ha derivado, `execute_sql` con el `INSERT` del Data model, y `execute_sql` con un
   `SELECT id, title, cat, cover, color FROM games ORDER BY created_at` para comprobar que
   la fila aterrizó. **No** se inserta desde el cliente browser: RLS permite `SELECT`
   público sobre `games` pero no `INSERT`.
   Verificación: el `SELECT` devuelve cuatro filas — `asteroids`, `tetris`, `arkanoid` y
   `snake`.

7. **Build y recorrido de rutas.**
   `npm run build`, y después recorrer y reportar lo observado realmente en `/games`,
   `/games/snake`, `/games/snake/play`, `/hall-of-fame`, y `/games/asteroids/play`,
   `/games/tetris/play`, `/games/arkanoid/play` como comprobación de no-regresión.
   Verificación: el build termina sin errores de TypeScript y ninguna ruta devuelve 500.

---

## Acceptance criteria

- [x] `components/games/snake/sprites.ts` exporta `SPRITE_ATLAS` con 22 frutas y ningún
      símbolo global (`window.SPRITE_ATLAS`) queda en el archivo.
- [x] `public/games/snake/fruits.png` existe y la petición devuelve 200.
- [x] `components/games/SnakeGame.tsx` existe y sus props son `GameApi`.
- [x] `app/games/snake/play/page.tsx` existe y usa `dynamic(..., { ssr: false })`.
- [x] `/games/snake/play` carga sin errores de SSR ni de TypeScript.
- [x] La serpiente se mueve con flechas y con WASD; ninguna tecla hace scroll de la página.
- [x] No se puede invertir la dirección 180° en un solo tick (ir a la derecha y pulsar
      izquierda no causa auto-colisión instantánea).
- [x] Comer una fruta: la serpiente crece un segmento, `score` sube `+10`, y aparece una
      nueva fruta en una celda libre con un sprite aleatorio del atlas.
- [x] Cada 5 frutas comidas, `level` sube y el juego se mueve perceptiblemente más rápido,
      sin bajar nunca de `70 ms` de intervalo.
- [x] Salir del tablero por cualquier borde termina la partida.
- [x] Chocar la cabeza contra el propio cuerpo termina la partida.
- [x] El modal React de fin de partida se abre **una sola vez** por partida, con la
      puntuación final correcta.
- [x] El HUD React refleja en tiempo real puntuación, longitud y nivel, y coincide con el
      HUD dibujado en el canvas.
- [x] El botón PAUSA congela el movimiento — la serpiente no avanza — y REANUDAR lo
      reanuda; el canvas sigue repintando durante la pausa.
- [x] JUGAR DE NUEVO arranca una partida limpia: serpiente de 1 segmento, score 0, nivel 1,
      fruta nueva, sin restos de la partida anterior.
- [x] Al desmontar el componente no queda ningún `requestAnimationFrame` activo ni ningún
      listener de teclado enganchado.
- [x] Cambiar de pestaña 30 segundos y volver no provoca varios pasos de golpe ni mata a la
      serpiente injustamente.
- [x] `.cover-snake` está en `app/globals.css` después de `.cover-arkanoid`, es CSS puro y
      no referencia ninguna imagen.
- [x] La fila `snake` está en la tabla `games`, confirmada con un `SELECT` real.
- [x] `/games` muestra la card de Snake con su portada y categoría `ARCADE`.
- [x] `/games/snake` muestra el detalle y el leaderboard vacío con el mensaje «Sé el primero
      en entrar al salón de la fama».
- [x] Guardar una puntuación la inserta en `scores` con `game_id = 'snake'`, y aparece en
      `/games/snake` y en `/hall-of-fame` al recargar.
- [x] `/games/asteroids/play`, `/games/tetris/play` y `/games/arkanoid/play` siguen
      funcionando sin regresiones.
- [x] `npm run build` completa sin errores de TypeScript.

---

## Decisions

- **Sí: Caso C — autoría desde cero.** No existe ningún `game.js` de Snake en
  `references/started-games/`; sólo hay un spritesheet de frutas y su atlas de
  coordenadas. Razón: no hay lógica de juego previa que portar, así que el componente se
  escribe siguiendo el contrato de autoría de `porting-recipe.md`, no sus transformaciones
  de port.

- **Sí: Se reutiliza el spritesheet de frutas real en vez de dibujarlas con formas.**
  Razón: el usuario ya proporcionó el asset y su atlas de coordenadas; ignorarlo y dibujar
  círculos habría sido descartar trabajo entregado sin motivo.

- **Sí: El cuerpo de la serpiente se dibuja con formas de canvas, no con sprites.**
  Razón: `sprites.js` sólo mapea frutas; no hay sprites de cabeza/cuerpo/cola en
  `fruits.png`. Inventar una hoja de sprites para el cuerpo sería agregar un asset que el
  usuario no proporcionó.

- **Sí: Longitud ocupa el hueco de `onLivesChange`, etiquetado «Longitud».** Razón: Snake
  no tiene vidas — es partida única —, pero el contrato de `GameApi` es fijo; la longitud
  es la métrica secundaria natural, igual que spec 07 usó `lines` para Tetris.

- **Sí: Chocar contra el borde es game over (no wrap-around).** Decisión explícita del
  usuario. Razón: es el comportamiento de Snake clásico y el más intuitivo para un jugador
  nuevo del juego.

- **Sí: Fruta aleatoria del atlas en cada spawn, mismo puntaje para todas.** Decisión
  explícita del usuario. Razón: variedad visual sin complejizar el sistema de puntuación
  con valores por fruta.

- **Sí: No se permite un giro de 180° en un solo tick.** Razón: sin esta regla, pulsar la
  tecla opuesta a la dirección actual mataría a la serpiente contra su propio segundo
  segmento de forma instantánea e injusta — no es una regla que el usuario pidiera
  explícitamente, pero es la convención estándar de Snake y evita un game over que se
  sentiría como un bug.

- **Sí: Backing store 800×600, cuadrícula 32×24 de celdas de 25px.** Razón: coincide con
  el resto de juegos (4:3, igual que `.crt-screen`) sin necesitar composición especial
  como Tetris.

- **Sí: HUD dibujado en canvas además del HUD React.** Razón: continuidad con la decisión
  «Doble HUD» del spec 05 — el juego debe funcionar como standalone dentro del canvas.

- **Sí: Limitar el delta crudo a 50 ms antes de acumularlo contra `tickInterval`.** Razón:
  sin el límite, volver de otra pestaña acumula un `dt` enorme y dispara varios pasos de
  golpe en el mismo frame, pudiendo matar a la serpiente contra sí misma de forma injusta.

- **No: Wrap-around en los bordes.** Descartado explícitamente por el usuario a favor de
  game over al tocar el borde.

- **No: Ciclo fijo de frutas.** Descartado explícitamente por el usuario a favor de
  selección aleatoria del atlas en cada spawn.

- **No: Pantalla de inicio o selector de nivel inicial (como Tetris).** Razón: no fue
  pedido, y Snake no tiene un parámetro previo al arranque tan natural como el nivel
  inicial de Tetris; simplifica el componente.

- **No: Ampliar `GameApi`.** Razón: el contrato queda fijo desde el spec 07; no hay
  necesidad nueva que lo justifique aquí.

- **No: Migración de esquema en Supabase.** `ARCADE` y `green` ya están dentro de los CHECK
  constraints. Razón: ampliarlos afectaría a todos los juegos y no hay motivo para hacerlo.

- **No: Tocar `app/games/page.tsx`, `app/games/[id]/page.tsx`, `app/hall-of-fame/**` ni
  `app/games/[id]/play/page.tsx`.** Razón: leen de Supabase y la ruta estática
  `app/games/snake/play/` gana sobre la dinámica en el App Router; si hiciera falta
  editarlos, sería señal de que la integración se hizo mal.
