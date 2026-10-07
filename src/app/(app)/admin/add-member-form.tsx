"use client";

import { useActionState, useEffect, useRef } from "react";
import { addMemberAction } from "@/server/actions/admin";
import type { ActionResult } from "@/server/actions/auth";

/** 멤버 추가 폼. 성공하면 입력칸을 비워 연속 추가가 편하도록 한다. */
export function AddMemberForm() {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(addMemberAction, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (result?.ok) ref.current?.reset();
  }, [result]);

  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input
          name="nickname"
          placeholder="새 멤버 닉네임"
          maxLength={20}
          required
          className="input"
          aria-label="새 멤버 닉네임"
        />
        <button type="submit" className="btn-primary shrink-0" disabled={pending}>
          {pending ? "추가 중…" : "추가"}
        </button>
      </div>
      {result && !result.ok ? <p className="text-xs text-accent-hover">{result.error}</p> : null}
    </form>
  );
}
