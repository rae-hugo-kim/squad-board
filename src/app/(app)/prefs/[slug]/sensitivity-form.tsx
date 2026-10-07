"use client";

import { useActionState, useState } from "react";
import { saveMySensitivityAction } from "@/server/actions/prefs";
import type { ActionResult } from "@/server/actions/auth";

/**
 * 감도 입력. eDPI = DPI × 감도 를 즉시 계산해 보여준다.
 * 4단계(유틸)에서 감도 찾기 도구가 이 값을 읽어 간다.
 */
export function SensitivityForm({ dpi, sens }: { dpi: number | null; sens: number | null }) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(saveMySensitivityAction, null);
  const [d, setD] = useState(dpi?.toString() ?? "");
  const [s, setS] = useState(sens?.toString() ?? "");

  const dn = Number(d);
  const sn = Number(s);
  const edpi = d && s && Number.isFinite(dn) && Number.isFinite(sn) ? Math.round(dn * sn * 10) / 10 : null;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="label">감도</div>
      <div className="grid grid-cols-3 gap-2 font-mono text-[13px]">
        <label className="rounded-md border border-line bg-raised px-3 py-2">
          <span className="block text-[10px] text-secondary">DPI</span>
          <input
            name="dpi"
            inputMode="numeric"
            value={d}
            onChange={(e) => setD(e.target.value)}
            placeholder="800"
            className="w-full bg-transparent outline-none"
            aria-label="DPI"
          />
        </label>
        <label className="rounded-md border border-line bg-raised px-3 py-2">
          <span className="block text-[10px] text-secondary">SENS</span>
          <input
            name="sens"
            inputMode="decimal"
            value={s}
            onChange={(e) => setS(e.target.value)}
            placeholder="0.32"
            className="w-full bg-transparent outline-none"
            aria-label="인게임 감도"
          />
        </label>
        <div className="rounded-md border border-accent bg-raised px-3 py-2">
          <span className="block text-[10px] text-secondary">eDPI</span>
          <span>{edpi ?? "—"}</span>
        </div>
      </div>
      {result && !result.ok ? <p className="text-xs text-accent-hover">{result.error}</p> : null}
      {result?.ok ? <p className="text-xs text-success">저장했습니다.</p> : null}
      <button type="submit" className="btn-secondary self-start" disabled={pending}>
        {pending ? "저장 중…" : "감도 저장"}
      </button>
    </form>
  );
}
