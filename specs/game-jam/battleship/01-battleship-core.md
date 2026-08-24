# SPEC — Battleship Core (modo clásico por turnos contra IA)

> **Estado:** Propuesto
> **Depende de:** 06-games-table-leaderboard-supabase
> **Fecha:** 2026-08-24
> **Objetivo:** Implementar Battleship como juego jugable en Arcade Vault con modo clásico
> por turnos: el jugador coloca su flota en un tablero 10×10 y dispara contra la flota
> oculta de la IA, que responde con un algoritmo de hunting + targeting.

---

## Scope

**In:**

- INSERT SQL para añadir la fila `battleship` a la tabla `games` en Supabase.
- Crear `components/games/BattleshipGame.tsx` — componente React `"use client"` que
  encapsula un canvas (900 × 600 px). Acepta props:
  `paused`, `onScoreChange`, `onLivesChange`, `onLevelChange`, `onGameOver`.
- Game loop construido desde cero. Tres fases de estado interno:
  `'placement'` → `'playing'` → `'gameover'`.
- Fase **placement**: el jugador coloca 5 barcos (Carrier 5, Battleship 4, Cruiser 3,
  Submarine 3, Destroyer 2) haciendo clic en su grid; tecla R rota la orientación
  (horizontal / vertical). Un barco fantasma sigue el cursor indicando posición y validez.
- Fase **playing**: turnos alternos. El jugador hace clic en el grid enemigo (derecha);
  si acierta la celda se pinta roja, si falla se pinta azul pálido. La IA responde con
  un disparo automático 600 ms después del turno del jugador (para legibilidad).
- IA con dos modos: **hunt** (dispara celdas sin visitar en orden pseudoaleatorio) y
  **target** (tras un impacto, explora las cuatro celdas adyacentes hasta hundir el barco).
- Cada grid es de 10×10 celdas de 38 px. El grid del jugador ocupa la mitad izquierda del
  canvas y el grid enemigo la mitad derecha; separados por un margen central de 20 px.
- HUD interno del canvas: fila superior con score, turno activo y conteo de barcos hundidos
  de cada bando.
- El componente notifica a React vía callbacks (comparando con valor anterior antes de disparar).
- Game over por derrota (todos los barcos del jugador hundidos) o victoria (todos los barcos
  del enemigo hundidos). En ambos casos: `onLivesChange(0)` seguido de `onGameOver(score)`.
- Scoring:
  - +10 por cada impacto del jugador.
  - +100 por cada barco enemigo hundido.
  - Bonus de precisión al final de la partida: `floor((hits / shots) * 500)`.
- Limpiar los event listeners de `mousedown`, `mousemove` y `keydown` sobre el canvas/document
  en el `return` del `useEffect`.
- La pausa se controla exclusivamente vía prop `paused`; durante la pausa el loop sigue
  llamando a `draw()` pero no procesa entrada ni dispara la respuesta de la IA.
- Crear `app/games/battleship/play/page.tsx` — play-page específica con `dynamic(..., { ssr: false })`.
- Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`,
  inserta en Supabase `{ game_id: 'battleship', player_name: name, score, user_id: null }`,
  persiste nombre en `localStorage`. Botón de guardar se deshabilita tras el primer envío.

**Fuera de alcance:**

- Controles táctiles o mobile.
- Supabase Auth y RLS — `user_id` se almacena como `null`.
- Realtime en el leaderboard.
- Modo multijugador (dos jugadores en mismo dispositivo o en red).
- Animaciones de explosión con sprites externos — se usan círculos/cruces canvas primitivos.
- Sonidos — se cubren en un spec independiente si se desea.
- Dificultad seleccionable de la IA (la dificultad «normal» con hunting + targeting es el único modo).

---

## Data model

### INSERT en tabla `games`

```sql
INSERT INTO games (id, title, short, long, cat, cover, color)
VALUES (
  'battleship',
  'BATTLESHIP',
  'Hunde la flota enemiga antes de que hundan la tuya.',
  'Despliega tus cinco barcos en el océano y bombardea el grid enemigo turno a turno. La IA adversaria caza tus barcos con un algoritmo de hunting y targeting — cada impacto la vuelve más peligrosa.',
  'STRATEGY',
  'cover-battleship',
  'blue'
);
```

### Props del componente `BattleshipGame`

```ts
interface BattleshipGameProps {
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
}
```

El estado local arranca con `lives = 1`, `score = 0`, `level = 1`.
`onLivesChange(0)` se dispara justo antes de `onGameOver(score)` tanto en derrota como
en victoria. `onLevelChange` no cambia durante la partida (Battleship clásico no tiene
niveles); se llama una única vez al inicio con valor `1` para satisfacer el contrato de la
plataforma.

No se introducen nuevas tablas ni tipos TypeScript — se reutilizan `GameRow` y `ScoreRow`
de `lib/supabase/types.ts`.

---

## Implementation plan

1. **INSERT en Supabase** — ejecutar el SQL del data model en el SQL Editor de Supabase.
   Verificación: la fila `battleship` aparece en el Table Editor; `/games` muestra la card
   con cover `cover-battleship` y color `blue`.

2. **Crear `components/games/BattleshipGame.tsx`** — componente `"use client"` que:

   2a. **Canvas y referencias**
   - Renderiza un único `<canvas>` de 900 × 600 px mediante `useRef<HTMLCanvasElement>`.
   - Constantes de módulo (fuera del componente): `CELL = 38`, `COLS = 10`, `ROWS = 10`,
     `GRID_LEFT_X = 20`, `GRID_RIGHT_X = 480`, `GRID_Y = 80`.
     Estas constantes definen el origen en píxeles de cada grid dentro del canvas.

   2b. **Modelo de datos interno** (dentro del `useRef` de estado del juego)
   ```ts
   type Cell = 'empty' | 'ship' | 'hit' | 'miss';
   type Orientation = 'H' | 'V';
   interface Ship { id: string; size: number; cells: [number, number][]; sunk: boolean; }
   interface GameState {
     phase: 'placement' | 'playing' | 'gameover';
     playerBoard: Cell[][];    // 10×10
     enemyBoard: Cell[][];     // 10×10 (solo 'empty' | 'hit' | 'miss' visible al jugador)
     enemyBoardReal: Cell[][]; // 10×10 (con 'ship' para la IA interna)
     playerShips: Ship[];
     enemyShips: Ship[];
     pendingShip: { id: string; size: number } | null; // barco en colocación
     orientation: Orientation;
     aiMode: 'hunt' | 'target';
     aiHitStack: [number, number][];   // celdas a explorar en modo target
     aiLastHit: [number, number] | null;
     score: number;
     playerTurn: boolean;
     aiDelay: number | null;           // timestamp de cuando la IA debe disparar
   }
   ```

   2c. **Fase placement**
   - Al montar, se llama `initGame()`: crea los dos tableros vacíos, coloca los 5 barcos
     de la IA en posiciones pseudoaleatorias sin solapamiento, e inicializa `pendingShip`
     con el primer barco a colocar (Carrier, size 5).
   - `draw()` en fase `'placement'`: dibuja el grid izquierdo con los barcos ya colocados;
     dibuja en translúcido el barco fantasma en la celda bajo el cursor (verde si válida,
     rojo si inválida); en el grid derecho dibuja un océano vacío con leyenda «Flota enemiga
     oculta»; HUD lista los barcos pendientes de colocar.
   - `mousemove` sobre el canvas: calcula la celda (col, row) del grid izquierdo bajo el
     cursor y actualiza la posición del fantasma.
   - `mousedown` en grid izquierdo durante placement: si la posición es válida, coloca el
     barco en `playerBoard` y `playerShips`, avanza al siguiente `pendingShip`. Cuando todos
     los barcos están colocados, cambia `phase` a `'playing'` y llama `onLevelChange(1)`.
   - `keydown` con `key === 'r' || key === 'R'`: alterna `orientation` entre `'H'` y `'V'`.

   2d. **Fase playing**
   - `draw()` en fase `'playing'`: dibuja ambos grids con colores diferenciados:
     - `'ship'` en grid jugador: color azul oscuro.
     - `'hit'` en ambos grids: círculo rojo con aspa blanca (`×`).
     - `'miss'` en ambos grids: círculo pequeño azul pálido.
     - Celda hover del grid enemigo: resaltado amarillo pálido si `playerTurn === true`.
     - HUD superior: `SCORE: N`, `TURNO: JUGADOR / IA`, barcos hundidos de cada bando.
   - `mousedown` en grid derecho durante `playerTurn === true`:
     - Comprueba que la celda no fue ya disparada.
     - Si `enemyBoardReal[row][col] === 'ship'`: marca `'hit'` en `enemyBoard[row][col]`
       y en `enemyBoardReal`; suma +10 al score; comprueba si el barco fue hundido
       (+100 score; marca `ship.sunk = true`); llama `onScoreChange(score)`.
     - Si `'empty'`: marca `'miss'` en `enemyBoard`.
     - Comprueba condición de victoria: todos los barcos enemigos hundidos → game over.
     - Si no hay victoria: `playerTurn = false`, programa disparo de la IA
       (`aiDelay = Date.now() + 600`).
   - Respuesta de la IA (evaluada en el game loop cuando `Date.now() >= aiDelay`):
     - **Hunt mode**: elige al azar entre todas las celdas no disparadas del grid del jugador.
     - **Target mode**: extrae la primera celda de `aiHitStack`; si no hay más celdas y el
       barco no está hundido, regresa a hunt mode.
     - Si acierta: añade las cuatro celdas adyacentes no disparadas a `aiHitStack`,
       actualiza `aiLastHit`, cambia a target mode si estaba en hunt.
     - Comprueba condición de derrota: todos los barcos del jugador hundidos → game over.
     - Si no hay derrota: `playerTurn = true`.
   - Game loop: `requestAnimationFrame` llama a `update()` + `draw()` en cada frame.
     `update()` evalúa el timeout de la IA y realiza el disparo si ha llegado el momento.
     Si `paused === true`, `update()` no avanza el timer de la IA y no procesa entradas
     (los handlers de mouse ignorarán clics si `paused`).

   2e. **Bonus de precisión y game over**
   - Al detectar victoria o derrota:
     - Calcula `accuracy = playerHits / playerShots` (o 0 si `playerShots === 0`).
     - Suma `floor(accuracy * 500)` al score.
     - Llama `onScoreChange(score)`, `onLivesChange(0)`, `onGameOver(score)`.
     - Cambia `phase` a `'gameover'`.

   2f. **Limpieza**
   - En el `return` del `useEffect`: cancela el frame con `cancelAnimationFrame`,
     elimina los listeners de `mousedown` y `mousemove` del canvas,
     y el listener de `keydown` del `document`.

   Verificación: el juego arranca en `/games/battleship/play` con la pantalla de placement;
   tras colocar los 5 barcos el turno alterna correctamente; los impactos se pintan en rojo
   y los fallos en azul pálido; la IA dispara 600 ms tras el turno del jugador.

3. **Crear `app/games/battleship/play/page.tsx`** — play-page específica:
   - Importa `BattleshipGame` con `dynamic(..., { ssr: false })`.
   - Estado local: `score`, `lives` (inicial `1`), `level` (inicial `1`), `paused`, `over`,
     `name`, `saved`, `gameKey`.
   - Pasa `paused` y los cuatro callbacks a `BattleshipGame`.
   - Reutiliza el layout visual de la plataforma (HUD React + CRT + modal game over),
     igual que las play-pages de Asteroids, Tetris, Arkanoid y Snake.
   - Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`;
     al confirmar, guarda en `localStorage` e inserta en Supabase
     `{ game_id: 'battleship', player_name: name, score, user_id: null }`.
   - Botón de guardar se deshabilita tras el primer envío.
   - Botón «JUGAR DE NUEVO» incrementa `gameKey` para remontar el componente canvas.
     Verificación: el HUD React refleja score en tiempo real; tras una partida el score
     aparece en `/games/battleship` y en `/hall-of-fame` al recargar.

4. **Verificación final** — `npm run build` termina sin errores de TypeScript.
   Ninguna ruta existente devuelve 500.

---

## Acceptance criteria

- [ ] La fila `battleship` existe en la tabla `games` de Supabase con los valores del data model.
- [ ] La card de Battleship aparece en `/games` con cover `cover-battleship` y color `blue`.
- [ ] La ruta `/games/battleship/play` carga sin errores de SSR ni de TypeScript.
- [ ] El canvas (900 × 600) se renderiza con dos grids de 10×10 celdas de 38 px.
- [ ] Al iniciar, la fase de placement muestra el primer barco (Carrier, 5 celdas) como fantasma.
- [ ] La tecla R alterna la orientación del barco entre horizontal y vertical.
- [ ] El fantasma se pinta verde en posiciones válidas y rojo en posiciones inválidas u ocupadas.
- [ ] Al colocar los 5 barcos, la fase cambia automáticamente a playing.
- [ ] El jugador solo puede disparar en el grid derecho (enemigo) durante su turno.
- [ ] Un clic en una celda ya disparada no produce ningún efecto.
- [ ] Los impactos se pintan con círculo rojo y aspa blanca; los fallos con círculo azul pálido.
- [ ] La IA dispara exactamente 600 ms después del turno del jugador.
- [ ] La IA cambia de hunt a target tras un impacto y explora celdas adyacentes.
- [ ] El HUD interno del canvas muestra score, turno activo y barcos hundidos de cada bando.
- [ ] El HUD React de la plataforma refleja el score en tiempo real.
- [ ] El botón "PAUSA" de la plataforma detiene el timer de la IA y bloquea los clics del jugador.
- [ ] Al hundir todos los barcos enemigos, se disparan `onLivesChange(0)` y `onGameOver(score)`.
- [ ] Al hundir todos los barcos del jugador, se disparan `onLivesChange(0)` y `onGameOver(score)`.
- [ ] El bonus de precisión se suma al score antes de llamar `onGameOver`.
- [ ] El modal React de game over aparece con la puntuación final.
- [ ] El modal pre-rellena el nombre desde `av_player_name` de localStorage si existe.
- [ ] Al confirmar, el score se inserta en Supabase y el nombre se persiste en localStorage.
- [ ] El botón de guardar se deshabilita tras el primer envío (sin doble inserción).
- [ ] El botón "JUGAR DE NUEVO" remontar el canvas desde la fase de placement.
- [ ] El score guardado aparece en `/games/battleship` y en `/hall-of-fame` al recargar.
- [ ] `npm run build` completa sin errores de TypeScript.
- [ ] Ninguna ruta existente devuelve 500.

---

## Decisions

- **Sí: Doble HUD** — el canvas conserva su HUD interno y React muestra los mismos valores
  en el HUD de la plataforma. Razón: coherencia con el patrón establecido en Asteroids,
  Tetris, Arkanoid y Snake; el juego funciona visualmente como standalone dentro del canvas.

- **Sí: 1 vida** — Battleship no tiene vidas en el sentido clásico. Se modela como 1 vida
  que cae a 0 al terminar la partida (ya sea victoria o derrota). Razón: consistencia con
  el HUD estándar de la plataforma; igual que Tetris y Snake.

- **Sí: victoria y derrota ambas disparan `onGameOver`** — completar la partida ganando o
  perdiendo llama `onGameOver(score)`. Razón: la plataforma necesita un único punto de salida
  para mostrar el modal de guardar score; el HUD puede indicar el resultado con texto antes de
  que el modal aparezca.

- **Sí: placement en el mismo canvas** — la fase de colocación de barcos se dibuja en el
  mismo canvas de 900 × 600, sin pantallas separadas. Razón: evita montar/desmontar
  componentes intermedios; el `phase` interno del estado controla qué se dibuja.

- **Sí: flota de la IA generada aleatoriamente al inicio** — los barcos enemigos se colocan
  con un algoritmo de backtracking simple durante `initGame()`. Razón: implementación
  autocontenida sin assets externos; suficiente para el modo clásico.

- **Sí: AI targeting explora celdas en orden N→E→S→W** — tras un impacto, la IA empuja
  las cuatro celdas adyacentes a `aiHitStack` en orden N, E, S, W. Razón: comportamiento
  predecible y fácil de depurar; se puede mejorar a orientación deducida en un spec futuro.

- **Sí: Play-page específica `app/games/battleship/play/page.tsx`** — en lugar de modificar
  la ruta genérica `[id]/play`. Razón: coherencia con el resto de juegos de la plataforma;
  Next.js App Router da prioridad a rutas estáticas sobre dinámicas.

- **No: Controles táctiles o mobile** — fuera de alcance en este spec.
  Razón: se pueden añadir mediante el agente `mobile-porter` en una corrida separada.

- **No: Dificultades configurables de IA** — solo se implementa la dificultad «normal»
  (hunting + targeting). Razón: YAGNI; el modo difícil (con deducción de orientación del
  barco) puede añadirse en un spec de mejoras.

- **No: Animaciones de explosión con sprites** — se usan primitivas canvas (círculo rojo,
  aspa blanca). Razón: no existen assets de explosión en el proyecto; añadirlos requeriría
  un spec de assets separado.

- **No: Supabase Auth y RLS** — `user_id` se guarda como `null`.
  Razón: consistencia con todos los juegos actuales de la plataforma.

- **No: Realtime en leaderboard** — los scores se ven al recargar.
  Razón: la complejidad de subscriptions no aporta valor mientras haya pocos jugadores activos.
