import { ActionBar, ActionLink, PageIntro } from "@/components/healthmith/ui";
import { ConnectedFeedbackForm } from "./connected-feedback-form";
import PreviewFeedbackPage from "./preview-feedback";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ sessionId?: string | string[] }> }) {
  const { sessionId } = await searchParams;
  if (typeof sessionId === "string" && UUID.test(sessionId)) return <ConnectedFeedbackForm sessionId={sessionId} />;
  if (sessionId !== undefined) {
    return <>
      <PageIntro eyebrow="REFLECTION" title="운동 세션을 확인할 수 없어요" description="기록과 연결된 운동 후 설문을 열어주세요." />
      <ActionBar><ActionLink href="/records">운동 기록 보기</ActionLink></ActionBar>
    </>;
  }
  return <PreviewFeedbackPage />;
}
