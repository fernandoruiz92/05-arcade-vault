# SPEC — Street Fighter II Survival (Modo Supervivencia Endless)

> **Estado:** Propuesto
> **Depende de:** 06-games-table-leaderboard-supabase, 01-street-fighter-classic
> **Fecha:** 2026-08-27
> **Objetivo:** Extender el componente `StreetFighterGame` con un modo de supervivencia
> endless en el que el jugador mantiene una única barra de vida a lo largo de combates
> consecutivos contra rivales infinitos, recibe bonificaciones aleatorias al vencer a cada
> rival y acumula un score basado en el número de rivales derrotados y el nivel de dificultad.

---

## Scope

**In:**

- Activar `mode="survival"` en el componente `StreetFighterGame` ya creado en el spec 01.
  Este spec NO crea un nuevo componente — extiende la rama `mode === 'survival'` del
  mismo componente.
- Crear `app/games/street-fighter/survival/page.tsx` — play-page dedicada al modo
  supervivencia con `dynamic(..., { ssr: false })` y `mode="survival"`.
- **Barra de vida única persistente**: el jugador elige un luchador en `'char-select'` y
  su HP inicial es `MAX_HP = 100`. Al vencer a un rival, el HP **no se reinicia** antes
  del siguiente combate. El jugador muere (game over) cuando su HP llega a 0 en cualquier
  momento.
- **Sin rondas** — cada enfrentamiento es un único combate a muerte (el primer KO termina
  el combate). No hay `roundIndex`, `playerRoundsWon` ni `cpuRoundsWon` en modo survival.
  Las constantes de ronda del modo clásico no se usan.
- **Rivales infinitos** — los oponentes se generan de forma procedural: el luchador del
  rival se elige aleatoriamente entre los 4 disponibles (`ryu`, `ken`, `chun-li`, `guile`)
  y su nivel de dificultad escala según la fórmula:
  `difficultyLevel = Math.min(8, Math.ceil(enemiesDefeated / 5) + 1)`
  (nivel 1 para los primeros 5 rivales, nivel 2 para los siguientes 5, etc., máx. nivel 8).
- **Sistema de bonificaciones** — al vencer a cada rival se ejecuta la fase `'bonus'`
  durante 2500 ms. Se muestra en canvas uno de los 3 bonos elegidos al azar con probabilidad
  uniforme (1/3 cada uno):

  | Bono              | ID               | Efecto                                                       |
  |-------------------|------------------|--------------------------------------------------------------|
  | Recuperación      | `'hp-restore'`   | Restaura el 20 % del HP máximo (clamp a `MAX_HP`)           |
  | Potencia          | `'damage-boost'` | Incrementa `damageMult` del jugador en +10 % para el siguiente combate (acumulable hasta 2.0×) |
  | Ímpetu Perfecto   | `'perfect-rush'` | El jugador es invencible durante 3000 ms al inicio del siguiente combate |

  - El bono se aplica al pasar a la fase del siguiente combate, no durante la fase `'bonus'`.
  - La fase `'bonus'` muestra: recuadro centrado con el nombre del bono, su descripción y
    un icono geométrico (triángulo, estrella o círculo dorado dibujado con primitivas canvas).
  - `perfectRushTimer` cuenta regresiva en ms; mientras sea > 0, cualquier impacto recibido
    por el jugador inflige 0 daño (invencibilidad total, sin chip damage).
- **Escalado de dificultad**:
  - `CPU_REACTION_MS[difficultyLevel]` y `CPU_AGGRESSION[difficultyLevel]` del spec 01 se
    reutilizan sin modificación.
  - Al alcanzar el nivel 3 de dificultad (a partir del rival 11), la IA CPU puede usar
    movimientos especiales con probabilidad del 20 % en cada decisión de ataque.
  - Al nivel 5 (rival 21+), la IA usa specials con probabilidad del 40 %.
- **Sistema de puntuación del modo survival**:
  - Al vencer a cada rival:
    `puntosGanados = (enemiesDefeated + 1) × 100 × difficultyLevel`
    donde `enemiesDefeated` es el contador antes de incrementar.
  - `totalScore += puntosGanados` y se llama `onScoreChange(totalScore)`.
  - `onLevelChange(difficultyLevel)` se llama cada vez que `difficultyLevel` cambia
    (es decir, cada 5 rivales).
- **Timer de combate en survival**: igual que en clásico, 90 s por combate. Si el timer
  llega a 0 y el CPU tiene más HP que el jugador, es game over (el jugador pierde el combate).
  Si el jugador tiene más HP, vence al rival (se trata como un KO del CPU).
- **Estado interno adicional** para el modo survival:

  ```ts
  interface SurvivalExtras {
    enemiesDefeated: number;
    difficultyLevel: number;
    damageMult: number;        // comienza en 1.0; incrementa con 'damage-boost'
    perfectRushTimer: number;  // ms de invencibilidad restantes
    pendingBonus: SurvivalBonus | null;
    bonusApplied: boolean;     // flag para aplicar el bono solo una vez
  }

  type SurvivalBonus = 'hp-restore' | 'damage-boost' | 'perfect-rush';
  ```

  El `StreetFighterGame` mantiene `survivalExtras` en el mismo `useRef` de estado cuando
  `mode === 'survival'`. Las ramas del game loop condicionadas con `if (mode === 'survival')`
  activan/desactivan las diferencias respecto al modo clásico.

- **Fase `'bonus'`** (solo mode survival):
  - Se activa tras el KO del CPU en lugar de `'match-end'`.
  - `phaseTimer = 2500 ms`. No acepta input del jugador.
  - Selecciona `pendingBonus` al azar en el momento de entrar a la fase.
  - Al terminar `phaseTimer`: aplica el bono y llama `loadNextSurvivalOpponent()`.

- **Función `loadNextSurvivalOpponent()`**:
  - Elige `fighterId` al azar entre los 4 luchadores.
  - Calcula nuevo `difficultyLevel`; si aumentó, llama `onLevelChange(difficultyLevel)`.
  - Reinicia `FighterState` del CPU con el nuevo config y HP = MAX_HP.
  - El HP del jugador NO se reinicia (persiste del combate anterior).
  - Aplica `pendingBonus`: hp-restore → `player.hp = Math.min(MAX_HP, player.hp + MAX_HP × 0.2)`;
    damage-boost → `survivalExtras.damageMult = Math.min(2.0, damageMult + 0.1)`;
    perfect-rush → `survivalExtras.perfectRushTimer = 3000`.
  - Pasa a fase `'pre-round'` con `displayText = 'RIVAL ' + (enemiesDefeated + 1)`.
    (Se reutiliza la fase `'pre-round'` del spec 01 para la animación de entrada.)

- **Indicadores HUD en modo survival**:
  - El HUD interno del canvas añade debajo de la barra HP del jugador:
    - Contador de rivales derrotados: `'Rivales: N'` en blanco pequeño.
    - Nivel de dificultad: `'Nivel: N'` en amarillo pequeño.
    - Si `perfectRushTimer > 0`: destello dorado parpadeante en el borde del canvas y texto
      `'RUSH!'` en amarillo junto al nombre del jugador.
    - Si `damageMult > 1.0`: icono `'⚡ ×N.N'` en naranja junto al nombre del jugador.

- **Game over en survival**: cuando `player.hp <= 0`:
  - `displayText = 'K.O.'` → fase `'round-end'` → fase `'gameover'` (sin `'match-end'`).
  - `onLivesChange(0)` → `onGameOver(totalScore)` (una sola vez, protegido con `gameOverFired`).

- Limpiar `keydown` y `keyup` de `document` en el `return` del `useEffect` (ya cubierto
  por el spec 01; esta branch no añade nuevos listeners).
- Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`,
  inserta en Supabase `{ game_id: 'street-fighter', player_name: name, score, user_id: null }`,
  persiste nombre. Botón de guardar se deshabilita tras el primer envío.

**Fuera de alcance:**

- Controles táctiles o mobile.
- Supabase Auth y RLS — `user_id` se almacena como `null`.
- Realtime en el leaderboard.
- Selector de dificultad inicial manual.
- Sistema de bonificaciones con más de 3 tipos.
- Bonificaciones que persistan más de un combate (excepto perfect-rush, que es temporal).
- Modo 2 jugadores.
- Tabla de Supabase separada para el modo survival — usa la misma tabla `scores` con `game_id = 'street-fighter'`.

---

## Data model

### INSERT en tabla `games`

No se añade una nueva fila. El modo survival es una variante del juego `street-fighter`
ya insertado en el spec 01. Los scores del modo survival se registran bajo el mismo
`game_id = 'street-fighter'` en la tabla `scores`.

### Props del componente (sin cambios de interfaz)

```ts
// Sin cambios respecto al spec 01 — la prop mode ya contempla 'survival'
interface StreetFighterGameProps {
  mode: 'classic' | 'survival';
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
}
```

### Tipos nuevos exclusivos del modo survival

```ts
type SurvivalBonus = 'hp-restore' | 'damage-boost' | 'perfect-rush';

interface SurvivalExtras {
  enemiesDefeated: number;   // contador de rivales vencidos
  difficultyLevel: number;   // nivel actual de IA (1-8)
  damageMult: number;        // multiplicador de daño acumulado del jugador (1.0-2.0)
  perfectRushTimer: number;  // ms de invencibilidad restantes
  pendingBonus: SurvivalBonus | null;
  bonusApplied: boolean;
}

interface BonusConfig {
  id: SurvivalBonus;
  name: string;
  description: string;
  iconColor: string;   // color del icono geométrico en canvas
}

const BONUS_CONFIGS: BonusConfig[] = [
  {
    id: 'hp-restore',
    name: 'RECUPERACIÓN',
    description: '+20% de vida máxima recuperada',
    iconColor: '#e74c3c',  // corazón/triángulo rojo
  },
  {
    id: 'damage-boost',
    name: 'POTENCIA',
    description: '+10% de daño durante el siguiente combate',
    iconColor: '#e67e22',  // estrella naranja
  },
  {
    id: 'perfect-rush',
    name: 'ÍMPETU PERFECTO',
    description: '3 segundos de invencibilidad al iniciar',
    iconColor: '#f1c40f',  // círculo dorado
  },
];
```

`SurvivalExtras` se inicializa en el `useRef` de estado del componente cuando
`mode === 'survival'`, junto al resto de `ClassicState`. No se introducen nuevas tablas
ni cambios en `lib/supabase/types.ts`.

---

## Implementation plan

1. **Añadir rama `survival` al componente `StreetFighterGame`** ya existente:

   1a. **Detección del modo en el game loop**
   - Al inicio de cada `update(dt)`: comprobar `mode`. Las ramas específicas de survival
     se ejecutan solo cuando `mode === 'survival'`.
   - El motor de combate (movimiento, hitboxes, proyectiles, física de salto, IA) es
     **idéntico** al del modo clásico — no duplicar código.

   1b. **Inicialización de `SurvivalExtras` en `'char-select'`**
   - Al confirmar personaje con Enter (función ya existente): si `mode === 'survival'`,
     inicializar `survivalExtras`:
     ```ts
     survivalExtras = {
       enemiesDefeated: 0,
       difficultyLevel: 1,
       damageMult: 1.0,
       perfectRushTimer: 0,
       pendingBonus: null,
       bonusApplied: false,
     };
     ```
   - Llamar `loadNextSurvivalOpponent()` en lugar de `loadOpponent(0)`.

   1c. **Función `loadNextSurvivalOpponent()`**
   - Seleccionar `fighterId` al azar: `FIGHTER_IDS[Math.floor(Math.random() * 4)]`.
   - Calcular `newLevel = Math.min(8, Math.ceil((survivalExtras.enemiesDefeated + 1) / 5))`.
   - Si `newLevel !== survivalExtras.difficultyLevel`:
     `survivalExtras.difficultyLevel = newLevel`; llamar `onLevelChange(newLevel)`.
   - Reiniciar `FighterState` del CPU: `hp = MAX_HP`, config del luchador aleatorio,
     color gris oscuro.
   - Si `survivalExtras.pendingBonus !== null && !survivalExtras.bonusApplied`:
     - `'hp-restore'`: `player.hp = Math.min(MAX_HP, player.hp + Math.floor(MAX_HP * 0.2))`.
     - `'damage-boost'`: `survivalExtras.damageMult = Math.min(2.0, survivalExtras.damageMult + 0.1)`.
     - `'perfect-rush'`: `survivalExtras.perfectRushTimer = 3000`.
     - `survivalExtras.bonusApplied = true`.
   - Poner `displayText = 'RIVAL ' + (survivalExtras.enemiesDefeated + 1)`.
   - Pasa a `'pre-round'` con `phaseTimer = 2000 ms`.

   1d. **Modificar `update(dt)` en `'fighting'` para modo survival**
   - El `damageMult` del jugador al calcular daño de ataques normales y specials:
     `daño = baseDamage × config.damageMult × survivalExtras.damageMult × ...`.
   - Si `survivalExtras.perfectRushTimer > 0`:
     - Decrementar `perfectRushTimer -= dt`.
     - Todo daño recibido por el jugador (incluyendo chip damage y proyectiles) se descarta.
   - Timer de ronda: si el timer llega a 0 y `player.hp < cpu.hp` → game over (KO del jugador).

   1e. **Al KO del CPU en `'round-end'` (modo survival)**
   - En lugar de pasar a `'match-end'`: incrementar `survivalExtras.enemiesDefeated`.
   - Calcular `puntosGanados = survivalExtras.enemiesDefeated × 100 × survivalExtras.difficultyLevel`.
   - `totalScore += puntosGanados`; llamar `onScoreChange(totalScore)`.
   - Seleccionar bono al azar: `pendingBonus = BONUS_CONFIGS[Math.floor(Math.random() * 3)].id`.
   - `bonusApplied = false`.
   - Pasar a fase `'bonus'` con `phaseTimer = 2500 ms`.

   1f. **Al KO del jugador en `'round-end'` (modo survival)**
   - Pasar directamente a `'gameover'` sin fase `'match-end'`.
   - Disparar `onLivesChange(0)` → `onGameOver(totalScore)` (protegido con `gameOverFired`).

   Verificación: tras vencer al primer rival en modo survival, el HP del jugador no se
   reinicia; aparece la pantalla de bono 2.5 s; el bono elegido se aplica al siguiente combate;
   el score sube con cada rival vencido; la dificultad de la IA aumenta cada 5 rivales.

2. **Renderizado de la fase `'bonus'`**

   2a. **`draw()` en fase `'bonus'`**
   - Fondo: rectángulo semitransparente negro (`rgba(0,0,0,0.75)`) sobre el último frame del combate.
   - Recuadro central (400 × 240 px centrado): borde del color `iconColor` del bono, fondo `#1a1a2e`.
   - Título `'¡BONO OBTENIDO!'` en blanco, fuente 20 px monospace, centrado arriba.
   - Icono geométrico según el bono:
     - `'hp-restore'`: triángulo isósceles relleno de `#e74c3c` (30 px de base), centrado.
     - `'damage-boost'`: estrella de 5 puntas de `#e67e22` (radio 25 px), dibujada con
       trazado de ángulos `2π/5`.
     - `'perfect-rush'`: círculo de radio 28 px relleno de `#f1c40f` con halo parpadeante
       (opacidad alterna entre 0.5 y 1.0 cada 250 ms según `Math.floor(Date.now() / 250) % 2`).
   - Nombre del bono en el color `iconColor`, fuente `bold 24px monospace`, centrado.
   - Descripción del bono en blanco, fuente `14px monospace`, centrado debajo.
   - Barra de progreso horizontal (200 × 8 px, borde blanco, relleno del color `iconColor`)
     que se reduce de izquierda a derecha proporcionalmente a `phaseTimer / 2500`.
   - Contador de rivales derrotados `'Rivales: N'` en la esquina inferior derecha del canvas.

   Verificación: la pantalla de bono es legible; el icono correcto aparece según el bono
   aleatorio; la barra de progreso se consume en 2.5 s y el siguiente combate comienza solo.

3. **Modificar el HUD interno del canvas para modo survival**

   3a. **Indicadores adicionales en la franja HUD superior** (solo `mode === 'survival'`):
   - Debajo de la barra HP del jugador (y=55 px):
     - `'Rivales: ' + survivalExtras.enemiesDefeated` en blanco, fuente `12px monospace`.
     - `'Nivel: ' + survivalExtras.difficultyLevel` en `#f1c40f`, fuente `12px monospace`,
       a continuación con 20 px de separación.
   - Si `survivalExtras.perfectRushTimer > 0`:
     - Texto `'RUSH!'` parpadeante (misma técnica de alternancia 250 ms) en `#f1c40f`
       a la derecha del nombre del jugador.
     - Borde del canvas pulsante: `strokeRect(2, 2, W-4, H-4)` con color `rgba(241,196,15,alpha)`
       donde `alpha` alterna entre 0.3 y 0.8 cada 200 ms.
   - Si `survivalExtras.damageMult > 1.0`:
     - Texto `'×' + survivalExtras.damageMult.toFixed(1)` en `#e67e22` junto a los indicadores
       de rivales y nivel.

   Verificación: el HUD survival muestra contador de rivales, nivel de IA y multiplicador
   de daño correctamente; RUSH! parpadea durante 3 s al inicio del combate con perfect-rush.

4. **Crear `app/games/street-fighter/survival/page.tsx`** — play-page del modo survival:
   - Importa `StreetFighterGame` con `dynamic(..., { ssr: false })`.
   - Pasa la prop `mode="survival"` al componente.
   - Estado local: `score`, `lives` (inicial `1`), `level` (inicial `1`), `paused`, `over`,
     `name`, `saved`, `gameKey`.
   - Pasa `paused` y los cuatro callbacks a `StreetFighterGame`.
   - Reutiliza el layout visual de la plataforma (HUD React + CRT + modal game over).
   - HUD React muestra: Score acumulado, Nivel de IA actual (via `onLevelChange`).
     (No muestra "vidas" ya que el modo survival es con vida única.)
   - Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`;
     al confirmar, guarda en `localStorage` e inserta en Supabase
     `{ game_id: 'street-fighter', player_name: name, score, user_id: null }`.
   - Botón de guardar se deshabilita tras el primer envío.
   - Botón «JUGAR DE NUEVO» incrementa `gameKey` para remontar el componente.
   Verificación: navegar a `/games/street-fighter/survival` carga la play-page sin errores;
   tras una partida el score aparece en `/games/street-fighter` y `/hall-of-fame` al recargar.

5. **Verificación final** — `npm run build` termina sin errores de TypeScript.
   Ninguna ruta existente devuelve 500. La play-page del modo clásico (`/play`) no se ve
   afectada por los cambios del modo survival.

---

## Acceptance criteria

- [ ] La ruta `/games/street-fighter/survival` carga sin errores de SSR ni de TypeScript.
- [ ] El canvas muestra la pantalla de selección de personaje al entrar a la ruta survival.
- [ ] Al confirmar personaje, comienza el primer combate contra un rival aleatorio de los 4.
- [ ] El HP del jugador NO se reinicia entre combates (persiste del combate anterior).
- [ ] El HP del CPU sí se reinicia a MAX_HP al inicio de cada nuevo rival.
- [ ] Cada combate en survival tiene un único round (no hay rondas ganadas/perdidas).
- [ ] Al vencer al rival, aparece la pantalla de bono durante 2.5 s antes del siguiente combate.
- [ ] Los 3 tipos de bono (`hp-restore`, `damage-boost`, `perfect-rush`) pueden aparecer.
- [ ] El bono `hp-restore` restaura exactamente el 20 % de MAX_HP (sin superar MAX_HP).
- [ ] El bono `damage-boost` incrementa el daño del jugador en +10 % (verificable: golpe ligero base 7 HP → 7.7 HP tras un boost).
- [ ] El multiplicador de daño no supera 2.0× aunque se acumulen varios `damage-boost`.
- [ ] El bono `perfect-rush` hace al jugador completamente invulnerable durante 3 s (0 daño recibido, incluyendo chip damage y proyectiles).
- [ ] El temporizador de invencibilidad `perfectRushTimer` decrementa correctamente y el jugador vuelve a ser vulnerable al terminar.
- [ ] La dificultad de la IA aumenta cada 5 rivales derrotados (nivel 1 para rivales 1-5, nivel 2 para 6-10, etc.).
- [ ] `onLevelChange(n)` se dispara solo cuando el nivel de IA cambia (no en cada rival).
- [ ] La IA CPU usa movimientos especiales a partir del rival 11 (nivel 3) con probabilidad del 20 %.
- [ ] La IA CPU usa movimientos especiales con probabilidad del 40 % a partir del rival 21 (nivel 5).
- [ ] El score se calcula como `enemiesDefeated × 100 × difficultyLevel` por rival vencido.
- [ ] `onScoreChange` se llama tras cada rival vencido con el score acumulado correcto.
- [ ] El timer de ronda (90 s) sigue funcionando en modo survival; si acaba con CPU con más HP, es game over.
- [ ] El icono del bono en la pantalla de bono es el correcto para cada tipo.
- [ ] La barra de progreso de la pantalla de bono se consume en 2.5 s y el siguiente combate comienza automáticamente.
- [ ] El HUD interno del canvas muestra el contador de rivales derrotados y el nivel actual en modo survival.
- [ ] El texto `'RUSH!'` parpadea en el HUD cuando `perfectRushTimer > 0`.
- [ ] El multiplicador de daño `×N.N` aparece en el HUD cuando `damageMult > 1.0`.
- [ ] Al llegar a HP 0, aparece `'K.O.'` y luego la fase `'gameover'` (sin fase `'match-end'`).
- [ ] `onLivesChange(0)` y `onGameOver(score)` se disparan una sola vez al perder.
- [ ] El modal React de game over aparece con la puntuación final en modo survival.
- [ ] El modal pre-rellena el nombre desde `av_player_name` de localStorage si existe.
- [ ] Al confirmar, el score se inserta en Supabase bajo `game_id = 'street-fighter'`.
- [ ] El botón de guardar se deshabilita tras el primer envío.
- [ ] El botón «JUGAR DE NUEVO» remontar el canvas volviendo a la pantalla de selección.
- [ ] El mode clásico (`/games/street-fighter/play`) no se ve afectado por los cambios del survival.
- [ ] `npm run build` completa sin errores de TypeScript.
- [ ] Ninguna ruta existente devuelve 500.

---

## Decisions

- **Sí: extensión del mismo componente via prop `mode`** — el modo survival no crea un
  nuevo componente sino que añade ramas condicionales al `StreetFighterGame` existente.
  Razón: el motor de combate (hitboxes, física, IA, render de luchadores) es idéntico entre
  modos; duplicarlo violaría DRY y desincronizaría mantenimiento futuro.

- **Sí: play-page separada `/survival/page.tsx`** — ruta específica independiente de la
  play-page del modo clásico. Razón: cada modo tiene su propio HUD React, URL canónica y
  contexto de juego; compartir la misma ruta añadiría lógica condicional de URL innecesaria.

- **Sí: mismo `game_id = 'street-fighter'` para ambos modos** — los scores de survival
  se registran bajo el mismo juego. Razón: simplifica el schema de Supabase; ambos modos
  compiten en el mismo leaderboard, lo cual es deseable para maximizar actividad en la tabla.

- **Sí: HP persistente entre combates** — la barra de vida no se reinicia.
  Razón: es la mecánica definitoria del modo survival; sin ella, el modo sería
  funcionalmente idéntico al clásico con oponentes infinitos.

- **Sí: 3 bonos con probabilidad uniforme 1/3** — elección completamente aleatoria sin
  ponderación. Razón: YAGNI; un sistema ponderado añadiría constantes sin mejorar el
  balance percibido durante la implementación inicial.

- **Sí: acumulación de `damage-boost` con techo de 2.0×** — el multiplicador de daño
  puede incrementarse con cada rival vencido pero tiene un límite.
  Razón: sin techo el jugador podría matar rivales en 1 golpe a partir de cierto punto,
  eliminando la tensión de la mecánica de combate.

- **Sí: `perfect-rush` dura exactamente 3000 ms** — la invencibilidad temporal permite
  al jugador iniciar el nuevo combate sin riesgo, independientemente de cuánto HP le quede.
  Razón: mecánica de recuperación de alto riesgo; al igual que el Super de Street Fighter,
  el timing de uso importa incluso si aquí se aplica automáticamente al inicio.

- **Sí: invencibilidad total (0 daño, incluyendo chip)** durante `perfect-rush`.
  Razón: el chip damage persiste incluso bloqueando; anularlo durante el rush diferencia
  claramente el bono de los otros dos y premia al jugador con agresividad en esos 3 s.

- **Sí: la IA usa specials a partir del nivel 3** — a partir del rival 11 la IA puede
  lanzar movimientos especiales. Razón: la dificultad percibida debe aumentar con
  nuevas mecánicas y no solo con velocidad de reacción; los specials de la IA añaden
  variedad sin introducir comportamientos nuevos en el motor ya implementado.

- **Sí: pantalla de bono 2.5 s sin input del jugador** — el bono no se elige, se asigna
  al azar. Razón: simplifica la UX del modo survival; la elección estratégica de bono
  añadiría menús de UI que ralentizan el ritmo endless del modo.

- **Sí: 1 vida** — el modo survival es una mecánica de vida única por definición.
  `onLivesChange(1)` al iniciar, `onLivesChange(0)` → `onGameOver` al morir.
  Razón: consistencia con el HUD estándar de la plataforma.

- **No: tabla Supabase separada para survival** — no se añade una fila nueva en `games`
  ni una tabla nueva para stats de survival. Razón: el schema actual es suficiente;
  la diferenciación de modos puede hacerse en el cliente sin cambios en la DB.

- **No: controles táctiles o mobile** — fuera de alcance.
  Razón: se añaden mediante `mobile-porter` en una corrida separada.

- **No: Supabase Auth y RLS** — `user_id` se guarda como `null`.
  Razón: consistencia con todos los juegos actuales de la plataforma.

- **No: Realtime en leaderboard** — los scores se ven al recargar.
  Razón: la complejidad de subscriptions no aporta valor mientras haya pocos jugadores activos.
