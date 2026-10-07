"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/server/actions/auth";

type Me = { nickname: string; color: string; role: "admin" | "member" };

/**
 * 상단 네비게이션. 1단계에서는 멤버 선호와 관리만 활성이고,
 * 나머지 메뉴는 기획서의 단계 순서대로 비활성 표시로 둔다(구조를 미리 보여주기 위함).
 */
const NAV: Array<{ href: string; label: string; stage: number; adminOnly?: boolean }> = [
  { href: "/prefs", label: "멤버 선호", stage: 1 },
  { href: "/squad", label: "스쿼드 편성", stage: 2 },
  { href: "/sessions", label: "세션 기록", stage: 2 },
  { href: "/tactics", label: "전술 보드", stage: 3 },
  { href: "/tools", label: "유틸", stage: 4 },
  { href: "/admin", label: "관리", stage: 1, adminOnly: true },
];

export function AppNav({ me }: { me: Me }) {
  const pathname = usePathname();
  return (
    <header className="border-b border-line bg-base">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/prefs" className="flex items-center gap-2.5 no-underline">
          <span
            className="block h-5 w-5 bg-accent"
            style={{ clipPath: "polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%)" }}
            aria-hidden
          />
          <span className="font-display text-xl font-bold uppercase tracking-wider text-primary">Squad Board</span>
        </Link>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-sm font-medium" aria-label="주요 메뉴">
          {NAV.filter((n) => !n.adminOnly || me.role === "admin").map((n) => {
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
            const enabled = n.stage === 1;
            if (!enabled) {
              return (
                <span
                  key={n.href}
                  className="whitespace-nowrap px-3 py-2 text-muted"
                  title={`${n.stage}단계에서 추가 예정`}
                  aria-disabled
                >
                  {n.label}
                </span>
              );
            }
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`whitespace-nowrap border-b-2 px-3 py-2 no-underline ${
                  active ? "border-accent text-primary" : "border-transparent text-secondary hover:text-primary"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-base"
            style={{ background: me.color }}
            aria-hidden
          >
            {me.nickname.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden text-sm font-medium sm:inline">{me.nickname}</span>
          {me.role === "admin" ? <span className="font-mono text-[11px] text-muted">admin</span> : null}
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
