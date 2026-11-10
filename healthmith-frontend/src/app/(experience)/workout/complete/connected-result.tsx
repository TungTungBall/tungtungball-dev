import { Gem } from "@/components/healthmith/gem";
import { ActionBar, ActionLink, Notice, PageIntro } from "@/components/healthmith/ui";
import { loadWorkoutResult } from "../actions";

export async function ConnectedWorkoutResult({ sessionId }: { sessionId: string }) {
  const result = await loadWorkoutResult(sessionId);
  if (result.state !== "ok") return <>
    <PageIntro eyebrow="YOUR QUEST" title="운동 결과를 불러오지 못했어요" />
    <Notice danger>{result.message}</Notice>
    <ActionBar><ActionLink href={`/workout/complete?sessionId=${encodeURIComponent(sessionId)}`}>다시 불러오기</ActionLink><ActionLink href="/records">운동 기록 보기</ActionLink></ActionBar>
  </>;
  const { session, gem } = result.data;
  const completed = session.status === "completed";
  return <>
    <PageIntro eyebrow="YOUR QUEST / 저장된 결과" title={completed ? "오늘도 빛을 벼렸어요." : "이번 운동을 마무리했어요"} />
    {gem && <><Gem state="polished" label={gem.display_name} /><h2>{gem.display_name}</h2></>}
    <p>{session.completed_stage_count} / 5 단계 {completed ? "완료" : "포기"}</p>
    {!completed && <Notice>포기한 운동은 설문 없이 마무리돼요.</Notice>}
    <ActionBar>
      {completed && session.feedback_status !== "submitted" && <ActionLink href={`/feedback?sessionId=${encodeURIComponent(session.id)}`}>오늘의 운동 느낌 남기기</ActionLink>}
      {session.feedback_status === "submitted" && <p>운동 후 설문을 저장했어요.</p>}
      <ActionLink href="/records">나의 운동 기록 보기</ActionLink>
    </ActionBar>
  </>;
}
