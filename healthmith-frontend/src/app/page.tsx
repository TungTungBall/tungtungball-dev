import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-12 text-foreground">
      <section aria-labelledby="page-title" className="w-full max-w-lg space-y-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-10">
        <p className="text-sm font-medium text-muted-foreground">HEALTHMITH</p>
        <h1 id="page-title" className="text-3xl font-bold tracking-tight">헬스미스</h1>
        <p className="leading-relaxed text-muted-foreground">프론트엔드 기본 화면이 준비되었습니다.</p>
        <Button type="button" disabled>준비 완료</Button>
        <div>
          <Link href="/backend-connection" prefetch={false} className="text-sm font-medium underline underline-offset-4">백엔드 연결 확인</Link>
        </div>
      </section>
    </main>
  );
}
