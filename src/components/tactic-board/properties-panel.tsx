"use client";

import type { Ability, RoleGroup } from "@/db/schema";
import { ABILITY_KIND_LABELS, ROLE_LABELS } from "@/db/seed-data";
import { OBJECT_META, type BoardObject } from "@/lib/tactics/types";

export type AgentWithAbilities = { id: string; nameKo: string; roleGroup: RoleGroup; abilities: Ability[] };

/**
 * 선택한 객체의 속성 패널 (기획서 4절 "객체 클릭 시 우측에 속성 패널").
 * 모든 입력은 즉시 상위 상태를 바꾸고(controlled), 저장은 편집기의 자동 저장·저장 버튼이 맡는다.
 */
export function PropertiesPanel({
  obj,
  objects,
  agents,
  readOnly,
  onChange,
  onDelete,
  onBringToFront,
}: {
  obj: BoardObject;
  objects: BoardObject[];
  agents: AgentWithAbilities[];
  readOnly: boolean;
  onChange: (patch: Partial<BoardObject>) => void;
  onDelete: () => void;
  onBringToFront: () => void;
}) {
  const meta = OBJECT_META[obj.kind];
  const caster = obj.casterAgentId ? agents.find((a) => a.id === obj.casterAgentId) : undefined;
  const abilityOptions = caster ? caster.abilities.filter((ab) => !meta.abilityKind || ab.kind === meta.abilityKind || ab.kind === "ult") : [];
  const linkTargets = objects.filter((o) => o.id !== obj.id && OBJECT_META[o.kind].isAbility && o.kind !== "cast");

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-bold">{meta.label}</span>
        {!readOnly ? (
          <span className="flex gap-1">
            <button type="button" onClick={onBringToFront} className="btn-secondary min-h-8 px-2 text-xs" title="맨 위로">
              맨 위로
            </button>
            <button type="button" onClick={onDelete} className="btn-danger min-h-8 px-2 text-xs">
              삭제
            </button>
          </span>
        ) : null}
      </div>

      <fieldset disabled={readOnly} className="contents">
        <label className="block">
          <span className="label">{obj.kind === "timing" ? "시간 (예: 0:15)" : obj.kind === "note" ? "메모 내용" : "라벨"}</span>
          <input value={obj.label} onChange={(e) => onChange({ label: e.target.value.slice(0, 40) })} maxLength={40} className="input py-1.5" />
        </label>

        {obj.kind === "agent" ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="label">슬롯</span>
              <select value={obj.slotNo ?? ""} onChange={(e) => onChange({ slotNo: e.target.value ? Number(e.target.value) : null })} className="input py-1.5">
                <option value="">없음</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    슬롯 {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">진영</span>
              <select value={obj.team ?? "ally"} onChange={(e) => onChange({ team: e.target.value as "ally" | "enemy" })} className="input py-1.5">
                <option value="ally">아군</option>
                <option value="enemy">적군</option>
              </select>
            </label>
            <label className="col-span-2 block">
              <span className="label">요원 (선택 — 슬롯 전술은 비워 둔다)</span>
              <select value={obj.casterAgentId ?? ""} onChange={(e) => onChange({ casterAgentId: e.target.value || null })} className="input py-1.5">
                <option value="">(슬롯만)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nameKo} · {ROLE_LABELS[a.roleGroup].ko}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {meta.isAbility ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="label">시전 요원</span>
              <select
                value={obj.casterAgentId ?? ""}
                onChange={(e) => onChange({ casterAgentId: e.target.value || null, abilityKey: null })}
                className="input py-1.5"
              >
                <option value="">(미정)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nameKo}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">스킬</span>
              <select value={obj.abilityKey ?? ""} onChange={(e) => onChange({ abilityKey: e.target.value || null })} className="input py-1.5" disabled={!caster}>
                <option value="">(미정)</option>
                {abilityOptions.map((ab) => (
                  <option key={ab.key} value={ab.key}>
                    {ab.key.toUpperCase()} {ab.nameKo} · {ABILITY_KIND_LABELS[ab.kind]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {obj.kind === "cast" ? (
          <label className="block">
            <span className="label">연결된 핑 (여기서 던지면 저기에 떨어짐)</span>
            <select value={obj.linkedObjectId ?? ""} onChange={(e) => onChange({ linkedObjectId: e.target.value || null })} className="input py-1.5">
              <option value="">(없음)</option>
              {linkTargets.map((o) => (
                <option key={o.id} value={o.id}>
                  {OBJECT_META[o.kind].label}
                  {o.label ? ` · ${o.label}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {meta.isPath ? (
          <label className="block">
            <span className="label">연결 슬롯</span>
            <select value={obj.slotNo ?? ""} onChange={(e) => onChange({ slotNo: e.target.value ? Number(e.target.value) : null })} className="input py-1.5">
              <option value="">없음</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  슬롯 {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {meta.hasRadius ? (
          <label className="block">
            <span className="label">
              반경 <span className="font-mono text-muted">{((obj.radius ?? 0.04) * 100).toFixed(1)}%</span>
            </span>
            <input type="range" min={0.5} max={30} step={0.5} value={(obj.radius ?? 0.04) * 100} onChange={(e) => onChange({ radius: Number(e.target.value) / 100 })} className="w-full accent-[var(--accent)]" />
          </label>
        ) : null}
        {meta.hasAngle ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="label">
                각도 <span className="font-mono text-muted">{obj.angle ?? 70}°</span>
              </span>
              <input type="range" min={10} max={360} step={5} value={obj.angle ?? 70} onChange={(e) => onChange({ angle: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
            </label>
            <label className="block">
              <span className="label">
                방향 <span className="font-mono text-muted">{Math.round(obj.rotation)}°</span>
              </span>
              <input type="range" min={0} max={359} step={1} value={((obj.rotation % 360) + 360) % 360} onChange={(e) => onChange({ rotation: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
            </label>
          </div>
        ) : null}

        {(meta.isAbility || obj.kind === "cast") ? (
          <label className="block">
            <span className="label">외부 라인업 링크 (Easy Lineup · Valoline 등)</span>
            <input value={obj.externalUrl ?? ""} onChange={(e) => onChange({ externalUrl: e.target.value || null })} placeholder="https://" className="input py-1.5 font-mono text-xs" />
          </label>
        ) : null}

        <label className="block">
          <span className="label">메모</span>
          <textarea value={obj.memo} onChange={(e) => onChange({ memo: e.target.value.slice(0, 200) })} rows={2} maxLength={200} className="input resize-none py-1.5" />
        </label>
      </fieldset>

      {obj.externalUrl ? (
        <a href={obj.externalUrl} target="_blank" rel="noreferrer noopener" className="text-xs text-info">
          라인업 링크 열기 ↗
        </a>
      ) : null}
    </div>
  );
}
