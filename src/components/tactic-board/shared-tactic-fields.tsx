"use client";

/**
 * 공통 전술 체크 + 우선도 입력 (전술가·관리자 전용). 새 전술 폼과 전술 정보 폼이 같이 쓴다.
 * 체크를 끄면 우선도 입력은 숨기고 서버는 0으로 저장한다 — 개인 전술에는 우선도가 의미가 없기 때문.
 */
export function SharedTacticFields({
  isShared,
  onShared,
  priority,
  onPriority,
  error,
  compact,
}: {
  isShared: boolean;
  onShared: (v: boolean) => void;
  priority: string;
  onPriority: (v: string) => void;
  error?: string;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-md border border-line bg-base ${compact ? "p-2" : "p-3"} text-sm`}>
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" name="isShared" checked={isShared} onChange={(e) => onShared(e.target.checked)} className="accent-[var(--accent)]" />
        <span className="font-medium">공통 전술</span>
        <span className="text-xs text-secondary">전술가 모두가 고칠 수 있고, 오늘의 스쿼드가 자동으로 고릅니다</span>
      </label>
      {isShared ? (
        <label className="mt-2 block">
          <span className="label">
            추천 우선도 <span className="text-muted">(1이 가장 먼저 · 비우면 미지정)</span>
          </span>
          <input name="priority" type="number" min={1} max={20} value={priority} onChange={(e) => onPriority(e.target.value)} placeholder="예: 1" className="input w-28 py-1.5 font-mono" />
          {error ? <span className="ml-2 text-xs text-accent-hover">{error}</span> : null}
        </label>
      ) : (
        <input type="hidden" name="priority" value="" />
      )}
    </div>
  );
}
