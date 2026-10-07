"use client";

import { useActionState, useState } from "react";
import type { RoleGroup } from "@/db/schema";
import { ROLE_LABELS } from "@/db/seed-data";
import { saveMyRolePreferenceAction } from "@/server/actions/prefs";
import type { ActionResult } from "@/server/actions/auth";

const ROLE_ORDER: RoleGroup[] = ["duelist", "initiator", "controller", "sentinel"];

/**
 * 내 선호 역할군 1~3순위. 맵별 선호 요원과 별개로 프로필에 저장된다.
 * 이미 고른 역할군은 다른 순위에서 비활성 처리(서버도 중복을 거부한다).
 */
export function RolePreferenceForm({ initial }: { initial: RoleGroup[] }) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(saveMyRolePreferenceAction, null);
  const [roles, setRoles] = useState<string[]>([initial[0] ?? "", initial[1] ?? "", initial[2] ?? ""]);
  const chosen = new Set(roles.filter(Boolean));
  const set = (i: number, v: string) => setRoles((prev) => prev.map((r, j) => (j === i ? v : r)));

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="label">선호 역할군 (맵과 무관, 1순위부터)</div>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <select key={i} name={`role${i + 1}`} value={roles[i]} onChange={(e) => set(i, e.target.value)} className="input py-1.5" aria-label={`선호 역할군 ${i + 1}순위`}>
            <option value="">{i === 0 ? "선택" : "(없음)"}</option>
            {ROLE_ORDER.map((g) => (
              <option key={g} value={g} disabled={chosen.has(g) && roles[i] !== g}>
                {ROLE_LABELS[g].ko}
              </option>
            ))}
          </select>
        ))}
      </div>
      <p className="text-xs text-muted">편성 점수: 배정 요원의 역할군이 1·2·3순위와 맞으면 +1.5 / +1 / +0.5. 선호 요원을 안 적은 맵에서는 1순위 역할군 요원이 후보가 됩니다.</p>
      {result && !result.ok ? <p className="text-xs text-accent-hover">{result.error}</p> : null}
      {result?.ok ? <p className="text-xs text-success">저장했습니다.</p> : null}
      <button type="submit" className="btn-secondary self-start" disabled={pending}>
        {pending ? "저장 중…" : "역할군 저장"}
      </button>
    </form>
  );
}
