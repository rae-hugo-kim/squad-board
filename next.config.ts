import type { NextConfig } from "next";

/**
 * Next.js 설정.
 *
 * cacheComponents(부분 사전 렌더링)는 끈다. 이 앱은 모든 화면이 로그인 쿠키와 DB에
 * 의존하는 완전 동적 페이지라 캐시 이점이 거의 없고, 켜 두면 모든 데이터 접근을
 * <Suspense>로 감싸야 해서 코드가 복잡해진다. 트래픽이 커지면 그때 다시 검토한다.
 */
const nextConfig: NextConfig = {
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Docker 배포 시 node_modules 없이 실행 가능한 최소 번들을 만든다
  output: "standalone",
};

export default nextConfig;
