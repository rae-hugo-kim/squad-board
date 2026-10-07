# Squad Board

발로란트 소모임용 사이트 — 멤버 선호 DB · 스쿼드 편성기 · 전술 보드.

현재 **1단계(A+B)** 가 구현되어 있습니다: 패스코드 입장, 멤버/맵/요원 마스터, 맵별 개인 선호 저장·열람, 관리자 화면.
기획서의 단계별 범위는 아래 "로드맵"을 참고하세요.

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
#    SQUAD_PASSCODE  : 소모임 공용 패스코드
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
      admin/            멤버 관리, 맵 풀 토글 (관리자)
    globals.css         디자인 토큰 + Tailwind 테마
  components/           공용 UI (상단 네비, 역할군 점)
  db/
    schema.ts           테이블 정의 (Drizzle)
    seed-data.ts        맵·요원 마스터 — 신규 맵/요원은 여기에 추가
    seed.ts, migrate.ts 스크립트
  lib/
    env.ts              환경 변수 검증
    session.ts          서명된 세션 쿠키 (HMAC, 90일)
    auth.ts             requireMember / requireAdmin
    logger.ts           구조화 로그
  server/
    actions/            서버 액션 (폼 처리) — auth, prefs, admin
    queries/            조회 함수
  proxy.ts              요청 가드 (세션 없으면 /login)
drizzle/                마이그레이션 SQL (커밋 대상)
data/                   SQLite 파일 (git 제외)
```

## 설계 메모

- **인증**: 공용 패스코드 1개 + 닉네임 선택. 세션은 서버 저장 없이 HMAC 서명 쿠키(90일).
  강제 전원 로그아웃은 `SESSION_SECRET`을, 패스코드 유출은 `SQUAD_PASSCODE`를 바꾸면 됩니다.
- **권한**: 개인 선호는 본인만 수정(서버 액션이 세션에서 멤버 id를 꺼내며, 폼 값은 믿지 않음). 관리자 액션은 첫 줄에서 `requireAdmin()`.
- **멤버 삭제 없음**: 비활성화만 합니다. 2단계의 세션 기록이 과거 멤버를 참조하기 때문입니다.
- **좌표 정규화**(3단계 예정): 전술 보드 객체 좌표는 맵 기준 0~1로 저장합니다.
- **cacheComponents 끔**: 모든 화면이 세션·DB 의존 동적 페이지라 `next.config.ts`에서 껐습니다.

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

## 로드맵 (기획서 기준)

- [x] 1단계 — 패스코드 입장, 멤버/맵/요원, 맵별 선호 DB, 관리 화면
- [ ] 2단계 — 스쿼드 편성기(참가자 선택 → 조합 추천·근거), 세션 기록(날짜별·멤버별 스냅샷)
- [ ] 3단계 — 전술 보드(맵별 복수 전술, 핑·경로, 단계 스냅샷, 겹쳐보기, PNG 내보내기)
- [ ] 4단계 — eDPI 감도 찾기, 외부 라인업 링크
