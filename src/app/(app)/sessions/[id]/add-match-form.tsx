"use client";

import { useActionState, useState } from "react";
import { TEAM_SIZE } from "@/lib/squad/compose";
import { addMatchAction } from "@/server/actions/sessions";
import type { ActionResult } from "@/server/actions/auth";
import { MemberAvatar } from "@/components/result-badge";

type MapOption = { id: string; nameKo: string; inPool: boolean };
type MemberOption = { id: string; nickname: string; color: string };

/**
 * 경기 추가 폼. 맵과 출전 멤버(≤5)를 고르면 서버가 이 맵 선호로 요원·포지션을 미리 채운다.
 * 참가자가 5명 이하면 전원 기본 선택.
 */
export function AddMatchForm({ sessionId, maps, participants }: { sessionId: string; maps: MapOption[]; participants: MemberOption[] }) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(addMatchAction, null);
  const [mapId, setMapId] = useState(maps.find((m) => m.inPool)?.id ?? maps[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(participants.length <= TEAM_SIZE ? participants.map((p) => p.id) : []),
  );

  // 경기가 추가되면 부모가 key(경기 수)를 바꿔 이 폼을 다시 마운트하므로, 여기서 상태를 되돌릴 필요가 없다.

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < TEAM_SIZE) next.add(id);
      return next;
    });

  return (
    <form action={formAction} className="card flex flex-col gap-4 p-5">
      <input type="hidden" name="sessionId" value={sessionId} />
      <h3 className="font-display text-xl font-bold tracking-wide">경기 추가</h3>
      <div>
        <label htmlFor="add-map" className="label">
          맵
        </label>
        <select id="add-map" name="mapId" value={mapId} onChange={(e) => setMapId(e.target.value)} className="input">
          {maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nameKo}
              {m.inPool ? "" : " (풀 밖)"}
            </option>
          ))}
        </select>
      </div>
      <div>
        <div className="label">
          출전 멤버 <span className="text-muted">({selected.size}/{TEAM_SIZE})</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {participants.map((p) => {
            const on = selected.has(p.id);
            return (
              <label
                key={p.id}
                className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-sm ${
                  on ? "border-accent bg-accent-subtle" : "border-line bg-raised"
                }`}
              >
                <input type="checkbox" name="playerIds" value={p.id} checked={on} onChange={() => toggle(p.id)} className="sr-only" />
                <MemberAvatar nickname={p.nickname} color={p.color} size={5} />
                <span className="truncate">{p.nickname}</span>
              </label>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted">요원·포지션은 이 맵의 선호를 바탕으로 미리 채워지며, 저장 전에 고칠 수 있습니다.</p>
      {result && !result.ok ? <p className="text-xs text-accent-hover">{result.error}</p> : null}
      <button type="submit" className="btn-primary" disabled={pending || selected.size === 0}>
        {pending ? "추가 중…" : "경기 추가"}
      </button>
    </form>
  );
}
