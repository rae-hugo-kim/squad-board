import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * 요청 가드 (Next.js 16의 proxy — 이전 버전의 middleware).
 *
 * 하는 일: 보호된 경로에 세션 쿠키가 없거나 서명이 틀리면 /login으로 보낸다.
 * 하지 않는 일: DB 조회. 여기서는 서명만 확인하고, 멤버가 실제로 존재·활성인지는
 * 각 페이지의 requireMember()가 다시 확인한다. (가드는 빠르게, 정확한 판정은 페이지에서)
 *
 * 공개 경로: /login, Next 내부 자원, 정적 파일.
 */
const PUBLIC_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // 설정 누락은 조용히 통과시키면 안 된다. 명확한 500으로 드러낸다.
    return new NextResponse("SESSION_SECRET is not configured", { status: 500 });
  }

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value, secret);
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // 로그인 후 원래 가려던 곳으로 돌려보내기 위해 next 파라미터를 남긴다
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // _next 내부 자원, 파비콘, public 폴더의 파일(확장자 있는 경로)은 제외
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
