import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { getUserSession } from "@/config/session";

import { SurveyForm } from "./survey-form";

export const metadata: Metadata = {
  title: "사전조사 | 헬스미스",
};

/** US-01 사전조사 입력·저장 (M02~M03). 저장 뒤 초안 생성·게임으로 자동 이동하지 않는다. */
export default async function SurveyPage() {
  await connection();
  const session = await getUserSession();
  const signedIn = session.state === "authenticated";

  return (
    <main className="min-h-svh bg-[#F6F7FC] px-5 py-8 text-[#202944]">
      <div className="mx-auto w-full max-w-[430px] space-y-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-[#717C95]">HEALTHMITH · 사전조사</p>
          <h1 className="text-2xl font-bold">나에게 맞는 운동을 준비할게요</h1>
          <p className="text-sm text-[#717C95]">몸 상태와 목표를 알려 주세요. 입력한 내용은 저장만 하고, 운동 초안은 다음 단계에서 만들어요.</p>
        </header>
        {!signedIn && (
          <p role="note" className="rounded-xl bg-[#ECE9FF] px-4 py-3 text-sm text-[#202944]">
            로그인 후 저장할 수 있어요. <Link href="/login?next=%2Fsurvey" className="underline underline-offset-4">Google로 로그인하기</Link>
          </p>
        )}
        <SurveyForm />
        <Link href="/" className="block text-center text-sm text-[#717C95] underline underline-offset-4">
          시작 화면으로
        </Link>
      </div>
    </main>
  );
}
