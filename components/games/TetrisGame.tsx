'use client';

import { useEffect, useRef } from 'react';
import type { GameApi } from './types';

// ─── Constantes del original (references/started-games/03-tetris/game.js) ────
// COLS/ROWS/BLOCK no se tocan: el tablero se escala en el contexto, así que
// todas las coordenadas de dibujo siguen siendo literalmente las de game.js.
const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const PIECES: (number[][] | null)[] = [
  null,
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], // I
  [
    [2, 2],
    [2, 2],
  ], // O
  [
    [0, 3, 0],
    [3, 3, 3],
    [0, 0, 0],
  ], // T
  [
    [0, 4, 4],
    [4, 4, 0],
    [0, 0, 0],
  ], // S
  [
    [5, 5, 0],
    [0, 5, 5],
    [0, 0, 0],
  ], // Z
  [
    [6, 0, 0],
    [6, 6, 6],
    [0, 0, 0],
  ], // J
  [
    [0, 0, 7],
    [7, 7, 7],
    [0, 0, 0],
  ], // L
  [
    [8, 8, 8],
    [8, 0, 8],
    [8, 8, 8],
  ], // N (tuerca)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// Skin Neon fijo: es la única de las cuatro que habla el idioma neón-CRT de la
// plataforma. Las otras tres definiciones y applySkin() no se portan.
const NEON_COLORS: (string | null)[] = [
  null,
  '#00ffff',
  '#ffff00',
  '#ff00ff',
  '#00ff00',
  '#ff0040',
  '#00aaff',
  '#ff8000',
  '#8000ff',
];
const BOARD_BG = '#000000';

// Valor de --grid-line del tema oscuro de 03-tetris/style.css. Se copia como
// literal porque el juego ya no vive dentro de esa hoja de estilos.
const GRID_LINE = '#22222e';

// ─── Composición del backing store 800×600 ──────────────────────────────────
// El tablero es 1:2 y .crt-screen es 4:3, así que los dos canvas del original
// (tablero 300×600 + preview 120×120) se componen en un único frame 800×600.
const W = 800;
const H = 600;

const BOARD_SCALE = 0.9;
const BOARD_X = 265;
const BOARD_Y = 30;
const BOARD_W = COLS * BLOCK * BOARD_SCALE; // 270
const BOARD_H = ROWS * BLOCK * BOARD_SCALE; // 540

const NEXT_X = 585;
const NEXT_Y = 90;
const NEXT_SIZE = 120;

const COMBO_X = 585;
const COMBO_Y = 260;
const COMBO_W = 185;
const COMBO_H = 90;

const HUD_X = 30;

// Paleta de la plataforma (app/globals.css), para el chrome del canvas.
const INK_DIM = '#8a8fb5';
const INK_FAINT = '#4a4f70';
const CYAN = '#00f5ff';
const YELLOW = '#f5ff00';
const GREEN = '#00ff88';
const MAGENTA = '#ff006e';

interface Piece {
  type: number;
  shape: number[][];
  x: number;
  y: number;
}

type State = 'start' | 'playing' | 'gameover';

export default function TetrisGame({
  paused,
  onScoreChange,
  onLivesChange,
  onLevelChange,
  onGameOver,
}: GameApi) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Refs para que el loop lea siempre las props vigentes sin re-ejecutar el effect
  const pausedRef = useRef(paused);
  const cbScore = useRef(onScoreChange);
  const cbLines = useRef(onLivesChange);
  const cbLevel = useRef(onLevelChange);
  const cbOver = useRef(onGameOver);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    cbScore.current = onScoreChange;
  }, [onScoreChange]);
  useEffect(() => {
    cbLines.current = onLivesChange;
  }, [onLivesChange]);
  useEffect(() => {
    cbLevel.current = onLevelChange;
  }, [onLevelChange]);
  useEffect(() => {
    cbOver.current = onGameOver;
  }, [onGameOver]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    // ── Estado del juego (era ámbito de módulo en game.js) ──────────────────
    let board: number[][];
    let current: Piece;
    let next: Piece;
    let score: number;
    let lines: number;
    let level: number;
    let dropAccum: number;
    let dropInterval: number;
    let maxCombo: number;
    let currentCombo: number;
    let lastClearWasCombo: boolean;
    let startLevel = 1;
    let state: State = 'start';
    let frame = 0;

    // ── Puente a React: sentinelas de cambio y latch de fin de partida ──────
    let gameOverFired = false;
    let prevScore = -1;
    let prevLines = -1;
    let prevLevel = -1;

    // ── Lógica del juego: copiada de game.js sin modificar ──────────────────
    function createBoard(): number[][] {
      return Array.from({ length: ROWS }, () =>
        new Array<number>(COLS).fill(0),
      );
    }

    function randomPiece(): Piece {
      const type = Math.floor(Math.random() * 8) + 1;
      const shape = PIECES[type]!.map((row) => [...row]);
      return {
        type,
        shape,
        x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
        y: 0,
      };
    }

    function collide(shape: number[][], ox: number, oy: number): boolean {
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue;
          const nx = ox + c;
          const ny = oy + r;
          if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
          if (ny >= 0 && board[ny][nx]) return true;
        }
      }
      return false;
    }

    function rotateCW(shape: number[][]): number[][] {
      const rows = shape.length,
        cols = shape[0].length;
      const result = Array.from({ length: cols }, () =>
        new Array<number>(rows).fill(0),
      );
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) result[c][rows - 1 - r] = shape[r][c];
      return result;
    }

    function tryRotate() {
      const rotated = rotateCW(current.shape);
      const kicks = [0, -1, 1, -2, 2];
      for (const kick of kicks) {
        if (!collide(rotated, current.x + kick, current.y)) {
          current.shape = rotated;
          current.x += kick;
          return;
        }
      }
    }

    function merge() {
      for (let r = 0; r < current.shape.length; r++)
        for (let c = 0; c < current.shape[r].length; c++)
          if (current.shape[r][c])
            board[current.y + r][current.x + c] = current.shape[r][c];
    }

    function clearLines() {
      let cleared = 0;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r].every((v) => v !== 0)) {
          board.splice(r, 1);
          board.unshift(new Array<number>(COLS).fill(0));
          cleared++;
          r++;
        }
      }
      if (cleared) {
        lines += cleared;
        score += (LINE_SCORES[cleared] || 0) * level;
        level = Math.floor(lines / 10) + 1;
        dropInterval = Math.max(100, 1000 - (level - 1) * 90);
        if (lastClearWasCombo) {
          currentCombo++;
        } else {
          currentCombo = 1;
        }
        lastClearWasCombo = true;
        if (currentCombo > maxCombo) maxCombo = currentCombo;
        // updateHUD() eliminado — los valores viajan por los callbacks
      } else {
        lastClearWasCombo = false;
      }
    }

    // Se conserva aunque la ghost piece ya no se dibuje: hardDrop() la necesita.
    function ghostY(): number {
      let gy = current.y;
      while (!collide(current.shape, current.x, gy + 1)) gy++;
      return gy;
    }

    function hardDrop() {
      const gy = ghostY();
      score += (gy - current.y) * 2;
      current.y = gy;
      lockPiece();
    }

    function softDrop() {
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
        score += 1;
        // updateHUD() eliminado
      } else {
        lockPiece();
      }
    }

    function lockPiece() {
      merge();
      clearLines();
      spawn();
    }

    function spawn() {
      current = next;
      next = randomPiece();
      if (collide(current.shape, current.x, current.y)) {
        endGame();
      }
      // drawNext() eliminado — el preview se recompone en cada frame de draw()
    }

    function endGame() {
      // Sólo marca el estado. El modal de fin de partida es el de PlayShell y
      // el loop sigue vivo (un único dueño de rafId).
      state = 'gameover';
    }

    // ── Dibujo ──────────────────────────────────────────────────────────────
    function drawBlock(
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      colorIndex: number,
      size: number,
      alpha?: number,
    ) {
      if (!colorIndex) return;
      const color = NEON_COLORS[colorIndex]!;
      const a = alpha ?? 1;
      context.globalAlpha = a;
      context.shadowBlur = a < 0.5 ? 8 : 15;
      context.shadowColor = color;
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      context.fillStyle = `rgba(${r},${g},${b},0.55)`;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      context.strokeStyle = color;
      context.lineWidth = 1.5;
      context.strokeRect(
        x * size + 1.75,
        y * size + 1.75,
        size - 3.5,
        size - 3.5,
      );
      context.shadowBlur = 0;
      context.globalAlpha = 1;
    }

    function drawGrid() {
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth = 0.5;
      for (let c = 1; c < COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(c * BLOCK, 0);
        ctx.lineTo(c * BLOCK, ROWS * BLOCK);
        ctx.stroke();
      }
      for (let r = 1; r < ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * BLOCK);
        ctx.lineTo(COLS * BLOCK, r * BLOCK);
        ctx.stroke();
      }
    }

    function drawPanel(x: number, y: number, w: number, h: number) {
      ctx.fillStyle = BOARD_BG;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(0,245,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }

    function drawStat(label: string, value: string, y: number, color: string) {
      ctx.textAlign = 'left';
      ctx.font = '12px monospace';
      ctx.fillStyle = INK_DIM;
      ctx.fillText(label, HUD_X, y);
      ctx.font = 'bold 30px monospace';
      ctx.fillStyle = color;
      ctx.shadowBlur = 12;
      ctx.shadowColor = color;
      ctx.fillText(value, HUD_X, y + 32);
      ctx.shadowBlur = 0;
    }

    function drawSideHUD() {
      drawStat('SCORE', score.toLocaleString('es-ES'), 76, CYAN);
      drawStat('LÍNEAS', String(lines), 168, YELLOW);
      drawStat('NIVEL', String(level).padStart(2, '0'), 260, GREEN);

      ctx.textAlign = 'left';
      ctx.font = '10px monospace';
      ctx.fillStyle = INK_FAINT;
      const help = ['← →  MOVER', '↑ / X  ROTAR', '↓  BAJAR', 'ESPACIO  SOLTAR'];
      help.forEach((t, i) => ctx.fillText(t, HUD_X, 430 + i * 18));
    }

    function drawNextPanel() {
      ctx.textAlign = 'left';
      ctx.font = '12px monospace';
      ctx.fillStyle = INK_DIM;
      ctx.fillText('NEXT', NEXT_X, NEXT_Y - 12);

      drawPanel(NEXT_X, NEXT_Y, NEXT_SIZE, NEXT_SIZE);

      const NB = 30;
      ctx.save();
      ctx.translate(NEXT_X, NEXT_Y);
      const shape = next.shape;
      const offX = Math.floor((4 - shape[0].length) / 2);
      const offY = Math.floor((4 - shape.length) / 2);
      for (let r = 0; r < shape.length; r++)
        for (let c = 0; c < shape[r].length; c++)
          drawBlock(ctx, offX + c, offY + r, shape[r][c], NB);
      ctx.restore();
    }

    function drawComboPanel() {
      drawPanel(COMBO_X, COMBO_Y, COMBO_W, COMBO_H);

      ctx.textAlign = 'left';
      ctx.font = '12px monospace';
      ctx.fillStyle = INK_DIM;
      ctx.fillText('COMBO', COMBO_X + 14, COMBO_Y + 26);

      // La cadena se rompe cuando una pieza bloquea sin limpiar: clearLines()
      // baja lastClearWasCombo pero deja currentCombo en pie (lógica original,
      // que no se toca), así que el reinicio visual se deriva aquí.
      const shown = lastClearWasCombo ? currentCombo : 0;
      const hot = shown > 1;
      ctx.font = 'bold 26px monospace';
      ctx.fillStyle = hot ? MAGENTA : INK_FAINT;
      if (hot) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = MAGENTA;
      }
      ctx.fillText(`x${shown}`, COMBO_X + 14, COMBO_Y + 58);
      ctx.shadowBlur = 0;

      ctx.font = '11px monospace';
      ctx.fillStyle = INK_FAINT;
      ctx.fillText(`MÁX  x${maxCombo}`, COMBO_X + 14, COMBO_Y + 78);
    }

    function drawStartScreen() {
      ctx.textAlign = 'center';

      ctx.font = 'bold 64px monospace';
      ctx.fillStyle = CYAN;
      ctx.shadowBlur = 24;
      ctx.shadowColor = CYAN;
      ctx.fillText('TETRIS', W / 2, 180);
      ctx.shadowBlur = 0;

      ctx.font = '13px monospace';
      ctx.fillStyle = INK_DIM;
      ctx.fillText(
        'ENCAJA LAS PIEZAS ANTES DE QUE EL POZO SE TE LLENE',
        W / 2,
        218,
      );

      ctx.font = '12px monospace';
      ctx.fillStyle = INK_DIM;
      ctx.fillText('NIVEL INICIAL', W / 2, 300);

      ctx.font = 'bold 52px monospace';
      ctx.fillStyle = YELLOW;
      ctx.shadowBlur = 16;
      ctx.shadowColor = YELLOW;
      ctx.fillText(String(startLevel).padStart(2, '0'), W / 2, 356);
      ctx.shadowBlur = 0;

      ctx.font = 'bold 28px monospace';
      ctx.fillStyle = startLevel > 1 ? CYAN : '#2a2e45';
      ctx.fillText('◀', W / 2 - 78, 350);
      ctx.fillStyle = startLevel < 15 ? CYAN : '#2a2e45';
      ctx.fillText('▶', W / 2 + 78, 350);

      ctx.font = '11px monospace';
      ctx.fillStyle = INK_FAINT;
      ctx.fillText('← →  AJUSTAR NIVEL  ·  1 – 15', W / 2, 392);

      if (Math.floor(frame / 30) % 2 === 0) {
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = GREEN;
        ctx.shadowBlur = 12;
        ctx.shadowColor = GREEN;
        ctx.fillText('PULSA ENTER O ESPACIO PARA EMPEZAR', W / 2, 468);
        ctx.shadowBlur = 0;
      }

      ctx.font = '10px monospace';
      ctx.fillStyle = INK_FAINT;
      ctx.fillText(
        '← →  MOVER   ·   ↑ / X  ROTAR   ·   ↓  BAJAR   ·   ESPACIO  SOLTAR',
        W / 2,
        548,
      );
    }

    function draw() {
      ctx.fillStyle = '#05050c';
      ctx.fillRect(0, 0, W, H);

      if (state === 'start') {
        drawStartScreen();
        return;
      }

      // Tablero: translate + scale, de modo que drawGrid() y drawBlock() sigan
      // usando exactamente las coordenadas del original.
      drawPanel(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);
      ctx.save();
      ctx.translate(BOARD_X, BOARD_Y);
      ctx.scale(BOARD_SCALE, BOARD_SCALE);

      drawGrid();

      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          drawBlock(ctx, c, r, board[r][c], BLOCK);

      // ghost piece eliminada (fuera de alcance del spec 07)

      for (let r = 0; r < current.shape.length; r++)
        for (let c = 0; c < current.shape[r].length; c++)
          drawBlock(
            ctx,
            current.x + c,
            current.y + r,
            current.shape[r][c],
            BLOCK,
          );

      ctx.restore();

      drawSideHUD();
      drawNextPanel();
      drawComboPanel();
      // Overlay GAME OVER en canvas eliminado — lo sustituye el modal de PlayShell
    }

    // ── Arranque / reinicio ─────────────────────────────────────────────────
    function resetCommon() {
      board = createBoard();
      score = 0;
      lines = 0;
      level = startLevel;
      dropInterval = Math.max(100, 1000 - (startLevel - 1) * 90);
      dropAccum = 0;
      maxCombo = 0;
      currentCombo = 0;
      lastClearWasCombo = false;
      gameOverFired = false;
      prevScore = -1;
      prevLines = -1;
      prevLevel = -1;
    }

    function showStartScreen() {
      resetCommon();
      state = 'start';
    }

    function initGame() {
      resetCommon();
      state = 'playing'; // antes de spawn(): spawn() puede llamar a endGame()
      next = randomPiece();
      spawn();
    }

    // ── Entrada ─────────────────────────────────────────────────────────────
    const SCROLL_KEYS = [
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Space',
    ];

    // ESPACIO arranca la partida desde la pantalla de inicio y además es el hard
    // drop. Sin este pestillo, mantenerlo pulsado encadenaría un hard drop por
    // cada repetición del teclado y la partida moriría antes de soltarlo.
    let spaceHeld = false;

    function onKeyDown(e: KeyboardEvent) {
      if (SCROLL_KEYS.includes(e.code)) e.preventDefault();

      // El movimiento vive en este handler, así que la pausa se aplica aquí
      // además de alrededor de la actualización dentro de loop().
      if (pausedRef.current) return;

      if (state === 'start') {
        if (e.code === 'ArrowLeft') {
          if (startLevel > 1) {
            startLevel--;
            level = startLevel;
          }
        } else if (e.code === 'ArrowRight') {
          if (startLevel < 15) {
            startLevel++;
            level = startLevel;
          }
        } else if (e.code === 'Enter' || e.code === 'Space') {
          if (e.code === 'Space') spaceHeld = true;
          initGame();
        }
        return;
      }

      if (state !== 'playing') return;

      switch (e.code) {
        case 'ArrowLeft':
          if (!collide(current.shape, current.x - 1, current.y)) current.x--;
          break;
        case 'ArrowRight':
          if (!collide(current.shape, current.x + 1, current.y)) current.x++;
          break;
        case 'ArrowDown':
          softDrop();
          break;
        case 'ArrowUp':
        case 'KeyX':
          tryRotate();
          break;
        case 'Space':
          if (!spaceHeld) hardDrop();
          break;
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') spaceHeld = false;
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ── Loop ────────────────────────────────────────────────────────────────
    let rafId = 0;
    let lastTime: number | null = null;

    function loop(ts: number) {
      // dt en milisegundos contra dropInterval, como el original, pero con el
      // delta crudo limitado: volver de otra pestaña no dispara una cascada.
      const dt = lastTime === null ? 0 : Math.min(ts - lastTime, 50);
      lastTime = ts;
      frame++;

      if (!pausedRef.current && state === 'playing') {
        dropAccum += dt;
        if (dropAccum >= dropInterval) {
          dropAccum = 0;
          if (!collide(current.shape, current.x, current.y + 1)) {
            current.y++;
          } else {
            lockPiece();
          }
        }
      }

      draw();

      if (score !== prevScore) {
        cbScore.current(score);
        prevScore = score;
      }
      if (lines !== prevLines) {
        cbLines.current(lines);
        prevLines = lines;
      }
      if (level !== prevLevel) {
        cbLevel.current(level);
        prevLevel = level;
      }
      if (state === 'gameover' && !gameOverFired) {
        gameOverFired = true;
        cbOver.current(score);
      }

      rafId = requestAnimationFrame(loop);
    }

    showStartScreen();
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={600}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: 'contain',
      }}
    />
  );
}
