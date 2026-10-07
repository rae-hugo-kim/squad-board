import type { MatchResult } from "@/db/schema";

export const RESULT_LABELS: Record<MatchResult, string> = { win: "승", loss: "패", draw: "무" };
/** 화면 표시 순서. schema의 MATCH_RESULTS를 값으로 import하면 drizzle이 클라이언트 번들에 들어가므로 여기서 다시 적는다. */
export const MATCH_RESULT_ORDER: MatchResult[] = ["win", "loss", "draw"];

/** 경기 결과 배지. 승=success, 패=danger, 무=secondary, 미입력=muted 점선. */
export function ResultBadge({ result }: { result: MatchResult | null }) {
  if (!result) return <span className="badge border border-dashed border-line text-muted">결과 미입력</span>;
  const cls =
    result === "win" ? "bg-success/15 text-success" : result === "loss" ? "bg-danger/15 text-danger" : "bg-raised text-secondary";
  return <span className={`badge ${cls}`}>{RESULT_LABELS[result]}</span>;
}

/** 멤버 아바타(이니셜 원). 여러 화면에서 반복되던 마크업을 한 곳으로. */
export function MemberAvatar({ nickname, color, size = 6 }: { nickname: string; color: string; size?: 5 | 6 | 7 }) {
  const dim = size === 5 ? "h-5 w-5 text-[9px]" : size === 7 ? "h-7 w-7 text-xs" : "h-6 w-6 text-[10px]";
  return (
    <span
      className={`inline-flex ${dim} shrink-0 items-center justify-center rounded-full font-bold text-base`}
      style={{ background: color }}
      aria-hidden
    >
      {nickname.slice(0, 1).toUpperCase()}
    </span>
  );
}
