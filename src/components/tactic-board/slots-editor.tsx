"use client";

import { useActionState, useState } from "react";
import type { RoleGroup } from "@/db/schema";
import { ROLE_LABELS } from "@/db/seed-data";
import { saveSlotsAction } from "@/server/actions/tactics";
import type { ActionResult } from "@/server/actions/auth";
import { AgentSelect, type AgentOption } from "@/components/agent-select";

export type SlotDraft = {
  slotNo: number;
  roleGroup: RoleGroup | null;
  agentId: string | null;
  description: string;
  positionHint: string;
  fixedMemberId: string | null;
};

const ROLE_ORDER: RoleGroup[] = ["duelist", "initiator", "controller", "sentinel"];

/**
 * 전술 슬롯 1~5 편집 (기획서 3절 "요원 토큰은 슬롯으로 저장, 멤버는 편성 때 바인딩").
 * 편성기는 roleGroup/agentId로 적합 멤버를 찾고(+2), positionHint가 멤버 선호 포지션에 들어 있으면 +1.
 */
export function SlotsEditor({
  tacticId,
  initial,
  agents,
  members,
  readOnly,
}: {
  tacticId: string;
  initial: SlotDraft[];
  agents: AgentOption[];
  members: Array<{ id: string; nickname: string }>;
  readOnly: boolean;
}) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(saveSlotsAction, null);
  const [slots, setSlots] = useState<SlotDraft[]>(() =>
    [1, 2, 3, 4, 5].map((n) => initial.find((s) => s.slotNo === n) ?? { slotNo: n, roleGroup: null, agentId: null, description: "", positionHint: "", fixedMemberId: null }),
  );
  const patch = (n: number, p: Partial<SlotDraft>) => setSlots((prev) => prev.map((s) => (s.slotNo === n ? { ...s, ...p } : s)));

  return (
    <form action={formAction} className="card p-4">
      <input type="hidden" name="tacticId" value={tacticId} />
      <input type="hidden" name="slots" value={JSON.stringify(slots)} />
      <div className="mb-3 flex items-center gap-3">
        <h3 className="font-display text-xl font-bold tracking-wide">역할 슬롯</h3>
        <span className="text-xs text-secondary">편성기가 이 슬롯에 멤버를 바인딩합니다 (역할군·요원 일치 +2, 포지션 힌트 일치 +1)</span>
      </div>
      <fieldset disabled={readOnly || pending} className="contents">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-xs text-secondary">
              <tr>
                <th className="pb-2 text-left font-normal">#</th>
                <th className="pb-2 text-left font-normal">요구 역할군</th>
                <th className="pb-2 text-left font-normal">특정 요원 (선택)</th>
                <th className="pb-2 text-left font-normal">역할 설명</th>
                <th className="pb-2 text-left font-normal">포지션 힌트</th>
                <th className="pb-2 text-left font-normal">고정 멤버 (선택)</th>
              </tr>
            </thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s.slotNo} className="border-t border-line">
                  <td className="py-1.5 pr-2 font-mono">{s.slotNo}</td>
                  <td className="py-1.5 pr-2">
                    <select value={s.roleGroup ?? ""} onChange={(e) => patch(s.slotNo, { roleGroup: (e.target.value || null) as RoleGroup | null })} className="input w-28 py-1" aria-label={`슬롯 ${s.slotNo} 역할군`}>
                      <option value="">아무나</option>
                      {ROLE_ORDER.map((g) => (
                        <option key={g} value={g}>
                          {ROLE_LABELS[g].ko}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <AgentSelect name={`slot_${s.slotNo}_agent`} value={s.agentId ?? ""} onChange={(v) => patch(s.slotNo, { agentId: v || null })} agents={agents} emptyLabel="(역할군만)" className="input w-32 py-1" ariaLabel={`슬롯 ${s.slotNo} 요원`} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input value={s.description} onChange={(e) => patch(s.slotNo, { description: e.target.value })} maxLength={40} placeholder="예: A 메인 연막 담당" className="input min-w-40 py-1" aria-label={`슬롯 ${s.slotNo} 설명`} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input value={s.positionHint} onChange={(e) => patch(s.slotNo, { positionHint: e.target.value })} maxLength={20} placeholder="예: A 메인" className="input w-28 py-1" aria-label={`슬롯 ${s.slotNo} 포지션 힌트`} />
                  </td>
                  <td className="py-1.5">
                    <select value={s.fixedMemberId ?? ""} onChange={(e) => patch(s.slotNo, { fixedMemberId: e.target.value || null })} className="input w-28 py-1" aria-label={`슬롯 ${s.slotNo} 고정 멤버`}>
                      <option value="">없음</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nickname}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>
      {!readOnly ? (
        <div className="mt-3 flex items-center gap-3">
          <button type="submit" className="btn-primary min-h-9 px-3 text-xs" disabled={pending}>
            {pending ? "저장 중…" : "슬롯 저장"}
          </button>
          {result && !result.ok ? <span className="text-xs text-accent-hover">{result.error}</span> : null}
          {result?.ok ? <span className="text-xs text-success">저장했습니다.</span> : null}
        </div>
      ) : null}
    </form>
  );
}
