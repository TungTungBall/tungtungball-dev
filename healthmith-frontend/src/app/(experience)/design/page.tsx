import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageIntro, Notice } from "@/components/healthmith/ui";
import { previewScreens } from "@/lib/healthmith/preview-data";
import { loginPreviewStates } from "@/lib/healthmith/login-preview";

export default function DesignIndexPage() {
  return <>
    <PageIntro eyebrow="DESIGN PREVIEW" title="화면 디자인 예시" description="아래 운동·보석 화면은 저장된 운동과 별개의 예시예요." />
    <section className="hm-gallery-section"><h2>실제 서비스 시작하기</h2><div className="hm-choice-grid"><Link className="hm-action hm-action-secondary" href="/survey">사전조사 입력</Link><Link className="hm-action hm-action-secondary" href="/workout?connected=1">진행 중인 운동</Link><Link className="hm-action hm-action-secondary" href="/records">저장된 운동 기록</Link></div></section>
    <section className="hm-gallery-section"><h2>Google 로그인 · 화면 미리보기</h2><div className="hm-login-previews">{loginPreviewStates.map(({ state, label }) => <Link key={state} className="hm-action hm-action-secondary" href={state === "idle" ? "/login" : `/login?state=${state}`}>{label}</Link>)}</div></section>
    <div className="hm-screen-list">{previewScreens.map((screen) => <Link key={screen.id} href={screen.href} className="hm-card hm-screen-link"><span>{screen.id}</span><div><h2>{screen.title}</h2><p>{screen.label}</p></div><ArrowUpRight size={17} /></Link>)}</div>
    <section className="hm-gallery-section"><h2>보석의 열두 가지 표정</h2><Link href="/gems" className="hm-card hm-screen-link"><div><h2>진행 단계와 보석 상태</h2><p>원석부터 에메랄드까지, 12종의 SVG 시안</p></div><ArrowUpRight size={17} /></Link></section>
    <section className="hm-gallery-section"><h2>기록 화면의 여러 순간</h2><div className="hm-choice-grid is-three"><Link className="hm-action hm-action-secondary" href="/records?state=empty">기록 없음</Link><Link className="hm-action hm-action-secondary" href="/records?state=loading">불러오기</Link><Link className="hm-action hm-action-secondary" href="/records?state=error">조회 실패</Link></div></section>
    <div className="hm-survey-bottom"><Notice>이 화면은 디자인 미리보기예요.<br />사전조사와 운동 기록은 서버에 연결했고, 운동 판정과 생성 worker는 별도 설정이 필요해요.</Notice></div>
  </>;
}
