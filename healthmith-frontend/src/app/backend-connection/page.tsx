import Link from "next/link";
import { connection } from "next/server";
import { fetchBackendHealth } from "./health";

const messages = {
  connected: "백엔드에 정상적으로 연결되었습니다.",
  "not-configured": "백엔드 주소가 설정되지 않았습니다. 실행 환경에 BACKEND_API_URL을 설정해 주세요.",
  "invalid-config": "백엔드 주소 설정을 확인해 주세요. HTTP 또는 HTTPS 기본 주소가 필요합니다.",
  "http-error": "백엔드가 정상 상태 코드를 반환하지 않았습니다. 서버 경로와 접근 권한을 확인해 주세요.",
  "invalid-response": "백엔드 응답 형식이 예상과 다릅니다. health API 응답을 확인해 주세요.",
  timeout: "5초 안에 응답을 받지 못했습니다. 백엔드 상태를 확인한 뒤 다시 시도해 주세요.",
  unreachable: "백엔드에 연결할 수 없습니다. 서버 실행 상태와 연결 주소를 확인해 주세요.",
};

export default async function BackendConnectionPage() {
  await connection();
  const result = await fetchBackendHealth(process.env.BACKEND_API_URL ?? "http://127.0.0.1:8080");
  const connected = result.state === "connected";

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-12 text-foreground">
      <section aria-labelledby="connection-title" className="w-full max-w-lg space-y-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-10">
        <p className="text-sm font-medium text-muted-foreground">HEALTHMITH</p>
        <h1 id="connection-title" className="text-2xl font-bold tracking-tight">백엔드 연결 확인</h1>
        <div role="status" className="space-y-2 rounded-lg border p-4">
          <p className="font-semibold">{connected ? "연결 성공" : "연결 확인 필요"}</p>
          <p className="break-words text-sm leading-relaxed text-muted-foreground">{messages[result.state]}</p>
          {result.state === "http-error" && <p className="text-sm">HTTP {result.httpStatus}</p>}
        </div>
        <p className="text-sm text-muted-foreground">GET /health의 HTTP 200과 status: UP 응답을 확인합니다.</p>
        <nav aria-label="연결 확인 메뉴" className="flex flex-wrap gap-4 text-sm">
          <a href="/backend-connection" className="font-medium underline underline-offset-4">다시 확인</a>
          <Link href="/" className="text-muted-foreground underline underline-offset-4">시작 화면으로</Link>
        </nav>
      </section>
    </main>
  );
}
