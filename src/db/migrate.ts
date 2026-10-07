import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "./index";
import { createLogger, errorMeta } from "@/lib/logger";

/**
 * 마이그레이션 적용 — `npm run db:migrate`
 *
 * ./drizzle 폴더의 SQL 파일을 순서대로 적용한다. 이미 적용된 파일은 건너뛴다
 * (drizzle이 __drizzle_migrations 테이블에 이력을 기록).
 * 배포(Docker) 시에도 컨테이너 시작 전에 이 스크립트를 한 번 실행한다.
 */
const log = createLogger("migrate");

async function main() {
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    log.info("migrations applied");
    process.exit(0);
  } catch (err) {
    log.error("migration failed", errorMeta(err));
    process.exit(1);
  }
}

main();
