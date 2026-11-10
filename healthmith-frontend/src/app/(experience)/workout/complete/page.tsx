import PreviewComplete from "./preview-complete";
import { ConnectedWorkoutResult } from "./connected-result";
export default async function CompletePage({ searchParams }: { searchParams: Promise<{ sessionId?: string | string[] }> }) {
  const { sessionId } = await searchParams;
  if (sessionId !== undefined) return <ConnectedWorkoutResult sessionId={typeof sessionId === "string" ? sessionId : "invalid"} />;
  return <PreviewComplete />;
}
