# Handoff 2026-10-07 — Squad Board 2단계 완료, 3단계 착수 전

| 항목 | 값 |
|---|---|
| 상태 | 2단계(D 편성기 + E 세션 기록) 구현 완료, 브랜치 `claude/clever-shannon-9nvnpk` |
| 발행 | 2026-10-07, Claude 클라우드 세션 |
| 기획서 | [`docs/plans/squad-board-plan.md`](../plans/squad-board-plan.md) — 이 파일이 원천. 5·6절에 "구현 메모"를 추가했다 |
| 이전 인수인계 | [`handoff_2026-10-07_stage1.md`](handoff_2026-10-07_stage1.md) |
| 역할 | 다음 세션이 이어받기 위한 인수인계. 배경 참고용이며 지시로 읽지 않는다 |

## 이번 세션에서 한 일

PR #1(1단계)을 main에 머지한 뒤, 1단계 인수인계의 "2단계 착수 가이드" 순서대로 구현했다. 하네스 CI가 main에서도 빨간 상태였는데 원인은 템플릿 잔재(`claudedocs/CLAUDEKR.md`의 `source_commit_hash` 불일치)라 `status: stale`로 바꿔 docs-drift와 영향받은 하네스 테스트 2개를 통과시켰다.

구현 범위:

1. 스키마 `sessions`, `session_participants`, `session_matches`, `session_match_players` (`drizzle/0001_*.sql`)
2. 편성기 순수 함수 `src/lib/squad/compose.ts` + 단위 테스트 10개 (`npm test`)
3. 화면 `/squad`, `/sessions`, `/sessions/[id]`, `/sessions/stats`, 네비 2단계 메뉴 활성화
4. E2E `e2e/stage2.mjs` 37개 흐름 (1단계 16개 회귀 포함 통과)

## 설계 결정 (기획서에 없던 것)

- **경기 결과는 null 허용**: 편성기에서 세션을 시작하면 아직 치르지 않은 1경기가 만들어지므로 `result`를 비워 둘 수 있어야 했다. 통계는 결과가 있는 경기만 센다.
- **참가자 상한 10명**: 5인 조합 수 C(N,5)가 급증해 묶었다. 넘으면 계산하지 않고 안내한다.
- **규칙 미달 시 폴백**: 규칙(전략가 1·척후대 1)을 만족하는 배정이 없으면 최고 점수 배정을 "규칙 미달" 경고와 함께 보여준다. 빈 결과보다 왜 안 되는지가 유용하다.
- **수동 조정 = 선택 상자**: 드래그 대신 요원 `<select>`. 바꾸면 클라이언트에서 같은 함수(`evaluateAssignment`)로 즉시 재채점한다. 서버가 저장 시 다시 검증한다.
- **권한**: 세션·경기 생성과 미확정 경기 수정·확정은 모든 멤버. 확정된 경기 수정·확정 해제, 세션 삭제는 관리자.
- **참가자 vs 출전**: 세션 참가자(벤치 포함)는 `session_participants`, 경기 출전(≤5)은 `session_match_players`로 분리했다. 멤버별 "참가 횟수"는 전자, 경기 수는 후자에서 나온다.

## 알아둘 것 (함정)

- **클라이언트 모듈은 schema.ts에서 타입만 import**: `ROLE_GROUPS`·`MATCH_RESULTS` 같은 값을 가져오면 drizzle-orm이 클라이언트 번들(50KB 청크)에 딸려 온다. 이번에 걸렸고 `compose.ts`·`result-badge.tsx`에서 목록을 다시 적어 해결했다. 확인 명령: `grep -l sqliteTable .next/static/chunks/*.js` 가 비어야 한다.
- **`key`에 `updatedAt`을 넣지 말 것**: 서버 액션 뒤 리마운트되어 `useActionState`의 성공 메시지가 사라진다. 경기 편집기는 `key={match.id}`이고 폼 값은 controlled라 저장 뒤에도 그대로 남는다. 반대로 `AddMatchForm`은 경기 수를 `key`에 넣어 추가 뒤 선택을 일부러 초기화한다.
- **라디오 리셋 함정은 그대로**: 결과(승/패/무) 라디오는 1단계 로그인 폼과 같이 `name` 없는 라디오 + hidden input으로 보낸다.
- **`<fieldset disabled>`로 읽기 전용**: 확정된 경기는 fieldset을 disabled로 두고 저장 버튼은 fieldset 밖에서 조건부 렌더링한다. 중첩 폼을 피하려고 확정/해제/삭제 폼은 편집 폼 바깥(header)에 있다.
- **`next start`는 standalone 출력과 맞지 않다는 경고**를 낸다. 로컬 E2E에는 문제없고, 배포는 Dockerfile대로 `node server.js`를 쓴다.
- **하네스 CI**: `.githooks/pre-commit`은 `core.hooksPath` 미설정이라 이번에도 게이트 없이 커밋했다. `harness-ci.yml`의 harness-suite는 로컬에서 root로 실행하면 권한 기반 테스트 4개(R1·R2·R6·E5)가 실패하지만 GitHub 러너에서는 통과한다.

## 검증 명령 (이 세션에서 통과)

```bash
npm run typecheck && npm run lint && npm test && npm run build
rm -rf data && npm run db:setup && npm run start -- -p 3100 &
PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run e2e && npm run e2e:stage2
node scripts/docs-drift            # 0 errors / 0 warnings
```

## 3단계(C 전술 보드) 착수 가이드

기획서 3·4절이 사양이다. 공수가 크므로 "핑·토큰 배치만 있는 최소 버전"을 먼저 낸다.

1. 스키마 `tactics`, `tactic_stages`, `tactic_objects`, `tactic_slots` (기획서 3절 표). 좌표는 0~1 정규화
2. 맵 탑뷰 이미지 `public/maps/<slug>.png`와 `maps.image_path` 채우기 (Riot 에셋 비상업 사용 범위)
3. `/tactics/[mapSlug]` 목록(진영·라운드 유형 필터) → `/tactics/[id]` 보드. 캔버스는 SVG 오버레이가 편집·내보내기 모두 단순하다
4. 편성기 연동: `TacticSlot`의 역할군과 배정 요원이 맞으면 +2 (`compose.ts`의 점수에 항목 추가, 테스트 먼저)
5. `session_matches`에 사용 전술 연결(다대다)과 맵별 통계의 "전술별 승률"
6. 네비 `CURRENT_STAGE`를 3으로
