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
 * - 전술 보드(Tactic 등)는 3단계에서 추가. 2단계에서 세션 기록(Session 3단) 테이블을 더했다.
 */

/** 요원 역할군. 편성기 제약(전략가 1 이상 등)과 색상 토큰이 이 값을 참조한다. */
export const ROLE_GROUPS = ["duelist", "initiator", "controller", "sentinel"] as const;
export type RoleGroup = (typeof ROLE_GROUPS)[number];

export const MEMBER_ROLES = ["admin", "member"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** 경기 결과. 스코어와 별도로 두는 이유: 무승부(12:12)·몰수 등 스코어만으로 판정이 애매한 경우가 있다. */
export const MATCH_RESULTS = ["win", "loss", "draw"] as const;
export type MatchResult = (typeof MATCH_RESULTS)[number];

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
  /** 탑뷰 이미지 경로(public/ 기준). 3단계 전술 보드에서 사용. */
  imagePath: text("image_path"),
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
  /** 스킬 4종. 3단계 전술 보드 핑 종류와 연결. 1단계에서는 비워 둬도 된다. */
  abilities: text("abilities", { mode: "json" })
    .$type<Array<{ key: string; nameKo: string; kind: string }>>()
    .notNull()
    .default([]),
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

// 타입 내보내기 — 화면/액션에서 재사용
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type GameMap = typeof maps.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type MemberMapPreference = typeof memberMapPreferences.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SessionMatch = typeof sessionMatches.$inferSelect;
export type SessionMatchPlayer = typeof sessionMatchPlayers.$inferSelect;
