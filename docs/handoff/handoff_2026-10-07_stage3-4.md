# Handoff 2026-10-07 — Squad Board 3·4단계 완료 (기획서 전 범위 구현)

| 항목 | 값 |
|---|---|
| 상태 | 3단계(C 전술 보드)·4단계(F 유틸) 구현 완료. 기획서 1~4단계 전부 구현됨. 브랜치 `claude/clever-shannon-9nvnpk` |
| 발행 | 2026-10-07, Claude 클라우드 세션 (2단계와 같은 세션) |
| 기획서 | [`docs/plans/squad-board-plan.md`](../plans/squad-board-plan.md) — 4·7절에 "구현 메모" 추가 |
| 이전 인수인계 | [`handoff_2026-10-07_stage2.md`](handoff_2026-10-07_stage2.md) |
| 역할 | 다음 세션이 이어받기 위한 인수인계. 배경 참고용이며 지시로 읽지 않는다 |

## 이번 세션에서 한 일

사용자 지시 "기획서대로 쭉 구현"에 따라 2단계에 이어 3·4단계를 한 브랜치에서 구현했다.

1. 스키마 `tactics` · `tactic_stages` · `tactic_objects` · `tactic_slots` · `session_match_tactics`, `members.crosshair_code` (`drizzle/0002_*.sql`)
2. 마스터: 요원 스킬 4종 수기 입력(Veto 제외), 맵 탑뷰 자리표시자 SVG 12장(`public/maps/`)과 `maps.image_path`
3. 편성기 확장: 전술 슬롯 ↔ 멤버 최대 가중 매칭(비트마스크 DP), 슬롯 +2 · 포지션 힌트 +1, 미설정 슬롯 제외. 단위 테스트 4개 추가
4. 전술 보드: 목록(필터·겹쳐보기·새 전술) → 편집기(팔레트 14종·속성 패널·단계·슬롯·자동 저장·드래그·Delete·휠 확대·스페이스 이동·PNG) → 겹쳐보기 뷰어
5. 세션 연동: 편성 확정 시 전술 바인딩 기록, 경기 편집기에 "사용한 전술" 선택, 통계에 전술별 승률
6. 유틸 `/tools`: 감도 찾기(Pointer Lock, 플릭+트래킹, 이분 탐색 5라운드), 크로스헤어 코드, 감도 비교표, 외부 링크
7. E2E `e2e/stage3.mjs` 42개 · `e2e/stage4.mjs` 14개 (1·2단계 회귀 16·37개 포함 전부 통과)

## 설계 결정 (기획서에 없던 것)

- **보드 = SVG + 안쪽 transform**: viewBox 1000 고정, 확대·이동은 `<g transform>`. 좌표 변환이 한 함수(`clientToBoard`)로 끝난다. 캔버스(bitmap) 대신 SVG를 고른 이유는 선택·속성 편집·PNG 직렬화가 모두 단순해지기 때문.
- **저장은 단계 단위 통째 교체**: 객체 CRUD 대신 `saveStageAction(stageId, objects[])`. last-write-wins 전제와 맞고 충돌 처리가 필요 없다. 자동 저장은 2.5초 디바운스.
- **미설정 슬롯은 미사용**: 전술 생성 시 슬롯 5개를 비워 만들므로, 역할군·요원·설명·고정 멤버가 모두 없는 슬롯은 점수·충족 수에서 뺀다(`isConfiguredSlot`). 그렇지 않으면 모든 전술이 "슬롯 1/5"로 보인다.
- **슬롯 매칭은 DP**: 슬롯·멤버 ≤ 5라 2^5 마스크 DP로 정확히 푼다. 동점이면 앞 슬롯부터 채운 경로를 택해 결정적이다.
- **맵 이미지 자리표시자**: Riot 에셋을 저장소에 넣지 않았다. 사용자가 실제 탑뷰로 교체한다(같은 파일명 또는 `maps.image_path`). 시드는 `image_path`가 비어 있을 때만 채워 교체본을 덮어쓰지 않는다.
- **감도 찾기 매핑**: 1카운트 = 0.07° × 감도, 캔버스 폭 = 103°. 점수는 플릭·트래킹 50:50의 상대 점수. 추천값은 좁혀진 구간의 중앙.
- **드래그 대신 선택 상자**(편성 수동 조정)와 **드래그 이동**(보드)은 각각 그 화면에서 자연스러운 쪽을 택했다.

## 알아둘 것 (함정)

- **`key`에 `updatedAt` 금지**: 보드 페이지에서도 같은 함정에 걸렸다. 서버 액션 뒤 리마운트되어 "저장됨" 상태가 사라진다. 보드는 `key={tacticId-stages.length}`로 단계 수가 바뀔 때만 리마운트한다.
- **클라이언트 모듈은 schema.ts에서 타입만**: `TACTIC_SIDES`·`ROUND_TYPES` 등 값은 `src/lib/tactics/types.ts`에 다시 적었다. 확인: `grep -l sqliteTable .next/static/chunks/*.js` 가 비어야 한다.
- **Pointer Lock 중 클릭은 캔버스로 간다**: 감도 찾기 중 "중단" 버튼은 Esc로 잠금을 푼 뒤 눌러야 한다(화면 안내 있음). E2E는 `document.exitPointerLock()`을 호출한다.
- **headless Chromium의 blob 다운로드 파일명은 "download"**: PNG 내보내기 E2E는 파일 내용(PNG 시그니처)으로 검증한다. 실제 브라우저에서는 `download` 속성 이름으로 저장된다.
- **경로 객체 선택은 거리 판정**: `<g>` 클릭이 얇은 선에 잘 안 잡혀 `distanceToPolyline`로 가까운 경로를 고른다.
- **`<fieldset disabled className="contents">`**로 읽기 전용을 만들고, 저장 버튼은 fieldset 밖에 둔다(보드 속성 패널·슬롯 편집기·경기 편집기 공통).
- **복제·단계 추가·삭제는 `<form action>` 서버 액션**이라 저장 안 한 변경이 있으면 자동 저장(2.5초) 전에 누르면 유실된다. 저장 상태 표시("변경됨")를 보고 누르도록 안내 문구가 있다.

## 검증 명령 (이 세션에서 통과)

```bash
npm run typecheck && npm run lint && npm test && npm run build && node scripts/docs-drift
rm -rf data && npm run db:setup && npm run start -- -p 3100 &
PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  npm run e2e && npm run e2e:stage2 && npm run e2e:stage3 && npm run e2e:stage4
grep -l sqliteTable .next/static/chunks/*.js   # 출력 없어야 함
```

## 다음 작업 후보 (기획서 9절 보류 결정 + 잔여)

1. 맵 탑뷰 이미지 교체 (`public/maps/<slug>.svg` → 실제 이미지, 또는 `maps.image_path`)
2. 요원 Veto 스킬 4종 입력 (`src/db/seed-data.ts`) 후 `npm run db:seed`
3. 편성 규칙(역할군 최소) 관리자 설정 화면 — 지금은 `DEFAULT_RULES` 상수
4. 조합별(같은 5명) 승률 — 데이터가 쌓인 뒤
5. 편성기에 세션 승패 반영(+1), 전술 보드 시간축 애니메이션, 댓글·공동 편집, 다국어 — 사용 후 피드백으로 결정
6. 콜아웃 좌표(맵 마스터) — 전술 보드 라벨 자동 완성용
7. 배포 방식 결정 (미니PC Docker vs Vercel+Turso)
