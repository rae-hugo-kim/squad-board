"use client";

import Link from "next/link";
import type { RoleGroup } from "@/db/schema";
import { ROLE_LABELS } from "@/db/seed-data";
import type { ComposeAgent, Composition } from "@/lib/squad/compose";
import type { SlotDraft } from "./slots-editor";
import { AgentIcon } from "@/components/agent-icon";
import { MemberAvatar } from "@/components/result-badge";

export type LineupData = {
  /** URL의 참가자 (활성 멤버만) */
  members: Array<{ id: string; nickname: string; color: string }>;
  agents: ComposeAgent[];
  /** 이 전술로 계산한 상위 조합 */
  composition: Composition;
  /** 같은 맵의 다른 공통 전술 — 실행 가능 여부와 함께 (링크는 같은 참가자 유지) */
  alternatives: Array<{ id: string; name: string; priority: number; feasible: boolean; reasons: string[]; href: string }>;
  /** 이 라인업으로 편성기(세션 시작)로 가는 링크 */
  squadHref: string;
};

/**
 * 오늘의 라인업 패널 — 랜딩에서 참가자·맵을 고르고 들어오면 보드 위에 표시된다.
 * 전술가가 정한 슬롯(역할·설명)에 편성기가 선호·숙련 기준으로 멤버를 배치한 결과를 보여주고,
 * 토큰(슬롯 번호)에 같은 정보가 얹힌다. 전술 데이터는 바꾸지 않는다 — 읽기 전용 뷰.
 */
export function LineupPanel({ lineup, slots, tacticName }: { lineup: LineupData; slots: SlotDraft[]; tacticName: string }) {
  const { composition } = lineup;
  const fit = composition.tacticFits[0];
  const agentById = new Map(lineup.agents.map((a) => [a.id, a]));
  const memberById = new Map(lineup.members.map((m) => [m.id, m]));
  const slotById = new Map(composition.slots.map((s) => [s.memberId, s]));
  const boundMembers = new Set(Object.values(fit?.bindings ?? {}));
  const unbound = composition.slots.filter((s) => !boundMembers.has(s.memberId));
  const configured = slots.filter((s) => s.roleGroup || s.agentId || s.description.trim() || s.fixedMemberId);

  return (
    <section className={`card p-4 ${fit && !fit.feasible ? "border-danger/60" : "border-info/40"}`} data-lineup>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl font-bold tracking-wide">오늘의 라인업</h2>
        <span className="text-xs text-secondary">
          참가 {lineup.members.length}명 · 점수 <span className="font-mono text-primary">{composition.score.toFixed(1)}</span>
        </span>
        {fit ? (
          fit.feasible ? (
            <span className="badge bg-success/15 text-success">
              실행 가능 · 슬롯 {fit.filled}/{fit.total}
            </span>
          ) : (
            <span className="badge bg-danger/15 text-danger" title={fit.infeasibleReasons.join("\n")}>
              실행 불가 — 포기 권고
            </span>
          )
        ) : null}
        {composition.meetsRules ? null : <span className="badge bg-warning/15 text-warning">역할군 규칙 미달</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={lineup.squadHref} className="btn-primary min-h-9 px-3 text-xs no-underline">
            이 편성으로 세션 시작 →
          </Link>
          <Link href="/" className="btn-secondary min-h-9 px-3 text-xs no-underline">
            참가자 다시 고르기
          </Link>
        </div>
      </div>

      {fit && !fit.feasible ? (
        <p className="mb-3 rounded-md border border-danger/40 bg-danger/5 p-2 text-xs text-danger">
          오늘 참가자의 요원 폭으로는 &quot;{tacticName}&quot;을 그대로 실행할 수 없습니다: {fit.infeasibleReasons.join(" · ")}. 아래 다른 공통 전술을 고르거나 포지션을 조정하세요.
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {configured.length === 0 ? <p className="text-xs text-muted sm:col-span-2 lg:col-span-5">이 전술은 슬롯이 설정되어 있지 않아 멤버를 슬롯에 배치하지 못합니다. 아래 &quot;역할 슬롯&quot;을 채우세요.</p> : null}
        {configured.map((slot) => {
          const memberId = fit?.bindings[slot.slotNo];
          const m = memberId ? memberById.get(memberId) : undefined;
          const a = memberId ? slotById.get(memberId) : undefined;
          const agent = a?.agentId ? agentById.get(a.agentId) : slot.agentId ? agentById.get(slot.agentId) : undefined;
          return (
            <div key={slot.slotNo} className={`rounded-md border p-2.5 text-xs ${m ? "border-line bg-base" : "border-dashed border-warning/60 bg-warning/5"}`} data-lineup-slot={slot.slotNo}>
              <div className="mb-1 flex items-center gap-1.5 text-secondary">
                <span className="font-mono">#{slot.slotNo}</span>
                {slot.roleGroup ? <span style={{ color: ROLE_LABELS[slot.roleGroup as RoleGroup].cssVar }}>{ROLE_LABELS[slot.roleGroup as RoleGroup].ko}</span> : null}
                <span className="truncate">{slot.description}</span>
              </div>
              {m ? (
                <div className="flex items-center gap-2">
                  <MemberAvatar nickname={m.nickname} color={m.color} size={6} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-primary">{m.nickname}</div>
                    <div className="flex items-center gap-1 text-secondary">
                      {agent ? <AgentIcon agent={agent} size={16} /> : null}
                      <span className="truncate">{agent?.nameKo ?? "요원 미정"}</span>
                      {a?.rank ? <span className="text-muted">{a.rank}순위</span> : a?.agentId ? <span className="text-warning">선호 밖</span> : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-warning">빈 슬롯 — 맡을 멤버 없음</div>
              )}
            </div>
          );
        })}
      </div>

      {unbound.length || composition.bench.length ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-secondary">
          {unbound.length ? (
            <span>
              슬롯 밖: {unbound.map((s) => `${s.nickname}${s.agentId ? ` (${agentById.get(s.agentId)?.nameKo ?? ""})` : ""}`).join(", ")}
            </span>
          ) : null}
          {composition.bench.length ? <span>벤치: {composition.bench.map((id) => memberById.get(id)?.nickname ?? id).join(", ")}</span> : null}
        </div>
      ) : null}

      {lineup.alternatives.length ? (
        <div className="mt-3 border-t border-line pt-2 text-xs">
          <span className="mr-2 text-secondary">다른 공통 전술:</span>
          <span className="inline-flex flex-wrap gap-1.5">
            {lineup.alternatives.map((t) => (
              <Link
                key={t.id}
                href={t.href}
                title={t.feasible ? "실행 가능" : `실행 불가(포기): ${t.reasons.join("; ")}`}
                className={`rounded-sm border px-2 py-0.5 no-underline ${t.feasible ? "border-line text-primary hover:border-line-strong" : "border-dashed border-line text-muted line-through"}`}
              >
                {t.priority > 0 ? <span className="mr-1 font-mono text-muted">{t.priority}.</span> : null}
                {t.name}
              </Link>
            ))}
          </span>
        </div>
      ) : null}
    </section>
  );
}
