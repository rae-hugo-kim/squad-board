"use client";

import { useActionState, useState } from "react";
import type { MatchResult } from "@/db/schema";
import { confirmMatchAction, deleteMatchAction, unconfirmMatchAction, updateMatchAction } from "@/server/actions/sessions";
import type { ActionResult } from "@/server/actions/auth";
import { AgentSelect, type AgentOption } from "@/components/agent-select";
import { MATCH_RESULT_ORDER, MemberAvatar, RESULT_LABELS, ResultBadge } from "@/components/result-badge";
import { RoleDot } from "@/components/role-dot";
import { AgentIcon } from "@/components/agent-icon";

export type MatchEditorData = {
  id: string;
  seq: number;
  mapNameKo: string;
  mapNameEn: string;
  result: MatchResult | null;
  scoreAlly: number | null;
  scoreEnemy: number | null;
  memo: string;
  isConfirmed: boolean;
  updatedAt: string;
  /** 사용한 전술 id (같은 맵의 전술 중 선택) */
  tacticIds: string[];
  /** 편성기에서 확정한 슬롯 바인딩 — 읽기 전용 표시 */
  tacticBindings: Array<{ tacticId: string; name: string; slotBindings: Record<string, string> }>;
  players: Array<{
    id: string;
    member: { id: string; nickname: string; color: string };
    agentId: string | null;
    position: string;
    kills: number | null;
    deaths: number | null;
    assists: number | null;
    memo: string;
  }>;
};

type PlayerState = { agentId: string; position: string; kills: string; deaths: string; assists: string; memo: string };

const toStr = (n: number | null) => (n == null ? "" : String(n));

/**
 * 경기 1건 편집기. 결과·스코어·메모와 멤버별 요원·포지션·K/D/A를 한 폼으로 저장한다.
 * - 모든 입력은 controlled: React 19가 액션 뒤 폼을 리셋해도 화면 값이 유지된다.
 * - 확정된 경기는 관리자가 아니면 읽기 전용. 확정/해제/삭제는 중첩 폼을 피하려고 바깥에 둔다.
 * - key는 match.id다. updatedAt을 key에 넣으면 저장 직후 리마운트되어 useActionState의 "저장했습니다"가 사라진다.
 *   저장 후 화면 값 = 방금 저장한 값이므로 상태를 다시 초기화할 필요가 없다. 확정 여부는 props에서 바로 읽는다.
 */
export type TacticOption = { id: string; name: string; side: "attack" | "defense" };

export function MatchEditor({
  match,
  agents,
  isAdmin,
  tacticOptions,
}: {
  match: MatchEditorData;
  agents: AgentOption[];
  isAdmin: boolean;
  /** 이 경기 맵의 전술 목록 */
  tacticOptions: TacticOption[];
}) {
  const readOnly = match.isConfirmed && !isAdmin;
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(updateMatchAction, null);
  const [outcome, setOutcome] = useState<string>(match.result ?? "");
  const [scoreAlly, setScoreAlly] = useState(toStr(match.scoreAlly));
  const [scoreEnemy, setScoreEnemy] = useState(toStr(match.scoreEnemy));
  const [memo, setMemo] = useState(match.memo);
  const [tacticIds, setTacticIds] = useState<Set<string>>(() => new Set(match.tacticIds));
  const [players, setPlayers] = useState<Record<string, PlayerState>>(() =>
    Object.fromEntries(
      match.players.map((p) => [
        p.id,
        { agentId: p.agentId ?? "", position: p.position, kills: toStr(p.kills), deaths: toStr(p.deaths), assists: toStr(p.assists), memo: p.memo },
      ]),
    ),
  );
  const setPlayer = (id: string, patch: Partial<PlayerState>) => setPlayers((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const taken = new Set(Object.values(players).map((p) => p.agentId).filter(Boolean));
  const agentById = new Map(agents.map((a) => [a.id, a]));

  return (
    <article className={`card p-5 ${match.isConfirmed ? "border-success/40" : ""}`}>
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs text-secondary">{match.seq}경기</span>
        <h3 className="font-display text-2xl font-bold uppercase tracking-wide">{match.mapNameEn}</h3>
        <span className="text-xs text-secondary">{match.mapNameKo}</span>
        <ResultBadge result={match.result} />
        {match.scoreAlly != null && match.scoreEnemy != null ? (
          <span className="font-mono text-sm">
            {match.scoreAlly}:{match.scoreEnemy}
          </span>
        ) : null}
        {match.isConfirmed ? <span className="badge bg-success/15 text-success">확정</span> : null}
        <div className="ml-auto flex items-center gap-2">
          {match.isConfirmed ? (
            isAdmin ? (
              <form action={unconfirmMatchAction}>
                <input type="hidden" name="matchId" value={match.id} />
                <button type="submit" className="btn-secondary min-h-9 px-3 text-xs">
                  확정 해제
                </button>
              </form>
            ) : null
          ) : (
            <form action={confirmMatchAction}>
              <input type="hidden" name="matchId" value={match.id} />
              <button
                type="submit"
                className="btn-secondary min-h-9 px-3 text-xs"
                disabled={!match.result}
                title={match.result ? "확정 후에는 관리자만 수정할 수 있습니다" : "결과를 저장한 뒤 확정할 수 있습니다"}
              >
                확정
              </button>
            </form>
          )}
          {!readOnly ? (
            <form action={deleteMatchAction}>
              <input type="hidden" name="matchId" value={match.id} />
              <button type="submit" className="btn-danger min-h-9 px-3 text-xs">
                삭제
              </button>
            </form>
          ) : null}
        </div>
      </header>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="matchId" value={match.id} />
        <fieldset disabled={readOnly || pending} className="contents">
          <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr]">
            <div>
              <div className="label">결과</div>
              <div className="flex gap-1" role="radiogroup" aria-label="결과">
                {MATCH_RESULT_ORDER.map((r) => {
                  const active = outcome === r;
                  const tone = r === "win" ? "text-success" : r === "loss" ? "text-danger" : "text-secondary";
                  return (
                    <label
                      key={r}
                      className={`flex h-10 w-12 cursor-pointer items-center justify-center rounded-sm border text-sm font-bold ${
                        active ? `border-accent bg-accent-subtle ${tone}` : "border-line text-secondary hover:text-primary"
                      }`}
                    >
                      <input type="radio" value={r} checked={active} onChange={() => setOutcome(r)} className="sr-only" aria-label={RESULT_LABELS[r]} />
                      {RESULT_LABELS[r]}
                    </label>
                  );
                })}
              </div>
              {/* 라디오에 name을 주면 React 19 리셋 시 체크가 풀리므로 hidden으로 보낸다 (1단계 로그인 폼과 같은 우회) */}
              <input type="hidden" name="result" value={outcome} />
            </div>
            <div>
              <div className="label">스코어 (아군 : 적군)</div>
              <div className="flex items-center gap-1 font-mono">
                <input
                  name="scoreAlly"
                  inputMode="numeric"
                  value={scoreAlly}
                  onChange={(e) => setScoreAlly(e.target.value)}
                  placeholder="13"
                  className="input w-16 text-center"
                  aria-label="아군 라운드"
                />
                <span className="text-secondary">:</span>
                <input
                  name="scoreEnemy"
                  inputMode="numeric"
                  value={scoreEnemy}
                  onChange={(e) => setScoreEnemy(e.target.value)}
                  placeholder="9"
                  className="input w-16 text-center"
                  aria-label="적군 라운드"
                />
              </div>
            </div>
            <div>
              <label htmlFor={`memo-${match.id}`} className="label">
                경기 메모
              </label>
              <input
                id={`memo-${match.id}`}
                name="memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                maxLength={300}
                placeholder="예: 후반 수비 B 러시에 계속 밀림"
                className="input"
              />
            </div>
          </div>

          {tacticOptions.length ? (
            <div>
              <div className="label">사용한 전술 (선택)</div>
              <div className="flex flex-wrap gap-1.5">
                {tacticOptions.map((t) => {
                  const on = tacticIds.has(t.id);
                  return (
                    <label key={t.id} className={`flex min-h-8 cursor-pointer items-center gap-1.5 rounded-sm border px-2 text-xs ${on ? "border-accent bg-accent-subtle" : "border-line text-secondary"}`}>
                      <input
                        type="checkbox"
                        name="tacticIds"
                        value={t.id}
                        checked={on}
                        onChange={() =>
                          setTacticIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(t.id)) next.delete(t.id);
                            else next.add(t.id);
                            return next;
                          })
                        }
                        className="sr-only"
                      />
                      <span className={t.side === "attack" ? "text-side-attack" : "text-side-defense"}>{t.side === "attack" ? "공" : "수"}</span>
                      {t.name}
                    </label>
                  );
                })}
              </div>
              {match.tacticBindings.some((b) => Object.keys(b.slotBindings).length) ? (
                <p className="mt-1 text-xs text-muted">
                  편성 바인딩:{" "}
                  {match.tacticBindings
                    .filter((b) => Object.keys(b.slotBindings).length)
                    .map((b) => `${b.name} (${Object.entries(b.slotBindings).map(([n, mid]) => `#${n} ${match.players.find((p) => p.member.id === mid)?.member.nickname ?? "?"}`).join(", ")})`)
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-xs text-secondary">
                <tr>
                  <th className="pb-2 text-left font-normal">멤버</th>
                  <th className="pb-2 text-left font-normal">요원</th>
                  <th className="pb-2 text-left font-normal">포지션</th>
                  <th className="pb-2 text-center font-normal">K</th>
                  <th className="pb-2 text-center font-normal">D</th>
                  <th className="pb-2 text-center font-normal">A</th>
                  <th className="pb-2 text-left font-normal">메모</th>
                </tr>
              </thead>
              <tbody>
                {match.players.map((p) => {
                  const st = players[p.id];
                  const agent = st.agentId ? agentById.get(st.agentId) : undefined;
                  const stat = (field: "kills" | "deaths" | "assists", label: string) => (
                    <input
                      name={`p_${p.id}_${field}`}
                      inputMode="numeric"
                      value={st[field]}
                      onChange={(e) => setPlayer(p.id, { [field]: e.target.value })}
                      className="input w-14 text-center font-mono"
                      aria-label={`${p.member.nickname} ${label}`}
                    />
                  );
                  return (
                    <tr key={p.id} className="border-t border-line">
                      <td className="py-2 pr-3">
                        <input type="hidden" name="playerIds" value={p.id} />
                        <span className="inline-flex items-center gap-2 font-medium">
                          <MemberAvatar nickname={p.member.nickname} color={p.member.color} size={5} />
                          {p.member.nickname}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="inline-flex items-center gap-2">
                          {agent ? agent.iconUrl ? <AgentIcon agent={agent} size={26} /> : <RoleDot role={agent.roleGroup} /> : null}
                          <AgentSelect
                            name={`p_${p.id}_agentId`}
                            value={st.agentId}
                            onChange={(v) => setPlayer(p.id, { agentId: v })}
                            agents={agents}
                            taken={taken}
                            className="input w-36 py-1"
                            ariaLabel={`${p.member.nickname} 요원`}
                          />
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          name={`p_${p.id}_position`}
                          value={st.position}
                          onChange={(e) => setPlayer(p.id, { position: e.target.value })}
                          maxLength={120}
                          className="input min-w-40 py-1 text-[13px]"
                          aria-label={`${p.member.nickname} 포지션`}
                        />
                      </td>
                      <td className="py-2 pr-1 text-center">{stat("kills", "킬")}</td>
                      <td className="py-2 pr-1 text-center">{stat("deaths", "데스")}</td>
                      <td className="py-2 pr-3 text-center">{stat("assists", "어시스트")}</td>
                      <td className="py-2">
                        <input
                          name={`p_${p.id}_memo`}
                          value={st.memo}
                          onChange={(e) => setPlayer(p.id, { memo: e.target.value })}
                          maxLength={120}
                          className="input min-w-32 py-1 text-[13px]"
                          aria-label={`${p.member.nickname} 메모`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          {!readOnly ? (
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "저장 중…" : "경기 저장"}
            </button>
          ) : (
            <p className="text-xs text-secondary">확정된 경기입니다. 수정은 관리자에게 요청하세요.</p>
          )}
          {result && !result.ok ? <p className="text-xs text-accent-hover">{result.error}</p> : null}
          {result?.ok ? <p className="text-xs text-success">저장했습니다.</p> : null}
        </div>
      </form>
    </article>
  );
}
