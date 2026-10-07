"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { members } from "@/db/schema";
import { clearSessionCookie, createSessionCookie } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { createLogger, errorMeta } from "@/lib/logger";
import { timingSafeEqual } from "node:crypto";

/**
 * 인증 서버 액션.
 *
 * 서버 액션 반환 규약(이 프로젝트 공통):
 *   { ok: true } | { ok: false, error: string, fieldErrors?: Record<string,string> }
 * 폼은 useActionState로 이 값을 받아 화면에 표시한다. 예외를 클라이언트로 던지지 않는다 —
 * 예외는 스택 트레이스가 노출될 수 있고, 사용자에게 보여줄 문장이 아니기 때문.
 */
const log = createLogger("auth");

export type ActionResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const loginSchema = z.object({
  passcode: z.string().min(1, "패스코드를 입력하세요"),
  memberId: z.string().uuid("닉네임을 선택하세요"),
  next: z.string().optional(),
});

/** 길이가 달라도 시간 차가 새지 않도록 상수 시간 비교 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function loginAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    passcode: formData.get("passcode"),
    memberId: formData.get("memberId"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { ok: false, error: "입력을 확인하세요", fieldErrors };
  }
  const { passcode, memberId, next } = parsed.data;

  const env = getEnv();
  if (!safeEqual(passcode, env.SQUAD_PASSCODE)) {
    log.warn("login failed: bad passcode", { memberId });
    return { ok: false, error: "패스코드가 틀렸습니다", fieldErrors: { passcode: "패스코드가 틀렸습니다" } };
  }

  try {
    const member = await db
      .select({ id: members.id, nickname: members.nickname })
      .from(members)
      .where(and(eq(members.id, memberId), eq(members.isActive, true)))
      .get();
    if (!member) return { ok: false, error: "선택한 닉네임을 찾을 수 없습니다" };

    await createSessionCookie(member.id);
    log.info("login ok", { memberId: member.id, nickname: member.nickname });
  } catch (err) {
    log.error("login error", errorMeta(err));
    return { ok: false, error: "로그인 처리 중 오류가 났습니다. 잠시 후 다시 시도하세요" };
  }

  // 열린 리다이렉트 방지: 내부 경로("/...")만 허용, "//evil.com" 같은 값은 거부
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/prefs";
  redirect(target);
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
