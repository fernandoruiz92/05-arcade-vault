import { seededScores, type Game } from "@/lib/games";

export default function Leaderboard({ game }: { game: Game }) {
  const rows = seededScores(game.id.length * 23 + 7, 10);

  return (
    <div className="leaderboard">
      <h3>CLASIFICACIÓN</h3>
      {rows.map((r, i) => (
        <div
          key={r.name + i}
          className={"lb-row" + (i === 0 ? " top1" : i === 1 ? " top2" : i === 2 ? " top3" : "")}
        >
          <div className="rk">#{String(r.rank).padStart(2, "0")}</div>
          <div className="pl">{r.name}</div>
          <div className="sc">{r.score.toLocaleString("es-ES")}</div>
        </div>
      ))}
    </div>
  );
}
