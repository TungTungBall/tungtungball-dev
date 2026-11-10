import { GeneratedRoutineView } from "./view";

export default async function GenerationPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  return <GeneratedRoutineView key={requestId} requestId={requestId} />;
}
