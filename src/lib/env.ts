import { z } from "zod";

/**
 * 환경 변수 검증.
 *
 * 왜 zod로 검증하는가: 환경 변수는 문자열이거나 undefined이고, 빠뜨리면
 * 런타임 깊숙한 곳에서 알 수 없는 에러로 터진다. 앱 시작 시점에 한 번
 * 검증해서 "어떤 변수가 빠졌는지"를 바로 알려주는 편이 운영이 쉽다.
 *
 * 값은 `.env.local`(로컬) 또는 배포 환경의 환경 변수에서 읽는다.
 */
const envSchema = z.object({
  // 소모임 공용 패스코드(일반 멤버). 유출 시 이 값만 바꾸면 전원 재입장.
  SQUAD_PASSCODE: z.string().min(4, "SQUAD_PASSCODE는 4자 이상이어야 합니다"),
  // 관리자 패스코드. 관리자 닉네임으로 입장할 때는 이 값을 요구한다 — 공용 코드만 알면 누구나 관리자 닉네임을
  // 골라 관리자가 되는 구멍을 막기 위함. 없으면 SQUAD_PASSCODE로 대체되며 /api/health가 분리를 권고한다.
  ADMIN_PASSCODE: z.string().min(4, "ADMIN_PASSCODE는 4자 이상이어야 합니다").optional(),
  // 세션 쿠키 서명 키. 32자 이상 무작위 문자열.
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET는 32자 이상이어야 합니다"),
  // SQLite 파일 경로. libsql 형식: file:./data/squad.db  (Turso 전환 시 libsql://...)
  DATABASE_URL: z.string().default("file:./data/squad.db"),
  // Turso 등 원격 DB 사용 시에만 필요
  DATABASE_AUTH_TOKEN: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * 검증된 환경 변수를 반환한다. 최초 호출 시 한 번만 파싱하고 캐시한다.
 * 실패하면 어떤 키가 왜 잘못됐는지 모아서 에러를 던진다.
 */
/**
 * Vercel 마켓플레이스의 Turso 연동은 변수를 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN 이름으로 넣는다.
 * 우리 이름(DATABASE_URL / DATABASE_AUTH_TOKEN)이 없을 때만 그 값을 받아들여, 연동 한 번으로 배포가 되게 한다.
 */
export function resolveEnvSource(raw: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...raw,
    DATABASE_URL: raw.DATABASE_URL || raw.TURSO_DATABASE_URL || undefined,
    DATABASE_AUTH_TOKEN: raw.DATABASE_AUTH_TOKEN || raw.TURSO_AUTH_TOKEN || undefined,
  };
}

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(resolveEnvSource());
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`환경 변수 설정 오류:\n${issues}\n(.env.example을 참고해 .env.local을 만드세요)`);
  }
  cached = parsed.data;
  return cached;
}
