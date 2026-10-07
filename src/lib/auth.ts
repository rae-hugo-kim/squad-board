import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { members, type Member } from "@/db/schema";
import { getEnv } from "./env";
import { SESSION_COOKIE, SESSION_MAX_AGE_SEC, signSession, verifySession } from "./session";

/**
 * 서버 컴포넌트·서버 액션에서 쓰는 인증 헬퍼.
 * `server-only`를 import해 두면 실수로 클라이언트 컴포넌트에서 가져올 때 빌드가 실패한다.
 */

/** 현재 로그인한 멤버. 없으면 null. 비활성 멤버는 로그인 상태로 치지 않는다. */
export async function getCurrentMember(): Promise<Member | null> {
  const env = getEnv();
  const store = await cookies();
  const payload = await verifySession(store.get(SESSION_COOKIE)?.value, env.SESSION_SECRET);
  if (!payload) return null;
  const member = await db.select().from(members).where(eq(members.id, payload.mid)).get();
  if (!member || !member.isActive) return null;
  return member;
}

/** 로그인 필수 페이지에서 호출. 없으면 /login으로 보낸다. */
export async function requireMember(): Promise<Member> {
  const m = await getCurrentMember();
  if (!m) redirect("/login");
  return m;
}

/** 관리자 전용. 일반 멤버·전술가는 랜딩으로 돌려보낸다. */
export async function requireAdmin(): Promise<Member> {
  const m = await requireMember();
  if (m.role !== "admin") redirect("/");
  return m;
}

/** 세션 쿠키 발급. 로그인 액션에서 호출. */
export async function createSessionCookie(memberId: string): Promise<void> {
  const env = getEnv();
  const token = await signSession(
    { mid: memberId, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC },
    env.SESSION_SECRET,
  );
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true, // JS에서 읽지 못하게 — XSS로 토큰이 새는 것을 막는다
    sameSite: "lax", // 외부 사이트에서 온 POST에는 쿠키를 안 붙인다 (CSRF 완화)
    secure: env.NODE_ENV === "production", // 운영에서는 HTTPS에서만 전송
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
