import { RecordsView } from "./records-view";

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ state?: string | string[] }> }) {
  const { state } = await searchParams;
  const mode = state === "empty" || state === "loading" || state === "error" ? state : "populated";
  return <RecordsView mode={mode} />;
}
