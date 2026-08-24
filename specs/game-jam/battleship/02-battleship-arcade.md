# SPEC — Battleship Arcade (modo tiempo real con oleadas enemigas)

> **Estado:** Propuesto
> **Depende de:** 06-games-table-leaderboard-supabase
> **Fecha:** 2026-08-24
> **Objetivo:** Implementar una variante arcade de Battleship en tiempo real donde el jugador
> maneja un navío propio que dispara torpedos hacia barcos enemigos en movimiento, con oleadas
> progresivas, cooldown de disparo y tres vidas.

---

## Scope

**In:**

- INSERT SQL para añadir la fila `battleship-arcade` a la tabla `games` en Supabase.
- Crear `components/games/BattleshipArcadeGame.tsx` — componente React `"use client"` que
  encapsula un canvas (800 × 600 px). Acepta props:
  `paused`, `onScoreChange`, `onLivesChange`, `onLevelChange`, `onGameOver`.
- Game loop con `requestAnimationFrame`. Las fases internas son:
  `'idle'` (pantalla de inicio) → `'playing'` → `'gameover'`.
- **Navío del jugador**: barra horizontal de 64 × 20 px en la franja inferior del canvas
  (y fija = 540 px). Se desplaza con ← → a 220 px/s; rebota en los bordes del canvas.
- **Torpedos del jugador**: proyectil de 4 × 16 px que viaja hacia arriba a 400 px/s.
  Cooldown de disparo: 700 ms. Máximo de 3 torpedos simultáneos en pantalla.
  Tecla: `Space` o `ArrowUp`.
- **Barcos enemigos**: aparecen en la zona superior (y entre 30 y 200 px). Tres tipos:
  | Tipo        | Ancho | HP | Velocidad | Cadencia de fuego | Puntos |
  |-------------|-------|----|-----------|-------------------|--------|
  | Patrullero  | 40 px | 1  | 90 px/s   | 3 000 ms          |  50    |
  | Crucero     | 64 px | 2  | 60 px/s   | 2 000 ms          | 100    |
  | Acorazado   | 96 px | 3  | 35 px/s   | 1 500 ms          | 200    |
  Los barcos se mueven horizontalmente, rebotan en los bordes y cambian de dirección
  aleatoriamente cada 2-4 s para aumentar la impredictibilidad.
- **Torpedos enemigos**: proyectil de 4 × 14 px que viaja hacia abajo a 250 px/s.
  Cada barco enemigo dispara en intervalos definidos por su cadencia de fuego.
- **Sistema de oleadas** (niveles):
  - Oleada N: aparecen `2 + N` barcos. La distribución de tipos escala con el nivel
    (nivel 1: solo patrulleros; nivel 2+: mix de cruceros; nivel 4+: aparecen acorazados).
  - Al destruir todos los barcos de la oleada, comienza la siguiente tras una pausa
    de 1 500 ms con mensaje «OLEADA N+1» en canvas. `onLevelChange(N+1)` se dispara.
  - No hay límite de oleadas — el modo es endless.
- **Vidas**: el jugador empieza con 3 vidas. Un torpedo enemigo que alcanza el navío
  del jugador resta 1 vida. `onLivesChange(lives)` se dispara en cada pérdida.
  Con 0 vidas: `onLivesChange(0)` → `onGameOver(score)`.
- **Radar**: tecla `Tab` activa el radar 1 500 ms (cooldown 5 000 ms): dibuja círculos
  concéntricos animados desde el centro del canvas y resalta brevemente la silueta de
  todos los enemigos en verde brillante, independientemente de la niebla de guerra.
- **HUD interno del canvas**: barra superior con score (izquierda), oleada (centro), vidas
  como iconos de barco (derecha) y barra de cooldown de radar bajo la barra de vidas.
- El componente notifica a React vía callbacks (comparando con valor anterior).
- Limpiar los event listeners de `keydown` y `keyup` de `document` en el `return` del `useEffect`.
- La pausa se controla exclusivamente vía prop `paused`; durante la pausa el loop sigue
  llamando a `draw()` pero no ejecuta `update()`.
- Crear `app/games/battleship-arcade/play/page.tsx` — play-page específica con
  `dynamic(..., { ssr: false })`.
- Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`,
  inserta en Supabase `{ game_id: 'battleship-arcade', player_name: name, score, user_id: null }`,
  persiste nombre en `localStorage`. Botón de guardar se deshabilita tras el primer envío.

**Fuera de alcance:**

- Controles táctiles o mobile.
- Supabase Auth y RLS — `user_id` se almacena como `null`.
- Realtime en el leaderboard.
- Sprites de barcos con imágenes externas — se usan formas canvas primitivas (rectángulos
  con color y líneas decorativas) para todos los navíos.
- Efectos de sonido — se cubren en un spec separado si se desea.
- Power-ups o habilidades especiales más allá del radar.
- Colisiones barco-enemigo (embestida) — solo los torpedos dañan.

---

## Data model

### INSERT en tabla `games`

```sql
INSERT INTO games (id, title, short, long, cat, cover, color)
VALUES (
  'battleship-arcade',
  'BATTLESHIP ARCADE',
  'Destruye oleadas de barcos enemigos antes de hundirte.',
  'Pilota tu navío a lo largo del océano y dispara torpedos contra flotillas enemigas que avanzan y contraatacan en tiempo real. Cada oleada trae más barcos, más rápidos y con mayor cadencia de fuego — sobrevive todo lo que puedas.',
  'SHOOTER',
  'cover-battleship-arcade',
  'cyan'
);
```

### Props del componente `BattleshipArcadeGame`

```ts
interface BattleshipArcadeGameProps {
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
}
```

El estado local arranca con `lives = 3`, `score = 0`, `level = 1`.
`onLivesChange` se llama con el valor actualizado de vidas tras cada impacto enemigo.
`onLivesChange(0)` se dispara justo antes de `onGameOver(score)`.
`onLevelChange(N)` se dispara al iniciar cada nueva oleada.

No se introducen nuevas tablas ni tipos TypeScript — se reutilizan `GameRow` y `ScoreRow`
de `lib/supabase/types.ts`.

---

## Implementation plan

1. **INSERT en Supabase** — ejecutar el SQL del data model en el SQL Editor de Supabase.
   Verificación: la fila `battleship-arcade` aparece en el Table Editor; `/games` muestra
   la card con cover `cover-battleship-arcade` y color `cyan`.

2. **Crear `components/games/BattleshipArcadeGame.tsx`** — componente `"use client"` que:

   2a. **Canvas y constantes de módulo**
   - Renderiza un único `<canvas>` de 800 × 600 px mediante `useRef<HTMLCanvasElement>`.
   - Constantes de módulo (fuera del componente):
     ```ts
     const W = 800, H = 600;
     const PLAYER_Y = 540;
     const PLAYER_W = 64, PLAYER_H = 20;
     const PLAYER_SPEED = 220;          // px/s
     const TORPEDO_SPEED_UP = 400;      // px/s (jugador)
     const TORPEDO_SPEED_DOWN = 250;    // px/s (enemigos)
     const TORPEDO_COOLDOWN = 700;      // ms
     const MAX_PLAYER_TORPEDOES = 3;
     const RADAR_DURATION = 1500;       // ms
     const RADAR_COOLDOWN = 5000;       // ms
     const WAVE_PAUSE = 1500;           // ms entre oleadas
     const ENEMY_TYPES = [
       { type: 'patrol',    w: 40, hp: 1, speed: 90, fireRate: 3000, points: 50  },
       { type: 'cruiser',   w: 64, hp: 2, speed: 60, fireRate: 2000, points: 100 },
       { type: 'battleship',w: 96, hp: 3, speed: 35, fireRate: 1500, points: 200 },
     ] as const;
     ```

   2b. **Modelo de datos interno** (dentro del `useRef` de estado del juego)
   ```ts
   interface PlayerState {
     x: number;             // centro del navío
     vx: number;            // velocidad actual (px/s, positivo = derecha)
     lives: number;
     torpedoCooldown: number;      // ms restantes hasta poder disparar
     radarActive: boolean;
     radarTimer: number;           // ms restantes de radar activo
     radarCooldown: number;        // ms restantes hasta poder usar radar de nuevo
   }
   interface Torpedo {
     x: number; y: number;
     vy: number;            // negativo = sube (jugador), positivo = baja (enemigo)
     owner: 'player' | 'enemy';
   }
   interface Enemy {
     id: number;
     type: 'patrol' | 'cruiser' | 'battleship';
     x: number; y: number;
     w: number; hp: number; speed: number;
     vx: number;
     fireTimer: number;     // ms hasta próximo disparo
     dirTimer: number;      // ms hasta cambio aleatorio de dirección
   }
   interface ArcadeState {
     phase: 'idle' | 'playing' | 'wave-transition' | 'gameover';
     player: PlayerState;
     torpedoes: Torpedo[];
     enemies: Enemy[];
     wave: number;
     waveTimer: number;     // ms restantes de pausa entre oleadas
     score: number;
     keys: Record<string, boolean>;
     lastTime: number;      // DOMHighResTimeStamp del frame anterior
   }
   ```

   2c. **Fase idle**
   - `draw()` en fase `'idle'`: fondo oscuro con océano estilizado (gradiente azul),
     título «BATTLESHIP ARCADE» en blanco, texto «Pulsa ENTER para empezar».
   - `keydown` con `key === 'Enter'`: inicializa `ArcadeState` con oleada 1 y pasa a
     `'playing'`; llama `onLevelChange(1)`.

   2d. **Fase playing — update(dt)**
   - `dt` = milisegundos desde el último frame, calculados como `currentTime - lastTime`.
   - **Movimiento del jugador**: si `keys['ArrowLeft']`, `player.vx = -PLAYER_SPEED`;
     si `keys['ArrowRight']`, `player.vx = PLAYER_SPEED`; si ninguna, `player.vx = 0`.
     Actualiza `player.x += player.vx * dt / 1000`; clamp a `[PLAYER_W/2, W - PLAYER_W/2]`.
   - **Disparo del jugador**: si `keys['Space'] || keys['ArrowUp']` y
     `torpedoCooldown <= 0` y `torpedos de jugador < MAX_PLAYER_TORPEDOES`:
     añade `{ x: player.x, y: PLAYER_Y - PLAYER_H/2, vy: -TORPEDO_SPEED_UP, owner: 'player' }`;
     reinicia `torpedoCooldown = TORPEDO_COOLDOWN`.
     Decrementa `torpedoCooldown` por `dt` en cada frame.
   - **Movimiento de torpedos**: actualiza `y += vy * dt / 1000` para cada torpedo;
     elimina torpedos que salen del canvas (y < 0 o y > H).
   - **Movimiento de enemigos**: para cada enemigo:
     - `x += vx * dt / 1000`; si toca borde, invierte `vx`.
     - Decrementa `dirTimer` por `dt`; cuando llega a 0, reinicia con valor aleatorio
       entre 2 000 y 4 000 ms y con un 50 % de probabilidad invierte `vx`.
   - **Disparo enemigo**: para cada enemigo, decrementa `fireTimer` por `dt`; cuando
     llega a 0, añade torpedo `{ x: enemy.x, y: enemy.y + enemy.h/2, vy: TORPEDO_SPEED_DOWN, owner: 'enemy' }`;
     reinicia `fireTimer` con el `fireRate` del tipo.
   - **Detección de colisiones**:
     - Torpedo de jugador vs enemigo: si los AABB se solapan, resta 1 HP al enemigo.
       Si HP ≤ 0: elimina enemigo, suma puntos a score (`enemy.points`),
       llama `onScoreChange(score)`. Elimina el torpedo.
     - Torpedo enemigo vs jugador: si el AABB del torpedo se solapa con el AABB del
       navío del jugador, resta 1 vida. Llama `onLivesChange(lives)`.
       Si `lives <= 0`: llama `onLivesChange(0)` y `onGameOver(score)`;
       cambia `phase` a `'gameover'`. Elimina el torpedo.
   - **Radar**: si `keys['Tab']` y `radarCooldown <= 0` y `!radarActive`:
     activa `radarActive = true`, `radarTimer = RADAR_DURATION`, `radarCooldown = RADAR_COOLDOWN`.
     Decrementa `radarTimer` y `radarCooldown` por `dt`. Cuando `radarTimer <= 0`,
     desactiva `radarActive`.
   - **Fin de oleada**: si `enemies.length === 0` y `phase === 'playing'`:
     cambia a `'wave-transition'`; `waveTimer = WAVE_PAUSE`.
   - **Transición de oleada**: decrementa `waveTimer` por `dt`; cuando llega a 0,
     incrementa `wave`, llama `onLevelChange(wave)`, genera la nueva oleada de enemigos
     y cambia a `'playing'`.

   2e. **Generación de oleadas**
   - Función `spawnWave(wave: number): Enemy[]`:
     - Total de enemigos: `2 + wave`.
     - Distribución de tipos según nivel:
       - Nivel 1-2: 100 % Patrulleros.
       - Nivel 3-4: 60 % Patrulleros, 40 % Cruceros.
       - Nivel 5+: 30 % Patrulleros, 40 % Cruceros, 30 % Acorazados.
     - Posiciones `x` distribuidas uniformemente a lo largo del canvas (mínimo 80 px de
       separación entre barcos); `y` asignado aleatoriamente entre 30 y 180 px.
     - `vx` inicial: aleatoriamente `speed` o `-speed`.
     - `fireTimer` inicial: aleatorio entre 0 y `fireRate` para escalonar los primeros disparos.

   2f. **Render en fase playing**
   - **Fondo**: gradiente vertical de `#0a1628` (tope) a `#0d2240` (base); líneas
     horizontales de ondas estilizadas en azul muy oscuro cada ~30 px.
   - **Enemigos**: rectángulo con color según tipo (Patrullero: gris, Crucero: naranja,
     Acorazado: rojo oscuro); barra de HP verde encima del sprite.
     Si `radarActive`: dibuja además el contorno con stroke verde brillante y sombra difusa.
   - **Navío del jugador**: rectángulo azul con línea de quilla, centrado en `player.x`.
   - **Torpedos del jugador**: rectángulo verde de 4 × 16 px.
   - **Torpedos enemigos**: rectángulo naranja de 4 × 14 px.
   - **HUD interno**:
     - Fila superior: `SCORE: N` a la izquierda, `OLEADA N` en el centro, iconos de barco
       para vidas a la derecha.
     - Barra de cooldown del radar debajo de los iconos de vida: rectángulo proporcional
       al tiempo restante de cooldown (verde = listo, rojo = recargando).
   - **Transición de oleada**: overlay semitransparente con texto «OLEADA N» en el centro.

   2g. **Limpieza**
   - En el `return` del `useEffect`: cancela el frame con `cancelAnimationFrame`,
     elimina el listener de `keydown` y `keyup` de `document`.

   Verificación: el juego arranca en `/games/battleship-arcade/play`; el navío se mueve
   con ← →; Space dispara torpedos con cooldown visible; los barcos enemigos se mueven
   y disparan; al perder 3 vidas aparece el modal de game over.

3. **Crear `app/games/battleship-arcade/play/page.tsx`** — play-page específica:
   - Importa `BattleshipArcadeGame` con `dynamic(..., { ssr: false })`.
   - Estado local: `score`, `lives` (inicial `3`), `level` (inicial `1`), `paused`, `over`,
     `name`, `saved`, `gameKey`.
   - Pasa `paused` y los cuatro callbacks a `BattleshipArcadeGame`.
   - Reutiliza el layout visual de la plataforma (HUD React + CRT + modal game over).
   - Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`;
     al confirmar, guarda en `localStorage` e inserta en Supabase
     `{ game_id: 'battleship-arcade', player_name: name, score, user_id: null }`.
   - Botón de guardar se deshabilita tras el primer envío.
   - Botón «JUGAR DE NUEVO» incrementa `gameKey` para remontar el componente canvas.
     Verificación: el HUD React refleja score, vidas y oleada en tiempo real.

4. **Verificación final** — `npm run build` termina sin errores de TypeScript.
   Ninguna ruta existente devuelve 500.

---

## Acceptance criteria

- [ ] La fila `battleship-arcade` existe en la tabla `games` de Supabase con los valores del data model.
- [ ] La card aparece en `/games` con cover `cover-battleship-arcade` y color `cyan`.
- [ ] La ruta `/games/battleship-arcade/play` carga sin errores de SSR ni de TypeScript.
- [ ] El canvas (800 × 600) se renderiza con fondo oceánico y el navío del jugador en y=540.
- [ ] La fase idle muestra el título y el prompt «Pulsa ENTER para empezar».
- [ ] Pulsar Enter inicia la oleada 1 y llama `onLevelChange(1)`.
- [ ] El navío del jugador se mueve con ← → y no sale de los bordes del canvas.
- [ ] Pulsar Space o ↑ lanza un torpedo hacia arriba con el cooldown de 700 ms.
- [ ] No más de 3 torpedos del jugador simultáneos en pantalla.
- [ ] Los barcos enemigos se mueven horizontalmente y rebotan en los bordes.
- [ ] Los enemigos cambian de dirección aleatoriamente cada 2-4 s.
- [ ] Cada barco enemigo dispara torpedos hacia abajo según su cadencia de fuego.
- [ ] Un torpedo del jugador que alcanza un enemigo le resta 1 HP; con HP=0 el enemigo desaparece.
- [ ] Hundir un Patrullero suma 50, un Crucero 100, un Acorazado 200; `onScoreChange` se llama.
- [ ] Un torpedo enemigo que alcanza el navío del jugador resta 1 vida; `onLivesChange` se llama.
- [ ] Al llegar a 0 vidas, `onLivesChange(0)` y `onGameOver(score)` se disparan.
- [ ] Al destruir todos los enemigos de una oleada, aparece el mensaje «OLEADA N+1» 1 500 ms.
- [ ] Tras la pausa, comienza la siguiente oleada con más barcos y `onLevelChange(N+1)` se llama.
- [ ] La distribución de tipos de barcos escala con el nivel (acorazados aparecen en nivel 4+).
- [ ] Tab activa el radar 1 500 ms y resalta los enemigos en verde; cooldown de 5 000 ms.
- [ ] La barra de cooldown del radar se dibuja en el HUD interno del canvas.
- [ ] El HUD interno muestra score, oleada e iconos de vida en tiempo real.
- [ ] El HUD React de la plataforma refleja score, vidas y nivel en tiempo real.
- [ ] El botón "PAUSA" detiene `update()` y los disparos enemigos; "REANUDAR" los reanuda.
- [ ] Las teclas P / Esc no producen pausa independiente.
- [ ] El modal React de game over aparece con la puntuación final.
- [ ] El modal pre-rellena el nombre desde `av_player_name` de localStorage si existe.
- [ ] Al confirmar, el score se inserta en Supabase y el nombre se persiste en localStorage.
- [ ] El botón de guardar se deshabilita tras el primer envío (sin doble inserción).
- [ ] El botón "JUGAR DE NUEVO" reinicia la partida desde la oleada 1.
- [ ] El score guardado aparece en `/games/battleship-arcade` y en `/hall-of-fame` al recargar.
- [ ] `npm run build` completa sin errores de TypeScript.
- [ ] Ninguna ruta existente devuelve 500.

---

## Decisions

- **Sí: Doble HUD** — el canvas conserva su HUD interno y React muestra los mismos valores
  en el HUD de la plataforma. Razón: coherencia con el patrón establecido en todos los juegos
  de la plataforma.

- **Sí: 3 vidas** — el modo arcade tiene vidas explícitas; cada impacto enemigo consume una.
  Razón: mecánica arcade clásica que aporta tensión sin complicar el modelo; `onLivesChange`
  se llama en cada pérdida para reflejar el estado en el HUD React.

- **Sí: delta-time en el game loop** — se usa `requestAnimationFrame` con `dt = currentTime - lastTime`
  para que el movimiento sea frame-rate independent. Razón: evita que el juego vaya más rápido
  o lento según la tasa de refresco del monitor del usuario.

- **Sí: colisiones por AABB (rectángulo a rectángulo)** — sin círculos ni polígonos complejos.
  Razón: suficientemente preciso para el tamaño de los sprites; implementación simple y eficiente.

- **Sí: modo endless con oleadas infinitas** — no hay límite de oleadas ni condición de victoria.
  Razón: maximiza el tiempo de juego y la replayability; el juego termina solo cuando el jugador
  agota sus vidas, lo que encaja con el sistema de leaderboard de la plataforma.

- **Sí: radar como habilidad de cooldown** — Tab activa un efecto visual de 1 500 ms con cooldown
  de 5 000 ms. Razón: añade una capa táctica temática (Battleship = radar / sonar) sin
  introducir power-ups con mecánica de drop, que requeriría más complejidad.

- **Sí: formas canvas primitivas para los sprites** — rectángulos con color y líneas decorativas,
  sin imágenes externas. Razón: no existen sprites de barcos en el proyecto; diseñar con
  primitivas mantiene el spec autocontenido.

- **Sí: Play-page específica `app/games/battleship-arcade/play/page.tsx`** — en lugar de modificar
  la ruta genérica `[id]/play`. Razón: coherencia con el resto de juegos; Next.js App Router
  da prioridad a rutas estáticas sobre dinámicas.

- **Sí: `dynamic(..., { ssr: false })`** — el componente canvas se carga solo en cliente.
  Razón: `canvas` y `requestAnimationFrame` no existen en el entorno Node.js de Next.js SSR.

- **No: Colisiones barco-enemigo por embestida** — solo los torpedos dañan.
  Razón: los barcos enemigos se mueven en la zona superior y el navío del jugador está fijo
  en la zona inferior; el solapamiento físico es imposible en la configuración actual, por lo
  que añadir la detección sería código muerto.

- **No: Controles táctiles o mobile** — fuera de alcance en este spec.
  Razón: se pueden añadir mediante el agente `mobile-porter` en una corrida separada.

- **No: Supabase Auth y RLS** — `user_id` se guarda como `null`.
  Razón: consistencia con todos los juegos actuales de la plataforma.

- **No: Realtime en leaderboard** — los scores se ven al recargar.
  Razón: la complejidad de subscriptions no aporta valor mientras haya pocos jugadores activos.

- **No: Efectos de sonido** — fuera de alcance en este spec.
  Razón: se cubren en un spec separado de audio si se desea; no añadir dependencias de Web
  Audio API sin un plan de implementación completo.
