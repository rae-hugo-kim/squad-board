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
 * - 전술 보드(Tactic 등)는 3단계에서 추가. 지금은 참조 무결성을 위해 maps/agents만 둔다.
 */

/** 요원 역할군. 편성기 제약(전략가 1 이상 등)과 색상 토큰이 이 값을 참조한다. */
export const ROLE_GROUPS = ["duelist", "initiator", "controller", "sentinel"] as const;
export type RoleGroup = (typeof ROLE_GROUPS)[number];

export const MEMBER_ROLES = ["admin", "member"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

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

// 타입 내보내기 — 화면/액션에서 재사용
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type GameMap = typeof maps.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type MemberMapPreference = typeof memberMapPreferences.$inferSelect;
