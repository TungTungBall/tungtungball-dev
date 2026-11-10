/** 응답 유실 뒤에도 같은 명령·버전에는 같은 멱등성 키를 사용한다. 토큰은 보관하지 않는다. */
export function commandKey(scope: string): string {
  const key = `hm-command:${scope}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const value = crypto.randomUUID();
    sessionStorage.setItem(key, value);
    return value;
  } catch { return crypto.randomUUID(); }
}

/** 성공을 확인한 시작 시도는 끝낸다. 같은 확정 루틴으로 새 운동을 시작할 수 있게 한다. */
export function finishCommand(scope: string): void {
  try { sessionStorage.removeItem(`hm-command:${scope}`); } catch { /* 저장소 차단 */ }
}
