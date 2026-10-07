"use client";

import { useEffect } from "react";

/**
 * 페이지 렌더 중 예외가 났을 때 보여주는 화면 (Next.js error boundary).
 * 운영 빌드에서는 오류 메시지가 클라이언트로 오지 않으므로(보안) 진단 경로를 안내한다.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // 서버 로그와 대조할 수 있도록 digest만 콘솔에 남긴다
    console.error("page error", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md p-6">
        <h1 className="font-display text-2xl font-bold tracking-wide">서버 오류가 났습니다</h1>
        <p className="mt-2 text-sm text-secondary">
          배포 직후라면 환경 변수나 DB 설정 문제일 가능성이 큽니다.{" "}
          <a href="/api/health" className="text-info">
            /api/health
          </a>
          에서 무엇이 빠졌는지 확인할 수 있습니다.
        </p>
        {error.digest ? <p className="mt-2 font-mono text-xs text-muted">digest {error.digest}</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={reset} className="btn-primary">
            다시 시도
          </button>
          <a href="/api/health" className="btn-secondary no-underline">
            설정 진단
          </a>
        </div>
      </div>
    </main>
  );
}
