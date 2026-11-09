"use client";

import { useState, useTransition } from "react";

import { submitSurvey } from "./actions";
import {
  BODY_PARTS,
  FREE_PURPOSE,
  MAX_INTENSITY,
  MIN_INTENSITY,
  PURPOSE_TYPES,
  type BodyPart,
  type FieldErrors,
  type FormField,
  type SubmitResult,
  type SurveyFormInput,
} from "./types";
import { fieldFromServerPath, validateSurvey } from "./validation";

const EMPTY_INPUT: SurveyFormInput = {
  limitationsPresent: null,
  limitationParts: [],
  purposeType: null,
  customText: "",
  intensity: "",
  priorityParts: [],
};

const fieldClass = "space-y-3 rounded-2xl border border-[#DFE3F0] bg-white p-5";
const legendClass = "px-1 text-base font-semibold text-[#202944]";
const optionClass =
  "flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border border-[#DFE3F0] px-3 text-sm has-checked:border-[#7355F5] has-checked:bg-[#ECE9FF] has-focus-visible:ring-2 has-focus-visible:ring-[#7355F5] has-disabled:cursor-not-allowed has-disabled:opacity-50";

function toggle(parts: BodyPart[], part: BodyPart): BodyPart[] {
  return parts.includes(part) ? parts.filter((item) => item !== part) : [...parts, part];
}

function errorsFromServer(result: Extract<SubmitResult, { state: "invalid" }>): FieldErrors {
  const errors: FieldErrors = {};
  for (const item of result.fieldErrors) {
    const field = fieldFromServerPath(item.field);
    if (field && !errors[field]) errors[field] = item.message;
  }
  return errors;
}

function ErrorText({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="rounded-lg bg-[#FFF0F5] px-3 py-2 text-sm text-[#AA4265]">
      {message}
    </p>
  );
}

export function SurveyForm() {
  const [input, setInput] = useState<SurveyFormInput>(EMPTY_INPUT);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (patch: Partial<SurveyFormInput>, cleared: FormField[]) => {
    setInput((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      for (const field of cleared) delete next[field];
      return next;
    });
  };

  const describedBy = (field: FormField) => (errors[field] ? `${field}-error` : undefined);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const validation = validateSurvey(input);
    if (!validation.ok) {
      setErrors(validation.errors);
      setResult(null);
      return;
    }
    setErrors({});
    setResult(null);
    startTransition(async () => {
      try {
        const response = await submitSurvey(input);
        setResult(response);
        if (response.state === "invalid") setErrors(errorsFromServer(response));
      } catch {
        setResult({
          state: "unknown",
          message: "저장되었는지 확인할 수 없어요. 새로 제출하기 전에 잠시 후 다시 확인해 주세요.",
        });
      }
    });
  };

  if (result?.state === "saved") {
    const saved = result.submission;
    return (
      <section role="status" aria-labelledby="saved-title" className="space-y-4 rounded-2xl border border-[#DFE3F0] bg-white p-6">
        <h2 id="saved-title" className="text-lg font-bold text-[#202944]">
          사전조사 내용을 저장했어요
        </h2>
        <p className="text-sm text-[#717C95]">
          맞춤 운동 초안은 아직 만들지 않았어요. 초안 만들기는 다음 기능에서 이어집니다.
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-[#717C95]">우선 부위</dt>
          <dd>{saved.answers.priority_body_parts.join(" → ")}</dd>
          <dt className="text-[#717C95]">강도</dt>
          <dd>{saved.answers.intensity}</dd>
          <dt className="text-[#717C95]">저장 시각</dt>
          <dd>{new Date(saved.created_at).toLocaleString("ko-KR")}</dd>
        </dl>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-[#DFE3F0] px-4 text-sm font-medium"
          onClick={() => {
            setInput(EMPTY_INPUT);
            setResult(null);
          }}
        >
          새로 입력하기
        </button>
      </section>
    );
  }

  const limitationsDisabled = input.limitationsPresent !== true;

  return (
    <form noValidate onSubmit={handleSubmit} aria-busy={pending} className="space-y-5">
      <fieldset className={fieldClass} aria-describedby={describedBy("limitations")}>
        <legend className={legendClass}>몸에 불편한 곳이 있나요?</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: false, label: "없어요" },
            { value: true, label: "있어요" },
          ].map((option) => (
            <label key={option.label} className={optionClass}>
              <input
                type="radio"
                name="limitations-present"
                checked={input.limitationsPresent === option.value}
                onChange={() =>
                  update(
                    { limitationsPresent: option.value, limitationParts: option.value ? input.limitationParts : [] },
                    ["limitations", "limitationParts", "priorityParts"],
                  )
                }
              />
              {option.label}
            </label>
          ))}
        </div>
        <ErrorText id="limitations-error" message={errors.limitations} />
      </fieldset>

      <fieldset className={fieldClass} disabled={limitationsDisabled} aria-describedby={describedBy("limitationParts")}>
        <legend className={legendClass}>불편한 부위</legend>
        <p className="text-sm text-[#717C95]">운동을 피해야 하는 부위를 모두 골라 주세요.</p>
        <div className="grid grid-cols-3 gap-2">
          {BODY_PARTS.map((part) => (
            <label key={part} className={optionClass}>
              <input
                type="checkbox"
                name="limitation-parts"
                value={part}
                checked={input.limitationParts.includes(part)}
                onChange={() =>
                  update({ limitationParts: toggle(input.limitationParts, part) }, ["limitationParts", "priorityParts"])
                }
                aria-invalid={errors.limitationParts ? true : undefined}
              />
              {part}
            </label>
          ))}
        </div>
        <ErrorText id="limitationParts-error" message={errors.limitationParts} />
      </fieldset>

      <fieldset className={fieldClass} aria-describedby={describedBy("priorityParts")}>
        <legend className={legendClass}>먼저 운동하고 싶은 부위</legend>
        <p className="text-sm text-[#717C95]">고른 순서가 우선순위가 됩니다.</p>
        <div className="grid grid-cols-3 gap-2">
          {BODY_PARTS.map((part) => {
            const rank = input.priorityParts.indexOf(part);
            return (
              <label key={part} className={optionClass}>
                <input
                  type="checkbox"
                  name="priority-parts"
                  value={part}
                  checked={rank >= 0}
                  onChange={() => update({ priorityParts: toggle(input.priorityParts, part) }, ["priorityParts"])}
                  aria-invalid={errors.priorityParts ? true : undefined}
                />
                {part}
                {rank >= 0 && (
                  <span className="ml-auto inline-flex size-6 items-center justify-center rounded-full bg-[#7355F5] text-xs font-semibold text-white">
                    {rank + 1}
                    <span className="sr-only">순위</span>
                  </span>
                )}
              </label>
            );
          })}
        </div>
        <ErrorText id="priorityParts-error" message={errors.priorityParts} />
      </fieldset>

      <fieldset className={fieldClass} aria-describedby={describedBy("purpose")}>
        <legend className={legendClass}>운동 목적</legend>
        <div className="grid grid-cols-2 gap-2">
          {PURPOSE_TYPES.map((type) => (
            <label key={type} className={optionClass}>
              <input
                type="radio"
                name="purpose-type"
                value={type}
                checked={input.purposeType === type}
                onChange={() => update({ purposeType: type }, ["purpose", "customText"])}
              />
              {type}
            </label>
          ))}
        </div>
        <ErrorText id="purpose-error" message={errors.purpose} />
        {input.purposeType === FREE_PURPOSE && (
          <div className="space-y-2">
            <label htmlFor="custom-text" className="text-sm font-medium">
              운동 목적 직접 입력
            </label>
            <textarea
              id="custom-text"
              rows={3}
              value={input.customText}
              onChange={(event) => update({ customText: event.target.value }, ["customText"])}
              aria-invalid={errors.customText ? true : undefined}
              aria-describedby={describedBy("customText")}
              className="w-full rounded-xl border border-[#DFE3F0] p-3 text-sm"
            />
            <ErrorText id="customText-error" message={errors.customText} />
          </div>
        )}
      </fieldset>

      <div className={fieldClass}>
        <label htmlFor="intensity" className={legendClass}>
          운동 강도 ({MIN_INTENSITY}~{MAX_INTENSITY})
        </label>
        <input
          id="intensity"
          type="number"
          inputMode="numeric"
          min={MIN_INTENSITY}
          max={MAX_INTENSITY}
          step={1}
          value={input.intensity}
          onChange={(event) => update({ intensity: event.target.value }, ["intensity"])}
          aria-invalid={errors.intensity ? true : undefined}
          aria-describedby={describedBy("intensity")}
          className="block min-h-11 w-full rounded-xl border border-[#DFE3F0] px-3 text-sm"
        />
        <ErrorText id="intensity-error" message={errors.intensity} />
      </div>

      <div role="status" aria-live="polite" className="min-h-6 text-sm">
        {pending && <p className="text-[#717C95]">저장하는 중이에요…</p>}
        {!pending && result && <p className="rounded-lg bg-[#FFF0F5] px-3 py-2 text-[#AA4265]">{result.message}</p>}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-xl bg-[#7355F5] text-base font-semibold text-white disabled:opacity-60"
      >
        {pending ? "저장 중" : "사전조사 저장"}
      </button>
    </form>
  );
}
