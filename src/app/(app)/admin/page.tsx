import type { Metadata } from "next";
import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { maps, members } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { setMemberRoleAction, toggleMapPoolAction, toggleMemberActiveAction } from "@/server/actions/admin";
import { AddMemberForm } from "./add-member-form";

export const metadata: Metadata = { title: "관리" };
export const dynamic = "force-dynamic";

/**
 * 관리 화면 — 멤버 목록(추가·역할·활성)과 맵 풀 토글.
 * 토글류는 서버 액션을 <form action>으로 직접 호출해 JS 없이도 동작한다.
 */
export default async function AdminPage() {
  const me = await requireAdmin();
  const [memberList, mapList] = await Promise.all([
    // 활성 멤버 먼저, 그다음 닉네임순
    db.select().from(members).orderBy(desc(members.isActive), asc(members.nickname)),
    db.select().from(maps).orderBy(asc(maps.sortOrder)),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <h1 className="font-display text-3xl font-bold tracking-wide">멤버 관리</h1>
          <span className="text-xs text-secondary">
            활성 {memberList.filter((m) => m.isActive).length} / 전체 {memberList.length}
          </span>
        </div>

        <div className="mb-4 max-w-md">
          <AddMemberForm />
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-base text-xs text-secondary">
              <tr>
                <th className="px-4 py-2.5 text-left font-normal">닉네임</th>
                <th className="px-3 py-2.5 text-left font-normal">역할</th>
                <th className="px-3 py-2.5 text-left font-normal">감도</th>
                <th className="px-3 py-2.5 text-left font-normal">상태</th>
                <th className="px-3 py-2.5 text-right font-normal">동작</th>
              </tr>
            </thead>
            <tbody>
              {memberList.map((m) => {
                const isMe = m.id === me.id;
                return (
                  <tr key={m.id} className={`border-t border-line ${m.isActive ? "" : "text-muted"}`}>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2 font-medium">
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-base"
                          style={{ background: m.isActive ? m.color : "var(--border)" }}
                          aria-hidden
                        >
                          {m.nickname.slice(0, 1).toUpperCase()}
                        </span>
                        {m.nickname}
                        {isMe ? <span className="text-[10px] text-accent">나</span> : null}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <form action={setMemberRoleAction} className="inline-flex items-center gap-2">
                        <input type="hidden" name="memberId" value={m.id} />
                        <select
                          name="role"
                          defaultValue={m.role}
                          className="input w-28 py-1"
                          aria-label={`${m.nickname} 역할`}
                          disabled={!m.isActive}
                        >
                          <option value="member">일반</option>
                          <option value="admin">관리자</option>
                        </select>
                        <button type="submit" className="btn-secondary min-h-9 px-3 text-xs" disabled={!m.isActive}>
                          적용
                        </button>
                      </form>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {m.dpi && m.sens ? `${m.dpi} × ${m.sens} = ${Math.round(m.dpi * m.sens * 10) / 10}` : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {m.isActive ? (
                        <span className="badge bg-success/15 text-success">활성</span>
                      ) : (
                        <span className="badge border border-line text-muted">비활성</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <form action={toggleMemberActiveAction} className="inline">
                        <input type="hidden" name="memberId" value={m.id} />
                        <button
                          type="submit"
                          className={m.isActive ? "btn-danger min-h-9 px-3 text-xs" : "btn-secondary min-h-9 px-3 text-xs"}
                          disabled={isMe}
                          title={isMe ? "자기 자신은 비활성화할 수 없습니다" : undefined}
                        >
                          {m.isActive ? "비활성화" : "다시 활성화"}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          비활성 멤버는 입장 목록에서 사라지고 선호 매트릭스에서 빠지지만, 데이터는 남아 있어 다시 활성화하면 복구됩니다.
        </p>
      </section>

      <section>
        <h2 className="mb-4 font-display text-3xl font-bold tracking-wide">맵 풀</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {mapList.map((m) => (
            <form
              key={m.id}
              action={toggleMapPoolAction}
              className={`card flex items-center justify-between p-3 ${m.inPool ? "" : "opacity-60"}`}
            >
              <input type="hidden" name="mapId" value={m.id} />
              <div>
                <div className="font-display text-lg font-bold uppercase tracking-wider">{m.nameEn}</div>
                <div className="text-xs text-secondary">
                  {m.nameKo} · 사이트 {m.sites.join("/")}
                </div>
              </div>
              <button type="submit" className={m.inPool ? "btn-secondary min-h-9 px-3 text-xs" : "btn-primary min-h-9 px-3 text-xs"}>
                {m.inPool ? "풀에서 제외" : "풀에 추가"}
              </button>
            </form>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          새 맵·요원이 나오면 <code className="font-mono">src/db/seed-data.ts</code>에 추가하고{" "}
          <code className="font-mono">npm run db:seed</code>를 다시 실행하세요.
        </p>
      </section>
    </div>
  );
}
