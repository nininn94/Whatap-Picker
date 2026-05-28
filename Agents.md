# Whatap Picker Agent Guide

## 개요

Whatap Picker는 오프라인 부스 리드 모객을 위한 QR 기반 이벤트 운영 MVP입니다.

방문자는 QR 코드로 방문자용 프론트에 접근해 행사 참여 폼을 제출합니다. 운영자는 별도 어드민 페이지에서 새 행사 데이터베이스를 만들고, QR 코드를 발급하며, 출력용 PDF를 내려받고, 재고 현황과 폼 데이터 기반 뽑기 이력을 확인합니다.

핵심 흐름은 다음과 같습니다.

1. 어드민 새 행사 또는 새 데이터베이스 생성
2. 어드민 방문자용 QR 발급
3. 어드민 QR 출력용 PDF 다운로드
4. 방문자 QR 접근
5. 방문자 폼 제출
6. 어드민 재고 현황 확인
7. 어드민 폼 데이터 기반 뽑기 이력 확인

## 문서 위치

| 문서 | 위치 | 용도 |
| --- | --- | --- |
| 해커톤 기획안 | [`ai-hackathon-lead-draw-plan.md`](./ai-hackathon-lead-draw-plan.md) | 서비스 문제 정의, MVP 범위, 사용자 흐름, 정책 논의 |
| 해커톤 기획안 PDF | [`ai-hackathon-lead-draw-plan.pdf`](./ai-hackathon-lead-draw-plan.pdf) | 공유/발표용 PDF |
| 백엔드 개발 계획 | [`backend-development-plan.md`](./backend-development-plan.md) | Spring Boot API, 데이터 모델, 추첨 로직, 테스트 전략 |
| AI 코딩 시나리오 | [`ai-coding-scenarios.md`](./ai-coding-scenarios.md) | AI 코딩 도구용 화면 흐름, 운영 시나리오, 데모 흐름 |
| 프론트엔드 README | [`frontend/README.md`](./frontend/README.md) | 프론트엔드 실행 방법과 현재 기능 요약 |

## 작업 기준

- 새 구현은 [`ai-coding-scenarios.md`](./ai-coding-scenarios.md)의 시나리오와 완료 기준을 우선 확인합니다.
- 실제 API, 데이터 모델, 기술 스택을 확정해야 할 때만 [`backend-development-plan.md`](./backend-development-plan.md)를 참고합니다.
- 서비스 목적, MVP 범위, 운영 정책은 [`ai-hackathon-lead-draw-plan.md`](./ai-hackathon-lead-draw-plan.md)를 기준으로 해석합니다.
- 기존 문서와 충돌하는 변경은 먼저 충돌 지점을 명시하고 결정이 필요한 항목으로 분리합니다.
