/**
 * 세션 토큰 — 서명된 쿠키.
 *
 * 설계
 * - 서버에 세션 테이블을 두지 않고, 쿠키 값 자체에 "멤버 id + 만료 시각"을 담고
 *   HMAC-SHA256으로 서명한다. 서명이 맞으면 신뢰한다(stateless).
 *   소모임 규모에서는 DB 세션보다 단순하고, 만료는 90일로 길게 잡아 재인증을 줄인다.
 * - 강제 로그아웃이 필요하면 SESSION_SECRET를 바꾸면 전원 무효화된다.
 * - Web Crypto API만 사용 → Node와 Edge 런타임(proxy.ts) 양쪽에서 동작한다.
 *
 * 토큰 형식: base64url(payload JSON) + "." + base64url(HMAC)
 */

export const SESSION_COOKIE = "sb_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 90; // 90일

export type SessionPayload = {
  /** members.id */
  mid: string;
  /** 만료 시각 (epoch seconds) */
  exp: number;
};

const enc = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  // TS 5.7+에서 Uint8Array는 버퍼 타입을 제네릭으로 가진다. crypto.subtle은
  // ArrayBuffer 기반만 받으므로 명시적으로 ArrayBuffer를 만들어 채운다.
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = toBase64Url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  return `${body}.${toBase64Url(sig)}`;
}

/**
 * 토큰을 검증하고 payload를 돌려준다. 서명 불일치·만료·형식 오류는 모두 null.
 * 예외를 던지지 않는 이유: 잘못된 쿠키는 "로그인 안 됨"으로 취급하면 충분하다.
 */
export async function verifySession(token: string | undefined, secret: string): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify("HMAC", key, fromBase64Url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    if (typeof payload.mid !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
