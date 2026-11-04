export type LoginPreviewState = "idle" | "loading" | "cancelled" | "error" | "expired" | "unavailable";

export const loginPreviewStates: { state: LoginPreviewState; label: string }[] = [
  { state: "idle", label: "기본 화면" },
  { state: "loading", label: "연결 중" },
  { state: "cancelled", label: "로그인 취소" },
  { state: "error", label: "연결 실패" },
  { state: "expired", label: "세션 만료" },
  { state: "unavailable", label: "연결 준비 중" },
];

export function getLoginPreviewState(value: string | string[] | undefined): LoginPreviewState {
  return loginPreviewStates.find((preview) => preview.state === value)?.state ?? "idle";
}
