# Whatap Picker Agent Guide

## 개요

Whatap Picker는 오프라인 부스 리드 모객을 위한 QR 기반 이벤트 운영 MVP입니다.

서비스는 두 개의 프론트 흐름으로 나뉩니다. 첫 번째 프론트는 QR로 접근하는 방문자 폼과, 관리자가 직접 URL로 접근하는 어드민 화면을 함께 가집니다. 두 번째 프론트는 실제 행사장에서 띄워두는 뽑기판 화면입니다.

핵심 흐름은 다음과 같습니다.

1. 관리자가 어드민 URL로 접근
2. 어드민에서 새 행사 또는 새 데이터베이스 생성
3. 어드민에서 방문자용 QR 발급 및 PNG 이미지 다운로드
4. 방문자가 QR로 폼 화면 접근
5. 방문자가 폼 제출
6. 행사장 뽑기판에서 방문자의 일부 식별 정보 입력
7. QR 폼 제출자 확인 후 뽑기 진행
8. 어드민에서 재고 현황과 폼 데이터 기반 뽑기 이력 확인

## 문서 위치

| 문서 | 위치 | 용도 |
| --- | --- | --- |
| API 스펙 | [`docs/API.md`](./docs/API.md) | 코드 기반 현행 REST API 명세 (공개/어드민/대시보드/SSR) |
| 서버 아키텍처 | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | 기술 스택, 소스 구조, 요청 흐름, 보안 |
| 배포 가이드 | [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | AWS EC2 + GitHub Actions 배포 |
| 프론트엔드 README | [`frontend/README.md`](./frontend/README.md) | 프론트엔드 실행 방법과 현재 기능 요약 |
| 초기 기획/시나리오 (아카이브) | [`docs/archive/`](./docs/archive) | 해커톤 기획안·시나리오·초기 백엔드 계획. 현행 코드와 차이 있을 수 있음 |

## 작업 기준

- 모든 작업 내용은 작은 단위로 나누고, 각 단위가 완료되면 `main` 브랜치에 푸시하면서 진행합니다.
- 새 구현의 사실 기준은 [`docs/API.md`](./docs/API.md) 와 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md). 두 문서는 코드 변경 시 함께 갱신합니다.
- 초기 기획 의도/배경 확인이 필요할 때만 [`docs/archive/`](./docs/archive) 를 참고합니다.
- 기존 문서와 충돌하는 변경은 먼저 충돌 지점을 명시하고 결정이 필요한 항목으로 분리합니다.
