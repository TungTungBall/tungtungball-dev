import Link from "next/link";
import { connection } from "next/server";
import { getUserSession } from "@/config/session";
import { PageIntro } from "@/components/healthmith/ui";
import { SurveyForm } from "../survey-form";
export default async function LegacySurveyPage() {
  await connection();
  const session = await getUserSession();
  return <div className="hm-legacy-survey">
    <PageIntro eyebrow="사전조사 · 기존 양식" title="나에게 맞는 운동을 준비할게요" description="현재 저장 가능한 양식이에요. 새 사전조사의 상세 부위·위치·정도·경험·일정은 이 양식으로 옮겨지지 않아요." />
    {session.state !== "authenticated" && <p role="note" className="hm-notice">로그인 후 저장할 수 있어요. <Link href="/login?next=%2Fsurvey%2Flegacy">Google로 로그인하기</Link></p>}
    <SurveyForm /><Link className="hm-text-link" href="/survey">새 사전조사로 돌아가기</Link>
  </div>;
}
