import { createLogger, errorMeta } from "@/lib/logger";

/**
 * 배포 시 DB 준비 — `npm run build` 앞단에서 실행된다.
 *
 * 왜 빌드 단계인가: Vercel에는 컨테이너 시작 스크립트(Docker의 docker-entrypoint.sh)가 없고, 빌드 환경에는
 * Turso 변수와 네트워크가 있다. 그래서 원격 DB(libsql://)가 설정된 빌드에서는 마이그레이션과 시드를 여기서 적용한다.
 * 둘 다 여러 번 실행해도 안전하다(마이그레이션은 적용 이력 기록, 시드는 upsert).
 *
 * 로컬(.env.local 미로드, DATABASE_URL 없음)이나 file: SQLite 빌드에서는 아무것도 하지 않는다 —
 * 로컬 DB는 `npm run db:setup`으로, Docker는 entrypoint가 맡는다.
 */
const log = createLogger("deploy");

const url = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || "";

async function main() {
  if (!url.startsWith("libsql://") && !url.startsWith("https://")) {
    log.info("remote database not configured — skipping migrate/seed at build", { scheme: url.split(":")[0] || "(none)" });
    return;
  }
  // 환경 변수 검증(getEnv)은 db 모듈을 import하는 순간이 아니라 첫 쿼리 때 일어나므로 여기서 동적으로 가져온다
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  const { db } = await import("./index");
  const { runSeed } = await import("./seed");
  await migrate(db, { migrationsFolder: "./drizzle" });
  log.info("migrations applied (build)");
  await runSeed();
  log.info("seed complete (build)");
}

main().catch((err) => {
  log.error("deploy db step failed", errorMeta(err));
  process.exit(1);
});
