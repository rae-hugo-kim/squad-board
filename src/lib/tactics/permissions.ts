import type { MemberRole } from "@/db/schema";
import { isTacticianOrAbove } from "@/lib/members/roles";

/**
 * 전술 권한 — 순수 함수. 서버 액션(loadEditableTactic)과 화면(편집/열기 버튼, 읽기 전용 배지)이 같은 판정을 쓴다.
 *
 * 규칙(기획서 4절 권한 표 + 전술가 티어 확장)
 * - 개인 전술: 작성자와 관리자만 수정·삭제.
 * - 공통 전술(isShared): 작성자·관리자에 더해 모든 전술가가 수정·삭제할 수 있다 — 공통 전술은 팀 자산이라
 *   한 사람이 자리를 비워도 다른 전술가가 이어서 고칠 수 있어야 한다.
 * - 열람·복제는 누구나. 복제본은 항상 개인 전술로 시작한다(공통 전술이 늘어나는 것은 명시적 선택이어야 하므로).
 */
export type TacticPermissionInput = { authorId: string | null; isShared: boolean };
export type Actor = { id: string; role: MemberRole };

export function canEditTactic(tactic: TacticPermissionInput, me: Actor): boolean {
  if (me.role === "admin") return true;
  if (tactic.authorId === me.id) return true;
  return tactic.isShared && me.role === "tactician";
}

/** 공통 전술로 만들거나 공통 여부·우선도를 바꿀 수 있는지. */
export function canManageSharedTactics(me: Pick<Actor, "role">): boolean {
  return isTacticianOrAbove(me.role);
}

export const EDIT_DENIED_MESSAGE = "작성자·관리자(공통 전술은 전술가 포함)만 수정할 수 있습니다";
export const SHARED_DENIED_MESSAGE = "공통 전술은 전술가와 관리자만 만들 수 있습니다";
