import { RecordsView } from "./records-view";
import { ConnectedRecordsView } from "./connected-records";

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ state?: string | string[] }> }) {
  const { state } = await searchParams;
  if (state === "empty" || state === "loading" || state === "error" || state === "populated") {
    return <RecordsView mode={state} />;
  }
  return <ConnectedRecordsView />;
}
