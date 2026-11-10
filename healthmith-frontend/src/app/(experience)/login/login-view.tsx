"use client";

import Image from "next/image";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { signInWithGoogle, signOut } from "@/app/auth/actions";
import { ArrowLeft, ArrowUpRight, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Gem } from "@/components/healthmith/gem";
import { PageIntro } from "@/components/healthmith/ui";
import googleG from "@/components/healthmith/assets/google-g.png";
import type { LoginPreviewState } from "@/lib/healthmith/login-preview";

const messages: Partial<Record<LoginPreviewState, { title: string; description: string }>> = {
  loading: { title: "Google에 연결하고 있어요", description: "계정 확인 화면으로 이동하고 있어요." },
  cancelled: { title: "로그인을 취소했어요", description: "준비되면 Google 계정으로 다시 시작해요." },
  error: { title: "Google에 연결하지 못했어요", description: "연결 상태를 확인하고 다시 시도해주세요." },
  expired: { title: "다시 로그인해주세요", description: "안전하게 이어가려면 계정을 다시 연결해주세요." },
  unavailable: { title: "로그인 기능을 준비하고 있어요", description: "잠시 후 다시 시도해 주세요." },
};

function GoogleButton({ disabled, loading }: { disabled: boolean; loading: boolean }) {
  const { pending } = useFormStatus();
  const busy = pending || loading;
  return <Button className="hm-google-button" type="submit" disabled={disabled || busy}>
    <Image src={googleG} width={20} height={20} alt="" />
    <span>{busy ? "Google 연결 중" : "Google로 계속하기"}</span>
    {busy && <LoaderCircle className="hm-login-spinner" size={17} aria-hidden="true" />}
  </Button>;
}

export function LoginView({ initialState: state, configured, signedIn, nextPath }: { initialState: LoginPreviewState; configured: boolean; signedIn: boolean; nextPath: string }) {
  const pending = state === "loading";
  const message = messages[state];

  return <div className="hm-login">
    <Link href="/" className="hm-text-link hm-login-back"><ArrowLeft size={14} aria-hidden="true" />홈으로</Link>
    <PageIntro eyebrow="YOUR GEM, YOUR JOURNEY" title={<>당신의 빛을,<br />이어서.</>} description={<>작은 움직임부터 빛나는 보석까지.<br />나만의 운동 여정을 시작해요.</>} />

    <div className="hm-login-art">
      <span className="hm-login-orbit" aria-hidden="true" />
      <span className="hm-login-orbit is-outer" aria-hidden="true" />
      <span className="hm-sparkle one" aria-hidden="true">✦</span>
      <span className="hm-sparkle two" aria-hidden="true">✦</span>
      <Gem state="pristine" label="나만의 여정을 상징하는 에메랄드 보석" />
      <span className="hm-login-art-caption"><Sparkles size={12} aria-hidden="true" />하나의 계정, 나만의 보석함</span>
    </div>

    <section className="hm-login-connect" aria-labelledby="login-heading">
      <h2 id="login-heading">{signedIn ? "로그인되어 있어요" : "나의 여정으로 들어가기"}</h2>
      <p className="hm-description">{signedIn ? "이제 나에게 맞는 운동을 준비해요." : "Google 계정으로 간편하게 시작해요."}</p>
      {!signedIn && message && <div className={`hm-login-status ${state === "error" || state === "expired" ? "is-error" : ""}`} role={pending ? "status" : "alert"} aria-atomic="true">
        <strong>{message.title}</strong><p>{message.description}</p>
      </div>}
      {signedIn ? <>
        <Link className="hm-text-link" href={nextPath}>사전조사로 계속하기<ArrowUpRight size={14} aria-hidden="true" /></Link>
        <form action={signOut}><Button variant="ghost" type="submit">로그아웃</Button></form>
      </> : <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={nextPath} />
        <GoogleButton disabled={!configured} loading={pending} />
      </form>}
      {pending && <Link className="hm-text-link hm-login-cancel" href="/login">로그인 취소</Link>}
      <p className="hm-login-preview">Google 계정 인증 후 나의 여정으로 이어져요.</p>
    </section>

    <div className="hm-login-reassurance"><ShieldCheck size={17} aria-hidden="true" /><p>별도의 비밀번호 입력 없이<br />Google 계정으로 시작하는 방식이에요.</p></div>
    <Link className="hm-text-link hm-login-explore" href="/design">먼저 화면 둘러보기<ArrowUpRight size={14} aria-hidden="true" /></Link>
  </div>;
}
