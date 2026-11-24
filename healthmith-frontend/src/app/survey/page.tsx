import type { Metadata } from "next";
import { DetailedSurveyForm } from "./detailed-survey-form";
import { loadDetailedSurvey } from "./detailed-actions";
export const metadata: Metadata = { title: "사전조사 | 헬스미스" };
export default async function SurveyPage({searchParams}: {searchParams: Promise<{id?: string}>}) {
  const {id} = await searchParams;
  const result = await loadDetailedSurvey(id ?? null);
  return <DetailedSurveyForm key={id ?? "new"} initial={result?.state === "saved" ? result.submission : null} loadError={result.state !== "saved" && result.state !== "not-found" && result.state !== "unauthorized" ? result.message : null} />;
}
