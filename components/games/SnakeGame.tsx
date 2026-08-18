'use client';

import { useEffect, useRef } from 'react';
import type { GameApi } from './types';
import { SPRITE_ATLAS } from './snake/sprites';

// ─── Tablero: cuadrícula clásica, backing store 800×600 (4:3, como .crt-screen) ──
const COLS = 32;
const ROWS = 24;
const CELL = 25;
const W = COLS * CELL; // 800
const H = ROWS * CELL; // 600

const START_TICK_INTERVAL = 150;
const MIN_TICK_INTERVAL = 70;
const FRUITS_PER_LEVEL = 5;
const SCORE_PER_FRUIT = 10;

// Paleta de la plataforma (app/globals.css), para el chrome del canvas.
const BOARD_BG = '#05050c';
const GRID_LINE = '#14142080';
const GREEN = '#00ff88';
const GREEN_HEAD = '#baffe0';
const CYAN = '#00f5ff';
const YELLOW = '#f5ff00';
const INK_DIM = '#8a8fb5';
const FALLBACK_FRUIT = '#ff006e';

interface Point {
  x: number;
  y: number;
}

type Direction = 'up' | 'down' | 'left' | 'right';
type GameState = 'playing' | 'gameover';

interface FruitFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FRUIT_KEYS = Object.keys(SPRITE_ATLAS.fruits) as Array<
  keyof typeof SPRITE_ATLAS.fruits
>;

const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

const DELTA: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export default function SnakeGame({
  paused,
  onScoreChange,
  onLivesChange,
  onLevelChange,
  onGameOver,
}: GameApi) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const pausedRef = useRef(paused);
  const cbScore = useRef(onScoreChange);
  const cbLives = useRef(onLivesChange);
  const cbLevel = useRef(onLevelChange);
  const cbOver = useRef(onGameOver);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    cbScore.current = onScoreChange;
  }, [onScoreChange]);
  useEffect(() => {
    cbLives.current = onLivesChange;
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

    // ── Assets: la fruta se carga async; hasta entonces se dibuja de respaldo ──
    const img = new Image();
    let imgLoaded = false;
    img.onload = () => {
      imgLoaded = true;
    };
    img.src = SPRITE_ATLAS.sources.fruits;

    // ── Estado del juego (ámbito de closure del effect, no useRef) ──────────
    let snake: Point[];
    let direction: Direction;
    let nextDirection: Direction;
    let fruit: Point;
    let fruitFrame: FruitFrame;
    let score: number;
    let level: number;
    let tickInterval: number;
    let tickAccum: number;
    let state: GameState;

    // ── Puente a React ───────────────────────────────────────────────────────
    let gameOverFired = false;
    let prevScore = -1;
    let prevLength = -1;
    let prevLevel = -1;

    function randomFruitFrame(): FruitFrame {
      const key = FRUIT_KEYS[Math.floor(Math.random() * FRUIT_KEYS.length)];
      return SPRITE_ATLAS.fruits[key];
    }

    function placeFruit() {
      const free: Point[] = [];
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (!snake.some((s) => s.x === x && s.y === y)) {
            free.push({ x, y });
          }
        }
      }
      fruit = free[Math.floor(Math.random() * free.length)];
      fruitFrame = randomFruitFrame();
    }

    function initGame() {
      const cx = Math.floor(COLS / 2);
      const cy = Math.floor(ROWS / 2);
      snake = [{ x: cx, y: cy }];
      direction = 'right';
      nextDirection = 'right';
      score = 0;
      level = 1;
      tickInterval = START_TICK_INTERVAL;
      tickAccum = 0;
      state = 'playing';
      gameOverFired = false;
      prevScore = -1;
      prevLength = -1;
      prevLevel = -1;
      placeFruit();
    }

    let fruitsEatenThisLevel = 0;

    function step() {
      if (nextDirection !== OPPOSITE[direction]) {
        direction = nextDirection;
      }

      const head = snake[0];
      const d = DELTA[direction];
      const newHead: Point = { x: head.x + d.x, y: head.y + d.y };

      if (
        newHead.x < 0 ||
        newHead.x >= COLS ||
        newHead.y < 0 ||
        newHead.y >= ROWS
      ) {
        state = 'gameover';
        return;
      }
      if (snake.some((s) => s.x === newHead.x && s.y === newHead.y)) {
        state = 'gameover';
        return;
      }

      snake.unshift(newHead);

      if (newHead.x === fruit.x && newHead.y === fruit.y) {
        score += SCORE_PER_FRUIT;
        fruitsEatenThisLevel++;
        if (fruitsEatenThisLevel >= FRUITS_PER_LEVEL) {
          fruitsEatenThisLevel = 0;
          level++;
          tickInterval = Math.max(
            MIN_TICK_INTERVAL,
            Math.round(tickInterval * 0.92),
          );
        }
        placeFruit();
        // no se recorta la cola: la serpiente crece
      } else {
        snake.pop();
      }
    }

    function drawRoundedRect(
      x: number,
      y: number,
      size: number,
      color: string,
    ) {
      const pad = 1.5;
      const r = 6;
      const rx = x * CELL + pad;
      const ry = y * CELL + pad;
      const rw = size - pad * 2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(rx, ry, rw, rw, r);
      ctx.fill();
    }

    function draw() {
      ctx.fillStyle = BOARD_BG;
      ctx.fillRect(0, 0, W, H);

      // rejilla tenue
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth = 0.5;
      for (let c = 1; c < COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(c * CELL, 0);
        ctx.lineTo(c * CELL, H);
        ctx.stroke();
      }
      for (let r = 1; r < ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * CELL);
        ctx.lineTo(W, r * CELL);
        ctx.stroke();
      }

      // fruta
      if (imgLoaded) {
        ctx.drawImage(
          img,
          fruitFrame.x,
          fruitFrame.y,
          fruitFrame.w,
          fruitFrame.h,
          fruit.x * CELL + 2,
          fruit.y * CELL + 2,
          CELL - 4,
          CELL - 4,
        );
      } else {
        ctx.fillStyle = FALLBACK_FRUIT;
        ctx.beginPath();
        ctx.arc(
          fruit.x * CELL + CELL / 2,
          fruit.y * CELL + CELL / 2,
          CELL / 2 - 3,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      // cuerpo
      snake.forEach((seg, i) => {
        drawRoundedRect(seg.x, seg.y, CELL, i === 0 ? GREEN_HEAD : GREEN);
      });

      // HUD en canvas — score izquierda, nivel centro, longitud derecha
      ctx.textAlign = 'left';
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = CYAN;
      ctx.shadowBlur = 10;
      ctx.shadowColor = CYAN;
      ctx.fillText(`SCORE ${score}`, 16, 26);

      ctx.textAlign = 'center';
      ctx.fillStyle = YELLOW;
      ctx.shadowColor = YELLOW;
      ctx.fillText(`NIVEL ${String(level).padStart(2, '0')}`, W / 2, 26);

      ctx.textAlign = 'right';
      ctx.fillStyle = INK_DIM;
      ctx.shadowBlur = 0;
      ctx.fillText(`LONGITUD ${snake.length}`, W - 16, 26);
      ctx.shadowBlur = 0;
    }

    // ── Entrada ───────────────────────────────────────────────────────────
    const ARROW_CODES = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

    function onKeyDown(e: KeyboardEvent) {
      if (ARROW_CODES.includes(e.code)) e.preventDefault();

      let dir: Direction | null = null;
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          dir = 'up';
          break;
        case 'ArrowDown':
        case 'KeyS':
          dir = 'down';
          break;
        case 'ArrowLeft':
        case 'KeyA':
          dir = 'left';
          break;
        case 'ArrowRight':
        case 'KeyD':
          dir = 'right';
          break;
      }
      if (dir && dir !== OPPOSITE[direction]) {
        nextDirection = dir;
      }
    }

    window.addEventListener('keydown', onKeyDown);

    // ── Loop ──────────────────────────────────────────────────────────────
    let rafId = 0;
    let lastTime: number | null = null;

    function loop(ts: number) {
      const dt = lastTime === null ? 0 : Math.min(ts - lastTime, 50);
      lastTime = ts;

      if (!pausedRef.current && state === 'playing') {
        tickAccum += dt;
        if (tickAccum >= tickInterval) {
          tickAccum = 0;
          step();
        }
      }

      draw();

      const length = snake.length;
      if (score !== prevScore) {
        cbScore.current(score);
        prevScore = score;
      }
      if (length !== prevLength) {
        cbLives.current(length);
        prevLength = length;
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

    initGame();
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
    />
  );
}
