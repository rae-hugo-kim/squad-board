"use client";

import { useActionState, useState } from "react";
import { loginAction, type ActionResult } from "@/server/actions/auth";

type MemberOption = { id: string; nickname: string; color: string; role: "admin" | "member" };

/**
 * 입장 폼 (클라이언트 컴포넌트).
 * useActionState: 서버 액션의 반환값(에러 메시지)을 상태로 받아 화면에 표시하고,
 * pending 동안 버튼을 잠근다. 페이지 전환 없이 폼이 동작하므로 JS가 없어도 제출은 된다.
 */
export function LoginForm({ members, next }: { members: MemberOption[]; next?: string }) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(loginAction, null);
  const [selected, setSelected] = useState<string>("");

  const fieldError = (name: string) => (result && !result.ok ? result.fieldErrors?.[name] : undefined);
  const selectedMember = members.find((m) => m.id === selected);
  const isAdminSelected = selectedMember?.role === "admin";

  return (
    <form action={formAction} className="card flex flex-col gap-5 p-6">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {/*
        선택한 멤버는 hidden input 하나로 보낸다. 라디오에 name을 주면 React 19가 서버 액션
        완료 후 폼을 리셋하면서 체크가 풀려, 두 번째 제출에 memberId가 빠지는 문제가 있다.
      */}
      <input type="hidden" name="memberId" value={selected} />

      <div>
        <label htmlFor="passcode" className="label">
          {isAdminSelected ? "관리자 패스코드" : "패스코드"}
        </label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          autoComplete="current-password"
          required
          className="input font-mono"
          aria-invalid={Boolean(fieldError("passcode"))}
        />
        {fieldError("passcode") ? <p className="mt-1 text-xs text-accent-hover">{fieldError("passcode")}</p> : null}
      </div>

      <div>
        <div className="label">닉네임</div>
        {members.length === 0 ? (
          <p className="text-sm text-secondary">등록된 멤버가 없습니다. `npm run db:seed`로 관리자를 만드세요.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {members.map((m) => {
              const active = selected === m.id;
              return (
                <label
                  key={m.id}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm ${
                    active ? "border-accent bg-accent-subtle" : "border-line bg-raised hover:border-line-strong"
                  }`}
                >
                  <input
                    type="radio"
                    value={m.id}
                    checked={active}
                    onChange={() => setSelected(m.id)}
                    className="sr-only"
                    aria-label={m.nickname}
                  />
                  <span
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-base"
                    style={{ background: m.color }}
                    aria-hidden
                  >
                    {m.nickname.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate">{m.nickname}</span>
                  {m.role === "admin" ? <span className="ml-auto font-mono text-[10px] text-muted">admin</span> : null}
                </label>
              );
            })}
          </div>
        )}
        {fieldError("memberId") ? <p className="mt-1 text-xs text-accent-hover">{fieldError("memberId")}</p> : null}
      </div>

      {result && !result.ok && !result.fieldErrors ? (
        <p className="rounded-sm border border-accent bg-accent-subtle px-3 py-2 text-sm">{result.error}</p>
      ) : null}

      <button type="submit" className="btn-primary" disabled={pending || !selected}>
        {pending ? "입장 중…" : "입장"}
      </button>
      <p className="text-xs text-muted">한 번 입장하면 90일 동안 다시 묻지 않습니다.</p>
    </form>
  );
}
