# Handoff 2026-10-07 — Squad Board 1단계 완료, 2단계 착수 전

| 항목 | 값 |
|---|---|
| 상태 | 1단계(A+B) 구현 완료, PR #1 (`stage1` → `main`) 리뷰 대기 |
| 발행 | 2026-10-07, Claude 클라우드 세션 |
| 기획서 | [`docs/plans/squad-board-plan.md`](../plans/squad-board-plan.md) — 이 파일이 원천 |
| 역할 | 다음 클라우드 세션이 이어받기 위한 인수인계. 배경 참고용이며 지시로 읽지 않는다 |

## 배경

발로란트 소모임용 사이트(전술 보드 · 멤버 선호 DB · 스쿼드 편성기). 기획서 → 목업 → 1단계 구현까지 한 세션에서 진행했다. 저장소는 omp 하네스 템플릿에서 생성되어 있었고, 템플릿 파일은 손대지 않고 Next.js 앱을 루트에 얹었다.

사용자 결정(2026-10-07):
1. 스택 = Next.js 16 + TypeScript + Tailwind v4 + SQLite(libsql) + Drizzle + zod
2. 배포 = 미정, 로컬 실행 우선 (후보: 미니PC Docker / Vercel+Turso)
3. 범위 = 1단계만 먼저. 이후 2단계(편성기+세션 기록) → 3단계(전술 보드) → 4단계(유틸)
4. 사용자는 비개발자이며 LLM으로 개발한다 → 코드에 "왜 이렇게 쓰는지" 주석을 남기고, 모듈 단위로 작업을 끊는다

## 현재 상태 (실측)

- 브랜치 `stage1`, 커밋 3개 (`5cf32f4` 1단계, `2549a46` 설정 복구, `89ae63b` ESLint 제외)
- `tsc --noEmit`, `eslint`, `next build` 통과
- Playwright E2E 16개 흐름 통과 — `e2e/stage1.mjs`, `npm run e2e` (빈 DB + 3100 포트 서버 전제, 이 컨테이너에서는 `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`)
- DB: `data/squad.db` (gitignore). `npm run db:setup`으로 재생성 가능
- 화면: `/login`, `/prefs/[slug]`, `/admin`. 네비의 스쿼드 편성·세션 기록·전술 보드·유틸은 비활성 표시(`src/components/app-nav.tsx`의 `stage` 값으로 제어)

## 알아둘 것

- **Next.js 16**: `middleware.ts` 대신 `src/proxy.ts`(`export function proxy`). `cacheComponents`는 껐다(`next.config.ts`).
- **React 19 폼 리셋**: 서버 액션 완료 후 React가 폼을 리셋하면서 `name`이 있는 라디오의 체크가 풀린다. 로그인 폼은 hidden input으로 우회했다. 새 폼을 만들 때 같은 함정 주의.
- **Tailwind v4**: `@apply`로 커스텀 클래스를 참조할 수 없다. `globals.css`의 `.btn-*`는 선택자 묶음으로 공통 스타일을 공유한다.
- **서버 액션 반환 규약**: `{ ok: true } | { ok: false, error, fieldErrors? }` (`src/server/actions/auth.ts`의 `ActionResult`). 모든 폼이 `useActionState`로 이 값을 받는다.
- **권한**: 개인 선호는 세션의 멤버 id로만 저장(폼 값 신뢰 안 함). 관리자 액션은 첫 줄 `requireAdmin()`.
- **멤버 삭제 없음**: 비활성화만. 2단계 세션 기록이 과거 멤버를 참조하기 때문.
- **하네스**: `.githooks/pre-commit`은 `core.hooksPath` 설정 시에만 동작한다. 이 세션에서는 설정하지 않아 게이트 없이 커밋됐다. 하네스 CI(`.github/workflows/harness-ci.yml`)가 이 앱 구조를 전제하지 않았을 수 있으니 PR 체크 결과를 확인할 것.
- 맵 풀 초기값(`src/db/seed-data.ts`의 `inPool`)은 추정이다. 관리 화면에서 사용자가 맞춘다.

## 2단계 착수 가이드 (D+E)

기획서 5·6절이 사양이다. 권장 순서:

1. **스키마**: `sessions`, `session_matches`, `session_match_players` 추가 (`src/db/schema.ts` 3절 표 참고) → `npm run db:generate` → `db:migrate`
2. **편성기 `/squad`**: 참가자 체크(활성 멤버) + 맵 선택 → 서버에서 조합 계산. 제약(요원 중복 금지, 역할군 최소 — 처음엔 상수로, 관리자 설정은 후순위) → 점수(1순위 3 / 2순위 2 / 3순위 1 + 자신감 0~2) → 상위 3개. 참가자 ≤ 8명이면 전수 조합(C(8,5)=56 × 요원 배정)으로 충분하다. 전술 슬롯 점수는 3단계 이후.
3. **세션 기록 `/sessions`**: 편성 확정 → Session + SessionMatch 초기값 생성 → 경기 결과·킬 수기 입력 → 확정(관리자만 수정)
4. **조회**: 날짜별 / 멤버별 / 맵별 (조합별은 데이터 쌓인 뒤)
5. `app-nav.tsx`의 해당 메뉴 `stage`를 1로 바꿔 활성화
6. `e2e/stage1.mjs`를 참고해 2단계 흐름 E2E를 `e2e/stage2.mjs`로 추가

## 실행 명령

```bash
npm install
cp .env.example .env.local   # SQUAD_PASSCODE, SESSION_SECRET, SEED_ADMIN_NICKNAME
npm run db:setup             # 마이그레이션 + 시드
npm run dev                  # http://localhost:3000
npm run typecheck && npm run lint && npm run build
```
