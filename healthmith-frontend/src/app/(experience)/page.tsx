import { Gem } from "@/components/healthmith/gem";
import { ActionLink, Card } from "@/components/healthmith/ui";

export default function HomePage() {
  return <>
    <div className="hm-hero"><p className="hm-eyebrow">MOVE. MAKE. SHINE.</p><h1>움직일수록,<br />보석처럼 빛나게.</h1><p className="hm-description">나에게 맞춘 5단계 운동 게임.<br />오늘의 작은 성취를 모아보세요.</p></div>
    <div className="hm-arch"><span className="hm-arch-label">THE GEMSMITH’S GUILD</span><Gem state="polished" label="빛나는 에메랄드 보석" /><span className="hm-sparkle one" aria-hidden="true">✦</span><span className="hm-sparkle two" aria-hidden="true">✦</span></div>
    <Card className="hm-home-quest"><span className="hm-pill">첫 번째 의뢰</span><h2>나의 첫 보석 만들기</h2><p>내 몸에 맞춰 준비한 운동 여정</p><ActionLink href="/preparation/body">첫 여정 시작하기</ActionLink></Card>
    <p className="hm-home-note">채굴 → 쪼개기 → 세척 → 가공 → 연마<br />작은 움직임이 모여 보석을 완성해요.</p>
  </>;
}
