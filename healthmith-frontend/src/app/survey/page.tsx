import type { Metadata } from "next";
import { DetailedSurveyForm } from "./detailed-survey-form";
export const metadata: Metadata = { title: "사전조사 | 헬스미스" };
export default function SurveyPage() { return <DetailedSurveyForm />; }
