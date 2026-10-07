"use client";

import type { RoleGroup } from "@/db/schema";
import { ROLE_LABELS } from "@/db/seed-data";

export type AgentOption = { id: string; nameKo: string; roleGroup: RoleGroup };

const ROLE_ORDER: RoleGroup[] = ["duelist", "initiator", "controller", "sentinel"];

/**
 * 역할군별 optgroup으로 묶은 요원 <select>. 선호 편집·편성 조정·경기 기록이 같은 모양을 쓴다.
 * `taken`에 든 요원은 비활성 처리해 중복을 입력 단계에서 막는다 (서버가 다시 검사한다).
 */
export function AgentSelect({
  name,
  value,
  onChange,
  agents,
  taken,
  emptyLabel = "(미정)",
  disabled,
  className = "input",
  ariaLabel,
}: {
  name: string;
  value: string;
  onChange: (agentId: string) => void;
  agents: AgentOption[];
  taken?: Set<string>;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
    >
      <option value="">{emptyLabel}</option>
      {ROLE_ORDER.map((g) => (
        <optgroup key={g} label={ROLE_LABELS[g].ko}>
          {agents
            .filter((a) => a.roleGroup === g)
            .map((a) => (
              <option key={a.id} value={a.id} disabled={Boolean(taken?.has(a.id)) && a.id !== value}>
                {a.nameKo}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}
