import { notFound } from "next/navigation";
import GamePlayer from "@/components/GamePlayer";
import { GAMES } from "@/lib/games";

export default async function PlayerPage({ params }: PageProps<"/jugar/[id]">) {
  const { id } = await params;
  const game = GAMES.find((g) => g.id === id);

  if (!game) notFound();

  return <GamePlayer game={game} />;
}
