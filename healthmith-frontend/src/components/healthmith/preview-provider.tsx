"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { BodyPart, Purpose, Soreness } from "@/lib/healthmith/preview-data";

type SurveyPreview = { hasLimitations: boolean; limitations: BodyPart[]; priorities: BodyPart[]; purpose: Purpose; customPurpose: string; intensity: number };
type WorkoutPreview = { stageIndex: number; repetitions: number; confirmed: boolean };
type FeedbackPreview = { soreness: Soreness[]; difficulty: number | null; enjoyment: number | null; submitted: boolean };
type PreviewContextValue = {
  survey: SurveyPreview;
  setSurvey: Dispatch<SetStateAction<SurveyPreview>>;
  workout: WorkoutPreview;
  setWorkout: Dispatch<SetStateAction<WorkoutPreview>>;
  feedback: FeedbackPreview;
  setFeedback: Dispatch<SetStateAction<FeedbackPreview>>;
};

const PreviewContext = createContext<PreviewContextValue | null>(null);

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [survey, setSurvey] = useState<SurveyPreview>({ hasLimitations: false, limitations: [], priorities: ["하체", "상체", "허리"], purpose: "체력", customPurpose: "", intensity: 5 });
  const [workout, setWorkout] = useState<WorkoutPreview>({ stageIndex: 0, repetitions: 8, confirmed: false });
  const [feedback, setFeedback] = useState<FeedbackPreview>({ soreness: ["없음"], difficulty: 3, enjoyment: 4, submitted: false });

  return <PreviewContext.Provider value={{ survey, setSurvey, workout, setWorkout, feedback, setFeedback }}>{children}</PreviewContext.Provider>;
}

export function usePreview() {
  const context = useContext(PreviewContext);
  if (!context) throw new Error("미리보기 화면은 PreviewProvider 안에서 사용해야 합니다.");
  return context;
}
