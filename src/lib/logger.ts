/**
 * 최소 구조화 로거.
 *
 * 왜 console.log 대신 쓰는가: 로그에 "언제, 어느 영역에서, 무슨 일이" 일어났는지가
 * 일정한 형식으로 남아야 나중에 grep으로 추적할 수 있다. 외부 라이브러리(pino 등)로
 * 교체할 때 호출부를 바꾸지 않도록 이 파일 하나로 감싸 둔다.
 *
 * 사용: const log = createLogger("auth"); log.info("login ok", { memberId });
 */
type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const minLevel: Level = process.env.LOG_LEVEL === "debug" ? "debug" : "info";

function write(level: Level, scope: string, msg: string, meta?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg,
    ...(meta ?? {}),
  };
  const out = JSON.stringify(line);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) => write("debug", scope, msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => write("info", scope, msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => write("warn", scope, msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => write("error", scope, msg, meta),
  };
}

/** 에러 객체를 로그에 넣기 좋은 형태로 바꾼다. 비밀값이 섞이지 않도록 message/name만 남긴다. */
export function errorMeta(err: unknown): Record<string, unknown> {
  if (err instanceof Error) return { errName: err.name, errMessage: err.message };
  return { err: String(err) };
}
