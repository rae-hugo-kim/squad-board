import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

/**
 * DB 클라이언트 싱글턴 — 지연 초기화.
 *
 * 왜 지연 초기화인가: Next.js는 `next build`의 "Collecting page data" 단계에서 페이지 모듈을 평가한다.
 * 그때 DB 연결을 만들면 getEnv()가 SQUAD_PASSCODE·SESSION_SECRET를 요구해, 비밀값이 없는 빌드 환경
 * (Vercel 등)에서 빌드가 깨진다(2026-10-07 Vercel 배포에서 실측). 연결은 첫 쿼리 시점(요청 처리 중)에 만든다.
 *
 * 왜 싱글턴인가: Next.js 개발 서버는 파일을 바꿀 때마다 모듈을 다시 평가한다.
 * 그때마다 새 연결을 만들면 연결이 누수된다. globalThis에 보관해서 재사용한다.
 *
 * 왜 libsql인가: 로컬에서는 `file:` URL로 SQLite 파일을 쓰고, Vercel 배포 시 Turso(`libsql://`)로
 * URL만 바꾸면 코드 변경 없이 전환할 수 있다. (Vercel의 파일 시스템은 요청마다 사라지므로 file: 은 쓸 수 없다.)
 */
type Db = LibSQLDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __squadDb?: Db; __squadClient?: Client };

function createDb(): Db {
  const env = getEnv();

  // file: URL이면 디렉터리가 없을 때 만들어 둔다 (첫 실행 편의).
  if (env.DATABASE_URL.startsWith("file:")) {
    const path = env.DATABASE_URL.slice("file:".length);
    mkdirSync(dirname(path), { recursive: true });
  }

  const client = createClient({
    url: env.DATABASE_URL,
    authToken: env.DATABASE_AUTH_TOKEN,
  });
  globalForDb.__squadClient = client;
  return drizzle(client, { schema });
}

/** 실제 인스턴스. 처음 호출될 때 만들고, 이후에는 globalThis에 보관한 것을 돌려준다. */
function getDb(): Db {
  if (!globalForDb.__squadDb) globalForDb.__squadDb = createDb();
  return globalForDb.__squadDb;
}

/**
 * 호출부는 예전처럼 `db.select()…`를 쓴다. Proxy가 첫 프로퍼티 접근 때 getDb()를 호출해 실제 인스턴스로
 * 위임하므로, 모듈을 import만 해서는 연결도 환경 변수 검증도 일어나지 않는다.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
