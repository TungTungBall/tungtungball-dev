import { expect, test, type Page } from "@playwright/test";
let ownerToken: string;
test.beforeEach(async ({context,request}) => {
  await request.post("http://127.0.0.1:8091/test/cycle-reset");
  const session = await (await request.get("http://127.0.0.1:8091/test/session")).json();
  ownerToken = session.token;
  await context.addCookies([{name:"sb-127-auth-token",value:session.cookie,url:"http://127.0.0.1:3000",httpOnly:true,sameSite:"Lax"}]);
});
async function fill(page:Page) {
  await page.goto("/survey");
  for (const answer of ["체력 기르기","가끔 해봤어요"]) {
    await page.getByRole("button",{name:answer,exact:true}).click();
    await page.getByRole("button",{name:"다음",exact:true}).click();
  }
  for (const answer of ["20분","3회"]) await page.getByRole("button",{name:answer,exact:true}).click();
  await page.getByRole("button",{name:"다음",exact:true}).click();
  for (const answer of ["손목","왼쪽","보통"]) await page.getByRole("button",{name:answer,exact:true}).click();
  await page.getByRole("button",{name:"다음",exact:true}).click();
  await page.getByRole("button",{name:"팔",exact:true}).click();
  await page.getByRole("button",{name:"입력 내용 확인",exact:true}).click();
}
test("새 조사 저장·새로고침·수정·재조회에서 값과 버전을 보존한다", async ({page,request}, info) => {
  await fill(page);
  await page.getByRole("button",{name:"사전조사 저장",exact:true}).click();
  await expect(page.getByRole("button",{name:"저장 완료",exact:true})).toBeDisabled();
  const id = new URL(page.url()).searchParams.get("id")!;
  expect(id).toBeTruthy();
  await page.reload();
  await expect(page.getByText("손목 · 왼쪽 · 보통",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"저장 완료",exact:true})).toBeDisabled();
  for (let i=0;i<3;i++) await page.getByRole("button",{name:"이전",exact:true}).click();
  await page.getByRole("button",{name:"45분",exact:true}).click();
  for(let i=0;i<2;i++) await page.getByRole("button",{name:"다음",exact:true}).click();
  await page.getByRole("button",{name:"입력 내용 확인",exact:true}).click();
  await page.getByRole("button",{name:"수정 내용 저장",exact:true}).click();
  await expect(page.getByRole("button",{name:"저장 완료",exact:true})).toBeDisabled();
  await page.reload();
  await expect(page.getByText("45분 · 주 3회",{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath("saved-survey.png"),fullPage:true});
  const response = await request.get(`http://127.0.0.1:8081/api/v2/survey-submissions/${id}`,{headers:{Authorization:`Bearer ${ownerToken}`}});
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({schema_version:2,version:2,answers:{available_minutes:45,priority_body_parts:["arms"],limitations:[{part:"wrist",side:"left",severity:"moderate"}]}});
});
test("저장 응답이 끊겨도 같은 요청으로 확인하고 수정 버전을 중복 증가시키지 않는다", async ({page,request}) => {
  await fill(page);
  let lost = false;
  await page.route("**/survey",async route => {
    if (!lost && route.request().method()==="POST") {
      lost = true;
      await route.fetch(); // DB 커밋 후 브라우저 응답만 유실
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button",{name:"사전조사 저장",exact:true}).click();
  const retry=page.getByRole("button",{name:"같은 요청으로 저장 다시 확인",exact:true});
  await expect(retry).toBeEnabled();
  const latest = await (await request.get("http://127.0.0.1:8081/api/v2/survey-submissions/latest",{headers:{Authorization:`Bearer ${ownerToken}`}})).json();
  await retry.click();
  await expect(page.getByRole("button",{name:"저장 완료",exact:true})).toBeDisabled();
  expect(new URL(page.url()).searchParams.get("id")).toBe(latest.id);
  const row=await (await request.get(`http://127.0.0.1:8081/api/v2/survey-submissions/${latest.id}`,{headers:{Authorization:`Bearer ${ownerToken}`}})).json();
  expect(row.version).toBe(1);
});
test("로그인 없이 저장을 누르면 입력을 유지하고 성공 표시를 하지 않는다",async ({page,context})=>{
  await context.clearCookies();
  await fill(page);
  await page.getByRole("button",{name:"사전조사 저장",exact:true}).click();
  await expect(page.locator(".hm-intake").getByRole("status")).toContainText("로그인이 필요");
  await expect(page.getByText("손목 · 왼쪽 · 보통",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"저장 완료",exact:true})).toHaveCount(0);
});

test("다른 곳에서 수정한 버전과 충돌하면 덮어쓰지 않고 저장본을 다시 읽는다", async ({page,request}) => {
  await fill(page);
  await page.getByRole("button",{name:"사전조사 저장",exact:true}).click();
  await expect(page.getByRole("button",{name:"저장 완료",exact:true})).toBeDisabled();
  const id=new URL(page.url()).searchParams.get("id")!;
  const url=`http://127.0.0.1:8081/api/v2/survey-submissions/${id}`;
  const headers={Authorization:`Bearer ${ownerToken}`};
  const row=await (await request.get(url,{headers})).json();
  const changed=await request.patch(url,{headers:{...headers,"Idempotency-Key":crypto.randomUUID()},data:{answers:{...row.answers,available_minutes:60},expected_version:1}});
  expect(changed.status()).toBe(200);
  await page.getByRole("button",{name:"이전",exact:true}).click();
  await page.getByRole("button",{name:"가슴",exact:true}).click();
  await page.getByRole("button",{name:"입력 내용 확인",exact:true}).click();
  await page.getByRole("button",{name:"수정 내용 저장",exact:true}).click();
  await expect(page.locator(".hm-intake").getByRole("status")).toContainText("충돌");
  await expect(page.getByText("20분 · 주 3회",{exact:true})).toBeVisible();
  await expect(page.getByText("팔, 가슴",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"입력 대신 최신 저장본 불러오기",exact:true}).click();
  await expect(page.getByText("60분 · 주 3회",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"저장 완료",exact:true})).toBeDisabled();
});
