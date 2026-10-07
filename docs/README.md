# Personal Harness Docs

이 트리는 본 repo 문서의 SST(단일 진실 원천)다. 저작 매체는 마크다운이며,
별도 빌드 없이 **Obsidian vault**(또는 GitHub/raw 텍스트)로 그대로 읽는다.

## Navigation

폴더 트리에서 섹션별로 이동한다.

- **Architecture** — 하네스 구조와 워크플로 라이프사이클
- **Brainstorming** — 의사결정 기록, 구조 제안, 디자인 노트 (로컬 전용)
- **Reviews** — 어드버서리얼 리뷰 보고서 (로컬 전용)
- **Harness Outputs** — kickoff/seed/rubric 산출물
- **Handoff** — `docs/handoff/` 세션 간 인수인계 문서 (보관 정책: `docs/rules/artifact_roles_contract.md` §Handoff)
- **Internal Rules / Checklists** — `docs/rules`, `docs/checklists` 모듈
- **Session Summaries** — `docs/sum/` 회고 기록 (로컬 전용)
- **Templates** — 문서 템플릿 모음
- **Guides** — [프롬프트 작성 핸드북](prompt-writing-handbook.md) (실전 절차·체크리스트; 원리는 `.omp/rules/harness-prompt_engineering.md`)

"로컬 전용" 섹션은 gitignore 대상이라 원격에는 없지만 vault에서는 열람·검색된다.

## Viewer (Obsidian)

1. **Open folder as vault** → repo 루트 선택
   (WSL: `\\wsl.localhost\<distro>\home\<user>\projects\workspace\omp`)
   — `docs/`가 아닌 repo 루트여야 `.omp/rules/`·`checklists/`로의 크로스링크가 살아있다.
2. 권장 설정:
   - Editor → Default view mode: **Reading**
   - Files & Links → **Use [[Wikilinks]] 끄기**, New link format: **Relative path**
   - Appearance → **Readable line length 켜기**
3. `.obsidian/`(뷰어 설정)은 gitignore — 커밋하지 않는다.

Mermaid는 Obsidian이 네이티브 렌더한다. 다이어그램 syntax는 저장 시점에
하네스 게이트가 OMP 내장 파서로 검증한다 (`.omp/rules/harness-doc_standards.md` R1).

## 정책

- 저작은 마크다운으로 (`.omp/rules/harness-doc_standards.md`)
- 1회성 사람용 HTML 산출물은 `artifacts/`로 (SST 미포함)
- 다이어그램은 Mermaid 기본 — 지원 타입은 doc_standards R1 참조
- 링크 무결성 검사: `node scripts/docs-drift`
