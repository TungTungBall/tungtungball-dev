import PreviewPaused from "./preview-paused";
import { ConnectedWorkout } from "../connected-workout";
export default async function PausedPage({ searchParams }: { searchParams: Promise<{ sessionId?: string | string[]; connected?: string }> }) {
  const { sessionId, connected } = await searchParams;
  if (sessionId !== undefined || connected === "1") return <ConnectedWorkout sessionId={sessionId === undefined ? undefined : typeof sessionId === "string" ? sessionId : "invalid"} />;
  return <PreviewPaused />;
}
