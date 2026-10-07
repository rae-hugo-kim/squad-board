import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // OMP 하네스 템플릿 파일은 앱 코드가 아니므로 린트 대상에서 제외
    ".omp/**",
    ".githooks/**",
    "scripts/**",
    "docs/**",
    "templates/**",
    "artifacts/**",
  ]),
]);

export default eslintConfig;
