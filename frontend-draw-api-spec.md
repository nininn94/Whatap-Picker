# 뽑기 페이지 API 스펙 (Frontend ↔ Backend)

> **대상**: 운영자용 뽑기 SPA를 만드는 프론트엔드 개발자
> **참조**: [`ai-hackathon-lead-draw-plan.md`](./ai-hackathon-lead-draw-plan.md), [`backend-development-plan.md`](./backend-development-plan.md)
> **베이스 URL**: `http://localhost:8080` (개발) — 운영 도메인은 별도 안내
> **인증**: JWT Bearer, 만료 8시간, 리프레시 토큰 없음 (만료 시 재로그인)

이 문서는 **뽑기 SPA가 호출할 API만** 추렸습니다. 설문 폼·QR·어드민 페이지는 백엔드가 Thymeleaf SSR로 직접 렌더링하므로 SPA가 호출할 일이 없습니다.

---

## 0. 화면 흐름 (운영자 시나리오)

```
[1] 로그인 화면
       │ POST /api/auth/login → accessToken 받음 (localStorage 저장)
       ▼
[2] 행사 선택 / 현재 행사 표시
       │ (행사 코드는 어드민이 사전 세팅, URL ?eventCode= 또는 환경설정)
       │ GET /api/prizes?eventDate=...  → 잔여 재고 사이드바 표시
       ▼
[3] 참여자 검색 화면
       │ 입력: 이름 + 휴대폰 뒷자리 4자리
       │ GET /api/leads/search?name=&phoneLast4=&eventCode=
       │   → 0건: "설문 미제출" 안내
       │   → 1건: 자동 선택
       │   → N건: 회사명/직급으로 선택 UI
       ▼
[4] 참여자 카드 (이름·회사·직급·AI 등급·이미 뽑기 여부)
       │ drawn=true 면 "이미 뽑기 완료" 비활성 + 결과 표시
       │ aiStatus=PENDING 이면 "분석 중..." (등급 hidden)
       │ aiStatus=FAILED 면 [재분석] 버튼 → POST /api/ai/lead-score
       ▼
[5] [뽑기 실행] 클릭
       │ POST /api/draw { leadId, eventDate }
       │   → 등수/경품명 (또는 OUT_OF_STOCK = 꽝)
       ▼
[6] 결과 애니메이션 + 등수/경품명 표시
       │ 결과 표시 = 지급 완료 (별도 버튼 없음)
       │ GET /api/prizes 재호출하여 사이드바 잔여 재고 갱신
       ▼
[7] [다음 참여자] → [3]
```

---

## 1. 공통 규칙

### 1.1 인증 헤더

로그인 이후 모든 요청에 다음 헤더를 붙입니다.

```
Authorization: Bearer <accessToken>
Content-Type: application/json   # POST/PATCH 시
```

토큰은 stateless JWT, 만료 8시간. `401 UNAUTHORIZED` 받으면 즉시 로그인 화면으로 리다이렉트.

### 1.2 권한

| 엔드포인트 | 필요 권한 |
| --- | --- |
| `POST /api/auth/login` | (비인증) |
| `GET /api/leads/search` | `OPERATOR` 또는 `ADMIN` |
| `POST /api/draw` | `OPERATOR` 또는 `ADMIN` |
| `GET /api/prizes` | `OPERATOR` 또는 `ADMIN` |
| `GET /api/draw/history` | `OPERATOR` 또는 `ADMIN` |
| `POST /api/ai/lead-score` | `OPERATOR` 또는 `ADMIN` |

### 1.3 에러 응답 포맷

모든 4xx/5xx 응답 본문은 다음 형식입니다.

```jsonc
{
  "code": "ALREADY_DRAWN",              // ErrorCode enum 이름 (분기 키로 사용)
  "message": "해당 일자에 이미 추첨에 참여하셨습니다.",
  "timestamp": "2026-05-28T10:05:12+09:00",
  "errors": [                            // 필드 검증 실패 시에만 채워짐
    { "field": "phoneLast4", "message": "4자리 숫자여야 합니다." }
  ]
}
```

**프론트는 `code` 값으로 분기 처리하세요.** 메시지는 사용자 표시용으로만.

### 1.4 주요 에러 코드 (뽑기 페이지에서 만날 수 있는 것)

| code | HTTP | 의미 | 권장 UX |
| --- | --- | --- | --- |
| `VALIDATION_FAILED` | 400 | 입력값 형식 오류 | `errors[].field` 옆에 인라인 메시지 |
| `UNAUTHORIZED` | 401 | 토큰 없음/만료 | 토큰 삭제 후 로그인으로 리다이렉트 |
| `FORBIDDEN` | 403 | 권한 부족 | "관리자 권한 필요" 토스트 |
| `NOT_FOUND` | 404 | 일반 리소스 없음 | "참여자/리드를 찾을 수 없습니다" |
| `EVENT_NOT_FOUND` | 404 | `eventCode` 없음 | "행사 코드 확인" |
| `EVENT_CLOSED` | 409 | 행사 상태가 OPEN이 아님 | 뽑기 비활성, "행사 마감" 배너 |
| `ALREADY_DRAWN` | 409 | 같은 행사에 이미 뽑기 완료 | 결과 카드 표시, 재뽑기 차단 |
| `OUT_OF_STOCK` | 409 | 모든 등수 재고 0 (꽝) | 꽝 결과 화면 (rank=null) |
| `TOO_MANY_REQUESTS` | 429 | IP 분당 한도 초과 | "잠시 후 다시 시도" 토스트 |
| `INTERNAL_ERROR` | 500 | 서버 오류 | "일시적 오류" 토스트 + 재시도 버튼 |

> **참고**: `OUT_OF_STOCK`은 에러가 아니라 정상 결과(꽝)로 처리해야 할 수 있습니다 — §4 `POST /api/draw` 응답 참고. 현재 백엔드 계획은 **응답 200으로 `outOfStock: true`를 내려주는 패턴**입니다.

### 1.5 CORS

운영자 SPA가 별도 도메인일 경우 백엔드 `security.cors.allowed-origins`에 출처 등록 필요. 개발 시 기본 허용 출처:

```
http://localhost:5173
https://picker-operator.whatap.io
```

다른 포트 사용 시 백엔드 담당에게 추가 요청해주세요.

### 1.6 날짜·시간 포맷

- 날짜: `YYYY-MM-DD` (예: `2026-05-28`)
- 시각: ISO-8601 + 타임존 (예: `2026-05-28T10:05:12+09:00`)
- 모든 응답 시각은 서버 시각 기준 (KST `Asia/Seoul`)

### 1.7 ID 포맷

모든 ID는 **UUID v4** 문자열 (예: `550e8400-e29b-41d4-a716-446655440000`).

---

## 2. `POST /api/auth/login` — 운영자 로그인

| 항목 | 값 |
| --- | --- |
| 권한 | 비인증 |
| 레이트 리밋 | 동일 IP에서 **5회 실패 시 15분 잠금** |

### 요청

```json
{
  "username": "operator01",
  "password": "..."
}
```

| 필드 | 타입 | 검증 |
| --- | --- | --- |
| `username` | string | 비어있지 않음 |
| `password` | string | 비어있지 않음 |

### 응답 200

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "tokenType": "Bearer",
  "expiresIn": 28800,
  "role": "OPERATOR",
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| 필드 | 의미 |
| --- | --- |
| `accessToken` | JWT, 매 요청 `Authorization: Bearer ...`에 사용 |
| `tokenType` | 항상 `"Bearer"` |
| `expiresIn` | 만료까지 남은 초 (8시간 = 28800) |
| `role` | `"OPERATOR"` 또는 `"ADMIN"` — UI 권한 분기에 사용 |
| `userId` | 운영자 UUID |

### 에러

| code | HTTP | 의미 |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | username/password 누락 |
| `UNAUTHORIZED` | 401 | 인증 실패 (오아이디/비번 불일치) |
| `TOO_MANY_REQUESTS` | 429 | 5회 실패 후 15분 잠금 중 |

### 프론트 처리 가이드

- 성공 시 `accessToken`을 `localStorage` 또는 `sessionStorage`에 저장
- `expiresIn` 기준 만료 직전(예: -5분)에 사용자에게 재로그인 안내
- 모든 후속 요청에서 401 받으면 토큰 삭제 → 로그인 화면

---

## 3. `GET /api/leads/search` — 참여자 검색

운영자가 이름 + 휴대폰 뒷자리 4자리로 설문 제출자를 조회합니다. **결과는 해당 행사 제출자만**.

### 요청

```
GET /api/leads/search?name=홍길동&phoneLast4=5678&eventCode=devops-day-2026
Authorization: Bearer <token>
```

| 쿼리 파라미터 | 타입 | 필수 | 검증 |
| --- | --- | --- | --- |
| `name` | string | ✅ | 1자 이상 |
| `phoneLast4` | string | ✅ | 정확히 숫자 4자리 (`^\d{4}$`) |
| `eventCode` | string | ✅ | 행사 슬러그 (예: `devops-day-2026`) |

### 응답 200

```json
{
  "eventCode": "devops-day-2026",
  "eventDate": "2026-05-28",
  "results": [
    {
      "leadId": "550e8400-e29b-41d4-a716-446655440000",
      "name": "홍길동",
      "jobFunction": "DEVELOPER",
      "jobLevel": "STAFF",
      "company": "와탭랩스",
      "drawn": false,
      "drawnAt": null,
      "aiStatus": "DONE",
      "grade": "B",
      "score": 68
    }
  ]
}
```

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `eventCode` | string | 검색한 행사 코드 (확인용) |
| `eventDate` | string (date) | 행사 일자 |
| `results[].leadId` | string (UUID) | 뽑기 실행 시 사용 |
| `results[].name` | string | `firstName + lastName` 합성 (성+이름) |
| `results[].jobFunction` | enum | §6.2 참고 |
| `results[].jobLevel` | enum | §6.3 참고 |
| `results[].company` | string | 동명이인 구분용 |
| `results[].drawn` | boolean | 이미 뽑기 완료 여부 |
| `results[].drawnAt` | string (ISO-8601) \| null | 추첨 시각 |
| `results[].aiStatus` | enum | `PENDING` / `DONE` / `RULE_ONLY` / `FAILED` / `MANUAL_OVERRIDE` |
| `results[].grade` | `"A"` \| `"B"` \| `"C"` \| null | AI 등급 (PENDING/FAILED면 null) |
| `results[].score` | int 0~100 \| null | 정렬·정밀도용 점수 |

### 응답 시나리오

| `results.length` | UI 처리 |
| --- | --- |
| `0` | "설문을 제출하지 않았거나 뒷자리/이름이 다릅니다" 안내 |
| `1` | 자동 선택, 바로 [4] 카드 표시 |
| `2+` | 회사명/직급/jobFunction을 함께 보여주는 선택 리스트 |

### `aiStatus` 별 UI

| status | UI |
| --- | --- |
| `DONE` / `RULE_ONLY` / `MANUAL_OVERRIDE` | `grade` + `score` 표시 (예: "A · 87점") |
| `PENDING` | "AI 분석 중..." 로딩 칩 (등급 hidden) — 잠시 후 재검색 권유 |
| `FAILED` | "분석 실패" + [재분석] 버튼 → §6.1 `POST /api/ai/lead-score` 호출 |

### 에러

| code | HTTP | 의미 |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | `phoneLast4` 형식 오류 등 |
| `UNAUTHORIZED` | 401 | 토큰 없음/만료 |
| `EVENT_NOT_FOUND` | 404 | `eventCode` 없음 |

---

## 4. `POST /api/draw` — 뽑기 실행

선택된 참여자에 대해 추첨을 실행합니다. **결과 반환 시점 = 지급 완료**로 처리됩니다 (별도 지급 완료 버튼 없음).

### 요청

```json
{
  "leadId": "550e8400-e29b-41d4-a716-446655440000",
  "eventDate": "2026-05-28"
}
```

| 필드 | 타입 | 필수 | 비고 |
| --- | --- | --- | --- |
| `leadId` | string (UUID) | ✅ | §3 검색 결과의 `leadId` |
| `eventDate` | string (date) | ✅ | §3 응답의 `eventDate` 그대로 |

### 응답 200 — 당첨

```json
{
  "rank": 3,
  "prizeName": "스타벅스 1만원권",
  "drawnAt": "2026-05-28T10:05:12+09:00",
  "drawnBy": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "operator01"
  },
  "outOfStock": false
}
```

### 응답 200 — 꽝 (재고 전부 소진)

```json
{
  "rank": null,
  "prizeName": null,
  "drawnAt": "2026-05-28T10:05:12+09:00",
  "drawnBy": { "id": "...", "username": "operator01" },
  "outOfStock": true
}
```

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `rank` | int 1~5 \| null | 당첨 등수 (꽝이면 null) |
| `prizeName` | string \| null | 경품명 (꽝이면 null) |
| `drawnAt` | string (ISO-8601) | 추첨 시각 (서버 기준) |
| `drawnBy.id` | string (UUID) | 추첨 실행한 운영자 ID |
| `drawnBy.username` | string | 화면 표시용 |
| `outOfStock` | boolean | `true`면 꽝, `false`면 당첨 |

### 에러

| code | HTTP | 의미 | 권장 UX |
| --- | --- | --- | --- |
| `VALIDATION_FAILED` | 400 | leadId/eventDate 형식 오류 | 인라인 메시지 |
| `NOT_FOUND` | 404 | leadId가 존재하지 않음 | "참여자를 찾을 수 없음" |
| `EVENT_NOT_FOUND` | 404 | 행사 일자에 해당하는 행사가 없음 | "행사 확인 필요" |
| `EVENT_CLOSED` | 409 | 행사 상태가 OPEN이 아님 | "행사가 마감되었습니다" |
| `ALREADY_DRAWN` | 409 | 같은 (leadId, event) 추첨 이력 있음 | 결과 카드 다시 표시 (검색 결과의 `drawn=true`와 동일) |

> `OUT_OF_STOCK`은 에러가 아닌 **응답 200 + `outOfStock: true`**로 옵니다. 꽝 화면(애니메이션)을 따로 디자인해주세요.

### 프론트 처리 가이드

- 버튼 더블 클릭 방지: 호출 중에는 disable + spinner
- 응답 후 §5 `GET /api/prizes`를 다시 호출해 잔여 재고 사이드바 갱신
- 결과 애니메이션은 응답 도착 후 시작 (서버 응답이 진실 — 클라이언트 룰렛 시뮬레이션 금지)
- `ALREADY_DRAWN` 받으면 §6.2 `GET /api/draw/history` 호출해서 기존 결과 표시

---

## 5. `GET /api/prizes` — 경품 재고 현황

뽑기 화면 사이드바에 표시할 등수별 잔여 수량.

### 요청

```
GET /api/prizes?eventDate=2026-05-28
Authorization: Bearer <token>
```

| 쿼리 파라미터 | 타입 | 필수 |
| --- | --- | --- |
| `eventDate` | string (date) | ✅ |

### 응답 200

```json
{
  "eventDate": "2026-05-28",
  "prizes": [
    { "rank": 1, "name": "AirPods Pro",       "initial": 2,  "awarded": 1,  "remaining": 1 },
    { "rank": 2, "name": "스타벅스 2만원권",   "initial": 5,  "awarded": 3,  "remaining": 2 },
    { "rank": 3, "name": "스타벅스 1만원권",   "initial": 20, "awarded": 12, "remaining": 8 },
    { "rank": 4, "name": "와탭 굿즈 세트",     "initial": 30, "awarded": 22, "remaining": 8 },
    { "rank": 5, "name": "와탭 스티커",        "initial": 50, "awarded": 50, "remaining": 0 }
  ]
}
```

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `prizes[].rank` | int 1~5 | 등수 |
| `prizes[].name` | string | 경품명 |
| `prizes[].initial` | int | 어드민이 설정한 초기 수량 |
| `prizes[].awarded` | int | 지금까지 당첨된 수 |
| `prizes[].remaining` | int | 잔여 수량 (`initial - awarded`) |

### 프론트 처리 가이드

- 뽑기 화면 진입 시 한 번 호출 + 매 추첨 직후 갱신
- `remaining == 0` 등수는 회색 처리
- 모든 `remaining`이 0이면 **상단 배너로 "모든 경품 소진 (꽝만 가능)"** 안내 권장

### 에러

| code | HTTP | 의미 |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | eventDate 형식 오류 |
| `UNAUTHORIZED` | 401 | 토큰 없음/만료 |
| `EVENT_NOT_FOUND` | 404 | 행사 일자에 해당 행사 없음 |

---

## 6. 보조 엔드포인트

### 6.1 `POST /api/ai/lead-score` — AI 등급 재분석 (수동 트리거)

검색 결과의 `aiStatus`가 `FAILED`일 때 [재분석] 버튼에서 호출.

#### 요청

```json
{
  "leadId": "550e8400-e29b-41d4-a716-446655440000",
  "force": false
}
```

- `force=true`: 이미 `DONE` 상태여도 재분석 (운영자 화면에서는 일반적으로 `false`로 보내고, 어드민 페이지가 `true` 사용)

#### 응답 200

```json
{
  "leadId": "...",
  "aiStatus": "DONE",
  "grade": "A",
  "score": 87,
  "reason": "결정권자(임원) + 1년 내 교체 계획 + 현재 솔루션 불만족 시그널",
  "nextAction": "MEETING_PROPOSAL_24H",
  "source": "RULE_LLM_HYBRID",
  "ruleHits": ["EXEC_PLAN_HINT"],
  "modelName": "qwen2.5:1.5b",
  "modelVersion": "sha256:abc...",
  "attemptCount": 1,
  "lastAttemptedAt": "2026-05-28T10:01:00+09:00"
}
```

뽑기 화면에서는 `aiStatus`, `grade`, `score`만 사용해도 충분합니다. 나머지는 운영자에게 노출하지 않아도 됩니다.

> ⚠️ LLM 호출은 1~3초 소요됩니다. UI는 비동기 처리 + spinner 권장. 응답 후 §3 검색을 다시 호출해 화면 갱신.

### 6.2 `GET /api/draw/history` — 추첨 이력 조회

`ALREADY_DRAWN`을 받은 직후 기존 결과를 다시 표시할 때 사용.

#### 요청

```
GET /api/draw/history?leadId=...&eventDate=2026-05-28
Authorization: Bearer <token>
```

> 응답 스키마는 백엔드에서 확정 예정. 예상: `{ "rank": int|null, "prizeName": string|null, "drawnAt": ISO, "outOfStock": bool, "drawnBy": { ... } }` (= `POST /api/draw`와 동일 형태). 백엔드 확정되면 이 문서에 반영합니다.

---

## 7. enum 값 카탈로그

뽑기 SPA 화면에서 표시할 때 사용하는 한국어 라벨 매핑. **value는 enum 고정**, 라벨은 화면 표시용.

### 7.1 `aiStatus`

| value | 라벨 | UI |
| --- | --- | --- |
| `PENDING` | 분석 중 | 로딩 칩 |
| `DONE` | 완료 | grade 표시 |
| `RULE_ONLY` | 완료 (룰) | grade 표시 (동일) |
| `FAILED` | 분석 실패 | [재분석] 버튼 |
| `MANUAL_OVERRIDE` | 수동 조정 | grade 표시 (어드민이 직접 수정) |

### 7.2 `jobFunction` (15종)

| value | 라벨 |
| --- | --- |
| `DEVOPS` | DevOps |
| `IT_OPS` | IT 운영 |
| `SRE` | SRE |
| `DEVELOPER` | 개발자 (프론트엔드, 백엔드) |
| `R_AND_D` | R&D / 연구원 |
| `IT_PLANNING` | IT 기획 |
| `SECURITY` | 보안 |
| `CONSULTING` | 컨설팅 (엔지니어) |
| `DATA` | 데이터 |
| `INFRA` | 전산 / 인프라 |
| `MARKETING_SALES` | 마케팅 / 영업 |
| `FINANCE_BACKOFFICE` | 재무 / 경영지원 |
| `EXECUTIVE` | 임원 / 대표 |
| `STUDENT_FREELANCER` | 학생 / 프리랜서 |
| `OTHER` | 기타 |

### 7.3 `jobLevel` (5종)

| value | 라벨 |
| --- | --- |
| `TOP_EXECUTIVE` | 최종 결정자 (대표/임원) |
| `SENIOR_MGR` | 상위 관리자 (부장급) |
| `MID_MGR` | 중간 관리자 (차/과장급) |
| `STAFF` | 실무자 |
| `OTHER` | 기타 |

### 7.4 `grade`

| value | 라벨 | 색상 권장 |
| --- | --- | --- |
| `A` | A등급 | 빨강/금색 강조 |
| `B` | B등급 | 파랑 |
| `C` | C등급 | 회색 |
| `null` | 미분류 | (분석 중/실패 상태와 함께 표시) |

### 7.5 `nextAction` (필요 시 툴팁용)

`MEETING_PROPOSAL_24H` / `MEETING_PROPOSAL_WEEK` / `PRODUCT_INTRO_EMAIL` / `TECH_CONSULT_EMAIL` / `NURTURE_NEWSLETTER` / `WEBINAR_INVITE` / `NO_ACTION`

운영자 화면에서는 노출 안 해도 무방 (어드민 페이지에서 주로 사용).

---

## 8. 백엔드 구현 현황 (2026-05-28 기준)

| 항목 | 상태 |
| --- | --- |
| `POST /api/auth/login` | ✅ 구현 완료 (Spring Security + JWT) |
| `JwtAuthenticationFilter` 및 권한 매트릭스 | ✅ 구현 완료 |
| `ErrorCode` / `ApiErrorResponse` | ✅ 정의 완료 |
| `GET /api/leads/search` | 🟡 모델·DB 스키마 완료, 컨트롤러 구현 진행 중 (다른 세션) |
| `POST /api/draw` | 🟡 동일 — DrawHistory 테이블 존재, 컨트롤러 구현 진행 중 |
| `GET /api/prizes` | 🟡 동일 |
| `GET /api/draw/history` | 🟡 동일 |
| `POST /api/ai/lead-score` | 🟡 Ollama + Spring AI 파이프라인 구현 진행 중 |

**프론트는 Mock 응답으로 먼저 화면을 만들고**, 백엔드가 끝나는 대로 endpoint만 갈아끼우는 흐름을 권장합니다. 본 스펙의 응답 스키마는 백엔드 계획서 §4 기준으로 확정값이며, 변경 시 이 문서가 먼저 업데이트됩니다.

---

## 9. 개발 환경 빠른 시작

```bash
# 1) 백엔드 기동 (저장소 루트에서)
export JWT_SECRET=$(openssl rand -base64 32)
export BOOTSTRAP_ADMIN_PASSWORD=ChangeMe!2026
docker compose up -d postgres ollama
docker exec -it $(docker compose ps -q ollama) ollama pull qwen2.5:1.5b
docker compose up -d app

# 2) 헬스체크
curl http://localhost:8080/actuator/health

# 3) 로그인 테스트 (초기 어드민)
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"ChangeMe!2026"}'

# 4) Swagger UI (전체 API 자동 문서)
open http://localhost:8080/swagger-ui.html
```

---

## 10. 변경 이력

| 일자 | 내용 |
| --- | --- |
| 2026-05-28 | 초안 작성 — 뽑기 페이지 SPA용 6개 엔드포인트 정리 |

---

> 질문/스키마 변경 요청은 백엔드 담당(@김관진)에게 슬랙으로 핑하거나 본 저장소 이슈로 남겨주세요.
