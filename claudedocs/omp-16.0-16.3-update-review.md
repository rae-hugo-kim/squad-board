# OMP 16.0.1 → 16.3.4 업데이트 검토 (릴리즈 전수 대조)

> 작성: 2026-07-03 · 기준선: 하네스 `omp/16.0.1`(2026-06-16 업그레이드, [omp-15.11-upgrade-prep.md](omp-15.11-upgrade-prep.md)) → 설치본 `omp/16.3.4`(npm latest 교차확인)
> 자료: GitHub 릴리즈 API 전수 51건 + 릴리즈가 삭제된 v16.2.10·v16.3.1은 소스 `packages/coding-agent/CHANGELOG.md`로 보충 = **53개 버전 본문 전수 스캔** (각 릴리즈 Full Changelog 비교 링크로 연속성 검증).
> **결론: 하네스(게이트/확장)를 깨는 변경 없음.** 게이트 스위트 302/302 통과, docs-drift 0 errors. 실질 수정 대상은 v16.2.0 도구 개명의 문서 잔재와 frontmatter 2건이었고 아래 §1에서 반영 완료.

## 1. 이 저장소에 적용한 수정 (2026-07-03)

| # | 파일 | 변경 | 근거 |
|---|---|---|---|
| C1 | `rules/mcp_policy.md` · `.omp/skills/{grepai-search,kickoff,startdev}/SKILL.md` · `claudedocs/agent-context-efficiency-approaches.md:36` | 프로즈 도구명 `search`→`grep`, `find`→`glob` | v16.2.0 개명은 **설정만** 자동 이전 — 문서/지침은 대상 아님. 모델의 도구 인벤토리는 `grep`/`glob`만 노출되므로 지침-인벤토리 불일치 제거 |
| C1 | `.omp/agents/adversary.md:6` | `tools: … find` → `… glob` | 소스 확정: `builtin-names.ts`의 `LEGACY_BUILTIN_TOOL_NAME_ALIASES`(find→glob, search→grep)가 frontmatter enable-list에 적용되어 **런타임 무손실이었음** — 수정 목적은 비문서화 레거시 alias 의존 제거 |
| C2 | `.omp/agents/verifier.md:5` | `disallowedTools: Write, Edit`(무효 필드) → `tools: read, bash, grep, glob, lsp` | OMP frontmatter 스키마(`omp://task-agent-discovery.md`)에 `disallowedTools` 없음 → read-only가 프로즈로만 유지되던 상태를 화이트리스트로 강제 (`yield`·`irc`는 자동 추가됨) |
| C3 | `templates/github-workflows/gh-loop.yml:86` | 예시 `omp run --headless --skill gh-loop "…"` → `omp -p "/skill:gh-loop …"` | `run`/`--headless`/`--skill`은 현행 CLI에 없음 (`-p/--print`, `/skill:<name>` 프롬프트 토큰) |
| G1 | `.omp/extensions/harness/index.ts` `editTargets()` | hashline `edit` 타깃에 native `event.input.paths`(≥16.1.17) 병합, `[path#TAG]` 정규식은 구버전 폴백으로 유지 | v16.2.0 신설 `MV DEST`는 헤더에 안 나타나는 유일한 타깃 — native 리스트만 이를 운반 가능. 신규 `tests/edit-targets-wiring.test.mjs`(3 어서션: 코드 구조·순서 검증) |

검증: `node --test tests/*.test.mjs` **302/302** · `scripts/docs-drift` **0 errors, 0 warnings** (omp/16.3.4 설치 환경).

## 2. Breaking / 이름 변경 — 인지 필요

| 버전 | 변경 | 우리 영향 |
|---|---|---|
| 16.2.0 | 도구 `search`→`grep`, `find`→`glob` (설정 키만 자동 이전, 레거시 alias는 잔존하나 비문서화) | §1 C1로 정리 완료 |
| 16.3.1 | `grep`/`glob`/`ast_grep`의 `paths` 배열 → 단일 `path`(세미콜론 리스트). **`ast_edit`은 `paths` 유지** | 저장소 참조 0건 — `index.ts`의 `ast_edit` 처리 무영향 |
| 16.1.16 | `eval` 단일 셀(`{language, code, …}`) — `cells` 배열 제거 | 참조 0건 |
| 16.1.2 | search(현 grep) 파라미터 `i` → `case` (의미 반전: case-**sensitive**) | 참조 0건 |
| 16.2.9 | 빌트인 quick_task→**sonic** 개명 · **oracle 제거** · **Tester 신설** | 참조 0건. Tester는 위임 카탈로그에 추가 고려 가치 |
| 16.0.3 | `render_mermaid` 도구 **제거** → ```` ```mermaid ```` 펜스를 터미널이 ASCII 네이티브 렌더 (16.1.23 `tui.renderMermaid` 토글) | 참조 0건. v16.0.1 대비 빌트인 도구 diff는 개명 2 + 이 제거 1이 전부 — 신규 빌트인 0 |
| 16.1.14 | `readHashLines` 설정 제거 (`edit.mode: hashline`이 단일 스위치) | 참조 0건 |
| 16.2.7 | 전역 `serviceTier`/`fastModeScope` → `tier.openai`/`tier.anthropic`/`tier.google` | 전역 config 미사용 |
| 16.2.12 | canonical-equivalence 레이어 제거 (`models.yml`의 `equivalence` 키 무력화) | models.yml 미사용 |

## 3. 스킬 × 신기능 간섭 매트릭스 (15종)

| 스킬 | 간섭/변화 | 판정 |
|---|---|---|
| gh-loop · gh-fanout | `/skill:<name>` 미드-프롬프트 인식 + 자문완성 draft 보존(16.2.11) → 워커 지시문 합성 안정 ↑. GH Actions 예시 CLI는 §1 C3로 현행화. guard(`write+`/bot 제외/no-auto-merge) 로직은 OMP 버전 독립 | 무해(개선) |
| compush · compr | commit-gates 경로 불변. bash Ctrl+Z/job-control 행 픽스(16.1.20, 16.2.0)·동시 bash 상호-킬 픽스(16.2.11)로 안정성 ↑. 16.1.23 in-process `rm`/`mv` 빌트인이어도 destructive-guard는 **커맨드 텍스트**를 스캔하므로 탐지 불변. 16.2.10 git 환경변수 스트리핑 픽스는 무해 | 무해 |
| grepai-search | (a) 16.1.14 특수도구 강제 프롬프트 완화 + 16.2.8 bash search/grep/ls/find 제약 완화 → bash로 도는 `grepai` CLI 실행 마찰 ↓ (긍정적). (b) 라우팅 표 도구명 §1 C1 반영. 트라이얼 킬 기준(트리거 3회) 불변 | 무해(개선) |
| kickoff | `ask` 도구 불변(16.1.17 Windows 입력 픽스). `glob`은 mtime 최신순 기본 정렬 — "최신 브레인스토밍 먼저" 요구와 정합 | 무해 |
| startdev | 도구명 반영 외 무영향 (TDD 게이트는 하네스 자체 소유) | 무해 |
| sum | breadcrumb-tracker/surface 배선 불변. 16.3.3 session_stop 지연은 미사용 이벤트 | 무해 |
| migrate · harness-check · bootstrap · init | `harness/*` 태그 결합 — OMP 코어 버전 독립 | 무해 |
| brainstorm · receiving-code-review · design-mockup | 프로즈 중심. design-mockup의 `browser`는 16.1.10 `ariaSnapshot` 추가·16.1.11 타임아웃 명명 에러화 등 개선만 | 무해(개선) |

에이전트 정의(스킬 아님): 16.2.11 "frontmatter `thinkingLevel`이 modelRoles 접미사에 덮이던 버그" 픽스 → adversary(`thinkingLevel: high`)가 의도대로 동작. 16.2.3+ typed-yield/output-schema 픽스 계열은 스키마 미사용이라 무관.

## 4. 인지 못 했을 가능성이 높은 업데이트 (운영 하이라이트)

### 도구/편집
- **hashline `REM`(파일 삭제)·`MV DEST`(이동/리네임) op** (16.2.0) — 에이전트가 edit 도구로 파일을 지우고 옮길 수 있음. 하네스 갭은 §1 G1로 흡수(잔여 확인은 §6).
- 16.1.23 bash **in-process coreutils** — `cat/head/tail/wc/sort/uniq/ls/find/grep/mkdir/rm/mv`가 fork 없이 셸 내부 실행.
- **`ssh://host/path`** 를 `read`/`grep`/`write`가 직접 지원 (16.2.0).
- 16.1.23 plan-mode에서 markdown **헤딩 = 블록**(`SWAP.BLK`가 섹션 전체 해석) 가이드.
- `edit.citationTags` (16.2.3, 기본 off) — 켜면 모델-facing 헤더가 citation 마커로 감싸짐. **켜기 전** 하네스 `HASHLINE_HEADER` 정규식과의 상호작용 확인 필요(§6).

### 세션/컴팩션
- **snapcompact가 기본 auto-compaction 전략** (16.1.8) · `/compact soft|remote` 서브커맨드(16.0.11) · `compaction.midTurnEnabled`(16.1.23) · **Remote Compaction V2 스트리밍** 기본화(16.2.3, codex 계열 16.2.13).
- `/resume <session-id>`(16.1.23) · `/move <dir>` — 세션·아티팩트 디렉토리 이전(16.2.4).
- **CJK 히스토리 렌더 픽스**(16.2.7, 16.3.0) — 반복 컴팩션 시 한국어 텍스트 깨짐 해결. 한국어 세션 직접 해당.
- 16.3.0 세션 로딩 대폭 고속화(스트리밍 JSONL 파싱) · signed thinking 블록 보존(HTTP 400 재발 방지).

### 서브에이전트/오케스트레이션
- 16.2.9 **Tester**(고신호 테스트 저작 전용) · **sonic**(구 quick_task) — 위임 시 이름 주의.
- 16.3.0 `task.softRequestBudgetNotice` — soft budget 랩업 알림 온/오프 (prep 문서 C표의 "reviewer가 잘리면 상향" 항목에 새 손잡이).
- 16.1.17 `task.maxConcurrency: 0` = 무제한 픽스 · 16.2.5 isolation worktree 경로 컴팩트화 · 16.3.2 isolated 머지 `git apply --3way` 폴백.
- **16.1.20 task/smol/advisor 역할이 `retry.fallbackChains.default`를 상속** — 전역 `["gpt-5.5"]` 체인이 서브에이전트에도 적용: adversary(gpt-5.5)는 동일모델이라 no-op, Claude 계열 서브에이전트는 refusal/공급자 오류 시 GPT로 폴백 가능 → **reviewer 3-pass의 이종성 전제가 폴백 중엔 일시 약화**될 수 있음(인지만; review-gate het 증거는 실측 기반).
- **refusal 네이티브 처리** (16.2.0, 픽스 4건): refusal이 대화 컨텍스트에 잔류/재생되지 않음 — 전역 fallback 체인의 원 도입 사유(#2290/#2294, prep 문서 §D)는 해소. 체인은 폴백 용도로 유지 무해.

### 모델/요금 — Fable 사용자 직접 해당
- **16.3.4**: Anthropic OAuth 계정 로테이션이 **Fable/Mythos 주간 캡을 하드블록에서 제외**(랭킹 힌트로만 사용, 429 시 반응적 폴백 유지) + `omp usage`가 미보고 스코프 버킷을 `not reported`로 명시.
- Devin 프로바이더에 Claude 5 Fable 변형(16.3.4) · GPT-5.5 카탈로그 정식화(16.1.14) · Baseten 프로바이더(16.3.4).
- 패밀리별 서비스 티어 `tier.*` + `/fast` 스코프(16.2.7).

### 메모리 — mnemopi 백엔드 사용 중
- `mnemopi.proactiveLinking` 설정화(16.1.8, 기본 off — 환경변수만 있던 것) · retention 임베딩 입력 캡(16.1.8) · 자동 retain이 **user 턴만** 추출(16.1.17, assistant 프로즈 오염 방지) · 16.3.4 empty structured extraction 보존 픽스.

## 5. 하네스 무영향 확인 (감사 증거 요약)

- 확장 API 표면 — `pi.on(tool_call|tool_result|before_agent_start|session_start)`, `{block, reason}`, `{message:{customType,…}}`, `ctx.cwd/hasUI/ui.notify/sessionManager.getBranch` — 53개 버전에서 제거/개명 **0건**.
- bash exit 계약(`isError`/`details.exitCode`) 불변. 16.2.12 신설 `extensionHandlerTimeoutMs` 기본 30s > 하네스 내부 예산(게이트 3s / commit-gates 10s / version-check 15s).
- ast_edit preview→`resolve` apply 추적 경로(`details.applied`, `details.sourceToolName`) 불변 (16.1.4는 resolve 게이트 드레인 픽스 — 유리한 방향).
- 컴팩션 요약 텍스트를 파싱하는 하네스 코드 없음 → 컴팩션 대격변 무영향 (prep 문서 §A-3 그대로 유효).
- 모델 셀렉터: `gpt-5.5` 존속, `opus` 별칭 유효, 전역 primary는 `claude-fable-5:xhigh`.

## 6. 후속 항목

- [ ] **라이브 스모크**: 이 repo에서 신규 세션 부팅 후 MV op 포함 hashline edit 1회 → `.omp/harness-state/read-log.txt`에 **DEST 경로**가 기록되는지 확인 (`event.input.paths`의 MV DEST 포함 여부 실증 — 릴리즈 노트만으론 미확정). 미포함이어도 fail-safe(DEST 편집 전 재읽기 강제)로 잔존하므로 수용 가능.
- [ ] main 랜딩 후 `scripts/harness-version-bump.sh` 1회 발행 → 파생 프로젝트에서 `/skill:harness-check` 전파.
- [ ] `edit.citationTags`를 켤 경우 `HASHLINE_HEADER` 정규식·read-log 경로 재검 (현재 off — 이슈 없음).
- [ ] (doc-convention/mdbook 세션과 조율) 이 문서의 INDEX 등록은 한 줄 append로 최소화 — 컨벤션 개편 시 재배치 대상.
