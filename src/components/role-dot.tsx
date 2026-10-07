import { ROLE_LABELS } from "@/db/seed-data";
import type { RoleGroup } from "@/db/schema";

/** 역할군 색 점. 요원 이름 앞에 붙여 역할군을 한눈에 보이게 한다. */
export function RoleDot({ role, size = 8 }: { role: RoleGroup; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: ROLE_LABELS[role].cssVar }}
      title={ROLE_LABELS[role].ko}
      aria-label={ROLE_LABELS[role].ko}
    />
  );
}

/** 역할군 텍스트 배지 (색 글자) */
export function RoleText({ role }: { role: RoleGroup }) {
  return (
    <span className="text-[11px]" style={{ color: ROLE_LABELS[role].cssVar }}>
      {ROLE_LABELS[role].ko}
    </span>
  );
}
