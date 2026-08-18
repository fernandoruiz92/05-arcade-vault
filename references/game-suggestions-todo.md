# Game suggestions to-do

Log persistente de sugerencias de juegos para Arcade Vault. Mantenido por el subagente `@game-planner` (`.claude/agents/game-planner.md`).

Reglas de este archivo:

- **Solo se agrega, nunca se borra.** Cada sugerencia nueva es una fila nueva.
- Para marcar una sugerencia existente como aceptada/rechazada/implementada, se edita el campo `Status` de su fila, no se crea una fila duplicada.
- `Status` usa: `pending` (sugerida, aún sin evaluar/decidir), `accepted` (aprobada para especificar/construir vía `/spec`), `rejected` (descartada), `implemented` (ya en el catálogo).
- Las 4 filas iniciales reflejan el estado actual del catálogo (ver `references/implemented-games.md`) para que el agente arranque con contexto sin tener que releerlo cada vez.

| Date | Game | Suggested by | Cat | Color | Status | Rationale |
|---|---|---|---|---|---|---|
| 2026-08-06 | Asteroids | — | SHOOTER | yellow | implemented | Ya en catálogo — nave dispara y fragmenta asteroides en oleadas. |
| 2026-08-13 | Tetris | — | PUZZLE | cyan | implemented | Ya en catálogo — tetrominós cayendo en pozo de 10 columnas. |
| 2026-08-13 | Arkanoid | — | ARCADE | magenta | implemented | Ya en catálogo — paleta y bola rompiendo muros de ladrillos. |
| 2026-08-14 | Snake | — | ARCADE | green | implemented | Ya en catálogo — serpiente que crece comiendo fruta. |
