import Link from "next/link";

import { Gem } from "@/components/healthmith/gem";
import { ActionBar, ActionLink, Card, Notice, PageIntro } from "@/components/healthmith/ui";
import { getUserSession } from "@/config/session";
import { fetchBackendApi } from "@/lib/backend-api";
import { gemStates, type GemState } from "@/lib/healthmith/preview-data";
import { RecordsView } from "./records-view";

type WorkoutRecord = {
  session_id: string;
  result: string;
  ended_at: string | null;
  completed_stage_count: number | null;
  feedback_status: string | null;
};

type UserGem = {
  id: string;
  state: string;
  display_name: string;
  availability: string;
  created_at: string;
};

type RecordData = {
  records: WorkoutRecord[];
  gems: UserGem[];
  stats: { completed_sessions: number | null; abandoned_sessions: number | null; current_streak_days: number | null };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRecords(value: unknown): WorkoutRecord[] | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const result: WorkoutRecord[] = [];
  for (const item of value.items) {
    if (!isRecord(item) || typeof item.session_id !== "string" || typeof item.result !== "string"
      || (item.ended_at !== null && typeof item.ended_at !== "string")
      || (item.completed_stage_count !== null && typeof item.completed_stage_count !== "number")
      || (item.feedback_status !== null && typeof item.feedback_status !== "string")) return null;
    result.push({
      session_id: item.session_id,
      result: item.result,
      ended_at: item.ended_at,
      completed_stage_count: item.completed_stage_count,
      feedback_status: item.feedback_status,
    });
  }
  return result;
}

function parseGems(value: unknown): UserGem[] | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const result: UserGem[] = [];
  for (const item of value.items) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.state !== "string"
      || typeof item.display_name !== "string" || typeof item.availability !== "string"
      || typeof item.created_at !== "string" || Number.isNaN(Date.parse(item.created_at))) return null;
    result.push({ id: item.id, state: item.state, display_name: item.display_name, availability: item.availability, created_at: item.created_at });
  }
  return result;
}

function parseStats(value: unknown): RecordData["stats"] | null {
  if (!isRecord(value)) return null;
  const { completed_sessions, abandoned_sessions, current_streak_days } = value;
  const isCount = (item: unknown): item is number | null => item === null || (typeof item === "number" && Number.isSafeInteger(item) && item >= 0);
  if (!isCount(completed_sessions) || !isCount(abandoned_sessions) || !isCount(current_streak_days)) return null;
  return { completed_sessions, abandoned_sessions, current_streak_days };
}

async function loadRecords(): Promise<
  | { state: "loaded"; data: RecordData }
  | { state: "signed-out" }
  | { state: "error" }
> {
  const session = await getUserSession();
  if (session.state !== "authenticated") return { state: "signed-out" };
  try {
    const [recordsResponse, statsResponse, gemsResponse] = await Promise.all([
      fetchBackendApi("me/workout-records?limit=20", session.accessToken),
      fetchBackendApi("me/workout-stats", session.accessToken),
      fetchBackendApi("me/gems?limit=8", session.accessToken),
    ]);
    if ([recordsResponse, statsResponse, gemsResponse].some((response) => response.status === 401)) return { state: "signed-out" };
    if (![recordsResponse, statsResponse, gemsResponse].every((response) => response.ok)) return { state: "error" };
    const [recordsBody, statsBody, gemsBody]: unknown[] = await Promise.all([
      recordsResponse.json(), statsResponse.json(), gemsResponse.json(),
    ]);
    const records = parseRecords(recordsBody);
    const stats = parseStats(statsBody);
    const gems = parseGems(gemsBody);
    if (!records || !stats || !gems) return { state: "error" };
    return { state: "loaded", data: { records, stats, gems } };
  } catch {
    return { state: "error" };
  }
}

function recordResultLabel(result: string): string {
  if (result === "completed") return "완료";
  if (result === "abandoned") return "포기";
  return "진행 종료";
}

export async function ConnectedRecordsView() {
  const result = await loadRecords();
  if (result.state === "signed-out") {
    return <>
      <RecordsView mode="populated" />
      <p className="hm-helper">화면 미리보기예요. 저장된 기록을 보려면 로그인해 주세요.</p>
      <ActionBar><ActionLink href="/login?next=%2Frecords">Google로 로그인</ActionLink></ActionBar>
    </>;
  }
  if (result.state === "error") {
    return <>
      <PageIntro eyebrow="MY CABINET" title="기록을 불러오지 못했어요" />
      <Notice danger>서버 연결을 확인하고 다시 시도해 주세요.</Notice>
      <ActionBar><Link className="hm-action-button" href="/records">다시 불러오기</Link></ActionBar>
    </>;
  }

  const { records, gems, stats } = result.data;
  const knownGems = new Map<string, GemState>(gemStates.map((gem) => [gem.state, gem.state]));
  return <>
    <PageIntro eyebrow="MY CABINET" title="쌓여가는 나의 보석들" description="저장된 운동 기록과 보석을 확인해요." />
    <div className="hm-stat-grid hm-records-stats">
      <Card><strong>{stats.current_streak_days ?? "—"}일</strong><p>연속 운동일</p></Card>
      <Card><strong>{stats.completed_sessions ?? records.filter((item) => item.result === "completed").length}회</strong><p>완료한 운동</p></Card>
      <Card><strong>{gems.length}개</strong><p>최근 보석</p></Card>
    </div>
    <Card className="hm-records-history">
      <h2>운동 기록</h2>
      {records.length === 0 ? <p>아직 저장된 운동 기록이 없어요.</p> : records.map((record) => (
        <div className="hm-record-row" key={record.session_id}>
          <span>{record.ended_at ? new Date(record.ended_at).toLocaleDateString("ko-KR") : "날짜 미정"} · {recordResultLabel(record.result)}</span>
          <span>{record.completed_stage_count ?? 0} / 5 단계</span>
          {record.result === "abandoned"
            ? <span>포기한 운동은 설문 없이 마무리돼요.</span>
            : record.feedback_status === "submitted"
            ? <span>설문 완료</span>
            : <Link className="hm-text-link" href={`/feedback?sessionId=${encodeURIComponent(record.session_id)}`}>운동 후 설문</Link>}
        </div>
      ))}
    </Card>
    <Card className="hm-records-history">
      <h2>최근 보석</h2>
      {gems.length === 0 ? <p>아직 보석이 없어요. 첫 운동을 완료해 보세요.</p> : <div className="hm-gem-grid">
        {gems.map((gem) => {
          const state: GemState | null = knownGems.get(gem.state) ?? null;
          return <div className="hm-card hm-gem-card" key={gem.id}>
            {state && <Gem state={state} label={gem.display_name} />}
            <h3>{gem.display_name}</h3>
            <p>{gem.availability}</p>
          </div>;
        })}
      </div>}
    </Card>
    <p className="hm-helper">통계 계산 기준이 아직 정해지지 않은 항목은 표시하지 않습니다.</p>
    <ActionBar><ActionLink href="/survey">새 사전조사 시작하기</ActionLink></ActionBar>
  </>;
}
