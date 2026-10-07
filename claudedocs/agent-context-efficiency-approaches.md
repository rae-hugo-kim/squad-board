# Agent Token-Efficiency Approaches — reference snapshot (2026-06-17)

> "이런 게 있었구나" 기록용. 에이전트가 코드/컨텍스트를 **읽는 비용**을 줄이는 세 레이어를 정리한다.
> 결론: **경쟁이 아니라 적층(stack)**. 싼 것부터: B(이미 켜짐) + A(공짜) → 잔여가 크고 프록시 리스크를 받아들일 때만 C.

## 세 레이어

```
A. 저작층(source)      코드를 요약-표면에서 읽히게 작성        ← author-time, 런타임 0
B. 하네스 네이티브      read 요약·range·search·artifact·RTK     ← 이미 내장, 한계비용 ~0
C. 전송층(transport)   LLM 앞단 압축 프록시/라이브러리(headroom) ← 런타임·의존성·trust 비용
```

같은 토큰 청구서를 서로 다른 레이어에서 깎는다. 직교 → 함께 쓰면 합산.

---

## A. 저작층 — agent-legible 코드 ("tidy for agents")

**무엇**: 함수 분해 · 좋은 이름 · 명시적 시그니처/상단 계약주석 · 지역성(응집) · 얕고 명시적인 제어흐름 · 정적성(런타임 이름생성·몽키패칭 회피) · 일관된 컨벤션.

**왜 토큰을 줄이나**: 에이전트 `read`는 **요약-우선**(시그니처 유지, 본문 `..`로 접힘) + **range 단위 재독**. 구조가 압축률을 결정 — 500줄 단일 함수는 요약이 `..` 한 덩어리(압축 0, raw로 다 읽음); 작은 명명 함수들은 요약이 곧 고신호 목차(본문 안 읽고 답).

| | |
|---|---|
| 장점 | 런타임 의존성·비용 0; 인간 가독성과 ~85% 정렬; **오해-재작업**(가장 비싼 토큰) 감소 |
| 단점/한계 | 내가 저작한 코드에만 효과(로그·JSON·3rd-party엔 무력); 포매팅·본문 내 주석·DRY-via-indirection은 중립~역효과; 인간-tidy와 가장자리에서 갈림(에이전트는 평평·명시 > 영리한 DRY) |
| 비용 | **author-time 규율뿐.** 런타임/토큰 오버헤드 0. |

**역효과 주의**: 공백/포매팅(요약이 본문 접으니 ≈0), 본문 내 주석(range 읽을 때 줄 수↑ = 세금), 간접층 추상화(정의 점프 hop마다 토큰).

---

## B. 하네스 네이티브 압축 (OMP가 이미 하는 것)

`read` 구조요약 · range 읽기(`:50-80`) · `grep`/`ast_grep` · `lsp`(타깃 컨텍스트) · `artifact://`(잘린 출력→원본 on-demand) · **RTK**(CLI 출력 재작성, `~/.claude/CLAUDE.md`에 등록).

| | |
|---|---|
| 장점 | 이미 존재, 추가 의존성 0; 사실상 무손실(언제든 range/artifact 재독 가능); 결정적 |
| 단점 | tool별(보편적 아님); 대화이력·임의 텍스트는 압축 안 함; 모델 기반보다 가벼움 |
| 비용 | 한계비용 ~0(내장). RTK = Rust 바이너리 1개. |

---

## C. 전송층 압축 레이어 (headroom 류)

**무엇**: 에이전트↔LLM 사이에 끼어 tool출력·로그·RAG·파일·대화이력을 모델 도달 전 압축. [headroom](https://github.com/chopratejas/headroom)(Apache-2.0, Python): AST `CodeCompressor`(Py/JS/Go/Rust/Java/C++) · JSON `SmartCrusher` · HF 텍스트모델 `Kompress-base` · `CacheAligner`(KV prefix 안정화) · **CCR(가역 — 원본 캐시, `headroom_retrieve`로 복구)** · cross-agent memory · `headroom learn`(실패세션 마이닝→CLAUDE/AGENTS.md 교정) · 출력토큰 절감(verbosity steering + effort routing). 모드: library/proxy/agent-wrap/MCP.

**친척**: RTK·lean-ctx(가벼움, CLI 출력만, 비가역) / Compresr·TokenCo(호스티드 API) / OpenAI compaction(provider 네이티브, 이력만). headroom은 RTK를 **번들·귀속**하고 그 하류 전부를 압축한다고 명시 → 이미 RTK 쓰는 환경의 상위집합.

| | |
|---|---|
| 장점 | 보편적(모든 콘텐츠, author-tidy 불가한 것 포함); 프록시로 언어 무관; **CCR 가역성이 손실 완화**; 최대 원시 절감(vendor 주장 60–95%) |
| 단점/리스크 | 벤치 전부 **vendor 자기보고·N=100·선택 워크로드**; **"same answers"가 load-bearing이자 최대 리스크** — 손실 압축이 *필요했던 한 줄*을 떨굴 수 있음(false-negative); **MITM 프록시가 critical path** = 운영 + trust 표면; 의존성/프로세스 추가; 가역 복구는 라운드트립 추가 |
| 비용 | **런타임**(추가 프로세스 + 지연 + 압축모델 컴퓨트) + 의존성/유지보수 + trust. 절감%는 높으나 정확도 리스크 동반. |

**참고로 둘 만한 수치(README)**: 코드검색 92% · SRE디버깅 92% · 이슈triage 73% · 코드베이스탐색 47%. GSM8K Δ±0, TruthfulQA +0.03(N=100). ★45k는 성숙도(REALIGNMENT/ 리팩터 진행 중) 대비 비정상 高 → 품질 아닌 hype 신호로 취급.

---

## 비교 요약

| 접근 | 레이어 | 절감 | 런타임 비용 | 의존성/운영 | 손실 리스크 | 인간에도 이득 |
|---|---|---|---|---|---|---|
| A tidy 저작 | source | 중(요약 충실도↑) | 0 | 0 | 없음 | ✅ |
| B 하네스 네이티브 | tool | 중 | ~0 | 0(내장) | ~0(재독 가능) | 중립 |
| C headroom 류 | transport | 高(60–95% 주장) | 有(프록시+모델) | 有(프로세스+trust) | **有**(완화=CCR) | 간접 |

## Takeaways
- **싼 것부터**: B는 이미 켜짐, A는 공짜(하라). C는 **잔여 토큰(로그·이력·3rd-party 덤프)이 크고** 프록시 운영·trust 리스크를 감수할 때만.
- **가장 비싼 토큰 = 오해-재작업** → A가 직접 겨냥(첫 읽기에 맞게 이해되는 코드).
- **의존성 없이 C 아이디어만 훔치기**: CCR(가역 캐시+retrieve ≈ `artifact://` 일반화) · `headroom learn`→AGENTS.md(≈ 자율화 Q1 breadcrumb / Q11 instinct 학습의 prior art).
- 이 레포엔 **반사적 도입 비권장**: 네이티브+RTK가 싼 절감 대부분 포착, MITM 프록시를 load-bearing 경로에 넣는 ROI 대비 비용 큼.

---
출처: 2026-06-17 세션 논의 · `github.com/chopratejas/headroom` README(fetch 2026-06-17) · RTK(`~/.claude/CLAUDE.md`).
