import { describe, expect, it } from "vitest";
import { fromIntakeAnswers, toIntakeAnswers, parseIntakeDetail } from "@/lib/healthmith/intake-contract";
import { requestDetailedSurvey } from "@/app/survey/detailed-submit";
const answers = {goal:"fitness",experience:"beginner",available_minutes:10,days_per_week:1,limitations_present:true,limitations:[{part:"wrist",side:"left",severity:"moderate"}],priority_body_parts:["arms"]};
const row = {id:"10000000-0000-4000-8000-000000000001",schema_version:2,answers,version:1,created_at:"2026-11-23T01:00:00Z"};
describe("상세 사전조사 계약", () => {
  it("좌우·정도·겹치는 우선 부위와 미선택을 손실 없이 왕복한다", () => {
    const input = fromIntakeAnswers(answers)!;
    expect(input.limitations["손목"]).toEqual({side:"왼쪽",severity:"보통"});
    expect(toIntakeAnswers(input)).toEqual(answers);
    expect(parseIntakeDetail(row)).toEqual(row);
  });
  it("누락·강제 변환·중복·알 수 없는 값과 잘못된 위치를 거절한다", () => {
    for (const patch of [{days_per_week:"1"},{days_per_week:0},{preferred_intensity:"unknown"},{priority_body_parts:["wrist","wrist"]},{limitations_present:false},{limitations:[{part:"neck",side:"left",severity:"mild"}]},{extra:true},{experience:undefined}]) expect(fromIntakeAnswers({...answers,...patch})).toBeNull();
    expect(parseIntakeDetail({...row,schema_version:1})).toBeNull();
  });
  it("응답 유실을 실패 확정으로 처리하지 않고 멱등 키를 전달한다", async () => {
    let options: RequestInit | undefined;
    const fetcher = (async (_url, init) => {options=init;throw Error("timeout");}) as typeof fetch;
    const result = await requestDetailedSurvey("http://localhost:8080", "synthetic", "", "POST", {answers}, "same-key", fetcher);
    expect(result.state).toBe("unknown");
    expect(options?.headers).toMatchObject({"Idempotency-Key":"same-key"});
    expect(options?.cache).toBe("no-store");
  });
  it("요청과 다른 답변·버전의 저장 응답을 성공으로 확정하지 않는다", async () => {
    for (const changed of [{...row,version:2},{...row,answers:{...answers,goal:"habit"}}]) {
      const result = await requestDetailedSurvey("http://localhost:8080","synthetic","","POST",{answers},"key",(async () => Response.json(changed,{status:201})) as typeof fetch);
      expect(result.state).toBe("unknown");
    }
  });
  it("잘못된 행과 구버전·미지원 서버를 성공으로 표시하지 않는다", async () => {
    const fake = (body:unknown,status=200) => (async () => Response.json(body,{status})) as typeof fetch;
    expect((await requestDetailedSurvey("http://localhost:8080","synthetic","/"+row.id,"GET",undefined,undefined,fake({...row,id:"20000000-0000-4000-8000-000000000001"}))).state).toBe("failed");
    expect((await requestDetailedSurvey("http://localhost:8080","synthetic","","POST",{answers},"key",fake({},404))).state).toBe("not-found");
  });
});
