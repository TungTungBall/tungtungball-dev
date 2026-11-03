import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageIntro, Notice } from "@/components/healthmith/ui";
import { previewScreens } from "@/lib/healthmith/preview-data";

export default function DesignIndexPage() {
  return <>
    <PageIntro eyebrow="MOBILE V2 · VIOLET & EMERALD" title="빛나는 보석, 가벼운 시작." description="열두 개의 화면으로 만나는 나의 운동 여정." />
    <div className="hm-screen-list">{previewScreens.map((screen) => <Link key={screen.id} href={screen.href} className="hm-card hm-screen-link"><span>{screen.id}</span><div><h2>{screen.title}</h2><p>{screen.label}</p></div><ArrowUpRight size={17} /></Link>)}</div>
    <section className="hm-gallery-section"><h2>보석의 열두 가지 표정</h2><Link href="/gems" className="hm-card hm-screen-link"><div><h2>진행 단계와 보석 상태</h2><p>원석부터 에메랄드까지, 12종의 SVG 시안</p></div><ArrowUpRight size={17} /></Link></section>
    <section className="hm-gallery-section"><h2>기록 화면의 여러 순간</h2><div className="hm-choice-grid is-three"><Link className="hm-action hm-action-secondary" href="/records?state=empty">기록 없음</Link><Link className="hm-action hm-action-secondary" href="/records?state=loading">불러오기</Link><Link className="hm-action hm-action-secondary" href="/records?state=error">조회 실패</Link></div></section>
    <div className="hm-survey-bottom"><Notice>화면과 상호작용을 확인하는 미리보기예요.<br />실제 운동 판정·AI 생성·서버 저장은 연결 전이에요.</Notice></div>
  </>;
}
