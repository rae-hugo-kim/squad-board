import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { members } from "@/db/schema";
import { getCurrentMember } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "입장" };

// 멤버 목록은 매번 DB에서 읽는다 (새 멤버가 추가되면 바로 보이도록)
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ next?: string }> };

/**
 * 입장 화면. 서버 컴포넌트가 활성 멤버 목록을 읽어 클라이언트 폼에 넘긴다.
 * 이미 로그인된 상태면 바로 메인으로 보낸다.
 */
export default async function LoginPage({ searchParams }: Props) {
  const current = await getCurrentMember();
  if (current) redirect("/prefs");

  const { next } = await searchParams;
  const list = await db
    .select({ id: members.id, nickname: members.nickname, color: members.color })
    .from(members)
    .where(eq(members.isActive, true))
    .orderBy(asc(members.nickname));

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div
            className="h-7 w-7 bg-accent"
            style={{ clipPath: "polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%)" }}
            aria-hidden
          />
          <div className="font-display text-3xl font-bold uppercase tracking-wider">Squad Board</div>
        </div>
        <LoginForm members={list} next={next} />
      </div>
    </main>
  );
}
