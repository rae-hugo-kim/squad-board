"use client";

import { useActionState, useMemo, useState } from "react";
import type { RoleGroup } from "@/db/schema";
import { ROLE_LABELS } from "@/db/seed-data";
import { evaluateAssignment, type ComposeAgent, type ComposeMember, type ComposeTactic, type Composition } from "@/lib/squad/compose";
import { createSessionFromSquadAction } from "@/server/actions/sessions";
import type { ActionResult } from "@/server/actions/auth";
import { AgentSelect } from "@/components/agent-select";
import { RoleDot } from "@/components/role-dot";

/**
 * 추천 조합 카드.
 * - 서버가 계산한 조합을 초기값으로 받고, 요원을 바꾸면 같은 순수 함수(evaluateAssignment)로 즉시 다시 채점한다.
 *   서버 로직을 클라이언트에서 복제하지 않기 위해 compose.ts를 양쪽에서 import한다.
 * - "이 조합으로 세션 시작"은 날짜 + 슬롯(JSON)을 서버 액션에 보내 세션과 1경기를 만든다.
 */
export function CompositionCard({
  index,
  composition,
  members,
  agents,
  tactics,
  mapId,
  mapName,
  defaultDate,
}: {
  index: number;
  composition: Composition;
  members: ComposeMember[];
  agents: ComposeAgent[];
  tactics: ComposeTactic[];
  mapId: string;
  mapName: string;
  defaultDate: string;
}) {
  const teamIds = useMemo(() => new Set(composition.slots.map((s) => s.memberId)), [composition]);
  const teamMembers = useMemo(() => members.filter((m) => teamIds.has(m.id)), [members, teamIds]);
  const [assignment, setAssignment] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(composition.slots.map((s) => [s.memberId, s.agentId])),
  );
  const [date, setDate] = useState(defaultDate);
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(createSessionFromSquadAction, null);

  const touched = composition.slots.some((s) => assignment[s.memberId] !== s.agentId);
  const current = useMemo(
    () => (touched ? evaluateAssignment({ members: teamMembers, agents, assignment, tactics }) : composition),
    [touched, teamMembers, agents, assignment, composition, tactics],
  );
  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const taken = new Set(Object.values(assignment).filter((x): x is string => Boolean(x)));

  const slotsPayload = current.slots.map((s) => ({
    memberId: s.memberId,
    agentId: assignment[s.memberId] ?? null,
    position: [s.attackPosition, s.defensePosition].filter(Boolean).join(" / "),
  }));
  /** 확정 시 경기에 기록할 전술별 슬롯 바인딩 {슬롯번호: 멤버id} */
  const tacticsPayload = current.tacticFits.map((f) => ({ tacticId: f.tacticId, bindings: f.bindings }));

  return (
    <article className={`card p-5 ${index === 0 ? "border-accent/60" : ""}`}>
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <span className={`badge ${index === 0 ? "bg-accent text-white" : "border border-line text-secondary"}`}>{index + 1}안</span>
        <span className="font-mono text-lg font-bold">{current.score.toFixed(1)}점</span>
        {current.meetsRules ? (
          <span className="badge bg-success/15 text-success">규칙 충족</span>
        ) : (
          <span className="badge bg-warning/15 text-warning">규칙 미달</span>
        )}
        {touched ? <span className="text-xs text-info">수동 조정됨 — 점수를 다시 계산했습니다</span> : null}
        <span className="ml-auto flex gap-2 text-[11px]">
          {(Object.keys(current.roleCount) as RoleGroup[]).map((g) => (
            <span key={g} style={{ color: ROLE_LABELS[g].cssVar }}>
              {ROLE_LABELS[g].ko} {current.roleCount[g]}
            </span>
          ))}
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-xs text-secondary">
            <tr>
              <th className="pb-2 text-left font-normal">멤버</th>
              <th className="pb-2 text-left font-normal">요원</th>
              <th className="pb-2 text-left font-normal">선호</th>
              <th className="pb-2 text-left font-normal">포지션 (공격 / 수비)</th>
              <th className="pb-2 text-right font-normal">점수</th>
            </tr>
          </thead>
          <tbody>
            {current.slots.map((s) => {
              const agentId = assignment[s.memberId] ?? "";
              const agent = agentId ? agentById.get(agentId) : undefined;
              const hasPref = Boolean(memberById.get(s.memberId)?.pref?.agentIds.some(Boolean));
              return (
                <tr key={s.memberId} className="border-t border-line">
                  <td className="py-2 pr-3 font-medium">{s.nickname}</td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-2">
                      {agent ? <RoleDot role={agent.roleGroup} /> : null}
                      <AgentSelect
                        name={`agent_${s.memberId}`}
                        value={agentId}
                        onChange={(v) => setAssignment((a) => ({ ...a, [s.memberId]: v || null }))}
                        agents={agents}
                        taken={taken}
                        className="input w-36 py-1"
                        ariaLabel={`${s.nickname} 요원`}
                      />
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    <span className="inline-flex flex-wrap gap-1">
                      {!hasPref ? (
                        <span className="text-warning">요원 미입력</span>
                      ) : s.rank ? (
                        <span className="text-secondary">요원 {s.rank}순위</span>
                      ) : agentId ? (
                        <span className="text-warning">선호 밖</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                      {s.roleRank ? <span className="text-info">역할군 {s.roleRank}순위</span> : null}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-[13px] text-secondary">
                    {[s.attackPosition, s.defensePosition].filter(Boolean).join(" / ") || <span className="text-muted">—</span>}
                  </td>
                  <td className="py-2 text-right font-mono">{s.points.toFixed(1)}</td>
                </tr>
              );
            })}
            {Array.from({ length: current.emptySlots }).map((_, i) => (
              <tr key={`empty-${i}`} className="border-t border-dashed border-line text-muted">
                <td className="py-2 pr-3 italic">빈 슬롯</td>
                <td colSpan={4} className="py-2 text-xs">
                  참가자가 정원보다 적습니다
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {current.tacticFits.length ? (
        <div className="mt-4 flex flex-col gap-2">
          {current.tacticFits.map((f) => (
            <div key={f.tacticId} className={`rounded-md border p-3 text-xs ${f.filled === f.total ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5"}`}>
              <div className="mb-1 flex items-center gap-2">
                <span className="font-bold">전술 {f.name}</span>
                <span className="font-mono">
                  슬롯 {f.filled}/{f.total}
                </span>
                <span className="font-mono text-secondary">+{f.points}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(f.bindings).map(([slotNo, memberId]) => (
                  <span key={slotNo} className="rounded-sm border border-line bg-raised px-1.5 py-0.5">
                    #{slotNo} → {memberById.get(memberId)?.nickname ?? memberId}
                  </span>
                ))}
                {f.unfilled.map((u) => (
                  <span key={u.slotNo} className="rounded-sm border border-dashed border-warning px-1.5 py-0.5 text-warning">
                    #{u.slotNo} {u.description} 비어 있음
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
        <div className="rounded-md border border-line bg-base p-3">
          <div className="mb-1 font-bold text-secondary">근거</div>
          <ul className="flex flex-col gap-0.5">
            {current.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
            {composition.bench.length ? (
              <li className="text-secondary">
                벤치: {composition.bench.map((id) => memberById.get(id)?.nickname ?? id).join(", ")}
              </li>
            ) : null}
          </ul>
        </div>
        <div className={`rounded-md border p-3 ${current.warnings.length ? "border-warning bg-warning/5" : "border-line bg-base"}`}>
          <div className={`mb-1 font-bold ${current.warnings.length ? "text-warning" : "text-secondary"}`}>주의</div>
          {current.warnings.length ? (
            <ul className="flex flex-col gap-0.5">
              {current.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : (
            <p className="text-secondary">없음</p>
          )}
        </div>
      </div>

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
        <input type="hidden" name="mapId" value={mapId} />
        <input type="hidden" name="slots" value={JSON.stringify(slotsPayload)} />
        <input type="hidden" name="bench" value={JSON.stringify(composition.bench)} />
        <input type="hidden" name="tactics" value={JSON.stringify(tacticsPayload)} />
        <div>
          <label htmlFor={`date-${index}`} className="label">
            세션 날짜
          </label>
          <input
            id={`date-${index}`}
            name="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="input w-44 font-mono"
          />
        </div>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "만드는 중…" : `이 조합으로 세션 시작 (${mapName} 1경기)`}
        </button>
        {result && !result.ok ? <p className="w-full text-xs text-accent-hover">{result.error}</p> : null}
      </form>
    </article>
  );
}
