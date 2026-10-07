# 작업 라이프사이클 — 하네스 기반 전체 흐름

> Generated: 2026-04-24 | Harness v2026.7

## 1. 전체 흐름 (한눈에)

```mermaid
flowchart TD
    START([세션 시작]) --> HVC[harness-version-check<br/>하네스 드리프트 확인]
    HVC --> USER_INPUT[사용자 요청 입력]
    
    USER_INPUT --> KD{kickoff-detector<br/>새 작업인가?}
    KD -->|새 작업 감지| KICKOFF[킥오프 단계<br/>scope·AC·seed.yaml 정의]
    KD -->|기존 작업 계속| PLAN[계획 단계]
    KICKOFF --> PLAN
    
    PLAN --> IMPL[구현 단계]
    
    IMPL --> EDIT{edit/write 시도}
    EDIT --> CG{context-gate<br/>파일 열람했나?}
    CG -->|미열람| BLOCK_CTX[❌ 차단<br/>먼저 read]
    CG -->|열람됨| DO_EDIT[✅ 편집 실행]
    
    DO_EDIT --> READ_TRACK[read-tracker<br/>열람 기록 갱신]
    READ_TRACK --> MORE{더 구현할 것?}
    MORE -->|Yes| IMPL
    MORE -->|No| VERIFY_PHASE

    subgraph VERIFY_PHASE[검증 단계]
        TEST[빌드/테스트 실행] --> BP_TRACK[backpressure-tracker<br/>PASS 기록]
        BP_TRACK --> REVIEW[reviewer 호출<br/>3-pass 적대적 리뷰]
        REVIEW --> REVIEW_DOC[docs/reviews/ 기록]
        REVIEW_DOC --> VERIFIER[verifier 호출<br/>AC/하네스 검증]
    end

    VERIFY_PHASE --> COMMIT{git commit 시도}
    
    COMMIT --> AG{acceptance-gate<br/>AC 충족?}
    AG -->|미충족| BLOCK_AC[❌ 차단<br/>AC 미완료]
    AG -->|충족| BG{backpressure-gate<br/>테스트 통과?}
    BG -->|risk=low 문서만| SKIP_BP[통과]
    BG -->|risk≥medium 미통과| BLOCK_BP[❌ 차단<br/>테스트 먼저]
    BG -->|PASS| RG{review-gate<br/>리뷰 상태?}
    SKIP_BP --> RG
    RG -->|risk=low| SKIP_RV[통과]
    RG -->|risk≥high 리뷰 없음| BLOCK_RV[❌ 차단<br/>리뷰 먼저]
    RG -->|리뷰 PASS| COMMIT_OK[✅ 커밋 성공]
    SKIP_RV --> COMMIT_OK
    
    COMMIT_OK --> DONE([완료])
    DONE -.->|발행 기준 충족 시 수동 1회, 자동 아님| BUMP[harness-version-bump<br/>버전 범프 + 태그]

    BLOCK_CTX --> IMPL
    BLOCK_AC --> IMPL
    BLOCK_BP --> TEST
    BLOCK_RV --> REVIEW

    style VERIFY_PHASE fill:#0f3460,stroke:#16213e,color:#eee
    style BLOCK_CTX fill:#8b0000,color:#fff
    style BLOCK_AC fill:#8b0000,color:#fff
    style BLOCK_BP fill:#8b0000,color:#fff
    style BLOCK_RV fill:#8b0000,color:#fff
    style COMMIT_OK fill:#006400,color:#fff
```

## 2. 단계별 상세

### 2.1 세션 시작

```
사용자가 OMP 세션을 시작
  → [session_start] harness-version-check 실행
    → 로컬 하네스 버전 vs 리모트 최신 태그 비교
    → 드리프트 있으면 알림 (24시간 캐시)
  → 시스템 프롬프트에 AGENTS.md 로드
    → Agent Routing Policy, MCP Policy 등 활성화
```

여기서 결정되는 것: 메인 에이전트가 어떤 규칙 체계 아래에서 동작하는지.

### 2.2 킥오프 (새 작업 감지 시)

```
사용자: "새 결제 기능 만들어줘"
  → [before_agent_start] kickoff-detector가 패턴 감지
    → "새 기능" 키워드 + kickoff-done 파일 없음
    → advisory: "킥오프 먼저 하세요"
  
  → 메인 에이전트가 사용자와 대화형 인터뷰
    → Goal, Constraints, AC, Out of Scope, Assumptions 정의
    → docs/harness/seed.yaml 생성
    → docs/harness/kickoff-done 생성
```

여기서 결정되는 것:
- **acceptance-gate**가 참조할 AC 체크박스
- 이후 모든 게이트의 판단 기준

### 2.3 계획

```
메인 에이전트가 구현 계획 수립
  → 복잡하면 OMC planner 활용 가능
  → 외부 정보 필요하면 web_search/explore 직접 수행
  → DB 스키마 확인 필요하면 Supabase MCP 직접 조회
  
  이 단계에서는 edit/write를 안 하므로 게이트에 안 걸림
```

### 2.4 구현

```
메인 에이전트 또는 범용 Opus 서브에이전트가 코드 작성

파일을 편집하려면:
  1. 먼저 read → read-tracker가 read-log.txt에 기록
  2. edit/write 시도
     → [tool_call] context-gate: read-log.txt 확인
       → 미열람이면 차단 + "먼저 read하세요"
     → 둘 다 통과하면 편집 실행

병렬 구현:
  → 독립적인 파일/모듈이면 Opus 서브에이전트 여러 개 동시 실행
  → 각 서브에이전트도 같은 게이트 체인을 탐 (같은 .omp/harness-state/ 공유)

MCP 필요 시:
  → DB 작업 → Supabase MCP 직접 호출 (DDL은 migration)
  → 리팩터링 → edit + OMC LSP로 참조 선확인
  (구 MCP 위임 매트릭스는 2026-06 폐기 — .omp/rules/harness-agent_routing.md 참조)
```

### 2.5 검증

구현이 끝나면, 커밋 전에 검증 단계를 거침.

```
1. 빌드/테스트 실행
   → npm test, npm run build 등
   → [tool_result] backpressure-tracker가 성공 기록
     → backpressure-status = "PASS"
     → test-history.json에 추가
   → 실패하면 [tool_result, exitCode≠0/isError] backpressure-failure-tracker가 FAIL 기록

2. reviewer 호출 (코드 변경 ≥10줄 or 로직 변경)
   → Pass 1: reviewer 자체 분석 (@slow 롤)
   → Pass 2: adversary 에이전트 중첩 스폰 (@advisor 롤, 이종 계열 — 트랜스크립트 model_change 실측)
   → Pass 3: code-reviewer 에이전트 중첩 스폰 (`.omp/agents/` 프로젝트 정의 — OMC 불요)
   → 3개 결과 교차 검증
   → docs/reviews/review-YYYY-MM-DD-HHMMSS.md (사람용 보고서)
     + 동일 베이스명 .json 사이드카 (기계 증거 — 게이트가 읽는 유일한 파일)
   → Verdict: PASS / PASS WITH NOTES / FAIL

3. verifier 호출 (AC 있을 때 필수)
   → seed.yaml AC 항목별 증거 확인
   → 하네스 게이트 상태 확인
   → 빌드/테스트 직접 재실행
   → scope 이탈 여부 확인
   → Verdict: PASS / FAIL / INCOMPLETE
```

### 2.6 커밋

```
git commit 시도
  → [tool_call: bash] commit-gates가 3개 게이트 순차 실행:

  1. acceptance-gate
     → seed.yaml AC 체크박스 확인
     → 미완료 [ ] 있으면 → 차단
     → acceptance-done 플래그 있으면 → 통과

  2. backpressure-gate (위험도 인식)
     → risk-assess.mjs로 변경 유형 판단
     → low (문서만) → 통과
     → medium (코드) + 상태 없음 → 경고
     → high/critical + PASS 아님 → 차단
     → backpressure-skip 플래그 있으면 → 통과

  3. review-gate (위험도 인식)
     → risk-assess.mjs로 변경 유형 판단
     → low → 통과
     → medium + 리뷰 없음 → 경고
     → high/critical + 2차 관점 증거 없음 → 차단
       (기계 증거 = 오늘자 review-*.json 사이드카의 strict 위치 기반 JSON tuple:
          ["omp-review-evidence/v1", diff_hash(hex64),
           "PASS"|"PASS WITH NOTES"|"FAIL", models|null, human|null, reviewer]
        — 마크다운은 파싱하지 않음(.md는 사람용 보고서); tuple에는 키가 없어
          중복 키 last-wins 주입이 구조적으로 불가, 스키마 위반 파일은 경고 후 무시)
       (증거축: ① 이종 모델 리뷰 — 실측 models 배열 2계열 이상
          (thread/session id는 증거 불인정)
        ② human-review — human_reviewed_by에 사람 식별자 (모델명 불인정)
        ③ 감사된 override)
     → 커버하는 tuple의 verdict FAIL → 차단
     → review-skip이 ["omp-review-override/v1", reason, approved_by, diff_hash] tuple이면
       → audit.jsonl에 review_override 기록 후 통과 (bare/비-tuple 플래그는 차단;
          audit.jsonl이 git 추적 중이면 `git commit -a`에서는 소비 불가 — fail-closed)

  전부 통과하면 커밋 성공

  → [발행 기준 충족 시 수동 1회 — docs/decisions/003] bash scripts/harness-version-bump.sh
    → 마지막 harness/* 태그 이후 하네스 변경이 있으면 버전 범프 + 태그 (멱등; 자동 아님)
```

### 2.7 완료 보고

```
메인 에이전트가 사용자에게 보고:
  → Applied rules
  → Evidence (파일 경로, 커맨드 출력)
  → Verification (reviewer/verifier 결과 참조)
```

## 3. 위험도별 게이트 동작 요약

```mermaid
flowchart LR
    subgraph risk["변경 위험도 판정 (risk-assess.mjs)"]
        R1["low<br/>문서·설정만"]
        R2["medium<br/>코드 변경"]
        R3["high<br/>코드 100줄+"]
        R4["critical<br/>auth·migration·secrets"]
    end

    subgraph gates["게이트 반응"]
        G1["backpressure: 통과<br/>review: 통과"]
        G2["backpressure: 경고<br/>review: 경고"]
        G3["backpressure: 차단<br/>review: 차단"]
        G4["backpressure: 차단<br/>review: 차단"]
    end

    subgraph override["오버라이드"]
        O1["불필요"]
        O2["불필요"]
        O3["backpressure-skip<br/>review-skip (감사된 override tuple:<br/>omp-review-override/v1·reason·approved_by·diff_hash)"]
        O4["backpressure-skip<br/>review-skip (감사된 override tuple)<br/>⚠️ 사용자 확인 필수"]
    end

    R1 --> G1 --> O1
    R2 --> G2 --> O2
    R3 --> G3 --> O3
    R4 --> G4 --> O4

    style R1 fill:#006400,color:#fff
    style R2 fill:#8b6914,color:#fff
    style R3 fill:#8b4000,color:#fff
    style R4 fill:#8b0000,color:#fff
```

## 4. 서브에이전트 호출 타이밍

(2026-06: researcher/db-worker/refactorer/full-context 위임 매트릭스 폐기 —
외부 정보·DB는 메인 에이전트가 직접 수행. `.omp/rules/harness-agent_routing.md`의 폐기 기록 참조.)

```mermaid
sequenceDiagram
    participant U as 사용자
    participant M as 메인 에이전트
    participant RV as reviewer
    participant VF as verifier
    participant OE as Opus (범용)

    U->>M: "결제 기능 만들어줘"
    Note over M: 킥오프 → seed.yaml 생성

    M->>M: web_search — Stripe API 최신 스펙 확인
    M->>M: Supabase MCP — payments 테이블 스키마 확인

    Note over M: 계획 수립 완료

    par 병렬 구현
        M->>OE: "webhook handler 구현"
        M->>OE: "결제 상태 enum 추가"
        M->>M: Supabase MCP — payments migration 적용
    end
    OE-->>M: handler 완료
    OE-->>M: enum 완료

    Note over M: 구현 완료 → 검증 단계

    M->>M: npm test, npm run build

    M->>RV: "변경사항 리뷰"
    Note over RV: Pass 1: 자체 분석
    Note over RV: Pass 2: adversary 중첩 스폰 (이종 계열)
    Note over RV: Pass 3: code-reviewer 중첩 스폰
    RV-->>M: PASS WITH NOTES (docs/reviews/에 md 보고서 + json 사이드카 기록)

    M->>VF: "AC 검증"
    VF-->>M: PASS (4/4 AC 충족)

    M->>M: git commit
    Note over M: acceptance-gate ✅
    Note over M: backpressure-gate ✅
    Note over M: review-gate ✅

    M->>U: "완료. 리뷰 결과, 검증 결과 첨부."
```
