import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: ReactNode; description?: ReactNode }) {
  return <div className="hm-intro"><p className="hm-eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="hm-description">{description}</p>}</div>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`hm-card ${className}`}>{children}</section>;
}

export function Notice({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  return <div className={`hm-notice ${danger ? "hm-notice-danger" : ""}`}>{children}</div>;
}

export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="hm-action-bar">{children}</div>;
}

export function ActionLink({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) {
  return <Link href={href} className={`hm-action ${secondary ? "hm-action-secondary" : ""}`}>{children}</Link>;
}

export function ChoiceButton({ children, selected, onClick, disabled = false, label }: { children: ReactNode; selected: boolean; onClick: () => void; disabled?: boolean; label?: string }) {
  return <Button type="button" className={`hm-choice ${selected ? "is-selected" : ""}`} aria-pressed={selected} aria-label={label} onClick={onClick} disabled={disabled}>{children}</Button>;
}

export function StepProgress({ step }: { step: 1 | 2 }) {
  return <div className="hm-step-progress" role="img" aria-label={`사전조사 ${step} / 2 단계`}><span className="is-current" /><span className={step === 2 ? "is-current" : ""} /></div>;
}

export function PoseFigure({ small = false }: { small?: boolean }) {
  return <svg className={`hm-pose ${small ? "is-small" : ""}`} viewBox="0 0 240 260" role="img" aria-label="전신 촬영 위치를 안내하는 예시 자세"><circle cx="120" cy="32" r="12" fill="var(--hm-pose-head)" /><g stroke="var(--hm-gold)" strokeWidth="2.5" fill="none" strokeLinecap="round"><path d="M120 52 86 69 99 145 141 145 154 69 120 52M86 69 61 115M154 69 179 115M99 145 89 215M141 145 151 215" /></g><g fill="var(--hm-mint)">{[[120,52],[86,69],[154,69],[61,115],[179,115],[99,145],[141,145],[89,215],[151,215]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.5" />)}</g></svg>;
}
