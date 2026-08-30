# SPEC — Street Fighter II Classic (Modo 1 jugador vs IA con 8 oponentes)

> **Estado:** Propuesto
> **Depende de:** 06-games-table-leaderboard-supabase
> **Fecha:** 2026-08-27
> **Objetivo:** Implementar Street Fighter II como juego jugable en Arcade Vault con modo
> clásico 1 vs IA en canvas puro: el jugador elige uno de 4 luchadores, ejecuta ataques
> y movimientos especiales mediante combinaciones de teclas, y derrota 8 oponentes con
> dificultad creciente acumulando puntos por daño infligido, rondas ganadas y tiempo restante.

---

## Scope

**In:**

- INSERT SQL para añadir la fila `street-fighter` a la tabla `games` en Supabase.
- Crear `components/games/StreetFighterGame.tsx` — componente React `"use client"` que
  encapsula un canvas (900 × 560 px). Acepta props:
  `paused`, `onScoreChange`, `onLivesChange`, `onLevelChange`, `onGameOver`,
  y la prop adicional `mode: 'classic' | 'survival'` (este spec cubre solo `'classic'`).
- Game loop construido desde cero con `requestAnimationFrame` y delta-time.
  Fases internas: `'char-select'` → `'pre-round'` → `'fighting'` → `'round-end'`
  → `'match-end'` → `'gameover'` / `'victory'`.
- **Selección de personaje** (fase `'char-select'`): canvas muestra 4 recuadros (uno por
  luchador) con nombre y barras de stats (velocidad, alcance, daño). El jugador navega con
  ← → y confirma con Enter.
- **4 luchadores** con stats distintos:
  | ID        | Nombre   | Velocidad | Alcance | Daño    | Color canvas  |
  |-----------|----------|-----------|---------|---------|---------------|
  | ryu       | RYU      | 1.00×     | +0 px   | 1.00×   | azul oscuro   |
  | ken       | KEN      | 1.10×     | −10 px  | 1.10×   | rojo carmín   |
  | chun-li   | CHUN-LI  | 1.25×     | −15 px  | 0.90×   | azul cobalto  |
  | guile     | GUILE    | 0.90×     | +15 px  | 1.00×   | verde oliva   |
- **Sprites con primitivas canvas** — no se usan imágenes externas. Cada luchador es una
  silueta compacta (rectángulo cuerpo + círculo cabeza + extremidades según pose activa)
  con el color de su tabla. El luchador CPU usa el mismo sprite en gris oscuro.
- **3 ataques base** activados con teclas Q/W/E:
  | Tecla | Tipo   | Daño base | Hitbox W × H | Duración activa |
  |-------|--------|-----------|--------------|-----------------|
  | Q     | Ligero | 7 HP      | 65 × 45 px   | 200 ms          |
  | W     | Medio  | 12 HP     | 80 × 40 px   | 270 ms          |
  | E     | Fuerte | 18 HP     | 95 × 35 px   | 350 ms          |
  - En postura agachada (↓ sin ↑): hitboxH reducida 20 px y hitboxY desplazada +30 px.
  - En salto: hitboxY se ajusta a la posición aérea del luchador.
  - El daño real = `dañoBase × damageMultiplier × (1 + reachBonus / 100)` del luchador elegido.
  - Hay un `startupMs = 80 ms` antes de que la hitbox se active.
- **Movimientos especiales** por secuencias de dirección + tecla de ataque:
  | Luchador | Nombre              | Secuencia       | Tecla | Daño | Proyectil |
  |----------|---------------------|-----------------|-------|------|-----------|
  | Ryu      | HADOUKEN            | ↓ → Q           | Q     | 15   | Sí        |
  | Ryu      | SHORYUKEN           | → ↓ → E         | E     | 22   | No        |
  | Ken      | HADOUKEN            | ↓ → Q           | Q     | 12   | Sí        |
  | Ken      | SHORYUKEN           | → ↓ → E         | E     | 25   | No        |
  | Ken      | TATSUMAKI           | ↓ ← W           | W     | 14   | No        |
  | Chun-Li  | KIKOKEN             | ← → Q           | Q     | 12   | Sí        |
  | Chun-Li  | SPINNING BIRD KICK  | ↓ ↑ E           | E     | 18   | No        |
  | Guile    | SONIC BOOM          | ← → Q           | Q     | 15   | Sí        |
  | Guile    | FLASH KICK          | ↓ ↑ E           | E     | 20   | No        |
  - La secuencia se reconoce si los inputs de dirección ocurren en orden dentro de una ventana
    de `SEQUENCE_WINDOW = 600 ms` y se completan con la tecla de ataque correspondiente.
  - Los proyectiles viajan horizontalmente a `PROJECTILE_SPEED = 350 px/s` hasta el borde opuesto
    del canvas o hasta impactar al defensor.
- **Controles completos de movimiento**:
  - ← →: desplazamiento lateral (velocidad base `MOVE_SPEED = 160 px/s × speedFactor`).
  - ↑: salto. El luchador aplica `JUMP_VELOCITY = -480 px/s` y `GRAVITY = 980 px/s²` hasta
    volver a `FLOOR_Y`. Durante el salto el jugador puede pulsar Q/W/E para ataque aéreo.
  - ↓: agacharse (mientras se mantiene pulsada, sin ↑).
  - ↓ + ↑ sin Q/W/E: bloqueo bajo (protege de ataques bajos). ↑ sin ataque: bloqueo alto.
    Un ataque bloqueado inflige el 10 % del daño base (chip damage).
- **Detección de colisión AABB**: la hitbox del atacante (desplazada en la dirección `facing`)
  se compara con el cuerpo del defensor (`FIGHTER_W × FIGHTER_H` centrado en su x/y).
  Si hay solapamiento y el defensor no bloquea (o bloquea el tipo incorrecto), se aplica daño.
  Stun post-impacto de 300 ms durante el cual el receptor no puede atacar.
- **8 oponentes** con dificultad creciente:
  | Nº | Personaje  | Nivel IA |
  |----|------------|----------|
  | 1  | Ryu        | 1        |
  | 2  | Ken        | 2        |
  | 3  | Chun-Li    | 3        |
  | 4  | Guile      | 4        |
  | 5  | Ken        | 5        |
  | 6  | Ryu        | 6        |
  | 7  | Guile      | 7        |
  | 8  | Ryu*       | 8        |
  (*último oponente con sprite en negro — slot de jefe final.)
- **Estructura de ronda**: HP máximo = 100 por luchador, reiniciado al inicio de cada ronda.
  Timer de ronda = 90 s. Primero en reducir el HP del rival a 0 gana la ronda.
  Si el timer llega a 0, gana la ronda quien tenga mayor HP; si empate, nadie gana la ronda
  (no se incrementa contador) y comienza nueva ronda.
- **Estructura de combate**: primero en ganar 2 rondas gana el combate (hasta 3 rondas por
  combate). Si el jugador pierde el combate → `'gameover'`. Si gana → siguiente oponente.
  Si gana los 8 combates → `'victory'`.
- **Sistema de puntuación**:
  - Al ganar una ronda: `1000 + Math.floor(roundTimer) × 100` puntos.
  - Ronda perfecta (jugador no recibió daño): +2000 pts.
  - El daño total infligido en la ronda (en HP) suma 1 pt por HP.
  - `onScoreChange` se llama después de cada ronda donde el jugador gana.
- **HUD interno** (franja superior 80 px, fondo negro semitransparente):
  - Barra de HP del jugador (izquierda → derecha, rojo → verde según %, con borde blanco).
  - Barra de HP del CPU (derecha → izquierda, misma escala).
  - Timer centrado en amarillo grande.
  - Nombre del luchador jugador (bajo la barra) y del CPU (bajo la barra derecha).
  - Círculos de rondas ganadas: ●= ganada, ○= pendiente, debajo de cada nombre.
- El componente notifica a React vía callbacks comparando con el valor anterior antes de disparar.
- `onLivesChange(1)` al iniciar la partida; `onLivesChange(0)` justo antes de `onGameOver(score)`.
- `onLevelChange(n)` al iniciar cada nuevo combate (n = 1 a 8).
- La pausa se controla exclusivamente vía prop `paused`; durante la pausa el loop llama a
  `draw()` pero no ejecuta `update()` ni avanza timers.
- Limpiar `keydown` y `keyup` de `document` en el `return` del `useEffect`.
- Crear `app/games/street-fighter/play/page.tsx` con `dynamic(..., { ssr: false })`.
- Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`,
  inserta en Supabase `{ game_id: 'street-fighter', player_name: name, score, user_id: null }`,
  persiste nombre. Botón de guardar se deshabilita tras el primer envío.

**Fuera de alcance:**

- Controles táctiles o mobile.
- Supabase Auth y RLS — `user_id` se almacena como `null`.
- Realtime en el leaderboard.
- Sprites con imágenes externas — todos los luchadores se dibujan con primitivas canvas.
- Efectos de sonido — cubiertos en un spec separado si se desea.
- Modo supervivencia endless — cubierto en `02-street-fighter-survival.md`.
- Modo 2 jugadores en el mismo teclado.
- Selector de dificultad manual — la IA escala por número de oponente.
- Movimientos especiales de carga (charge inputs) — se usan solo secuencias de dirección.

---

## Data model

### INSERT en tabla `games`

```sql
INSERT INTO games (id, title, short, long, cat, cover, color)
VALUES (
  'street-fighter',
  'STREET FIGHTER II',
  'Elige tu luchador y vence a 8 rivales con combos.',
  'Domina las técnicas de Ryu, Ken, Chun-Li o Guile y enfréntate a 8 oponentes controlados por IA con dificultad creciente. Encadena ataques ligeros, medios y fuertes con movimientos especiales para reducir la vida del rival antes de que acabe el tiempo.',
  'FIGHTING',
  'cover-street-fighter',
  'red'
);
```

### Props del componente `StreetFighterGame`

```ts
interface StreetFighterGameProps {
  mode: 'classic' | 'survival';
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
}
```

### Tipos internos del componente

```ts
type FighterId   = 'ryu' | 'ken' | 'chun-li' | 'guile';
type AttackKey   = 'light' | 'medium' | 'heavy';
type Direction   = 'left' | 'right' | 'up' | 'down';
type GamePhase   =
  | 'char-select'
  | 'pre-round'
  | 'fighting'
  | 'round-end'
  | 'match-end'
  | 'gameover'
  | 'victory';

interface FighterConfig {
  id: FighterId;
  name: string;
  speedFactor: number;
  reachBonus: number;      // px añadidos al hitbox W de cada ataque
  damageMult: number;
  color: string;           // color canvas para el sprite
}

interface SpecialMove {
  id: string;
  name: string;
  sequence: Direction[];   // teclas de dirección en orden
  attackKey: AttackKey;
  damage: number;          // daño base antes de multiplicador del luchador
  projectile: boolean;
  hitboxW: number;
  hitboxH: number;
}

interface Projectile {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;              // positivo = derecha, negativo = izquierda
  owner: 'player' | 'cpu';
  damage: number;
  active: boolean;
}

interface FighterState {
  config: FighterConfig;
  hp: number;
  x: number;
  y: number;               // base = FLOOR_Y; varía durante el salto
  vy: number;
  grounded: boolean;
  facing: 1 | -1;          // 1 = derecha, -1 = izquierda
  crouching: boolean;
  blocking: boolean;       // bloqueo activo (alto o bajo según postura)
  attackKey: AttackKey | null;
  attackTimer: number;     // ms totales restantes del ataque (startup + active)
  startupTimer: number;    // ms restantes antes de activar hitbox
  hitboxActive: boolean;
  specialId: string | null;
  specialTimer: number;
  stunTimer: number;       // ms de stun post-impacto
  damageDealt: number;     // HP total infligido esta ronda
  roundDamageDealt: number; // HP infligido en la ronda actual (para score)
  noDamageTaken: boolean;  // flag ronda perfecta
}

interface InputRecord {
  direction: Direction;
  timestamp: number;
}

interface ClassicState {
  phase: GamePhase;
  phaseTimer: number;
  player: FighterState;
  cpu: FighterState;
  projectiles: Projectile[];
  roundTimer: number;
  roundIndex: number;          // ronda dentro del combate actual (0-based)
  playerRoundsWon: number;
  cpuRoundsWon: number;
  opponentIndex: number;       // 0-7 (oponente actual dentro de los 8)
  totalScore: number;
  displayText: string;
  displayTextTimer: number;
  inputHistory: InputRecord[]; // historial de direcciones del jugador para specials
  cpuActionTimer: number;      // ms hasta próxima decisión de la IA
  keys: Record<string, boolean>;
  lastTime: number;
  gameOverFired: boolean;
  charSelectIndex: number;     // 0-3, índice de personaje resaltado en char-select
}
```

El estado local del componente arranca con `lives = 1`, `score = 0`, `level = 1`.
`onLivesChange(0)` se dispara justo antes de `onGameOver(score)` al finalizar la partida.
`onLevelChange(n)` se dispara al inicio de cada combate (valores 1 a 8).

No se introducen nuevas tablas — se reutilizan `GameRow` y `ScoreRow` de `lib/supabase/types.ts`.

---

## Implementation plan

1. **INSERT en Supabase** — ejecutar el SQL del data model en el SQL Editor de Supabase.
   Verificación: la fila `street-fighter` aparece en el Table Editor; `/games` muestra la
   card con cover `cover-street-fighter` y color `red`.

2. **Crear `components/games/StreetFighterGame.tsx`** — componente `"use client"` que:

   2a. **Canvas y constantes de módulo** (fuera del componente)
   ```ts
   const W = 900, H = 560;
   const HUD_H = 80;
   const FLOOR_Y = 500;
   const FIGHTER_W = 55, FIGHTER_H = 110;
   const PLAYER_INIT_X = 200;
   const CPU_INIT_X = 700;
   const MOVE_SPEED = 160;           // px/s base, multiplicado por speedFactor
   const JUMP_VELOCITY = -480;       // px/s
   const GRAVITY = 980;              // px/s²
   const MAX_HP = 100;
   const ROUND_TIME = 90;            // s
   const ROUNDS_TO_WIN = 2;
   const TOTAL_OPPONENTS = 8;
   const SEQUENCE_WINDOW = 600;      // ms
   const HITBOX_STARTUP = 80;        // ms antes de que la hitbox se active
   const PROJECTILE_SPEED = 350;     // px/s
   const STUN_DURATION = 300;        // ms post-impacto
   const CHIP_DAMAGE_FACTOR = 0.1;   // fracción del daño base al bloquear

   const FIGHTER_CONFIGS: Record<FighterId, FighterConfig> = {
     'ryu':     { id: 'ryu',     name: 'RYU',     speedFactor: 1.00, reachBonus:  0, damageMult: 1.00, color: '#3b5ea6' },
     'ken':     { id: 'ken',     name: 'KEN',     speedFactor: 1.10, reachBonus:-10, damageMult: 1.10, color: '#c0392b' },
     'chun-li': { id: 'chun-li', name: 'CHUN-LI', speedFactor: 1.25, reachBonus:-15, damageMult: 0.90, color: '#2471a3' },
     'guile':   { id: 'guile',   name: 'GUILE',   speedFactor: 0.90, reachBonus: 15, damageMult: 1.00, color: '#2e7d32' },
   };

   const ATTACK_CONFIGS: Record<AttackKey, { baseDamage: number; hitboxW: number; hitboxH: number; activeMs: number }> = {
     light:  { baseDamage:  7, hitboxW: 65, hitboxH: 45, activeMs: 200 },
     medium: { baseDamage: 12, hitboxW: 80, hitboxH: 40, activeMs: 270 },
     heavy:  { baseDamage: 18, hitboxW: 95, hitboxH: 35, activeMs: 350 },
   };

   const SPECIAL_MOVES: Record<FighterId, SpecialMove[]> = {
     'ryu':     [
       { id: 'hadouken',  name: 'HADOUKEN',  sequence: ['down','right'], attackKey: 'light', damage: 15, projectile: true,  hitboxW: 30, hitboxH: 30 },
       { id: 'shoryuken', name: 'SHORYUKEN', sequence: ['right','down','right'], attackKey: 'heavy', damage: 22, projectile: false, hitboxW: 50, hitboxH: 60 },
     ],
     'ken':     [
       { id: 'hadouken',  name: 'HADOUKEN',  sequence: ['down','right'], attackKey: 'light', damage: 12, projectile: true,  hitboxW: 30, hitboxH: 30 },
       { id: 'shoryuken', name: 'SHORYUKEN', sequence: ['right','down','right'], attackKey: 'heavy', damage: 25, projectile: false, hitboxW: 50, hitboxH: 60 },
       { id: 'tatsumaki', name: 'TATSUMAKI', sequence: ['down','left'],  attackKey: 'medium', damage: 14, projectile: false, hitboxW: 70, hitboxH: 50 },
     ],
     'chun-li': [
       { id: 'kikoken',   name: 'KIKOKEN',   sequence: ['left','right'], attackKey: 'light', damage: 12, projectile: true,  hitboxW: 28, hitboxH: 28 },
       { id: 'bird-kick', name: 'SPINNING BIRD KICK', sequence: ['down','up'], attackKey: 'heavy', damage: 18, projectile: false, hitboxW: 80, hitboxH: 40 },
     ],
     'guile':   [
       { id: 'sonic-boom', name: 'SONIC BOOM', sequence: ['left','right'], attackKey: 'light', damage: 15, projectile: true,  hitboxW: 32, hitboxH: 26 },
       { id: 'flash-kick', name: 'FLASH KICK', sequence: ['down','up'],   attackKey: 'heavy', damage: 20, projectile: false, hitboxW: 55, hitboxH: 70 },
     ],
   };

   const OPPONENT_ROSTER: Array<{ fighterId: FighterId; difficultyLevel: number }> = [
     { fighterId: 'ryu',     difficultyLevel: 1 },
     { fighterId: 'ken',     difficultyLevel: 2 },
     { fighterId: 'chun-li', difficultyLevel: 3 },
     { fighterId: 'guile',   difficultyLevel: 4 },
     { fighterId: 'ken',     difficultyLevel: 5 },
     { fighterId: 'ryu',     difficultyLevel: 6 },
     { fighterId: 'guile',   difficultyLevel: 7 },
     { fighterId: 'ryu',     difficultyLevel: 8 },
   ];

   // ms de reacción y probabilidad de ataque de la IA por nivel de dificultad
   const CPU_REACTION_MS   = [0, 600, 520, 440, 360, 300, 240, 180, 120];
   const CPU_AGGRESSION    = [0, 0.25, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90];
   ```
   - Renderiza un único `<canvas>` de 900 × 560 px mediante `useRef<HTMLCanvasElement>`.
   - El estado del juego vive en `useRef<ClassicState>` para evitar re-renders.

   2b. **Fase `'char-select'`**
   - `draw()` en `'char-select'`: fondo negro; 4 recuadros horizontales centrados
     (200 × 220 px c/u, separados 20 px). Recuadro del índice `charSelectIndex` con borde
     amarillo (`#f1c40f`), los demás con borde blanco.
   - Dentro de cada recuadro: silueta del luchador (primitivas canvas con su `color`),
     nombre en blanco, y 3 barras de stats (Speed / Reach / Damage) proporcionales.
   - `keydown ArrowLeft`: decrementa `charSelectIndex` (clamp a 0).
   - `keydown ArrowRight`: incrementa `charSelectIndex` (clamp a 3).
   - `keydown Enter`: establece el luchador del jugador en el índice seleccionado y
     carga el primer oponente con `loadOpponent(0)`.
     Llama `onLivesChange(1)` y `onLevelChange(1)`.

   2c. **Función `loadOpponent(index)`**
   - Inicializa `FighterState` del jugador con HP = MAX_HP, x = PLAYER_INIT_X, y = FLOOR_Y.
   - Inicializa `FighterState` del CPU con el config de `OPPONENT_ROSTER[index]`,
     color gris oscuro `'#4a4a4a'` (el último oponente en color negro `'#1a1a1a'`).
   - Reinicia `playerRoundsWon = 0`, `cpuRoundsWon = 0`, `roundIndex = 0`.
   - Pasa a fase `'pre-round'` con `phaseTimer = 2000` ms y `displayText = 'ROUND 1'`.

   2d. **Fase `'pre-round'`**
   - `draw()` dibuja el escenario (fondo de arena con gradiente, plataforma inferior),
     los dos luchadores en pose de guardia, el HUD interno, y el `displayText` centrado
     en blanco sobre sombra negra.
   - Cuando `phaseTimer` llega a cero en `update()`, pasa a `'fighting'`
     y arranca `roundTimer = ROUND_TIME`.

   2e. **Fase `'fighting'` — `update(dt)` (dt en milisegundos)**

   *Procesamiento de input del jugador* (solo si `stunTimer <= 0`):
   - `ArrowLeft` / `ArrowRight`: mueve al jugador `MOVE_SPEED × speedFactor × dt/1000` px,
     clamp entre `FIGHTER_W/2` y `W - FIGHTER_W/2`. Actualiza `facing`.
   - `ArrowUp` sin `Q`, `W`, `E` activos: inicia salto si `grounded` → `vy = JUMP_VELOCITY`.
   - `ArrowDown`: establece `crouching = true` si `grounded`.
   - `ArrowUp` sin ataque, no saltando: `blocking = true` (bloqueo alto).
   - `ArrowDown` sin ataque: `blocking = true` (bloqueo bajo).
   - Al pulsar `q`, `w` o `e`: comprobar secuencia de special moves primero:
     - Buscar en `inputHistory` (descartando entradas con `timestamp < now - SEQUENCE_WINDOW`)
       si la cola de `direction` valores coincide con alguna `SpecialMove.sequence` del luchador.
     - Si hay coincidencia y la `attackKey` del special == tecla pulsada: activar el special.
     - Si no: activar el ataque normal con el `AttackKey` correspondiente.
   - Registrar la tecla de dirección en `inputHistory` al pulsar ← → ↑ ↓.

   *Ejecución de ataque normal*:
   - Establece `attackKey`, `attackTimer = HITBOX_STARTUP + activeMs`, `startupTimer = HITBOX_STARTUP`.
   - Calcula `hitboxActive = false` hasta que `startupTimer <= 0`.

   *Ejecución de special move*:
   - Establece `specialId` y `specialTimer = HITBOX_STARTUP + 400 ms`.
   - Si `projectile = true`: crea un `Projectile` en la posición del luchador con
     `vx = ±PROJECTILE_SPEED`, `damage` del special × `damageMult` del luchador.
   - Si `projectile = false`: la hitbox del special se calcula igual que un ataque normal
     pero con las dimensiones del `SpecialMove`.

   *Física de salto*:
   - Si no `grounded`: `vy += GRAVITY × dt/1000`; `y += vy × dt/1000`.
   - Si `y >= FLOOR_Y`: `y = FLOOR_Y`, `vy = 0`, `grounded = true`.

   *Movimiento de proyectiles*:
   - Para cada `Projectile` activo: `x += vx × dt/1000`.
   - Si sale del canvas (`x < 0` o `x > W`): `active = false`.

   *Detección de colisión AABB* (para ataques y proyectiles del jugador):
   - Calcular `hitboxRect` del jugador según `facing`, tipo de ataque y postura.
   - Calcular `bodyRect` del CPU: `{ x: cpu.x - FIGHTER_W/2, y: cpu.y - FIGHTER_H, w: FIGHTER_W, h: FIGHTER_H }`.
   - Si `hitboxRect` se solapa con `bodyRect`:
     - Si `cpu.blocking`:
       - Bloqueo válido si ataque alto + blocking alto, o ataque bajo/agachado + blocking bajo.
       - Daño = `baseDamage × damageMult × CHIP_DAMAGE_FACTOR` (chip damage).
     - Si no bloquea: daño = `baseDamage × damageMult` (+ `reachBonus / 100`).
     - Aplica `cpu.stunTimer = STUN_DURATION`.
     - Acumula `player.roundDamageDealt += daño`.
     - Llama `onScoreChange` con la suma parcial.
     - Desactiva `hitboxActive` para evitar doble conteo en el mismo ataque.
   - Para proyectiles: misma lógica, desactivar proyectil tras impacto.

   *Detección de colisión CPU → jugador*: misma lógica en sentido inverso para los ataques de la IA.

   *HP a cero*: si `cpu.hp <= 0`: pasa a `'round-end'` con `displayText = 'K.O.'`.
   Si `player.hp <= 0`: pasa a `'round-end'` con `displayText = 'K.O.'`.

   *Timer de ronda*: decrementa `roundTimer` por `dt/1000`.
   Si `roundTimer <= 0`:
   - Gana quien tenga mayor HP. Si empate: no se suma ronda, nueva ronda sin reiniciar HP.
   - Pasa a `'round-end'` con `displayText = 'TIME'`.

   *Decisiones de la IA*:
   - La IA evalúa cada `cpuActionTimer` ms. Reinicia `cpuActionTimer` con el valor de
     `CPU_REACTION_MS[difficultyLevel]` tras cada decisión.
   - Probabilidad de ataque = `CPU_AGGRESSION[difficultyLevel]`.
   - Si ataca: elige al azar entre Q, W, E y opcionales specials del luchador CPU.
   - Si no ataca: 50 % bloquea, 50 % se desplaza hacia el jugador.
   - Todos los ataques de la IA pasan por el mismo sistema de hitboxes AABB.

   2f. **Fase `'round-end'`** (`phaseTimer = 1500 ms`)
   - `draw()` muestra `displayText` ('K.O.' o 'TIME') centrado en rojo.
   - Cuando `phaseTimer` llega a cero en `update()`:
     - Determina ganador de la ronda (jugador o CPU).
     - Si jugador ganó la ronda:
       - `playerRoundsWon++`.
       - Si `player.noDamageTaken`: añadir bonus perfecta al score.
       - `totalScore += 1000 + Math.floor(roundTimer) × 100 + player.roundDamageDealt`.
       - Llamar `onScoreChange(totalScore)`.
     - Si CPU ganó la ronda: `cpuRoundsWon++`.
     - Si `playerRoundsWon >= ROUNDS_TO_WIN` o `cpuRoundsWon >= ROUNDS_TO_WIN`:
       pasa a `'match-end'`.
     - Si no: `roundIndex++`; reiniciar HP a MAX_HP de ambos luchadores, `noDamageTaken`,
       `roundDamageDealt`; poner `displayText = 'ROUND ' + (roundIndex + 1)`;
       pasa a `'pre-round'` con `phaseTimer = 2000 ms`.

   2g. **Fase `'match-end'`** (`phaseTimer = 2500 ms`)
   - Si `playerRoundsWon >= ROUNDS_TO_WIN`: `displayText = 'YOU WIN!'`.
   - Si `cpuRoundsWon >= ROUNDS_TO_WIN`: `displayText = 'YOU LOSE'`.
   - Cuando `phaseTimer` llega a cero:
     - Si `cpuRoundsWon >= ROUNDS_TO_WIN`: pasa a `'gameover'`.
     - Si `playerRoundsWon >= ROUNDS_TO_WIN`:
       - Si `opponentIndex >= TOTAL_OPPONENTS - 1`: pasa a `'victory'`.
       - Si no: `opponentIndex++`; llamar `onLevelChange(opponentIndex + 1)`;
         `loadOpponent(opponentIndex)`.

   2h. **Fases `'gameover'` y `'victory'`**
   - `draw()` en `'gameover'`: fondo negro, texto 'GAME OVER' en rojo grande, score final.
   - `draw()` en `'victory'`: fondo con gradiente dorado, texto 'CONGRATULATIONS!' en amarillo.
   - Ambas disparan la secuencia de callbacks (una sola vez, protegida con `gameOverFired`):
     `onScoreChange(totalScore)` → `onLivesChange(0)` → `onGameOver(totalScore)`.

   2i. **Render del escenario y luchadores** (en fase `'fighting'` y `'pre-round'`)
   - **Fondo**: zona superior con gradiente azul oscuro; suelo de `FLOOR_Y` a `H` con
     gradiente marrón claro / marrón oscuro. Línea horizonte en `FLOOR_Y` color crema.
   - **Luchadores**: silueta con `ctx.fillRect` para el cuerpo y `ctx.arc` para la cabeza.
     Brazos y piernas como rectángulos rotados según la pose (idle, ataque, agachado, salto).
     Si `blocking = true`: rectángulo semitransparente (`rgba(255,255,255,0.3)`) ante el cuerpo.
     Si `stunTimer > 0`: luchador parpadea (alternancia de opacidad cada 80 ms).
   - **Proyectiles**: dibujados como círculos (`arc`) del color del luchador origen, con halo.
   - **Nombre del special** (cuando `specialId` activo): texto flotante sobre el luchador
     (`'#f1c40f'`, fuente pequeña) que desaparece cuando `specialTimer <= 0`.
   - **HUD interno** (franja superior 80 px):
     - Barra HP jugador: `x=20, y=20, w=340, h=20`. Fondo `#333`, relleno verde-amarillo-rojo
       según porcentaje (>60 %: `#27ae60`; 30-60 %: `#f39c12`; <30 %: `#e74c3c`).
     - Barra HP CPU: `x=540, y=20, w=340, h=20`, espejada (se rellena de derecha a izquierda).
     - Timer: `ctx.font = 'bold 28px monospace'`, color `#f1c40f`, centrado en `x=450, y=45`.
       Rojo si ≤10 s.
     - Nombre jugador: `x=20, y=55`, blanco.
     - Nombre CPU: alineado a la derecha en `x=880, y=55`, blanco.
     - Círculos de rondas (debajo de cada nombre): radio 6 px, `●` amarillo = ganada,
       `○` blanco = pendiente.

   2j. **Limpieza**
   - En el `return` del `useEffect`: `cancelAnimationFrame(rafId)`,
     `document.removeEventListener('keydown', onKeyDown)`,
     `document.removeEventListener('keyup', onKeyUp)`.

   Verificación: la ruta `/games/street-fighter/play` carga sin errores SSR; al confirmar
   personaje aparece el escenario con HUD; el luchador responde a ← → ↑ ↓ Q W E;
   los movimientos especiales se ejecutan con la secuencia correcta; la IA ataca y bloquea;
   los proyectiles cruzan la pantalla; tras 8 combates aparece la pantalla de victoria.

3. **Crear `app/games/street-fighter/play/page.tsx`** — play-page específica:
   - Importa `StreetFighterGame` con `dynamic(..., { ssr: false })`.
   - Pasa la prop `mode="classic"` al componente.
   - Estado local: `score`, `lives` (inicial `1`), `level` (inicial `1`), `paused`, `over`,
     `name`, `saved`, `gameKey`.
   - Pasa `paused` y los cuatro callbacks a `StreetFighterGame`.
   - Reutiliza el layout visual de la plataforma (HUD React + CRT + modal game over).
   - Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`;
     al confirmar, guarda en `localStorage` e inserta en Supabase
     `{ game_id: 'street-fighter', player_name: name, score, user_id: null }`.
   - Botón de guardar se deshabilita tras el primer envío.
   - Botón «JUGAR DE NUEVO» incrementa `gameKey` para remontar el componente canvas.
   Verificación: el HUD React refleja score y nivel (número de oponente) en tiempo real;
   tras una partida el score aparece en `/games/street-fighter` y `/hall-of-fame` al recargar.

4. **Verificación final** — `npm run build` termina sin errores de TypeScript.
   Ninguna ruta existente devuelve 500.

---

## Acceptance criteria

- [ ] La fila `street-fighter` existe en la tabla `games` con los valores del data model.
- [ ] La card de Street Fighter II aparece en `/games` con cover `cover-street-fighter` y color `red`.
- [ ] La ruta `/games/street-fighter/play` carga sin errores de SSR ni de TypeScript.
- [ ] El canvas (900 × 560) se renderiza con fondo de escenario y HUD superior visibles.
- [ ] La pantalla de selección de personaje muestra los 4 luchadores con nombres y barras de stats.
- [ ] ← → resalta el personaje anterior/siguiente; Enter confirma la selección.
- [ ] Al confirmar el personaje, la pantalla muestra 'ROUND 1' durante 2 s antes del combate.
- [ ] El luchador del jugador se mueve con ← → y no sale de los límites del canvas.
- [ ] ↑ ejecuta un salto con física de gravedad (subida y caída fluida).
- [ ] ↓ pone al luchador en postura agachada mientras la tecla está pulsada.
- [ ] Q / W / E activan los 3 tipos de ataque con hitbox de duración y dimensiones correctas.
- [ ] Un startup de 80 ms separa la pulsación de la tecla de la activación de la hitbox.
- [ ] La secuencia ↓ → Q lanza el Hadouken de Ryu/Ken como proyectil que cruza el canvas.
- [ ] La secuencia → ↓ → E activa el Shoryuken con hitbox vertical mayor que el ataque normal.
- [ ] Los specials de Chun-Li y Guile se ejecutan con sus secuencias correctas.
- [ ] Un proyectil desaparece al impactar con el rival o al salir del canvas.
- [ ] Un golpe sin bloqueo reduce el HP del CPU y actualiza la barra de HP en el HUD.
- [ ] Un golpe bloqueado inflige solo el 10 % del daño (chip damage).
- [ ] El stun de 300 ms tras recibir un golpe impide atacar al receptor durante ese tiempo.
- [ ] La IA del CPU ataca, bloquea y se desplaza según su nivel de dificultad.
- [ ] El tiempo de reacción de la IA disminuye y la agresividad aumenta a partir del oponente 5.
- [ ] El timer del HUD interno cuenta regresiva desde 90 s y se vuelve rojo al llegar a ≤10 s.
- [ ] Al llegar el timer a 0, gana la ronda quien tiene mayor HP; si empate, ronda nula.
- [ ] Al ganar 2 rondas el combate termina y se carga el siguiente oponente o game over.
- [ ] La pantalla 'YOU WIN!' aparece 2.5 s antes de cargar el siguiente oponente.
- [ ] `onLevelChange(n)` se dispara al inicio de cada nuevo combate (n = 1 a 8).
- [ ] El score se incrementa en `1000 + tiempoRestante × 100` al ganar cada ronda.
- [ ] La ronda perfecta (sin daño recibido) añade 2000 pts extra al score.
- [ ] El HUD React de la plataforma refleja score y nivel (oponente) en tiempo real.
- [ ] El botón "PAUSA" detiene `update()` y timers; "REANUDAR" los reanuda.
- [ ] Las teclas P / Esc no provocan pausa independiente del canvas.
- [ ] Al perder un combate (CPU gana 2 rondas), `onLivesChange(0)` y `onGameOver(score)` se disparan una sola vez.
- [ ] Al vencer los 8 oponentes, aparece la pantalla de victoria y se dispara `onGameOver`.
- [ ] El modal React de game over aparece con la puntuación final.
- [ ] El modal pre-rellena el nombre desde `av_player_name` de localStorage si existe.
- [ ] Al confirmar, el score se inserta en Supabase y el nombre se persiste en localStorage.
- [ ] El botón de guardar se deshabilita tras el primer envío.
- [ ] El botón «JUGAR DE NUEVO» remontar el canvas volviendo a la pantalla de selección de personaje.
- [ ] El score guardado aparece en `/games/street-fighter` y en `/hall-of-fame` al recargar.
- [ ] `npm run build` completa sin errores de TypeScript.
- [ ] Ninguna ruta existente devuelve 500.

---

## Decisions

- **Sí: Doble HUD** — el canvas conserva su HUD interno (barras HP, timer, rondas) y React
  muestra score y nivel en el HUD de la plataforma. Razón: coherencia con el patrón
  establecido en todos los juegos; el juego funciona visualmente como standalone dentro del canvas.

- **Sí: 1 vida** — Street Fighter II no tiene vidas en el sentido arcade clásico. La partida
  termina cuando el jugador pierde un combate completo. Se modela como 1 vida que cae a 0 al
  perder o terminar la partida. Razón: consistencia con el HUD estándar de la plataforma.

- **Sí: victoria y derrota ambas disparan `onGameOver`** — tanto vencer los 8 oponentes como
  perder un combate llaman `onGameOver(score)`. Razón: la plataforma necesita un único punto de
  salida para mostrar el modal de guardar score.

- **Sí: prop `mode`** — el componente acepta `mode: 'classic' | 'survival'` para ser
  reutilizado en spec 02. Razón: evitar duplicar la lógica del motor de combate en un segundo
  componente independiente.

- **Sí: delta-time en el game loop** — `dt = currentTime - lastTime` en cada frame.
  Razón: física de salto, velocidad de proyectiles y timer deben ser frame-rate independent
  para funcionar igual en monitores de 60 Hz y 120 Hz.

- **Sí: ventana de secuencia `SEQUENCE_WINDOW = 600 ms`** — el jugador dispone de 600 ms
  para completar la secuencia de dirección antes de pulsar la tecla de ataque.
  Razón: permite ejecutar specials con teclado estándar sin exigir precisión de milisegundos.

- **Sí: startup de 80 ms** — la hitbox se activa 80 ms después de pulsar la tecla de ataque.
  Razón: simula la animación de inicio del golpe y da al defensor una ventana mínima para bloquear.

- **Sí: chip damage (10 %)** — un bloqueo correcto reduce el daño pero no lo anula.
  Razón: mecánica canónica de Street Fighter II; evita que el bloqueo perpetuo sea
  una estrategia sin coste.

- **Sí: stun de 300 ms post-impacto** — impide atacar durante 300 ms tras recibir un golpe.
  Razón: evita el intercambio simultáneo de golpes sin límite y da ritmo al combate.

- **Sí: primitivas canvas para sprites** — no se usan imágenes externas.
  Razón: mantiene el spec autocontenido; el motor visual es suficiente para la mecánica
  de juego sin depender de assets externos.

- **Sí: 8 oponentes con dificultad por nivel** — los valores `CPU_REACTION_MS` y
  `CPU_AGGRESSION` escalan por índice de oponente.
  Razón: curva de dificultad progresiva canónica del juego original sin necesidad de
  un selector manual.

- **Sí: ronda nula en empate por tiempo** — si ambos luchadores tienen el mismo HP al
  acabar el timer, la ronda no cuenta y se repite. Razón: fiel a la mecánica del original;
  evita desempates artificiales. Riesgo mitigado: la ronda nula no reinicia HP,
  por lo que el chip damage acumulado persiste.

- **Sí: play-page específica `app/games/street-fighter/play/page.tsx`** — en lugar de
  modificar la ruta genérica `[id]/play`. Razón: coherencia con todos los juegos de la
  plataforma; Next.js App Router da prioridad a rutas estáticas sobre dinámicas.

- **Sí: `dynamic(..., { ssr: false })`** — el componente canvas se carga solo en cliente.
  Razón: `canvas` y `requestAnimationFrame` no existen en el entorno Node.js de Next.js SSR.

- **No: movimientos de carga (charge inputs)** — no se implementan los inputs tipo
  "mantener ← 2 s + →". Razón: detectar inputs de carga en `keydown`/`keyup` con
  `requestAnimationFrame` añade complejidad de estado sin mejorar la jugabilidad en teclado.

- **No: controles táctiles o mobile** — fuera de alcance.
  Razón: se añaden mediante `mobile-porter` en una corrida separada.

- **No: Supabase Auth y RLS** — `user_id` se guarda como `null`.
  Razón: consistencia con todos los juegos actuales de la plataforma.

- **No: Realtime en leaderboard** — los scores se ven al recargar.
  Razón: la complejidad de subscriptions no aporta valor mientras haya pocos jugadores activos.
