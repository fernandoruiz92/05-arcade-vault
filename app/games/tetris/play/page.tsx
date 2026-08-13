'use client';

import dynamic from 'next/dynamic';
import PlayShell from '@/components/games/PlayShell';

const TetrisGame = dynamic(() => import('@/components/games/TetrisGame'), {
  ssr: false,
});

export default function TetrisPlay() {
  return (
    <PlayShell
      gameId="tetris"
      gameTitle="TETRIS"
      livesLabel="Líneas"
      livesDisplay="number"
      initialLives={0}
    >
      {(api) => <TetrisGame {...api} />}
    </PlayShell>
  );
}
