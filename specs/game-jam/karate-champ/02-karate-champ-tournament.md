# SPEC — Karate Champ Tournament (modo torneo con rivales progresivos y power-ups)

> **Estado:** Propuesto
> **Depende de:** 06-games-table-leaderboard-supabase
> **Fecha:** 2026-08-26
> **Objetivo:** Implementar una variante de torneo de Karate Champ donde el jugador
> enfrenta cuatro rivales de dificultad progresiva, completa secuencias de kata entre
> combates para obtener puntos bonus y aprovecha power-ups temporales que aparecen en el dojo.

---

## Scope

**In:**

- INSERT SQL para añadir la fila `karate-champ-tournament` a la tabla `games` en Supabase.
- Reutilizar `components/games/KarateChampGame.tsx` (definido en `01-karate-champ-classic.md`)
  pasando `mode="tournament"`. Este spec documenta la lógica exclusiva de `mode === 'tournament'`
  que debe añadirse al componente.
- **Cuatro rivales en secuencia**:
  | # | Nombre          | Tiempo reacción (ms) | Agresividad |
  |---|-----------------|----------------------|-------------|
  | 1 | Discípulo       | 500                  | 25 %        |
  | 2 | Cinturón Marrón | 350                  | 45 %        |
  | 3 | Sensei          | 220                  | 65 %        |
  | 4 | Gran Maestro    | 130                  | 85 %        |
  - Cada rival tiene un estilo de color diferente en el canvas (Discípulo: verde,
    Cinturón Marrón: marrón, Sensei: gris, Gran Maestro: negro).
  - La IA de cada rival siempre actúa en el tiempo de reacción fijo de su nivel
    (sin jitter dinámico según marcador como en classic); la agresividad define la
    probabilidad de ataque en cada decisión.
  - Perder un combate (la IA acumula 2 puntos) consume 1 vida y reinicia el combate
    contra el mismo rival. Las vidas del jugador no se reinician entre rivales.
- **Sistema de vidas**: 3 vidas. Se pierde 1 vida cuando la IA gana el combate.
  Con 0 vidas → game over. `onLivesChange(lives)` se llama en cada pérdida.
- **Pantalla de Kata Bonus entre rivales** (no entre combates del mismo rival):
  - Duración: 10 segundos.
  - El canvas muestra una secuencia de 5 iconos de técnica en orden; el jugador debe
    ejecutar cada técnica en el orden correcto usando las combinaciones del spec core.
  - Cada técnica correcta suma +200 puntos; las incorrectas o el tiempo agotado no penalizan.
  - Pantalla de resultado del kata: +N × 200 pts mostrado 1 500 ms antes de pasar al
    siguiente rival.
  - `onScoreChange` se llama tras sumar los bonus de kata.
- **Power-ups temporales** que aparecen aleatoriamente en el dojo durante la fase fighting:
  | Power-up     | Icono canvas          | Efecto                              | Duración |
  |--------------|-----------------------|-------------------------------------|----------|
  | Speed        | Rayo amarillo (▲)     | Velocidad de movimiento × 1.5       | 15 000 ms |
  | Iron Fist    | Puño naranja (◉)      | Cualquier golpe vale 1 pt (no ½)    | 10 000 ms |
  | Mirror Shield| Escudo azul (◈)       | Bloqueo automático de todos los golpes | 8 000 ms |
  - Un power-up aparece en una posición X aleatoria del suelo (`FLOOR_Y - 20`) entre
    30 s y 60 s tras el inicio del combate (temporizador aleatorio por combate).
  - Solo puede haber un power-up activo en el canvas al mismo tiempo.
  - El jugador lo recoge al solapar su hitbox de cuerpo con el rectángulo del power-up (40 × 40 px).
  - Si el timer del combate llega a 0 antes de recogerlo, el power-up desaparece.
  - Un power-up activo se indica en el HUD interno del canvas con un icono y una barra de
    duración que se vacía en tiempo real.
- **Bonus de velocidad de inicio de combate**: el primer golpe limpio del jugador en los
  primeros 500 ms tras el HAJIME suma +50 puntos adicionales (mostrado como «FAST STRIKE +50»).
- **Scoring acumulativo**:
  - Puntos de golpes: igual que en classic (1 pt por golpe limpio, ½ pt por barrido).
  - Bonus de kata: +200 por cada técnica correcta (máx. +1 000 por sección de kata).
  - Bonus de velocidad: +50 por primer golpe en <500 ms tras HAJIME.
  - Al final del torneo o al game over, `onGameOver(totalScore)` recibe la suma de todo.
- **Pantalla de victoria de torneo**: si el jugador vence al Gran Maestro (rival 4),
  el canvas muestra «CAMPEÓN DEL TORNEO» con el score final antes de llamar `onGameOver`.
- `onLevelChange(n)` se llama al inicio de cada enfrentamiento con un nuevo rival (valores 1-4).
- La pausa se controla exclusivamente vía prop `paused`; congela `update()`, el timer de
  combate, los timers de power-up y la pantalla de kata.
- Limpiar los event listeners de `keydown` y `keyup` de `document` en el `return` del `useEffect`.
  (La limpieza de listeners ya está definida en el spec core; este spec no la duplica.)
- Crear `app/games/karate-champ-tournament/play/page.tsx` — play-page específica con
  `dynamic(..., { ssr: false })`.
- Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`,
  inserta en Supabase `{ game_id: 'karate-champ-tournament', player_name: name, score, user_id: null }`,
  persiste nombre en `localStorage`. Botón de guardar se deshabilita tras el primer envío.

**Fuera de alcance:**

- Controles táctiles o mobile.
- Supabase Auth y RLS — `user_id` se almacena como `null`.
- Realtime en el leaderboard.
- Nuevas técnicas más allá de las 8 definidas en el spec core.
- Selector de personaje o skin del luchador.
- Efectos de sonido — se cubren en un spec separado si se desea.
- Modo dos jugadores o multijugador.
- Power-ups que afecten a la IA (todos los power-ups son exclusivos para el jugador).
- Estadísticas post-partida detalladas (precisión de golpes, tiempo por combate, etc.).

---

## Data model

### INSERT en tabla `games`

```sql
INSERT INTO games (id, title, short, long, cat, cover, color)
VALUES (
  'karate-champ-tournament',
  'KARATE CHAMP TOURNAMENT',
  'Supera cuatro rivales y conviértete en campeón del torneo.',
  'Vence a cuatro oponentes de dificultad creciente —del Discípulo al Gran Maestro— ejecutando técnicas precisas y aprovechando power-ups que aparecen en el tatami. Entre combates, completa secuencias de kata para sumar puntos bonus.',
  'FIGHTING',
  'cover-karate-champ-tournament',
  'gold'
);
```

### Props del componente `KarateChampGame` (modo tournament)

```ts
// El mismo componente KarateChampGame.tsx definido en el spec core.
// La prop mode='tournament' activa la lógica adicional de este spec.
interface KarateChampGameProps {
  mode: 'classic' | 'tournament';
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
}
```

El estado local arranca con `lives = 3`, `score = 0`, `level = 1` cuando `mode === 'tournament'`.
`onLivesChange` se llama con el valor actualizado tras cada derrota en un combate.
`onLivesChange(0)` se dispara justo antes de `onGameOver(score)` al agotar vidas o al terminar el torneo.
`onLevelChange(n)` se dispara al iniciar el enfrentamiento con cada nuevo rival (1, 2, 3 o 4).

No se introducen nuevas tablas ni tipos TypeScript — se reutilizan `GameRow` y `ScoreRow`
de `lib/supabase/types.ts`.

---

## Implementation plan

1. **INSERT en Supabase** — ejecutar el SQL del data model en el SQL Editor de Supabase.
   Verificación: la fila `karate-champ-tournament` aparece en el Table Editor; `/games` muestra
   la card con cover `cover-karate-champ-tournament` y color `gold`.

2. **Extender `components/games/KarateChampGame.tsx` con lógica de torneo** —
   añadir dentro del bloque condicional `if (mode === 'tournament')` o mediante estado
   interno bifurcado por `mode`:

   2a. **Constantes de torneo** (añadir a las constantes de módulo del spec core)
   ```ts
   const RIVALS = [
     { name: 'Discípulo',        color: '#2d6a2d', reactionMs: 500, aggressiveness: 0.25 },
     { name: 'Cinturón Marrón',  color: '#7a4a1a', reactionMs: 350, aggressiveness: 0.45 },
     { name: 'Sensei',           color: '#555555', reactionMs: 220, aggressiveness: 0.65 },
     { name: 'Gran Maestro',     color: '#111111', reactionMs: 130, aggressiveness: 0.85 },
   ] as const;
   const KATA_DURATION = 10_000;            // ms
   const KATA_SEQUENCE_LENGTH = 5;
   const KATA_BONUS_PER_TECHNIQUE = 200;    // puntos
   const FAST_STRIKE_WINDOW = 500;          // ms tras HAJIME
   const FAST_STRIKE_BONUS = 50;            // puntos
   const POWERUP_APPEAR_MIN = 30_000;       // ms mínimo tras inicio del combate
   const POWERUP_APPEAR_MAX = 60_000;       // ms máximo tras inicio del combate
   const POWERUP_SIZE = 40;                 // px (cuadrado)
   const POWERUP_TYPES = ['speed', 'iron-fist', 'mirror-shield'] as const;
   type PowerUpType = typeof POWERUP_TYPES[number];
   const POWERUP_DURATION: Record<PowerUpType, number> = {
     'speed':          15_000,
     'iron-fist':      10_000,
     'mirror-shield':  8_000,
   };
   ```

   2b. **Extensión del modelo de datos interno** (añadir campos al `MatchState` del spec core)
   ```ts
   interface TournamentState {
     rivalIndex: number;                   // 0-3, rival actual
     rivalLives: 1;                        // alias: cada combate contra el mismo rival
     tournamentPhase:
       | 'idle' | 'fighting' | 'kata-bonus' | 'kata-result' | 'victory' | 'gameover';
     kataSequence: TechniqueId[];          // 5 técnicas generadas aleatoriamente
     kataPlayerInput: TechniqueId[];       // técnicas ejecutadas por el jugador
     kataTimer: number;                    // ms restantes para completar el kata
     powerUp: {
       type: PowerUpType;
       x: number;
       visible: boolean;                   // false hasta que aparece
       appearTimer: number;                // ms hasta aparecer
     } | null;
     activePowerUp: {
       type: PowerUpType;
       timer: number;                      // ms restantes de efecto
     } | null;
     fastStrikeEligible: boolean;          // true durante los primeros 500 ms tras HAJIME
     fastStrikeFired: boolean;             // true si ya se aplicó el bonus en este combate
     totalScore: number;
   }
   ```

   2c. **Adaptación de la IA en modo tournament**
   - La selección de `RIVALS[rivalIndex]` determina `reactionMs` y `aggressiveness`.
   - En cada tick de decisión (`aiActionTimer` llegó a 0):
     - Genera `Math.random()`: si < `aggressiveness`, elige una técnica de ataque aleatoria;
       si ≥ `aggressiveness`, elige bloqueo o movimiento de repositionamiento.
     - Reinicia `aiActionTimer = rival.reactionMs` (sin jitter; dificultad fija por nivel).
   - Si `activePowerUp?.type === 'mirror-shield'`, cualquier golpe de la IA es bloqueado
     automáticamente (no resta puntos al jugador) sin importar qué bloqueo tenga activo.

   2d. **Lógica de derrota en combate (pérdida de vida)**
   - Cuando la IA acumula 2 puntos en el combate:
     - `lives -= 1`; llama `onLivesChange(lives)`.
     - Si `lives <= 0`: pasa a `'gameover'` → llama `onLivesChange(0)`, `onGameOver(totalScore)`.
     - Si `lives > 0`: reinicia el combate contra el mismo rival (misma `rivalIndex`);
       los puntos de combate se resetean; el timer vuelve a 60 s; el árbitro muestra HAJIME.
   - Cuando el jugador acumula 2 puntos en el combate:
     - Suma `player.combatPoints` a `totalScore`; llama `onScoreChange(totalScore)`.
     - Si `rivalIndex < 3`: pasa a `'kata-bonus'` con el siguiente rival ya preparado.
     - Si `rivalIndex === 3`: pasa a `'victory'`.

   2e. **Pantalla de Kata Bonus**
   - Al entrar en `'kata-bonus'`:
     - Genera `kataSequence`: array de 5 técnicas de ataque elegidas aleatoriamente de las
       5 técnicas ofensivas (puñetazo alto, puñetazo bajo, patada alta, patada baja, barrido).
     - Resetea `kataPlayerInput = []`; `kataTimer = KATA_DURATION`.
   - `draw()` en `'kata-bonus'`:
     - Fondo de dojo tenue; texto «KATA BONUS — 10 s» en la parte superior.
     - Muestra los 5 iconos de técnica en la secuencia (rectángulos con texto abreviado:
       «P.ALT», «P.BAJ», «K.ALT», «K.BAJ», «BARR»). Las técnicas ya ejecutadas
       correctamente se resaltan en verde; la siguiente a ejecutar parpadea.
     - Timer de kata (barra horizontal que se vacía).
   - `update(dt)` en `'kata-bonus'`:
     - Decrementa `kataTimer` por `dt`. Al llegar a 0: pasa a `'kata-result'`.
     - Al detectar una técnica ejecutada por el jugador (via combinación de teclas):
       - Si coincide con `kataSequence[kataPlayerInput.length]`: añade a `kataPlayerInput`,
         suma `KATA_BONUS_PER_TECHNIQUE` a `totalScore`, llama `onScoreChange(totalScore)`.
       - Si no coincide: no penaliza, no añade a `kataPlayerInput`.
       - Si `kataPlayerInput.length === KATA_SEQUENCE_LENGTH`: pasa a `'kata-result'`.
   - `'kata-result'` (1 500 ms):
     - Muestra «KATA COMPLETADO» o «KATA FALLADO» + puntos ganados.
     - Al terminar: incrementa `rivalIndex`; llama `onLevelChange(rivalIndex + 1)`; pasa
       a fase de combate (`'hajime'`) con el nuevo rival.

   2f. **Power-ups**
   - Al inicio de cada combate en modo tournament: genera un `powerUp` con:
     - `type`: aleatorio entre los 3 tipos.
     - `x`: aleatorio entre `FIGHTER_W + POWERUP_SIZE` y `W - FIGHTER_W - POWERUP_SIZE`.
     - `visible = false`.
     - `appearTimer`: aleatorio entre `POWERUP_APPEAR_MIN` y `POWERUP_APPEAR_MAX`.
   - `update(dt)` durante `'fighting'`:
     - Si `powerUp && !powerUp.visible`: decrementa `powerUp.appearTimer` por `dt`;
       cuando llega a 0, `powerUp.visible = true`.
     - Si `powerUp.visible` y el cuerpo del jugador (AABB `FIGHTER_W × FIGHTER_H`) solapa
       con el rectángulo del power-up (`POWERUP_SIZE × POWERUP_SIZE` en `powerUp.x, FLOOR_Y - POWERUP_SIZE`):
       - Activa `activePowerUp = { type: powerUp.type, timer: POWERUP_DURATION[powerUp.type] }`.
       - Aplica efecto inmediato:
         - `'speed'`: multiplica `MOVE_SPEED` efectivo por 1.5 mientras `activePowerUp` esté activo.
         - `'iron-fist'`: el barrido cuenta como 1 pt completo (no ½) mientras esté activo.
         - `'mirror-shield'`: cualquier golpe de la IA es bloqueado automáticamente.
       - Elimina `powerUp` (pone a `null`).
     - Si `activePowerUp`: decrementa `activePowerUp.timer` por `dt`; cuando llega a 0,
       desactiva el efecto y pone `activePowerUp = null`.
   - `draw()`: si `powerUp.visible`, dibuja el icono del power-up sobre el suelo:
     - `'speed'`: triángulo amarillo apuntando hacia arriba dentro de un cuadrado dorado.
     - `'iron-fist'`: círculo naranja con punto central.
     - `'mirror-shield'`: rombo azul con línea horizontal.
   - HUD interno en la franja superior: si `activePowerUp !== null`, dibuja el icono
     del tipo activo (16 × 16 px) seguido de una barra de duración (verde → rojo) a la
     derecha del marcador del jugador.

   2g. **Bonus de velocidad de inicio**
   - Al entrar en fase `'fighting'` (tras HAJIME): `fastStrikeEligible = true`, `fastStrikeFired = false`.
   - Decrementa un contador interno `fastStrikeWindow` desde `FAST_STRIKE_WINDOW` ms.
     Cuando llega a 0: `fastStrikeEligible = false`.
   - Si el jugador conecta un golpe limpio mientras `fastStrikeEligible && !fastStrikeFired`:
     - Suma `FAST_STRIKE_BONUS` a `totalScore`; llama `onScoreChange(totalScore)`.
     - `fastStrikeFired = true`.
     - Muestra texto flotante «FAST STRIKE +50» en el canvas durante 1 000 ms.

   2h. **Pantalla de victoria de torneo**
   - Fase `'victory'`: canvas muestra fondo rojo dorado oscuro, texto «CAMPEÓN DEL TORNEO»
     centrado en grande, score total debajo. `phaseTimer = 3 000` ms.
   - Al terminar el timer: llama `onScoreChange(totalScore)`, `onLivesChange(0)`,
     `onGameOver(totalScore)`.

   2i. **Render del dojo en modo tournament**
   - El color del luchador IA cambia según `RIVALS[rivalIndex].color`.
   - El nombre del rival actual se muestra en el HUD interno (zona derecha) en lugar de «CPU».
   - Los combates ganados del jugador sobre ese rival (puede ser 0 en cada nuevo enfrentamiento)
     se muestran normalmente.
   - El número de vidas restantes del jugador se dibuja como iconos de cinturón negro (●)
     en la zona inferior izquierda del HUD.

   Verificación: al iniciar modo tournament el primer rival es el Discípulo (verde, lento);
   al vencerlo aparece la pantalla de Kata Bonus con 5 técnicas; al completar el kata el
   Cinturón Marrón comienza el enfrentamiento; los power-ups aparecen sobre el suelo del
   dojo y se recogen al pisarlos; perder un combate resta 1 vida y reinicia el combate.

3. **Crear `app/games/karate-champ-tournament/play/page.tsx`** — play-page específica:
   - Importa `KarateChampGame` con `dynamic(..., { ssr: false })`.
   - Pasa la prop `mode="tournament"` al componente.
   - Estado local: `score`, `lives` (inicial `3`), `level` (inicial `1`), `paused`, `over`,
     `name`, `saved`, `gameKey`.
   - Pasa `paused` y los cuatro callbacks a `KarateChampGame`.
   - Reutiliza el layout visual de la plataforma (HUD React + CRT + modal game over),
     igual que las play-pages de los demás juegos.
   - Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`;
     al confirmar, guarda en `localStorage` e inserta en Supabase
     `{ game_id: 'karate-champ-tournament', player_name: name, score, user_id: null }`.
   - Botón de guardar se deshabilita tras el primer envío.
   - Botón «JUGAR DE NUEVO» incrementa `gameKey` para remontar el componente canvas.
     Verificación: el HUD React refleja score, vidas y rival actual (nivel) en tiempo real;
     tras una partida el score aparece en `/games/karate-champ-tournament` y en `/hall-of-fame`.

4. **Verificación final** — `npm run build` termina sin errores de TypeScript.
   Ninguna ruta existente devuelve 500.

---

## Acceptance criteria

- [ ] La fila `karate-champ-tournament` existe en la tabla `games` de Supabase con los valores del data model.
- [ ] La card aparece en `/games` con cover `cover-karate-champ-tournament` y color `gold`.
- [ ] La ruta `/games/karate-champ-tournament/play` carga sin errores de SSR ni de TypeScript.
- [ ] El canvas (800 × 500) se renderiza con el fondo de dojo y los dos luchadores.
- [ ] El primer rival es el Discípulo, dibujado en verde, con tiempo de reacción de 500 ms y agresividad del 25 %.
- [ ] Al vencer al Discípulo aparece la pantalla de Kata Bonus con 5 técnicas en secuencia.
- [ ] El kata muestra un timer de 10 segundos que se vacía en tiempo real.
- [ ] Ejecutar la técnica correcta en el orden correcto resalta el icono en verde y suma +200 pts.
- [ ] Ejecutar una técnica incorrecta no penaliza ni avanza la secuencia.
- [ ] Al completar el kata o agotar el tiempo, se muestra el resultado 1 500 ms y luego inicia el Cinturón Marrón.
- [ ] `onLevelChange(2)` se llama al iniciar el enfrentamiento con el Cinturón Marrón.
- [ ] Los cuatro rivales se enfrentan en orden: Discípulo → Cinturón Marrón → Sensei → Gran Maestro.
- [ ] Cada rival tiene su color de luchador y nombre en el HUD correctos.
- [ ] La agresividad de la IA aumenta con cada rival (el Gran Maestro ataca el 85 % de las decisiones).
- [ ] El tiempo de reacción de la IA disminuye con cada rival (Gran Maestro: 130 ms, sin jitter).
- [ ] Perder un combate (IA llega a 2 puntos) resta 1 vida; `onLivesChange` se llama con el valor actualizado.
- [ ] Perder 3 vidas dispara `onLivesChange(0)` y `onGameOver(score)`.
- [ ] Al agotar vidas, el game over se produce desde cualquier rival (no solo el último).
- [ ] Un power-up aparece sobre el suelo del dojo entre 30 s y 60 s tras el inicio del combate.
- [ ] Solo hay un power-up visible en el canvas al mismo tiempo.
- [ ] Al solapar el cuerpo del jugador con el power-up, este desaparece y el efecto se activa.
- [ ] Speed: la velocidad de movimiento del jugador aumenta ×1.5 durante 15 s.
- [ ] Iron Fist: el barrido suma 1 pt completo (no ½) durante 10 s.
- [ ] Mirror Shield: los golpes de la IA son bloqueados automáticamente durante 8 s.
- [ ] El HUD interno muestra el icono del power-up activo y su barra de duración.
- [ ] El primer golpe limpio en los primeros 500 ms tras HAJIME suma +50 pts y muestra «FAST STRIKE +50».
- [ ] El bonus de velocidad solo se aplica una vez por combate.
- [ ] Al vencer al Gran Maestro, la pantalla muestra «CAMPEÓN DEL TORNEO» 3 000 ms antes del game over.
- [ ] `onScoreChange` acumula correctamente puntos de golpes + kata bonus + fast strike bonus.
- [ ] El HUD React refleja score, vidas y nivel (rival actual) en tiempo real.
- [ ] El botón "PAUSA" de la plataforma detiene `update()`, los timers de power-up y el kata; "REANUDAR" los reanuda.
- [ ] Las teclas P / Esc no provocan una pausa independiente del canvas.
- [ ] El modal React de game over aparece con la puntuación final.
- [ ] El modal pre-rellena el nombre desde `av_player_name` de localStorage si existe.
- [ ] Al confirmar, el score se inserta en Supabase con `game_id = 'karate-champ-tournament'`.
- [ ] El botón de guardar se deshabilita tras el primer envío (sin doble inserción).
- [ ] El botón "JUGAR DE NUEVO" remontar el canvas desde la pantalla idle con 3 vidas.
- [ ] El score guardado aparece en `/games/karate-champ-tournament` y en `/hall-of-fame` al recargar.
- [ ] `npm run build` completa sin errores de TypeScript.
- [ ] Ninguna ruta existente devuelve 500.

---

## Decisions

- **Sí: Doble HUD** — el canvas conserva su HUD interno y React muestra los mismos valores
  en el HUD de la plataforma. Razón: coherencia con el patrón establecido en todos los juegos
  de la plataforma; el juego funciona visualmente como standalone dentro del canvas.

- **Sí: 3 vidas** — el modo torneo penaliza al jugador con una vida por cada combate perdido.
  Razón: mecánica de torneo clásica; las 3 vidas proporcionan tensión sin hacer el juego
  injugable; `onLivesChange` se llama en cada pérdida para reflejar el estado en el HUD React.

- **Sí: Reutilizar `KarateChampGame.tsx` con prop `mode`** — en lugar de crear un componente
  separado. Razón: el motor de combate (técnicas, hitboxes, IA, dibujo de luchadores) es
  idéntico; un segundo componente duplicaría centenares de líneas sin beneficio; la prop
  `mode` mantiene la lógica de torneo aislada en bloques condicionales claros.

- **Sí: Kata Bonus solo entre rivales, no entre combates del mismo rival** — si el jugador
  pierde un combate y lo repite, no hay kata intermedio. Razón: el kata es una recompensa
  por superar un rival, no un interstitial en cada combate; insertar kata tras cada derrota
  interrumpiría el ritmo de juego y alargaría innecesariamente las sesiones.

- **Sí: Un solo power-up por combate** — solo puede aparecer un power-up en el canvas y
  desaparece al acabar el timer del combate si no es recogido. Razón: simplifica la gestión
  de estado; con múltiples power-ups simultáneos la interacción entre efectos (p. ej. Iron
  Fist + Mirror Shield) requeriría resolución de prioridades no cubierta en este spec.

- **Sí: power-ups exclusivos para el jugador** — la IA nunca se beneficia de los power-ups.
  Razón: los power-ups compensan la desventaja del jugador frente a una IA con tiempos de
  reacción menores al humano; otorgarlos también a la IA anularía su función.

- **Sí: IA con agresividad fija por rival (sin modo dinámico del classic)** — en modo torneo,
  cada rival tiene una agresividad constante independiente del marcador. Razón: los rivales
  del torneo tienen una identidad de comportamiento (el Discípulo siempre es cauto, el Gran
  Maestro siempre es agresivo); el modo dinámico del classic sirve para equilibrar una partida;
  en el torneo la dificultad progresiva es el diseño intencional.

- **Sí: Play-page específica `app/games/karate-champ-tournament/play/page.tsx`** — en lugar
  de modificar la ruta genérica `[id]/play`. Razón: coherencia con todos los juegos de la
  plataforma; Next.js App Router da prioridad a rutas estáticas sobre dinámicas.

- **Sí: `dynamic(..., { ssr: false })`** — el componente canvas se carga solo en cliente.
  Razón: `canvas` y `requestAnimationFrame` no existen en el entorno Node.js de Next.js SSR.

- **Sí: victoria del torneo también dispara `onGameOver`** — completar el torneo venciendo
  al Gran Maestro llama `onGameOver(score)` igual que agotar las vidas. Razón: la plataforma
  necesita un único punto de salida para mostrar el modal de guardar score.

- **No: Kata con penalización por técnicas incorrectas** — los errores no restan puntos.
  Razón: el kata es un bonus positivo, no un desafío punitivo; penalizar errores desincentivaría
  participar en la secuencia, reduciendo el engagement.

- **No: Power-ups con efectos que se acumulan** — si el jugador recoge un nuevo power-up
  mientras hay uno activo, el primero se cancela y el nuevo comienza. Razón: la gestión de
  stacks de efectos requiere resolución de prioridades fuera del alcance de este spec;
  con un único power-up por combate el caso de conflicto no ocurre en la práctica.

- **No: Efectos de sonido** — fuera de alcance en este spec.
  Razón: se cubren en un spec separado de audio si se desea; no añadir dependencias de Web
  Audio API sin un plan de implementación completo.

- **No: Controles táctiles o mobile** — fuera de alcance en este spec.
  Razón: se pueden añadir mediante el agente `mobile-porter` en una corrida separada.

- **No: Supabase Auth y RLS** — `user_id` se guarda como `null`.
  Razón: consistencia con todos los juegos actuales de la plataforma.

- **No: Realtime en leaderboard** — los scores se ven al recargar.
  Razón: la complejidad de subscriptions no aporta valor mientras haya pocos jugadores activos.
