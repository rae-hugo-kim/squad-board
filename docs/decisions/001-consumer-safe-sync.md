# 001 — 소비 리포 안전 sync 계약: 테스트 동반 동기화 · fetched 스크립트 hand-off · 소비자 확장 공간 · 객체 저장소 기반 provenance 면제

- 결정일: 2026-09-05 (harness/2026.74, 후속 2026.75)
- 상태: 확정
- 원천: 이슈 #17 #24 #26 #27 #28, `docs/harness/handoff_2026-09-02_sync-commit-gates.md`, 커밋 `4cdf53b`·`3a09639`, 리뷰 `docs/reviews/review-2026-09-05-035044.json`(3-pass ×4), 세션 기록 `docs/sum/session_2026-09-07_fable51-consumer-safe-sync-2026.75.md`

## 결정

`init`으로 시작한 소비 리포가 `harness-check`를 계속 받아도 깨지지 않도록 sync 계약을 다음 네 가지로 고정한다.

1. **게이트 테스트는 게이트와 같은 태그로 도착한다.** `tests/*.test.mjs`를 `.omp/extensions/harness/tests/`로 옮겨 기존 화이트리스트 항목(`.omp/extensions/harness`)에 포함시킨다. 소스 전용 자산(`scripts/docs-drift`)에 의존하는 테스트는 소비 리포에서 skip한다.
2. **sync는 fetch한 태그의 `harness-sync.sh`에 실행을 넘긴다.** 로컬(구버전) 스크립트는 clone까지만 하고 자식 `bash`로 fetched 스크립트를 실행한다 — 화이트리스트는 페이로드와 같은 버전이 적용된다. tmp의 수명은 부모가 소유하고 자식은 어떤 삭제도 하지 않는다.
3. **소비자 확장 공간은 화이트리스트 밖이다.** `.omp/rules/`, `.omp/RULES.md`, `.omp/AGENTS.md`, 커스텀 `.omp/agents/*.md`·`.omp/skills/<name>/`, `docs/`. 화이트리스트의 디렉터리 항목(`rm -rf`+복사)은 하네스 소유 디렉터리만 허용하고, 공유 디렉터리(`.omp/agents`, `docs/rules`)는 파일 단위로 열거한다. 동기화되는 문서는 화이트리스트 밖을 상대 링크하지 않는다.
4. **순수 sync 커밋의 게이트 면제는 리포 객체 저장소만 신뢰한다.** sync가 태그 체크아웃의 화이트리스트 경로를 blob/tree 객체로 써 넣고 `refs/harness/<ver>`(최신 2개 유지)로 고정한다. `risk-assess`는 (a) 경로가 하네스 자산 경로이고 (b) manifest가 **가장 높은** ref를 지목하며 `tree_sha`가 일치하고 (c) 커밋될 항목의 blob **및 mode**가 그 tree와 같을 때만 파일을 채점에서 제외한다. 삭제는 직전 tree에 있던 경로를 HEAD가 그대로 갖고 있다가 현재 tree에서 사라진 경우만. 나머지 파일만 위험도를 결정한다.

> 정정 (2026-09-23, 이슈 #35): 3항의 확장 공간 중 `.omp/AGENTS.md`는 sync가 건드리지 않는다는 점은 그대로지만 **권장 확장점에서 제외**한다. 실측상(omp 18.1.14/18.2.5) native `.omp/AGENTS.md`(priority 100)는 내용이 있으면 같은 depth의 루트 `AGENTS.md`를 대체해 하네스 정책을 통째로 지운다. 프로젝트 배경은 `.omp/rules/<project>-context.md`(`alwaysApply: true`)로 두고, `harness-version-check`가 세션 시작 시 비어 있지 않은 `.omp/AGENTS.md`를 `HARNESS POLICY SHADOWED`로 경고한다. `.omp/RULES.md`는 user `RULES.md`와 함께 로드됨을 같은 날 실측해 확장점으로 유지한다.

## 검토한 대안과 기각 사유

| 대안 | 기각 사유 |
|---|---|
| 테스트 파일을 화이트리스트에 개별 열거 | 파일 추가·개명마다 목록 관리, #24류 누락 재발 |
| `rules/`가 링크하는 `docs/` 대상을 화이트리스트에 추가 | `docs/`는 소비자 공간 — 하네스 파일을 밀어넣게 됨. 링크 대신 본문 흡수 |
| sync 2회 자동 실행(#24) | 네트워크 2배, 근본 해결 아님 |
| 게이트 우회 A: sync가 override 파일을 자동 생성 | 사용자 코드가 같이 스테이징돼도 통과 — 우회 경로 |
| 게이트 우회 D: #17만 해결 | review-gate는 여전히 차단 |
| manifest 파일 맵을 신뢰 | 워크트리 파일 — 위조하면 `src/auth.ts`도 면제 (1차 리뷰 HIGH, 재현됨) |
| 태그를 소비 리포에 fetch | shallow clone에서 `shallow roots are not allowed to be updated` |
| 삭제 면제를 "직전 tree 멤버십"만으로 판정 | 소비자가 편집한 사본의 삭제가 면제됨 (3차 리뷰 medium) → HEAD 항목 == 직전 항목 조건 추가 |
| 고아 커밋을 가리키게 된 `harness/2026.74` 태그 강제 이동 | 이미 sync한 리포에 DRIFT 유발 — 다음 버전 발행으로 대체 |

## 근거

- 소비 리포 실측(2026-09-02): init 생성 3/3에 `scripts/docs-drift` 복사, 훅 비활성 9/10, chats에서 2026.73 sync 커밋이 backpressure+review 게이트에 상시 차단(테스트 24/328 stale 실패)
- 4회 3-pass 리뷰(FAIL→FAIL→PASS w/ NOTES→PASS w/ NOTES)가 잡은 HIGH 2건은 모두 "신뢰 근거가 호출자가 쓸 수 있는 곳(워크트리·env)에 있다"는 같은 형태
- 픽스처 검증: 순수 sync 커밋이 실제 `.githooks/pre-commit`을 override 없이 통과하고 `harness_sync` audit이 남으며, 150줄 사용자 코드·편집본·mode 변경·위조 manifest·다운그레이드·소비자 파일 삭제는 전부 채점됨 (`.omp/extensions/harness/tests/harness-sync.test.mjs`)

## 트레이드오프

- 소비 리포의 **첫** sync(2026.74로 올릴 때)는 구 스크립트가 돌아 hand-off·provenance 기록이 없다 → 그 1회만 `harness-check` 2회 실행. 이후 1회
- `refs/harness/*`와 객체가 소비 리포 `.git`에 쌓인다(최신 2개 유지; `push --follow-tags` 대상 아님)
- 위협 모델은 "성급한 에이전트"다. 객체를 직접 쓰고 ref를 옮기는 회피자는 비목표(문서화된 잔차). SHA-256 object-format 리포는 fail-closed
- 잔존 소스 전용 자산(`claudedocs/CLAUDEKR.md` 등)은 sync가 지우지 않고 파일 단위 advisory만 — 삭제는 수동

## Revisit Triggers

- 소비 리포가 `.omp/extensions/harness/tests`를 자기 테스트 러너 glob에 섞어 돌리기 시작할 때 → 러너 격리 필요
- SHA-256 object-format 리포를 소비자로 받아야 할 때
- `refs/harness/*` 위조가 위협 모델에 들어올 때 (서명·서버측 검증 필요)
- 화이트리스트에 새 공유 디렉터리가 필요해질 때 → 파일 단위 열거 원칙 유지 여부
