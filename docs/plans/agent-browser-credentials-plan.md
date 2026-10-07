# 에이전트 브라우저 자동화 + 크리덴셜 공급 계획

- 상태: 계획 수립 (구현 착수 전, 코드 생산 없음)
- 작성일: 2026-07-24
- 배경 세션: WSL(OMP) → Windows Brave의 Gmail 탭을 Orca computer-use로 읽으려던 시도에서 출발

## 1. 문제 정의

에이전트가 "이미 로그인된 웹 서비스"를 다루는 작업(예: 특정 발신자의 최근 메일 확인)을 수행할 때, 현재 가용한 수단은 다음 한계를 가진다.

| 수단 | 한계 |
|---|---|
| Orca computer-use (UIA 화면 자동화) | 포그라운드 전용 — 포커스 점유, 사용자 입력과 경합, stale 인덱스, 오클릭 시 실제 UI 오염 (세션에서 실증됨) |
| OMP `browser` 도구 (CDP, 자체 Chromium) | 백그라운드 가능하지만 새 프로필 — 로그인 세션 없음 |
| 메인 Brave 프로필 + `--remote-debugging-port` | **기각.** 무인증 로컬 TCP 문 — 아무 프로세스나 전체 쿠키 접근 가능. Chromium 136+부터 기본 프로필에서는 플래그 자체가 무시됨 (쿠키 탈취 악용이 공식 사유) |
| Claude in Chrome 확장 (Cowork 방식) | 이상적 모델이나 **WSL 미지원** 공식 명시 |

핵심 요구: **백그라운드 실행 + 로그인 상태 + 통제된 크리덴셜 접근**을 동시에 만족할 것.

## 2. 조사 결과 요약 (근거)

- Cowork/Claude Code의 "로그인된 브라우저 백그라운드 제어"의 실체는 브라우저 **확장 + 네이티브 메시징** 경유 CDP 주입. 비가시성이 아니라 "입력 무경합"이 본질. 사이트별 권한과 승인 프롬프트가 게이트 역할.
  - https://code.claude.com/docs/en/chrome (WSL 미지원 명시 포함)
- Codex Computer Use의 백그라운드는 macOS 전용 커서 분리 + AX 트리. Windows 대응물 없음.
  - https://codex.danielvaughan.com/2026/04/17/codex-app-computer-use-macos-background-gui-automation/
- Cowork 원격 세션은 Anthropic 샌드박스, 로컬 세션은 숨은 VM — 격리로 백그라운드를 얻는 방식.
  - https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview
- Chromium 136+ 기본 프로필 CDP 차단.
  - https://developer.chrome.com/blog/remote-debugging-port
- 현재 머신 상태 (2026-07-24 확인): WSL에 `op` CLI 2.35.0 설치됨 / 계정 미연동. Windows 측 `op.exe` 미설치. Brave에 1Password 확장 사용 중.

## 3. 채택 아키텍처

**에이전트 전용 브라우저 프로필 + 1Password CLI 주입.**

```
[OMP browser 도구]
  └─ 자체 Chromium, 에이전트 전용 프로필 (메인 Brave와 완전 분리)
       ├─ 로그인 필요 시: op CLI로 항목 단위 크리덴셜 조회 → 즉시 fill → 폐기
       ├─ 세션 쿠키는 프로필에 영속 → 사이트당 크리덴셜 조회는 사실상 1회
       └─ CDP 입력 주입 → 포커스 무점유(백그라운드)
```

보안 속성:

- 크리덴셜은 대화 기록·도구 인자·설정 파일에 남지 않음 (단일 실행 셀 내 fetch→fill→폐기)
- 1Password가 게이트: 항목 단위 접근, 접근 시 승인(연동 방식에 따라 Windows Hello), 회수 가능
- 침해 시 피해 범위가 에이전트 프로필에 한정 (메인 프로필 쿠키와 격리)

### 1Password 연동 방식 (구현 시 선택)

| 안 | 방식 | 게이트 강도 | 용도 |
|---|---|---|---|
| A (권장) | Windows `op.exe` 설치 + 데스크톱 앱 통합, WSL interop 호출 | 접근마다 Windows Hello 프롬프트 | 대화형 세션 |
| B | WSL `op account add` 직접 로그인 | 30분 세션 토큰, 생체인증 없음 | 임시/과도기 |
| C | 서비스 계정 토큰 | 프롬프트 없음 (완전 무인) | **에이전트 전용 vault 한정** 자동화 |

### 서비스별 예외

- **Google 계정 (Gmail 등)**: 자동화 브라우저의 비밀번호 로그인은 봇 감지에 걸릴 가능성 높음. 에이전트 프로필에 **최초 1회 수동 로그인** 후 쿠키 영속으로 처리. 크리덴셜이 에이전트를 아예 거치지 않음.
- **메일 정형 작업**: 빈도가 높아지면 Gmail API readonly OAuth / IMAP 앱 비밀번호가 더 좁은 문. 별도 검토.

## 4. 범위

### MUST
- 에이전트 전용 Chromium 프로필로 로그인 세션을 영속 관리한다.
- 크리덴셜은 1Password CLI를 통해 실행 시점에만 조회하고, 어떤 산출물(대화 기록, 파일, 로그)에도 저장하지 않는다.
- 메인 Brave 프로필은 어떤 방식으로도 자동화 대상에서 제외한다.

### SHOULD
- 연동 방식은 A안(Windows 데스크톱 앱 통합)을 우선한다.
- Google 계정은 수동 1회 로그인 경로를 사용한다.
- 무인 자동화가 필요해지면 C안을 에이전트 전용 vault 조건으로만 도입한다.

### NOT (하지 않음)
- `--remote-debugging-port`를 메인 프로필에 적용하지 않는다.
- 마스터 비밀번호·서비스 계정 토큰을 평문 파일/셸 히스토리에 남기지 않는다.
- Orca computer-use를 로그인 웹 작업의 기본 경로로 사용하지 않는다 (데스크톱 네이티브 앱 전용 폴백으로 유지).

## 5. 구현 단계 (착수 시)

1. Windows에 1Password CLI 설치, 데스크톱 앱 통합 활성화, WSL에서 interop 호출 확인
2. `browser` 도구 에이전트 프로필 디렉토리 결정 및 생성 (WSL 홈 하위)
3. 비-Google 테스트 사이트 1곳에서 op 조회 → fill → 세션 영속 검증
4. Google 계정 수동 로그인 1회 수행, 재시작 후 세션 유지 확인
5. 사용 가이드를 본 문서에 추가 (자주 쓰는 작업 프롬프트 예시)

## 6. 수용 기준 (AC)

- [ ] WSL 셸에서 `op` 항목 조회 시 Windows Hello 승인 프롬프트가 동작한다 (A안 기준)
- [ ] 에이전트 브라우저에서 로그인 작업 수행 중 사용자 포커스를 점유하지 않는다
- [ ] 로그인 후 브라우저 재시작 시 세션이 유지된다 (재로그인 불필요)
- [ ] 대화 기록·산출물 어디에도 크리덴셜 문자열이 존재하지 않는다
- [ ] 메인 Brave 프로필에 어떤 설정 변경도 가해지지 않았다

## 7. 미해결 질문

- Playwright MCP extension 모드 등 확장 브릿지형 공개 구현의 WSL 경계 통과 여부 (미검증 — 검증 시 본 아키텍처의 대안 가능)
- 1Password 서비스 계정의 vault 분리 정책 (C안 도입 시 결정)
- 메일 작업 빈도에 따른 Gmail API 전환 시점
