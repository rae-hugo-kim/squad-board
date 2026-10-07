import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { createLogger, errorMeta } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * 배포 진단 — GET /api/health
 *
 * 왜 필요한가: Vercel 같은 환경에서는 첫 요청의 500 오류 원인(환경 변수 누락, DB 미연결, 마이그레이션 미적용)을
 * 화면만 보고는 알 수 없다. 이 엔드포인트는 "무엇이 빠졌는지"를 이름 단위로만 알려준다 — 값(비밀)은 절대 돌려주지 않는다.
 * 로그인 없이 열 수 있도록 proxy.ts의 공개 경로에 포함되어 있다.
 */
const log = createLogger("health");

/** 앱이 쓰는 테이블. 하나라도 없으면 마이그레이션(npm run db:migrate)이 안 된 상태다. */
const REQUIRED_TABLES = [
  "members",
  "maps",
  "agents",
  "member_map_preferences",
  "sessions",
  "session_participants",
  "session_matches",
  "session_match_players",
  "tactics",
  "tactic_stages",
  "tactic_objects",
  "tactic_slots",
  "session_match_tactics",
];

function envStatus() {
  const missing: string[] = [];
  if (!z.string().min(4).safeParse(process.env.SQUAD_PASSCODE).success) missing.push("SQUAD_PASSCODE (4자 이상)");
  if (!z.string().min(32).safeParse(process.env.SESSION_SECRET).success) missing.push("SESSION_SECRET (32자 이상)");
  const url = process.env.DATABASE_URL ?? "file:./data/squad.db (기본값)";
  const scheme = url.split(":")[0];
  const hints: string[] = [];
  if (scheme === "file" && process.env.VERCEL) hints.push("Vercel에서는 file: SQLite를 쓸 수 없습니다. DATABASE_URL을 Turso(libsql://)로 바꾸세요.");
  if (scheme === "libsql" && !process.env.DATABASE_AUTH_TOKEN) hints.push("libsql:// 주소에는 DATABASE_AUTH_TOKEN이 필요합니다.");
  return { missing, databaseUrlScheme: scheme, hints };
}

async function dbStatus() {
  try {
    const result = await db.run(sql`select name from sqlite_master where type = 'table'`);
    const tables = result.rows.map((r) => String(r.name));
    const missingTables = REQUIRED_TABLES.filter((t) => !tables.includes(t));
    const seeded = tables.includes("maps") ? Number((await db.run(sql`select count(*) as c from maps`)).rows[0]?.c ?? 0) > 0 : false;
    return { reachable: true, missingTables, seeded };
  } catch (err) {
    log.error("health: db unreachable", errorMeta(err));
    // 메시지는 드라이버 오류 문장(예: no such table, SQLITE_READONLY)이라 값이 새지 않는다
    return { reachable: false, missingTables: REQUIRED_TABLES, seeded: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET() {
  const env = envStatus();
  // 환경 변수가 빠졌으면 DB 연결 자체가 getEnv()에서 실패하므로 그 결과를 그대로 보여준다
  const database = await dbStatus();
  const ok = env.missing.length === 0 && database.reachable && database.missingTables.length === 0;
  const next: string[] = [];
  if (env.missing.length) next.push("배포 환경 변수에 누락 항목을 추가한 뒤 다시 배포하세요 (README '배포' 절).");
  if (!database.reachable && env.missing.length === 0) next.push("DATABASE_URL / DATABASE_AUTH_TOKEN을 확인하세요.");
  if (database.reachable && database.missingTables.length) next.push("내 PC에서 같은 DATABASE_URL로 `npm run db:migrate && npm run db:seed`를 실행하세요.");
  if (database.reachable && database.missingTables.length === 0 && !database.seeded) next.push("맵·요원 데이터가 없습니다. `npm run db:seed`를 실행하세요.");
  return NextResponse.json({ ok, env, database, next }, { status: ok ? 200 : 503 });
}
