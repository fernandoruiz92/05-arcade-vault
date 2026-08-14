'use client';

import dynamic from 'next/dynamic';
import PlayShell from '@/components/games/PlayShell';

const SnakeGame = dynamic(() => import('@/components/games/SnakeGame'), {
  ssr: false,
});

export default function SnakePlay() {
  return (
    <PlayShell
      gameId="snake"
      gameTitle="SNAKE"
      livesLabel="Longitud"
      livesDisplay="number"
      initialLives={1}
    >
      {(api) => <SnakeGame {...api} />}
    </PlayShell>
  );
}
