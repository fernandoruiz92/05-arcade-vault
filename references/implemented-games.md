# Juegos implementados

Estado actual de la tabla `games` en Supabase — 4 juegos publicados en Arcade Vault.

## ASTEROIDS

- **id**: `asteroids`
- **Categoría**: SHOOTER
- **Color**: yellow
- **Descripción corta**: Pulveriza asteroides en gravedad cero.
- **Descripción larga**: Pilotea tu nave a través de un campo de asteroides a la deriva. Dispara para fragmentarlos antes de que colisionen contigo, cuida tus vidas y sobrevive tantas oleadas como puedas mientras la dificultad aumenta con cada nivel.
- **Ruta de juego**: `app/games/asteroids/play`
- **Componente**: `components/games/AsteroidsGame.tsx`
- **Alta en la plataforma**: 2026-08-06
- **Puntuaciones registradas**: 2 (mejor puntuación: 2320)

## TETRIS

- **id**: `tetris`
- **Categoría**: PUZZLE
- **Color**: cyan
- **Descripción corta**: Encaja las piezas antes de que el pozo se te llene.
- **Descripción larga**: Siete tetrominós y una tuerca metálica caen sin descanso en un pozo de diez columnas. Rota, desplaza y suéltalas para completar líneas: cada diez líneas sube el nivel y la caída se acelera. Encadena limpiezas seguidas para inflar el combo.
- **Ruta de juego**: `app/games/tetris/play`
- **Componente**: `components/games/TetrisGame.tsx`
- **Alta en la plataforma**: 2026-08-13
- **Puntuaciones registradas**: 2 (mejor puntuación: 126)

## ARKANOID

- **id**: `arkanoid`
- **Categoría**: ARCADE
- **Color**: magenta
- **Descripción corta**: Rompe el muro antes de que la bola te rompa a ti.
- **Descripción larga**: Cinco muros de ladrillos te separan del final. Mueve la paleta para devolver la bola, abre brechas en la formación y pulveriza cada bloque antes de quedarte sin vidas. Cada nivel estrena un patrón distinto y una bola más rápida que la anterior.
- **Ruta de juego**: `app/games/arkanoid/play`
- **Componente**: `components/games/ArkanoidGame.tsx` (+ `arkanoid/levels.ts`, `arkanoid/spritesheet.ts`)
- **Alta en la plataforma**: 2026-08-13
- **Puntuaciones registradas**: 1 (mejor puntuación: 160)

## SNAKE

- **id**: `snake`
- **Categoría**: ARCADE
- **Color**: green
- **Descripción corta**: Come, crece y no te muerdas la cola.
- **Descripción larga**: Guía a la serpiente por el tablero para devorar fruta tras fruta. Cada bocado la alarga y acelera el ritmo del juego — un golpe contra el borde o contra tu propio cuerpo termina la partida al instante.
- **Ruta de juego**: `app/games/snake/play`
- **Componente**: `components/games/SnakeGame.tsx` (+ `snake/sprites.ts`)
- **Alta en la plataforma**: 2026-08-14
- **Puntuaciones registradas**: 1 (mejor puntuación: 150)

---

Todos siguen el mismo patrón: componente de juego que implementa el contrato `GameApi` (`components/games/types.ts`), envuelto en `components/games/PlayShell.tsx` para el HUD/pausa/game-over/persistencia de score, y registrados como fila en la tabla `games` de Supabase. Ver `.claude/skills/add-game/platform-contract.md` para el contrato completo.
