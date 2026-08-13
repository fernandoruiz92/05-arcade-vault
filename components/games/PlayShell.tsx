'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useUser } from '@/app/context/UserContext';
import { createClient } from '@/lib/supabase/client';
import type { GameApi } from './types';

export interface PlayShellProps {
  /** Debe coincidir con games.id y con la carpeta de ruta. Alimenta scores.game_id y el enlace SALIR. */
  gameId: string;
  /** Título en mayúsculas del bisel del CRT, p. ej. 'ASTEROIDS'. */
  gameTitle: string;
  children: (api: GameApi) => ReactNode;
  initialLives?: number;
  initialLevel?: number;
  /** `null` oculta el stat por completo. */
  livesLabel?: string | null;
  levelLabel?: string | null;
  livesDisplay?: 'hearts' | 'number';
}

export default function PlayShell({
  gameId,
  gameTitle,
  children,
  initialLives = 3,
  initialLevel = 1,
  livesLabel = 'Vidas',
  levelLabel = 'Nivel',
  livesDisplay = 'hearts',
}: PlayShellProps) {
  const { user } = useUser();

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(initialLives);
  const [level, setLevel] = useState(initialLevel);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [name, setName] = useState(user ?? 'INVITADO');
  const [saved, setSaved] = useState(false);
  const [gameKey, setGameKey] = useState(0);

  const onScoreChange = useCallback((s: number) => setScore(s), []);
  const onLivesChange = useCallback((l: number) => setLives(l), []);
  const onLevelChange = useCallback((l: number) => setLevel(l), []);
  const onGameOver = useCallback((finalScore: number) => {
    setScore(finalScore);
    setOver(true);
  }, []);

  useEffect(() => {
    if (over) {
      const stored = localStorage.getItem('av_player_name');
      if (stored) setName(stored);
    }
  }, [over]);

  function restart() {
    setScore(0);
    setLives(initialLives);
    setLevel(initialLevel);
    setPaused(false);
    setOver(false);
    setSaved(false);
    setName(user ?? 'INVITADO');
    setGameKey((k) => k + 1);
  }

  async function saveScore() {
    setSaved(true);
    localStorage.setItem('av_player_name', name);
    const supabase = createClient();
    await supabase.from('scores').insert({
      game_id: gameId,
      player_name: name,
      score,
      user_id: null,
    });
  }

  return (
    <div className="av-player fade-in">
      <div className="player-hud">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div className="hud-stat">
            <div className="l">Jugador</div>
            <div className="v" style={{ color: 'var(--ink)' }}>
              {name}
            </div>
          </div>
          <div className="hud-stat">
            <div className="l">Puntuación</div>
            <div className="v">{score.toLocaleString('es-ES')}</div>
          </div>
          {livesLabel !== null && (
            <div className="hud-stat lives">
              <div className="l">{livesLabel}</div>
              <div className="v">
                {livesDisplay === 'hearts'
                  ? '♥ '.repeat(Math.max(0, lives)).trim() || '—'
                  : lives.toLocaleString('es-ES')}
              </div>
            </div>
          )}
          {levelLabel !== null && (
            <div className="hud-stat level">
              <div className="l">{levelLabel}</div>
              <div className="v">{String(level).padStart(2, '0')}</div>
            </div>
          )}
        </div>
        <div className="hud-actions">
          <button className="btn yellow" onClick={() => setPaused((p) => !p)}>
            {paused ? 'REANUDAR' : 'PAUSA'}
          </button>
          <button className="btn magenta" onClick={() => setOver(true)}>
            FIN
          </button>
          <Link href={`/games/${gameId}`} className="btn ghost">
            SALIR
          </Link>
        </div>
      </div>

      <div className="crt">
        <div className="crt-screen">
          {/* la key remonta el juego en "JUGAR DE NUEVO": el effect se limpia y vuelve a correr */}
          <div key={gameKey} style={{ display: 'contents' }}>
            {children({
              paused,
              onScoreChange,
              onLivesChange,
              onLevelChange,
              onGameOver,
            })}
          </div>
          {paused && (
            <div
              className="crt-content"
              style={{ background: 'rgba(0,0,0,0.6)', zIndex: 5 }}
            >
              <div>
                <div className="pixel neon-yellow" style={{ fontSize: 22 }}>
                  EN PAUSA
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: 'var(--ink-dim)',
                    marginTop: 10,
                    letterSpacing: '0.16em',
                  }}
                >
                  PULSA REANUDAR PARA CONTINUAR
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="crt-bottom">
          <span className="led">SEÑAL OK</span>
          <span>{gameTitle} · CRT-83 · 60 HZ</span>
          <span>CARGA · 1MB</span>
        </div>
      </div>

      {over && (
        <div className="modal-bd">
          <div className="modal">
            <h2>FIN DEL JUEGO</h2>
            <div className="final-label">PUNTUACIÓN FINAL</div>
            <div className="final">{score.toLocaleString('es-ES')}</div>
            {!saved ? (
              <div className="input-row">
                <input
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value.toUpperCase().slice(0, 10))
                  }
                  placeholder="TUS INICIALES"
                />
                <button className="btn yellow" onClick={saveScore}>
                  GUARDAR PUNTUACIÓN
                </button>
              </div>
            ) : (
              <div className="toast-saved">▸ PUNTUACIÓN GUARDADA_</div>
            )}
            <div className="actions">
              <button className="btn" onClick={restart}>
                JUGAR DE NUEVO
              </button>
              <Link href="/games" className="btn magenta">
                VOLVER AL VAULT
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
