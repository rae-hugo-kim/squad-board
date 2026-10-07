import type { Metadata } from "next";
import { requireMember } from "@/lib/auth";
import { cmPer360, edpi } from "@/lib/tools/sens";
import { EXTERNAL_TOOLS } from "@/lib/tools/external-links";
import { listActiveMembers } from "@/server/queries/prefs";
import { MemberAvatar } from "@/components/result-badge";
import { SensitivityForm } from "../prefs/[slug]/sensitivity-form";
import { CopyButton, CrosshairForm } from "./crosshair-form";
import { SensFinder } from "./sens-finder";

export const metadata: Metadata = { title: "유틸" };
export const dynamic = "force-dynamic";

/**
 * 유틸 (4단계, 기획서 7절): eDPI 계산·감도 찾기·크로스헤어 코드 공유·멤버 감도 비교표·외부 사이트 링크.
 */
export default async function ToolsPage() {
  const me = await requireMember();
  const memberList = await listActiveMembers();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-3xl font-bold tracking-wide">유틸</h1>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card p-5">
          <h2 className="mb-1 font-display text-2xl font-bold tracking-wide">감도 찾기</h2>
          <p className="mb-4 text-xs text-secondary">플릭·트래킹 테스트를 두 감도로 번갈아 치르고 더 나은 쪽으로 범위를 좁힙니다 (5라운드).</p>
          <SensFinder dpi={me.dpi} sens={me.sens} />
        </div>
        <div className="flex flex-col gap-4">
          <div className="card p-5">
            <h2 className="mb-3 font-display text-2xl font-bold tracking-wide">내 감도 · eDPI</h2>
            <SensitivityForm dpi={me.dpi} sens={me.sens} />
            {me.dpi && me.sens ? <p className="mt-2 font-mono text-xs text-secondary">360° 회전 {cmPer360(me.dpi, me.sens)}cm</p> : null}
          </div>
          <div className="card p-5">
            <h2 className="mb-3 font-display text-2xl font-bold tracking-wide">크로스헤어</h2>
            <CrosshairForm initial={me.crosshairCode} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-2xl font-bold tracking-wide">멤버 감도 비교</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-base text-xs text-secondary">
              <tr>
                <th className="px-4 py-2.5 text-left font-normal">멤버</th>
                <th className="px-3 py-2.5 text-left font-normal">DPI</th>
                <th className="px-3 py-2.5 text-left font-normal">감도</th>
                <th className="px-3 py-2.5 text-left font-normal">eDPI</th>
                <th className="px-3 py-2.5 text-left font-normal">360°</th>
                <th className="px-3 py-2.5 text-left font-normal">크로스헤어 코드</th>
              </tr>
            </thead>
            <tbody>
              {memberList.map((m) => (
                <tr key={m.id} className={`border-t border-line ${m.id === me.id ? "bg-accent-subtle/60" : ""}`}>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <MemberAvatar nickname={m.nickname} color={m.color} />
                      {m.nickname}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">{m.dpi ?? "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{m.sens ?? "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{m.dpi && m.sens ? edpi(m.dpi, m.sens) : "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{m.dpi && m.sens ? `${cmPer360(m.dpi, m.sens)}cm` : "—"}</td>
                  <td className="px-3 py-2.5">
                    {m.crosshairCode ? (
                      <span className="inline-flex max-w-[360px] items-center gap-2">
                        <code className="truncate font-mono text-xs text-secondary" title={m.crosshairCode}>
                          {m.crosshairCode}
                        </code>
                        <CopyButton text={m.crosshairCode} />
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-2xl font-bold tracking-wide">외부 유틸</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {EXTERNAL_TOOLS.map((t) => (
            <a key={t.name} href={t.url} target="_blank" rel="noreferrer noopener" className="card block p-4 no-underline hover:border-line-strong">
              <div className="font-display text-lg font-bold tracking-wide text-primary">{t.name} ↗</div>
              <div className="text-xs text-secondary">{t.role}</div>
            </a>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">라인업 사이트의 콘텐츠는 복제하지 않습니다. 전술 보드의 스킬 핑에 링크 필드로 연결하세요.</p>
      </section>
    </div>
  );
}
