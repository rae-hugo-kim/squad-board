import type { Ability, RoleGroup } from "./schema";

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

/**
 * 맵 탑뷰 이미지 경로 규칙. public/maps/<slug>.svg 는 사이트 위치만 표시한 자리표시자다 —
 * 공식 미니맵은 `npm run assets:sync`(배포 빌드 자동)가 maps.image_path를 공식 에셋 URL로 덮어쓴다. 보드는 이미지를 1:1 정사각형으로 깔고
 * 좌표를 0~1로 저장하므로 해상도가 달라도 전술이 그대로 맞는다.
 */
export const mapImagePath = (slug: string) => `/maps/${slug}.svg`;

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

/**
 * 전술가 티어로 둘 닉네임. 시드가 돌 때마다(배포 빌드 포함) 이 닉네임의 멤버가
 * - 없으면 전술가로 새로 만들고,
 * - 일반(member)이면 전술가로 올린다. 관리자는 건드리지 않고, 관리 화면에서 내린 뒤에도 다음 배포에서 다시 올라오니
 *   영구히 내리려면 이 목록에서도 빼야 한다.
 */
export const SEED_TACTICIAN_NICKNAMES = ["알파카", "벵거", "오르페브르"] as const;

export type SeedAgent = {
  slug: string;
  nameKo: string;
  nameEn: string;
  roleGroup: RoleGroup;
  /** 스킬 4종(C·Q·E·X). 모르면 비워 두고 나중에 채운다 — 보드의 스킬 핑은 비어 있어도 동작한다. */
  abilities?: Ability[];
};

const ab = (key: string, nameKo: string, kind: Ability["kind"]): Ability => ({ key, nameKo, kind });

export const SEED_AGENTS: SeedAgent[] = [
  { slug: "brimstone", nameKo: "브림스톤", nameEn: "Brimstone", roleGroup: "controller", abilities: [ab("c", "자극제 비컨", "move"), ab("q", "소이탄", "molly"), ab("e", "하늘 연막", "smoke"), ab("x", "궤도 공습", "ult")] },
  { slug: "phoenix", nameKo: "피닉스", nameEn: "Phoenix", roleGroup: "duelist", abilities: [ab("c", "업화", "molly"), ab("q", "곡선 섬광", "flash"), ab("e", "열기", "smoke"), ab("x", "역행", "ult")] },
  { slug: "sage", nameKo: "세이지", nameEn: "Sage", roleGroup: "sentinel", abilities: [ab("c", "방벽 구슬", "trap"), ab("q", "감속 구슬", "trap"), ab("e", "치유 구슬", "heal"), ab("x", "부활", "ult")] },
  { slug: "sova", nameKo: "소바", nameEn: "Sova", roleGroup: "initiator", abilities: [ab("c", "올빼미 드론", "recon"), ab("q", "충격 화살", "molly"), ab("e", "정찰 화살", "recon"), ab("x", "사냥꾼의 분노", "ult")] },
  { slug: "viper", nameKo: "바이퍼", nameEn: "Viper", roleGroup: "controller", abilities: [ab("c", "독사의 송곳니", "molly"), ab("q", "독구름", "smoke"), ab("e", "독성 장막", "smoke"), ab("x", "독사의 소굴", "ult")] },
  { slug: "cypher", nameKo: "사이퍼", nameEn: "Cypher", roleGroup: "sentinel", abilities: [ab("c", "덫 철선", "trap"), ab("q", "사이버 감옥", "smoke"), ab("e", "감시 카메라", "recon"), ab("x", "신경 도둑", "ult")] },
  { slug: "reyna", nameKo: "레이나", nameEn: "Reyna", roleGroup: "duelist", abilities: [ab("c", "안광", "flash"), ab("q", "탐식", "heal"), ab("e", "무시", "move"), ab("x", "여제", "ult")] },
  { slug: "killjoy", nameKo: "킬조이", nameEn: "Killjoy", roleGroup: "sentinel", abilities: [ab("c", "나노 스웜", "molly"), ab("q", "알람봇", "trap"), ab("e", "포탑", "trap"), ab("x", "봉쇄", "ult")] },
  { slug: "breach", nameKo: "브리치", nameEn: "Breach", roleGroup: "initiator", abilities: [ab("c", "여진", "molly"), ab("q", "섬광 폭발", "flash"), ab("e", "단층선", "flash"), ab("x", "회전 충격파", "ult")] },
  { slug: "omen", nameKo: "오멘", nameEn: "Omen", roleGroup: "controller", abilities: [ab("c", "허상의 걸음", "move"), ab("q", "편집증", "flash"), ab("e", "어둠의 장막", "smoke"), ab("x", "어둠 속에서", "ult")] },
  { slug: "jett", nameKo: "제트", nameEn: "Jett", roleGroup: "duelist", abilities: [ab("c", "구름 폭발", "smoke"), ab("q", "상승 기류", "move"), ab("e", "순풍", "move"), ab("x", "칼날 폭풍", "ult")] },
  { slug: "raze", nameKo: "레이즈", nameEn: "Raze", roleGroup: "duelist", abilities: [ab("c", "붐 봇", "recon"), ab("q", "폭파 꾸러미", "move"), ab("e", "페인트탄", "molly"), ab("x", "쇼스토퍼", "ult")] },
  { slug: "skye", nameKo: "스카이", nameEn: "Skye", roleGroup: "initiator", abilities: [ab("c", "재생의 빛", "heal"), ab("q", "길잡이 빛", "flash"), ab("e", "추적의 빛", "recon"), ab("x", "수색자", "ult")] },
  { slug: "yoru", nameKo: "요루", nameEn: "Yoru", roleGroup: "duelist", abilities: [ab("c", "속임수", "recon"), ab("q", "차원 균열", "flash"), ab("e", "차원 이동", "move"), ab("x", "차원 표류", "ult")] },
  { slug: "astra", nameKo: "아스트라", nameEn: "Astra", roleGroup: "controller", abilities: [ab("c", "중력 우물", "trap"), ab("q", "신성 폭발", "flash"), ab("e", "성운", "smoke"), ab("x", "우주 분열", "ult")] },
  { slug: "kayo", nameKo: "케이오", nameEn: "KAY/O", roleGroup: "initiator", abilities: [ab("c", "파편/탄", "molly"), ab("q", "섬광/탄", "flash"), ab("e", "제로/포인트", "recon"), ab("x", "널/명령", "ult")] },
  { slug: "chamber", nameKo: "체임버", nameEn: "Chamber", roleGroup: "sentinel", abilities: [ab("c", "트레이드마크", "trap"), ab("q", "헤드헌터", "move"), ab("e", "랑데부", "move"), ab("x", "투르 드 포스", "ult")] },
  { slug: "neon", nameKo: "네온", nameEn: "Neon", roleGroup: "duelist", abilities: [ab("c", "속박 볼트", "flash"), ab("q", "중계 볼트", "flash"), ab("e", "고속 기어", "move"), ab("x", "과부하", "ult")] },
  { slug: "fade", nameKo: "페이드", nameEn: "Fade", roleGroup: "initiator", abilities: [ab("c", "사냥", "recon"), ab("q", "추적자", "recon"), ab("e", "괴롭힘", "molly"), ab("x", "야행성", "ult")] },
  { slug: "harbor", nameKo: "하버", nameEn: "Harbor", roleGroup: "controller", abilities: [ab("c", "계단식 폭포", "smoke"), ab("q", "소용돌이", "smoke"), ab("e", "높은 파도", "smoke"), ab("x", "심판", "ult")] },
  { slug: "gekko", nameKo: "게코", nameEn: "Gekko", roleGroup: "initiator", abilities: [ab("c", "모시", "molly"), ab("q", "위걸", "flash"), ab("e", "디지", "recon"), ab("x", "쓰레쉬", "ult")] },
  { slug: "deadlock", nameKo: "데드록", nameEn: "Deadlock", roleGroup: "sentinel", abilities: [ab("c", "중력망", "trap"), ab("q", "음파 감지기", "trap"), ab("e", "차단 장벽", "trap"), ab("x", "전멸", "ult")] },
  { slug: "iso", nameKo: "아이소", nameEn: "Iso", roleGroup: "duelist", abilities: [ab("c", "윤곽선", "flash"), ab("q", "사망 선고", "move"), ab("e", "쌍둥이 공격", "move"), ab("x", "일대일 결투", "ult")] },
  { slug: "clove", nameKo: "클로브", nameEn: "Clove", roleGroup: "controller", abilities: [ab("c", "해로운 안개", "molly"), ab("q", "안개 폭풍", "smoke"), ab("e", "명상", "heal"), ab("x", "회복", "ult")] },
  { slug: "vyse", nameKo: "바이스", nameEn: "Vyse", roleGroup: "sentinel", abilities: [ab("c", "가시 돋친 덩굴", "trap"), ab("q", "얽힘", "trap"), ab("e", "갈라진 틈", "trap"), ab("x", "가시 정원", "ult")] },
  { slug: "tejo", nameKo: "테호", nameEn: "Tejo", roleGroup: "initiator", abilities: [ab("c", "특별 배송", "flash"), ab("q", "유도 미사일", "molly"), ab("e", "은신 드론", "recon"), ab("x", "아마겟돈", "ult")] },
  { slug: "waylay", nameKo: "웨일레이", nameEn: "Waylay", roleGroup: "duelist", abilities: [ab("c", "포화", "trap"), ab("q", "광속", "move"), ab("e", "굴절", "move"), ab("x", "수렴 경로", "ult")] },
  // Veto의 스킬 명칭은 확인되지 않아 비워 둔다 — 알게 되면 ab(...) 4개를 채운다.
  { slug: "veto", nameKo: "비토", nameEn: "Veto", roleGroup: "sentinel" },
];

/** 스킬 유형 한글 표기 — 보드 팔레트와 속성 패널에서 사용 */
export const ABILITY_KIND_LABELS: Record<Ability["kind"], string> = {
  smoke: "연막",
  flash: "섬광",
  trap: "설치형",
  molly: "몰리",
  recon: "정보",
  move: "이동",
  heal: "치유",
  ult: "궁극기",
  other: "기타",
};

/** 역할군 한글 표기와 색 토큰 — 화면 공통 */
export const ROLE_LABELS: Record<RoleGroup, { ko: string; cssVar: string }> = {
  duelist: { ko: "타격대", cssVar: "var(--role-duelist)" },
  initiator: { ko: "척후대", cssVar: "var(--role-initiator)" },
  controller: { ko: "전략가", cssVar: "var(--role-controller)" },
  sentinel: { ko: "감시자", cssVar: "var(--role-sentinel)" },
};
