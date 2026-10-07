"use client";

import { useActionState, useState } from "react";
import type { RoundType, TacticSide } from "@/db/schema";
import { ROUND_TYPE_LABELS, ROUND_TYPE_ORDER, TACTIC_SIDE_LABELS, TACTIC_SIDE_ORDER } from "@/lib/tactics/types";
import { createTacticAction } from "@/server/actions/tactics";
import type { ActionResult } from "@/server/actions/auth";

/** 새 전술 생성. 성공하면 서버 액션이 보드 편집기로 리다이렉트한다. */
export function NewTacticForm({ mapId }: { mapId: string }) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(createTacticAction, null);
  const [name, setName] = useState("");
  const [side, setSide] = useState<TacticSide>("attack");
  const [roundType, setRoundType] = useState<RoundType>("any");
  const [tags, setTags] = useState("");
  const fieldError = (k: string) => (result && !result.ok ? result.fieldErrors?.[k] : undefined);
  return (
    <form action={formAction} className="card flex flex-col gap-3 p-5">
      <input type="hidden" name="mapId" value={mapId} />
      <h2 className="font-display text-2xl font-bold tracking-wide">새 전술</h2>
      <label className="block">
        <span className="label">이름</span>
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="예: A 러시 (더블 연막)" required className="input" />
        {fieldError("name") ? <p className="mt-1 text-xs text-accent-hover">{fieldError("name")}</p> : null}
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">진영</span>
          <select name="side" value={side} onChange={(e) => setSide(e.target.value as TacticSide)} className="input">
            {TACTIC_SIDE_ORDER.map((s) => (
              <option key={s} value={s}>
                {TACTIC_SIDE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">라운드 유형</span>
          <select name="roundType" value={roundType} onChange={(e) => setRoundType(e.target.value as RoundType)} className="input">
            {ROUND_TYPE_ORDER.map((r) => (
              <option key={r} value={r}>
                {ROUND_TYPE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">태그 (쉼표로 구분, 최대 8개)</span>
        <input name="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="러시, 포스트플랜트" className="input" />
      </label>
      {result && !result.ok && !result.fieldErrors ? <p className="text-xs text-accent-hover">{result.error}</p> : null}
      <button type="submit" className="btn-primary" disabled={pending || !name.trim()}>
        {pending ? "만드는 중…" : "전술 만들기 → 보드 열기"}
      </button>
      <p className="text-xs text-muted">단계 1과 빈 슬롯 5개가 함께 만들어집니다. 보드에서 핑·토큰을 배치하세요.</p>
    </form>
  );
}
