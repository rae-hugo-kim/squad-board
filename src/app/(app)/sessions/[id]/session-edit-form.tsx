"use client";

import { useActionState, useState } from "react";
import { updateSessionAction } from "@/server/actions/sessions";
import type { ActionResult } from "@/server/actions/auth";
import { MemberAvatar } from "@/components/result-badge";

type MemberOption = { id: string; nickname: string; color: string };

/** 세션 날짜·메모·참가자 수정. <details>로 접어 두어 기본 화면을 가볍게 유지한다. */
export function SessionEditForm({
  sessionId,
  date,
  memo,
  participantIds,
  members,
}: {
  sessionId: string;
  date: string;
  memo: string;
  participantIds: string[];
  members: MemberOption[];
}) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(updateSessionAction, null);
  const [d, setD] = useState(date);
  const [m, setM] = useState(memo);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(participantIds));
  const fieldError = (name: string) => (result && !result.ok ? result.fieldErrors?.[name] : undefined);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <details className="card p-5">
      <summary className="cursor-pointer text-sm font-medium text-secondary hover:text-primary">세션 정보 수정 (날짜 · 참가자 · 메모)</summary>
      <form action={formAction} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="sessionId" value={sessionId} />
        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <div>
            <label htmlFor="edit-date" className="label">
              날짜
            </label>
            <input id="edit-date" name="date" type="date" value={d} onChange={(e) => setD(e.target.value)} required className="input w-44 font-mono" />
            {fieldError("date") ? <p className="mt-1 text-xs text-accent-hover">{fieldError("date")}</p> : null}
          </div>
          <div>
            <label htmlFor="edit-memo" className="label">
              메모
            </label>
            <input id="edit-memo" name="memo" value={m} onChange={(e) => setM(e.target.value)} maxLength={300} className="input" />
          </div>
        </div>
        <div>
          <div className="label">
            참가자 <span className="text-muted">({selected.size}명)</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
            {members.map((mem) => {
              const on = selected.has(mem.id);
              return (
                <label
                  key={mem.id}
                  className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-sm ${
                    on ? "border-accent bg-accent-subtle" : "border-line bg-raised"
                  }`}
                >
                  <input type="checkbox" name="memberIds" value={mem.id} checked={on} onChange={() => toggle(mem.id)} className="sr-only" />
                  <MemberAvatar nickname={mem.nickname} color={mem.color} size={5} />
                  <span className="truncate">{mem.nickname}</span>
                </label>
              );
            })}
          </div>
          {fieldError("memberIds") ? <p className="mt-1 text-xs text-accent-hover">{fieldError("memberIds")}</p> : null}
          <p className="mt-1 text-xs text-muted">참가자에서 빼도 이미 기록된 경기의 멤버 행은 남습니다.</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={pending || selected.size === 0}>
            {pending ? "저장 중…" : "세션 저장"}
          </button>
          {result && !result.ok && !result.fieldErrors ? <p className="text-xs text-accent-hover">{result.error}</p> : null}
          {result?.ok ? <p className="text-xs text-success">저장했습니다.</p> : null}
        </div>
      </form>
    </details>
  );
}
