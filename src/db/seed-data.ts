import type { RoleGroup } from "./schema";

/**
 * 맵·요원 마스터 데이터.
 *
 * 수기 유지 방침: Riot 공식 API 연동은 하지 않으므로 신규 맵·요원이 나오면
 * 여기에 한 줄 추가하고 `npm run db:seed`를 다시 실행한다(upsert라 여러 번 실행해도 안전).
 * `inPool`은 초기값일 뿐이며 운영 중에는 관리 화면에서 토글한다.
 */

export type SeedMap = {
  slug: string;
  nameKo: string;
  nameEn: string;
  sites: string[];
  inPool: boolean;
};

export const SEED_MAPS: SeedMap[] = [
  { slug: "ascent", nameKo: "어센트", nameEn: "Ascent", sites: ["A", "B"], inPool: true },
  { slug: "bind", nameKo: "바인드", nameEn: "Bind", sites: ["A", "B"], inPool: true },
  { slug: "haven", nameKo: "헤이븐", nameEn: "Haven", sites: ["A", "B", "C"], inPool: true },
  { slug: "split", nameKo: "스플릿", nameEn: "Split", sites: ["A", "B"], inPool: true },
  { slug: "icebox", nameKo: "아이스박스", nameEn: "Icebox", sites: ["A", "B"], inPool: false },
  { slug: "breeze", nameKo: "브리즈", nameEn: "Breeze", sites: ["A", "B"], inPool: false },
  { slug: "fracture", nameKo: "프랙처", nameEn: "Fracture", sites: ["A", "B"], inPool: false },
  { slug: "pearl", nameKo: "펄", nameEn: "Pearl", sites: ["A", "B"], inPool: false },
  { slug: "lotus", nameKo: "로터스", nameEn: "Lotus", sites: ["A", "B", "C"], inPool: true },
  { slug: "sunset", nameKo: "선셋", nameEn: "Sunset", sites: ["A", "B"], inPool: true },
  { slug: "abyss", nameKo: "어비스", nameEn: "Abyss", sites: ["A", "B"], inPool: true },
  { slug: "corrode", nameKo: "코로드", nameEn: "Corrode", sites: ["A", "B"], inPool: true },
];

export type SeedAgent = {
  slug: string;
  nameKo: string;
  nameEn: string;
  roleGroup: RoleGroup;
};

export const SEED_AGENTS: SeedAgent[] = [
  { slug: "brimstone", nameKo: "브림스톤", nameEn: "Brimstone", roleGroup: "controller" },
  { slug: "phoenix", nameKo: "피닉스", nameEn: "Phoenix", roleGroup: "duelist" },
  { slug: "sage", nameKo: "세이지", nameEn: "Sage", roleGroup: "sentinel" },
  { slug: "sova", nameKo: "소바", nameEn: "Sova", roleGroup: "initiator" },
  { slug: "viper", nameKo: "바이퍼", nameEn: "Viper", roleGroup: "controller" },
  { slug: "cypher", nameKo: "사이퍼", nameEn: "Cypher", roleGroup: "sentinel" },
  { slug: "reyna", nameKo: "레이나", nameEn: "Reyna", roleGroup: "duelist" },
  { slug: "killjoy", nameKo: "킬조이", nameEn: "Killjoy", roleGroup: "sentinel" },
  { slug: "breach", nameKo: "브리치", nameEn: "Breach", roleGroup: "initiator" },
  { slug: "omen", nameKo: "오멘", nameEn: "Omen", roleGroup: "controller" },
  { slug: "jett", nameKo: "제트", nameEn: "Jett", roleGroup: "duelist" },
  { slug: "raze", nameKo: "레이즈", nameEn: "Raze", roleGroup: "duelist" },
  { slug: "skye", nameKo: "스카이", nameEn: "Skye", roleGroup: "initiator" },
  { slug: "yoru", nameKo: "요루", nameEn: "Yoru", roleGroup: "duelist" },
  { slug: "astra", nameKo: "아스트라", nameEn: "Astra", roleGroup: "controller" },
  { slug: "kayo", nameKo: "케이오", nameEn: "KAY/O", roleGroup: "initiator" },
  { slug: "chamber", nameKo: "체임버", nameEn: "Chamber", roleGroup: "sentinel" },
  { slug: "neon", nameKo: "네온", nameEn: "Neon", roleGroup: "duelist" },
  { slug: "fade", nameKo: "페이드", nameEn: "Fade", roleGroup: "initiator" },
  { slug: "harbor", nameKo: "하버", nameEn: "Harbor", roleGroup: "controller" },
  { slug: "gekko", nameKo: "게코", nameEn: "Gekko", roleGroup: "initiator" },
  { slug: "deadlock", nameKo: "데드록", nameEn: "Deadlock", roleGroup: "sentinel" },
  { slug: "iso", nameKo: "아이소", nameEn: "Iso", roleGroup: "duelist" },
  { slug: "clove", nameKo: "클로브", nameEn: "Clove", roleGroup: "controller" },
  { slug: "vyse", nameKo: "바이스", nameEn: "Vyse", roleGroup: "sentinel" },
  { slug: "tejo", nameKo: "테호", nameEn: "Tejo", roleGroup: "initiator" },
  { slug: "waylay", nameKo: "웨일레이", nameEn: "Waylay", roleGroup: "duelist" },
  { slug: "veto", nameKo: "비토", nameEn: "Veto", roleGroup: "sentinel" },
];

/** 역할군 한글 표기와 색 토큰 — 화면 공통 */
export const ROLE_LABELS: Record<RoleGroup, { ko: string; cssVar: string }> = {
  duelist: { ko: "타격대", cssVar: "var(--role-duelist)" },
  initiator: { ko: "척후대", cssVar: "var(--role-initiator)" },
  controller: { ko: "전략가", cssVar: "var(--role-controller)" },
  sentinel: { ko: "감시자", cssVar: "var(--role-sentinel)" },
};
