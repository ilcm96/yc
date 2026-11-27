# yc: 개인 빌드

이 저장소는 T3 Code 소스 코드를 바탕으로 한 비공식 개인 빌드이며, T3 Tools, Inc.와 관계가 없습니다. `AGENTS.md`는 upstream 소유이고 개인 규칙은 이 파일에 둡니다. 두 파일이 충돌하면 이 파일을 따릅니다.

## Upstream 동기화

- `upstream`은 `pingdotgg/t3code`이고 `origin`은 이 저장소입니다.
- stable 태그(`vX.Y.Z`)만 따라갑니다. upstream `main`이나 nightly 태그는 따라가지 않습니다.
- 태그를 `bot/upstream-vX.Y.Z` 브랜치에 merge하고, 그 PR은 merge commit으로 병합합니다. squash나 rebase를 하면 다음 태그의 merge base가 깨지므로 저장소 설정에서 두 방식을 꺼 두었습니다.
- 충돌은 upstream의 새 구조를 유지하고 그 위에 개인 기능을 다시 얹는 방식으로 해결합니다. 한쪽을 통째로 고르지 않습니다.
- 개인 기능이 연결되어야 하는 경우를 제외하고 upstream 소유 파일(`AGENTS.md`, `.agents/skills/*`, upstream 워크플로)은 수정하지 않습니다. 필요 없는 워크플로는 삭제하지 말고 비활성화합니다. 켜 두는 워크플로는 `yc.yml`과 `yc-upstream-sync.yml`입니다.
- 병합한 upstream 태그는 origin에도 push합니다. 릴리스 버전이 `git describe`로 그 태그를 찾기 때문입니다.

### 자동 동기화

- `.github/workflows/yc-upstream-sync.yml`이 매일 04:17 KST에 새 stable 태그를 찾아 위 절차를 수행합니다. 수동 실행에서는 태그를 지정할 수 있고, `force`를 켜면 닫힌 PR이 있는 태그도 다시 동기화합니다. 스크립트는 `scripts/yc/upstream-sync/`에 있습니다.
  - Resolve: 태그를 merge하고 `verify.sh`(i18n, typecheck, `scripts/yc/check-invariants.sh`, `personal-tests.txt`의 개인 기능 테스트)로 검증합니다. 충돌이 있거나 검증이 실패할 때만 Claude 해결 세션(`resolve-prompt.md`, 70분)을 한 번 실행하고, Git 기본 메시지로 merge commit을 만듭니다.
  - Review: 모든 동기화에서 Claude 리뷰 세션(`review-prompt.md`, 40분)이 동기화 전후의 yc 패치와 겹치는 파일의 upstream 변경을 읽고, PERSONAL.md의 개인 기능마다 진입점부터 연결이 살아 있는지 점검합니다. 테스트는 컴포넌트를 단독으로 검사하므로, upstream이 기능을 닿을 수 없게 만든 경우를 이 단계가 잡습니다.
  - 두 세션 모두 `--model opus`로 최신 Opus를 쓰고, 서브에이전트(Agent)를 허용해 병렬로 조사합니다. 단계·모델별 토큰 수와 API 정가로 환산한 비용은 PR 본문과 Actions 실행 요약에 남깁니다.
  - Publish: upstream 태그와 sync 브랜치를 push하고 PR을 엽니다. push 토큰은 저장소 코드를 실행하지 않는 이 job만 가집니다.
  - Merge: PR에서 YC가 head commit 기준으로 통과하고 라벨이 `sync:auto-merge`이면 merge commit으로 병합하고, 브랜치를 지우고, upstream 워크플로를 끕니다. sync PR에서는 macOS 빌드도 서명 없이 돌립니다.
- 다음 경우에는 `sync:needs-review` 라벨을 붙이고 자동으로 병합하지 않습니다.
  - 검증이 실패했거나 충돌 표시가 남은 경우
  - Claude 해결 세션이 오류나 시간 초과로 끝났거나, 보고 파일이 없거나, 스스로 리뷰가 필요하다고 보고한 경우(개인 기능을 새로 만들어야 했거나, 해결이 확실하지 않거나, 개인 기능 테스트를 고친 경우)
  - Claude 리뷰에서 개인 기능이 의심이나 깨짐으로 나왔거나, 빠진 기능이 있거나, 리뷰가 오류나 시간 초과로 끝난 경우
  - 충돌 해결이나 Claude의 수정이 민감 경로(인증, T3 Connect·relay, 텔레메트리·관측, 데스크톱 업데이트, DB 마이그레이션, `server.ts`, `.github/`, `scripts/yc/`, `build-desktop-artifact.ts`, `.env.example`)에 닿은 경우. upstream이 직접 바꾼 민감 경로는 그대로 통과합니다. 목록은 `resolve.sh`의 `SENSITIVE`입니다.
  - Claude가 `personal-tests.txt`의 테스트나 `PERSONAL.md`, `AGENTS.md`를 수정한 경우
  - upstream이 `apps/server/src/telemetry`나 `observability`에 테스트가 아닌 새 파일을 추가한 경우
- 리뷰 PR은 로컬에서 브랜치를 받아 고친 뒤 push하고, 직접 merge commit으로 병합합니다. 그 태그를 건너뛰려면 PR을 닫습니다.
- 알림은 Discord webhook(`notify.sh`)으로 보냅니다. owner 토큰으로 만든 PR은 GitHub 알림을 보내지 않기 때문입니다.
  - 리뷰 PR 생성: 사유, 충돌 파일 수, Claude API 환산 비용과 PR 링크를 한 번 보냅니다. 열려 있는 동안 다음 동기화는 조용히 건너뜁니다.
  - 자동 병합: PR 링크와 Claude 비용을 보냅니다.
  - sync PR의 CI 실패나 sync job 실패: 실행 링크를 보냅니다. CI를 재실행해 통과하면 auto-merge PR은 그대로 병합됩니다.
  - Discord 전송이 실패하면 job이 실패하므로 GitHub 실패 메일이 대신 옵니다.
- 비밀값은 배포 브랜치를 `main`으로 제한한 `yc-sync` environment에 둡니다. 그래서 PR 브랜치에서 실행되는 워크플로는 읽을 수 없습니다.
  - `CLAUDE_CODE_OAUTH_TOKEN`: `claude setup-token`으로 받은 1년짜리 토큰입니다. Claude 사용량은 구독 한도에서 나갑니다. 한도 초과나 토큰 만료로 Claude가 아무것도 바꾸지 못하면 push 없이 실패하고 다음 날 다시 시도합니다.
  - `YC_SYNC_TOKEN`: 이 저장소만 대상으로 하는 fine-grained PAT(Contents, Pull requests, Workflows 쓰기)입니다. `GITHUB_TOKEN`으로 만든 PR이나 push는 YC를 실행하지 않고, 워크플로 파일 변경을 push하지도 못합니다.
  - `DISCORD_WEBHOOK_URL`: 알림을 받을 Discord 채널의 webhook입니다.
  - 만료되면 sync 실행이 실패합니다. 새로 발급해 `gh secret set <이름> --env yc-sync`로 교체합니다.
- 공개 저장소의 schedule은 60일 동안 저장소 활동이 없으면 꺼집니다. 꺼졌으면 Actions 화면에서 다시 켭니다.
- Claude Code CLI는 매번 최신 버전을 설치하므로 `opus` 별칭이 항상 최신 Opus를 가리킵니다. 실제로 쓴 모델은 사용량 표에 남습니다. CLI 옵션이나 결과 형식이 바뀌면 push 없이 실패하거나 리뷰로 넘어가므로 자동 병합되지는 않습니다.

## CI와 배포

- `.github/workflows/yc.yml`이 PR과 `main` push마다 검사(포맷, lint, knip, 타입, i18n)와 테스트를 GitHub-hosted 러너에서 실행합니다. 공개 저장소의 표준 러너(Linux 4 vCPU)가 무료로 쓸 수 있는 최고 사양이므로, 테스트를 server 8개, web 3개, mobile 2개 샤드와 나머지 패키지 작업으로 나눠 병렬로 돌립니다. Chromium과 Electron 다운로드, server의 Vitest 모듈 캐시는 Actions 캐시로 재사용합니다. check 작업은 `scripts/yc/check-invariants.sh`로 텔레메트리 차단 연결도 확인합니다.
- `main` push에서는 macOS arm64 zip 빌드와 `scripts/yc/sign-macos-app.sh`의 자체 서명 인증서(Secret `YC_CODESIGN_P12_BASE64`, `YC_CODESIGN_P12_PASSWORD`) 재서명을 테스트와 동시에 진행하고, 모든 검사와 테스트가 통과하면 그 파일을 Release로 게시합니다.
  - 버전은 `<upstream 태그>-yc.<run number>`(예: `0.1.11-yc.12`)이고 Release 태그는 그 앞에 `v`를 붙입니다.
  - 내장 업데이터는 `T3CODE_DESKTOP_UPDATE_REPOSITORY=none`으로 끕니다. 빌드 결과에 `app-update.yml`이 들어 있으면 빌드가 실패합니다. 앱은 이 파일이 있을 때만 업데이터를 켭니다. T3 Connect 공개 설정은 빌드 때 `.env.example`을 `.env`로 복사해 넣습니다.
- 각 Mac은 `scripts/yc/install-updater.sh`가 설치한 LaunchAgent로 최신 Release를 받습니다.
  - 설치: `curl -fsSL https://raw.githubusercontent.com/ilcm96/yc/main/scripts/yc/install-updater.sh | bash`. 같은 bundle id를 쓰는 공식 앱이 `/Applications`에 있으면 먼저 지워야 설치됩니다. `~/.t3`의 데이터는 그대로 씁니다.
  - 제거: 같은 스크립트에 `--uninstall`을 붙입니다. `YC.app`은 남습니다.
  - `scripts/yc/update.sh`는 로그인할 때와 1시간마다 실행됩니다. YC가 실행 중이면 종료될 때까지 기다리고, SHA256과 yc 인증서 서명을 확인한 뒤 앱을 교체합니다. 로그는 `~/Library/Logs/yc-updater.log`입니다.
  - 버전 고정: `~/Library/Application Support/yc-updater/pinned` 파일을 만들면 업데이트를 멈춥니다. 롤백은 이전 Release를 `gh release edit <tag> --latest`로 지정합니다.
  - `update.sh`를 고친 뒤에는 설치 스크립트를 다시 실행해야 각 Mac에 반영됩니다.
- 서명 인증서 원본은 저장소 밖에 보관합니다. 인증서가 바뀌면 `update.sh`의 `CERT_LEAF`도 바꿔야 하고, 첫 업데이트 때 macOS 권한이 한 번 초기화됩니다.

## 유지할 개인 기능

각 기능은 별도 파일에 두고, upstream 파일에는 최소한의 줄만 추가해 연결합니다. 동기화할 때마다 아래 테스트를 변경 파일 주변만이 아니라 전부 실행해 통과시킵니다. 같은 목록이 `scripts/yc/upstream-sync/personal-tests.txt`에 있으므로, 기능을 추가하거나 테스트를 옮기면 두 곳을 함께 고칩니다. 자동 동기화의 Claude 리뷰는 아래 `###` 제목을 점검할 기능 목록으로 씁니다.

### 프로젝트 폴더 드래그 정렬 (Boring sidebar)

- 파일: `Sidebar.tsx`의 폴더 드래그, `sidebar/SidebarProjectFolder.tsx`
- 테스트: `Sidebar.personal.browser.test.tsx`, `uiStateStore.test.ts`
- upstream이 #40164를 병합하면 폴더 드래그는 upstream 버전을 쓰고 나머지 기능은 유지합니다.

### 프로젝트 선택기 드래그 정렬 (기본 사이드바)

- 파일: `sidebar/ProjectScopeSortable.tsx`, `Sidebar.tsx`의 선택기 연결부
- 테스트: `Sidebar.personal.browser.test.tsx`

### 폴더당 스레드 수 제한과 Show more

- 동작: 열린 프로젝트 폴더는 설정한 개수(Labs, 기본 5개)만큼 스레드를 보여 주고, Show more를 누를 때마다 같은 개수만큼 더 보여 줍니다. 폴더를 접으면 처음 개수로 돌아갑니다. 가려진 스레드를 Settled로 보내지 않습니다.
- 파일: `sidebar/projectFolderThreadLimit.ts`, `sidebar/SidebarProjectFolderMore.tsx`, `Sidebar.tsx`의 `useSidebarThreads`, `settings/BoringSidebarFolderThreadLimitRow.tsx`, contracts `settings.ts`의 `boringSidebarFolderThreadLimit`, `settingsSearch.ts`의 검색 항목
- 테스트: `projectFolderThreadLimit.test.ts`, `Sidebar.personal.browser.test.tsx`

### Context ring

- 동작: 전송 버튼 옆에 컨텍스트 사용량을 회색 링으로 보여 주며, compaction limit이 설정되어 있으면 그 값을 기준으로 삼습니다. 마우스를 올리면 예전 upstream 미터 모양의 팝오버에 사용률과 토큰 수, 진행 막대, 프롬프트 캐시 만료(Claude), 세션 비용, Thread details와 같은 플랜 한도를 보여 줍니다.
- 세션 비용: Claude SDK 결과의 `total_cost_usd`(세션 누적 추정치)를 Claude adapter가 provider thread별로 기억해 사용량 보고마다 `tokenUsage.cost`로 보냅니다. Codex는 비용을 보내지 않으므로 표시하지 않습니다.
- 파일: `chat/ContextWindowRing.tsx`, `ChatView.tsx`, `ChatComposer.tsx`, `ComposerFooterControls.tsx`를 거치는 `contextRing` prop(사용량, `promptCacheExpiresAt`, 플랜 한도 입력), `ClaudeAdapterV2.ts`의 `sessionCostUsd`, contracts `orchestrationV2.ts`의 `OrchestrationV2ProviderTurnTokenUsage.cost`, client-runtime `contextWindow.ts`의 live usage `cost`
- 테스트: `chat/ContextWindowRing.browser.test.tsx`, `ClaudeAdapterV2.test.ts`의 "carries the session's running cost", web `lib/contextWindow.test.ts`의 live usage 케이스

### YC 브랜딩

- 동작: 배포판의 앱 이름, 메뉴, 창 제목, 웹 탭 제목, macOS 권한 요청 문구, 사이드바 로고, 아이콘을 YC로 표시합니다. 설정 설명처럼 화면 곳곳에 직접 적힌 "T3 Code" 문구는 동기화 충돌을 줄이기 위해 그대로 둡니다.
- 파일: `assets/yc/`(아이콘과 원본 SVG), `scripts/lib/brand-assets.ts`의 production mac·web 아이콘 경로, `apps/desktop/package.json`의 `productName`, `DesktopEnvironment.ts`의 `APP_BASE_NAME`과 Beta 표기 생략, `scripts/build-desktop-artifact.ts`의 `artifactName`·`NS*UsageDescription`·mac `protocols` 이름, `apps/desktop/scripts/electron-launcher.mjs`, `apps/web/src/branding.ts`·`branding.logic.ts`, `vite.config.ts`, `index.html`, `manifest.webmanifest`, `T3Wordmark.tsx`(Stack Sans Notch로 쓴 YC 워드마크로 교체), `SidebarChrome.tsx`·`ui/standalone-page.tsx`의 "Code" 글자 제거
- 아이콘: 검은 타일 아래쪽에 인디고·마젠타·시안 빛이 번지는 배경(Aurora) 위에 Stack Sans Notch 700의 Y를 얹습니다. 사이드바 워드마크는 같은 글꼴의 "YC"입니다. 원본은 `assets/yc/yc-icon.svg`(앱 아이콘)와 `yc-mark.svg`(워드마크)이고, 글자 윤곽은 Google Fonts의 Stack Sans Notch(OFL)에서 뽑아 경로로 넣었으므로 글꼴 파일은 저장소에 없습니다. PNG와 ICO는 `yc-icon.svg`를 macOS(1024, 824px 타일과 그림자), web(512·192·32·16, 4% 여백), apple-touch(180, 여백 없음) 크기로 렌더링해 만듭니다. 모서리가 각진 apple-touch 아이콘은 iOS 홈 화면(`index.html`의 `apple-touch-icon` 링크)에만 씁니다. 웹·데스크톱 로딩 화면(`#boot-shell-logo`)과 PWA manifest에는 둥근 `icon-192x192.png` 이상을 씁니다.
- 테스트: `DesktopPreReadyPlatform.test.ts`의 desktop entry 이름
- 고지: `README.md` 맨 위의 비공식 빌드 안내
- staged `package.json`에 최상위 `productName`을 넣지 않습니다. Electron이 `name`(`t3code`) 대신 그 값을 써서 Keychain 항목 "t3code Safe Storage"가 바뀌기 때문입니다.
- `scripts/export-brand-icons.ts`를 실행하면 `assets/yc/yc-macos-1024.png`를 upstream Icon Composer 결과로 덮어쓰므로 실행하지 않습니다.

### 출력 속도 (tok/s)

- 동작: Claude 세션의 출력 토큰 속도를 composer의 context ring 왼쪽, 서브에이전트 행, "N subagents" 묶음 헤더에 보여 줍니다. 실행 중에는 현재 또는 직전 요청의 속도를, 끝나면 `avg`가 붙은 평균을 보여 줍니다. 묶음 헤더는 실행 중인 서브에이전트(모두 끝나면 전체)의 토큰 가중 평균입니다. Codex 등 다른 provider에서는 표시하지 않습니다.
- 메인 세션: `message_start`부터 `message_delta`까지를 요청 하나로 재고, 스트리밍 중에는 delta 글자 수와 `thinking_tokens` 추정치로 1초마다 추정값을 보냅니다. 글자당 토큰 비율은 직전 요청의 실제 토큰 수로 보정합니다.
- 서브에이전트: SDK가 서브에이전트의 스트림과 최종 토큰 수를 보내지 않으므로, `task_progress`와 `task_notification`을 받을 때 `~/.claude/projects/<프로젝트>/<세션>/subagents/agent-<task id>.jsonl`에서 새 줄만 읽어 요청별 출력 토큰과 시간을 구합니다. Claude Code가 답변이 끝난 뒤에 줄을 쓰므로 긴 요청 중에는 직전 요청의 속도가 남아 있습니다. transcript 형식이 바뀌면 속도만 사라집니다.
- 파일: `orchestration-v2/Adapters/claudeOutputSpeed.ts`, `ClaudeAdapterV2.ts`의 연결부(`meterClaudeOutputFrame`, `emitContextUsage`의 `outputSpeed`, `updateClaudeSubagentNode`의 `subagentOutputSpeed.read`), contracts `outputSpeed.ts`와 `orchestrationV2.ts`의 `outputSpeed` 필드 두 개, web `chat/outputSpeed.logic.ts`·`OutputSpeedLabel.tsx`, `ContextWindowRing.tsx`·`V2LifecycleRow.tsx`·`TimelineV2EventRow.tsx`·`ChatView.tsx`의 연결부
- 테스트: `claudeOutputSpeed.test.ts`, `chat/outputSpeed.logic.test.ts`

### 텔레메트리 차단

- 동작: 서버의 제품 분석 이벤트(PostHog, `ingest.t3.codes`)를 `T3CODE_TELEMETRY_ENABLED` 값과 관계없이 보내지 않습니다. 호출부는 upstream 그대로 두고 주입하는 레이어만 no-op으로 바꿉니다. 빌드 때 OTLP나 PostHog 값이 번들에 들어가면 CI가 실패합니다.
- 파일: `apps/server/src/telemetry/DisabledAnalytics.ts`, `server.ts`의 `DisabledAnalytics.layer` 연결, `yc.yml`의 "Keep telemetry out of the build" 단계
- 동기화 확인: `scripts/yc/check-invariants.sh`가 CI와 동기화 검증에서 실제 `AnalyticsService.layer`가 다시 쓰이지 않는지, `server.ts`가 `DisabledAnalytics.layer`를 쓰는지 확인합니다. upstream이 `AnalyticsService`에 메서드를 추가하면 typecheck가 실패하므로 no-op에도 같은 메서드를 추가합니다. `telemetry/`나 `observability/`에 새 모듈이 생기면 자동 동기화가 리뷰로 넘어가므로, 새 외부 전송 경로인지 확인합니다.

## 커밋 메시지

- 제목은 conventional commit 형식(`type(scope): 요약`)을 따르고, 요약과 본문은 한국어로 씁니다. upstream 동기화의 merge commit은 Git 기본 메시지를 그대로 둡니다.
- 제목과 본문 항목은 "추가", "제거", "변경", "포함", "통일"처럼 동작을 나타내는 명사로 끝맺습니다.
  - "추가함", "옮김", "있었음"처럼 동사에 "-ㅁ/-음"을 붙인 형태와 "~하려는 것"처럼 "것"으로 끝맺는 형태는 쓰지 않습니다.
  - 이유는 "~하던 문제 수정", "~을 위한 변경"처럼 적습니다.
  - 예시: `refactor(web): 사이드바 폴더의 스레드 개수 제한 로직을 projectFolderThreadLimit으로 통일`

## AGENTS.md와 다르게 적용하는 규칙

- 개인 기능은 web과 desktop만 대상으로 합니다. mobile, marketing, 다른 provider의 네이티브 UI는 범위 밖입니다.
- 가능하면 기존 번역 문구를 재사용합니다. 동기화 중 `apps/web/src/i18n/translations`에서 충돌이 나면 upstream 카탈로그를 받고, `apps/web`에서 `vp run i18n:generate`를 실행한 뒤, 영어로 돌아온 개인 키를 다시 번역합니다.
- 동기화 자동화는 sync PR을 만들고 병합할 수 있습니다. PR 증빙 업로드나 기여 정책처럼 upstream 전용 절차는 적용하지 않습니다.
- 기존 데이터와 T3 Connect에 연결된 내부 식별자는 유지합니다: bundle id `com.t3tools.t3code`, staged package 이름 `t3code`, `t3code://` scheme, `t3code-v2` 프로필, `~/.t3`. 사용자에게 보이는 브랜딩에는 T3 Code라고 쓰지 않습니다.
