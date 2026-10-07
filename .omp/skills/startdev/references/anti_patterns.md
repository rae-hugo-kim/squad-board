# Anti-Patterns: "대충 구현" Detection

## STOP Immediately If You See These

### 1. Test-After (테스트 나중에)

**증상**:
```
"일단 구현하고 테스트는 나중에 추가할게요"
"동작하는지 확인하고 테스트 작성하겠습니다"
```

**왜 문제인가**:
- 테스트가 구현을 검증하는 게 아니라 구현을 따라감
- 버그를 놓침

**대응**: STOP. 코드 삭제하고 테스트부터 작성.

---

### 2. Big Bang (한 번에 다 짜기)

**증상**:
```
"전체 기능을 구현했습니다" (100줄+ 한 번에)
"완성된 코드입니다"
```

**왜 문제인가**:
- 어디서 버그가 생겼는지 모름
- 리뷰 불가능
- 롤백 어려움

**대응**: STOP. 가장 작은 단위로 분해. 한 번에 20줄 이하.

---

### 3. Happy Path Only (성공 케이스만)

**증상**:
```
"정상 입력 기준으로 구현했습니다"
"에러 처리는 나중에..."
```

**왜 문제인가**:
- 실제 사용에서 바로 터짐
- 나중에 추가하면 구조가 꼬임

**대응**: STOP. 엣지 케이스 테스트 먼저 추가.

---

### 4. "일단 돌아가게" (Quick & Dirty)

**증상**:
- 하드코딩된 값
- `// TODO: fix later` 주석
- Magic numbers
- 복붙 코드

**코드 예시**:
```javascript
// BAD
const result = data.items[0].value * 1.1;  // 뭔지 모를 1.1
if (user.role === "admin") { ... }  // 하드코딩된 문자열

// GOOD
const TAX_RATE = 0.1;
const result = data.items[0].value * (1 + TAX_RATE);
if (user.role === UserRole.ADMIN) { ... }
```

**대응**: STOP. 상수 추출, 의미 있는 이름 사용.

---

### 5. Scope Creep (요청 안 한 거 추가)

**증상**:
```
"이것도 필요할 것 같아서 추가했습니다"
"ついでに(ついでに) 이것도 개선했습니다"
"While I'm here..."
```

**왜 문제인가**:
- 요구사항과 불일치
- 예상치 못한 사이드 이펙트
- 테스트 범위 초과

**대응**: STOP. 추가 코드 삭제. Epic 범위만 구현.

---

### 6. Copy-Paste Programming (복붙 프로그래밍)

**증상**:
- 비슷한 코드 블록 3회 이상 반복
- "다른 파일에서 가져왔습니다"
- 수정 없이 그대로 복사

**왜 문제인가**:
- 하나 고치면 나머지도 고쳐야 함
- 버그가 복제됨

**대응**: STOP. TIDY 단계에서 추출할 것. 지금은 일단 중복 OK, 나중에 정리.

---

### 7. Premature Abstraction (성급한 추상화)

**증상**:
```
"재사용을 위해 인터페이스를 만들었습니다"
"확장성을 고려해서 팩토리 패턴을..."
"나중을 위해 제네릭으로..."
```

**왜 문제인가**:
- 실제 필요 없을 수 있음
- 복잡도만 증가
- 요구사항 변경 시 버림

**대응**: STOP. 지금 필요한 것만. 추상화는 3번 반복 후에.

---

### 8. Silent Failure (조용한 실패)

**증상**:
```javascript
try {
  doSomething();
} catch (e) {
  // ignore
}
```

**왜 문제인가**:
- 버그 숨김
- 디버깅 불가능

**대응**: STOP. 에러 로깅하거나 다시 던지기.

---

## Self-Check Before Commit

매 커밋 전에 스스로 확인:

```markdown
## Anti-Pattern Check

- [ ] 테스트 먼저 작성했는가? (not test-after)
- [ ] 20줄 이하인가? (not big bang)
- [ ] 엣지 케이스 고려했는가? (not happy path only)
- [ ] 하드코딩 없는가? (not quick & dirty)
- [ ] 요청한 것만 구현했는가? (not scope creep)
- [ ] 복붙 3회 이상 없는가? (not copy-paste)
- [ ] 불필요한 추상화 없는가? (not premature abstraction)
- [ ] 에러 무시 없는가? (not silent failure)
```

하나라도 체크 안 되면 → 수정 후 커밋
