/**
 * 외부 유틸 연결 (기획서 7절). 기능을 복제하지 않고 링크만 건다 — 라인업 사이트의 본체는 영상 콘텐츠이고
 * 저작권·약관 문제가 있기 때문. URL 패턴이 바뀔 수 있어 맵별 딥링크 대신 홈을 연다.
 */
export const EXTERNAL_TOOLS: Array<{ name: string; url: string; role: string }> = [
  { name: "Easy Lineup", url: "https://easylineup.gg/", role: "스킬 라인업 영상·스크린샷 모음" },
  { name: "Valoline", url: "https://valoline.gg/", role: "라인업 모음" },
  { name: "Valoplant", url: "https://valoplant.gg/", role: "전술 보드 (이 사이트의 보드가 대체, 기존 전술은 링크 첨부)" },
];
