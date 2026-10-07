import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit 설정. 마이그레이션 SQL은 ./drizzle 폴더에 생성된다.
 *
 * 명령:
 *   npm run db:generate  — schema.ts 변경 → SQL 마이그레이션 파일 생성
 *   npm run db:migrate   — 생성된 마이그레이션을 DB에 적용
 *   npm run db:seed      — 맵·요원 마스터 + 초기 관리자 입력
 *   npm run db:studio    — 브라우저에서 테이블 확인
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./data/squad.db",
  },
  strict: true,
  verbose: true,
});
