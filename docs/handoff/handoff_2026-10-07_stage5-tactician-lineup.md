# Handoff 2026-10-07 — 전술가 티어 · 공통 전술 · 오늘의 스쿼드(라인업)

| 항목 | 값 |
|---|---|
| 상태 | 구현·검증 완료. 브랜치 `claude/clever-shannon-9nvnpk` |
| 발행 | 2026-10-07, Claude 클라우드 세션 (3·4단계와 같은 세션) |
| 기획서 | [`docs/plans/squad-board-plan.md`](../plans/squad-board-plan.md) — 4절 권한 표, 5절 "오늘의 스쿼드" 추가 |
| 이전 인수인계 | [`handoff_2026-10-07_stage3-4.md`](handoff_2026-10-07_stage3-4.md) |
| 역할 | 다음 세션이 이어받기 위한 인수인계. 배경 참고용이며 지시로 읽지 않는다 |

## 이번 작업에서 한 일

사용자 요청 7건 중 데이터·흐름 쪽(1·2·3·5·6)을 이 PR에 담았다. 보드 상호작용(4·7, 휠 스크롤 전파, 자유 그리기)은 다음 PR.

1. 스키마 `drizzle/0004`: `members.role`에 `tactician`, `tactics.is_shared` / `priority`, `maps.units_per_board`(다음 PR의 스킬 실제 크기용 — 공식 데이터 xMultiplier 역수, assets:sync가 채움)
2. 권한 순수 함수 `src/lib/tactics/permissions.ts`(`canEditTactic`, `canManageSharedTactics`) — 서버 액션 `loadEditableTactic`과 목록·보드 페이지가 같은 함수를 쓴다
3. 시드 `SEED_TACTICIAN_NICKNAMES`(알파카·벵거·오르페브르): 없으면 전술가로 생성, 일반이면 승격. 관리 화면 역할 선택에 전술가 추가(선택 상자 `key={m.role}`로 액션 뒤 리셋 문제 해결)
4. 편성기 `tacticFeasibility`(실행 가능성, 포기 판정)와 `TacticFit.feasible/infeasibleReasons`, `src/lib/squad/today.ts`의 `chooseTodayTactic`(우선도 순 → 불가 건너뜀 → 전부 불가면 1위를 포기 권고로)
5. 랜딩 `/`(오늘의 스쿼드), `/today`(선택·리다이렉트), 보드 `?m=` 라인업 패널(`lineup-panel.tsx`)과 슬롯 토큰 이름·요원 표시. 로그인 기본 착지를 `/prefs`에서 `/`로
6. 외부 링크 Easy Lineup → Lineups Valorant(lineupsvalorant.com)
7. 단위 테스트 +12(총 47), E2E `e2e/stage5.mjs` 35개. 1~4단계 회귀 전부 통과

## 설계 결정

- **공통 전술은 명시적 선택**: 새 전술 폼의 "공통 전술" 체크는 전술가·관리자에게도 기본 해제다. 처음엔 기본 체크였는데, 3단계 E2E가 만든 관리자 실험 전술이 전부 공통이 되어 오늘의 스쿼드 후보에 섞였다. 실험 전술이 추천에 들어가면 안 된다.
- **복제본은 항상 개인 전술**: 공통 전술이 늘어나는 것은 전술가의 명시적 선택이어야 한다.
- **실행 가능성은 점수와 분리**: 편성 DP는 선호+슬롯 점수를 합산 최적화하므로 "채울 수 있지만 점수가 낮은" 배정을 지나칠 수 있다. 포기 판정은 (슬롯 → 멤버 → 요원) DFS로 존재 여부만 본다. 탐색 밖(`withFeasibility`)에서 팀당 한 번만 계산해 핫루프를 건드리지 않는다.
- **/today는 화면 없이 리다이렉트**: 참가자 전체로 빠른 판정 → 통과한 전술만 편성 계산(10명 × 전술 여러 개 완전 탐색은 느리다). 라인업은 보드 페이지가 `?m=`로 다시 계산한다(저장 안 함).
- **우선도 0 = 미지정 = 맨 뒤**: SQL 대신 메모리 정렬(`sortByPriority`)로 규칙을 읽기 쉽게 뒀다.
- **전술가 시드는 멱등 승격**: 관리 화면에서 내려도 다음 배포에서 다시 올라온다. 영구히 내리려면 목록에서도 빼야 한다(체크리스트 Known limitations).

## 알아둘 것 (함정)

- **`<select defaultValue>`는 액션 뒤 옛 값으로 돌아간다**: React 19가 `<form action>` 완료 후 폼을 리셋하고, RSC 갱신으로 바뀐 `defaultValue`는 DOM에 반영되지 않는다. 바뀌는 값을 `key`에 넣어 리마운트한다(관리 화면 역할 선택).
- **Playwright `innerText`는 SVG `<text>`에서 실패**(HTMLElement가 아님) → `textContent()`.
- **`<Link>` 클릭 뒤 `waitForLoadState("networkidle")`만으로는 이동 완료를 보장하지 못한다** → `waitForURL`을 먼저.
- **E2E는 한 번만**: 스크립트는 상태를 쌓으므로(전술 생성 등) 같은 DB에서 두 번 돌리면 "빈 상태" 검사가 깨진다. 재실행 전 `rm -rf data && npm run db:setup`과 서버 재시작(`next-server` 프로세스 종료 — `pkill -f "next start"`는 셸 자신을 죽일 수 있다).
- **`.next/types`가 stale이면 `tsc`가 지워진 `src/app/page.tsx`를 찾는다** → `rm -rf .next/types` 뒤 재실행(빌드가 다시 만든다).
- **harness 테스트 4건(hook-gates R1·R2·R6·E5)은 이 컨테이너(root, /tmp chmod)에서 원래부터 실패한다** — 깨끗한 트리에서도 같다. CI에서는 통과.

## 검증 명령 (이 세션에서 통과)

```bash
npm run typecheck && npm run lint && npm test && npm run build && node scripts/docs-drift
rm -rf data && npm run db:setup && npx next start -p 3100 &
PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome E2E_ADMIN_PASSCODE=<관리자 코드> \
  npm run e2e && npm run e2e:stage2 && npm run e2e:stage3 && npm run e2e:stage4 && npm run e2e:stage5
grep -l sqliteTable .next/static/chunks/*.js   # 출력 없어야 함
```

## 다음 작업 (사용자 요청 잔여)

1. 보드: 배치 후 자동으로 "선택/이동" 복귀, 스킬 범위를 실제 크기(1m = 100유닛, 오멘 연막 4.1m·브림스톤 4.15m·바이퍼 4.5m 확인)로 `maps.units_per_board` 기준 환산, 벽(세이지 방벽 등) 객체의 배치·이동·회전·길이 조절 핸들, 반경 핸들
2. 보드: 휠 확대 시 페이지 스크롤 전파 차단(React onWheel은 passive → 네이티브 non-passive 리스너), 자유 그리기 도구
3. 보드 UI/UX를 Valoplant에 가깝게(툴바·팔레트 정리, 현재 도구 안내 칩)
4. 실시간 동기화 보드는 기술 스택·비용 검토 뒤 사용자 결정 대기
