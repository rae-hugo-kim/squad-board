import type { MemberRole } from "@/db/schema";

/**
 * 멤버 티어 표시용 상수 — 클라이언트에서도 쓰므로 schema.ts에서는 타입만 가져온다
 * (값을 import하면 drizzle-orm이 클라이언트 번들에 들어간다).
 */
export const MEMBER_ROLE_ORDER: MemberRole[] = ["admin", "tactician", "member"];

export const MEMBER_ROLE_LABELS: Record<MemberRole, { ko: string; short: string }> = {
  admin: { ko: "관리자", short: "admin" },
  tactician: { ko: "전술가", short: "tactician" },
  member: { ko: "일반", short: "" },
};

/** 전술가 이상(전술가·관리자)인지 — 공통 전술 생성·우선도 지정 권한의 기준. */
export function isTacticianOrAbove(role: MemberRole): boolean {
  return role === "admin" || role === "tactician";
}
