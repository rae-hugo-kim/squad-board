/**
 * 날짜 유틸. 세션 날짜는 "YYYY-MM-DD" 문자열로 다룬다 (SQLite에 날짜형이 없고, 문자열 정렬이 곧 날짜 정렬).
 * 소모임은 한국 기준이므로 "오늘"은 서버 시간대와 무관하게 Asia/Seoul로 계산한다.
 */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayInSeoul(): string {
  // sv-SE 로케일은 ISO 형식(YYYY-MM-DD)으로 날짜를 찍는다 — 포맷 라이브러리 없이 쓰는 관용구.
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

/** 형식과 실제 달력 유효성(2월 30일 등)을 함께 확인한다. */
export function isValidDateString(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 화면 표기: 2026-10-07 → "10/07 (수)" */
export function formatDateKo(s: string): string {
  if (!DATE_RE.test(s)) return s;
  const [y, m, d] = s.split("-").map(Number);
  const day = ["일", "월", "화", "수", "목", "금", "토"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")} (${day})`;
}
