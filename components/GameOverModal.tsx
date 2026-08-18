"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";

export default function GameOverModal({
  score,
  gameId,
  onRestart,
}: {
  score: number;
  gameId: string;
  onRestart: () => void;
}) {
  const router = useRouter();
  const { user, saveScore } = useSession();
  const [name, setName] = useState(user ? user.name : "INVITADO");
  const [saved, setSaved] = useState(false);

  const save = () => {
    saveScore({ game: gameId, score, name });
    setSaved(true);
  };

  return (
    <div className="modal-bd">
      <div className="modal">
        <h2>FIN DEL JUEGO</h2>
        <div className="final-label">PUNTUACIÓN FINAL</div>
        <div className="final">{score.toLocaleString("es-ES")}</div>
        {!saved ? (
          <div className="input-row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase().slice(0, 10))}
              placeholder="TUS INICIALES"
            />
            <button className="btn yellow" onClick={save}>
              GUARDAR PUNTUACIÓN
            </button>
          </div>
        ) : (
          <div className="toast-saved">▸ PUNTUACIÓN GUARDADA_</div>
        )}
        <div className="actions">
          <button className="btn" onClick={onRestart}>
            JUGAR DE NUEVO
          </button>
          <button className="btn" onClick={() => router.push("/hall-of-fame")}>
            SALÓN DE LA FAMA
          </button>
          <button className="btn magenta" onClick={() => router.push("/")}>
            VOLVER AL VAULT
          </button>
        </div>
      </div>
    </div>
  );
}
