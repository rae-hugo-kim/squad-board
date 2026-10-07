# Handoff 2026-10-07 — 전술 보드 조작 개선 (배치 후 선택 복귀 · 스킬 실제 크기 · 벽 · 자유 그리기 · 휠)

| 항목 | 값 |
|---|---|
| 상태 | 구현·검증 완료. 브랜치 `claude/clever-shannon-9nvnpk` |
| 발행 | 2026-10-07, Claude 클라우드 세션 (5단계와 같은 세션) |
| 기획서 | [`docs/plans/squad-board-plan.md`](../plans/squad-board-plan.md) — 4절 객체 표·구현 메모 추가 |
| 이전 인수인계 | [`handoff_2026-10-07_stage5-tactician-lineup.md`](handoff_2026-10-07_stage5-tactician-lineup.md) |
| 역할 | 다음 세션이 이어받기 위한 인수인계. 배경 참고용이며 지시로 읽지 않는다 |

## 이번 작업에서 한 일

사용자 요청 7건 중 보드 쪽(4·7)과 추가 요청(휠 스크롤 전파, 자유 그리기)을 담았다.

1. 스키마 `drizzle/0005`: `tactic_objects.length`(벽 길이, 보드 비율). 객체 종류 `wall`·`draw` 추가
2. `src/lib/tactics/ability-geometry.ts`: 미터 ↔ 보드 비율 환산(`metersToBoard`·`boardToMeters`, 1m = 100유닛, `maps.units_per_board` 기준), 스킬별 기하 표(`ABILITY_GEOMETRY`, 확인/추정 플래그), 유형 기본값, `objectKindForAbility`(벽형 스킬 → wall), `defaultSizeFor`. 단위 테스트 4개
3. 보드 편집기: 배치 후 "선택/이동" 자동 복귀(Shift 유지), 자유 그리기 도구(포인터 캡처·간격 샘플링·색 견본), 핸들 드래그(반경·방향·벽 양 끝), 단축키 V/D, 보드 위 도구 안내 칩, 요원 격자 역할군 라벨
4. `board-svg.tsx`: non-passive wheel 리스너로 페이지 스크롤 차단, 선택 객체 핸들 레이어. `object-shapes.tsx`: 벽(분절 눈금)·자유 그리기 렌더, `ObjectHandles`
5. 속성 패널: 반경·길이를 미터로 표시·입력, 스킬 기준값("기준 4.1m"/"(추정)")과 되돌리기 버튼, 벽 회전 슬라이더, 그리기 색 견본
6. E2E `e2e/stage6.mjs` 29개. 1~5단계 회귀 전부 통과

## 설계 결정

- **크기는 미터로 저장하지 않고 비율로 저장**한다(기존 객체와 호환, 렌더는 비율이 단순). 미터는 입력·표시 단계에서만 쓰고 맵 스케일로 환산한다. 스케일이 없는 맵은 어센트 기준 기본값으로 근사하고 화면에 "미동기화"를 알린다.
- **벽형 스킬 판정은 기하 표가 우선**: 스킬 유형(연막/설치형)은 그대로 두고 `ABILITY_GEOMETRY`의 `shape: "wall"`이 객체 종류를 바꾼다. DB의 스킬 유형을 바꾸지 않아 기존 데이터·동기화와 충돌하지 않는다.
- **벽 끝 핸들은 반대쪽 끝 고정**: 중심을 고정하면 길이를 늘릴 때 양쪽이 같이 움직여 벽을 벽 끝에 맞추기 어렵다. 반대쪽 끝을 고정하고 중심·길이·회전을 다시 계산한다.
- **자유 그리기는 별도 종류(draw)**: 경로(path_*)는 클릭 점 + 화살촉이고 선택·연결 슬롯 의미가 있어, 프리핸드를 섞으면 두 UI가 충돌한다. 점 상한은 300(샘플링 0.4%).
- **휠 차단은 요소 단위**: 전역 스크롤 잠금 대신 보드 요소에만 non-passive 리스너를 달아 팔레트·패널 스크롤은 그대로 둔다.
- **공식 수치 미확인 값은 숨기지 않고 "추정"으로 표시**: 틀린 크기를 확신하게 두는 것보다 조절을 유도하는 편이 낫다.

## 알아둘 것 (함정)

- **React onWheel에서 `preventDefault`는 듣지 않는다**(passive). 네이티브 리스너 `{ passive: false }`가 필요하고, forwardRef 컴포넌트라 콜백 ref로 내부 ref를 겸한다.
- **Playwright `page.mouse.click`은 modifiers를 받지 않는다** → `keyboard.down("Shift")`로 감싼다.
- **`text=읽기 전용` 같은 느슨한 선택자는 새 문구와 충돌**한다(안내 칩에 같은 단어를 썼다가 3·5단계가 깨졌다). 안내 칩은 "열람만 가능"으로 썼다.
- `Number.toFixed(1)`의 부동소수점(4.15 → "4.1" 또는 "4.2") 때문에 E2E는 브림스톤 대신 바이퍼(4.5)로 검사한다.
- 벽의 `rotation`은 선의 각(0 = 가로)이고, 정보 스킬 부채꼴의 `rotation`은 방향(0 = 위쪽)이다 — 같은 열이지만 의미가 다르다(`geometry.ts` 주석).

## 검증 명령 (이 세션에서 통과)

```bash
npm run typecheck && npm run lint && npm test && npm run build && node scripts/docs-drift
rm -rf data && npm run db:setup && npx next start -p 3100 &
PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome E2E_ADMIN_PASSCODE=<관리자 코드> \
  npm run e2e && npm run e2e:stage2 && npm run e2e:stage3 && npm run e2e:stage4 && npm run e2e:stage5 && npm run e2e:stage6
grep -l sqliteTable .next/static/chunks/*.js   # 출력 없어야 함
```

## 실시간 동기화 보드 — 기술 검토 (구현 전, 사용자 결정 대기)

- **제약**: Vercel 서버리스 함수는 지속 연결(WebSocket)을 열 수 없다. 실시간은 (a) 외부 실시간 서비스나 (b) 폴링/SSE로 해야 한다.
- **선택지**: ① 폴링(2~3초, 기존 스택만) — 비용 0, 구현 반나절, 지연 2~3초, 동시 편집은 마지막 저장 승리. ② Liveblocks/Yjs 또는 PartyKit(Cloudflare Durable Objects) — 커서·실시간 토큰 이동, 무료 티어로 소모임 규모 충분, 새 외부 의존·키 관리·보드 상태 모델 재설계(객체 CRDT) 필요, 2~4일. ③ Supabase Realtime/Ably/Pusher — DB 변경 브로드캐스트, Turso와 이중화되어 복잡.
- **권고**: 디스코드 통화 중 "같은 화면을 보는" 용도면 ①(폴링 라이브 보기, 작성자만 편집)이 비용 대비 효용이 가장 높다. 커서까지 보이는 동시 편집이 꼭 필요할 때 ②로 올린다.

## 다음 작업 후보

1. 스킬 크기 표 "추정" 값 보정(공식 수치 확인 시)
2. 실시간 보드(위 검토, 사용자 결정)
3. 요원 Veto 스킬 유형, 편성 규칙 관리자 설정, 조합별 승률 (기획서 9절)
