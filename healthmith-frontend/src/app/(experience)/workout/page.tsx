import PreviewWorkout from "./preview-workout";
import { ConnectedWorkout } from "./connected-workout";
export default async function WorkoutPage({ searchParams }: { searchParams: Promise<{ sessionId?: string | string[]; connected?: string }> }) {
  const { sessionId, connected } = await searchParams;
  if (sessionId !== undefined || connected === "1") return <ConnectedWorkout sessionId={sessionId === undefined ? undefined : typeof sessionId === "string" ? sessionId : "invalid"} />;
  return <PreviewWorkout />;
}
