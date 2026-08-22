# SPEC — Frogger: niveles progresivos, eventos y power-ups

> **Estado:** Propuesto
> **Depende de:** 06-games-table-leaderboard-supabase, 01-frogger-core
> **Fecha:** 2026-05-20
> **Objetivo:** Añadir a Frogger un sistema de dificultad progresiva por nivel con parámetros definidos por tabla, eventos especiales en pista (mosca bonus, cocodrilo disfrazado) y tres power-ups temáticos con efectos, duración y representación visual propia.

---

## Scope

**In:**

- Tabla de configuración de niveles `LEVEL_CONFIG` definida como constante TypeScript dentro de `FroggerGame.tsx`: sustituye el cálculo de `speed * 1.15^level` del core por valores discretos y auditables por nivel del 1 al 10; a partir del nivel 10 se aplica el delta del nivel 10 de forma acumulativa.
- Sistema de eventos especiales en pista:
  - **Mosca bonus** — aparece aleatoriamente en una de las 5 bocas destino durante 6 s; si la rana llega mientras está presente, suma 200 pts extra. Al desaparecer sin ser recogida, la boca queda libre para intentarlo de nuevo.
  - **Cocodrilo disfrazado** — ocupa visualmente un slot de tronco en uno de los carriles de río; la rana puede subirse sin saberlo, pero tras 1.5 s de estar encima, el cocodrilo la engulle (muerte). El cocodrilo se introduce a partir del nivel 3.
- Tres power-ups que aparecen como ítems flotantes en la fila segura central (fila 7) durante 8 s; se recogen pisando la celda:
  - **Casco** (`helmet`) — la rana sobrevive al próximo impacto de vehículo (1 escudo, 5 s de duración tras recogerlo). Visual: círculo amarillo con contorno naranja sobre la rana.
  - **Ralentizador** (`slowdown`) — reduce la velocidad de todas las entidades en un 40 % durante 5 s. Visual: reloj de arena azul; los carriles se tiñen de azul semitransparente.
  - **Salto largo** (`long-jump`) — el siguiente salto de la rana cubre 2 celdas en lugar de 1 (una sola vez). Visual: flechas verdes dobles sobre la rana; se consume al usarlo.
- Los power-ups aparecen con probabilidad del 25 % al completar cada boca destino (uno como máximo activo en pantalla a la vez); si hay uno activo, el siguiente se suprime hasta que expire o se recoja.
- Efectos visuales de los eventos y power-ups se dibujan dentro del canvas del componente existente (`draw()`); no se añaden elementos DOM externos.
- Parámetros de `LEVEL_CONFIG` exportados como objeto de sólo lectura para facilitar pruebas manuales en consola.

**Fuera de alcance:**

- Nuevas tablas en Supabase — este spec no altera el schema.
- Animaciones de partículas para muerte o recogida de power-up (destellos, explosiones) — complejidad visual desproporcionada para el scope del spec; se puede añadir en un tercer spec.
- Power-ups persistentes entre rondas o partidas.
- Controles táctiles o mobile.
- Supabase Auth y RLS.
- Realtime en el leaderboard.

---

## Data model

### `LEVEL_CONFIG` — constante TypeScript (no SQL)

```ts
interface LevelParams {
  roadSpeedMultiplier: number; // factor sobre velocidades base de carriles de carretera
  riverSpeedMultiplier: number; // factor sobre velocidades base de carriles de río
  turtleSubmergeInterval: number; // ms entre fases visible↔sumergida (menor = más agresivo)
  roundTimeSec: number; // segundos del temporizador de ronda
  alienFireRate?: never; // campo reservado para evitar confusión con Space Invaders
}

const LEVEL_CONFIG: Readonly<Record<number, LevelParams>> = {
  1: {
    roadSpeedMultiplier: 1.0,
    riverSpeedMultiplier: 1.0,
    turtleSubmergeInterval: 3000,
    roundTimeSec: 30,
  },
  2: {
    roadSpeedMultiplier: 1.1,
    riverSpeedMultiplier: 1.08,
    turtleSubmergeInterval: 2800,
    roundTimeSec: 28,
  },
  3: {
    roadSpeedMultiplier: 1.22,
    riverSpeedMultiplier: 1.18,
    turtleSubmergeInterval: 2600,
    roundTimeSec: 26,
  },
  4: {
    roadSpeedMultiplier: 1.35,
    riverSpeedMultiplier: 1.29,
    turtleSubmergeInterval: 2400,
    roundTimeSec: 24,
  },
  5: {
    roadSpeedMultiplier: 1.5,
    riverSpeedMultiplier: 1.42,
    turtleSubmergeInterval: 2200,
    roundTimeSec: 22,
  },
  6: {
    roadSpeedMultiplier: 1.67,
    riverSpeedMultiplier: 1.57,
    turtleSubmergeInterval: 2000,
    roundTimeSec: 20,
  },
  7: {
    roadSpeedMultiplier: 1.86,
    riverSpeedMultiplier: 1.74,
    turtleSubmergeInterval: 1800,
    roundTimeSec: 18,
  },
  8: {
    roadSpeedMultiplier: 2.07,
    riverSpeedMultiplier: 1.93,
    turtleSubmergeInterval: 1600,
    roundTimeSec: 16,
  },
  9: {
    roadSpeedMultiplier: 2.3,
    riverSpeedMultiplier: 2.14,
    turtleSubmergeInterval: 1400,
    roundTimeSec: 14,
  },
  10: {
    roadSpeedMultiplier: 2.56,
    riverSpeedMultiplier: 2.38,
    turtleSubmergeInterval: 1200,
    roundTimeSec: 12,
  },
};
// A partir del nivel 11, se aplica el config del nivel 10.
function getLevelParams(level: number): LevelParams {
  return LEVEL_CONFIG[Math.min(level, 10)];
}
```

### Tipos de eventos y power-ups (TypeScript, locales al componente)

```ts
type PowerUpType = 'helmet' | 'slowdown' | 'long-jump';

interface PowerUp {
  type: PowerUpType;
  col: number; // celda de la fila segura central donde aparece
  spawnedAt: number; // timestamp ms desde inicio del loop
  expiresAt: number; // spawnedAt + 8000 ms
  active: boolean; // false = recogido o expirado
}

interface ActiveEffect {
  type: PowerUpType;
  expiresAt: number;
}

interface SpecialEvent {
  kind: 'fly' | 'croc';
  goalIndex?: number; // sólo para 'fly' — índice de boca destino (0-4)
  laneRow?: number; // sólo para 'croc' — fila del carril de río
  entityIndex?: number; // sólo para 'croc' — índice en lane.entities
  spawnedAt: number;
  expiresAt: number;
  triggered: boolean; // 'fly' = recogida; 'croc' = la rana se subió
  engulfTimer?: number; // ms desde que la rana se subió al cocodrilo
}
```

El estado del componente añade estos campos al estado interno existente:

```ts
let pendingPowerUp: PowerUp | null = null;
let activeEffect: ActiveEffect | null = null;
let specialEvents: SpecialEvent[] = [];
```

---

## Implementation plan

1. **Integrar `LEVEL_CONFIG` y `getLevelParams`** en `FroggerGame.tsx`:
   - Reemplazar el cálculo `speed * Math.pow(1.15, level - 1)` en `buildLanes()` por `baseLaneSpeed * getLevelParams(level).roadSpeedMultiplier` (o `.riverSpeedMultiplier` según el tipo de carril).
   - Reemplazar el valor fijo de `turtleSubmergeInterval` por `getLevelParams(level).turtleSubmergeInterval`.
   - Reemplazar el tiempo fijo de ronda por `getLevelParams(level).roundTimeSec * 1000`.
     Verificación: en nivel 1 las velocidades son exactamente las de los valores base; en nivel 5 son 1.5× más rápidas; en nivel 10 son 2.56× para carretera.

2. **Implementar eventos especiales** — añadir `updateSpecialEvents(now: number)` llamado desde `update()`:
   - **Mosca bonus** (`kind: 'fly'`):
     - Al completar cada boca destino, con probabilidad 0.4 (40 %), crear un `SpecialEvent` de tipo `'fly'` en un índice de boca no ocupada y libre de otros eventos activos; `expiresAt = now + 6000`.
     - En `checkGoal()`: si la boca tiene una mosca activa (`triggered === false`), además de los puntos normales sumar 200 pts y marcar `triggered = true`.
     - En `updateSpecialEvents()`: si `now >= event.expiresAt && !event.triggered`, eliminar el evento (la boca queda libre sin penalización).
     - En `draw()`: dibujar sobre la boca destino afectada un pequeño círculo amarillo (radio 6 px) con dos óvalos laterales (alas) de color blanco semitransparente; parpadear en los últimos 2 s (`Math.sin(now / 150) > 0` para alternar opacidad).

   - **Cocodrilo disfrazado** (`kind: 'croc'`):
     - Introducido a partir del nivel 3. Al comenzar cada ronda (tras completar las 5 bocas), con probabilidad 0.35 (35 %), seleccionar aleatoriamente un carril de río (filas 1–6) y un índice de entidad de tipo `'log'` en ese carril; crear un `SpecialEvent` de tipo `'croc'` apuntando a ese entidad; `expiresAt = now + duración_de_ronda`.
     - El cocodrilo visualmente sustituye el tronco: se dibuja con el mismo rectángulo marrón pero con dos ojos rojos (dos círculos de radio 4 px en la parte superior) y una línea dentada en el borde delantero; el jugador debe inferir el peligro por la animación sutil.
     - En `getSupport()`: si la entidad detectada corresponde a un cocodrilo activo y `!event.triggered`, devolver la entidad como soporte (la rana puede subirse) pero inicializar `event.engulfTimer = 0` y `event.triggered = true`.
     - En `updateSpecialEvents()`: si `event.triggered && event.kind === 'croc'`, incrementar `event.engulfTimer += dt`; si `event.engulfTimer >= 1500`, llamar `killFrog()`.
     - Si la rana sale del cocodrilo (cambia de celda de soporte) antes de los 1500 ms, resetear `event.triggered = false` y `event.engulfTimer = 0`.
       Verificación: en nivel 3+, el cocodrilo aparece ocasionalmente; la rana muere si permanece 1.5 s encima.

3. **Implementar power-ups** — añadir `updatePowerUp(now: number)` llamado desde `update()`:
   - **Aparición** — en `completeGoal()` (cuando se ocupa una boca destino): si `pendingPowerUp === null && Math.random() < 0.25`, crear un `PowerUp` con tipo aleatorio de los tres disponibles, columna aleatoria entre 2 y 13 (dentro de la fila segura central), `spawnedAt = now`, `expiresAt = now + 8000`, `active = true`.
   - **Recogida** — en `update()`, tras completar el salto de la rana a `ROW_SAFE_MID`: si `pendingPowerUp?.active && pendingPowerUp.col === frog.col`, aplicar el efecto y marcar `pendingPowerUp.active = false`.
   - **Expiración** — en `updatePowerUp()`: si `now >= pendingPowerUp.expiresAt`, marcar `active = false` y `pendingPowerUp = null`.
   - **Efectos**:
     - `helmet`: crear `activeEffect = { type: 'helmet', expiresAt: now + 5000 }`. En `checkRoadCollision()`: si hay un efecto `helmet` activo, absorber el impacto (no llamar `killFrog()`), eliminar el efecto inmediatamente. Dibujar un círculo amarillo (radio 14 px) con borde naranja encima de la rana mientras esté activo.
     - `slowdown`: crear `activeEffect = { type: 'slowdown', expiresAt: now + 5000 }`. En `update()`, multiplicar el `dt` efectivo de movimiento de entidades por `0.6` mientras esté activo. Dibujar una capa rectangular semitransparente azul (`rgba(0,100,255,0.15)`) sobre cada carril mientras esté activo; mostrar un reloj de arena azul (triángulos canvas) en la esquina superior izquierda del HUD.
     - `long-jump`: crear `activeEffect = { type: 'long-jump', expiresAt: now + 30000 }` (expira en 30 s si no se usa). Al procesar el próximo input de dirección, si el efecto está activo, hacer `targetRow = frog.row - 2` (o la dirección correspondiente ×2), consumir el efecto (`activeEffect = null`). Dibujar dos flechas verdes apiladas encima de la rana mientras esté disponible.
   - **Caducidad del efecto activo** — en `updatePowerUp()`: si `activeEffect !== null && now >= activeEffect.expiresAt`, asignar `activeEffect = null`.

4. **Dibujo de power-ups en `draw()`**:
   - Si `pendingPowerUp?.active`: dibujar en `(pendingPowerUp.col * CELL + CELL/2, ROW_SAFE_MID * CELL + CELL/2)` un ícono según el tipo:
     - `helmet`: círculo amarillo (radio 12 px) + semicírculo naranja en la parte superior.
     - `slowdown`: dos triángulos equiláteros enfrentados (reloj de arena) azules de 20 × 20 px.
     - `long-jump`: dos rectángulos con punta de flecha (↑↑) verdes de 8 × 16 px cada uno.
   - En los últimos 2 s antes de expirar (`expiresAt - now < 2000`), hacer parpadear el ícono (`Math.sin(now / 120) > 0`).

5. **Verificación integral**:
   - Nivel 1: sin cocodrilo, sin moscas de alta frecuencia, velocidades base.
   - Nivel 3+: cocodrilo aparece ocasionalmente en el río; mata tras 1.5 s de contacto.
   - Al completar bocas: power-up aparece ~25 % de las veces en la fila segura.
   - `helmet` absorbe exactamente un impacto de coche/camión.
   - `slowdown` reduce visiblemente la velocidad de las entidades; vuelve a la normal al expirar.
   - `long-jump` consume exactamente un salto doble.
   - La mosca bonus suma 200 pts y desaparece al ser recogida; desaparece sola si no se recoge en 6 s.
   - `npm run build` termina sin errores de TypeScript.

---

## Acceptance criteria

- [ ] `LEVEL_CONFIG` existe como objeto de sólo lectura con entradas del nivel 1 al 10.
- [ ] `getLevelParams(level)` devuelve el config del nivel 10 para cualquier nivel ≥ 10.
- [ ] En nivel 1, las velocidades de carretera y río coinciden con los valores base (multiplicador 1.0).
- [ ] En nivel 5, la velocidad de carretera es 1.5× la base; en nivel 10, 2.56×.
- [ ] El temporizador de ronda en nivel 1 es 30 s; en nivel 10, 12 s.
- [ ] El intervalo de inmersión de tortugas en nivel 1 es 3000 ms; en nivel 10, 1200 ms.
- [ ] La mosca bonus aparece visualmente sobre una boca destino libre con probabilidad ≈40 % al completar cada boca.
- [ ] La mosca parpadea en los últimos 2 s antes de desaparecer.
- [ ] Al llegar la rana a la boca con mosca activa, se suman 200 pts adicionales.
- [ ] Si la mosca no se recoge en 6 s, desaparece sin penalización.
- [ ] El cocodrilo disfrazado no aparece en niveles 1 y 2.
- [ ] A partir del nivel 3, el cocodrilo aparece ocasionalmente en un carril de río con visualización diferenciada (ojos rojos).
- [ ] La rana puede subirse al cocodrilo sin efecto inmediato.
- [ ] Tras 1.5 s encima del cocodrilo, la rana muere.
- [ ] Si la rana abandona el cocodrilo antes de 1.5 s, el contador se resetea.
- [ ] Un power-up aparece con probabilidad ≈25 % al completar cada boca destino.
- [ ] No puede haber más de un power-up activo en pantalla a la vez.
- [ ] El power-up parpadea en los últimos 2 s de su duración de 8 s.
- [ ] Si no se recoge en 8 s, el power-up desaparece sin efecto.
- [ ] `helmet` dibuja un ícono amarillo/naranja encima de la rana mientras está activo.
- [ ] `helmet` absorbe exactamente un impacto de vehículo y desaparece; el segundo impacto mata.
- [ ] `helmet` expira a los 5 s si no absorbe ningún impacto.
- [ ] `slowdown` reduce la velocidad de todas las entidades en un 40 % durante 5 s.
- [ ] `slowdown` tiñe visualmente los carriles de azul semitransparente mientras está activo.
- [ ] `slowdown` devuelve las velocidades a la normalidad al expirar.
- [ ] `long-jump` consume el próximo salto haciéndolo de 2 celdas.
- [ ] `long-jump` expira a los 30 s si no se usa.
- [ ] Recoger `long-jump` dibuja flechas dobles verdes encima de la rana.
- [ ] Las flechas desaparecen al consumir el salto o al expirar.
- [ ] `npm run build` completa sin errores de TypeScript.
- [ ] Ninguna ruta existente devuelve 500.

---

## Decisions

- **Sí: `LEVEL_CONFIG` como tabla discreta** — en lugar de `speed * 1.15^n`. Razón: los valores discretos permiten al diseñador ajustar cada nivel individualmente sin que un cambio en la fórmula rompa todos los niveles; también facilita el playtesting (se pueden imprimir en consola directamente).

- **Sí: Tres power-ups temáticos** — `helmet`, `slowdown`, `long-jump`. Razón: cubren las tres dimensiones de dificultad del juego (supervivencia en carretera, velocidad del río, alcance del salto); son inmediatamente legibles sin tutorial.

- **Sí: Power-up sólo en fila segura central** — aparecen en `ROW_SAFE_MID` (fila 7). Razón: la zona segura es el único lugar donde la rana puede detenerse sin riesgo; colocar power-ups allí recompensa el paso por el punto medio del recorrido sin interrumpir la mecánica de cruce.

- **Sí: Máximo un power-up activo en pantalla** — si hay uno activo, el siguiente se suprime. Razón: evitar superposición de íconos y efectos simultáneos que complicarían la legibilidad del estado del juego.

- **Sí: Cocodrilo con 1.5 s de gracia** — la rana no muere instantáneamente al subirse. Razón: sin gracia, el cocodrilo sería indistinguible de un agujero de agua y frustraría al jugador; con 1.5 s el jugador perceptivo puede reaccionar si detecta los ojos rojos a tiempo.

- **Sí: Mosca con probabilidad 40 %** — frecuencia moderada. Razón: demasiado baja sería inapreciable; demasiado alta desestabilizaría la economía de puntuación. 40 % garantiza que el jugador la vea varias veces por partida sin que sea trivial.

- **Sí: Efectos visuales dentro del canvas existente** — no se añaden elementos DOM externos. Razón: consistencia con el patrón del resto de juegos; mezclar DOM y canvas para el mismo juego crearía problemas de z-index y sincronización.

- **No: Animaciones de partículas** — se excluyen de este spec. Razón: las partículas (explosiones, destellos al recoger) son complejidad visual desproporcionada para el scope; un tercer spec puede añadirlas sin modificar la lógica de este spec.

- **No: Power-ups persistentes entre rondas** — cada ronda resetea el estado de power-ups. Razón: la progresión de dificultad por nivel ya está balanceada en `LEVEL_CONFIG`; acumular power-ups entre rondas rompería el equilibrio.

- **No: Nuevas tablas SQL** — este spec no altera el schema de Supabase. Razón: los eventos y power-ups son estado efímero de sesión; no hay nada que persistir más allá del score final que ya maneja el core.
