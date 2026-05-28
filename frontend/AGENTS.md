# Frontend Agent Guide

## 범위

이 디렉터리는 행사장 뽑기판 Next.js 앱입니다. 방문자 확인, 리드 검색, 경품 재고 표시, 추첨 화면 동선을 다룹니다.

## 작업 원칙

- 요청 범위 밖의 UI/로직 리팩터링은 하지 않습니다.
- 기존 App Router, Tailwind, shadcn 스타일 컴포넌트 패턴을 유지합니다.
- 사용자 동선은 label, role, visible text 기반으로 접근 가능하게 유지합니다.
- Canvas 추첨판은 핵심 경험이므로 크기, 클릭 가능 상태, 결과 오버레이 회귀를 테스트로 확인합니다.
- API 연동은 `src/lib/draw-api.ts`에 모으고, 화면은 API 응답을 해석해 상태만 갱신합니다.
- `whatap / 1111` 입력은 mock 데이터가 아니라 현장 운영용 어드민 특수 계정입니다. 제거하거나 일반 방문자 검증 흐름으로 바꾸지 않습니다.

## 필수 검증

커밋 전 frontend 루트에서 다음을 통과시킵니다.

```bash
npm run verify
```

`verify`는 lint, typecheck, unit test, build, Playwright e2e를 순서대로 실행합니다.

## 테스트 기준

- 단위 테스트: API client, 폼 검증, 어드민 특수 계정 흐름처럼 빠르고 고립된 동작을 확인합니다.
- E2E 테스트: `eventCode`가 있는 실제 진입, 리드 검색 후 뽑기판 이동, 어드민 특수 계정 결과 표시를 확인합니다.
- 테스트용 selector는 사용자 기준 selector를 우선하고, canvas/overlay처럼 안정적인 접근점이 필요한 곳에만 `data-testid`를 씁니다.

## 문서 관리

이 파일은 100줄 이내로 유지합니다. 세부 실행 규칙은 `package.json`, `vitest.config.ts`, `playwright.config.ts`, 테스트 파일에 둡니다.
