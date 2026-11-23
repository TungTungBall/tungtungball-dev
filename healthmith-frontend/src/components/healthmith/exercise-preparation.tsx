import type { WorkoutStage } from "@/lib/healthmith/workout-contract";

const GUIDES: Record<string, { start: string; mistake: string; source: string; publisher: string }> = {
  push_up: {
    start: "손을 어깨너비로 짚고 어깨 아래에 둬요. 다리를 편 뒤 머리부터 발까지 몸을 곧게 유지해요.",
    mistake: "허리가 아래로 처지지 않게 해요. 몸을 급하게 튕기지 말고 천천히 움직여요.",
    source: "https://health.clevelandclinic.org/how-to-do-a-push-up", publisher: "Cleveland Clinic",
  },
  lunge: {
    start: "몸통을 곧게 세우고 복부에 힘을 줘요. 골반과 무릎을 안정적으로 유지하며 움직여요.",
    mistake: "몸통을 기울이거나 골반과 무릎이 흔들리는 상태로 반복하지 않아요.",
    source: "https://www.hprc-online.org/physical-fitness/training-performance/foundational-movements-lunges", publisher: "HPRC",
  },
  squat: {
    start: "발을 어깨너비로 벌리고 서요. 등을 중립으로 유지한 채 천천히 무릎을 굽혀요.",
    mistake: "등을 둥글게 말지 않아요. 움직임을 조절할 수 없을 만큼 빠르게 반복하지 않아요.",
    source: "https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/squat/vid-20084663", publisher: "Mayo Clinic",
  },
};
export function StopConditions() {
  return <aside className="hm-stop-notice"><strong>이럴 때는 바로 중단해요</strong><p>날카로운 통증, 어지럼, 가슴 통증이나 평소와 다른 심한 숨참이 생기면 멈춰요.</p></aside>;
}
export function ExercisePreparation({ stage }: { stage: WorkoutStage }) {
  const guide = GUIDES[stage.exercise_id];
  return <section aria-label={`${stage.exercise_name} 준비`}>
    <div className="hm-exercise-heading"><h2>{stage.exercise_name}</h2><strong>{stage.target_repetitions}회</strong></div>
    <p className="hm-description">{stage.pace_instruction}</p>
    <dl className="hm-exercise-facts"><div><dt>세트 수</dt><dd>별도 안내 없음</dd></div><div><dt>휴식 시간</dt><dd>별도 안내 없음</dd></div></dl>
    <StopConditions />
    <details className="hm-exercise-details" open><summary>시작 자세와 운동 안내</summary>
      <p>{guide?.start ?? stage.internal_focus_instruction}</p>
      {guide ? <a href={guide.source} target="_blank" rel="noreferrer">{guide.publisher} 자세 시범 보기 ↗</a> : <p className="hm-helper">이 운동의 자세 시범은 아직 준비 중이에요.</p>}
    </details>
    <details className="hm-exercise-details"><summary>흔히 하는 실수</summary><p>{guide?.mistake ?? "이 운동의 상세 주의사항은 아직 준비 중이에요. 자세를 확인하기 어렵다면 운동을 시작하지 마세요."}</p></details>
    {guide && <details className="hm-exercise-details"><summary>이번 루틴의 자세 안내</summary><p>{stage.internal_focus_instruction}</p></details>}
  </section>;
}
export function FrontCameraDiagram() {
  return <svg className="hm-front-diagram" viewBox="0 0 340 170" role="img" aria-label="정면 촬영 구도 안내"><g stroke="#ee4566" strokeWidth="3" fill="none"><path d="M30 45V20h30M280 20h30v25M30 125v25h30M280 150h30v-25" /></g><g stroke="white" strokeWidth="4" fill="none" strokeLinecap="round"><circle cx="170" cy="48" r="18" /><path d="M140 78h60l17 57M140 78l-17 57M147 78l-10 58h66l-10-58M123 135l-20 10M217 135l20 10" /></g></svg>;
}
