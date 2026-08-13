'use client';

import { useEffect, useRef } from 'react';
import type { GameApi } from './types';
import { LEVELS, type BlockColor } from './arkanoid/levels';
import {
  loadSpritesheet,
  drawSprite,
  drawFrame,
  EXPLOSION_FRAMES,
  EXPLOSION_DURATION,
} from './arkanoid/spritesheet';

export default function ArkanoidGame({
  paused,
  onScoreChange,
  onLivesChange,
  onLevelChange,
  onGameOver,
}: GameApi) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Refs so the game loop always reads the latest prop values without re-running the effect
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

    // ── Constants ────────────────────────────────────────────────────────────
    const PADDLE_SPEED = 560; // porting-recipe: subido de 400 a 560 — compensa quitar el ratón
    const BLOCK_COLS = 10;
    const BLOCK_W = 64;
    const BLOCK_H = 24;
    const BLOCKS_ORIGIN_X = (canvas.width - BLOCK_COLS * BLOCK_W) / 2;
    const BLOCKS_ORIGIN_Y = 80;
    const BASE_BALL_VX = 200;
    const BASE_BALL_VY = -300;

    // ── Sound ────────────────────────────────────────────────────────────────
    const bounceSound = new Audio('/games/arkanoid/ball-bounce.mp3');
    const breakSound = new Audio('/games/arkanoid/break-sound.mp3');
    function playSound(sound: HTMLAudioElement) {
      (sound.cloneNode() as HTMLAudioElement).play().catch(() => {});
    }

    // ── Game state ───────────────────────────────────────────────────────────
    interface Block {
      x: number;
      y: number;
      w: number;
      h: number;
      color: BlockColor;
      alive: boolean;
    }
    interface Explosion {
      x: number;
      y: number;
      w: number;
      h: number;
      color: BlockColor;
      elapsed: number;
    }
    type GameState = 'playing' | 'gameover' | 'win';

    const paddle = { x: 0, y: 560, w: 81, h: 14 };
    const ball = { x: 0, y: 0, w: 16, h: 16, vx: 200, vy: -300 };

    let blocks: Block[] = [];
    let explosions: Explosion[] = [];
    let lives: number, score: number, gameState: GameState, currentLevel: number;
    let gameOverFired = false;
    let prevScore = -1,
      prevLives = -1,
      prevLevel = -1;

    const keys: Record<'ArrowLeft' | 'ArrowRight', boolean> = {
      ArrowLeft: false,
      ArrowRight: false,
    };

    function initPaddle() {
      paddle.x = (canvas.width - paddle.w) / 2;
    }

    function loadLevel(n: number) {
      currentLevel = n;
      const level = LEVELS[n - 1];
      blocks = level.blocks.map((b) => ({
        x: BLOCKS_ORIGIN_X + b.col * BLOCK_W,
        y: BLOCKS_ORIGIN_Y + b.row * BLOCK_H,
        w: BLOCK_W,
        h: BLOCK_H,
        color: b.color,
        alive: true,
      }));
      explosions = [];
      ball.x = paddle.x + (paddle.w - ball.w) / 2;
      ball.y = paddle.y - ball.h;
      ball.vx = BASE_BALL_VX * level.speed;
      ball.vy = BASE_BALL_VY * level.speed;
    }

    function initGame() {
      score = 0;
      lives = 3;
      gameState = 'playing';
      gameOverFired = false;
      prevScore = -1;
      prevLives = -1;
      prevLevel = -1;
      initPaddle();
      loadLevel(1);
    }

    function collideAABB(block: Block) {
      return (
        ball.x < block.x + block.w &&
        ball.x + ball.w > block.x &&
        ball.y < block.y + block.h &&
        ball.y + ball.h > block.y
      );
    }

    // ── Input ────────────────────────────────────────────────────────────────
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        keys[e.key] = true;
        e.preventDefault();
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') keys[e.key] = false;
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ── Update ───────────────────────────────────────────────────────────────
    function update(dt: number) {
      if (gameState !== 'playing') return;

      // Paddle
      if (keys.ArrowLeft) paddle.x = Math.max(0, paddle.x - PADDLE_SPEED * dt);
      if (keys.ArrowRight)
        paddle.x = Math.min(
          canvas.width - paddle.w,
          paddle.x + PADDLE_SPEED * dt,
        );

      // Ball movement
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // Wall bounces (left, right, top)
      if (ball.x <= 0) {
        ball.x = 0;
        ball.vx = Math.abs(ball.vx);
        playSound(bounceSound);
      }
      if (ball.x + ball.w >= canvas.width) {
        ball.x = canvas.width - ball.w;
        ball.vx = -Math.abs(ball.vx);
        playSound(bounceSound);
      }
      if (ball.y <= 0) {
        ball.y = 0;
        ball.vy = Math.abs(ball.vy);
        playSound(bounceSound);
      }

      // Paddle bounce
      if (
        ball.vy > 0 &&
        ball.x + ball.w > paddle.x &&
        ball.x < paddle.x + paddle.w &&
        ball.y + ball.h >= paddle.y &&
        ball.y + ball.h <= paddle.y + paddle.h + 8
      ) {
        ball.y = paddle.y - ball.h;
        ball.vy = -Math.abs(ball.vy);
        playSound(bounceSound);
      }

      // Block collisions
      for (const block of blocks) {
        if (!block.alive) continue;
        if (collideAABB(block)) {
          block.alive = false;
          explosions.push({
            x: block.x,
            y: block.y,
            w: block.w,
            h: block.h,
            color: block.color,
            elapsed: 0,
          });
          score += 10;
          ball.vy = -ball.vy;
          playSound(breakSound);
          if (blocks.every((b) => !b.alive)) {
            if (currentLevel < 5) loadLevel(currentLevel + 1);
            else gameState = 'win';
          }
          break; // one block per frame
        }
      }

      // Explosions
      for (const exp of explosions) exp.elapsed += dt * 1000;
      explosions = explosions.filter((exp) => exp.elapsed < EXPLOSION_DURATION);

      // Ball lost
      if (ball.y > canvas.height) {
        lives--;
        if (lives <= 0) {
          lives = 0;
          gameState = 'gameover';
        } else {
          const speed = LEVELS[currentLevel - 1].speed;
          ball.x = paddle.x + (paddle.w - ball.w) / 2;
          ball.y = paddle.y - ball.h;
          ball.vx = BASE_BALL_VX * speed;
          ball.vy = BASE_BALL_VY * speed;
        }
      }
    }

    // ── Draw ─────────────────────────────────────────────────────────────────
    function draw() {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (const block of blocks) {
        if (block.alive)
          drawSprite(
            ctx,
            `block_${block.color}`,
            block.x,
            block.y,
            block.w,
            block.h,
          );
      }

      for (const exp of explosions) {
        const frameIndex = Math.min(
          Math.floor((exp.elapsed / EXPLOSION_DURATION) * 4),
          3,
        );
        drawFrame(
          ctx,
          EXPLOSION_FRAMES[exp.color][frameIndex],
          exp.x,
          exp.y,
          exp.w,
          exp.h,
        );
      }

      drawSprite(ctx, 'paddle', paddle.x, paddle.y, paddle.w, paddle.h);
      drawSprite(ctx, 'ball', ball.x, ball.y, ball.w, ball.h);

      if (gameState === 'playing') {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('Score: ' + score, 10, 10);
        ctx.textAlign = 'center';
        ctx.fillText('Nivel: ' + currentLevel, canvas.width / 2, 10);
        const ballSize = 16;
        const ballSpacing = 4;
        for (let i = 0; i < lives; i++) {
          const bx = canvas.width - 10 - (lives - i) * (ballSize + ballSpacing);
          drawSprite(ctx, 'ball', bx, 10, ballSize, ballSize);
        }
      }

      // GAME OVER / WIN overlay removed — React modal handles it
    }

    // ── Loop ─────────────────────────────────────────────────────────────────
    let rafId: number;
    let lastTime: number | null = null;
    let cancelled = false;

    function loop(ts: number) {
      const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
      lastTime = ts;

      if (!pausedRef.current) update(dt);
      draw();

      if (score !== prevScore) {
        cbScore.current(score);
        prevScore = score;
      }
      if (lives !== prevLives) {
        cbLives.current(lives);
        prevLives = lives;
      }
      if (currentLevel !== prevLevel) {
        cbLevel.current(currentLevel);
        prevLevel = currentLevel;
      }
      if (
        (gameState === 'gameover' || gameState === 'win') &&
        !gameOverFired
      ) {
        gameOverFired = true;
        cbOver.current(score);
      }

      rafId = requestAnimationFrame(loop);
    }

    loadSpritesheet(() => {
      if (cancelled) return;
      initGame();
      rafId = requestAnimationFrame(loop);
    });

    return () => {
      cancelled = true;
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
