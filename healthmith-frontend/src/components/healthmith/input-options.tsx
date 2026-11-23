"use client";
import type { ReactNode } from "react";
export function InputOptions<T extends string | number>({ label, values, selected, onChange, multiple = false, hint }: {
  label: string; values: readonly T[]; selected: readonly T[]; onChange: (value: T) => void; multiple?: boolean; hint?: ReactNode;
}) {
  return <fieldset className="hm-input-options"><legend>{label}</legend>{hint && <p className="hm-helper">{hint}</p>}<div className="hm-option-list">
    {values.map(value => <button key={value} type="button" aria-pressed={selected.includes(value)} onClick={() => onChange(value)}>{value}</button>)}
  </div>{multiple && <span className="sr-only">여러 개 선택할 수 있어요.</span>}</fieldset>;
}
