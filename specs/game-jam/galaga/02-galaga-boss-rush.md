# SPEC — Galaga Boss Rush (modo exclusivo de Bosses con tractor beam escalonado)

> **Estado:** Propuesto
> **Depende de:** 06-games-table-leaderboard-supabase
> **Fecha:** 2026-08-28
> **Objetivo:** Implementar una variante de Galaga centrada exclusivamente en oleadas de
> Bosses Galaga con dos puntos de vida, tractor beam que se multiplica por captura, Boss
> Gigante cada 5 oleadas, y scoring de combo por destrucción anticipada; todo conectado al
> leaderboard de Supabase.

---

## Scope

**In:**

- INSERT SQL para añadir la fila `galaga-boss-rush` a la tabla `games` en Supabase.
- Crear `components/games/GalagaBossRushGame.tsx` — componente React `"use client"` que
  encapsula el canvas principal (480 × 600 px). Acepta props:
  `paused`, `onScoreChange`, `onLivesChange`, `onLevelChange`, `onGameOver`.
- Game loop construido desde cero con `requestAnimationFrame` y delta-time. Las fases
  internas son: `'idle'` → `'entry'` → `'formation'` → `'attack'` → `'wave-transition'` → `'gameover'`.
- **Enemigos exclusivos: Boss Galaga** — no hay Bees ni Butterflies.
  - **Boss normal**: sprite de 24 × 20 px. Dos HP.
    - HP 2 (intacto): color rojo vivo.
    - HP 1 (dañado): color naranja (primer impacto cambia el sprite a color naranja; añade
      líneas de daño dibujadas con primitivas canvas).
    - Al recibir el segundo impacto: destruido.
  - **Boss Gigante** (mini-boss): aparece al inicio de cada oleada múltiplo de 5.
    Tamaño 72 × 60 px (3× el Boss normal). 4 HP con barra de salud visible encima del sprite.
    Movimiento sinusoidal horizontal: `x = centerX + sin(time * freq) * amplitude` donde
    `freq = 0.002` rad/ms y `amplitude = 120` px; desciende 1 px/frame hasta y=180 y se
    mantiene ahí durante el ataque. Lanza tractor triple (3 haces simultáneos separados
    40 px) y dispara proyectiles en grupos de 3 en abanico de 30°.
- **Formación en V**: cada oleada arranca con `4 + wave` Bosses normales (oleada 1 → 5 Bosses,
  oleada 2 → 6, etc.) más el Boss Gigante si corresponde. Los Bosses normales se disponen
  en dos líneas diagonales simétricas formando una V abierta hacia abajo, centrada en el
  canvas. La V tiene `ceil((4 + wave) / 2)` posiciones por brazo; si el número de Bosses es
  impar, el brazo derecho lleva uno más.
  Posición de cada slot de la V:
  ```
  brazo izquierdo: x = 240 - 50*i,  y = 80 + 28*i   (i = 0..n-1)
  brazo derecho:   x = 240 + 50*i,  y = 80 + 28*i   (i = 0..n-1)
  ```
  El Boss Gigante, si existe, ocupa la posición central superior de la V (`x=240, y=52`).
- **Fase de entrada**: todos los Bosses entran desde la parte superior del canvas siguiendo
  curvas Bézier cúbicas hasta su posición de la V. Entran en 2 grupos simultáneos (brazo
  izquierdo y brazo derecho) con intervalo de 150 ms entre Bosses del mismo brazo.
- **Fase de formación**: la V se desplaza lateralmente ±50 px a 25 px/s. El Boss Gigante
  (si está vivo) oscila sobre la V con su movimiento sinusoidal propio.
- **Velocidad escalonada por oleada**: la velocidad base de los Bosses en picado y en
  formación se multiplica por `1 + (wave - 1) * 0.10` (capped en ×3.0 a partir de la
  oleada 21). Esto afecta `BOSS_DIVE_SPEED`, `FORMATION_SPEED_BASE` y `BULLET_SPEED_ENEMY`.
- **Fase de ataque**: cada 2 500 ms (ajustado por factor de oleada) 1-2 Bosses se lanzan
  en picado con curva Bézier; al alcanzar y=540 regresan a su posición de formación.
  El Boss Gigante ataca independientemente: desciende hasta y=200 disparando tractor triple
  y proyectiles en abanico, luego asciende de vuelta a y=180.
- **Tractor Beam escalonado**:
  - Al inicio de cada oleada, el número de haces simultáneos disponibles para los Bosses
    normales = `min(1 + capturedCount, 3)` donde `capturedCount` es el número de naves
    capturadas por el jugador en oleadas anteriores y no rescatadas.
  - Cada Boss normal en picado puede activar un haz; si `capturedCount >= 1` puede activar
    2 haces simultáneos; si `capturedCount >= 2`, 3 haces simultáneos.
  - En Boss Rush **no hay rescate de nave**: si el jugador es capturado, pierde 1 vida
    directamente; `onLivesChange(lives)` se dispara. `capturedCount` aumenta en 1.
  - Los haces se dibujan como en el spec clásico (haz verde semitransparente de 24 px).
    Si hay 2 haces, el segundo aparece a 40 px del primero; si hay 3, el tercero a 40 px más.
  - Al capturar al jugador durante un haz múltiple: solo descuenta 1 vida (no hay multiplicador
    de daño por número de haces).
- **Scoring**:
  | Evento                                               | Puntos  |
  |------------------------------------------------------|---------|
  | Boss normal destruido (HP 2 → 0)                     | 200     |
  | Boss dañado destruido (HP 1, naranja)                | 400     |
  | Boss Gigante destruido                               | 1 000   |
  | Combo x2: Boss destruido antes de aterrizar en V     | ×2 al total del Boss |
  - El combo x2 aplica cuando el Boss es destruido mientras su `diveT < 1` (aún en fase de
    picado, antes de regresar a formación). Si el Boss Gigante es destruido en descenso
    (antes de llegar a y=180): 2 000 puntos.
  - `onScoreChange(score)` se llama en cada incremento (comparando con valor anterior).
- **Proyectiles del jugador**: `Space` dispara hacia arriba a 480 px/s; máximo 2 simultáneos.
  No hay modo dual-ship en Boss Rush.
- **Proyectiles del Boss normal**: 2 proyectiles en abanico de ±15° al pasar por `diveT=0.5`.
  Velocidad base 220 px/s (escala con oleada).
- **Proyectiles del Boss Gigante**: 3 proyectiles en abanico de 30° (0°, ±15°).
  Velocidad base 180 px/s (escala con oleada).
- **3 vidas**: el jugador empieza con 3 vidas. Cada impacto de proyectil o captura de
  tractor beam resta 1 vida. No hay posibilidad de rescate.
  `onLivesChange(lives)` se dispara en cada pérdida; `onLivesChange(0)` justo antes de
  `onGameOver(score)`.
- **Wave transition**: al destruir todos los Bosses de una oleada (incluyendo el Gigante si
  existe), aparece un overlay 2 000 ms con «OLEADA N+1» y el número de Bosses que habrá;
  después inicia la siguiente oleada e incrementa `wave`; llama `onLevelChange(wave)`.
- **HUD interno del canvas**: fila superior con score (izquierda), oleada (centro), vidas
  como iconos de nave (derecha); si hay Boss Gigante vivo, barra de HP del Boss Gigante
  debajo del HUD superior (color verde → amarillo → rojo según HP restante).
- El componente notifica a React vía callbacks (comparando con valor anterior antes de disparar).
- Limpiar los event listeners de `keydown` y `keyup` de `document` en el `return` del `useEffect`.
- La pausa se controla exclusivamente vía prop `paused`; durante la pausa el loop sigue
  llamando a `draw()` pero no ejecuta `update()`.
- Crear `app/games/galaga-boss-rush/play/page.tsx` — play-page específica con
  `dynamic(..., { ssr: false })`.
- Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`,
  inserta en Supabase `{ game_id: 'galaga-boss-rush', player_name: name, score, user_id: null }`,
  persiste nombre en `localStorage`. Botón de guardar se deshabilita tras el primer envío.

**Fuera de alcance:**

- Controles táctiles o mobile.
- Supabase Auth y RLS — `user_id` se almacena como `null`.
- Realtime en el leaderboard.
- Modo dual-ship o rescate de nave capturada — en Boss Rush la captura es siempre fatal
  (se pierde 1 vida directamente).
- Bonus Stage (Challenge Stage) — no existe en este modo.
- Bees ni Butterflies como enemigos.
- Sprites con imágenes externas — todos los gráficos se dibujan con primitivas canvas.
- Efectos de sonido.
- Selección de dificultad inicial.

---

## Data model

### INSERT en tabla `games`

```sql
INSERT INTO games (id, title, short, long, cat, cover, color)
VALUES (
  'galaga-boss-rush',
  'GALAGA BOSS RUSH',
  'Sobrevive oleadas de Bosses con tractor beam múltiple.',
  'Solo los Bosses Galaga en formación V te esperan, y cada nave que capturan añade un haz más a su tractor. Destrúyelos antes de que aterricen para duplicar tus puntos; cada oleada es más rápida y más numerosa.',
  'SHOOTER',
  'cover-galaga-boss-rush',
  'orange'
);
```

### Props del componente `GalagaBossRushGame`

```ts
interface GalagaBossRushGameProps {
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
}
```

El estado local arranca con `lives = 3`, `score = 0`, `level = 1` (oleada 1).
`onLivesChange(lives)` se llama con el valor actualizado tras cada impacto o captura.
`onLivesChange(0)` se dispara justo antes de `onGameOver(score)`.
`onLevelChange(wave)` se dispara al iniciar cada nueva oleada.

No se introducen nuevas tablas ni tipos TypeScript — se reutilizan `GameRow` y `ScoreRow`
de `lib/supabase/types.ts`.

---

## Implementation plan

1. **INSERT en Supabase** — ejecutar el SQL del data model en el SQL Editor de Supabase.
   Verificación: la fila `galaga-boss-rush` aparece en el Table Editor; `/games` muestra la
   card con cover `cover-galaga-boss-rush` y color `orange`.

2. **Crear `components/games/GalagaBossRushGame.tsx`** — componente `"use client"` que:

   2a. **Canvas y constantes de módulo**
   - Renderiza un único `<canvas>` de 480 × 600 px mediante `useRef<HTMLCanvasElement>`.
   - Constantes de módulo (fuera del componente):
     ```ts
     const W = 480, H = 600;
     const PLAYER_Y = 560;
     const PLAYER_W = 24, PLAYER_H = 16;
     const BULLET_SPEED_PLAYER = 480;        // px/s
     const BULLET_SPEED_BOSS_BASE = 220;     // px/s (Bosses normales)
     const BULLET_SPEED_GIANT_BASE = 180;    // px/s (Boss Gigante)
     const MAX_PLAYER_BULLETS = 2;
     const BOSS_DIVE_SPEED_BASE = 180;       // px/s
     const FORMATION_SPEED_BASE = 25;        // px/s
     const FORMATION_AMPLITUDE = 50;         // px
     const ATTACK_INTERVAL_BASE = 2500;      // ms
     const ENTRY_INTERVAL = 150;             // ms entre Bosses del mismo brazo
     const WAVE_TRANSITION_DURATION = 2000;  // ms
     const TRACTOR_WIDTH = 24;               // px por haz
     const TRACTOR_DURATION = 2000;          // ms
     const GIANT_FREQ = 0.002;               // rad/ms
     const GIANT_AMPLITUDE = 120;            // px
     const SPEED_CAP_WAVE = 21;              // oleada a partir de la cual la velocidad no escala más
     const SPEED_CAP_FACTOR = 3.0;
     ```

   2b. **Modelo de datos interno** (dentro del `useRef` de estado del juego)
   ```ts
   type BossState = 'entering' | 'inFormation' | 'diving' | 'returning';
   type Phase = 'idle' | 'entry' | 'formation' | 'attack' | 'wave-transition' | 'gameover';

   interface Vec2 { x: number; y: number; }
   interface BezierCurve { p0: Vec2; p1: Vec2; p2: Vec2; p3: Vec2; }

   interface Boss {
     id: number;
     isGiant: boolean;
     hp: number;           // 2 para normal, 4 para gigante
     maxHp: number;
     x: number; y: number;
     formationX: number; formationY: number;
     state: BossState;
     entryCurve: BezierCurve | null;
     entryT: number;
     diveT: number;        // 0..1 progreso en picado
     tractorActive: boolean;
     tractorBeamCount: number;  // 1, 2 o 3 haces activos
     tractorTimer: number;
     fireTimer: number;    // ms hasta próximo disparo
     // Boss Gigante
     giantSinOffset: number;    // fase inicial del seno para evitar sincronía entre oleadas
   }

   interface Bullet {
     x: number; y: number;
     vx: number; vy: number;
     owner: 'player' | 'boss' | 'giant';
   }

   interface Star { x: number; y: number; r: number; }

   interface RushState {
     phase: Phase;
     wave: number;
     bosses: Boss[];
     bullets: Bullet[];
     player: { x: number; lives: number; invulTimer: number; };
     capturedCount: number;  // naves capturadas acumuladas en oleadas anteriores
     score: number;
     attackTimer: number;
     waveTransitionTimer: number;
     stars: Star[];
     keys: Record<string, boolean>;
     lastTime: number;
     elapsedTime: number;   // ms totales (para movimiento sinusoidal del Gigante)
   }
   ```

   2c. **Factor de escala por oleada**
   - Función `waveScale(wave: number): number`:
     `return Math.min(1 + (wave - 1) * 0.10, SPEED_CAP_FACTOR)`
   - Se aplica multiplicativamente a `BOSS_DIVE_SPEED_BASE`, `FORMATION_SPEED_BASE`,
     `BULLET_SPEED_BOSS_BASE`, `BULLET_SPEED_GIANT_BASE` y `1 / ATTACK_INTERVAL_BASE`.

   2d. **Fase idle**
   - `draw()` en fase `'idle'`: fondo negro con estrellas, título «GALAGA BOSS RUSH» en
     naranja brillante, subtítulo «Solo los Bosses te esperan», texto «Pulsa ENTER para empezar».
   - `keydown` con `key === 'Enter'`: llama `initWave(1)` y cambia `phase` a `'entry'`.

   2e. **Generación de oleada (`initWave(wave)`)**
   - Calcula `bossCount = 4 + wave` (cantidad de Bosses normales).
   - Si `wave % 5 === 0`: crea el Boss Gigante con `hp = 4`, `isGiant = true`.
   - Distribuye los Bosses normales en la V:
     - `leftArm = floor(bossCount / 2)` posiciones en brazo izquierdo.
     - `rightArm = ceil(bossCount / 2)` posiciones en brazo derecho.
     - Asigna `formationX` y `formationY` según las fórmulas de la V.
   - Si hay Boss Gigante: lo posiciona en `{ x: 240, y: 52 }`.
   - Construye la curva Bézier de entrada para cada Boss: `p0` fuera del canvas por la parte
     superior (y < -50), `p3` la posición de formación, `p1` y `p2` con control points que
     producen una trayectoria suave en espiral descendente.
   - Llena `entryQueue` con los Bosses de cada brazo intercalados, con `entryTimer = 0`.
   - Llama `onLevelChange(wave)`.

   2f. **Fase entry — update(dt)**
   - Procesa la entrada en pares (un Boss del brazo izquierdo y uno del derecho cada
     `ENTRY_INTERVAL` ms). Usa `elapsedTime` para calcular posición Bézier.
   - Para cada Boss en estado `'entering'`: avanza `entryT += dt / 1200`; evalúa Bézier;
     cuando `entryT >= 1`: estado → `'inFormation'`.
   - Cuando todos los Bosses están `'inFormation'`: cambia `phase` a `'formation'`.

   2g. **Fase formation — update(dt)**
   - El desplazamiento lateral de la V: `offsetX = sin(elapsedTime * π / 3000) * FORMATION_AMPLITUDE * scale`.
   - El Boss Gigante (si vivo) oscila independientemente:
     `x = 240 + sin(elapsedTime * GIANT_FREQ + giantSinOffset) * GIANT_AMPLITUDE`.
   - Decrementa `attackTimer` por `dt * scale`; cuando llega a 0:
     - Elige 1-2 Bosses normales en formación al azar; asigna curva de picado y estado `'diving'`.
     - Si el Boss Gigante está vivo y no está en picado: inicia su secuencia de descenso.
     - Reinicia `attackTimer = ATTACK_INTERVAL_BASE / scale`.

   2h. **Fase attack — update(dt)**
   - **Boss normal en picado**:
     - Avanza `diveT += dt / (diveDuration / scale)` donde `diveDuration = 2500` ms base.
     - Posición en curva Bézier de picado.
     - Cuando `diveT` cruza 0.35: activa tractor beam con `tractorBeamCount = min(1 + capturedCount, 3)`,
       `tractorTimer = TRACTOR_DURATION`.
     - Mientras `tractorActive` y `tractorTimer > 0`:
       - Dibuja `tractorBeamCount` haces paralelos centrados en `boss.x`, separados 40 px.
       - Si el jugador entra en cualquier haz (`abs(player.x - beamCenterX) < TRACTOR_WIDTH/2`)
         y `player.invulTimer <= 0`:
         - `player.lives -= 1`; `capturedCount += 1`;
           llama `onLivesChange(player.lives)`.
         - Si `player.lives <= 0`: llama `onLivesChange(0)` → `onGameOver(score)`;
           `phase = 'gameover'`.
         - Si `player.lives > 0`: `player.invulTimer = 2000` (2 s de invulnerabilidad).
         - Desactiva el tractor beam de ese Boss (`tractorActive = false`).
       - Decrementa `tractorTimer` por `dt`; cuando llega a 0: desactiva tractor.
     - Cuando `diveT >= 0.5`: dispara 2 proyectiles en abanico de ±15°.
     - Cuando `diveT >= 1`: cambia a `'returning'`; construye curva Bézier de regreso a
       posición de formación.
     - Durante `'returning'`: avanza `diveT` en la curva de retorno; cuando completa:
       `'inFormation'`.
   - **Boss Gigante en descenso**:
     - Desciende linealmente hasta y=200 a velocidad 80 px/s.
     - Mientras desciende: dispara cada 1 500 ms un triple abanico (3 proyectiles a 0°, ±15°).
     - Al llegar a y=200: activa tractor triple (3 haces a ±40 px del centro), `tractorTimer = 3000`.
     - Después del tractor: asciende de vuelta a y=52 y retorna a movimiento sinusoidal.
   - **Movimiento del jugador**: ← → a 280 px/s; clamp `[PLAYER_W/2, W - PLAYER_W/2]`.
   - **Disparo del jugador**: `Space` o `ArrowUp` cuando hay < `MAX_PLAYER_BULLETS` proyectiles
     del jugador en pantalla.
   - **Detección de colisiones**:
     - Proyectil del jugador (AABB 3 × 10 px) vs Boss (AABB `boss.isGiant ? 72×60 : 24×20` px):
       - Reduce 1 HP al Boss.
       - Si el Boss era naranja (HP 1) y queda en HP 0: destruido.
         Calcula puntos: Boss normal HP0 = 400; Boss normal HP2→HP0 (de un solo golpe) = 200
         (no hay diferencia en el segundo disparo porque el primer disparo ya cambió a naranja).
         Si `boss.state === 'diving'` y `diveT < 1`: aplica combo x2.
         Suma puntos; llama `onScoreChange(score)`.
       - Si el Boss era rojo (HP 2) y queda HP 1: cambia sprite a naranja (marca `hp = 1`).
         No hay puntos por primer impacto — los puntos se otorgan al destruir.
       - Si Boss Gigante HP0: suma 1 000 (o 2 000 si combo x2); llama `onScoreChange(score)`.
       - Elimina el proyectil del jugador.
     - Proyectil enemigo (AABB 4 × 8 px) vs jugador (AABB 24 × 16 px) y `invulTimer <= 0`:
       - `player.lives -= 1`; llama `onLivesChange(player.lives)`.
       - Si `player.lives <= 0`: llama `onLivesChange(0)` → `onGameOver(score)`;
         `phase = 'gameover'`.
       - Si `player.lives > 0`: `player.invulTimer = 2000`.
       - Elimina el proyectil enemigo.
   - Decrementa `player.invulTimer` por `dt`; el sprite del jugador parpadea (visible en
     frames pares de 100 ms) mientras `invulTimer > 0`.
   - **Fin de oleada**: cuando `bosses.length === 0` (o todos destruidos): cambia
     `phase = 'wave-transition'`; `waveTransitionTimer = WAVE_TRANSITION_DURATION`.

   2i. **Wave transition — update(dt)**
   - Decrementa `waveTransitionTimer` por `dt`.
   - Dibuja overlay con «OLEADA N COMPLETADA» y «PRÓXIMA: N+1 | X BOSSES».
   - Cuando `waveTransitionTimer <= 0`: llama `initWave(wave + 1)`; `phase = 'entry'`.

   2j. **Render**
   - Fondo negro con estrellas (60 puntos blancos, radio 0.5-1.5 px).
   - **Boss normal (HP 2, rojo)**: cuerpo en Y invertida con `fillStyle = '#FF2020'`;
     alas laterales de 8 × 6 px.
   - **Boss normal (HP 1, naranja)**: mismo sprite con `fillStyle = '#FF8C00'`; líneas de
     daño en gris oscuro cruzando el cuerpo (2 líneas diagonales de 1 px).
   - **Boss Gigante**: misma forma escalada 3× con `fillStyle = '#CC0000'` (HP 4), '#FF4400'
     (HP 3), '#FF8800' (HP 2), '#FFAA00' (HP 1). Barra de HP verde → amarilla → roja
     de 64 px de ancho encima del sprite.
   - **Haces de tractor beam**: por cada haz activo, rectángulo semitransparente verde
     `rgba(0, 255, 128, 0.25)` de `TRACTOR_WIDTH` px de ancho desde el Boss hasta y=H,
     con dos líneas brillantes en los bordes del haz (`rgba(0,255,128,0.8)`).
   - **Nave del jugador**: triángulo blanco de 24 × 16 px; parpadeo durante invulnerabilidad.
   - **Proyectiles del jugador**: rectángulo blanco de 3 × 10 px.
   - **Proyectiles de Boss normal**: rectángulo naranja de 3 × 8 px.
   - **Proyectiles de Boss Gigante**: rectángulo rojo de 4 × 10 px.
   - **HUD interno** (fuente monospace 14 px):
     - Fila superior: `SCORE: N` (izquierda), `OLEADA N` (centro), iconos de nave (derecha).
     - Si Boss Gigante vivo: barra de HP `min(bossHp/4, 1) * 80` px de ancho justo debajo
       del HUD superior, centrada, con etiqueta «BOSS» a la izquierda.
   - **Wave transition overlay**: rectángulo semitransparente negro cubriendo todo el canvas,
     texto «OLEADA N COMPLETADA» en naranja grande, «PRÓXIMA: N+1» en blanco debajo.

   2k. **Limpieza**
   - En el `return` del `useEffect`: cancela el frame con `cancelAnimationFrame`,
     elimina los listeners de `keydown` y `keyup` de `document`.

   Verificación: el juego arranca en `/games/galaga-boss-rush/play`; la fase idle muestra
   el título; al pulsar Enter los Bosses entran en V; la velocidad aumenta notablemente en
   oleada 3+; en oleada 5 aparece el Boss Gigante; los haces de tractor se multiplican tras
   capturas; el overlay de transición muestra la siguiente oleada.

3. **Crear `app/games/galaga-boss-rush/play/page.tsx`** — play-page específica:
   - Importa `GalagaBossRushGame` con `dynamic(..., { ssr: false })`.
   - Estado local: `score`, `lives` (inicial `3`), `level` (inicial `1`), `paused`, `over`,
     `name`, `saved`, `gameKey`.
   - Pasa `paused` y los cuatro callbacks a `GalagaBossRushGame`.
   - Reutiliza el layout visual de la plataforma (HUD React + CRT + modal game over),
     igual que las play-pages de Asteroids, Tetris, Arkanoid, Snake y Battleship.
   - Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`;
     al confirmar, guarda en `localStorage` e inserta en Supabase
     `{ game_id: 'galaga-boss-rush', player_name: name, score, user_id: null }`.
   - Botón de guardar se deshabilita tras el primer envío.
   - Botón «JUGAR DE NUEVO» incrementa `gameKey` para remontar el componente canvas.
     Verificación: el HUD React refleja score, vidas y oleada en tiempo real; tras una partida
     el score aparece en `/games/galaga-boss-rush` y en `/hall-of-fame` al recargar.

4. **Verificación final** — `npm run build` termina sin errores de TypeScript.
   Ninguna ruta existente devuelve 500.

---

## Acceptance criteria

- [ ] La fila `galaga-boss-rush` existe en la tabla `games` de Supabase con los valores del data model.
- [ ] La card aparece en `/games` con cover `cover-galaga-boss-rush` y color `orange`.
- [ ] La ruta `/games/galaga-boss-rush/play` carga sin errores de SSR ni de TypeScript.
- [ ] El canvas (480 × 600) se renderiza con fondo negro estrellado y pantalla idle al iniciar.
- [ ] Pulsar Enter inicia la oleada 1 con 5 Bosses normales entrando en formación V.
- [ ] Los Bosses entran desde la parte superior en pares (brazo izquierdo + brazo derecho).
- [ ] La formación V se desplaza lateralmente ±50 px de forma suave.
- [ ] Oleada 1 tiene 5 Bosses, oleada 2 tiene 6, oleada N tiene 4+N Bosses normales.
- [ ] En oleada 5, 10, 15… aparece el Boss Gigante con movimiento sinusoidal y 4 HP.
- [ ] La barra de HP del Boss Gigante es visible en el HUD interno del canvas.
- [ ] Los Bosses en HP 2 se dibujan en rojo; al recibir 1 impacto cambian a naranja (HP 1).
- [ ] Al recibir el segundo impacto el Boss es destruido; puntos = 400 si estaba naranja.
- [ ] Destruir un Boss normal en vuelo de picado antes de regresar a formación aplica combo x2.
- [ ] Destruir Boss Gigante suma 1 000 (2 000 con combo x2 si está en descenso).
- [ ] `onScoreChange(score)` se llama en cada destrucción con el score acumulado correcto.
- [ ] Los Bosses en picado activan el tractor beam (haz verde) al pasar sobre el jugador.
- [ ] La primera captura activa 1 haz; tras 1 captura previa se activan 2; tras 2 capturas, 3.
- [ ] El número de haces nunca supera 3 independientemente de cuántas capturas haya habido.
- [ ] Al ser capturado, el jugador pierde 1 vida directamente (sin posibilidad de rescate).
- [ ] `onLivesChange(lives)` se llama con el valor actualizado tras cada pérdida de vida.
- [ ] `capturedCount` aumenta en 1 por cada captura, afectando las siguientes oleadas.
- [ ] El jugador tiene 2 000 ms de invulnerabilidad (parpadeo) tras cada golpe o captura.
- [ ] Los proyectiles del jugador (máx. 2 simultáneos) viajan hacia arriba a 480 px/s.
- [ ] El Boss Gigante dispara 3 proyectiles en abanico cada 1 500 ms.
- [ ] Los Bosses normales disparan 2 proyectiles en abanico de ±15° al pasar por diveT=0.5.
- [ ] La velocidad de Bosses, proyectiles y formación aumenta un 10% por oleada (capped en ×3).
- [ ] El overlay de transición muestra «OLEADA N COMPLETADA» durante 2 000 ms entre oleadas.
- [ ] `onLevelChange(wave)` se llama al iniciar cada nueva oleada.
- [ ] El HUD interno del canvas muestra score, oleada e iconos de nave para las vidas.
- [ ] El HUD React de la plataforma refleja score, vidas y oleada en tiempo real.
- [ ] El botón "PAUSA" de la plataforma congela el game loop; "REANUDAR" lo reanuda.
- [ ] Las teclas P / Esc no provocan una pausa independiente del canvas.
- [ ] Al llegar a 0 vidas, `onLivesChange(0)` y `onGameOver(score)` se disparan en ese orden.
- [ ] Aparece el modal React de game over con la puntuación final.
- [ ] El modal pre-rellena el nombre desde `av_player_name` de localStorage si existe.
- [ ] Al confirmar, el score se inserta en Supabase y el nombre se persiste en localStorage.
- [ ] El botón de guardar se deshabilita tras el primer envío (sin doble inserción).
- [ ] El botón "JUGAR DE NUEVO" remontar el canvas desde oleada 1.
- [ ] El score guardado aparece en `/games/galaga-boss-rush` y en `/hall-of-fame` al recargar.
- [ ] `npm run build` completa sin errores de TypeScript.
- [ ] Ninguna ruta existente devuelve 500.

---

## Decisions

- **Sí: Doble HUD** — el canvas conserva su HUD interno y React muestra los mismos valores
  en el HUD de la plataforma. Razón: coherencia con el patrón establecido en todos los juegos
  de la plataforma; el juego funciona visualmente como standalone dentro del canvas.

- **Sí: 3 vidas** — Boss Rush es un modo de alta intensidad donde cada error cuesta una vida.
  `onLivesChange` notifica cada pérdida; `onLivesChange(0)` dispara el game over. Razón: la
  mecánica de captura sin rescate y los múltiples haces crean presión constante; 3 vidas es
  el balance correcto para que el modo sea desafiante pero no frustrante desde la oleada 1.

- **Sí: Sin rescate de nave** — a diferencia del modo clásico, en Boss Rush ser capturado es
  siempre fatal (1 vida perdida). Razón: el twist central de este modo es la escalada del
  tractor beam; si hubiera rescate, el jugador podría beneficiarse estratégicamente dejándose
  capturar, lo que rompería el sistema de captura escalonada.

- **Sí: Tractor beam escalonado por `capturedCount`** — el número de haces simultáneos
  depende de las capturas previas, no del número de oleada. Razón: crea una retroalimentación
  negativa punitiva y memorable; el jugador aprende rápidamente que cada captura hace el juego
  más difícil, añadiendo tensión táctica sin necesidad de power-ups externos.

- **Sí: Boss Gigante cada 5 oleadas** — mini-boss con 4 HP, tamaño 3× y tractor triple.
  Razón: rompe el ritmo de las oleadas normales y aporta un pico de dificultad predecible que
  los jugadores pueden anticipar y prepararse; mecánica habitual en shooters con Boss Rush.

- **Sí: Combo x2 por destrucción en vuelo** — si el Boss es destruido durante su picado
  (antes de regresar a formación), los puntos se duplican. Razón: incentiva el juego
  agresivo y preciso en lugar de esperar a que el Boss regrese a la formación donde es más
  fácil de golpear; añade profundidad sin complejidad de implementación.

- **Sí: HP visible en cambio de color (rojo → naranja)** — el primer impacto no da puntos
  pero cambia visualmente el Boss. Razón: el cambio de color es feedback inmediato de daño
  sin necesidad de barra de HP explícita para los Bosses normales; reservar la barra de HP
  solo para el Boss Gigante hace que este sea visualmente más imponente.

- **Sí: Formación en V** — diferencia visualmente este modo del modo clásico (formación
  rectangular 5×8). Razón: la V es reconocible como formación militar clásica; encaja con la
  estética del juego y permite escalar naturalmente añadiendo Bosses a los brazos de la V.

- **Sí: Velocidad escalonada +10% por oleada (cap ×3)** — la fórmula `1 + (wave-1)*0.10`
  da una curva de dificultad suave y predecible. Razón: el escalado lineal es más fácil de
  ajustar que curvas exponenciales; el cap en ×3 evita que el juego se vuelva incontrolable
  en oleadas muy altas.

- **Sí: Formas canvas primitivas para sprites** — Boss en Y invertida, jugador en triángulo.
  Razón: no existen sprites externos en el proyecto; mantiene el spec autocontenido y ejecutable
  sin assets adicionales; el cambio de color rojo → naranja por daño es trivial con primitivas.

- **Sí: Play-page específica `app/games/galaga-boss-rush/play/page.tsx`** — en lugar de
  modificar la ruta genérica `[id]/play`. Razón: coherencia con el resto de juegos; Next.js
  App Router da prioridad a rutas estáticas sobre dinámicas.

- **Sí: `dynamic(..., { ssr: false })`** — el componente canvas se carga solo en cliente.
  Razón: `canvas` y `requestAnimationFrame` no existen en el entorno Node.js de Next.js SSR.

- **No: Modo dual-ship** — no existe en Boss Rush. Razón: el twist del modo es que la
  captura es siempre punitiva; el rescate y el dual-ship son la recompensa del modo clásico
  y añadir ambos mecanismos al mismo spec diluiría la identidad de cada modo.

- **No: Bonus Stage** — no existe en Boss Rush. Razón: el modo es un shooter de alta tensión
  continua; interrumpirlo con una Challenge Stage sin proyectiles rompería el ritmo.

- **No: Controles táctiles o mobile** — fuera de alcance en este spec.
  Razón: se pueden añadir mediante el agente `mobile-porter` en una corrida separada.

- **No: Supabase Auth y RLS** — `user_id` se guarda como `null`.
  Razón: consistencia con todos los juegos actuales de la plataforma.

- **No: Realtime en leaderboard** — los scores se ven al recargar.
  Razón: la complejidad de subscriptions no aporta valor mientras haya pocos jugadores activos.

- **No: Efectos de sonido** — fuera de alcance en este spec.
  Razón: se cubren en un spec separado de audio si se desea.
