'use client';

import dynamic from 'next/dynamic';
import PlayShell from '@/components/games/PlayShell';

const AsteroidsGame = dynamic(
  () => import('@/components/games/AsteroidsGame'),
  { ssr: false },
);

export default function AsteroidsPlay() {
  return (
    <PlayShell gameId="asteroids" gameTitle="ASTEROIDS">
      {(api) => <AsteroidsGame {...api} />}
    </PlayShell>
  );
}
