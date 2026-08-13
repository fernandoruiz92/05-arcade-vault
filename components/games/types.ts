/**
 * Contrato que implementa todo componente de juego de Arcade Vault.
 *
 * La forma es fija aunque el juego no tenga vidas o niveles — lo que se adapta
 * son las *etiquetas* del HUD, no la interfaz. Tetris, por ejemplo, hace viajar
 * el contador de líneas por `onLivesChange` y su play-page lo rotula "Líneas".
 */
export interface GameApi {
  /** Cuando es `true` el juego congela la simulación pero sigue repintando. */
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
}
