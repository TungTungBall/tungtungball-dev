import { GOALS, EXPERIENCES, PRIORITY_PARTS, LIMITATION_PARTS, SEVERITIES, sidesFor, emptyIntake, intakeStepError, type IntakeInput } from "./intake";

const GOAL_CODES = ["fitness", "strength", "weight_management", "habit"] as const;
const EXPERIENCE_CODES = ["beginner", "occasional", "regular"] as const;
const PRIORITY_CODES = ["arms", "legs", "core", "shoulder", "chest", "neck"] as const;
const PART_CODES = ["neck", "shoulder", "elbow", "wrist", "lower_back", "hip", "knee", "ankle"] as const;
const SIDE_LABELS = ["왼쪽", "오른쪽", "양쪽", "중앙"];
const SIDE_CODES = ["left", "right", "both", "center"];
const SEVERITY_CODES = ["mild", "moderate", "severe"];
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type IntakeAnswers = {
  goal: string; experience: string; available_minutes: number; days_per_week: number;
  limitations_present: boolean; limitations: {part: string; side: string; severity: string}[];
  priority_body_parts: string[];
};
export type IntakeDetail = {id: string; schema_version: 2; answers: IntakeAnswers; version: number; created_at: string};
export type IntakeResult = {state: "saved"; submission: IntakeDetail} | {state: "failed" | "unauthorized" | "conflict" | "unknown" | "not-found"; message: string};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, fields: string[]) => Object.keys(v).length === fields.length && fields.every(f => f in v);
function label<T extends string>(codes: readonly string[], labels: readonly T[], value: unknown): T | undefined {
  return typeof value === "string" ? labels[codes.indexOf(value)] : undefined;
}
export function fromIntakeAnswers(value: unknown): IntakeInput | null {
  if (!object(value) || !keys(value, ["goal","experience","available_minutes","days_per_week","limitations_present","limitations","priority_body_parts"])) return null;
  const input = emptyIntake();
  input.goal = label(GOAL_CODES, GOALS, value.goal) ?? null;
  input.experience = label(EXPERIENCE_CODES, EXPERIENCES, value.experience) ?? null;
  if (typeof value.available_minutes !== "number" || typeof value.days_per_week !== "number" || typeof value.limitations_present !== "boolean" || !Array.isArray(value.limitations) || !Array.isArray(value.priority_body_parts)) return null;
  input.minutes = value.available_minutes; input.days = value.days_per_week; input.limitationsPresent = value.limitations_present;
  for (const item of value.limitations) {
    if (!object(item) || !keys(item,["part","side","severity"])) return null;
    const part = label(PART_CODES,LIMITATION_PARTS,item.part), side = label(SIDE_CODES,SIDE_LABELS,item.side), severity = label(SEVERITY_CODES,SEVERITIES,item.severity);
    if (!part || !side || !severity || input.limitations[part] || !sidesFor(part).includes(side)) return null;
    input.limitations[part] = {side, severity};
  }
  if (!input.limitationsPresent && value.limitations.length !== 0) return null;
  for (const item of value.priority_body_parts) {
    const part = label(PRIORITY_CODES,PRIORITY_PARTS,item);
    if (!part || input.priorities.includes(part)) return null;
    input.priorities.push(part);
  }
  return [0,1,2,3,4,5].some(step => intakeStepError(input,step)) ? null : input;
}
export function toIntakeAnswers(input: IntakeInput): IntakeAnswers {
  return {
    goal: GOAL_CODES[GOALS.indexOf(input.goal as typeof GOALS[number])],
    experience: EXPERIENCE_CODES[EXPERIENCES.indexOf(input.experience as typeof EXPERIENCES[number])],
    available_minutes: input.minutes!, days_per_week: input.days!, limitations_present: input.limitationsPresent!,
    limitations: LIMITATION_PARTS.filter(p => input.limitations[p]).map(part => ({part: PART_CODES[LIMITATION_PARTS.indexOf(part)], side: SIDE_CODES[SIDE_LABELS.indexOf(input.limitations[part]!.side!)], severity: SEVERITY_CODES[SEVERITIES.indexOf(input.limitations[part]!.severity!)]})),
    priority_body_parts: input.priorities.map(p => PRIORITY_CODES[PRIORITY_PARTS.indexOf(p)]),
  };
}
export function parseIntakeDetail(value: unknown): IntakeDetail | null {
  if (!object(value) || !keys(value,["id","schema_version","answers","version","created_at"]) || value.schema_version !== 2 || typeof value.id !== "string" || !UUID_PATTERN.test(value.id) || typeof value.version !== "number" || !Number.isSafeInteger(value.version) || value.version < 1 || typeof value.created_at !== "string" || !Number.isFinite(Date.parse(value.created_at)) || !fromIntakeAnswers(value.answers)) return null;
  return value as IntakeDetail;
}
