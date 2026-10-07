"use client";

import { useActionState, useState } from "react";
import type { RoleGroup } from "@/db/schema";
import { ROLE_LABELS } from "@/db/seed-data";
import { saveMyPreferenceAction } from "@/server/actions/prefs";
import type { ActionResult } from "@/server/actions/auth";

type AgentOption = { id: string; nameKo: string; roleGroup: RoleGroup };

type Initial = {
  agent1Id: string;
  agent2Id: string;
  agent3Id: string;
  attackPosition: string;
  defensePosition: string;
  confidence: number;
  memo: string;
};

const EMPTY: Initial = {
  agent1Id: "",
  agent2Id: "",
  agent3Id: "",
  attackPosition: "",
  defensePosition: "",
  confidence: 3,
  memo: "",
};

/**
 * 내 선호 편집 폼.
 * - 요원 선택은 <select>로 단순하게. 역할군별 optgroup으로 묶어 고르기 쉽게 한다.
 * - 이미 고른 요원은 다른 순위 목록에서 비활성 처리해 중복을 입력 단계에서 막는다
 *   (서버도 한 번 더 검사한다 — 클라이언트 검사는 편의, 서버 검사는 규칙).
 * - 부모가 key={map.id}를 주므로 맵을 바꾸면 폼 상태가 초기화된다.
 */
export function MyPreferenceForm({
  mapId,
  agents,
  initial,
}: {
  mapId: string;
  agents: AgentOption[];
  initial: Initial | null;
}) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(saveMyPreferenceAction, null);
  const [form, setForm] = useState<Initial>(initial ?? EMPTY);

  const fieldError = (name: string) => (result && !result.ok ? result.fieldErrors?.[name] : undefined);
  const chosen = new Set([form.agent1Id, form.agent2Id, form.agent3Id].filter(Boolean));

  const groups = (["duelist", "initiator", "controller", "sentinel"] as RoleGroup[]).map((g) => ({
    role: g,
    label: ROLE_LABELS[g].ko,
    items: agents.filter((a) => a.roleGroup === g),
  }));

  // 컴포넌트가 아니라 "렌더 함수"로 둔다. 컴포넌트를 함수 안에서 정의하면 렌더마다
  // 새 타입으로 취급되어 매번 언마운트/마운트가 일어나기 때문.
  const renderAgentSelect = (name: "agent1Id" | "agent2Id" | "agent3Id", rank: number) => {
    const value = form[name];
    const current = agents.find((a) => a.id === value);
    return (
      <div className="flex items-center gap-2">
        <span className="w-4 font-mono text-xs text-secondary">{rank}</span>
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: current ? ROLE_LABELS[current.roleGroup].cssVar : "var(--border)" }}
          aria-hidden
        />
        <select
          name={name}
          value={value}
          onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
          className="input flex-1"
          aria-label={`${rank}순위 요원`}
        >
          <option value="">{rank === 1 ? "선택" : "(없음)"}</option>
          {groups.map((g) => (
            <optgroup key={g.role} label={g.label}>
              {g.items.map((a) => (
                <option key={a.id} value={a.id} disabled={chosen.has(a.id) && a.id !== value}>
                  {a.nameKo}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    );
  };

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="mapId" value={mapId} />

      <div>
        <div className="label">선호 요원 (1순위부터)</div>
        <div className="flex flex-col gap-2">
          {renderAgentSelect("agent1Id", 1)}
          {renderAgentSelect("agent2Id", 2)}
          {renderAgentSelect("agent3Id", 3)}
        </div>
        {fieldError("agent1Id") ? <p className="mt-1 text-xs text-accent-hover">{fieldError("agent1Id")}</p> : null}
      </div>

      <div>
        <label htmlFor="attackPosition" className="label">
          공격 포지션
        </label>
        <input
          id="attackPosition"
          name="attackPosition"
          value={form.attackPosition}
          onChange={(e) => setForm((f) => ({ ...f, attackPosition: e.target.value }))}
          maxLength={60}
          placeholder="예: A 메인 후방 · 연막 후 진입"
          className="input"
        />
        {fieldError("attackPosition") ? <p className="mt-1 text-xs text-accent-hover">{fieldError("attackPosition")}</p> : null}
      </div>

      <div>
        <label htmlFor="defensePosition" className="label">
          수비 포지션
        </label>
        <input
          id="defensePosition"
          name="defensePosition"
          value={form.defensePosition}
          onChange={(e) => setForm((f) => ({ ...f, defensePosition: e.target.value }))}
          maxLength={60}
          placeholder="예: A 사이트 앵커"
          className="input"
        />
      </div>

      <div>
        <div className="label">자신감</div>
        <div className="flex gap-1.5" role="radiogroup" aria-label="자신감">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = form.confidence === n;
            return (
              <label
                key={n}
                className={`flex h-10 flex-1 cursor-pointer items-center justify-center rounded-sm border font-mono text-sm ${
                  active ? "border-accent bg-accent-subtle font-bold text-primary" : "border-line text-secondary hover:text-primary"
                }`}
              >
                <input
                  type="radio"
                  name="confidence"
                  value={n}
                  checked={active}
                  onChange={() => setForm((f) => ({ ...f, confidence: n }))}
                  className="sr-only"
                />
                {n}
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="memo" className="label">
          한 줄 메모
        </label>
        <textarea
          id="memo"
          name="memo"
          value={form.memo}
          onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
          maxLength={200}
          rows={2}
          placeholder="예: 카타콤 연막 라인업 3개 있음"
          className="input resize-none"
        />
      </div>

      {result && !result.ok && !result.fieldErrors ? (
        <p className="rounded-sm border border-accent bg-accent-subtle px-3 py-2 text-sm">{result.error}</p>
      ) : null}
      {result?.ok ? <p className="text-xs text-success">저장했습니다.</p> : null}

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "저장 중…" : "저장"}
      </button>
    </form>
  );
}
