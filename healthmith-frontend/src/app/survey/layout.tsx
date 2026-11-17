import type { ReactNode } from "react";
import { AppShell } from "@/components/healthmith/app-shell";
export default function SurveyLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
