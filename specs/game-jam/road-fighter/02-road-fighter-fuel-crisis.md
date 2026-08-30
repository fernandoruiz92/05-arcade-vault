# SPEC — Road Fighter: Fuel Crisis (survival infinito con combustible como único recurso)

> **Estado:** Propuesto
> **Depende de:** 06-games-table-leaderboard-supabase
> **Fecha:** 2026-08-25
> **Objetivo:** Implementar una variante survival de Road Fighter en carretera infinita
> procedural donde el combustible es el único recurso crítico: no hay etapas fijas ni vidas
> en sentido clásico, sino un contador de choques (máx. 3) y un depósito que debe
> mantenerse lleno recogiendo latas mientras el tráfico aumenta sin límite.

---

## Scope

**In:**

- INSERT SQL para añadir la fila `road-fighter-fuel-crisis` a la tabla `games` en Supabase.
- Crear `components/games/RoadFighterFuelCrisisGame.tsx` — componente React `"use client"`
  que encapsula un canvas (480 × 640 px). Acepta props:
  `paused`, `onScoreChange`, `onLivesChange`, `onLevelChange`, `onGameOver`.
- Game loop construido desde cero con `requestAnimationFrame` y delta-time. Las fases
  internas son: `'idle'` → `'playing'` → `'gameover'`.
- **Carretera infinita procedural**: misma geometría de trapecio con perspectiva falsa que
  el spec 01 (constantes `W=480, H=640, HORIZON_Y=180, ROAD_BOT_HALF_W=180,
  ROAD_TOP_HALF_W=60`). La curva del horizonte se genera con una función senoidal
  suavizada (`roadCurveOffset = 90 × sin(totalTime × 0.0008 + phase)`) sin objetivos
  discretos, para una sensación de carretera que serpentea continuamente.
- **Combustible — recurso central**:
  - Depósito: 0-100; arranca en 60 (no lleno para crear tensión inmediata).
  - Tasa de consumo: `FUEL_DRAIN_BASE (10 u/s) × speedMultiplier`.
  - Recoger una lata: +25 u; máximo 100.
  - Si `fuel <= 0`: `onLivesChange(0)` → `onGameOver(score)` — condición de fin única
    junto con agotar los 3 intentos de choque.
- **Sin vidas; 3 choques tolerados** (`crashesLeft` inicia en 3):
  - Colisión con rival: `crashesLeft -= 1`; llama `onLivesChange(crashesLeft)`;
    2 s de invencibilidad con parpadeo.
  - Si `crashesLeft <= 0`: `onLivesChange(0)` → `onGameOver(score)`.
  - El HUD representa `crashesLeft` como el campo de vidas de la plataforma.
- **Dificultad progresiva automática** (sin etapas fijas):
  - `scrollSpeed` arranca en 200 px/s e incrementa en +5 px/s cada 10 s de juego.
  - Tope de `scrollSpeed`: 600 px/s.
  - La densidad de rivales en pantalla = `floor(2 + totalTime / 15)`, máximo 12.
  - `onLevelChange` se dispara cada vez que `scrollSpeed` alcanza un múltiplo de 50
    (nivel = `floor((scrollSpeed - 200) / 50) + 1`).
- **Power-ups** (tres tipos, aparecen aleatoriamente en la carretera):
  | Power-up    | Color / icono | Efecto                                          | Duración / uso |
  |-------------|---------------|-------------------------------------------------|----------------|
  | Turbo       | naranja / ⚡  | scrollSpeed ×1.5 → más distancia/s → más score | 5 s            |
  | Escudo      | azul / 🛡      | absorbe el siguiente choque sin gastar crashesLeft | hasta el primer choque |
  | Doble Fuel  | verde / ×2    | la próxima lata recogida da +50 u en lugar de +25 | hasta recoger 1 lata |
  - Probabilidad de aparición: turbo 40 %, escudo 30 %, doble fuel 30 %.
  - Un solo power-up activo de cada tipo simultáneamente; no se acumulan.
  - `powerUpSpawnTimer` arranca en 8 000 ms y se reinicia entre 6 000-12 000 ms tras
    cada aparición.
- **Rivales — mismos tres tipos** que el spec 01 con comportamiento idéntico:
  slow (gris), fast (rojo), erratic (amarillo). `vy = RIVAL_BASE[type].baseVy + scrollSpeed × 0.4`.
- **Scoring**:
  - Distancia: `+1 pt por cada 30 scroll-px` acumulados.
  - Multiplicador de racha: cada segundo sin choque incrementa `streakBonus += 0.01` (máx. ×3.0).
    Al recibir un choque: `streakBonus` se resetea a 1.0.
  - Score aplicado: `floor(distancePts × streakBonus)`.
  - Bonus de turbo: durante el turbo activo, la distancia recorrida cuenta al doble.
  - La pantalla muestra el score como distancia en **km** (`floor(totalScrollPx / 1000)`)
    y el multiplicador de racha; el score que se guarda en Supabase es el score compuesto
    (`floor(distancePts × streakBonus)`).
- **HUD interno del canvas**:
  - Banda superior: `KM: N` (izquierda), `×N.N` multiplicador de racha (centro),
    iconos de impacto (♦ × 3, tachados según `crashesLeft`) a la derecha.
  - Iconos de power-up activos (pequeños, en fila bajo la banda superior):
    ⚡ naranja si turbo activo + barra de tiempo restante, 🛡 azul si escudo activo,
    ×2 verde si doble fuel activo.
  - Barra de combustible en la parte inferior del canvas (mismo estilo que spec 01).
- El componente notifica a React vía callbacks (comparando con valor anterior).
- La pausa se controla exclusivamente vía prop `paused`; el loop llama a `draw()` pero
  no ejecuta `update()` ni avanza timers durante la pausa.
- Limpiar event listeners (`keydown`, `keyup` en `document`) en el `return` del `useEffect`.
- Crear `app/games/road-fighter-fuel-crisis/play/page.tsx` — play-page con
  `dynamic(..., { ssr: false })`.
- Modal game over: muestra score compuesto y distancia en km; pre-rellena nombre desde
  `localStorage.getItem('av_player_name')`, inserta en Supabase
  `{ game_id: 'road-fighter-fuel-crisis', player_name: name, score, user_id: null }`,
  persiste nombre. Botón de guardar se deshabilita tras el primer envío.

**Fuera de alcance:**

- Controles táctiles o mobile.
- Supabase Auth y RLS — `user_id` se almacena como `null`.
- Realtime en el leaderboard.
- Sprites externos (imágenes PNG) para los coches o power-ups — se usan formas canvas primitivas.
- Efectos de sonido.
- Modo multijugador.
- Persistencia del estado de la partida (localStorage de mid-run).
- Más de 3 tipos de power-up.
- Obstáculos fijos en la carretera (baches, barreras).

---

## Data model

### INSERT en tabla `games`

```sql
INSERT INTO games (id, title, short, long, cat, cover, color)
VALUES (
  'road-fighter-fuel-crisis',
  'ROAD FIGHTER: FUEL CRISIS',
  'Sobrevive sin quedarte sin gasolina en carretera infinita.',
  'El depósito empieza casi vacío y el tráfico no para de crecer. Recoge latas, activa turbos y escudos, y construye una racha sin choques para multiplicar tu puntuación. Tres golpes o cero litros y la carrera termina.',
  'RACING',
  'cover-road-fighter-fuel-crisis',
  'amber'
);
```

### Props del componente `RoadFighterFuelCrisisGame`

```ts
interface RoadFighterFuelCrisisGameProps {
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
}
```

El estado local arranca con `lives = 3` (= `crashesLeft`), `score = 0`, `level = 1`.
`onLivesChange` se llama con el valor actualizado de `crashesLeft` tras cada choque.
`onLivesChange(0)` se dispara justo antes de `onGameOver(score)` en ambas condiciones de fin.
`onLevelChange(n)` se dispara cada vez que `scrollSpeed` alcanza un múltiplo de 50 desde 200.

No se introducen nuevas tablas ni tipos TypeScript — se reutilizan `GameRow` y `ScoreRow`
de `lib/supabase/types.ts`.

### Modelo de datos interno (dentro del `useRef` de estado del juego)

```ts
type RivalType = 'slow' | 'fast' | 'erratic';
type PowerUpType = 'turbo' | 'shield' | 'doubleFuel';
type GamePhase = 'idle' | 'playing' | 'gameover';

interface RivalCar {
  id: number;
  type: RivalType;
  x: number;
  y: number;
  vy: number;
  color: string;
  laneTarget: number;
  laneTimer: number;
}

interface FuelCan {
  id: number;
  x: number;
  y: number;
}

interface PowerUp {
  id: number;
  type: PowerUpType;
  x: number;
  y: number;
}

interface ActivePowerUps {
  turbo: boolean;
  turboTimer: number;      // ms restantes
  shield: boolean;         // absorbe el próximo choque
  doubleFuel: boolean;     // activo hasta recoger 1 lata
}

interface FuelCrisisState {
  phase: GamePhase;
  totalTime: number;         // ms transcurridos desde el inicio
  totalScrollPx: number;     // scroll-px acumulados en toda la partida
  scrollSpeed: number;       // px/s actual
  scrollAccum: number;       // px para animar rayas del asfalto
  crashesLeft: number;       // 3 → 0
  fuel: number;              // 0-100
  score: number;             // score compuesto
  distancePts: number;       // pts de distancia acumulados (sin multiplicador)
  streakBonus: number;       // multiplicador actual (1.0-3.0)
  streakTimer: number;       // ms desde el último choque (para incrementar streakBonus)
  level: number;             // nivel actual (aumenta cada +50 px/s de scrollSpeed)
  rivals: RivalCar[];
  fuelCans: FuelCan[];
  powerUps: PowerUp[];
  active: ActivePowerUps;
  isInvincible: boolean;
  invincibleTimer: number;
  spawnTimer: number;
  fuelSpawnTimer: number;
  powerUpSpawnTimer: number;
  roadCurveOffset: number;   // calculado con seno (no es parte del estado editable)
  keys: Record<string, boolean>;
  lastTime: number;
  playerX: number;
  nextRivalId: number;
  nextCanId: number;
  nextPuId: number;
}
```

---

## Implementation plan

1. **INSERT en Supabase** — ejecutar el SQL del data model en el SQL Editor de Supabase.
   Verificación: la fila `road-fighter-fuel-crisis` aparece en el Table Editor; `/games`
   muestra la card con cover `cover-road-fighter-fuel-crisis` y color `amber`.

2. **Crear `components/games/RoadFighterFuelCrisisGame.tsx`** — componente `"use client"` que:

   2a. **Canvas y constantes de módulo**
   ```ts
   const W = 480, H = 640;
   const HORIZON_Y = 180;
   const ROAD_BOT_HALF_W = 180;
   const ROAD_TOP_HALF_W = 60;
   const ROAD_CENTER_X = 240;
   const PLAYER_Y = 560;
   const CAR_W = 32, CAR_H = 48;
   const FUEL_CAN_W = 20, FUEL_CAN_H = 28;
   const POWER_UP_W = 24, POWER_UP_H = 24;
   const PLAYER_SPEED = 240;       // px/s
   const FUEL_DRAIN_BASE = 10;     // u/s a scrollSpeed base
   const SCROLL_SPEED_INIT = 200;
   const SCROLL_SPEED_MAX = 600;
   const SCROLL_SPEED_INCREMENT = 5; // px/s cada 10 s
   const INVINCIBLE_DURATION = 2000;
   const TURBO_DURATION = 5000;
   const TURBO_MULT = 1.5;
   const STRIPE_PERIOD = 160;
   const SCORE_PX_RATE = 30;       // scroll-px por punto de distancia

   const RIVAL_BASE: Record<RivalType, { color: string; baseVy: number }> = {
     slow:    { color: '#888888', baseVy: 110 },
     fast:    { color: '#cc2222', baseVy: 290 },
     erratic: { color: '#ddaa00', baseVy: 180 },
   };

   const POWER_UP_COLORS: Record<PowerUpType, string> = {
     turbo:      '#ff8800',
     shield:     '#4488ff',
     doubleFuel: '#22cc44',
   };
   ```

   2b. **Función `roadBoundsAtY`** — idéntica a spec 01.

   2c. **`initGame()`** — inicializa `FuelCrisisState`:
   - `phase = 'playing'`, `totalTime = 0`, `totalScrollPx = 0`, `scrollSpeed = SCROLL_SPEED_INIT`.
   - `crashesLeft = 3`, `fuel = 60`, `score = 0`, `distancePts = 0`, `streakBonus = 1.0`.
   - `streakTimer = 0`, `level = 1`, `playerX = ROAD_CENTER_X`.
   - Listas vacías: `rivals`, `fuelCans`, `powerUps`.
   - `active = { turbo: false, turboTimer: 0, shield: false, doubleFuel: false }`.
   - `isInvincible = false`, `invincibleTimer = 0`.
   - `spawnTimer = 1200`, `fuelSpawnTimer = 5000`, `powerUpSpawnTimer = 8000`.
   - Llama `onLevelChange(1)`.

   2d. **`update(dt: number)`** — solo ejecuta si `phase === 'playing'` y `!paused`:

   - **Timers globales**:
     - `totalTime += dt`.
     - Velocidad: cada 10 000 ms de `totalTime`, incrementa `scrollSpeed` en
       `SCROLL_SPEED_INCREMENT` (máx. `SCROLL_SPEED_MAX`).
       Nuevo nivel = `floor((scrollSpeed - SCROLL_SPEED_INIT) / 50) + 1`.
       Si difiere del `level` anterior, actualiza `level` y llama `onLevelChange(level)`.

   - **Scroll y distancia**:
     - `effectiveSpeed = scrollSpeed × (active.turbo ? TURBO_MULT : 1)`.
     - `scrollAccum += effectiveSpeed * dt/1000`.
     - `totalScrollPx += effectiveSpeed * dt/1000`.
     - `distancePts += effectiveSpeed * dt/1000 / SCORE_PX_RATE`.

   - **Curva del horizonte** (senoidal continua):
     - `roadCurveOffset = 90 × Math.sin(totalTime × 0.0008)`.

   - **Multiplicador de racha**:
     - `streakTimer += dt`.
     - Cada 1 000 ms de `streakTimer` sin choque: `streakBonus = min(3.0, streakBonus + 0.01)`.
     - Score actualizado: `score = floor(distancePts × streakBonus × (active.turbo ? 2 : 1))`.
     - Llama `onScoreChange(score)` si cambió.

   - **Power-ups activos**:
     - Turbo: si `active.turbo`, decrementa `active.turboTimer -= dt`;
       cuando llega a 0, `active.turbo = false`.
     - Shield y doubleFuel: se desactivan en la lógica de colisión (un solo uso).

   - **Invencibilidad**:
     - Si `isInvincible`: `invincibleTimer -= dt`; cuando llega a 0, `isInvincible = false`.

   - **Movimiento del jugador**:
     - Si `keys['ArrowLeft']`: `playerX -= PLAYER_SPEED * dt/1000`.
     - Si `keys['ArrowRight']`: `playerX += PLAYER_SPEED * dt/1000`.
     - `bounds = roadBoundsAtY(PLAYER_Y, roadCurveOffset)`.
     - Si `playerX < bounds.left + CAR_W/2` o `playerX > bounds.right - CAR_W/2`:
       clamp, y si `!isInvincible` → `triggerCrash()`.

   - **Spawn de rivales**:
     - `spawnTimer -= dt`; si llega a 0:
       `maxRivals = min(12, floor(2 + totalTime / 15000))`.
       Si `rivals.length < maxRivals`: generar rival (tipo ponderado igual que spec 01
       pero con pesos dependientes de `level`: nivel 1-3 = 60/20/20, nivel 4-6 = 30/40/30,
       nivel 7+ = 20/50/30).
       `vy = RIVAL_BASE[type].baseVy + scrollSpeed × 0.4`.
       `x` dentro de `roadBoundsAtY(HORIZON_Y + 10, roadCurveOffset)`.
       `y = HORIZON_Y - CAR_H/2`.
       `spawnTimer = max(400, 1500 - totalTime / 10000 × 200) × random(0.8, 1.2)`.

   - **Movimiento de rivales**:
     - Para cada rival: `rival.y += rival.vy * dt/1000`.
     - Para erratic: `laneTimer -= dt`; si llega a 0, nuevo `laneTarget` en la carretera,
       `laneTimer = random(1500, 3000)`.
       `rival.x = lerp(rival.x, rival.laneTarget, dt/1000 × 2)`.
     - Eliminar si `rival.y > H + CAR_H`.

   - **Spawn de latas**:
     - `fuelSpawnTimer -= dt`; si llega a 0 y `fuel < 90`:
       generar lata con `x` dentro de la carretera, `y = HORIZON_Y`.
       `fuelSpawnTimer = random(4000, 7000) / max(1, scrollSpeed / 200)`.

   - **Spawn de power-ups**:
     - `powerUpSpawnTimer -= dt`; si llega a 0:
       si no hay ya más de 2 power-ups en pantalla: generar uno.
       Tipo: aleatorio según probabilidades (turbo 40 %, shield 30 %, doubleFuel 30 %).
       `x` dentro de la carretera, `y = HORIZON_Y`.
       `powerUpSpawnTimer = random(6000, 12000)`.

   - **Movimiento de latas y power-ups**:
     - `can.y += scrollSpeed * dt/1000`; eliminar si `can.y > H + FUEL_CAN_H`.
     - `pu.y += scrollSpeed * dt/1000`; eliminar si `pu.y > H + POWER_UP_H`.

   - **Consumo de combustible**:
     - `fuel -= FUEL_DRAIN_BASE × (effectiveSpeed / SCROLL_SPEED_INIT) × dt/1000`.
     - Si `fuel <= 0`: `fuel = 0`; llamar `onLivesChange(0)`, `onGameOver(score)`,
       `phase = 'gameover'`.

   - **Colisiones jugador↔rival** (AABB):
     - Si `!isInvincible` y AABB se solapan: `triggerCrash()`.

   - **Colisiones jugador↔lata** (AABB):
     - Si se solapan: `fuel = min(100, fuel + (active.doubleFuel ? 50 : 25))`.
       Si `active.doubleFuel`: `active.doubleFuel = false`. Eliminar lata.

   - **Colisiones jugador↔power-up** (AABB):
     - Si se solapan: activar el power-up correspondiente:
       - Turbo: `active.turbo = true`, `active.turboTimer = TURBO_DURATION`.
       - Shield: `active.shield = true`.
       - DoubleFuel: `active.doubleFuel = true`.
       Eliminar power-up.

   - **`triggerCrash()`**:
     - Si `active.shield`: `active.shield = false`; no decrement `crashesLeft`; fin.
     - `crashesLeft -= 1`; llama `onLivesChange(crashesLeft)`.
     - `streakBonus = 1.0`; `streakTimer = 0`.
     - Si `crashesLeft <= 0`: llama `onLivesChange(0)`, `onGameOver(score)`,
       `phase = 'gameover'`. Fin.
     - Si no: `isInvincible = true`, `invincibleTimer = INVINCIBLE_DURATION`.

   2e. **`draw(ctx)`** — ejecuta siempre:
   - **Fondo, carretera, arcén, rayas**: idéntico a spec 01 usando `roadCurveOffset`
     calculado por seno.
   - **Latas de combustible**: rectángulo verde con texto "⛽" centrado.
   - **Power-ups**: círculo del color del tipo con el icono correspondiente:
     ⚡ (turbo), ♦ (shield, representado como escudo), ×2 (doubleFuel).
   - **Rivales**: idéntico a spec 01.
   - **Coche del jugador**: idéntico a spec 01 con parpadeo si `isInvincible`.
     Si `active.shield`: dibujar halo azul alrededor del coche.
     Si `active.turbo`: dibujar estela naranja de 3 rectángulos degradados detrás del coche.
   - **HUD interno** (banda superior 0-70 px, fondo semitransparente negro 60 %):
     - Izquierda: `KM: N` donde `N = floor(totalScrollPx / 1000)`.
     - Centro: `×N.N` (multiplicador de racha) en color `#ffcc00` si ≥1.5, blanco si <1.5.
     - Derecha: tres iconos ♦ en rojo/gris según `crashesLeft` (tachados los consumidos).
     - Segunda fila bajo la banda: iconos de power-ups activos con sus timers/estado:
       - ⚡ naranja + barra proporcional a `turboTimer / TURBO_DURATION` (solo si activo).
       - ♦ azul (solo si shield activo).
       - ×2 verde (solo si doubleFuel activo).
   - **Barra de combustible** (zona inferior H-24 a H): idéntico a spec 01.
   - **Fase idle**: overlay negro 60 %, texto "ROAD FIGHTER: FUEL CRISIS" en ámbar,
     descripción breve de controles ("← → Mover · ENTER Empezar"), instrucción sobre el
     depósito bajo ("¡El depósito empieza casi vacío!") en rojo.
   - **Fase gameover**: overlay negro, "GAME OVER" en rojo + distancia alcanzada en km.

   2f. **Event listeners** en `useEffect`:
   - `keydown`: `keys[e.key] = true`; si `key === 'Enter'` y `phase === 'idle'`:
     llamar `initGame()`.
   - `keyup`: `keys[e.key] = false`.
   - `return`: remover ambos listeners, cancelar el frame con `cancelAnimationFrame`.

   Verificación: el juego arranca en `/games/road-fighter-fuel-crisis/play`; el depósito
   parte en 60 %; los power-ups aparecen con sus efectos visuales distintos; el multiplicador
   de racha sube con el tiempo sin choques; al recoger una lata con doubleFuel activo se
   recuperan 50 u; tres choques o fuel vacío disparan el modal.

3. **Crear `app/games/road-fighter-fuel-crisis/play/page.tsx`** — play-page específica:
   - Importa `RoadFighterFuelCrisisGame` con `dynamic(..., { ssr: false })`.
   - Estado local: `score`, `lives` (inicial `3`), `level` (inicial `1`), `paused`, `over`,
     `name`, `saved`, `gameKey`.
   - Pasa `paused` y los cuatro callbacks a `RoadFighterFuelCrisisGame`.
   - Reutiliza el layout visual de la plataforma (HUD React + CRT + modal game over).
   - El HUD React de la plataforma muestra `lives` como «Intentos» (el texto de etiqueta
     no cambia el contrato; se mapea directamente desde el callback `onLivesChange`).
   - Modal game over: muestra el score compuesto; pre-rellena nombre desde
     `localStorage.getItem('av_player_name')`; al confirmar, guarda en `localStorage` e
     inserta en Supabase
     `{ game_id: 'road-fighter-fuel-crisis', player_name: name, score, user_id: null }`.
   - Botón de guardar se deshabilita tras el primer envío.
   - Botón «JUGAR DE NUEVO» incrementa `gameKey` para remontar el componente canvas.
     Verificación: el HUD React refleja score, intentos restantes y nivel en tiempo real;
     tras una partida el score aparece en `/games/road-fighter-fuel-crisis` y en
     `/hall-of-fame` al recargar.

4. **Verificación final** — `npm run build` termina sin errores de TypeScript.
   Ninguna ruta existente devuelve 500.

---

## Acceptance criteria

- [ ] La fila `road-fighter-fuel-crisis` existe en la tabla `games` de Supabase.
- [ ] La card aparece en `/games` con cover `cover-road-fighter-fuel-crisis` y color `amber`.
- [ ] La ruta `/games/road-fighter-fuel-crisis/play` carga sin errores de SSR ni de TypeScript.
- [ ] El canvas (480 × 640) se renderiza con hierba, carretera trapezoidal y curvas continuas.
- [ ] La fase idle muestra el título y «¡El depósito empieza casi vacío!» en rojo.
- [ ] Pulsar Enter inicia la partida con `fuel = 60` y llama `onLevelChange(1)`.
- [ ] El depósito de combustible se consume continuamente y la barra desciende.
- [ ] Recoger una lata restaura +25 u (o +50 u si doubleFuel está activo).
- [ ] Recoger la primera lata con doubleFuel desactiva el power-up doubleFuel.
- [ ] El power-up Turbo acelera el scrollSpeed ×1.5 durante 5 s con estela naranja.
- [ ] El power-up Escudo absorbe el primer choque posterior sin decrementar crashesLeft.
- [ ] El power-up DoubleFuel activa el icono ×2 en el HUD interno.
- [ ] Los tres tipos de rival aparecen con comportamiento correcto (slow/fast/erratic).
- [ ] La densidad de rivales crece con el tiempo (fórmula `floor(2 + totalTime/15000)`).
- [ ] `scrollSpeed` aumenta +5 px/s cada 10 s de juego hasta máximo 600 px/s.
- [ ] `onLevelChange(n)` se dispara cada vez que `scrollSpeed` alcanza un múltiplo de 50.
- [ ] El multiplicador de racha sube 0.01 por segundo sin choque y se resetea a 1.0 al chocar.
- [ ] El multiplicador se muestra en el HUD interno en ámbar si ≥×1.5, blanco si menor.
- [ ] Un choque sin escudo decrementa `crashesLeft` y llama `onLivesChange(crashesLeft)`.
- [ ] Al recibir 3 choques, `onLivesChange(0)` y `onGameOver(score)` se disparan.
- [ ] Con fuel=0, `onLivesChange(0)` y `onGameOver(score)` se disparan.
- [ ] El coche parpadea 2 s tras un choque (invencibilidad).
- [ ] Un choque durante el parpadeo de invencibilidad no cuenta.
- [ ] El HUD interno muestra KM recorridos, multiplicador de racha e intentos restantes.
- [ ] El HUD React de la plataforma refleja score, intentos restantes y nivel en tiempo real.
- [ ] El botón "PAUSA" congela el game loop y todos los timers; "REANUDAR" los reanuda.
- [ ] Las teclas P / Esc no producen pausa independiente en el canvas.
- [ ] El modal game over muestra la puntuación compuesta.
- [ ] El modal pre-rellena el nombre desde `av_player_name` de localStorage si existe.
- [ ] Al confirmar, el score se inserta en Supabase y el nombre se persiste en localStorage.
- [ ] El botón de guardar se deshabilita tras el primer envío (sin doble inserción).
- [ ] El botón "JUGAR DE NUEVO" reinicia la partida desde cero con `fuel=60` y `crashesLeft=3`.
- [ ] El score guardado aparece en `/games/road-fighter-fuel-crisis` y en `/hall-of-fame`.
- [ ] `npm run build` completa sin errores de TypeScript.
- [ ] Ninguna ruta existente devuelve 500.

---

## Decisions

- **Sí: Doble HUD** — el canvas conserva su HUD interno y React muestra los mismos valores
  en el HUD de la plataforma. Razón: coherencia con el patrón establecido en todos los juegos
  de la plataforma; el canvas funciona visualmente como standalone.

- **Sí: `crashesLeft` mapeado como `lives` en la plataforma** — el campo `lives` del HUD
  React representa los intentos de choque restantes (3 → 0). Razón: el contrato de la
  plataforma requiere `onLivesChange`; mapear `crashesLeft` es semánticamente coherente
  (ambos representan «recursos defensivos restantes») y no requiere cambiar ningún
  componente genérico de la plataforma.

- **Sí: Sin etapas fijas — dificultad progresiva automática** — la velocidad y densidad
  de rivales crecen continuamente por función del tiempo, sin cortes discretos de etapa.
  Razón: el modo Fuel Crisis es una variante survival; la carretera infinita sin estructura
  de etapas maximiza la replayability y diferencia claramente esta variante del spec 01.

- **Sí: Depósito arranca al 60 %** — el juego comienza con tensión inmediata.
  Razón: si arrancara al 100 % los primeros 30 s serían prácticamente sin presión, lo que
  debilitaría la propuesta de valor del modo; 60 % obliga al jugador a buscar latas desde
  el inicio.

- **Sí: Multiplicador de racha con cap en ×3.0** — el multiplicador sube lentamente
  (+0.01 por segundo) y se resetea al 1.0 al chocar. Razón: incentiva el juego limpio
  sin choques; el cap evita puntuaciones abusivas en sesiones muy largas.

- **Sí: Turbo dobla distancia-pts durante su duración** — mientras el turbo está activo,
  los puntos de distancia cuentan ×2. Razón: el turbo aumenta el scrollSpeed efectivo
  (generando más distancia real) y además bonifica esa distancia, creando una ventana de
  alta puntuación que compensa el mayor consumo de combustible durante el turbo.

- **Sí: Curva del horizonte por función senoidal continua** — `roadCurveOffset = 90 × sin(totalTime × 0.0008)`.
  Razón: produce curvas suaves y predecibles (el jugador puede anticiparlas) sin estados
  discretos ni timers de curva; más adecuado para un modo endless sin structure fija.

- **Sí: Power-ups como objetos en la carretera recogibles por AABB** — los power-ups
  aparecen en la carretera y se recogen conduciendo sobre ellos, igual que las latas.
  Razón: coherencia visual con el sistema de latas; no requiere mecánicas de disparo
  ni selección de menú.

- **Sí: Play-page específica `app/games/road-fighter-fuel-crisis/play/page.tsx`**.
  Razón: coherencia con el resto de juegos; Next.js App Router da prioridad a rutas
  estáticas sobre dinámicas.

- **Sí: `dynamic(..., { ssr: false })`** — el componente canvas se carga solo en cliente.
  Razón: `canvas` y `requestAnimationFrame` no existen en el entorno Node.js de Next.js SSR.

- **Sí: Solo un power-up activo de cada tipo simultáneamente** — si ya hay un turbo activo
  y se recoge otro, el timer se reinicia pero no se acumula. Razón: simplifica el modelo
  de estado interno; el jugador puede percibir claramente qué tiene activo sin UI compleja.

- **No: Modo de vidas clásico** — no hay vidas en sentido estricto; solo 3 tolerancias
  de choque que se mapean al campo `lives`. Razón: la diferenciación principal de esta
  variante respecto al spec 01 es que el combustible es el recurso crítico; un sistema
  de vidas clásico redundaría con el spec 01.

- **No: Controles táctiles o mobile** — fuera de alcance.
  Razón: se pueden añadir mediante el agente `mobile-porter` en una corrida separada.

- **No: Supabase Auth y RLS** — `user_id` se guarda como `null`.
  Razón: consistencia con todos los juegos actuales de la plataforma.

- **No: Realtime en leaderboard** — los scores se ven al recargar.
  Razón: la complejidad de subscriptions no aporta valor mientras haya pocos jugadores activos.

- **No: Efectos de sonido** — fuera de alcance en este spec.
  Razón: se cubren en un spec separado de audio; no añadir dependencias de Web Audio API
  sin un plan de implementación completo.

- **No: Persistencia de mid-run** — si el jugador cierra la pestaña, la partida se pierde.
  Razón: las partidas son cortas por diseño (el combustible limita la duración); serializar
  todo el estado del juego en localStorage añadiría complejidad sin beneficio proporcional.
