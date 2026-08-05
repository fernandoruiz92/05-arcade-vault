# SPEC 05 — Juego jugable: Asteroids (ROCAS)

> **Estado:** Aprobado · **Depende de:** ninguno · **Fecha:** 2026-08-05
> **Objetivo:** Portar el juego de asteroides de `references/started-games/02-asteroids`
> a un componente React con canvas y conectarlo a `/games/rocas/play`, reemplazando
> el placeholder animado por el juego jugable real controlado por teclado.

---

## Scope

**In:**

- Crear `components/games/AsteroidsGame.tsx` — el juego portado (clases `Bullet`,
  `Asteroid`, `PowerUp`, `Ship`, `Particle`, utils `wrap`/`dist`/`rand`, loop con
  `requestAnimationFrame`) como componente React autocontenido, con canvas interno
  de 800×600.
- El componente recibe props `paused: boolean` y callbacks `onScoreChange`,
  `onLivesChange`, `onLevelChange`, `onGameOver` para comunicar su estado al HUD
  externo existente.
- Quitar `drawHUD()` y el overlay de "GAME OVER" del canvas portado — el HUD
  (Puntuación/Vidas/Nivel) y el modal de fin de juego los sigue manejando la UI de
  React que ya existe en `app/games/[id]/play/page.tsx`.
- Modificar `app/games/[id]/play/page.tsx`: cuando `id === 'rocas'`, renderizar
  `<AsteroidsGame>` dentro de `.crt-screen` en vez de los divs de `.game-arena`;
  cablear los botones "PAUSA"/"FIN"/"JUGAR DE NUEVO" al juego real (hoy son
  decorativos sobre una animación falsa).
- Agregar estado real de `lives` en la página (hoy es `const [lives] = useState(3)`
  fijo, nunca cambia) y un `resetKey` para forzar el remount del canvas al reiniciar
  partida.
- Mantener el esquema de controles original: `←`/`→` rotar, `↑` propulsar, `Espacio`
  disparar.
- Mantener el estilo visual monocromo original (líneas blancas finas sobre negro),
  enmarcado por el bisel CRT neón ya existente en el sitio.
- Mantener toda la lógica de juego original tal cual: partición de asteroides por
  tamaño, wrap toroidal, power-up de disparo triple, partículas de explosión,
  parpadeo de invencibilidad al reaparecer, progresión de nivel
  (`spawnAsteroids(3 + level)`), puntaje por tamaño (20/50/100).

**Out of scope (para specs futuros):**

- Los otros 5 juegos activos (`bloque-buster`, `caida`, `serpentina`, `gloton`,
  `invasores`) — quedan con su placeholder animado actual, sin tocar.
- Persistencia real de puntuaciones (tabla `scores` en Supabase). El botón
  "GUARDAR PUNTUACIÓN" sigue siendo el mismo stub local de hoy (marca `saved = true`
  sin persistir en ningún lado), igual que para el resto de juegos — ver spec 04.
- Controles táctiles / mobile.
- Re-skin visual a la paleta cyan/magenta/yellow del sitio.
- Cambios a `app/data/games.ts` (título, descripción, cover, `best`, `plays` de
  `rocas`) — son contenido editorial, no gameplay.
- Sonido/efectos de audio — el original no tiene, no se agrega.
- Tocar el sistema legacy (`components/GamePlayer.tsx`, `components/GameOverModal.tsx`,
  `lib/session.tsx`, `lib/games.ts`, rutas `app/juego/[id]`, `app/jugar/[id]`,
  `app/salon`) — es código muerto fuera de alcance, ya documentado en spec 04.

---

## Data model

No se introduce ningún modelo de datos persistente. El estado del juego vive en
memoria dentro de `AsteroidsGame` (nave, balas, asteroides, partículas, power-ups,
score, vidas, nivel, estado `'playing' | 'dead' | 'gameover'`), igual que en el
original.

Props del componente:

```ts
type AsteroidsGameProps = {
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
};
```

Convenciones (heredadas del original): canvas fijo 800×600, coordenadas origen
arriba-izquierda, velocidades en px/segundo, `dt` capado a 50ms por frame.

---

## Implementation plan

1. **Crear `components/games/AsteroidsGame.tsx` con el esqueleto** — canvas ref,
   `useEffect` vacío, props tipadas según el modelo de arriba.
   Verificación: el archivo compila sin errores de TypeScript y se puede importar.

2. **Portar utils y clases** (`wrap`, `dist`, `rand`, `randInt`, `Bullet`,
   `Asteroid`, `PowerUp`, `Ship`, `Particle`) dentro del archivo, reemplazando el
   `ctx`/`canvas` globales del original por referencias al `canvas` del componente.
   Verificación: `npx tsc --noEmit` sin errores nuevos.

3. **Portar el estado y el loop del juego** (`spawnAsteroids`, `initGame`,
   `nextLevel`, `explode`, `killShip`, `update`, `draw`) dentro de un closure creado
   en el `useEffect` al montar. Listeners de teclado (`keydown`/`keyup`) agregados a
   `window` dentro del mismo efecto, removidos en su cleanup. `requestAnimationFrame`
   cancelado en el cleanup. Quitar `drawHUD()` y el overlay de "GAME OVER" de `draw()`.
   Verificación: montar el componente en `/games/rocas/play` muestra el juego y es
   jugable con teclado.

4. **Conectar callbacks** — cada vez que `score`/`lives`/`level` cambian dentro del
   loop interno (comparando contra el valor anterior para no disparar en cada frame
   sin cambio real), llamar a `onScoreChange`/`onLivesChange`/`onLevelChange`. Al
   entrar en estado `'gameover'`, llamar `onGameOver(score)` una única vez.
   Verificación: los valores recibidos por los callbacks cambian correctamente
   durante una partida de prueba.

5. **Prop `paused`** — cuando es `true`, el loop interno deja de avanzar `update(dt)`
   (sigue dibujando el último frame, no llama `requestAnimationFrame` con nuevo
   `dt` acumulado). Al volver a `false`, continúa sin salto brusco (`lastTime` se
   resetea a `null` al reanudar).
   Verificación: pausar detiene nave/asteroides/balas; reanudar continúa sin
   teletransportes.

6. **Modificar `app/games/[id]/play/page.tsx`** — si `id === 'rocas'`, renderizar
   `<AsteroidsGame key={resetKey} paused={paused} onScoreChange={setScore}
onLivesChange={setLives} onLevelChange={setLevel} onGameOver={() =>
setOver(true)} />` dentro de `.crt-screen`, en vez de los divs `.game-arena`.
   Para el resto de juegos, el placeholder actual queda sin cambios. Se agrega
   `const [lives, setLives] = useState(3)` (reemplaza el `const [lives] =
useState(3)` fijo) y `const [resetKey, setResetKey] = useState(0)`.
   Verificación: `/games/rocas/play` muestra el canvas jugable;
   `/games/caida/play` sigue mostrando el placeholder de siempre.

7. **Cablear botones** — "PAUSA" ya alterna `paused` (ahora afecta al juego real);
   "FIN" ya llama `setOver(true)` (abre el modal con el score actual); `restart()`
   además de resetear `score`/`level`/`lives`/`paused`/`over`/`saved` incrementa
   `resetKey` para remontar el canvas desde cero.
   Verificación manual: pausar detiene el juego, "FIN" abre el modal con el score
   correcto, "JUGAR DE NUEVO" arranca una partida nueva jugable.

8. **Ajustar CSS si hace falta** para que el `<canvas>` llene `.crt-screen`
   (`width`/`height: 100%`, `display: block`) sin romper el `aspect-ratio: 4/3`
   existente del contenedor.
   Verificación visual en `http://localhost:3000/games/rocas/play`.

9. **Verificación end-to-end** — partida completa: mover, disparar, partir
   asteroides de los 3 tamaños, subir de nivel, perder las 3 vidas, ver el modal de
   fin de juego con el score final correcto, reiniciar y jugar de nuevo. Confirmar
   que ningún otro juego ni ruta cambia de comportamiento.

---

## Acceptance criteria

- [ ] `/games/rocas/play` muestra el canvas del juego (no el placeholder de divs)
      dentro del marco CRT.
- [ ] `←`/`→` rotan la nave, `↑` propulsa, `Espacio` dispara — igual que el original.
- [ ] Destruir un asteroide grande/mediano/pequeño suma 20/50/100 puntos
      respectivamente, reflejado en tiempo real en el HUD externo (Puntuación).
- [ ] Chocar con un asteroide decrementa el HUD externo (Vidas) y la nave reaparece
      con parpadeo de invencibilidad tras el respawn.
- [ ] Completar un nivel (0 asteroides restantes) incrementa el HUD externo (Nivel)
      y genera la siguiente oleada.
- [ ] El botón "PAUSA" congela el juego (nave, asteroides y balas dejan de
      moverse); "REANUDAR" lo continúa sin saltos.
- [ ] El botón "FIN" abre el modal de fin de juego mostrando el score actual de la
      partida.
- [ ] Perder las 3 vidas abre automáticamente el modal de fin de juego con el score
      final correcto.
- [ ] "JUGAR DE NUEVO" reinicia una partida nueva jugable (score 0, 3 vidas, nivel 1) sin recargar la página.
- [ ] "SALIR" navega de vuelta a `/games/rocas` sin errores de consola.
- [ ] Los otros 5 juegos activos (`bloque-buster`, `caida`, `serpentina`, `gloton`,
      `invasores`) en `/games/[id]/play` siguen mostrando el placeholder animado
      sin cambios visuales ni de comportamiento.
- [ ] `npx tsc --noEmit` no reporta errores nuevos.
- [ ] `npm run build` no reporta errores nuevos además de la limitación preexistente
      de `/salon` ya documentada en spec 04.

---

## Decisions

- **Sí:** Portar el juego a un componente React autocontenido
  (`components/games/AsteroidsGame.tsx`) con su propio loop en `useEffect`, en vez
  de reusar `components/GamePlayer.tsx` (legacy, depende de `lib/session` que no
  está montado en `app/layout.tsx` — ver spec 04). Se integra directamente en
  `app/games/[id]/play/page.tsx`, que es la ruta activa hoy.

- **Sí:** Quitar `drawHUD()` y el overlay de "GAME OVER" del canvas portado. El HUD
  y el modal de fin de juego los sigue manejando la UI de React ya existente vía
  callbacks — evita duplicar la misma información en dos lugares (decidido en la
  fase de preguntas).

- **Sí:** Reinicio de partida vía remount (`key={resetKey}` incrementado en
  `restart()`) en vez de exponer un método imperativo con `useImperativeHandle`.
  Más simple: el estado interno del juego (varias clases con campos mutables) se
  reinicializa limpio en cada montaje, sin necesidad de un método `reset()` manual.

- **Sí:** Mantener las 5 clases (`Bullet`, `Asteroid`, `PowerUp`, `Ship`,
  `Particle`) y toda la lógica de juego (spawn, split, colisiones, triple-shot)
  exactamente como en el original. Este spec es de integración a Next.js, no de
  rediseño de gameplay.

- **Sí:** Mantener resolución interna del canvas en 800×600, escalado por CSS al
  contenedor `.crt-screen` (ya tiene `aspect-ratio: 4/3`) — cero cambios de
  proporción necesarios.

- **Sí:** Mantener el estilo visual monocromo original (líneas blancas finas sobre
  negro) en vez de re-skinear a la paleta cyan/magenta/yellow del sitio — decidido
  en la fase de preguntas, para no arriesgar el feel del juego original.

- **No:** Tocar `app/data/games.ts` (título, cover, `best`, `plays` de `rocas`) —
  contenido editorial, no gameplay.

- **No:** Persistencia real de puntuaciones ni tabla `scores` en Supabase — sigue
  fuera de alcance (ver spec 04), afecta a todos los juegos por igual y se resuelve
  en un spec futuro común.

- **No:** Controles táctiles ni re-skin visual — deferred, decidido en la fase de
  preguntas.

- **No:** Tocar `components/GamePlayer.tsx`, `components/GameOverModal.tsx`,
  `lib/session.tsx`, `lib/games.ts` ni las rutas legacy (`app/juego/[id]`,
  `app/jugar/[id]`, `app/salon`) — código muerto fuera de alcance, consistente con
  spec 04.

---

## Identified risks

| Riesgo                                                                                                                                         | Mitigación                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Listeners de teclado globales (`window.addEventListener('keydown'/'keyup')`) quedan activos si el componente no se desmonta limpio al navegar. | Agregarlos dentro del mismo `useEffect` que monta el juego y removerlos explícitamente en su función de limpieza.                   |
| El loop de `requestAnimationFrame` no se detiene solo al desmontar (el original lo llama indefinidamente).                                     | Cancelar el `requestAnimationFrame` pendiente en el cleanup del efecto, evitando fugas o `setState` sobre un componente desmontado. |
| Llamar a los callbacks (`onScoreChange`, etc.) en cada frame aunque el valor no cambie provocaría ~60 renders/seg del HUD externo.             | Comparar contra el valor anterior dentro del loop y solo invocar el callback cuando cambia realmente.                               |

---

## What is **not** in this spec

- Los otros 5 juegos activos del catálogo — cada uno se aborda en su propio spec
  futuro.
- Persistencia real de puntuaciones (Supabase) — spec futuro común a todos los
  juegos.
- Controles táctiles / mobile.
- Re-skin visual a la paleta del sitio.
- Limpieza del sistema legacy (`GamePlayer.tsx`, `GameOverModal.tsx`,
  `lib/session.tsx`, `lib/games.ts`, rutas `app/juego`/`app/jugar`/`app/salon`).

Cada uno de estos, si se hace, va en su propio spec.
