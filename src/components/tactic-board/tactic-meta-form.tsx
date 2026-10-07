"use client";

import { useActionState, useState } from "react";
import type { RoundType, TacticSide } from "@/db/schema";
import { ROUND_TYPE_LABELS, ROUND_TYPE_ORDER, TACTIC_SIDE_LABELS, TACTIC_SIDE_ORDER } from "@/lib/tactics/types";
import { updateTacticMetaAction } from "@/server/actions/tactics";
import type { ActionResult } from "@/server/actions/auth";

/** 전술 이름·진영·라운드 유형·태그 수정 (작성자·관리자). */
export function TacticMetaForm({
  tacticId,
  initial,
}: {
  tacticId: string;
  initial: { name: string; side: TacticSide; roundType: RoundType; tags: string[] };
}) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(updateTacticMetaAction, null);
  const [name, setName] = useState(initial.name);
  const [side, setSide] = useState<TacticSide>(initial.side);
  const [roundType, setRoundType] = useState<RoundType>(initial.roundType);
  const [tags, setTags] = useState(initial.tags.join(", "));
  const fieldError = (k: string) => (result && !result.ok ? result.fieldErrors?.[k] : undefined);
  return (
    <form action={formAction} className="flex flex-col gap-2 text-sm">
      <input type="hidden" name="tacticId" value={tacticId} />
      <label className="block">
        <span className="label">전술 이름</span>
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="input py-1.5" />
        {fieldError("name") ? <span className="text-xs text-accent-hover">{fieldError("name")}</span> : null}
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">진영</span>
          <select name="side" value={side} onChange={(e) => setSide(e.target.value as TacticSide)} className="input py-1.5">
            {TACTIC_SIDE_ORDER.map((s) => (
              <option key={s} value={s}>
                {TACTIC_SIDE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">라운드</span>
          <select name="roundType" value={roundType} onChange={(e) => setRoundType(e.target.value as RoundType)} className="input py-1.5">
            {ROUND_TYPE_ORDER.map((r) => (
              <option key={r} value={r}>
                {ROUND_TYPE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">태그 (쉼표로 구분)</span>
        <input name="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="러시, 포스트플랜트" className="input py-1.5" />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" className="btn-secondary min-h-8 px-3 text-xs" disabled={pending}>
          {pending ? "저장 중…" : "정보 저장"}
        </button>
        {result && !result.ok && !result.fieldErrors ? <span className="text-xs text-accent-hover">{result.error}</span> : null}
        {result?.ok ? <span className="text-xs text-success">저장했습니다.</span> : null}
      </div>
    </form>
  );
}
