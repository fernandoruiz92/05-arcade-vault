# SPEC — Galaga Classic (modo arcade canónico con formaciones y tractor beam)

> **Estado:** Propuesto
> **Depende de:** 06-games-table-leaderboard-supabase
> **Fecha:** 2026-08-28
> **Objetivo:** Implementar Galaga como juego jugable en Arcade Vault con el modo arcade
> clásico completo: formación de 40 enemigos con entrada en curva Bézier, ataques en picado
> por tipo, tractor beam con captura y rescate de nave, bonus stage cada 3 oleadas, y
> scoring canónico conectado al leaderboard de Supabase.

---

## Scope

**In:**

- INSERT SQL para añadir la fila `galaga` a la tabla `games` en Supabase.
- Crear `components/games/GalagaGame.tsx` — componente React `"use client"` que encapsula
  el canvas principal (480 × 600 px). Acepta props:
  `paused`, `onScoreChange`, `onLivesChange`, `onLevelChange`, `onGameOver`.
- Game loop construido desde cero con `requestAnimationFrame` y delta-time. Las fases
  internas son: `'entry'` → `'formation'` → `'attack'` → `'bonus'` → `'gameover'`.
- **Formación inicial**: 40 enemigos en 5 filas de 8 posiciones fijas centradas en el canvas:
  - Fila 1 (4 Bosses Galaga): posiciones centrales 2-5 de los 8 slots.
  - Filas 2-3 (8 Butterflies): 4 por fila, slots pares.
  - Filas 4-5 (28 Bees): 14 por fila, todos los slots.
  Cada celda de formación mide 40 × 32 px; el bloque total queda centrado horizontalmente
  entre x=40 y x=440, y entre y=60 y y=220.
- **Fase de entrada**: cada uno de los 40 enemigos vuela desde un punto fuera del canvas
  (izquierda o derecha, alternativamente por fila) hasta su posición de formación siguiendo
  una curva Bézier cúbica. Los enemigos entran en grupos de 4, con un intervalo de 200 ms
  entre grupos. Un enemigo en vuelo de entrada no dispara.
- **Fase de formación**: una vez todos los enemigos han llegado a su posición, el bloque de
  formación se desplaza horizontalmente ±60 px a 30 px/s y rebota; cada enemigo mantiene su
  offset relativo dentro del bloque.
- **Fase de ataque**: cada 2-4 s (aleatorio) un grupo de 1-3 enemigos se desprende de la
  formación y ejecuta un ataque en picado hasta el borde inferior del canvas, luego reaparece
  por la parte superior y regresa a su posición de formación. El patrón de picado es una curva
  Bézier cúbica diferente por tipo:
  - **Bee**: trayectoria directa, velocidad 260 px/s, dispara 1 proyectil al pasar
    por el centro del canvas.
  - **Butterfly**: trayectoria con curvatura lateral suave, velocidad 200 px/s, dispara 2
    proyectiles en abanico.
  - **Boss Galaga** (no capturado): trayectoria en loop descendente, velocidad 170 px/s,
    lanza rayo tractor antes de atacar (ver Tractor Beam) y dispara 2 proyectiles.
- **Tractor Beam**: el Boss Galaga en picado puede activar el rayo tractor si el jugador no
  está ya en modo dual-ship:
  - El rayo se dibuja como un haz vertical semitransparente de 24 px de ancho que emana
    desde el Boss hasta el borde inferior del canvas durante 2 000 ms.
  - Si la nave del jugador entra en el haz, queda capturada y se muestra como sprite junto
    al Boss volviendo a la formación. El jugador pierde 1 vida; `onLivesChange(lives)` se
    dispara. Si las vidas llegan a 0, se llama `onLivesChange(0)` y `onGameOver(score)`.
  - Si el Boss capturador es destruido mientras lleva la nave capturada, la nave se libera y
    vuela hacia el jugador. Al unirse, se activa el modo **dual-ship**: dos sprites de nave
    en posición fija separados 40 px, con el doble de potencia de disparo (2 proyectiles por
    disparo) y hitbox de 72 × 16 px (unión de ambas naves).
  - El modo dual-ship se pierde si el jugador es alcanzado; se vuelve a una sola nave y
    se resta 1 vida.
- **Proyectiles del jugador**: se disparan con `Space`; velocidad 480 px/s hacia arriba;
  máximo 2 proyectiles simultáneos en pantalla normal, 4 en dual-ship.
- **Proyectiles enemigos**: velocidad 200 px/s hacia abajo; colisión con el sprite del
  jugador (AABB de 24 × 16 px) descuenta 1 vida.
- **Bonus Stage (Challenge Stage)**: se activa cada 3 oleadas normales.
  - No hay proyectiles enemigos.
  - Aparecen 40 enemigos en parejas que cruzan el canvas en patrones de vuelo predefinidos
    (8 patrones distintos, 5 pares cada uno).
  - Al terminar, el canvas muestra el HUD de resultados: «CHALLENGE STAGE RESULTS»,
    número de hits, número de enemigos, y «HIT RATE XX%» calculado como
    `floor((hits / totalEnemies) * 100)`.
  - Si se destruyen los 40 enemigos: bonus de 10 000 puntos (perfect); si se destruyen
    entre 1 y 39: bonus de 100 × hits; si se destruyen 0: no hay bonus.
- **Scoring canónico**:
  | Enemigo      | En formación | En picado |
  |--------------|-------------|-----------|
  | Bee          | 50          | 80        |
  | Butterfly    | 80          | 160       |
  | Boss Galaga  | 150         | 400       |
  | Boss (capturador en picado, destruido al liberar nave) | — | 1 000 |
  `onScoreChange(score)` se llama en cada incremento (comparando con el valor anterior).
- **Nivel (oleada)**: `onLevelChange(wave)` se llama al iniciar cada nueva oleada.
  La velocidad de la formación y la frecuencia de ataques escalan ligeramente con la oleada
  (+5 % por oleada, máximo ×2.5 a partir de la oleada 20).
- **HUD interno del canvas**: fila superior con score (izquierda), hi-score (centro),
  oleada (derecha); fila inferior con iconos de nave para las vidas restantes.
- El componente notifica a React vía callbacks (comparando con valor anterior antes de disparar).
- Limpiar los event listeners de `keydown` y `keyup` de `document` en el `return` del `useEffect`.
- La pausa se controla exclusivamente vía prop `paused`; durante la pausa el loop sigue
  llamando a `draw()` pero no ejecuta `update()`.
- Crear `app/games/galaga/play/page.tsx` — play-page específica con `dynamic(..., { ssr: false })`.
- Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`,
  inserta en Supabase `{ game_id: 'galaga', player_name: name, score, user_id: null }`,
  persiste nombre en `localStorage`. Botón de guardar se deshabilita tras el primer envío.

**Fuera de alcance:**

- Controles táctiles o mobile.
- Supabase Auth y RLS — `user_id` se almacena como `null`.
- Realtime en el leaderboard.
- Sprites con imágenes externas — todos los gráficos se dibujan con primitivas canvas
  (formas geométricas y colores planos que evocan cada tipo de enemigo).
- Efectos de sonido — se cubren en un spec separado si se desea.
- Modo multijugador.
- Scroll del fondo estelar animado (se usa fondo negro estático con partículas de estrellas
  dibujadas en la inicialización y repintadas cada frame).
- Galaga '88 o variantes posteriores (bonus items, morphing enemies, etc.).

---

## Data model

### INSERT en tabla `games`

```sql
INSERT INTO games (id, title, short, long, cat, cover, color)
VALUES (
  'galaga',
  'GALAGA',
  'Destruye la formación enemiga antes de ser capturado.',
  'Cuarenta naves enemigas toman posición en formación y se lanzan en picado en oleadas implacables. Esquiva el rayo tractor del Boss Galaga o rescata tu nave capturada para combatir con potencia doble.',
  'SHOOTER',
  'cover-galaga',
  'yellow'
);
```

### Props del componente `GalagaGame`

```ts
interface GalagaGameProps {
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
}
```

El estado local arranca con `lives = 3`, `score = 0`, `level = 1` (oleada 1).
`onLivesChange(lives)` se llama con el valor actualizado tras cada impacto recibido o captura.
`onLivesChange(0)` se dispara justo antes de `onGameOver(score)`.
`onLevelChange(wave)` se dispara al iniciar cada oleada, incluyendo las bonus stages
(con el número de oleada actual, no un contador separado).

No se introducen nuevas tablas ni tipos TypeScript — se reutilizan `GameRow` y `ScoreRow`
de `lib/supabase/types.ts`.

---

## Implementation plan

1. **INSERT en Supabase** — ejecutar el SQL del data model en el SQL Editor de Supabase.
   Verificación: la fila `galaga` aparece en el Table Editor; `/games` muestra la card con
   cover `cover-galaga` y color `yellow`.

2. **Crear `components/games/GalagaGame.tsx`** — componente `"use client"` que:

   2a. **Canvas y constantes de módulo**
   - Renderiza un único `<canvas>` de 480 × 600 px mediante `useRef<HTMLCanvasElement>`.
   - Constantes de módulo (fuera del componente):
     ```ts
     const W = 480, H = 600;
     const PLAYER_Y = 560;
     const PLAYER_W = 24, PLAYER_H = 16;
     const BULLET_SPEED = 480;          // px/s (jugador)
     const ENEMY_BULLET_SPEED = 200;    // px/s (enemigos)
     const MAX_PLAYER_BULLETS = 2;      // 4 en modo dual-ship
     const FORMATION_SPEED_BASE = 30;   // px/s
     const FORMATION_AMPLITUDE = 60;    // px
     const ENTRY_INTERVAL = 200;        // ms entre grupos de entrada
     const TRACTOR_DURATION = 2000;     // ms
     const TRACTOR_WIDTH = 24;          // px
     const ATTACK_INTERVAL_MIN = 2000;  // ms
     const ATTACK_INTERVAL_MAX = 4000;  // ms
     const BONUS_PERFECT = 10000;
     const BONUS_PER_HIT = 100;
     ```

   2b. **Modelo de datos interno** (dentro del `useRef` de estado del juego)
   ```ts
   type EnemyType = 'bee' | 'butterfly' | 'boss';
   type Phase = 'entry' | 'formation' | 'attack' | 'bonus' | 'results' | 'gameover';

   interface Vec2 { x: number; y: number; }

   interface BezierCurve {
     p0: Vec2; p1: Vec2; p2: Vec2; p3: Vec2;
   }

   interface Enemy {
     id: number;
     type: EnemyType;
     formationCol: number;   // 0-7
     formationRow: number;   // 0-4
     x: number; y: number;
     state: 'entering' | 'inFormation' | 'diving' | 'returning' | 'captured';
     entryCurve: BezierCurve | null;
     entryT: number;         // 0..1 progreso en la curva de entrada
     diveCurve: BezierCurve | null;
     diveT: number;          // 0..1 progreso en la curva de picado
     tractorActive: boolean;
     tractorTimer: number;
     hasCaptured: boolean;   // ya capturó una nave en esta oleada
     capturedShip: boolean;  // lleva una nave capturada encima
   }

   interface Bullet {
     x: number; y: number;
     vy: number;
     owner: 'player' | 'enemy';
   }

   interface Star { x: number; y: number; r: number; }

   interface GameState {
     phase: Phase;
     wave: number;
     enemies: Enemy[];
     bullets: Bullet[];
     player: {
       x: number;
       lives: number;
       dual: boolean;         // modo dual-ship activo
       capturedId: number | null; // id del Boss que tiene la nave capturada
     };
     score: number;
     hiScore: number;
     entryQueue: number[];    // ids de enemigos pendientes de entrar
     entryTimer: number;      // ms hasta el próximo grupo de entrada
     attackTimer: number;     // ms hasta el próximo grupo de ataque
     divingIds: Set<number>;  // ids de enemigos actualmente en picado
     stars: Star[];
     // Bonus stage
     bonusEnemies: Enemy[];
     bonusHits: number;
     bonusTotal: number;
     bonusResultTimer: number; // ms mostrando resultados del bonus
   }
   ```

   2c. **Inicialización y generación de formación**
   - `initGame()`: genera las estrellas de fondo (60 posiciones aleatorias, radios 0.5-1.5 px),
     construye los 40 enemigos con sus posiciones de formación y sus curvas Bézier de entrada,
     llena `entryQueue` con los ids ordenados por fila (fila 4-5 entran primero), pone
     `entryTimer = 0` para disparar el primer grupo inmediatamente.
   - `formationPos(col, row): Vec2`: devuelve la posición canónica `{ x: 40 + col*50 + offset_x, y: 60 + row*32 }`.
     `offset_x` es el desplazamiento actual del bloque de formación.
   - `buildEntryCurve(enemy): BezierCurve`: el punto de inicio `p0` está fuera del canvas
     (izquierda si `col < 4`, derecha si `col >= 4`), `p3` es `formationPos` sin offset,
     `p1` y `p2` definen una curva suave hacia adentro desde los bordes.

   2d. **Fase entry — update(dt)**
   - Decrementa `entryTimer` por `dt`. Cuando llega a 0 y quedan ids en `entryQueue`:
     extrae los 4 siguientes (o los que queden), los pone en estado `'entering'`,
     reinicia `entryTimer = ENTRY_INTERVAL`.
   - Para cada enemigo en estado `'entering'`: avanza `entryT += dt / entryDuration` donde
     `entryDuration = 1400` ms; calcula posición en la curva con la fórmula Bézier cúbica
     `B(t) = (1-t)³p0 + 3(1-t)²t p1 + 3(1-t)t² p2 + t³p3`.
     Cuando `entryT >= 1`: estado → `'inFormation'`, posición fijada a `formationPos`.
   - Cuando `entryQueue` está vacío y todos los enemigos están `'inFormation'`:
     cambia `phase` a `'formation'`, llama `onLevelChange(wave)`.

   2e. **Fase formation — update(dt)**
   - El bloque de formación oscila: actualiza `offset_x` con `sin(time * π / period) * FORMATION_AMPLITUDE`
     donde `period = 3000` ms / factor de escala de oleada. Cada enemigo en formación recalcula
     `x = formationPos(col, row).x` (que incluye `offset_x`).
   - Decrementa `attackTimer` por `dt`. Cuando llega a 0:
     - Elige 1-3 enemigos en formación al azar (priorizando Bosses y Butterflies sobre Bees).
     - Les asigna una `diveCurve` Bézier según su tipo (ver spec de cada tipo arriba).
     - Cambia su estado a `'diving'`, los añade a `divingIds`.
     - Reinicia `attackTimer` con un valor aleatorio entre `ATTACK_INTERVAL_MIN` y `ATTACK_INTERVAL_MAX`.
   - Si el número de enemigos vivos llega a 0: inicia la siguiente oleada (ver 2i).

   2f. **Fase attack — update(dt) (se ejecuta en paralelo con formation)**
   - Para cada enemigo en `divingIds`:
     - Avanza `diveT += dt / diveDuration` (duración según tipo: Bee 1800 ms, Butterfly 2200 ms,
       Boss 3000 ms).
     - Calcula posición en `diveCurve` con Bézier cúbica.
     - **Boss con tractor beam**: cuando `diveT` cruza el umbral 0.3 (punto aproximado de paso
       por encima del jugador), si `!hasCaptured` y `!player.dual`:
       activa `tractorActive = true`, `tractorTimer = TRACTOR_DURATION`.
     - Mientras `tractorActive`: dibuja el haz; si el jugador entra en el AABB del haz
       (`abs(player.x - enemy.x) < TRACTOR_WIDTH/2`): captura la nave (ver 2g).
     - Decrementa `tractorTimer` por `dt`; cuando llega a 0: desactiva `tractorActive`.
     - Cuando `diveT >= 1` (terminó la curva de picado): estado → `'returning'`;
       la curva de retorno es una Bézier desde la posición actual hasta `formationPos`.
     - Cuando `diveT_return >= 1`: estado → `'inFormation'`; elimina de `divingIds`.
     - Disparo de proyectil: Bee dispara cuando `diveT ≈ 0.5`; Butterfly cuando `diveT ≈ 0.4`
       y `diveT ≈ 0.6`; Boss cuando `tractorActive` se desactiva sin capturar.

   2g. **Tractor beam — captura y rescate**
   - Al capturar al jugador:
     - `player.capturedId = enemy.id`; el sprite de la nave se mueve junto al Boss
       (`enemy.capturedShip = true`).
     - `player.lives -= 1`; llama `onLivesChange(player.lives)`.
     - Si `player.lives <= 0`: llama `onLivesChange(0)` → `onGameOver(score)` → `phase = 'gameover'`.
     - Si `player.lives > 0`: el jugador reaparece centrado con 2 s de invulnerabilidad
       (parpadeo del sprite 4 Hz); `player.dual = false`.
   - Al destruir el Boss capturador (aún lleva la nave):
     - Aplica `score += 1000`; llama `onScoreChange(score)`.
     - La nave capturada vuela en línea recta hasta `player.x` durante 600 ms;
       al llegar: `player.dual = true`; `player.capturedId = null`.
   - En modo dual-ship: el sprite de la nave derecha sigue al izquierdo con offset +40 px.
     `MAX_PLAYER_BULLETS` efectivo = 4. Si el jugador es golpeado: `player.dual = false`,
     `player.lives -= 1`; se pierde la nave derecha y `onLivesChange(player.lives)` se dispara.

   2h. **Bonus Stage**
   - Se activa cuando `wave % 3 === 0` tras completar la oleada normal.
   - Genera 40 enemigos (mix de Bees y Butterflies) con 8 patrones de vuelo predefinidos
     (5 parejas por patrón). Los patrones son curvas Bézier que cruzan el canvas de
     izquierda a derecha, en diagonal, en espiral suave, etc.
   - No hay proyectiles enemigos. El jugador puede disparar libremente.
   - Al terminar todos los vuelos: `phase = 'results'`, calcula HIT RATE, muestra HUD de
     resultados 3 000 ms y suma el bonus al score.
   - Tras el HUD de resultados: inicia oleada `wave + 1`.

   2i. **Nueva oleada**
   - Al quedar 0 enemigos vivos (excluido el bonus): incrementa `wave`, reinicia los 40
     enemigos con sus curvas de entrada. La velocidad del bloque de formación y la frecuencia
     de ataques escalan: `factor = min(1 + (wave - 1) * 0.05, 2.5)`.
   - Si `wave % 3 === 0`: en lugar de reiniciar oleada normal, inicia Bonus Stage.
   - Llama `onLevelChange(wave)` al inicio de cada oleada (normal o bonus).

   2j. **Detección de colisiones**
   - Proyectil del jugador vs enemigo: AABB de 4 × 8 px (proyectil) vs 28 × 24 px (enemigo).
     Al colisionar: aplica puntos según tipo y estado (en formación / en picado); elimina
     proyectil; llama `onScoreChange(score)`.
   - Proyectil enemigo vs jugador: AABB de 4 × 8 px vs sprite del jugador.
     Al colisionar: ejecuta lógica de pérdida de vida (incluyendo dual-ship si aplica);
     elimina proyectil.
   - Se omite colisión entre nave del jugador y enemigos (choque directo) — fuera de alcance.

   2k. **Render (draw)**
   - Fondo negro; estrellas dibujadas como puntos blancos de radio `star.r`.
   - Enemigos: `'bee'` = rombo verde de 16 × 16 px; `'butterfly'` = dos alas en arco azul
     (8 × 12 px cada una con cuerpo central); `'boss'` = forma en Y invertida roja de 24 × 20 px.
     Si `capturedShip`: dibuja el sprite de la nave del jugador encima del Boss, a escala 0.7.
   - Tractor beam: rectángulo semitransparente verde (`rgba(0,255,128,0.25)`) desde el Boss
     hasta el borde inferior, con dos líneas verticales brillantes en los bordes del haz.
   - Nave del jugador: triángulo blanco apuntando hacia arriba, 24 × 16 px (más 40 px a la
     derecha en modo dual).
   - Proyectiles del jugador: rectángulo blanco de 3 × 10 px.
   - Proyectiles enemigos: rectángulo naranja de 3 × 8 px.
   - HUD interno: fuente monospace 14 px; score (izquierda), hi-score (centro), oleada (derecha)
     en fila superior; iconos de nave (16 × 10 px cada uno) para las vidas en esquina inferior
     derecha.
   - Bonus results: overlay semitransparente negro con texto centrado en blanco.

   2l. **Limpieza**
   - En el `return` del `useEffect`: cancela el frame con `cancelAnimationFrame`,
     elimina los listeners de `keydown` y `keyup` de `document`.

   Verificación: el juego arranca en `/games/galaga/play`; los 40 enemigos entran en curvas
   Bézier y toman formación; el bloque oscila horizontalmente; los grupos atacan en picado;
   el tractor beam aparece en el Boss; capturar/liberar la nave activa dual-ship.

3. **Crear `app/games/galaga/play/page.tsx`** — play-page específica:
   - Importa `GalagaGame` con `dynamic(..., { ssr: false })`.
   - Estado local: `score`, `lives` (inicial `3`), `level` (inicial `1`), `paused`, `over`,
     `name`, `saved`, `gameKey`.
   - Pasa `paused` y los cuatro callbacks a `GalagaGame`.
   - Reutiliza el layout visual de la plataforma (HUD React + CRT + modal game over),
     igual que las play-pages de Asteroids, Tetris, Arkanoid, Snake y Battleship.
   - Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`;
     al confirmar, guarda en `localStorage` e inserta en Supabase
     `{ game_id: 'galaga', player_name: name, score, user_id: null }`.
   - Botón de guardar se deshabilita tras el primer envío.
   - Botón «JUGAR DE NUEVO» incrementa `gameKey` para remontar el componente canvas.
     Verificación: el HUD React refleja score, vidas y oleada en tiempo real; tras una partida
     el score aparece en `/games/galaga` y en `/hall-of-fame` al recargar.

4. **Verificación final** — `npm run build` termina sin errores de TypeScript.
   Ninguna ruta existente devuelve 500.

---

## Acceptance criteria

- [ ] La fila `galaga` existe en la tabla `games` de Supabase con los valores del data model.
- [ ] La card de Galaga aparece en `/games` con cover `cover-galaga` y color `yellow`.
- [ ] La ruta `/games/galaga/play` carga sin errores de SSR ni de TypeScript.
- [ ] El canvas (480 × 600) se renderiza con fondo negro estrellado.
- [ ] Los 40 enemigos entran en grupos de 4 desde los bordes siguiendo curvas Bézier visibles.
- [ ] Todos los enemigos llegan a sus posiciones de formación antes de que comience la fase de ataque.
- [ ] El bloque de formación oscila horizontalmente ±60 px de forma suave.
- [ ] La distribución de filas es correcta: 4 Bosses en fila 1, 4 Butterflies en filas 2-3, 14 Bees en filas 4-5.
- [ ] Los grupos de 1-3 enemigos se desprenden y atacan en picado con curvas Bézier diferenciadas por tipo.
- [ ] Los Bosses activan el tractor beam (haz verde semitransparente) al pasar sobre el jugador.
- [ ] Si el jugador está dentro del haz de tractor beam durante 2 000 ms, la nave queda capturada.
- [ ] Al ser capturado, el jugador pierde 1 vida; `onLivesChange(lives)` se dispara con el valor actualizado.
- [ ] El sprite de la nave capturada aparece junto al Boss mientras regresa a la formación.
- [ ] Al destruir el Boss capturador, la nave vuela de regreso al jugador y se activa el modo dual-ship.
- [ ] En modo dual-ship el jugador dispara 4 proyectiles simultáneos en lugar de 2.
- [ ] Un impacto en dual-ship elimina la nave derecha y descuenta 1 vida, volviendo a nave simple.
- [ ] El scoring es correcto: Bee 50/80, Butterfly 80/160, Boss 150/400, Boss capturador 1 000.
- [ ] `onScoreChange(score)` se llama en cada impacto con el valor acumulado actualizado.
- [ ] Cada 3 oleadas se activa el Bonus Stage sin proyectiles enemigos.
- [ ] Al finalizar el Bonus Stage, el canvas muestra «HIT RATE XX%» con el porcentaje correcto.
- [ ] Se aplica el bonus de puntuación correspondiente (0, 100×hits, o 10 000 si perfectos).
- [ ] `onLevelChange(wave)` se llama al iniciar cada oleada (normal y bonus).
- [ ] La velocidad de ataque y formación escala con la oleada (aproximadamente +5% por oleada).
- [ ] El HUD interno del canvas muestra score, hi-score, oleada y vidas en tiempo real.
- [ ] El HUD React de la plataforma refleja score, vidas y oleada en tiempo real.
- [ ] El botón "PAUSA" de la plataforma congela el game loop; "REANUDAR" lo reanuda.
- [ ] Las teclas P / Esc no provocan una pausa independiente del canvas.
- [ ] Al llegar a 0 vidas, `onLivesChange(0)` y `onGameOver(score)` se disparan en ese orden.
- [ ] Aparece el modal React de game over con la puntuación final.
- [ ] El modal pre-rellena el nombre desde `av_player_name` de localStorage si existe.
- [ ] Al confirmar, el score se inserta en Supabase y el nombre se persiste en localStorage.
- [ ] El botón de guardar se deshabilita tras el primer envío (sin doble inserción).
- [ ] El botón "JUGAR DE NUEVO" remontar el canvas desde oleada 1 con nueva formación.
- [ ] El score guardado aparece en `/games/galaga` y en `/hall-of-fame` al recargar.
- [ ] `npm run build` completa sin errores de TypeScript.
- [ ] Ninguna ruta existente devuelve 500.

---

## Decisions

- **Sí: Doble HUD** — el canvas conserva su HUD interno y React muestra los mismos valores
  en el HUD de la plataforma. Razón: coherencia con el patrón establecido en todos los juegos
  de la plataforma; el juego funciona visualmente como standalone dentro del canvas.

- **Sí: 3 vidas** — Galaga clásico arranca con 3 vidas. `onLivesChange` notifica cada pérdida
  (por impacto de proyectil o captura de tractor beam); `onLivesChange(0)` dispara el game over.
  Razón: fiel a la mecánica original del arcade.

- **Sí: Curvas Bézier cúbicas para todos los vuelos** — entrada, picado y retorno se implementan
  con la fórmula `B(t) = (1-t)³p0 + 3(1-t)²t p1 + 3(1-t)t² p2 + t³p3` evaluada en cada frame.
  Razón: produce trayectorias suaves y orgánicas sin dependencias externas; es la aproximación
  más fiel al comportamiento visual del Galaga original.

- **Sí: Formas canvas primitivas para sprites** — enemigos, nave y proyectiles se dibujan con
  primitivas canvas (rectángulos, polígonos, arcos). Razón: no existen sprites externos en el
  proyecto; mantiene el spec autocontenido y ejecutable con `/spec-impl` sin assets adicionales.

- **Sí: Modo dual-ship como mecánica diferenciadora** — la captura y rescate de la nave propia
  es la mecánica central que distingue Galaga de Space Invaders (ya en `game-jam/space-invaders`).
  Razón: sin esta mecánica el juego sería una variante menor; el tractor beam y el dual-ship
  justifican completamente la implementación como juego independiente.

- **Sí: Bonus Stage cada 3 oleadas** — implementada con patrones de vuelo predefinidos sin
  proyectiles enemigos. Razón: mecánica canónica del arcade original que aporta variedad rítmica
  y una oportunidad de bonus scoring diferenciada.

- **Sí: Hi-score en HUD del canvas** — almacenado en `localStorage('galaga_hi')`.
  Razón: el hi-score es una característica icónica del arcade original que no requiere
  base de datos y mejora la experiencia sin complejidad adicional.

- **Sí: Play-page específica `app/games/galaga/play/page.tsx`** — en lugar de modificar
  la ruta genérica `[id]/play`. Razón: coherencia con el resto de juegos; Next.js App Router
  da prioridad a rutas estáticas sobre dinámicas.

- **Sí: `dynamic(..., { ssr: false })`** — el componente canvas se carga solo en cliente.
  Razón: `canvas` y `requestAnimationFrame` no existen en el entorno Node.js de Next.js SSR.

- **No: Sprites con imágenes externas** — se usan primitivas canvas.
  Razón: no existen spritesheets de Galaga en el proyecto; añadirlos requeriría un spec de
  assets separado y la gestión de derechos de los gráficos originales de Namco.

- **No: Efectos de sonido** — fuera de alcance en este spec.
  Razón: se cubren en un spec separado de audio si se desea; no añadir dependencias de Web
  Audio API sin un plan de implementación completo.

- **No: Colisión física entre la nave del jugador y los sprites enemigos** — solo los
  proyectiles y el tractor beam dañan. Razón: en el arcade original la nave del jugador está
  fija en la franja inferior y los enemigos en picado regresan antes de tocar esa zona;
  la implementación de embestida directa añadiría complejidad sin fidelidad extra.

- **No: Controles táctiles o mobile** — fuera de alcance en este spec.
  Razón: se pueden añadir mediante el agente `mobile-porter` en una corrida separada.

- **No: Supabase Auth y RLS** — `user_id` se guarda como `null`.
  Razón: consistencia con todos los juegos actuales de la plataforma.

- **No: Realtime en leaderboard** — los scores se ven al recargar.
  Razón: la complejidad de subscriptions no aporta valor mientras haya pocos jugadores activos.
