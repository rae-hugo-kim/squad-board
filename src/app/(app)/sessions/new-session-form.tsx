"use client";

import { useActionState, useState } from "react";
import { createSessionAction } from "@/server/actions/sessions";
import type { ActionResult } from "@/server/actions/auth";
import { MemberAvatar } from "@/components/result-badge";

type MemberOption = { id: string; nickname: string; color: string };

/**
 * 세션 수동 생성 폼 (편성기를 거치지 않고 "오늘 모였다"만 먼저 기록할 때).
 * 체크박스는 controlled로 둔다 — React 19가 액션 뒤 폼을 리셋해도 상태가 남도록 (1단계 인수인계의 함정 참고).
 */
export function NewSessionForm({ members, defaultDate }: { members: MemberOption[]; defaultDate: string }) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(createSessionAction, null);
  const [date, setDate] = useState(defaultDate);
  const [memo, setMemo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fieldError = (name: string) => (result && !result.ok ? result.fieldErrors?.[name] : undefined);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form action={formAction} className="card flex flex-col gap-4 p-5">
      <h2 className="font-display text-2xl font-bold tracking-wide">새 세션</h2>
      <div>
        <label htmlFor="new-date" className="label">
          날짜
        </label>
        <input id="new-date" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="input font-mono" />
        {fieldError("date") ? <p className="mt-1 text-xs text-accent-hover">{fieldError("date")}</p> : null}
      </div>
      <div>
        <div className="label">
          참가자 <span className="text-muted">({selected.size}명)</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {members.map((m) => {
            const on = selected.has(m.id);
            return (
              <label
                key={m.id}
                className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-sm ${
                  on ? "border-accent bg-accent-subtle" : "border-line bg-raised"
                }`}
              >
                <input type="checkbox" name="memberIds" value={m.id} checked={on} onChange={() => toggle(m.id)} className="sr-only" />
                <MemberAvatar nickname={m.nickname} color={m.color} size={5} />
                <span className="truncate">{m.nickname}</span>
              </label>
            );
          })}
        </div>
        {fieldError("memberIds") ? <p className="mt-1 text-xs text-accent-hover">{fieldError("memberIds")}</p> : null}
      </div>
      <div>
        <label htmlFor="new-memo" className="label">
          메모
        </label>
        <input
          id="new-memo"
          name="memo"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          maxLength={300}
          placeholder="예: 신규 멤버 첫 참가"
          className="input"
        />
      </div>
      {result && !result.ok && !result.fieldErrors ? (
        <p className="rounded-sm border border-accent bg-accent-subtle px-3 py-2 text-sm">{result.error}</p>
      ) : null}
      <button type="submit" className="btn-primary" disabled={pending || selected.size === 0}>
        {pending ? "만드는 중…" : "세션 만들기"}
      </button>
    </form>
  );
}
