"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Gem as GemIcon, House, Menu, PanelsTopLeft, ScrollText, X, ArrowLeft, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

const navigation = [{ href: "/", label: "홈", icon: House }, { href: "/routine", label: "오늘의 운동", icon: GemIcon }, { href: "/records", label: "나의 기록", icon: ScrollText }];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === pathname;
  const dark = pathname === "/workout" || pathname === "/workout/paused";
  const home = pathname === "/";
  const login = pathname === "/login";

  return <div className={`hm-app ${dark ? "hm-dark" : ""}`}><div className={`hm-shell ${home ? "has-navigation" : ""} ${login ? "has-login" : ""}`}>
    <a href="#main-content" className="hm-skip-link">본문으로 바로가기</a>
    <header className="hm-header"><Link href="/" className="hm-brand" aria-label="헬스미스 홈"><span className="hm-brand-mark" aria-hidden="true" />헬스미스</Link><Button variant="ghost" size="icon" className="hm-menu-button" aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={menuOpen} aria-controls="app-menu" onClick={() => setMenuPath(menuOpen ? null : pathname)}>{menuOpen ? <X /> : <Menu />}</Button></header>
    {menuOpen && <nav id="app-menu" className="hm-menu" aria-label="전체 메뉴">{[...navigation, { href: "/login", label: "Google로 로그인", icon: LogIn }, { href: "/gems", label: "보석의 열두 가지 표정", icon: GemIcon }, { href: "/design", label: "화면 둘러보기", icon: PanelsTopLeft }, { href: "/backend-connection", label: "서버 연결 확인", icon: ArrowLeft }].map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMenuPath(null)}><Icon size={17} />{label}</Link>)}<p>사전조사와 기록은 로그인 후 서버에 연결돼요.<br />운동 판정과 일부 게임 흐름은 미리보기예요.</p></nav>}
    <main id="main-content" className="hm-main">{children}</main>
    {home && <nav className="hm-bottom-nav" aria-label="주요 메뉴">{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}><Icon size={20} strokeWidth={1.5} /><span>{label}</span></Link>)}</nav>}
  </div></div>;
}
