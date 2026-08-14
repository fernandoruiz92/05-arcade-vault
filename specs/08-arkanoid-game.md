# SPEC 08 — Integración del juego Arkanoid

> **Estado:** Aprobado
> **Depende de:** 06-games-table-leaderboard-supabase, 07-tetris-game
> **Fecha:** 2026-08-13
> **Objetivo:** Integrar Arkanoid (canvas puro con spritesheet y sonidos) como tercer juego
> jugable de la plataforma con ID `arkanoid`, convirtiendo sus tres scripts acoplados por
> globales en módulos ES y montándolo sobre el `PlayShell` que ya existe.

---

## Scope

**In:**

- Crear `components/games/arkanoid/levels.ts` — port de `levels.js` como dato puro
  (`const LEVELS`), con los 5 niveles y sus multiplicadores de velocidad intactos.
- Crear `components/games/arkanoid/spritesheet.ts` — port de `assets/spritesheet.js`
  como módulo ES: `SPRITES`, `EXPLOSION_FRAMES`, `EXPLOSION_DURATION`, `loadSpritesheet`,
  `drawSprite`, `drawFrame`. La ruta de la imagen pasa a `/games/arkanoid/spritesheet-breakout.png`.
- Crear `components/games/ArkanoidGame.tsx` — port de `game.js` siguiendo
  `porting-recipe.md`. Sus props son `GameApi`. La física (rebotes, AABB, pérdida de bola,
  avance de nivel, explosiones) se copia sin modificar.
- Copiar los 3 assets binarios a `public/games/arkanoid/` y reescribir las rutas
  relativas del original a URLs públicas absolutas.
- Crear `app/games/arkanoid/play/page.tsx` — play-page de ~15 líneas sobre `PlayShell`
  con los valores por defecto (`initialLives={3}`, `livesLabel="Vidas"`,
  `livesDisplay="hearts"`, `levelLabel="Nivel"`).
- Añadir el bloque `.cover-arkanoid` a `app/globals.css`, dentro de la sección
  `/* ===== Cover art generators (pure CSS) ===== */` y después de la última regla
  `.cover-*` existente (`.cover-tetris`).
- Registrar la fila `arkanoid` en la tabla `games` de Supabase vía el servidor MCP.
- Subir `PADDLE_SPEED` de 400 a 560 px/s como única constante de juego modificada
  (ver Decisions).

**Fuera de alcance:**

- **Crear `PlayShell` o `types.ts`** — ya existen desde el spec 07. Este spec los consume
  sin tocarlos. Tampoco se amplía `GameApi`.
- **Control por ratón** (`mousemove` sobre el canvas). Se elimina el listener y con él la
  corrección de escala `getBoundingClientRect()` que hoy contiene (ver Decisions).
- **Botones de salto de nivel** dibujados en el overlay de pausa: se eliminan
  `drawPauseOverlay()`, las constantes `PAUSE_BTN_W` / `PAUSE_BTN_H` / `PAUSE_BTN_GAP` /
  `PAUSE_BTN_Y` / `PAUSE_BTN_ROW_X` y el listener de `click` del canvas.
- **Atajo de pausa `P` / `Esc`** y la variable `isPaused`. `PlayShell` es el único dueño
  de la pausa y la entrega por la prop `paused`.
- **Overlays de canvas** `GAME OVER` y `¡Completaste el juego!` — los sustituye el modal
  React. Se elimina `drawOverlay()` junto a sus dos llamadas.
- **Bucle infinito de niveles** — completar el nivel 5 sigue siendo terminal.
- **Nuevos niveles, power-ups o bloques de varios golpes.**
- **Controles táctiles o móviles.**
- **Migración de esquema en Supabase** — `ARCADE` y `magenta` ya están dentro de los
  CHECK constraints.
- Modificar `app/games/page.tsx`, `app/games/[id]/page.tsx`, `app/hall-of-fame/**` o
  `app/games/[id]/play/page.tsx`. Leen de Supabase y recogen el juego nuevo solos.
- `components/games/AsteroidsGame.tsx`, `components/games/TetrisGame.tsx` y
  `components/games/PlayShell.tsx` no se modifican.

---

## Data model

### Fila en la tabla `games` (Supabase)

```sql
INSERT INTO games (id, title, short, long, cat, cover, color)
VALUES (
  'arkanoid',
  'ARKANOID',
  'Rompe el muro antes de que la bola te rompa a ti.',
  'Cinco muros de ladrillos te separan del final. Mueve la paleta para devolver la bola, abre brechas en la formación y pulveriza cada bloque antes de quedarte sin vidas. Cada nivel estrena un patrón distinto y una bola más rápida que la anterior.',
  'ARCADE',
  'cover-arkanoid',
  'magenta'
);
```

`cat = 'ARCADE'` y `color = 'magenta'` respetan los CHECK constraints existentes
(`cat ∈ {ARCADE, PUZZLE, SHOOTER}`, `color ∈ {cyan, magenta, yellow, green}`). No hace
falta ninguna migración de esquema. Es la primera fila `ARCADE` del catálogo, y `magenta`
es el único color de acento aún libre (`asteroids` usa `yellow`, `tetris` usa `cyan`).

`id = 'arkanoid'` es la misma cadena en tres sitios: PK de `games`, carpeta de ruta
`app/games/arkanoid/play/` y `scores.game_id` de cada partida guardada.

### Mapeo de métricas del juego a los callbacks

| Variable interna | Callback        | Etiqueta en el HUD React | Display    |
| ---------------- | --------------- | ------------------------ | ---------- |
| `score`          | `onScoreChange` | Puntuación               | número     |
| `lives`          | `onLivesChange` | Vidas                    | `hearts`   |
| `currentLevel`   | `onLevelChange` | Nivel                    | `01`–`05`  |

El mapeo es directo: Arkanoid tiene vidas y niveles reales, así que `PlayShell` se usa
con todos sus valores por defecto y la play-page no pasa ninguna prop de configuración
de HUD.

| Juego     | `initialLives` | `livesLabel` | `livesDisplay` | `initialLevel` | `levelLabel` |
| --------- | -------------- | ------------ | -------------- | -------------- | ------------ |
| asteroids | 3 (default)    | `Vidas`      | `hearts`       | 1              | `Nivel`      |
| tetris    | `0`            | `Líneas`     | `number`       | 1              | `Nivel`      |
| arkanoid  | 3 (default)    | `Vidas`      | `hearts`       | 1              | `Nivel`      |

### Máquina de estados del componente

```
                       ┌──────────────────────┐
'playing' ─┬─ lives<=0 ─┴──▶ 'gameover' ──┐   │
           │                              ├───┴──▶ onGameOver(score)  (una sola vez)
           └─ nivel 5 limpio ──▶ 'win' ───┘
                       ▲
                       └──── remonte por key de PlayShell ────
```

- `'playing'` — partida normal. Es el único estado en el que `update(dt)` hace algo y en
  el que se dibuja el HUD del canvas (comportamiento original, se conserva).
- `'gameover'` — se pierde la tercera vida.
- `'win'` — se limpian los bloques del nivel 5.
- **Ambos estados terminales disparan `onGameOver(score)`** a través del mismo latch
  `gameOverFired`. El original no tiene camino de reinicio; lo aporta el remonte por
  `key` de `PlayShell`.

### Assets

| Origen                                    | Destino en `public/`                            | Referencia en código                        |
| ----------------------------------------- | ----------------------------------------------- | ------------------------------------------- |
| `assets/spritesheet-breakout.png`         | `public/games/arkanoid/spritesheet-breakout.png` | `/games/arkanoid/spritesheet-breakout.png` |
| `assets/sounds/ball-bounce.mp3`           | `public/games/arkanoid/ball-bounce.mp3`         | `/games/arkanoid/ball-bounce.mp3`           |
| `assets/sounds/break-sound.mp3`           | `public/games/arkanoid/break-sound.mp3`         | `/games/arkanoid/break-sound.mp3`           |

La jerarquía `sounds/` del original se aplana: los tres archivos cuelgan directamente de
`public/games/arkanoid/`.

### Tipos TypeScript nuevos (T13)

```ts
type BlockColor = 'red' | 'yellow' | 'cyan' | 'magenta' | 'hotpink' | 'green' | 'gray';
type GameState  = 'playing' | 'gameover' | 'win';

interface Frame { sx: number; sy: number; sw: number; sh: number }
interface Block { x: number; y: number; w: number; h: number; color: BlockColor; alive: boolean }
interface Explosion { x: number; y: number; w: number; h: number; color: BlockColor; elapsed: number }
interface LevelDef { speed: number; blocks: { col: number; row: number; color: BlockColor }[] }
```

No se introduce ningún modelo de datos persistente nuevo: el score va a la tabla `scores`
vía `PlayShell` y el nombre del jugador a la clave `av_player_name` de `localStorage`,
ambos ya existentes.

---

## Implementation plan

> El paso de crear `PlayShell` **no existe en este plan**: el spec 07 ya lo extrajo y
> migró Asteroids encima. Este spec arranca directamente por el port.

1. **Crear `components/games/arkanoid/levels.ts`.**
   Port literal de `levels.js`: la IIFE que genera los 5 niveles (`l1` relleno completo,
   `l2` pirámide, `l3` damero, `l4` con huecos, `l5` marco con cruz) y el array final con
   los multiplicadores `1.00 / 1.10 / 1.21 / 1.33 / 1.46`. Se exporta como
   `export const LEVELS: LevelDef[]`. Ninguna coordenada ni color cambia.
   Verificación: `npx tsc --noEmit` limpio; `LEVELS.length === 5` y
   `LEVELS[0].blocks.length === 60`.

2. **Crear `components/games/arkanoid/spritesheet.ts`.**
   Port de `assets/spritesheet.js` a módulo ES. Se exportan `SPRITES`,
   `EXPLOSION_FRAMES`, `EXPLOSION_DURATION`, `loadSpritesheet(cb)`, `drawSprite(...)` y
   `drawFrame(...)` con las mismas coordenadas de recorte. El estado de carga
   (`ssImg`, `ssLoaded`, `ssCallbacks`) permanece a nivel de módulo para que la imagen se
   cachee entre remontes. `rawImg.src` pasa de `'assets/spritesheet-breakout.png'` a
   `'/games/arkanoid/spritesheet-breakout.png'`. `document.createElement('canvas')` sólo
   se ejecuta dentro de `onload`, nunca en tiempo de import, así que el módulo es seguro
   para SSR aunque la play-page ya lo cargue con `ssr: false`.
   Verificación: `npx tsc --noEmit` limpio; ningún símbolo global queda en el archivo.

3. **Copiar los assets a `public/games/arkanoid/`.**
   Los tres binarios de la tabla del Data model, aplanando `sounds/`.
   Verificación: la pestaña Network devuelve **200** para
   `/games/arkanoid/spritesheet-breakout.png`, `/games/arkanoid/ball-bounce.mp3` y
   `/games/arkanoid/break-sound.mp3` — no 404.

4. **Crear `components/games/ArkanoidGame.tsx`.**
   Port de `game.js` aplicando las transformaciones de `porting-recipe.md`:
   - Todo el cuerpo del script pasa a un único `useEffect(() => { … }, [])`; las variables
     de módulo se vuelven variables de closure (`let` / `const`), **no `useRef`**.
   - Props reflejadas en refs (`pausedRef`, `cbScore`, `cbLives`, `cbLevel`, `cbOver`) con
     su effect de sincronización de una línea cada una.
   - Canvas desde `useRef`, `width={800} height={600}`, sin `document.getElementById`.
     El original usa `canvas.width` / `canvas.height` en vez de constantes `W`/`H`: se
     mantiene tal cual.
   - `import { LEVELS } from './arkanoid/levels'` y
     `import { loadSpritesheet, drawSprite, drawFrame, EXPLOSION_FRAMES, EXPLOSION_DURATION } from './arkanoid/spritesheet'`.
   - Los dos `new Audio(...)` bajan del scope de módulo al interior del effect y apuntan a
     `/games/arkanoid/*.mp3`. Cada reproducción pasa a ser
     `(sound.cloneNode() as HTMLAudioElement).play().catch(() => {})` — el `catch` evita la
     excepción de Chrome si aún no ha habido gesto del usuario, y el cast resuelve que
     `cloneNode()` devuelve `Node` en TypeScript.
   - `PADDLE_SPEED` sube de `400` a `560`. Es la **única** constante de juego que cambia.
   - Se eliminan las constantes muertas `BLOCK_ROWS` y `BLOCK_COLORS`, que el original
     declara y nunca usa.
   - **Se eliminan** (T10 / T11 y decisiones del usuario): `drawOverlay()` y sus dos
     llamadas, `drawPauseOverlay()`, las cinco constantes `PAUSE_BTN_*`, el listener de
     `click` del canvas, el listener de `mousemove` del canvas, la variable `isPaused` y la
     rama `p` / `P` / `Escape` del handler de teclado. Se deja un comentario de una línea
     donde estaba la llamada al overlay de game over.
   - Listeners de teclado con nombre sobre `window` (el original los engancha a
     `document`), y `preventDefault()` para `ArrowLeft` / `ArrowRight` para que la página
     no haga scroll. Se retiran ambos en el cleanup.
   - Se añade `initGame()` idempotente — el original no tiene ninguno, arranca con
     `initPaddle(); loadLevel(1);`. Resetea `score = 0`, `lives = 3`,
     `gameState = 'playing'`, `gameOverFired = false`, las tres sentinelas `prev*` a `-1`,
     y llama a `initPaddle()` y `loadLevel(1)`.
   - Loop: `rafId` capturado en boot y en cada frame; delta en segundos **con el cap que
     el original no tiene**: `Math.min((ts - lastTime) / 1000, 0.05)`.
   - Gate de pausa: `if (!pausedRef.current) update(dt); draw();` — mapea uno a uno sobre
     el `if (!isPaused)` que ya existe. El movimiento vive en `update()`, no en el handler
     de teclado, así que no hace falta un segundo gate.
   - Bridge a React al final de `loop()`: sentinelas `prevScore` / `prevLives` /
     `prevLevel` inicializadas a `-1` y latch `gameOverFired`. `onGameOver(score)` se
     dispara cuando `gameState` es `'gameover'` **o** `'win'`.
   - Boot asíncrono con guard de desmontaje:
     ```
     let cancelled = false;
     loadSpritesheet(() => { if (cancelled) return; initGame(); rafId = requestAnimationFrame(loop); });
     ```
     y `cancelled = true` en el cleanup, para que un desmontaje rápido no deje una cadena
     de RAF huérfana.
   - El HUD dibujado en canvas (`Score:`, `Nivel:`, bolas de vida) se conserva intacto,
     incluida la condición `if (gameState === 'playing')` que lo envuelve.
   - Anotaciones de tipo según la sección de tipos del Data model.
     Verificación: `npx tsc --noEmit` no reporta ningún error en los archivos nuevos.

5. **Crear `app/games/arkanoid/play/page.tsx`.**
   `'use client'`, import dinámico con `dynamic(..., { ssr: false })` y un `PlayShell` con
   `gameId="arkanoid"` y `gameTitle="ARKANOID"`. Sin props de HUD: los valores por defecto
   ya son los correctos.
   Verificación: `/games/arkanoid/play` carga sin error de SSR y el juego es jugable; el
   HUD React muestra Jugador · Puntuación · Vidas ♥♥♥ · Nivel 01.

6. **Añadir `.cover-arkanoid` a `app/globals.css`.**
   Invocar `/frontend-design` para la dirección visual antes de escribir el CSS. Concepto
   «Muro + bola en vuelo»: filas de ladrillos de colores en el tercio superior con un hueco
   abierto, la bola con estela diagonal cruzando el centro y la paleta magenta abajo. CSS
   puro con `radial-gradient` / `linear-gradient` y `filter: drop-shadow(...)`, sin
   imágenes ni SVG. Se inserta después de `.cover-tetris` (hoy en la línea 518), dentro de
   la sección de generadores de portada.
   Verificación: la card de Arkanoid en `/games` muestra la portada una vez exista la fila
   en Supabase (paso 7).

7. **Registrar el juego en Supabase.**
   Vía servidor MCP `supabase`, en este orden: `list_tables` para confirmar que el esquema
   no ha derivado, `execute_sql` con el `INSERT` del Data model, y `execute_sql` con un
   `SELECT id, title, cat, cover, color FROM games ORDER BY created_at` para comprobar que
   la fila aterrizó. **No** se inserta desde el cliente browser: RLS permite `SELECT`
   público sobre `games` pero no `INSERT`.
   Verificación: el `SELECT` devuelve tres filas — `asteroids`, `tetris` y `arkanoid`.

8. **Build y recorrido de rutas.**
   `npm run build`, y después recorrer y reportar lo observado realmente en `/games`,
   `/games/arkanoid`, `/games/arkanoid/play`, `/hall-of-fame`, y `/games/asteroids/play`
   y `/games/tetris/play` como comprobación de no-regresión.
   Verificación: el build termina sin errores de TypeScript y ninguna ruta devuelve 500.

---

## Acceptance criteria

- [ ] `components/games/arkanoid/levels.ts` exporta `LEVELS` con 5 niveles y los
      multiplicadores de velocidad originales.
- [ ] `components/games/arkanoid/spritesheet.ts` exporta la API del original y ningún
      símbolo global queda suelto.
- [ ] `components/games/ArkanoidGame.tsx` existe y sus props son `GameApi`.
- [ ] `public/games/arkanoid/` contiene el PNG y los dos MP3, y todas las peticiones
      devuelven 200.
- [ ] `app/games/arkanoid/play/page.tsx` existe y usa `dynamic(..., { ssr: false })`.
- [ ] `/games/arkanoid/play` carga sin errores de SSR ni de TypeScript.
- [ ] El spritesheet se dibuja: se ven los bloques de colores, la paleta y la bola.
- [ ] La paleta se mueve con `←` y `→`, y ninguna tecla hace scroll de la página.
- [ ] El ratón **no** mueve la paleta.
- [ ] La bola rebota en paredes, techo y paleta; romper un bloque suma 10 puntos y lanza
      la animación de explosión de 4 frames.
- [ ] Suenan los dos efectos (rebote y rotura) y ninguno lanza excepción en consola.
- [ ] Limpiar todos los bloques carga el siguiente nivel con la bola más rápida, y el HUD
      React sube de `01` a `02`.
- [ ] Perder la bola resta una vida y relanza; con 0 vidas se abre el modal React de fin
      de partida **una sola vez**, con la puntuación final correcta.
- [ ] Completar el nivel 5 abre ese mismo modal (estado `'win'`), también una sola vez.
- [ ] Los overlays de canvas `GAME OVER` y `¡Completaste el juego!` ya no se dibujan.
- [ ] El overlay de pausa del canvas y sus 5 botones de salto de nivel ya no existen; hacer
      clic en el canvas no hace nada.
- [ ] `P` y `Esc` no hacen nada. El botón PAUSA de la plataforma congela el juego y el
      canvas sigue repintando; REANUDAR lo reanuda.
- [ ] El HUD React refleja en tiempo real puntuación, vidas y nivel, y coincide con el HUD
      dibujado en el canvas.
- [ ] JUGAR DE NUEVO arranca una partida limpia: nivel 1, score 0, 3 vidas, muro completo,
      sin explosiones ni bloques heredados.
- [ ] Al desmontar el componente no queda ningún `requestAnimationFrame` activo ni ningún
      listener de teclado enganchado.
- [ ] Cambiar de pestaña 30 segundos y volver no teletransporta la bola fuera del canvas.
- [ ] `.cover-arkanoid` está en `app/globals.css` después de `.cover-tetris`, es CSS puro y
      no referencia ninguna imagen.
- [ ] La fila `arkanoid` está en la tabla `games`, confirmada con un `SELECT` real.
- [ ] `/games` muestra la card de Arkanoid con su portada y categoría `ARCADE`.
- [ ] `/games/arkanoid` muestra el detalle y el leaderboard vacío con el mensaje
      «Sé el primero en entrar al salón de la fama».
- [ ] Guardar una puntuación la inserta en `scores` con `game_id = 'arkanoid'`, y aparece
      en `/games/arkanoid` y en `/hall-of-fame` al recargar.
- [ ] `/games/asteroids/play` y `/games/tetris/play` siguen funcionando sin regresiones.
- [ ] `npm run build` completa sin errores de TypeScript.

---

## Decisions

- **Sí: Este spec no crea `PlayShell`.** El spec 05 aplazó la extracción del shell hasta
  la llegada del segundo juego canvas, y el spec 07 la ejecutó como su paso 1. Arkanoid es
  el tercero, así que `components/games/PlayShell.tsx` y `components/games/types.ts` ya
  existen y se consumen sin tocarlos. Razón: la condición que aquella decisión ponía ya se
  cumplió; repetir el paso sería reescribir código correcto.

- **Sí: Tres archivos en vez de uno.** `levels.ts` y `spritesheet.ts` viven en
  `components/games/arkanoid/` y el componente se queda en
  `components/games/ArkanoidGame.tsx`, donde el contrato de plataforma lo espera. Razón:
  `porting-recipe.md` obliga a convertir los globales entre scripts en imports reales, y
  mantener el estado de carga del spritesheet a nivel de módulo hace que la imagen se
  cachee entre remontes en lugar de recargarse en cada JUGAR DE NUEVO.

- **Sí: Sólo teclado.** Se elimina el listener de `mousemove`; la paleta se controla
  únicamente con `←` / `→`. Razón: decisión explícita del usuario. Efecto secundario
  positivo: desaparece la corrección de escala del puntero, que era la parte más frágil
  del port al vivir el canvas a `width: 100%`.

- **Sí: `PADDLE_SPEED` sube de 400 a 560 px/s.** Es la única constante de juego que este
  spec modifica. Razón: quitar el ratón deja la paleta atada a esa constante, y en el nivel
  5 la bola viaja a ~526 px/s — más rápido que la paleta original, lo que hace el nivel
  materialmente injugable. 560 supera esa velocidad y mantiene los cinco niveles
  superables. Sin la decisión anterior este cambio no haría falta.

- **Sí: `'win'` dispara `onGameOver(score)`.** Los dos estados terminales comparten el
  mismo latch `gameOverFired`. Razón: `porting-recipe.md` lo prescribe explícitamente para
  este juego, y sin ello completar los 5 niveles dejaría al jugador ante un canvas
  congelado sin forma de guardar su puntuación.

- **Sí: Limitar el delta a 0.05 s.** El original no lo hace. Razón: sin el cap, volver de
  otra pestaña produce un `dt` enorme y la bola atraviesa la pared o la paleta en un solo
  frame.

- **Sí: Guard `cancelled` en el boot asíncrono.** `loadSpritesheet()` arranca el loop desde
  un callback. Razón: sin el guard, desmontar el componente mientras la imagen aún carga
  deja una cadena de `requestAnimationFrame` corriendo sobre un canvas que ya no está en el
  DOM.

- **Sí: Sonidos con `.play().catch(() => {})`.** Razón: Chrome lanza si se reproduce audio
  antes del primer gesto del usuario, y aquí el primer rebote puede ocurrir sin que se haya
  pulsado ninguna tecla.

- **Sí: HUD dibujado en canvas además del HUD React.** Se conserva intacto, incluida la
  condición `if (gameState === 'playing')` que lo envuelve. Razón: continuidad con la
  decisión «Doble HUD» del spec 05 — el juego debe funcionar como standalone dentro del
  canvas.

- **Sí: `paddle.w = 81`.** El `CLAUDE.md` de `04-arkanoid` documenta 162, pero el código
  dice 81 (el sprite mide 162 px y se dibuja escalado a la mitad). Razón: gana el código;
  cambiarlo alteraría la dificultad del juego.

- **No: Botones de salto de nivel del overlay de pausa.** Se eliminan el overlay, las cinco
  constantes `PAUSE_BTN_*` y el listener de `click`. Razón: eran una herramienta de
  desarrollo del original; en la plataforma permitirían saltar al nivel 5 y falsear el
  leaderboard.

- **No: Atajo de pausa `P` / `Esc`.** Razón: `PlayShell` es el dueño del estado `paused` y
  el componente sólo lo recibe por prop; recuperar el atajo exigiría ampliar `GameApi` con
  un callback, lo mismo que ya descartó el spec 07.

- **No: Bucle infinito de niveles.** Completar el nivel 5 sigue siendo terminal. Razón: dar
  la vuelta al ciclo con velocidad creciente sería lógica de juego nueva, y
  `porting-recipe.md` reserva el port a transformaciones estructurales.

- **No: Migración de esquema en Supabase.** `ARCADE` y `magenta` ya están dentro de los
  CHECK constraints. Razón: ampliarlos afectaría a todos los juegos y no hay motivo.

- **No: Tocar `app/games/page.tsx`, `app/games/[id]/page.tsx`, `app/hall-of-fame/**` ni
  `app/games/[id]/play/page.tsx`.** Razón: leen de Supabase y la ruta estática
  `app/games/arkanoid/play/` gana sobre la dinámica en el App Router; si hiciera falta
  editarlos, sería señal de que la integración se hizo mal.
