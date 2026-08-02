import Link from "next/link";
import { notFound } from "next/navigation";
import Leaderboard from "@/components/Leaderboard";
import { GAMES } from "@/lib/games";

export default async function GameDetailPage({ params }: PageProps<"/juego/[id]">) {
  const { id } = await params;
  const game = GAMES.find((g) => g.id === id);

  if (!game) notFound();

  return (
    <div className="av-detail fade-in">
      <div>
        <div className="detail-cover">
          <div className={"cover-bg " + game.cover}></div>
        </div>
        <div className="detail-info" style={{ marginTop: 20 }}>
          <h2>{game.title}</h2>
          <div className="detail-tags">
            <span>{game.cat}</span>
          </div>
          <p>{game.long}</p>
          <div className="stat-strip">
            <div>
              <div className="l">MEJOR PUNTUACIÓN</div>
              <div className="v">{game.best.toLocaleString("es-ES")}</div>
            </div>
            <div>
              <div className="l">PARTIDAS</div>
              <div className="v">{game.plays}</div>
            </div>
            <div>
              <div className="l">CATEGORÍA</div>
              <div className="v">{game.cat}</div>
            </div>
          </div>
          <div className="detail-actions">
            <Link href={`/jugar/${game.id}`} className="btn lg pulse">
              JUGAR
            </Link>
            <Link href="/" className="btn ghost lg">
              VOLVER
            </Link>
          </div>
        </div>
      </div>
      <Leaderboard game={game} />
    </div>
  );
}
