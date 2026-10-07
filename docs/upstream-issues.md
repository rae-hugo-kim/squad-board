# oh-my-pi 업스트림 이슈 트래킹

**Repo**: can1357/oh-my-pi | **작성**: 2026-07-18 | **갱신**: 2026-08-03 | **작성 계정**: rae-hugo-kim

> 데이터 출처: `gh api`(2026-07-18 실측, 2026-08-03 재실측) + `docs/sum/` 세션 기록 + 초안 트래커(2026-07-27~28, 게시 완료 후 폐기) 인용. 총 8건 (closed 5 / open 3).

## 요약 표

| # | 제목 | 게시일 | 상태 | 해결 PR | 비고 |
|---|---|---|---|---|---|
| [#2290](https://github.com/can1357/oh-my-pi/issues/2290) | feat(retry): auto model fallback on Anthropic classifier refusals | 2026-06-11 | closed (completed) | [#2294](https://github.com/can1357/oh-my-pi/pull/2294) merged (`0fa27b2af`) | 현행 v17.0.4에 포함 확인 |
| [#5691](https://github.com/can1357/oh-my-pi/issues/5691) | `in use by this session` marker shows email only | 2026-07-16 | closed (completed) | [#5692](https://github.com/can1357/oh-my-pi/pull/5692) merged (`009dd9948`) | v17.0.2에 포함 확인 |
| [#5701](https://github.com/can1357/oh-my-pi/issues/5701) | TUI usage panel: account labels hard-capped at 24 cols | 2026-07-16 | closed (completed) | [#5703](https://github.com/can1357/oh-my-pi/pull/5703) merged (`99f2ffa03`) | v17.0.2에 포함 확인. #5691의 후속 |
| [#5960](https://github.com/can1357/oh-my-pi/issues/5960) | Clockless 0%-used window receives a scale-incompatible drain score | 2026-07-18 | closed (completed) | [#5961](https://github.com/can1357/oh-my-pi/pull/5961) merged (2026-07-18T19:06Z) | 우리 제안 그대로 반영. 이슈 동시 close |
| [#5966](https://github.com/can1357/oh-my-pi/issues/5966) | Session credential stickiness has no idle gating | 2026-07-18 | closed (completed) | [#5967](https://github.com/can1357/oh-my-pi/pull/5967) merged (2026-07-18T19:06Z) | 제안 3항목 전부 채택 + 리뷰 코멘트 반영(`2625b92`) |
| [#6869](https://github.com/can1357/oh-my-pi/issues/6869) | feat(auth): explicit paid extra-usage branch + per-account extra allowlist | 2026-07-28 | **open** | — | `proposal` 라벨 — maintainer 설계 승인 대기. 저자 응답 코멘트 게시 완료 |
| [#6870](https://github.com/can1357/oh-my-pi/issues/6870) | feat(tui): /auth credential inventory — cross-provider parity | 2026-07-28 | **open** | — | 트리아지 통과(실현성 인정), maintainer 응답 대기 |
| [#6898](https://github.com/can1357/oh-my-pi/issues/6898) | feat(auth): pre-dispatch notice for extra-usage billing | 2026-07-28 | **open** | — | #6869 §5의 분리분(트리아지 초대에 따름) |

공통 트리아지: bug 5건(#2290 포함)은 전부 `prio:p2`, `provider:anthropic`, `triaged` 획득 후 해결 PR 머지로 완결. feat 3건(2026-07-28 게시)은 전부 `@roboomp` 자동 트리아지 통과(`triaged`), 사람 메인테이너 반응 대기 중.

## 이슈별 상세

### #2290 — refusal 시 자동 모델 폴백 부재 (closed)

- **문제**: `claude-fable-5`에서 Anthropic 안전 분류기 거부(`stop_reason: "refusal"`, HTTP 200)가 일반 종단 에러로 처리됨. `#isRetryableError`의 transient 정규식에 "Refusal"이 불일치 → 기존 폴백 기구(`retry.fallbackChains`)에 도달 불가 → 동일 컨텍스트 재전송은 결정적 재거부라 세션이 refusal 루프에 갇힘.
- **우리 제안**: refusal을 model-switch-eligible 조건으로 분류하고 기존 `retry.fallbackChains` 재사용 (새 기구 발명 대신 분류만 수정). 동일 모델 재시도는 명시적 반대. 3단계 제안: 구조적 분류 → 클라이언트 폴백 → 서버 측 폴백 옵션 (docs/sum 2026-06-11 세션 기록).
- **업스트림 대응**: `bug, prio:p2` 트리아지 + 재현 확인. PR #2294 "fix(retry): fall back on Anthropic refusals" — 이슈 게시 후 당일 머지(2026-06-11T13:51Z, 머지 커밋 `0fa27b2af`), 이슈 동시 close(completed). docs/sum에 따르면 수정 PR은 게시 12분 만에 생성.
- **현재 상태 / 후속**: 완결. 현행 릴리스 v17.0.4에 포함 확인(`compare v17.0.4...0fa27b2af` = behind). 이후 타 사용자 이슈 #2750, #4210(open), #5881이 본 이슈를 cross-reference — 우리 측 후속 조치 불필요.

### #5691 — 세션 마커가 이메일만 표시, 동일 이메일 다중 org 구분 불가 (closed)

- **문제**: 동일 로그인 이메일로 두 Anthropic org(팀 시트 + 개인 Max)를 쓰는 구성에서 `/usage show`의 `in use by this session:` 마커가 이메일만 표시 → 이 세션이 어느 org 쿼터를 소비 중인지 판별 불가.
- **우리 제안**: 다른 표면(로그인 성공 메시지, `omp usage` 계정 목록)과 일관되게 org-qualified 표기(`<email> · <OrgName>`). 감사 범위를 3개 표면으로 명시(2개는 정상, 마커만 누락).
- **업스트림 대응**: PR #5692 "fix(usage): org-qualified session marker for same-email accounts" 머지(2026-07-17T03:52Z, `009dd9948`), 이슈 close(completed). v17.0.2(2026-07-17 발행)에 포함 확인.
- **현재 상태 / 후속**: 완결. **docs/sum에 세션 기록 없음** (아래 교차 검증 참조).

### #5701 — TUI usage 패널 라벨 24열 하드캡, org 접미사 절단 (closed)

- **문제**: #5691로 org 라벨이 생겼으나 TUI usage 패널이 이를 다시 절단. `resolveColumnWidth`가 터미널 폭과 무관하게 `BAR_WIDTH_MAX = 24`로 클램프하고, `truncateJobLabel`이 꼬리부터 자르므로 동일 이메일 계정의 유일한 구분자인 ` (OrgName)` 접미사가 정확히 잘려나감 (`command-controller.ts` 라인 실측 포함해 게시).
- **우리 제안**: ① 터미널 여유 시 24열 캡 해제(바 폭과 라벨 폭 분리) 또는 ② org-보존 절단(이메일 로컬파트 압축, `rae@e… (Team Org)`).
- **업스트림 대응**: PR #5703 "fix(tui): preserve organization suffixes in usage panel" 머지(2026-07-17T03:52Z, `99f2ffa03`), 이슈 close(completed). v17.0.2에 포함 확인.
- **현재 상태 / 후속**: 완결. **docs/sum에 세션 기록 없음**.

### #5960 — 클록리스 0% 윈도우에 스케일 비호환 drain 점수 (closed)

- **문제**: `#computeWindowRequiredDrain`(auth-storage.ts)이 리셋 클록 존재 시 `headroom / remainingHours`를 반환하지만 `resetAt` 미정의 시 **생(bare) `headroom`(0..1)으로 폴백** — 단위가 다른 값이 그대로 비교됨. 주간 윈도우가 막 리셋된 유휴 org가 점수 ≈ 1.0으로 클록 있는 바쁜 org(~22h 후 리셋, 먼저 소진해야 할 쪽)를 제침. `usage_history` 실측 타임라인 첨부해 게시.
- **우리 제안**: 클록리스 윈도우에 전체 duration 잔여를 가정해 점수 스케일 호환 유지.
- **업스트림 대응**: 게시 40분 만에 `bug, prio:p2, triaged` (docs/sum 2026-07-18 세션 기록). PR #5961 "fix(ai): normalize clockless usage drain ranking" — 우리 제안 그대로 반영, **머지 완료**(2026-07-18T19:06Z), 이슈 동시 close(completed).
- **현재 상태 / 후속**: 완결 (2026-08-03 재실측: 이슈 closed·PR merged). 잔여(선택): 포함 릴리스에서 리셋 직후 유휴 org 오착륙 소멸 로컬 확인.

### #5966 — 세션 크레덴셜 핀에 idle 게이팅 부재 (closed)

- **문제**: 세션이 마지막 사용 크레덴셜에 핀(`session:sticky:anthropic:<sessionId>`, 30일 TTL)되고 핀이 살아있으면 usage 기반 재랭킹을 무조건 생략. 생략의 근거인 프롬프트 캐시는 최대 1h TTL인데 skip 조건에 시간/유휴 요소가 전무 → 캐시가 소멸한 뒤에도 최대 30일간 보호 장치만 남아 다계정 로드밸런싱이 조용히 무력화.
- **우리 제안** (Suggestion 3항목): ① 핀 JSON에 `lastUsedAtMs` 기록 ② Anthropic 요청 유휴 1h 초과 시 재랭킹 ③ hoist를 orderPos tie-break로 강등.
- **업스트림 대응**: PR #5967 "fix(auth): gate session credential pin on prompt-cache idle window" — **3항목 모두 채택**. 추가로 우리의 PR 리뷰 코멘트를 받아 메인테이너가 비-Anthropic 회귀를 직접 재현 후 `provider !== "anthropic"` 게이트 커밋(`2625b92`) + Codex 불변 테스트 추가 (docs/sum 2026-07-18 세션 기록). **머지 완료**(2026-07-18T19:06Z), 이슈 동시 close(completed).
- **현재 상태 / 후속**: 완결 (2026-08-03 재실측: 이슈 closed·PR merged). 잔여(선택): 포함 릴리스에서 1h 유휴 세션 자동 재랭킹 로컬 확인.

### #6869 — usage-aware fallback에 명시적 유료 extra 분기 + 계정별 extra allowlist (open, proposal)

- **문제**: included 쿼터 소진 후 "이 모델을 유지하고 유료 extra를 허용, 단 지불 계정은 명시 선택"이라는 반대편 분기가 없음. extra 행(`anthropic:extra`)은 표시 전용 — drain 랭킹·proactive hard-block 어디에도 불참여. 프로덕션 사고(무캡 auto-reload org 계정에 의도치 않은 유료 사용 적립)가 동기.
- **우리 제안**: ① confirmed depletion(reserve 아님)에서만 fallback 모델 vs 유료 extra 계속의 2택 노출 ② 계정별 ordered allowlist(default-deny) ③ stale/미보고 크리덴셜은 유료 후보 제외(unknown ≠ 지불 허가) ④ 서버 캡 종속의 로컬 예산 가드(선택) ⑤ MVS: 소진→extra 전환 시점의 가시 알림.
- **업스트림 대응**: `@roboomp` 자동 트리아지 — 코드 참조 전제 검증 통과, reserve/depletion 구분 "the right cut", §3 불확실성 계약 "non-negotiable" 평가. `proposal` 라벨 — maintainer 설계 승인 전 구현 착수 없음 방침. 트리아지의 "결정점이 main에 없다"(#6392 미머지) 주장은 저자 정정 코멘트([5103095953](https://github.com/can1357/oh-my-pi/issues/6869#issuecomment-5103095953))로 철회됨 — turn-scoped 결정점은 v17.1.0부터 main에 실존.
- **현재 상태 / 후속**: open, maintainer 응답 대기. ① `accepted` 라벨/4문항 응답 추적 ② PR #6392 head 머지 여부(머지 시 시퀀싱 답변의 "상태 기반 명세" 그대로 적용) ③ 스키마는 #5281 결론 소비.

### #6870 — /auth 크리덴셜 인벤토리, /logout 피커와 크로스-프로바이더 동격 (open)

- **문제**: 저장된 크리덴셜 인벤토리의 읽기 전용 뷰가 없음 — `/logout` 피커(파괴적 UI의 뷰어 전용), `/session pin`(현재 프로바이더 OAuth 한정 선택기), `/usage`(usage report 있는 계정만) 모두 부분 표면.
- **우리 제안**: `/auth`(또는 `/auth list`) 읽기 전용 빌트인 — `/logout` 피커가 열거하는 저장소를 전 프로바이더·전 크리덴셜 타입으로 렌더.
- **업스트림 대응**: `@roboomp` 트리아지 — 실현성 인정(`listStoredCredentials()` 무필터 읽기 실존), 핵심 스코프는 backoff read-model(`#getCredentialBlockedUntil` private 상태), 계약 결정 6문항 나열, 공유 인벤토리 read-model formatter 권고, 중복 없음 재확인.
- **현재 상태 / 후속**: open, maintainer 응답 대기.

### #6898 — included 소진 시 extra 과금 pre-dispatch 알림 (open)

- **문제**: included 윈도우 소진 + extra enabled 계정은 429 없이 유료 초과분으로 계속 서빙 — TUI/headless 어디에도 신호 없음. #6869의 동기 사고를 직접 제거하는 최소 슬라이스.
- **우리 제안**: #6869 §5 분리분(트리아지 초대에 따름). 계약: 유료 전환 "감지"가 아니라 **pre-dispatch 경고**(fresh report + 동일 모델 included 풀 confirmed depleted + extra enabled). allowlist 스키마·depletion 분기 UI 불요.
- **업스트림 대응**: 게시 전 표적 중복검색 5쿼리 무매치. 라벨 `enhancement, providers, auth, ux, provider:anthropic, agent, triaged`.
- **현재 상태 / 후속**: open. #6869보다 독립적으로 선행 가능 — 트리아지/구현 착수 추적.

## 교차 검증 (docs/sum 대조)

- **계정 일치**: `gh api user` 실측 로그인 = `rae-hugo-kim`. 검색된 건 전부 이 계정 author — 계정 불일치 없음 (2026-07-18 5건, 2026-08-03 재실측 8건).
- **docs/sum 기록과 대조**:
  - #2290 — `session_2026-06-11_omp-refusal-issue-and-15.11-audit.md`에 게시 경위·PR #2294 추적 기록 있음. 일치.
  - #5960, #5966 — `session_2026-07-18_omp-credential-rotation-issues.md`에 게시·정정·PR 리뷰 기여까지 기록 있음. 일치. (세션 기록 시점엔 "둘 다 open, v17.0.4 미포함"이었고, 2026-08-03 재실측에서 둘 다 머지·close 완결로 갱신됨 — 위 상세 참조.)
  - **#5691, #5701 — docs/sum에 기록 누락**. 2026-07-16 게시분인데 같은 날짜의 `session_2026-07-16_v17-adaptation-r1-r4-convergence.md`에는 두 이슈에 대한 언급이 없음(관련 가능성 있는 흔적은 이월 항목 "usage 2행 HUD" 한 줄뿐). 두 건 모두 이미 해결·릴리스되어 실질 후속은 없으나, 세션 기록 관점의 공백임.
- **혼동 주의**: docs/sum의 이슈 #2~#14(gh-loop 레인)는 우리 하네스 레포 로컬 이슈로, 본 문서의 업스트림(can1357/oh-my-pi) 이슈와 별개.
