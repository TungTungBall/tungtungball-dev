import Link from "next/link";
import { Gem } from "@/components/healthmith/gem";
import { ActionLink } from "@/components/healthmith/ui";

export default function HomePage() {
  return <>
    <div className="hm-hero">
      <h1>움직일수록,<br />보석처럼 빛나게.</h1>
      <p className="hm-description">내 몸에 맞는 5단계 운동으로 보석을 완성해요.</p>
    </div>
    <div className="hm-gem-display">
      <Gem state="polished" label="빛나는 에메랄드 보석" />
    </div>
    <ActionLink href="/survey">첫 여정 시작하기</ActionLink>
    <div className="hm-home-login">
      <Link href="/login" className="hm-text-link">나의 여정 이어가기 · Google로 로그인</Link>
    </div>
  </>;
}
