# SPEC — Road Fighter Classic (scroll vertical con etapas y combustible)

> **Estado:** Propuesto
> **Depende de:** 06-games-table-leaderboard-supabase
> **Fecha:** 2026-08-25
> **Objetivo:** Implementar Road Fighter como juego jugable en Arcade Vault: scroll vertical
> top-down en el que el jugador conduce un coche por cinco etapas de dificultad creciente,
> esquiva rivales con comportamientos distintos y gestiona un depósito de combustible que
> se agota con el tiempo.

---

## Scope

**In:**

- INSERT SQL para añadir la fila `road-fighter` a la tabla `games` en Supabase.
- Crear `components/games/RoadFighterGame.tsx` — componente React `"use client"` que
  encapsula un canvas (480 × 640 px). Acepta props:
  `paused`, `onScoreChange`, `onLivesChange`, `onLevelChange`, `onGameOver`.
- Game loop construido desde cero con `requestAnimationFrame` y delta-time. Las fases
  internas son: `'idle'` → `'playing'` → `'stage-clear'` → `'gameover'`.
- **Carretera con perspectiva falsa**: se dibuja como un trapecio que estrecha hacia el
  horizonte (y=180). El punto central del horizonte se desplaza progresivamente ±100 px
  para simular curvas; el desplazamiento interpola en lerp hacia un objetivo que cambia
  cada 3-5 s de forma aleatoria.
- **Rayas centrales y borde de arcén**: las rayas del centro se animan con
  `scrollAccum % STRIPE_PERIOD` para crear el efecto de avance. El arcén a ambos lados
  se dibuja con una franja de hierba.
- **Coche del jugador**: sprite de 32 × 48 px (rectángulo con líneas decorativas en
  canvas) fijo en `PLAYER_Y = 560`. Se mueve con ← → a 240 px/s; limitado a los bordes
  de la carretera a la altura del jugador. Salir de la carretera cuenta como colisión.
- **Rivales — tres tipos**:
  | Tipo     | Color  | Canvas vy (px/s) | Comportamiento                          | Puntos |
  |----------|--------|------------------|-----------------------------------------|--------|
  | Lento    | gris   | 110              | Dirección fija, avanza despacio         | 10     |
  | Rápido   | rojo   | 290              | Dirección fija, se acerca rápidamente   | 20     |
  | Errático | amarillo | 180            | Cambia de carril cada 1.5-3 s           | 15     |
  El `vy` base escala con la etapa: `+20 px/s por etapa adicional`.
- **Combustible**: barra 0-100. Decrementa a razón de `8 × (scrollSpeed / 200)` unidades/s.
  Recoger una lata (`FuelCan`) restaura +30 unidades; máximo 100. Quedarse sin combustible
  provoca `game over` directo (sin consumir una vida).
- **Latas de combustible**: objetos de 20 × 28 px (rectángulo verde con "⛽") que
  aparecen aleatoriamente en la carretera. Canvas vy = scrollSpeed (se mueven igual que
  las rayas del suelo). Colisión AABB con el coche del jugador para recogerlas.
- **5 etapas** con configuración progresiva:
  | Etapa | scrollSpeed | Max rivales | Fuel drain ×   |
  |-------|-------------|-------------|----------------|
  | 1     | 200 px/s    | 3           | 1.0×           |
  | 2     | 250 px/s    | 4           | 1.1×           |
  | 3     | 300 px/s    | 5           | 1.2×           |
  | 4     | 350 px/s    | 6           | 1.3×           |
  | 5     | 400 px/s    | 7           | 1.5×           |
  Cada etapa finaliza al acumular `STAGE_LENGTH = 8 000 scroll-px`. Al completar la
  etapa 5, se dispara `onGameOver(score)` como condición de victoria.
- **Colisiones**: AABB entre coche del jugador y rival/borde. Si no hay invencibilidad
  activa: `lives -= 1`; `onLivesChange(lives)`; 2 000 ms de invencibilidad (parpadeo).
  Con `lives = 0`: `onLivesChange(0)` → `onGameOver(score)`.
- **Scoring**:
  - +1 pt por cada 50 scroll-px acumulados.
  - Bonus de etapa al completarla: `300 × etapa`.
  - Bonus de combustible al completar etapa: `floor(fuel × 2)`.
- **HUD interno del canvas**: banda semitransparente en la parte superior con score
  (izq.), etapa (centro) y vidas como iconos de coche (der.); barra de combustible
  en la parte inferior del canvas (verde → amarillo → rojo según nivel).
- El componente notifica a React vía callbacks (comparando con valor anterior antes de
  disparar para evitar renders innecesarios).
- La pausa se controla exclusivamente vía prop `paused`; durante la pausa el loop llama
  a `draw()` pero no ejecuta `update()`.
- Limpiar event listeners (`keydown`, `keyup` en `document`) en el `return` del `useEffect`.
- Crear `app/games/road-fighter/play/page.tsx` — play-page con `dynamic(..., { ssr: false })`.
- Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`,
  inserta en Supabase `{ game_id: 'road-fighter', player_name: name, score, user_id: null }`,
  persiste nombre. Botón de guardar se deshabilita tras el primer envío.

**Fuera de alcance:**

- Controles táctiles o mobile.
- Supabase Auth y RLS — `user_id` se almacena como `null`.
- Realtime en el leaderboard.
- Sprites externos (imágenes PNG) para los coches — se usan formas canvas primitivas.
- Efectos de sonido — se cubren en un spec separado si se desea.
- Modo multijugador.
- Mapa de ruta / minimap.
- Lluvia, noche u otros efectos de clima.

---

## Data model

### INSERT en tabla `games`

```sql
INSERT INTO games (id, title, short, long, cat, cover, color)
VALUES (
  'road-fighter',
  'ROAD FIGHTER',
  'Esquiva el tráfico y llega a la meta sin quedarte sin gas.',
  'Conduce tu coche por cinco etapas de carretera con tráfico cada vez más denso y agresivo. Gestiona el combustible recogiendo latas en el asfalto: si el depósito llega a cero, la carrera termina.',
  'RACING',
  'cover-road-fighter',
  'red'
);
```

### Props del componente `RoadFighterGame`

```ts
interface RoadFighterGameProps {
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
}
```

El estado local arranca con `lives = 3`, `score = 0`, `level = 1` (etapa actual).
`onLivesChange` se llama con el valor actualizado tras cada colisión.
`onLivesChange(0)` se dispara justo antes de `onGameOver(score)`.
`onLevelChange(n)` se dispara al iniciar la etapa `n`.

No se introducen nuevas tablas ni tipos TypeScript — se reutilizan `GameRow` y `ScoreRow`
de `lib/supabase/types.ts`.

### Modelo de datos interno (dentro del `useRef` de estado del juego)

```ts
type RivalType = 'slow' | 'fast' | 'erratic';
type GamePhase = 'idle' | 'playing' | 'stage-clear' | 'gameover';

interface RivalCar {
  id: number;
  type: RivalType;
  x: number;           // centro x en canvas
  y: number;           // centro y en canvas
  vy: number;          // velocidad hacia abajo (px/s)
  color: string;
  laneTarget: number;  // solo tipo erratic: x objetivo al que se desplaza
  laneTimer: number;   // solo tipo erratic: ms hasta próximo cambio de carril
}

interface FuelCan {
  id: number;
  x: number;
  y: number;
}

interface RoadFighterState {
  phase: GamePhase;
  scrollSpeed: number;      // px/s — velocidad de scroll del fondo
  scrollAccum: number;      // px acumulados para animar rayas
  stage: number;            // 1-5
  stageProgress: number;    // scroll-px recorridos en la etapa actual (meta: 8 000)
  lives: number;
  fuel: number;             // 0-100
  score: number;
  playerX: number;          // centro x del coche del jugador
  isInvincible: boolean;
  invincibleTimer: number;  // ms restantes de invencibilidad
  rivals: RivalCar[];
  fuelCans: FuelCan[];
  spawnTimer: number;       // ms hasta próximo rival
  fuelSpawnTimer: number;   // ms hasta próxima lata de combustible
  roadCurveOffset: number;  // desplazamiento horizontal del horizonte (-100..+100 px)
  roadCurveTarget: number;
  roadCurveTimer: number;   // ms hasta próximo cambio de curva objetivo
  keys: Record<string, boolean>;
  lastTime: number;         // DOMHighResTimeStamp del frame anterior
  stageClearTimer: number;  // ms para mostrar "ETAPA N COMPLETADA"
}
```

---

## Implementation plan

1. **INSERT en Supabase** — ejecutar el SQL del data model en el SQL Editor de Supabase.
   Verificación: la fila `road-fighter` aparece en el Table Editor; `/games` muestra la
   card con cover `cover-road-fighter` y color `red`.

2. **Crear `components/games/RoadFighterGame.tsx`** — componente `"use client"` que:

   2a. **Canvas y constantes de módulo** (fuera del componente, a nivel de módulo)
   ```ts
   const W = 480, H = 640;
   const HORIZON_Y = 180;
   const ROAD_BOT_HALF_W = 180;   // semi-ancho de carretera en y=H
   const ROAD_TOP_HALF_W = 60;    // semi-ancho de carretera en y=HORIZON_Y
   const ROAD_CENTER_X = 240;     // centro horizontal del canvas
   const PLAYER_Y = 560;
   const CAR_W = 32, CAR_H = 48;
   const FUEL_CAN_W = 20, FUEL_CAN_H = 28;
   const PLAYER_SPEED = 240;      // px/s
   const FUEL_DRAIN_BASE = 8;     // unidades/s a scrollSpeed base (200)
   const STAGE_LENGTH = 8000;     // scroll-px por etapa
   const STAGE_CLEAR_DURATION = 2000; // ms
   const INVINCIBLE_DURATION = 2000;  // ms
   const STRIPE_PERIOD = 160;     // px — período de la raya central

   const STAGE_CONFIGS = [
     { scrollSpeed: 200, maxRivals: 3, fuelDrainMult: 1.0, spawnMs: 1800 },
     { scrollSpeed: 250, maxRivals: 4, fuelDrainMult: 1.1, spawnMs: 1500 },
     { scrollSpeed: 300, maxRivals: 5, fuelDrainMult: 1.2, spawnMs: 1300 },
     { scrollSpeed: 350, maxRivals: 6, fuelDrainMult: 1.3, spawnMs: 1100 },
     { scrollSpeed: 400, maxRivals: 7, fuelDrainMult: 1.5, spawnMs:  900 },
   ] as const;

   const RIVAL_BASE: Record<RivalType, { color: string; baseVy: number; points: number }> = {
     slow:    { color: '#888888', baseVy: 110, points: 10 },
     fast:    { color: '#cc2222', baseVy: 290, points: 20 },
     erratic: { color: '#ddaa00', baseVy: 180, points: 15 },
   };
   ```

   2b. **Función auxiliar `roadBoundsAtY`** (dentro del componente)
   ```ts
   function roadBoundsAtY(y: number, curveOffset: number): { left: number; right: number } {
     // t = 0 en y=H (base), t = 1 en y=HORIZON_Y (horizonte)
     const t = Math.max(0, Math.min(1, (H - y) / (H - HORIZON_Y)));
     const centerTop = ROAD_CENTER_X + curveOffset;
     const centerY = ROAD_CENTER_X + t * (centerTop - ROAD_CENTER_X);
     const halfW = ROAD_BOT_HALF_W - t * (ROAD_BOT_HALF_W - ROAD_TOP_HALF_W);
     return { left: centerY - halfW, right: centerY + halfW };
   }
   ```

   2c. **`initGame()`** — inicializa `RoadFighterState` con etapa 1:
   - `scrollSpeed = STAGE_CONFIGS[0].scrollSpeed`, `stage = 1`, `lives = 3`, `fuel = 100`,
     `score = 0`, `playerX = ROAD_CENTER_X`, `scrollAccum = 0`, `stageProgress = 0`.
   - Listas vacías de `rivals` y `fuelCans`.
   - `spawnTimer = 1000`, `fuelSpawnTimer = 4000`.
   - `roadCurveOffset = 0`, `roadCurveTarget = 0`, `roadCurveTimer = 3000`.
   - Llama `onLevelChange(1)`.

   2d. **`update(dt: number)`** — solo ejecuta si `phase === 'playing'` y `!paused`:
   - **Scroll y progreso**:
     - `scrollAccum += scrollSpeed * dt/1000`.
     - `stageProgress += scrollSpeed * dt/1000`.
     - `score += scrollSpeed * dt/1000 / 50`; llama `onScoreChange` si cambió (`floor`).
   - **Comprobación de fin de etapa**:
     - Si `stageProgress >= STAGE_LENGTH`:
       - Calcular bonuses: `stageBonus = 300 × stage`, `fuelBonus = floor(fuel × 2)`.
       - `score += stageBonus + fuelBonus`; llama `onScoreChange(floor(score))`.
       - Si `stage === 5`: llama `onLivesChange(0)`, `onGameOver(floor(score))`,
         `phase = 'gameover'`. Fin.
       - Si no: `phase = 'stage-clear'`, `stageClearTimer = STAGE_CLEAR_DURATION`.
   - **Fase stage-clear** (cuando `phase === 'stage-clear'`):
     - Decrementa `stageClearTimer -= dt`.
     - Si `stageClearTimer <= 0`: `stage += 1`, aplica `STAGE_CONFIGS[stage - 1]`,
       `stageProgress = 0`, `phase = 'playing'`, llama `onLevelChange(stage)`.
   - **Curva de la carretera**:
     - `roadCurveTimer -= dt`.
     - Si `roadCurveTimer <= 0`: elige nuevo `roadCurveTarget` en `[-100, +100]` al azar
       y reinicia `roadCurveTimer` entre 3000-5000 ms.
     - `roadCurveOffset = lerp(roadCurveOffset, roadCurveTarget, dt/1000 × 1.5)`.
   - **Movimiento del jugador**:
     - Si `keys['ArrowLeft']`: `playerX -= PLAYER_SPEED * dt/1000`.
     - Si `keys['ArrowRight']`: `playerX += PLAYER_SPEED * dt/1000`.
     - `bounds = roadBoundsAtY(PLAYER_Y, roadCurveOffset)`.
     - Si `playerX < bounds.left + CAR_W/2` o `playerX > bounds.right - CAR_W/2`:
       clamp, y si `!isInvincible` → triggerCollision().
   - **Spawn de rivales**:
     - `spawnTimer -= dt`.
     - Si `spawnTimer <= 0` y `rivals.length < STAGE_CONFIGS[stage-1].maxRivals`:
       generar un rival aleatorio (tipo ponderado: stage 1-2 = 60 % slow / 20 % fast / 20 % erratic;
       stage 3-4 = 30/40/30; stage 5 = 20/50/30).
       `x` = aleatorio dentro de `roadBoundsAtY(HORIZON_Y + 10, roadCurveOffset)` ± CAR_W/2.
       `y = HORIZON_Y - CAR_H / 2`.
       `vy = RIVAL_BASE[type].baseVy + (stage - 1) * 20`.
       Para erratic: `laneTarget = x`, `laneTimer = random(1500, 3000)`.
       Reiniciar `spawnTimer = STAGE_CONFIGS[stage-1].spawnMs × random(0.8, 1.2)`.
   - **Movimiento de rivales**:
     - Para cada rival: `rival.y += rival.vy * dt/1000`.
     - Si erratic: `laneTimer -= dt`; cuando llega a 0, elige nuevo `laneTarget` dentro de
       la carretera y reinicia `laneTimer` entre 1500-3000 ms.
       `rival.x = lerp(rival.x, rival.laneTarget, dt/1000 × 2)`.
     - Eliminar rivales con `rival.y > H + CAR_H`.
   - **Spawn de latas de combustible**:
     - `fuelSpawnTimer -= dt`.
     - Si `fuelSpawnTimer <= 0` y `fuel < 80`:
       generar lata con `x` = aleatorio dentro de la carretera a `y = HORIZON_Y`.
       `fuelSpawnTimer = random(4000, 7000) - stage × 300`.
   - **Movimiento de latas**:
     - Para cada lata: `can.y += scrollSpeed * dt/1000`.
     - Eliminar si `can.y > H + FUEL_CAN_H`.
   - **Consumo de combustible**:
     - `fuel -= FUEL_DRAIN_BASE × STAGE_CONFIGS[stage-1].fuelDrainMult × dt/1000`.
     - Si `fuel <= 0`: `fuel = 0`; llama `onLivesChange(0)`, `onGameOver(floor(score))`,
       `phase = 'gameover'`.
   - **Colisiones jugador↔rival** (AABB):
     - Si `!isInvincible`: para cada rival, si los rectángulos [playerX-CAR_W/2,
       PLAYER_Y-CAR_H/2, CAR_W, CAR_H] y [rival.x-CAR_W/2, rival.y-CAR_H/2, CAR_W, CAR_H]
       se solapan → `triggerCollision()`.
   - **Colisiones jugador↔lata** (AABB):
     - Si los AABB se solapan: `fuel = min(100, fuel + 30)`. Eliminar lata.
   - **Invencibilidad**:
     - Si `isInvincible`: `invincibleTimer -= dt`; cuando llega a 0, `isInvincible = false`.
   - **`triggerCollision()`**:
     - `lives -= 1`; llama `onLivesChange(lives)`.
     - Si `lives <= 0`: llama `onLivesChange(0)`, `onGameOver(floor(score))`,
       `phase = 'gameover'`. Fin.
     - Si no: `isInvincible = true`, `invincibleTimer = INVINCIBLE_DURATION`.

   2e. **`draw(ctx)`** — ejecuta siempre (incluso en pausa):
   - **Fondo fuera de carretera** (hierba a ambos lados): `fillRect` verde oscuro `#2d5a27`.
   - **Carretera**: `fillRect` gris `#555555` en forma de trapecio usando `beginPath` /
     `lineTo` con las cuatro esquinas calculadas por `roadBoundsAtY` en y=HORIZON_Y y y=H.
   - **Arcén** (borde blanco): líneas blancas de 3 px a lo largo de los bordes de la carretera.
   - **Rayas centrales**: serie de rectángulos blancos de 6 × 40 px, posicionados en
     `x = roadCenterX`, desde `y = (scrollAccum % STRIPE_PERIOD) - STRIPE_PERIOD` hasta y=H,
     con paso `STRIPE_PERIOD`, siendo `roadCenterX` el x central interpolado a esa y.
   - **Línea de horizonte**: línea horizontal gris oscuro a y=HORIZON_Y.
   - **Latas de combustible**: rectángulo verde `#22aa44` de `FUEL_CAN_W × FUEL_CAN_H` con
     texto "⛽" centrado.
   - **Rivales**: rectángulo del color del tipo, con dos círculos pequeños como ruedas.
   - **Coche del jugador**: rectángulo `#1155cc` con parabrisas `#88bbff` y dos ruedas;
     si `isInvincible && floor(invincibleTimer / 150) % 2 === 0`, saltar el dibujo (parpadeo).
   - **HUD interno** (zona superior 0-60 px, fondo semitransparente negro al 60 %):
     - Izquierda: `SCORE: N` en blanco.
     - Centro: `ETAPA N / 5` en blanco.
     - Derecha: iconos de coche (♦) × `lives` en rojo.
   - **Barra de combustible** (zona inferior H-24 a H):
     - Fondo gris, barra de `fuel/100 × W` px en color `#22cc44` si fuel>50,
       `#eecc00` si 25<fuel≤50, `#cc2222` si fuel≤25.
     - Texto "FUEL" centrado en blanco.
   - **Fase idle**: overlay negro semitransparente, texto "ROAD FIGHTER" grande en rojo,
     "Pulsa ENTER para empezar" en blanco.
   - **Fase stage-clear**: overlay verde semitransparente, texto "ETAPA N COMPLETADA",
     bonuses de etapa y combustible.
   - **Fase gameover**: overlay negro, texto "GAME OVER" en rojo (momentáneo antes del modal).

   2f. **Event listeners** en `useEffect`:
   - `keydown`: marcar `keys[e.key] = true`; si `key === 'Enter'` y `phase === 'idle'`:
     llamar `initGame()`, `phase = 'playing'`.
   - `keyup`: `keys[e.key] = false`.
   - En el `return`: remover ambos listeners; cancelar el frame con `cancelAnimationFrame`.

   Verificación: el juego arranca en `/games/road-fighter/play`; la carretera scrollea con
   curvas; el jugador se mueve con ← →; los rivales aparecen desde arriba; las latas
   restauran combustible; al perder las 3 vidas o quedarse sin fuel aparece el modal de
   game over.

3. **Crear `app/games/road-fighter/play/page.tsx`** — play-page específica:
   - Importa `RoadFighterGame` con `dynamic(..., { ssr: false })`.
   - Estado local: `score`, `lives` (inicial `3`), `level` (inicial `1`), `paused`, `over`,
     `name`, `saved`, `gameKey`.
   - Pasa `paused` y los cuatro callbacks a `RoadFighterGame`.
   - Reutiliza el layout visual de la plataforma (HUD React + CRT + modal game over),
     igual que las play-pages de Tetris, Arkanoid, Snake y Battleship.
   - Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`;
     al confirmar, guarda en `localStorage` e inserta en Supabase
     `{ game_id: 'road-fighter', player_name: name, score, user_id: null }`.
   - Botón de guardar se deshabilita tras el primer envío.
   - Botón «JUGAR DE NUEVO» incrementa `gameKey` para remontar el componente canvas.
     Verificación: el HUD React refleja score, vidas y etapa en tiempo real; tras una
     partida el score aparece en `/games/road-fighter` y en `/hall-of-fame` al recargar.

4. **Verificación final** — `npm run build` termina sin errores de TypeScript.
   Ninguna ruta existente devuelve 500.

---

## Acceptance criteria

- [ ] La fila `road-fighter` existe en la tabla `games` de Supabase con los valores del data model.
- [ ] La card de Road Fighter aparece en `/games` con cover `cover-road-fighter` y color `red`.
- [ ] La ruta `/games/road-fighter/play` carga sin errores de SSR ni de TypeScript.
- [ ] El canvas (480 × 640) se renderiza correctamente con hierba a los lados y carretera central.
- [ ] La fase idle muestra el título y el prompt «Pulsa ENTER para empezar».
- [ ] Pulsar Enter inicia la etapa 1 y llama `onLevelChange(1)`.
- [ ] La carretera scrollea hacia abajo continuamente; las rayas centrales se animan.
- [ ] El horizonte de la carretera se desplaza lateralmente simulando curvas.
- [ ] El coche del jugador se mueve con ← → y no puede salir de la carretera.
- [ ] Salir de la carretera por un borde cuenta como colisión y resta una vida.
- [ ] Al colisionar con un rival, el coche parpadea 2 s y no puede recibir daño durante ese tiempo.
- [ ] Los tres tipos de rival (gris / rojo / amarillo) se comportan correctamente:
      lento avanza despacio, rápido se acerca con alta velocidad, errático cambia de carril.
- [ ] Las latas de combustible aparecen en la carretera y se recogen conduciendo sobre ellas.
- [ ] La barra de combustible decrece durante el juego y se recarga al recoger una lata.
- [ ] Quedarse sin combustible dispara `onLivesChange(0)` y `onGameOver(score)` sin esperar a vidas.
- [ ] Al perder las 3 vidas, `onLivesChange(0)` y `onGameOver(score)` se disparan.
- [ ] Al completar una etapa se muestra el mensaje «ETAPA N COMPLETADA» con los bonuses.
- [ ] La etapa siguiente incrementa scrollSpeed y densidad de tráfico según la tabla de config.
- [ ] `onLevelChange(n)` se dispara al inicio de cada etapa.
- [ ] El HUD interno del canvas muestra score, etapa, vidas y barra de combustible en tiempo real.
- [ ] El HUD React de la plataforma refleja score, vidas y etapa en tiempo real.
- [ ] El botón "PAUSA" de la plataforma congela el game loop; "REANUDAR" lo reanuda.
- [ ] Las teclas P / Esc no producen pausa independiente en el canvas.
- [ ] Al completar la etapa 5, `onLivesChange(0)` y `onGameOver(score)` se disparan como victoria.
- [ ] El modal React de game over aparece con la puntuación final (en derrota y en victoria).
- [ ] El modal pre-rellena el nombre desde `av_player_name` de localStorage si existe.
- [ ] Al confirmar, el score se inserta en Supabase y el nombre se persiste en localStorage.
- [ ] El botón de guardar se deshabilita tras el primer envío (sin doble inserción).
- [ ] El botón "JUGAR DE NUEVO" reinicia la partida desde la etapa 1.
- [ ] El score guardado aparece en `/games/road-fighter` y en `/hall-of-fame` al recargar.
- [ ] `npm run build` completa sin errores de TypeScript.
- [ ] Ninguna ruta existente devuelve 500.

---

## Decisions

- **Sí: Doble HUD** — el canvas conserva su HUD interno y React muestra los mismos valores
  en el HUD de la plataforma. Razón: coherencia con el patrón establecido en todos los juegos
  de la plataforma; el juego funciona visualmente como standalone dentro del canvas.

- **Sí: 3 vidas** — Road Fighter original usa 3 vidas. Razón: fiel a la mecánica clásica;
  cada colisión con rival o borde consume una vida, `onLivesChange` notifica cada pérdida.

- **Sí: Quedarse sin combustible = game over directo** — agotar el depósito de
  combustible no consume una vida sino que termina la partida inmediatamente. Razón: fiel
  al diseño original de Konami (1984); el combustible es una condición de fallo independiente
  a las vidas, lo que añade una segunda dimensión de presión al jugador.

- **Sí: 5 etapas con condición de victoria** — completar la etapa 5 dispara `onGameOver`
  exactamente igual que perder. Razón: la plataforma necesita un único punto de salida para
  mostrar el modal de guardar score; el HUD puede indicar la victoria con texto antes del modal.

- **Sí: Carretera con perspectiva falsa (trapecio + lerp de curva)** — la carretera se
  dibuja como trapecio con horizonte desplazable; las curvas se simulan moviendo ese horizonte.
  Razón: produce el efecto visual característico de Road Fighter sin 3D real ni matrices
  de proyección; la implementación es autocontenida en canvas 2D puro.

- **Sí: Delta-time en el game loop** — se usa `requestAnimationFrame` con
  `dt = currentTime - lastTime` para que el juego sea frame-rate independent.
  Razón: evita que a distintas tasas de refresco el coche vaya a diferente velocidad.

- **Sí: Invencibilidad tras colisión (2 s)** — el jugador tiene 2 s de gracia con parpadeo
  visual tras chocar. Razón: mecánica clásica de los juegos de conducción de los 80; sin ella
  una colisión en zona de tráfico denso agotaría las vidas de forma frustrante.

- **Sí: Play-page específica `app/games/road-fighter/play/page.tsx`** — en lugar de
  modificar la ruta genérica `[id]/play`. Razón: coherencia con el resto de juegos;
  Next.js App Router da prioridad a rutas estáticas sobre dinámicas.

- **Sí: `dynamic(..., { ssr: false })`** — el componente canvas se carga solo en cliente.
  Razón: `canvas` y `requestAnimationFrame` no existen en el entorno Node.js de Next.js SSR.

- **Sí: Formas canvas primitivas para sprites** — rectángulos con color y líneas decorativas,
  sin imágenes externas. Razón: no existen sprites de coches en el proyecto; diseñar con
  primitivas mantiene el spec autocontenido y listo para implementar sin assets adicionales.

- **No: Scaling de perspectiva para coches rivales** — los coches rivales no crecen al
  bajar por la pantalla (perspectiva falsa completa). Razón: la complejidad añadida no
  justifica el beneficio visual en un primer spec; puede añadirse como mejora posterior.

- **No: Controles táctiles o mobile** — fuera de alcance en este spec.
  Razón: se pueden añadir mediante el agente `mobile-porter` en una corrida separada.

- **No: Supabase Auth y RLS** — `user_id` se guarda como `null`.
  Razón: consistencia con todos los juegos actuales de la plataforma.

- **No: Realtime en leaderboard** — los scores se ven al recargar.
  Razón: la complejidad de subscriptions no aporta valor mientras haya pocos jugadores activos.

- **No: Efectos de sonido** — fuera de alcance en este spec.
  Razón: se cubren en un spec separado de audio; no añadir dependencias de Web Audio API
  sin un plan de implementación completo.
