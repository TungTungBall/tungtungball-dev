import type { ReactNode } from "react";
import { AppShell } from "@/components/healthmith/app-shell";
import { PreviewProvider } from "@/components/healthmith/preview-provider";
import "@/components/healthmith/healthmith.css";

export default function ExperienceLayout({ children }: { children: ReactNode }) {
  return <PreviewProvider><AppShell>{children}</AppShell></PreviewProvider>;
}
