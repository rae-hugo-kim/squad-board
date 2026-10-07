import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

/**
 * DB 클라이언트 싱글턴.
 *
 * 왜 싱글턴인가: Next.js 개발 서버는 파일을 바꿀 때마다 모듈을 다시 평가한다.
 * 그때마다 새 연결을 만들면 연결이 누수된다. globalThis에 보관해서 재사용한다.
 *
 * 왜 libsql인가: 로컬에서는 `file:` URL로 SQLite 파일을 쓰고, 나중에 Vercel 배포 시
 * Turso(`libsql://`)로 URL만 바꾸면 코드 변경 없이 전환할 수 있다.
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

export const db: Db = globalForDb.__squadDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__squadDb = db;

export { schema };
