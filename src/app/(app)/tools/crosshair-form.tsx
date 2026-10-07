"use client";

import { useActionState, useState } from "react";
import { saveMyCrosshairAction } from "@/server/actions/prefs";
import type { ActionResult } from "@/server/actions/auth";

/** 내 크로스헤어 코드 저장 + 복사. 복사는 Clipboard API, 실패하면 선택 상태로 둬 수동 복사하게 한다. */
export function CrosshairForm({ initial }: { initial: string }) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(saveMyCrosshairAction, null);
  const [code, setCode] = useState(initial);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor="crosshair" className="label">
        내 크로스헤어 코드
      </label>
      <div className="flex gap-2">
        <input id="crosshair" name="crosshairCode" value={code} onChange={(e) => setCode(e.target.value)} maxLength={200} placeholder="0;P;c;5;h;0;..." className="input font-mono text-xs" />
        <CopyButton text={code} />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-secondary min-h-9 px-3 text-xs" disabled={pending}>
          {pending ? "저장 중…" : "코드 저장"}
        </button>
        {result && !result.ok ? <span className="text-xs text-accent-hover">{result.error}</span> : null}
        {result?.ok ? <span className="text-xs text-success">저장했습니다.</span> : null}
      </div>
    </form>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("ok");
    } catch {
      setState("fail");
    }
    setTimeout(() => setState("idle"), 1500);
  };
  return (
    <button type="button" onClick={copy} disabled={!text} className="btn-secondary min-h-9 shrink-0 px-3 text-xs" aria-label="크로스헤어 코드 복사">
      {state === "ok" ? "복사됨" : state === "fail" ? "복사 실패" : "복사"}
    </button>
  );
}
