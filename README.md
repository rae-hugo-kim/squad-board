# Squad Board

발로란트 소모임용 사이트 — 멤버 선호 DB · 스쿼드 편성기 · 전술 보드.

기획서의 **1~4단계가 모두 구현**되어 있습니다: 패스코드 입장과 멤버/맵/요원 마스터, 맵별 개인 선호 DB, 스쿼드 편성기(전술 슬롯 점수 포함),
세션 기록과 멤버별·맵별·전술별 통계, 전술 보드(핑·토큰·경로·단계·겹쳐보기·PNG), 유틸(감도 찾기·크로스헤어·감도 비교·외부 링크).
남은 일은 아래 "로드맵"의 미체크 항목과 사용 피드백 반영입니다.

## 기술 스택

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 프레임워크 | Next.js 16 (App Router) + TypeScript | 프론트·백엔드를 한 저장소에서. 서버 액션으로 API 계층 없이 폼 처리 |
| 스타일 | Tailwind CSS v4 | 디자인 토큰을 CSS 변수 → `@theme`으로 매핑 (`src/app/globals.css`) |
| DB | SQLite (libsql) + Drizzle ORM | 파일 하나로 끝. 나중에 Turso로 URL만 바꿔 전환 가능 |
| 검증 | zod | 폼 입력·환경 변수 검증 |
| 폰트 | Pretendard, Barlow Condensed, JetBrains Mono (npm) | 외부 네트워크 의존 없음 |

## 처음 실행하기

```bash
# 1) 의존성
npm install

# 2) 환경 변수
cp .env.example .env.local
#    SQUAD_PASSCODE  : 소모임 공용 패스코드 (일반 멤버)
#    ADMIN_PASSCODE  : 관리자 패스코드 (관리자 닉네임은 이 값으로만 입장)
#    SESSION_SECRET  : openssl rand -hex 32 로 생성
#    SEED_ADMIN_NICKNAME : 첫 관리자 닉네임

# 3) DB 생성 + 마스터 데이터(맵 12·요원 28) + 관리자 1명
npm run db:setup

# 4) 개발 서버
npm run dev     # http://localhost:3000
```

첫 화면에서 패스코드를 넣고 관리자 닉네임을 고르면 입장됩니다. 관리 메뉴에서 멤버를 추가하세요.

## 명령어

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` / `npm run start` | 프로덕션 빌드·실행 |
| `npm run typecheck` / `npm run lint` | 타입 검사 / 린트 |
| `npm test` | 단위 테스트 (편성기 순수 함수, `src/**/*.test.ts`) |
| `npm run e2e` → `e2e:stage2` → `e2e:stage3` → `e2e:stage4` | Playwright 흐름 점검. 같은 빈 DB에서 이 순서로 실행 (각 스크립트 상단의 전제 참고) |
| `npm run db:generate` | `src/db/schema.ts` 변경 → 마이그레이션 SQL 생성 (`drizzle/`) |
| `npm run db:migrate` | 마이그레이션 적용 |
| `npm run db:seed` | 맵·요원 upsert + (멤버 0명일 때) 관리자 생성. 여러 번 실행해도 안전 |
| `npm run db:studio` | 브라우저에서 DB 내용 보기 |

## 폴더 구조

```
src/
  app/
    login/              입장 화면 (패스코드 + 닉네임)
    (app)/              로그인 이후 화면 — layout.tsx 가 세션을 확인
      prefs/[slug]/     맵별 멤버 선호 매트릭스 + 내 선호 편집
      squad/            스쿼드 편성기 (참가자·맵 선택 → 추천 조합 → 세션 시작)
      sessions/         세션 기록 목록 + 수동 생성
      sessions/[id]/    세션 상세: 경기 추가·결과·멤버별 K/D/A 입력, 확정
      sessions/stats/   멤버별 · 맵별 · 전술별 통계
      tactics/[mapSlug]/ 맵별 전술 목록(필터·겹쳐보기·새 전술), overlay/ 겹쳐보기
      tactics/board/[id]/ 전술 보드 편집기 (작성자·관리자 편집, 그 외 읽기 전용)
      tools/            유틸: 감도 찾기, 내 감도·eDPI, 크로스헤어 코드, 멤버 감도 비교, 외부 링크
      admin/            멤버 관리, 맵 풀 토글 (관리자)
    globals.css         디자인 토큰 + Tailwind 테마
  components/           공용 UI (상단 네비, 역할군 점, 요원 선택, 결과 배지)
    tactic-board/       보드 SVG 렌더러, 객체 도형, 편집기, 속성 패널, 슬롯 편집, 겹쳐보기, PNG 내보내기
  db/
    schema.ts           테이블 정의 (Drizzle)
    seed-data.ts        맵·요원 마스터 — 신규 맵/요원은 여기에 추가
    seed.ts, migrate.ts 스크립트
  lib/
    env.ts              환경 변수 검증
    session.ts          서명된 세션 쿠키 (HMAC, 90일)
    auth.ts             requireMember / requireAdmin
    logger.ts           구조화 로그
    date.ts             날짜 문자열 유틸 (Asia/Seoul 기준 오늘)
    squad/compose.ts    편성기 순수 함수 (제약 → 점수 → 전술 슬롯 → 상위 3개) + 단위 테스트
    tactics/            보드 상수(객체 종류·색조)와 기하 유틸(좌표 변환·부채꼴·화살촉)
    tools/              감도 계산(eDPI·360°·이분 탐색·점수) + 단위 테스트, 외부 링크 목록
  server/
    actions/            서버 액션 (폼 처리) — auth, prefs, admin, sessions, tactics
    queries/            조회 함수 — prefs, squad, sessions(통계 포함), tactics
public/maps/            맵 탑뷰 자리표시자 SVG — 실제 이미지로 교체 가능 (같은 이름 또는 maps.image_path)
  proxy.ts              요청 가드 (세션 없으면 /login)
drizzle/                마이그레이션 SQL (커밋 대상)
data/                   SQLite 파일 (git 제외)
```

## 설계 메모

- **인증**: 공용 패스코드 + 닉네임 선택. 관리자 닉네임은 별도 `ADMIN_PASSCODE`를 요구해, 공용 코드만 아는 사람이 관리자 닉네임을 골라 관리자가 되는 것을 막습니다. 세션은 서버 저장 없이 HMAC 서명 쿠키(90일).
  강제 전원 로그아웃은 `SESSION_SECRET`을, 패스코드 유출은 `SQUAD_PASSCODE`/`ADMIN_PASSCODE`를 바꾸면 됩니다.
- **권한**: 개인 선호는 본인만 수정(서버 액션이 세션에서 멤버 id를 꺼내며, 폼 값은 믿지 않음). 관리자 액션은 첫 줄에서 `requireAdmin()`.
- **멤버 삭제 없음**: 비활성화만 합니다. 2단계의 세션 기록이 과거 멤버를 참조하기 때문입니다.
- **선호는 두 겹**: 맵별 선호 요원 1~3순위(본인만 수정)와 맵 무관 선호 역할군 1~3순위(프로필). 편성기는 둘 다 점수에 넣고, 요원 선호가 없는 맵에서는 선호 역할군 요원을 후보로 삼습니다.
- **편성기는 보조 도구**: 결과를 강제하지 않고 근거(선호 순위·역할군·경고)를 보여줍니다. 규칙(전략가 1·척후대 1 이상)은 상수이고, 참가자는 최대 10명까지 계산합니다.
- **세션 기록은 스냅샷**: 경기별 멤버 행에 요원·포지션을 복사해 두므로 나중에 선호를 바꿔도 과거 기록은 그대로입니다. 확정된 경기는 관리자만 수정할 수 있습니다.
- **전술은 슬롯으로 저장**: 요원 토큰은 슬롯(역할군/요원)이고 멤버는 편성 때 바인딩됩니다. 편성기가 전술 슬롯 충족에 +2, 포지션 힌트 일치에 +1을 더하고, 세션 시작 시 바인딩을 경기에 남깁니다.
- **좌표 정규화**: 전술 보드 객체 좌표는 맵 기준 0~1로 저장해 이미지 해상도와 무관합니다. 보드 저장은 단계별 객체 목록 통째 교체(마지막 저장이 이김)이고 자동 임시 저장이 있습니다.
- **맵 이미지는 자리표시자**: `public/maps/<slug>.svg`는 사이트 배치만 표시합니다. 실제 탑뷰로 바꾸려면 파일을 교체하세요.
- **cacheComponents 끔**: 모든 화면이 세션·DB 의존 동적 페이지라 `next.config.ts`에서 껐습니다.

## 배포 (Vercel + Turso)

Vercel의 파일 시스템은 요청마다 사라지므로 SQLite 파일(`file:`) 대신 [Turso](https://turso.tech)(libsql)를 씁니다. 코드 변경 없이 환경 변수만 바꾸면 됩니다.

1. Turso DB 생성: `turso db create squad-board` → `turso db show squad-board --url`, `turso db tokens create squad-board`
2. Vercel 프로젝트 → Settings → Environment Variables에 다음을 등록 (Production·Preview 모두):

   | 변수 | 값 |
   | --- | --- |
   | `SQUAD_PASSCODE` | 소모임 공용 패스코드 (일반 멤버) |
   | `ADMIN_PASSCODE` | 관리자 패스코드 (관리자 닉네임 입장용) |
   | `SESSION_SECRET` | `openssl rand -hex 32` 결과 |
   | `DATABASE_URL` | `libsql://<db>-<org>.turso.io` |
   | `DATABASE_AUTH_TOKEN` | Turso 토큰 |

   Vercel 마켓플레이스(Storage → Turso)로 연결하면 `TURSO_DATABASE_URL`·`TURSO_AUTH_TOKEN` 이름으로 자동 등록되는데, 그 이름도 그대로 인식합니다.

3. 배포하면 끝입니다. `npm run build`가 먼저 `src/db/deploy.ts`를 실행해, 원격 DB(`libsql://`)가 설정된 빌드에서는 마이그레이션과 시드(맵·요원·초기 관리자)를 자동으로 적용한 뒤 Next.js를 빌드합니다. 여러 번 실행해도 안전합니다. 초기 관리자 닉네임을 정하려면 `SEED_ADMIN_NICKNAME`도 환경 변수에 넣으세요(없으면 `admin`).
4. 배포 뒤 `https://<배포 주소>/api/health`가 `"ok":true`인지 확인하고 로그인 화면(배포 주소 뒤에 /login)으로 입장합니다. 환경 변수가 빠지면 빌드가 아니라 `/api/health`와 첫 요청에서 드러납니다.

로컬 빌드나 Docker 빌드에서는 원격 DB가 없으므로 이 단계를 건너뜁니다. PC에서 Turso에 직접 적용하고 싶을 때는 `.env.local`에 Turso 변수를 넣고 `npm run db:migrate && npm run db:seed`를 실행하면 됩니다.

## 배포 (미니PC, Docker)

```bash
docker build -t squad-board .
docker run -d --name squad-board -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e SQUAD_PASSCODE=... -e SESSION_SECRET=... \
  squad-board
```

컨테이너는 시작 시 마이그레이션과 시드를 자동 실행합니다. `data/` 볼륨에 SQLite 파일이 남습니다.
도메인 연결은 Cloudflare Tunnel 또는 역프록시(Caddy 등)로 HTTPS를 붙이세요 — 운영 환경에서는 쿠키가 `secure`라 HTTPS가 필요합니다.

## 문서

- 기획서: [`docs/plans/squad-board-plan.md`](docs/plans/squad-board-plan.md)
- 세션 인수인계: [`docs/handoff/`](docs/handoff/)

## 로드맵 (기획서 기준)

- [x] 1단계 — 패스코드 입장, 멤버/맵/요원, 맵별 선호 DB, 관리 화면
- [x] 2단계 — 스쿼드 편성기(참가자 선택 → 조합 추천·근거), 세션 기록(날짜별·멤버별 스냅샷)
- [x] 3단계 — 전술 보드(맵별 복수 전술, 핑·경로, 단계 스냅샷, 겹쳐보기, PNG 내보내기), 편성기·세션 연동
- [x] 4단계 — eDPI 감도 찾기, 크로스헤어 코드, 감도 비교표, 외부 라인업 링크
- [ ] 맵 탑뷰 이미지 교체, 요원 Veto 스킬 입력, 편성 규칙 관리자 설정, 조합별 승률 (기획서 9절 보류 결정 참고)
