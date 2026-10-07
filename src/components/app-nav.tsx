"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MemberRole } from "@/db/schema";
import { MEMBER_ROLE_LABELS } from "@/lib/members/roles";
import { logoutAction } from "@/server/actions/auth";

type Me = { nickname: string; color: string; role: MemberRole };

const NAV: Array<{ href: string; label: string; adminOnly?: boolean }> = [
  { href: "/", label: "홈" },
  { href: "/agents", label: "요원표" },
  { href: "/prefs", label: "멤버 선호" },
  { href: "/squad", label: "스쿼드 편성" },
  { href: "/sessions", label: "세션 기록" },
  { href: "/tactics", label: "맵·전술" },
  { href: "/tools", label: "도구" },
  { href: "/admin", label: "관리", adminOnly: true },
];

export function AppNav({ me }: { me: Me }) {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="호발동 홈">
          호발동
        </Link>

        <nav className="app-navigation" aria-label="주요 메뉴">
          {NAV.filter((n) => !n.adminOnly || me.role === "admin").map((n) => {
            // "/"는 접두사 판정을 하면 모든 경로에 걸리므로 정확히 일치할 때만 활성
            const active = n.href === "/" ? pathname === "/" : pathname === n.href || pathname.startsWith(`${n.href}/`);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`nav-link${active ? " nav-link--active" : ""}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="header-account flex min-w-0 items-center gap-2">
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-base"
            style={{ background: me.color }}
            aria-hidden
          >
            {me.nickname.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{me.nickname}</span>
          {me.role !== "member" ? <span className="font-mono text-[11px] text-muted">{MEMBER_ROLE_LABELS[me.role].short}</span> : null}
          <form action={logoutAction}>
            <button type="submit" className="ml-2 min-h-11 px-2 text-xs text-secondary hover:text-primary">
              나가기
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
