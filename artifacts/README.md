# Artifacts

이 디렉터리는 **사람이 한 번 보고 버리는 1회성 HTML 산출물**의 격리 위치다.
docs SST(`docs/`)에 포함되지 않으며, gitignore 대상이다.

## 용도

- 디자인 mockup·파라미터 튜닝 (예: `design-mockup` 스킬)
- 1회성 explainer·시각 자료
- PR 리뷰용 인라인 diff·주석 HTML
- 데이터 큐레이션·정렬용 일회성 편집기

상세는 [`.omp/rules/harness-doc_standards.md`](../.omp/rules/harness-doc_standards.md) R4 참조.

## 정책

- 모든 파일 gitignore (`.gitignore`의 `artifacts/*` + 예외 라인 참조)
- 단, `README.md` 및 `<subdir>/README.md`는 추적 허용 (구조 문서화 목적)
- 영속 유지가 필요한 산출물은 `docs/` 안의 MD로 승격
- md 뷰어(Obsidian vault)의 대상 아님 — HTML은 여기 격리

## Retention

- **수동 정리, 30일 가이드라인**. 30일 이상 된 파일은 사용자 판단으로 삭제.
- 자동 cleanup은 누적 통증 발생 시 별 결정 (디스크 사용량 기준 또는 파일 100+
  누적 시 신호).
- `find artifacts -mtime +30 -type f` 등으로 후보 확인 가능.

## Subdirectory Convention

- `design/` — design-mockup 스킬 산출물
- 새 카테고리 추가 시 해당 디렉터리에 `README.md` 한 줄로 용도 명시
