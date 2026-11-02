// 환경변수는 이 파일에서만 읽는다 (docs/CODE-STYLE.md 6번).
// Next.js 서버 전용 값이다. 브라우저 코드("use client")에서 가져다 쓰지 않는다.

const DEFAULT_BACKEND_API_URL = "http://127.0.0.1:8080";

/** Spring 백엔드 기본 주소. 설정하지 않으면 로컬 백엔드 주소를 쓴다. */
export function getBackendApiUrl(): string {
  return process.env.BACKEND_API_URL ?? DEFAULT_BACKEND_API_URL;
}
