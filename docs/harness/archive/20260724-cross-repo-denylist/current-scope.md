# Scope — cross-repo-commit-gate-attribution (20260724)

세션 중 스코프 자기탐지(L1)로 기록. 근거는 각 항목의 검증 산출물.

## Acceptance Criteria

- [x] AC1 크로스레포 귀속 4분면 — tests/git-commit-detect.test.mjs + tests/commit-gates.test.mjs, 102/102 통과
- [x] AC2 역방향 봉쇄 배포형 증명 — consumer 픽스처(전체 하네스 복사) → harness 타겟(critical staged+UNKNOWN) 커밋 시 타겟 상태로 exit 2, 해시가 타겟 `git diff --cached`에서 산출됨 (verifier 독립 재현 포함)
- [x] AC3 vault 플로우 — 사전체크가 `realpath` 출력 → 커밋 호출이 **리터럴 경로**로 핸드오프: 리터럴 형태 exit 0(`no harness … Gates skipped`), 동적 `${…}`/`$VAULT` 형태는 BLOCK + realpath 안내 (실 sum-vault 스모크 + 통합 테스트)
- [x] AC4 우회면 봉쇄 — 마커 staged-delete(worktree∪index∪HEAD 3중판정, statSync 의미론)·unborn-HEAD·비존재 타겟 BLOCK·amp/bash-c/wrapper-chdir(+glued)/command·builtin cd/지속 GIT_* env(export·단독 대입, command/builtin/reserved 프리픽스 포함)/GIT_CONFIG_* env/symlink+`..` 물리 귀속(git 실측 동등성 단언) 전부 테스트 고정
- [x] AC5 스킬 갱신 — sum(사전체크 realpath 출력 + 리터럴 핸드오프), gh-fanout(PI_AUTO_QA=0), compush(커밋/푸시 분리 — standalone 규칙)
- [x] AC6 config 갱신 — ~/.omp/agent/config.yml: modelRoles.task + fallbackChains["openai-codex/*"], PyYAML 파싱 정상 + `omp models` 기동 확인
- [x] AC7 회귀 없음 — 신규 게이트 테스트 102/102 + 기존 자식 스위트 132/132 (합계 234/234; archive-guard의 GIT_CONFIG_GLOBAL=/dev/null 중화 픽스처는 ambient 면제로 정합)
- [x] AC8 consumer 8개 정본 복원 — blogger·chats·hgj·highgrowcp·QoverwRap·siksa·ajoshplayer(자기 HEAD 복원), Copybara(meta 태그 harness/2026.64 복원), 태그 대조 감사 완료. **한계**: 복사 전 미커밋 워크트리 상태는 미캡처 — 증명 범위는 '추적 정본으로의 복원'까지, 해당 2파일의 사전 로컬 수정이 있었다면 소실(잔여 불확실성, 동기화 자산 특성상 위험 낮음)
- [x] AC9 standalone-commit 강제 — **관할-skip 대상 포함 전 경로**에서 커밋은 단독 호출만 허용(동반 명령·출력/선행 리다이렉션·`$(…)`/`<(…)` 치환·백그라운드 `&` 금지; 동반 명령이 skip 판단 자체를 재지정할 수 있으므로 면제 없음), 리뷰 재현 케이스(foreign `add && commit` pre-state) 테스트 고정, sum(4단계 분리)/compush(커밋·푸시 분리) 스킬 갱신
- [x] AC10 2차 리뷰 회귀수정 — **-C 리터럴-only**(동적 확장 지원 제거: shadow/quote/escape/중첩 default 클래스 근절), xargs 동적 argv unverifiable/unresolved, --bare·-c include.* 재지정 분류, backslash 토크나이저 bash 정합 폴딩, ambient GIT_* 차단(/dev/null 중화 면제), index.ts 외부 경계 fail-closed
- [x] AC11 3·4차 리뷰 처분 — 출력/선행 리다이렉션 은닉({fd}>x 변수-fd 포함), dq-backslash bash 정합(비특수 이스케이프 보존; `\`+**LF만** 라인연속 제거, `\`+CRLF는 bash처럼 3바이트 보존 — 실측 5c0d0a), standalone 최우선(skip-order 역전 봉쇄), wrapper option-value shadow 일반형(프로그램 후보 전수+모호성 unresolved), `+=` 대입, `$(…)` 치환 전면 봉쇄(글루드 `x$(…)`·`/tmp/$(x)` 포함 — raw 거부 + substShredValue 연속스캔), process substitution 거부, background `&`(코멘트/개행 동반 포함 — lexSegments meta), 외부 경계 clean-verdict pure helper(`gate-verdict.mjs`) 단위테스트, 세션 toplevel 프로브 실패 fail-closed, GIT_CEILING_DIRECTORIES ambient, brace 리터럴 보존 — 전부 테스트 고정. 잔여(문서화): index.ts 핸들러 통합테스트 부재(판정 로직은 helper로 검증), 스캐너 중복 drift(유지보수 노트)
- [x] AC12 4차 마감 리뷰 5계열 처분 — (1) 글루드 출력 리다이렉션(`-m x>tracked`)·quoted `->` 허용: raw quote-aware `hasUnquotedOutputRedir`로 전환, (2) 이스케이프 공백+`#`(`foo\ #bar &`): lexSegments 주석 판정에 UNESCAPED 공백 조건 — background `&` 가시화, (3) unquoted `\`+CRLF: bash 정합(이스케이프된 CR + LF 분리 — join 특례 제거, 뒤 커밋 가시성 회복), (4) 치환 은닉 커밋(`echo "$(git commit)"`·`<(git commit)`): `isCommitSuspect` 휴리스틱으로 index.ts·디스패처 양쪽 프리게이트 fail-closed, (5) bash 툴 구조화 입력: `cwd`는 실행 기반으로 귀속(동일 attribution 흐름), `env`의 GIT_* 주입 BLOCK, `async` 커밋 BLOCK, bash-커밋 경로 어댑터 예외 fail-closed(전용 catch) — 전부 테스트 고정(단, index.ts 핸들러 자체는 omp 헤드리스 로드 스모크로 검증)
- [x] AC13 5차 리뷰 blocker 처분 — (1) 동적 subcommand(`git $SUBCOMMAND`)·간접 executor(`eval`, `env -S`, 동적 `bash/sh -c`)는 command+구조화 env를 함께 보는 `isCommitSuspect` 프리게이트로 BLOCK, (2) 구조화/inline 실행환경 `PATH`·`HOME`·`XDG_CONFIG_HOME`·shell startup·`GIT_*`·dynamic linker 변경은 gate/Git 의미 불일치로 BLOCK(작성자/커미터 메타데이터만 허용), (3) `setsid -f/--fork`는 `-w/--wait` 없으면 비동기 detach로 BLOCK — 단위·디스패처 통합테스트 고정, 102+132=234 통과, gate 구문검사 및 OMP `LOADOK` 스모크 통과

## Out of scope

- consumer 실배포 — 승인된 commit + `harness/*` 태그 발행 후 각 레포 `scripts/harness-sync.sh` 공식 경로
- `env --chdir` 타겟의 정적 해석(fail-closed로만 처리); `case … esac` 패턴 본문과 이전 호출에서 만든 함수/환경을 통한 동적 실행은 정적 모델 밖 gap

### 이관(별도 kickoff, 사용자 결정 2026-07-24)
- 집행 경계의 `.githooks/pre-commit` 이전 — 실제 index 확정 시점 판정(같은-호출 상태변경의 근본 해소), 사람 커밋 게이트 포함. 이번 standalone-commit 규칙은 그 전까지의 정적 모델 내 보완
- 정적 모델 밖 문서화 gap: 이전 호출의 함수 정의/`export` 지속(크로스-콜 드리프트), gate→git TOCTOU 창, wrapper 옵션 arity 완전 모델링(후보 전수+모호성 fail-closed로 대응)
