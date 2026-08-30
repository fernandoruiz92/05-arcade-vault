# SPEC — Karate Champ Classic (modo 1 vs 1 contra IA)

> **Estado:** Propuesto
> **Depende de:** 06-games-table-leaderboard-supabase
> **Fecha:** 2026-08-26
> **Objetivo:** Implementar Karate Champ como juego jugable en Arcade Vault con modo clásico
> 1 vs 1 contra IA en canvas puro: el jugador ejecuta técnicas mediante combinaciones de teclas,
> acumula puntos por golpes limpios y gana al vencer 2 de 3 combates al rival.

---

## Scope

**In:**

- INSERT SQL para añadir la fila `karate-champ` a la tabla `games` en Supabase.
- Crear `components/games/KarateChampGame.tsx` — componente React `"use client"` que
  encapsula un canvas (800 × 500 px). Acepta props:
  `paused`, `onScoreChange`, `onLivesChange`, `onLevelChange`, `onGameOver`,
  y la prop adicional `mode: 'classic' | 'tournament'` (este spec cubre solo `'classic'`).
- Game loop construido desde cero con `requestAnimationFrame` y delta-time.
  Fases internas: `'idle'` → `'hajime'` → `'fighting'` → `'yame'` → `'result'` → `'gameover'`.
- **Luchadores**: dos sprites dibujados con primitivas canvas (rectángulos y líneas).
  El jugador ocupa la zona izquierda (x inicial 180 px) y la IA la zona derecha (x inicial 620 px).
  Ambos pueden moverse a lo largo del eje X dentro del dojo; el eje Y es fijo.
- **8 técnicas mediante combinaciones de teclas**:
  | Técnica          | Combinación         | Alcance | Daño    | Hitbox (ancho × alto) |
  |------------------|---------------------|---------|---------|------------------------|
  | Puñetazo alto    | → + Z               | medio   | 1 pt    | 60 × 30 px             |
  | Puñetazo bajo    | ↓ + Z               | corto   | 1 pt    | 50 × 25 px             |
  | Patada alta      | → + X               | largo   | 1 pt    | 80 × 35 px             |
  | Patada baja      | ↓ + X               | medio   | 1 pt    | 70 × 30 px             |
  | Barrido          | ← + X               | corto   | ½ pt    | 90 × 20 px (bajo)      |
  | Bloqueo alto     | ↑ (sin ataque)      | —       | escudo  | —                      |
  | Bloqueo bajo     | ↓ (sin ataque)      | —       | escudo  | —                      |
  | Avance/retroceso | ← / → sin Z ni X   | —       | —       | —                      |
  - Un golpe limpio (sin bloqueo activo del rival) suma 1 punto al atacante.
  - Un barrido que conecta sin bloqueo bajo activo suma ½ punto.
  - Un golpe bloqueado no suma puntos.
  - Primero en alcanzar 2 puntos en un combate lo gana.
- **Colisiones por hitboxes rectangulares (AABB)**: cada técnica activa una hitbox
  durante un intervalo de 120 ms; si el AABB del atacante se solapa con el cuerpo del
  defensor y el defensor no tiene el bloqueo correcto activo, se contabiliza el punto.
- **Estructura de partida**: 3 combates por partida. Primero en ganar 2 combates
  gana la partida. Si cada luchador gana 1 combate, el tercero es decisivo.
- **Árbitro en canvas**: figura simplificada (rectángulo + círculo de cabeza) visible entre
  los dos luchadores; muestra en canvas los textos `HAJIME` (inicio de combate),
  `YAME` (detención tras punto o tiempo) e `IPPON` / `WAZA-ARI` (puntuación).
- **Timer de combate**: 60 segundos por combate. Si el timer llega a cero sin que ningún
  luchador alcance 2 puntos, gana el combate quien tenga más puntos en ese momento;
  si hay empate, el combate se declara nulo (no suma para ninguno) y se repite.
- **IA con tres modos** según diferencia de puntos de combate:
  - **Defensiva** (IA gana por ≥1 punto): prioriza bloqueos y avanza lentamente.
  - **Neutral** (empate): mezcla ataques y bloqueos con cadencia normal.
  - **Agresiva** (IA pierde por ≥1 punto): ataca con mayor frecuencia y menor tiempo de reacción.
  - La IA evalúa su modo cada vez que el marcador cambia. Las decisiones de ataque/bloqueo
    se ejecutan con un tiempo de reacción base de 400 ms (defensiva), 300 ms (neutral)
    o 200 ms (agresiva), más un jitter aleatorio de ±100 ms.
- **HUD interno del canvas**: franja superior de 50 px con timer centrado, nombre jugador
  y score parcial a la izquierda, nombre IA y score parcial a la derecha; fila de círculos
  indicando combates ganados por cada lado (●= ganado, ○= pendiente).
- **Score total**: cada punto de combate acumulado a lo largo de los 3 combates se cuenta.
  Un combate ganado por IPPON (2-0) vale 2 pts; por WAZA-ARI (2-1) vale 2 pts del ganador
  y 1 del perdedor. El score Supabase = suma de todos los puntos del jugador en los 3 combates.
- El componente notifica a React vía callbacks (comparando con valor anterior antes de disparar).
- `onLivesChange(1)` se llama al iniciar; `onLivesChange(0)` se llama justo antes de
  `onGameOver(score)` al terminar la partida (independientemente del resultado).
- `onLevelChange(n)` se llama al inicio de cada combate (1, 2 o 3).
- La pausa se controla exclusivamente vía prop `paused`; durante la pausa el loop sigue
  llamando a `draw()` pero no ejecuta `update()` ni avanza el timer.
- Limpiar los event listeners de `keydown` y `keyup` de `document` en el `return` del `useEffect`.
- Crear `app/games/karate-champ/play/page.tsx` — play-page específica con
  `dynamic(..., { ssr: false })`.
- Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`,
  inserta en Supabase `{ game_id: 'karate-champ', player_name: name, score, user_id: null }`,
  persiste nombre en `localStorage`. Botón de guardar se deshabilita tras el primer envío.

**Fuera de alcance:**

- Controles táctiles o mobile.
- Supabase Auth y RLS — `user_id` se almacena como `null`.
- Realtime en el leaderboard.
- Sprites con imágenes externas — todos los luchadores y el árbitro se dibujan con primitivas canvas.
- Efectos de sonido — se cubren en un spec separado si se desea.
- Modo torneo con rivales progresivos y power-ups — cubierto en `02-karate-champ-tournament.md`.
- Selector de personaje o skin del luchador.
- Modo dos jugadores en el mismo teclado.

---

## Data model

### INSERT en tabla `games`

```sql
INSERT INTO games (id, title, short, long, cat, cover, color)
VALUES (
  'karate-champ',
  'KARATE CHAMP',
  'Ejecuta técnicas precisas y vence al rival en el tatami.',
  'Combina teclas de dirección y ataque para lanzar ocho técnicas de karate contra un rival controlado por IA. Gana dos de tres combates puntuando golpes limpios antes de que el árbitro detenga el enfrentamiento.',
  'FIGHTING',
  'cover-karate-champ',
  'gold'
);
```

### Props del componente `KarateChampGame`

```ts
interface KarateChampGameProps {
  mode: 'classic' | 'tournament';
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
}
```

El estado local arranca con `lives = 1`, `score = 0`, `level = 1`.
`onLivesChange(0)` se dispara justo antes de `onGameOver(score)` al finalizar la partida
(ya sea victoria o derrota del jugador).
`onLevelChange(n)` se dispara al inicio de cada combate (valores 1, 2, 3).

No se introducen nuevas tablas ni tipos TypeScript — se reutilizan `GameRow` y `ScoreRow`
de `lib/supabase/types.ts`.

---

## Implementation plan

1. **INSERT en Supabase** — ejecutar el SQL del data model en el SQL Editor de Supabase.
   Verificación: la fila `karate-champ` aparece en el Table Editor; `/games` muestra la card
   con cover `cover-karate-champ` y color `gold`.

2. **Crear `components/games/KarateChampGame.tsx`** — componente `"use client"` que:

   2a. **Canvas y constantes de módulo**
   - Renderiza un único `<canvas>` de 800 × 500 px mediante `useRef<HTMLCanvasElement>`.
   - Constantes de módulo (fuera del componente):
     ```ts
     const W = 800, H = 500;
     const HUD_H = 50;                   // altura de la franja HUD superior
     const FLOOR_Y = 420;                // línea del suelo del dojo
     const FIGHTER_W = 40, FIGHTER_H = 90;
     const PLAYER_INIT_X = 180;
     const AI_INIT_X = 620;
     const MOVE_SPEED = 160;             // px/s al caminar
     const HITBOX_DURATION = 120;        // ms que una hitbox permanece activa
     const COMBO_WINDOW = 200;           // ms máx. entre tecla de dirección y tecla de ataque
     const REACTION_BASE = { defensive: 400, neutral: 300, aggressive: 200 }; // ms
     const REACTION_JITTER = 100;        // ±ms aleatorio
     const COMBAT_TIMER = 60;            // segundos por combate
     const POINTS_TO_WIN_COMBAT = 2;     // puntos para ganar un combate
     const COMBATS_PER_MATCH = 3;
     ```

   2b. **Modelo de datos interno** (dentro de un `useRef` de estado del juego)
   ```ts
   type FightPhase = 'idle' | 'hajime' | 'fighting' | 'yame' | 'result' | 'gameover';
   type AIMode = 'defensive' | 'neutral' | 'aggressive';
   type TechniqueId =
     | 'punch-high' | 'punch-low'
     | 'kick-high'  | 'kick-low'
     | 'sweep'
     | 'block-high' | 'block-low'
     | 'idle';

   interface Hitbox { x: number; y: number; w: number; h: number; }

   interface Fighter {
     x: number;
     facing: 1 | -1;          // 1 = derecha, -1 = izquierda
     technique: TechniqueId;
     techniqueTimer: number;   // ms restantes de animación/hitbox activa
     combatPoints: number;     // puntos en el combate actual
     pendingDir: 'left' | 'right' | 'up' | 'down' | null; // última tecla de dirección
     pendingDirTimer: number;  // ms restantes de ventana de combo
   }

   interface MatchState {
     phase: FightPhase;
     phaseTimer: number;       // ms hasta cambiar de fase (hajime, yame, result)
     player: Fighter;
     ai: Fighter;
     combatTimer: number;      // segundos restantes en el combate actual
     combatIndex: number;      // 0, 1, 2 (índice del combate actual)
     playerCombatsWon: number;
     aiCombatsWon: number;
     playerTotalScore: number; // suma de puntos de todos los combates
     refText: string;          // texto a mostrar sobre el árbitro
     refTextTimer: number;     // ms restantes de visibilidad del texto
     aiMode: AIMode;
     aiActionTimer: number;    // ms hasta la próxima decisión de la IA
     keys: Record<string, boolean>;
     lastTime: number;
   }
   ```

   2c. **Fase idle**
   - `draw()` en fase `'idle'`: fondo de dojo (suelo marrón, paredes con gradiente rojo-dorado),
     título «KARATE CHAMP» centrado, texto «Pulsa ENTER para comenzar».
   - `keydown` con `key === 'Enter'`: llama `initMatch()` que inicializa `MatchState`,
     posiciona los luchadores y pasa a fase `'hajime'` con `phaseTimer = 1500` ms.
     Llama `onLivesChange(1)` y `onLevelChange(1)`.

   2d. **Fase hajime**
   - `draw()` dibuja el dojo, los dos luchadores en pose de guardia, el árbitro central
     y el texto `HAJIME` en rojo grande sobre el canvas.
   - Cuando `phaseTimer` llega a cero, pasa a fase `'fighting'` y arranca el `combatTimer`.

   2e. **Fase fighting — update(dt)**
   - `dt` = milisegundos desde el último frame.
   - **Procesamiento de input del jugador**:
     - Si `keys['ArrowLeft']` y no hay técnica activa: mueve al jugador `MOVE_SPEED * dt / 1000`
       hacia la izquierda (clamp a `FIGHTER_W/2`); actualiza `facing = -1`.
     - Si `keys['ArrowRight']` y no hay técnica activa: mueve a la derecha; `facing = 1`.
     - Si `keys['ArrowUp']` sin `Z` ni `X`: activa bloqueo alto mientras la tecla esté pulsada.
     - Si `keys['ArrowDown']` sin `Z` ni `X`: activa bloqueo bajo.
     - Al pulsar `Z` o `X`: comprueba la tecla de dirección retenida dentro del `COMBO_WINDOW`
       para determinar la técnica. Si no hay dirección activa: puñetazo bajo (Z) o patada baja (X).
   - **Ejecución de técnica**:
     - Activa `technique` en el `Fighter` del jugador; `techniqueTimer = HITBOX_DURATION`.
     - Calcula el hitbox según la tabla de técnicas del Scope y la `facing` actual del luchador.
   - **Detección de colisión AABB** (solo cuando `techniqueTimer > 0`):
     - Calcula el hitbox del atacante y el cuerpo del defensor
       (rectángulo `FIGHTER_W × FIGHTER_H` centrado en su `x`).
     - Si se solapan y el defensor NO tiene activo el bloqueo correcto:
       - Barrido (sweep): suma `0.5` a `combatPoints` del atacante.
       - Resto de técnicas: suma `1` a `combatPoints` del atacante.
       - Llama `onScoreChange(playerTotalScore + player.combatPoints)`.
       - Cambia fase a `'yame'` con `phaseTimer = 1500` ms; `refText = 'YAME'`.
     - Si el defensor tiene el bloqueo correcto activo (bloqueo alto protege técnicas altas;
       bloqueo bajo protege técnicas bajas y barrido): no suma puntos, activa animación de
       impacto bloqueado (`refText = 'BLOCK'`, `refTextTimer = 600` ms).
   - **Timer de combate**: decrementa `combatTimer` por `dt / 1000`. Al llegar a 0:
     - Si `player.combatPoints > ai.combatPoints`: jugador gana el combate.
     - Si `ai.combatPoints > player.combatPoints`: IA gana el combate.
     - Si empate: combate nulo, se reinicia sin incrementar `combatIndex`.
     - Pasa a fase `'yame'` → `'result'`.
   - **Condición de fin de combate** (alcanzar `POINTS_TO_WIN_COMBAT`):
     - Cuando `player.combatPoints >= 2` o `ai.combatPoints >= 2`: el combate termina;
       pasa a fase `'yame'` con `phaseTimer = 1500` ms.
   - **Decisiones de la IA** (se evalúan cada `aiActionTimer` ms):
     - Recalcula `aiMode` según diferencia de puntos:
       - IA gana por ≥1 punto en el combate → `'defensive'`.
       - Empate → `'neutral'`.
       - IA pierde por ≥1 punto → `'aggressive'`.
     - Elige acción aleatoria ponderada según modo:
       - `'defensive'`: 60 % bloqueo, 20 % avance, 20 % ataque.
       - `'neutral'`: 30 % bloqueo, 25 % avance, 45 % ataque.
       - `'aggressive'`: 10 % bloqueo, 15 % avance, 75 % ataque.
     - Al ejecutar ataque, elige una técnica aleatoria de las 5 de ataque.
     - Reinicia `aiActionTimer = REACTION_BASE[aiMode] + random(-JITTER, JITTER)`.

   2f. **Fases yame y result**
   - `'yame'`: el loop llama a `draw()` con el texto `YAME` en canvas; los luchadores
     vuelven a su posición inicial. Cuando `phaseTimer` llega a 0, pasa a `'result'`.
   - `'result'`: muestra el marcador de combates ganados y el texto `IPPON` (2-0) o
     `WAZA-ARI` (primer punto). `phaseTimer = 2500` ms. Al terminar:
     - Suma `player.combatPoints` a `playerTotalScore`.
     - Si `playerCombatsWon >= 2` o `aiCombatsWon >= 2` o `combatIndex >= COMBATS_PER_MATCH - 1`:
       pasa a `'gameover'`.
     - Si no: incrementa `combatIndex`, reinicia `combatPoints` de ambos luchadores,
       llama `onLevelChange(combatIndex + 1)`, pasa a `'hajime'`.

   2g. **Fase gameover**
   - `draw()` dibuja el resultado final: «VICTORIA» (jugador ganó ≥2 combates) o «DERROTA».
   - Llama `onScoreChange(playerTotalScore)`, `onLivesChange(0)`, `onGameOver(playerTotalScore)`.
   - La llamada ocurre una sola vez (guardar con un flag `gameOverFired`).

   2h. **Render en fase fighting**
   - **Fondo del dojo**: rectángulo inferior marrón claro (suelo, `FLOOR_Y` a `H`); zona
     superior con gradiente rojo oscuro. Línea horizonte en `FLOOR_Y`.
   - **Árbitro**: figura geométrica (rectángulo blanco + círculo cabeza) centrada en x=400;
     texto `refText` encima con `refTextTimer > 0`.
   - **Luchadores**: dibujados como siluetas compactas (rectángulo cuerpo + círculo cabeza +
     extremidades según técnica activa). Jugador en azul oscuro, IA en rojo oscuro.
     Si bloqueo activo: dibuja un rectángulo semitransparente ante el luchador.
   - **HUD interno** (franja superior 50 px, fondo negro semitransparente):
     - Izquierda: «JUGADOR» + puntos del combate actual + círculos de combates ganados.
     - Centro: timer en segundos (rojo si ≤10 s).
     - Derecha: «CPU» + puntos del combate actual + círculos de combates ganados.

   2i. **Limpieza**
   - En el `return` del `useEffect`: cancela el frame con `cancelAnimationFrame`,
     elimina los listeners de `keydown` y `keyup` de `document`.

   Verificación: el juego arranca en `/games/karate-champ/play` con la pantalla idle;
   al pulsar Enter inician el árbitro y el texto HAJIME; el luchador responde a las
   combinaciones de teclas; la IA ataca y bloquea; el árbitro muestra YAME al puntuar;
   tras 3 combates aparece el resultado final y el modal de game over.

3. **Crear `app/games/karate-champ/play/page.tsx`** — play-page específica:
   - Importa `KarateChampGame` con `dynamic(..., { ssr: false })`.
   - Pasa la prop `mode="classic"` al componente.
   - Estado local: `score`, `lives` (inicial `1`), `level` (inicial `1`), `paused`, `over`,
     `name`, `saved`, `gameKey`.
   - Pasa `paused` y los cuatro callbacks a `KarateChampGame`.
   - Reutiliza el layout visual de la plataforma (HUD React + CRT + modal game over),
     igual que las play-pages de los demás juegos de la plataforma.
   - Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`;
     al confirmar, guarda en `localStorage` e inserta en Supabase
     `{ game_id: 'karate-champ', player_name: name, score, user_id: null }`.
   - Botón de guardar se deshabilita tras el primer envío.
   - Botón «JUGAR DE NUEVO» incrementa `gameKey` para remontar el componente canvas.
     Verificación: el HUD React refleja score y nivel (número de combate) en tiempo real;
     tras una partida el score aparece en `/games/karate-champ` y en `/hall-of-fame` al recargar.

4. **Verificación final** — `npm run build` termina sin errores de TypeScript.
   Ninguna ruta existente devuelve 500.

---

## Acceptance criteria

- [ ] La fila `karate-champ` existe en la tabla `games` de Supabase con los valores del data model.
- [ ] La card de Karate Champ aparece en `/games` con cover `cover-karate-champ` y color `gold`.
- [ ] La ruta `/games/karate-champ/play` carga sin errores de SSR ni de TypeScript.
- [ ] El canvas (800 × 500) se renderiza con fondo de dojo y los dos luchadores visibles.
- [ ] La pantalla idle muestra el título y el prompt «Pulsa ENTER para comenzar».
- [ ] Pulsar Enter muestra el árbitro con texto HAJIME durante 1 500 ms antes de empezar el combate.
- [ ] El luchador del jugador se mueve con ← → y no sale de los límites del canvas.
- [ ] Las 8 combinaciones de teclas activan la técnica correspondiente con hitbox visible.
- [ ] Un golpe limpio sin bloqueo suma 1 punto (o ½ para el barrido) al jugador.
- [ ] Un golpe con el bloqueo correcto activo no suma puntos y muestra el texto BLOCK.
- [ ] El árbitro muestra YAME al producirse un punto y los luchadores vuelven al centro.
- [ ] El combate termina cuando un luchador llega a 2 puntos; `onLevelChange` refleja el combate actual.
- [ ] Al terminar el tiempo sin 2 puntos, gana el que tiene más puntos; en empate el combate se repite.
- [ ] La IA cambia de modo (defensiva/neutral/agresiva) según la diferencia de puntos en el combate.
- [ ] La IA respeta el tiempo de reacción base según su modo más el jitter aleatorio.
- [ ] El HUD interno del canvas muestra timer, nombre + puntos + combates ganados de cada lado.
- [ ] El HUD React de la plataforma refleja score y nivel (número de combate) en tiempo real.
- [ ] El botón "PAUSA" de la plataforma detiene `update()` y el timer; "REANUDAR" lo reanuda.
- [ ] Las teclas P / Esc no provocan una pausa independiente del canvas.
- [ ] Al terminar los 3 combates, `onLivesChange(0)` y `onGameOver(score)` se disparan una sola vez.
- [ ] El score Supabase es la suma de todos los puntos del jugador en los 3 combates.
- [ ] El modal React de game over aparece con la puntuación final.
- [ ] El modal pre-rellena el nombre desde `av_player_name` de localStorage si existe.
- [ ] Al confirmar, el score se inserta en Supabase y el nombre se persiste en localStorage.
- [ ] El botón de guardar se deshabilita tras el primer envío (sin doble inserción).
- [ ] El botón "JUGAR DE NUEVO" remontar el canvas desde la pantalla idle.
- [ ] El score guardado aparece en `/games/karate-champ` y en `/hall-of-fame` al recargar.
- [ ] `npm run build` completa sin errores de TypeScript.
- [ ] Ninguna ruta existente devuelve 500.

---

## Decisions

- **Sí: Doble HUD** — el canvas conserva su HUD interno (timer, puntos, combates ganados)
  y React muestra los mismos valores en el HUD de la plataforma. Razón: coherencia con el
  patrón establecido en todos los juegos de la plataforma; el juego funciona visualmente como
  standalone dentro del canvas.

- **Sí: 1 vida** — Karate Champ no tiene vidas en el sentido clásico; la partida es una
  serie de 3 combates. Se modela como 1 vida que cae a 0 al finalizar la partida,
  independientemente de si el jugador gana o pierde. Razón: consistencia con el HUD estándar
  de la plataforma; igual que Tetris, Snake y Battleship.

- **Sí: victoria y derrota ambas disparan `onGameOver`** — tanto si el jugador gana
  como si pierde la partida se llama `onGameOver(score)`. Razón: la plataforma necesita
  un único punto de salida para mostrar el modal de guardar score; el resultado del combate
  queda registrado en el canvas antes de que el modal aparezca.

- **Sí: prop `mode`** — el componente `KarateChampGame` acepta `mode: 'classic' | 'tournament'`
  para ser reutilizado por el spec de torneo. Razón: evitar duplicar la lógica del motor de
  combate (hitboxes, técnicas, IA, dibujo de luchadores) en un segundo componente independiente.

- **Sí: delta-time en el game loop** — se usa `requestAnimationFrame` con `dt = currentTime - lastTime`.
  Razón: el movimiento de luchadores y el timer de combate deben ser frame-rate independent
  para funcionar igual en monitores de 60 Hz y 120 Hz.

- **Sí: ventana de combo `COMBO_WINDOW = 200 ms`** — la tecla de dirección abre una ventana
  de 200 ms durante la cual una pulsación de Z o X completa la combinación. Razón: permite
  presionar la dirección y el ataque sin milisegundos exactos de simultaneidad, lo que hace
  los controles jugables con teclado estándar.

- **Sí: hitbox activa 120 ms** — la hitbox de cada técnica permanece activa durante 120 ms.
  Razón: ventana suficiente para que la detección de colisión ocurra en varios frames sin
  que el atacante quede "congelado" en pose de ataque demasiado tiempo.

- **Sí: formas canvas primitivas para luchadores y árbitro** — no se usan imágenes externas.
  Razón: no existen sprites de karate en el proyecto; diseñar con primitivas mantiene el spec
  autocontenido y la implementación independiente de assets externos.

- **Sí: Play-page específica `app/games/karate-champ/play/page.tsx`** — en lugar de
  modificar la ruta genérica `[id]/play`. Razón: coherencia con todos los juegos de la
  plataforma; Next.js App Router da prioridad a rutas estáticas sobre dinámicas.

- **Sí: `dynamic(..., { ssr: false })`** — el componente canvas se carga solo en cliente.
  Razón: `canvas` y `requestAnimationFrame` no existen en el entorno Node.js de Next.js SSR.

- **No: Combate por tiempo limitado sin posibilidad de empate** — se permite el combate nulo
  (repeat) si hay empate al acabar el timer. Razón: fiel a la mecánica del Karate Champ
  original; evita mecánicas de desempate artificiales.

- **No: Selector de dificultad de la IA** — la dificultad es dinámica (tres modos según el
  marcador). Razón: YAGNI; un selector estático añade UI sin aportar mecánica nueva; la IA
  adaptativa ya ofrece variedad de desafío durante la partida.

- **No: Controles táctiles o mobile** — fuera de alcance en este spec.
  Razón: se pueden añadir mediante el agente `mobile-porter` en una corrida separada.

- **No: Supabase Auth y RLS** — `user_id` se guarda como `null`.
  Razón: consistencia con todos los juegos actuales de la plataforma.

- **No: Realtime en leaderboard** — los scores se ven al recargar.
  Razón: la complejidad de subscriptions no aporta valor mientras haya pocos jugadores activos.
