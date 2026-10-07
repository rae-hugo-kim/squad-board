import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * DB 스키마 — 기획서 "데이터 모델" 섹션의 1단계 범위(A+B).
 *
 * 설계 원칙
 * - id는 모두 text(UUID). 자동 증가 정수보다 URL에 노출해도 추측이 어렵고,
 *   나중에 DB를 옮겨도 충돌이 없다.
 * - 날짜는 ISO 8601 문자열로 저장(SQLite에 날짜형이 없음). 정렬·비교가 문자열로 가능하다.
 * - 열거형(enum)은 text + TypeScript 유니온 타입으로 제한한다. SQLite는 enum이 없고,
 *   zod 검증(서버 액션)에서 값을 한 번 더 걸러낸다.
 * - 2단계에서 세션 기록(Session 3단), 3단계에서 전술 보드(Tactic 4종 + 경기-전술 연결)를 더했다.
 */

/** 요원 역할군. 편성기 제약(전략가 1 이상 등)과 색상 토큰이 이 값을 참조한다. */
export const ROLE_GROUPS = ["duelist", "initiator", "controller", "sentinel"] as const;
export type RoleGroup = (typeof ROLE_GROUPS)[number];

/**
 * 멤버 티어. admin(관리) > tactician(전술가) > member(일반).
 * 전술가는 맵별 "공통 전술"(tactics.isShared)을 만들고 다른 전술가의 공통 전술도 고칠 수 있다.
 * 관리자 전용 기능(멤버·맵 풀·확정 경기 수정)은 그대로 admin만.
 */
export const MEMBER_ROLES = ["admin", "tactician", "member"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** 경기 결과. 스코어와 별도로 두는 이유: 무승부(12:12)·몰수 등 스코어만으로 판정이 애매한 경우가 있다. */
export const MATCH_RESULTS = ["win", "loss", "draw"] as const;
export type MatchResult = (typeof MATCH_RESULTS)[number];

/** 전술 진영과 라운드 유형 (기획서 3절 Tactic). 화면용 목록은 src/lib/tactics/types.ts에 다시 적는다(클라이언트 번들 분리). */
export const TACTIC_SIDES = ["attack", "defense"] as const;
export type TacticSide = (typeof TACTIC_SIDES)[number];
export const ROUND_TYPES = ["pistol", "eco", "fullbuy", "any"] as const;
export type RoundType = (typeof ROUND_TYPES)[number];

/** 스킬 유형 (기획서 3절 Agent: 연막/섬광/설치형/몰리/정보/이동/치유/궁극기) */
export const ABILITY_KINDS = ["smoke", "flash", "trap", "molly", "recon", "move", "heal", "ult", "other"] as const;
export type AbilityKind = (typeof ABILITY_KINDS)[number];
/** key: c/q/e/x. iconUrl은 공식 에셋 동기화(assets:sync)가 채운다 — 없으면 아이콘 없이 글자로 표시. */
export type Ability = { key: string; nameKo: string; kind: AbilityKind; iconUrl?: string | null; description?: string | null };

/** 맵 콜아웃 (공식 데이터). 좌표는 미니맵 기준 0~1 — 보드 객체 좌표계와 같다. */
export type MapCallout = { name: string; region: string; x: number; y: number };

/** 보드 객체 종류 (기획서 4절 표). 점 객체와 경로 객체가 섞여 있어 좌표는 x/y 또는 points로 나뉜다. */
export const TACTIC_OBJECT_KINDS = [
  "agent",
  "smoke",
  "flash",
  "trap",
  "molly",
  "recon",
  "cast",
  "objective",
  "danger",
  "note",
  "timing",
  "path_ally",
  "path_enemy_expected",
  "path_enemy_actual",
] as const;
export type TacticObjectKind = (typeof TACTIC_OBJECT_KINDS)[number];
export type Point = { x: number; y: number };

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

// ---------------------------------------------------------------------------
// Member — 닉네임으로 식별되는 참가자
// ---------------------------------------------------------------------------
export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    /** 고유 닉네임. 로그인 시 선택하는 값. */
    nickname: text("nickname").notNull(),
    /** 아바타/토큰 색. 역할군 색 또는 임의 hex. */
    color: text("color").notNull().default("#7b8cff"),
    role: text("role").$type<MemberRole>().notNull().default("member"),
    /** 선호 역할군 순위. JSON 배열, 예: ["controller","sentinel"] */
    rolePreference: text("role_preference", { mode: "json" }).$type<RoleGroup[]>().notNull().default([]),
    memo: text("memo").notNull().default(""),
    /** 감도. eDPI = dpi * sens. 둘 다 없을 수 있다. */
    dpi: integer("dpi"),
    sens: real("sens"),
    /** 크로스헤어 코드 (4단계 유틸). 공유용 문자열이라 형식 검증 없이 저장한다. */
    crosshairCode: text("crosshair_code").notNull().default(""),
    /** 탈퇴/휴면 멤버는 삭제하지 않고 비활성화 — 과거 세션 기록이 참조하기 때문. */
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [uniqueIndex("members_nickname_uq").on(t.nickname)],
);

// ---------------------------------------------------------------------------
// Map — 발로란트 맵 마스터
// ---------------------------------------------------------------------------
export const maps = sqliteTable("maps", {
  id: text("id").primaryKey(),
  /** URL용 짧은 영문 키. 예: ascent */
  slug: text("slug").notNull().unique(),
  nameKo: text("name_ko").notNull(),
  nameEn: text("name_en").notNull(),
  /** 사이트 목록. 대부분 ["A","B"], 헤이븐·로터스는 ["A","B","C"] */
  sites: text("sites", { mode: "json" }).$type<string[]>().notNull().default(["A", "B"]),
  /** 현재 경쟁전 맵 풀 포함 여부. 관리자가 로테이션마다 토글. */
  inPool: integer("in_pool", { mode: "boolean" }).notNull().default(true),
  /** 탑뷰(미니맵) 이미지. public/ 경로(자리표시자) 또는 공식 에셋 URL(assets:sync가 채움). */
  imagePath: text("image_path"),
  /** 공식 스플래시·목록용 이미지 URL (assets:sync). 목록·헤더 장식용. */
  splashUrl: text("splash_url"),
  listIconUrl: text("list_icon_url"),
  /** 공식 콜아웃 목록 (assets:sync). 보드에서 라벨 켜기/끄기. */
  callouts: text("callouts", { mode: "json" }).$type<MapCallout[]>().notNull().default([]),
  /**
   * 보드 한 변(미니맵 전체 폭)이 게임 세계 좌표로 몇 유닛인지 (1m = 100유닛). 공식 데이터의 xMultiplier 역수로
   * assets:sync가 채운다. 스킬 범위(연막 4.1m 등)를 맵마다 같은 실제 크기로 그리기 위한 값. 없으면 기본값 사용.
   */
  unitsPerBoard: real("units_per_board"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Agent — 요원 마스터
// ---------------------------------------------------------------------------
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  nameKo: text("name_ko").notNull(),
  nameEn: text("name_en").notNull(),
  roleGroup: text("role_group").$type<RoleGroup>().notNull(),
  /** 공식 요원 아이콘·초상 URL (assets:sync). 없으면 역할군 색 원에 이니셜. */
  iconUrl: text("icon_url"),
  portraitUrl: text("portrait_url"),
  /** 스킬 4종. 전술 보드의 스킬 핑(연막·섬광 등)이 "누구의 어떤 스킬인지"를 여기서 고른다. */
  abilities: text("abilities", { mode: "json" }).$type<Ability[]>().notNull().default([]),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ---------------------------------------------------------------------------
// MemberMapPreference — 멤버 × 맵 선호 (편성기의 핵심 입력)
// ---------------------------------------------------------------------------
export const memberMapPreferences = sqliteTable(
  "member_map_preferences",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    mapId: text("map_id")
      .notNull()
      .references(() => maps.id, { onDelete: "cascade" }),
    /** 선호 요원 1~3순위. 2·3순위는 비어 있을 수 있다. */
    agent1Id: text("agent1_id").references(() => agents.id, { onDelete: "set null" }),
    agent2Id: text("agent2_id").references(() => agents.id, { onDelete: "set null" }),
    agent3Id: text("agent3_id").references(() => agents.id, { onDelete: "set null" }),
    attackPosition: text("attack_position").notNull().default(""),
    defensePosition: text("defense_position").notNull().default(""),
    /** 1~5. 편성 점수에 0~2점으로 환산. */
    confidence: integer("confidence").notNull().default(3),
    memo: text("memo").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [
    // 한 멤버는 한 맵에 선호 한 건만. upsert의 기준.
    uniqueIndex("mmp_member_map_uq").on(t.memberId, t.mapId),
    index("mmp_map_idx").on(t.mapId),
  ],
);

// ---------------------------------------------------------------------------
// Session — 하루치 모임. "날짜 → 경기 → 멤버" 3단 기록의 최상위 (2단계, 기획서 6절)
// ---------------------------------------------------------------------------
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    /** 모임 날짜. YYYY-MM-DD. 하루에 여러 경기가 들어가므로 세션은 날짜 단위다. */
    date: text("date").notNull(),
    memo: text("memo").notNull().default(""),
    /** 세션을 만든 멤버. 삭제된 멤버는 없으므로(비활성화만) 항상 조회 가능하다. */
    createdBy: text("created_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("sessions_date_idx").on(t.date)],
);

// ---------------------------------------------------------------------------
// SessionParticipant — 그날 참가한 멤버 (벤치 포함). 경기별 출전은 session_match_players가 따로 든다.
// ---------------------------------------------------------------------------
export const sessionParticipants = sqliteTable(
  "session_participants",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("sp_session_member_uq").on(t.sessionId, t.memberId), index("sp_member_idx").on(t.memberId)],
);

// ---------------------------------------------------------------------------
// SessionMatch — 한 경기. 맵·결과·스코어는 수기 입력, 확정 후에는 관리자만 수정.
// ---------------------------------------------------------------------------
export const sessionMatches = sqliteTable(
  "session_matches",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    /** 세션 안에서의 순서 (1부터). 삭제 시 번호를 당기지 않는다 — 기록은 "몇 번째 경기"로 회자되기 때문. */
    seq: integer("seq").notNull(),
    /** 맵 삭제는 없지만, 혹시 모를 마스터 정리에 기록이 같이 지워지면 안 되므로 restrict. */
    mapId: text("map_id")
      .notNull()
      .references(() => maps.id, { onDelete: "restrict" }),
    /** 결과. 편성기에서 미리 만든 경기는 아직 결과가 없으므로 null 허용 (통계는 결과 있는 경기만 센다). */
    result: text("result").$type<MatchResult>(),
    /** 아군:적군 라운드 수. 예: 13:9 → scoreAlly 13, scoreEnemy 9. 모르면 null. */
    scoreAlly: integer("score_ally"),
    scoreEnemy: integer("score_enemy"),
    memo: text("memo").notNull().default(""),
    /** 스냅샷 확정. true면 관리자만 수정·해제할 수 있다. */
    isConfirmed: integer("is_confirmed", { mode: "boolean" }).notNull().default(false),
    confirmedAt: text("confirmed_at"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("sm_session_idx").on(t.sessionId), index("sm_map_idx").on(t.mapId)],
);

// ---------------------------------------------------------------------------
// SessionMatchPlayer — 경기 × 멤버 스냅샷. 요원·포지션은 편성 결과를 복사해 두고,
// 이후 선호가 바뀌어도 과거 기록은 변하지 않는다 (기획서 6절 "스냅샷" 원칙).
// ---------------------------------------------------------------------------
export const sessionMatchPlayers = sqliteTable(
  "session_match_players",
  {
    id: text("id").primaryKey(),
    matchId: text("match_id")
      .notNull()
      .references(() => sessionMatches.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    /** 사용 요원. 아직 안 정했으면 null. 요원 마스터가 비활성화되어도 기록은 남는다(set null은 삭제 시에만). */
    agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
    position: text("position").notNull().default(""),
    /** 킬·데스·어시스트. 선택 입력이라 null 허용. */
    kills: integer("kills"),
    deaths: integer("deaths"),
    assists: integer("assists"),
    memo: text("memo").notNull().default(""),
  },
  (t) => [uniqueIndex("smp_match_member_uq").on(t.matchId, t.memberId), index("smp_member_idx").on(t.memberId)],
);

// ---------------------------------------------------------------------------
// Tactic — 맵별 전술 1건 = 레이어 1장 (3단계, 기획서 3·4절). 작성자·관리자만 수정·삭제.
// ---------------------------------------------------------------------------
export const tactics = sqliteTable(
  "tactics",
  {
    id: text("id").primaryKey(),
    mapId: text("map_id")
      .notNull()
      .references(() => maps.id, { onDelete: "restrict" }),
    side: text("side").$type<TacticSide>().notNull(),
    roundType: text("round_type").$type<RoundType>().notNull().default("any"),
    name: text("name").notNull(),
    /** 자유 태그. 예: ["러시","포스트플랜트"] */
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
    /** 작성자. 멤버 삭제는 없지만(비활성화만) 혹시 모를 정리 때 전술은 남긴다. */
    authorId: text("author_id").references(() => members.id, { onDelete: "set null" }),
    /** 겹쳐보기 색조 1~8 (--layer-N). 생성 시 자동 배정. */
    layerHue: integer("layer_hue").notNull().default(1),
    /**
     * 공통 전술 여부. 전술가·관리자만 만들 수 있고, 모든 전술가가 함께 고친다(개인 전술은 작성자만).
     * 랜딩의 "오늘의 스쿼드"는 공통 전술만 후보로 삼는다.
     */
    isShared: integer("is_shared", { mode: "boolean" }).notNull().default(false),
    /**
     * 추천 조합 우선도. 1이 가장 높고 0은 "미지정"(가장 뒤). 오늘 참가자로 실행 가능한 공통 전술 중
     * 우선도가 가장 높은 것을 고른다 — 실행 불가면 우선도와 상관없이 건너뛴다(포기).
     */
    priority: integer("priority").notNull().default(0),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("tactics_map_idx").on(t.mapId)],
);

// ---------------------------------------------------------------------------
// TacticStage — 한 전술 안의 스냅샷 여러 장 (셋업 / 실행 / 플랜트 후)
// ---------------------------------------------------------------------------
export const tacticStages = sqliteTable(
  "tactic_stages",
  {
    id: text("id").primaryKey(),
    tacticId: text("tactic_id")
      .notNull()
      .references(() => tactics.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    name: text("name").notNull().default(""),
    memo: text("memo").notNull().default(""),
  },
  (t) => [index("ts_tactic_idx").on(t.tacticId)],
);

// ---------------------------------------------------------------------------
// TacticObject — 단계 위의 핑·토큰·경로. 좌표는 맵 기준 0~1 정규화 (해상도 독립).
// ---------------------------------------------------------------------------
export const tacticObjects = sqliteTable(
  "tactic_objects",
  {
    id: text("id").primaryKey(),
    stageId: text("stage_id")
      .notNull()
      .references(() => tacticStages.id, { onDelete: "cascade" }),
    kind: text("kind").$type<TacticObjectKind>().notNull(),
    /** 점 객체의 중심. 경로 객체는 points를 쓰고 x/y는 첫 점을 복사해 둔다(정렬·검색용). */
    x: real("x").notNull().default(0),
    y: real("y").notNull().default(0),
    /** 경로 점 목록(0~1). 점 객체는 빈 배열. */
    points: text("points", { mode: "json" }).$type<Point[]>().notNull().default([]),
    /** 반경(연막·몰리, 맵 폭 대비 비율)과 부채꼴 각도(정보 스킬, 도) */
    radius: real("radius"),
    angle: real("angle"),
    /** 회전(도). 토큰 방향·부채꼴 방향 */
    rotation: real("rotation").notNull().default(0),
    /** 색 덮어쓰기(hex). null이면 종류별 기본 토큰 색 */
    color: text("color"),
    label: text("label").notNull().default(""),
    memo: text("memo").notNull().default(""),
    /** 요원 토큰·경로가 어느 슬롯 것인지 (1~5) */
    slotNo: integer("slot_no"),
    /** 진영 덮어쓰기: 요원 토큰이 적군일 때 "enemy" */
    team: text("team").$type<"ally" | "enemy">(),
    /** 스킬 핑: 시전 요원과 스킬 키 */
    casterAgentId: text("caster_agent_id").references(() => agents.id, { onDelete: "set null" }),
    abilityKey: text("ability_key"),
    /** 스킬 시전 위치(cast) ↔ 떨어지는 핑을 잇는 연결 */
    linkedObjectId: text("linked_object_id"),
    /** 외부 라인업 링크 (Lineups Valorant 등) */
    externalUrl: text("external_url"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("to_stage_idx").on(t.stageId)],
);

// ---------------------------------------------------------------------------
// TacticSlot — 전술의 역할 슬롯 1~5. 편성기가 여기에 멤버를 바인딩한다 (기획서 3절 핵심 원칙).
// ---------------------------------------------------------------------------
export const tacticSlots = sqliteTable(
  "tactic_slots",
  {
    id: text("id").primaryKey(),
    tacticId: text("tactic_id")
      .notNull()
      .references(() => tactics.id, { onDelete: "cascade" }),
    slotNo: integer("slot_no").notNull(),
    /** 요구 역할군 또는 특정 요원. 둘 다 null이면 "아무나". */
    roleGroup: text("role_group").$type<RoleGroup>(),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
    /** 역할 설명. 예: "A 메인 연막 담당" */
    description: text("description").notNull().default(""),
    /** 선호 포지션 매칭용 힌트. 멤버 선호 포지션 문구에 이 단어가 들어 있으면 +1. 예: "A 메인" */
    positionHint: text("position_hint").notNull().default(""),
    /** 특정 멤버 고정(선택). 기본은 슬롯 기반. */
    fixedMemberId: text("fixed_member_id").references(() => members.id, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("tslot_tactic_no_uq").on(t.tacticId, t.slotNo)],
);

// ---------------------------------------------------------------------------
// SessionMatchTactic — 경기에서 사용한 전술 + 슬롯 바인딩 스냅샷 {슬롯번호: 멤버id}
// ---------------------------------------------------------------------------
export const sessionMatchTactics = sqliteTable(
  "session_match_tactics",
  {
    matchId: text("match_id")
      .notNull()
      .references(() => sessionMatches.id, { onDelete: "cascade" }),
    tacticId: text("tactic_id")
      .notNull()
      .references(() => tactics.id, { onDelete: "cascade" }),
    slotBindings: text("slot_bindings", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
  },
  (t) => [uniqueIndex("smt_match_tactic_uq").on(t.matchId, t.tacticId), index("smt_tactic_idx").on(t.tacticId)],
);

// 타입 내보내기 — 화면/액션에서 재사용
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type GameMap = typeof maps.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type MemberMapPreference = typeof memberMapPreferences.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SessionMatch = typeof sessionMatches.$inferSelect;
export type SessionMatchPlayer = typeof sessionMatchPlayers.$inferSelect;
export type Tactic = typeof tactics.$inferSelect;
export type TacticStage = typeof tacticStages.$inferSelect;
export type TacticObject = typeof tacticObjects.$inferSelect;
export type TacticSlot = typeof tacticSlots.$inferSelect;
