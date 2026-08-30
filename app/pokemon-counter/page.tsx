'use client';

import { useEffect, useState } from 'react';

const MAX_POKEMON = 1010;

// Dos mirrors del mismo repo (PokeAPI/sprites): si uno está bloqueado por un
// proxy/firewall corporativo se reintenta con el otro antes de rendirse.
const spriteUrls = (id: number) => [
  `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/official-artwork/${id}.png`,
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
];

export default function PokemonCounterPage() {
  const [count, setCount] = useState(1);
  const [name, setName] = useState('');
  const [imgLoaded, setImgLoaded] = useState(false);
  const [srcIndex, setSrcIndex] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);

  const sources = spriteUrls(count);

  useEffect(() => {
    let cancelled = false;
    setImgLoaded(false);
    setImgFailed(false);
    setSrcIndex(0);
    setName('');

    fetch(`https://pokeapi.co/api/v2/pokemon/${count}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setName(data.name ?? '');
      })
      .catch(() => {
        if (!cancelled) setName('???');
      });

    return () => {
      cancelled = true;
    };
  }, [count]);

  const handleError = () => {
    if (srcIndex < sources.length - 1) {
      setSrcIndex((i) => i + 1);
    } else {
      setImgLoaded(true);
      setImgFailed(true);
    }
  };

  const next = () => setCount((c) => (c >= MAX_POKEMON ? 1 : c + 1));

  return (
    <div className="pk-page fade-in">
      <div className="pk-eyebrow pixel neon-yellow">
        ▸ POKÉDEX ARCADE<span className="blink">_</span>
      </div>

      <div className="pk-counter">
        <span className="pk-counter-label pixel">CONTADOR</span>
        <span className="pk-counter-n neon-cyan pixel">
          {String(count).padStart(4, '0')}
        </span>
      </div>

      <div className="crt pk-crt">
        <div className="crt-screen pk-screen">
          {!imgLoaded && (
            <div className="crt-content">
              <span className="spinner" />
            </div>
          )}
          {imgFailed && (
            <div className="crt-content pk-error">
              <span>⚠</span>
              <span className="pk-error-text">
                No se pudo cargar la imagen.
                <br />
                Revisa la consola / pestaña Red del navegador.
              </span>
            </div>
          )}
          {!imgFailed && (
            <img
              key={`${count}-${srcIndex}`}
              src={sources[srcIndex]}
              alt={name ? `Pokémon ${name}` : `Pokémon #${count}`}
              className="pk-img"
              style={{ opacity: imgLoaded ? 1 : 0 }}
              onLoad={() => setImgLoaded(true)}
              onError={handleError}
            />
          )}
        </div>
        <div className="crt-bottom">
          <span className="led">
            #{String(count).padStart(3, '0')}
          </span>
          <span className="pk-name pixel neon-magenta">
            {name || '···'}
          </span>
        </div>
      </div>

      <button className="btn xl pulse" onClick={next}>
        ▶&nbsp; SIGUIENTE POKÉMON
      </button>
    </div>
  );
}
