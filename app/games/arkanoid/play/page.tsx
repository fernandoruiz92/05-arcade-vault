'use client';

import dynamic from 'next/dynamic';
import PlayShell from '@/components/games/PlayShell';

const ArkanoidGame = dynamic(() => import('@/components/games/ArkanoidGame'), {
  ssr: false,
});

export default function ArkanoidPlay() {
  return (
    <PlayShell gameId="arkanoid" gameTitle="ARKANOID">
      {(api) => <ArkanoidGame {...api} />}
    </PlayShell>
  );
}
