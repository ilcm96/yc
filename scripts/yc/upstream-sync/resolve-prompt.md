# upstream 동기화

yc(T3 Code 개인 빌드) 저장소에서 upstream stable 태그를 `bot/upstream-<태그>` 브랜치에 병합하는 중입니다. `git merge --no-commit`이 진행 중이며, 작업이 끝나면 스크립트가 지금 상태를 그대로 merge commit으로 만듭니다.

먼저 `PERSONAL.md`를 읽고, 저장소 사용법은 `AGENTS.md`에서 확인합니다. 두 문서가 충돌하면 `PERSONAL.md`를 따릅니다.

## 할 일

1. 충돌을 모두 해결합니다. upstream의 새 구조를 유지하고, `PERSONAL.md`의 "유지할 개인 기능"을 그 위에 다시 연결합니다. 한쪽을 통째로 고르지 않습니다.
2. `apps/web/src/i18n/translations` 충돌은 upstream 카탈로그를 받고(`git checkout --theirs`), `apps/web`에서 `vp run i18n:generate`를 실행한 뒤, 영어로 돌아온 개인 키를 다시 번역합니다.
3. `pnpm-lock.yaml` 충돌은 upstream 쪽을 받은 뒤 `vp install`로 맞춥니다. 의존성이 바뀌었으면 `vp install`을 실행합니다.
4. `scripts/yc/upstream-sync/verify.sh`가 통과할 때까지 고칩니다. 이 스크립트는 i18n, 타입, yc 불변식, 개인 기능 테스트를 확인합니다.
5. 마지막에 보고 파일을 씁니다.

충돌 파일이 여러 개면 서브에이전트로 나눠 병렬로 조사해도 됩니다. 전체 시간 제한은 70분입니다.

## 하지 말 것

- commit, merge, reset, rebase, stash, push, 브랜치 전환. 병합 상태를 그대로 둡니다.
- `.github/`, `scripts/yc/`, `PERSONAL.md`, `AGENTS.md` 수정
- 테스트를 지우거나 기대값을 느슨하게 바꿔 통과시키기. upstream 변경 때문에 개인 기능 테스트를 고쳐야 했다면 고치되, 보고의 `needsReview`를 `true`로 둡니다.
- 저장소 전체 검사(`vp check`, `vp run -r test`)나 dev 서버 실행. 전체 테스트는 PR CI가 돌립니다.

## 보고 파일

작업이 끝나면 아래 형식의 JSON을 "이번 작업"에 적힌 보고 파일 경로에 씁니다.

```json
{ "needsReview": false, "reason": "판단 이유 한 줄", "summary": "- 충돌별 해결 내용" }
```

- `needsReview`: 개인 기능을 다시 연결하는 수준을 넘어 새로 만들어야 했을 때, 해결 방법이 확실하지 않을 때, 검증을 통과시키지 못했을 때 `true`입니다.
- `reason`: 판단 이유 한 줄을 한국어로 씁니다.
- `summary`: 파일이나 기능별로 무엇을 어떻게 해결했는지 한국어 Markdown 목록으로 씁니다.
