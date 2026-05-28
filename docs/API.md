# WhaTap Picker — API 스펙

> 본 문서는 `src/main/java/.../*Controller.java` 의 현재 코드를 기반으로 자동 정리한 REST API 명세입니다.
> Path/Body/Auth/Response 모두 실제 핸들러 시그니처와 일치합니다.

---

## 1. 공통 규칙

### 인증

| 클래스 | 방식 |
| --- | --- |
| 공개 (`/api/auth/*`, `/api/leads`, `/api/leads/search`, `/api/draw`, `/api/draw/history`, `/api/prizes`, `/api/events`) | 인증 없음 |
| ADMIN 전용 (`/api/admin/**`, `/api/ai/lead-score`, `/api/admin/leads/*`) | JWT Bearer 헤더 또는 HttpOnly 쿠키 (`jwt`) + `ROLE_ADMIN` |
| 페이지 (`/admin/**`) | SSR + Spring Security, 미인증 시 `/admin/login` 으로 리다이렉트 |

JWT 는 `/api/auth/login` 응답으로 받음. 동시에 HttpOnly 쿠키도 발급 (`SameSite=None+Secure` for HTTPS, `Lax` for HTTP).

### 에러 응답 (`io.whatap.picker.common.ErrorCode`)

```json
{
  "code": "EVENT_NOT_FOUND",
  "message": "행사를 찾을 수 없습니다.",
  "timestamp": "2026-05-28T12:00:00Z",
  "errors": []
}
```

| code | HTTP | 의미 |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | 입력 검증 실패 |
| `SCHEMA_INVALID` | 400 | 폼 스키마 무효 |
| `UNAUTHORIZED` | 401 | 인증 필요 |
| `FORBIDDEN` | 403 | 권한 없음 |
| `NOT_FOUND` | 404 | 리소스 없음 |
| `EVENT_NOT_FOUND` | 404 | 행사 없음 |
| `EVENT_CLOSED` | 409 | 행사가 OPEN 상태 아님 |
| `EVENT_FORM_LOCKED` | 409 | 응답 시작 후 폼 변경 시도 |
| `PERSONAL_EMAIL_NOT_ALLOWED` | 409 | 개인 메일 도메인 사용 |
| `SURVEY_PAYLOAD_MISMATCH` | 409 | 모니터링 상태와 분기 응답 불일치 |
| `CONSENT_REQUIRED` | 409 | 필수 동의 누락 |
| `ALREADY_DRAWN` | 409 | 동일 행사에서 이미 추첨 참여 |
| `OUT_OF_STOCK` | 409 | 모든 등수 재고 소진 |
| `LOCKED_TEMPLATE` | 409 | 시스템 기본 템플릿 수정 |
| `IN_USE` | 409 | 사용 중인 리소스 삭제 시도 |
| `TOO_MANY_REQUESTS` | 429 | 분당 제출 한도 초과 |
| `INTERNAL_ERROR` | 500 | 서버 내부 오류 |

### 콘텐츠 협상

- 모든 JSON 응답 `application/json; charset=UTF-8`
- CSV 응답은 `attachment; filename=...` Content-Disposition 헤더 포함, body 는 UTF-8 BOM CSV (RFC 4180)
- 다운로드 클라이언트는 `Accept: */*` 권장 (브라우저 native `<a download>` 사용)

---

## 2. 공개 API

### 2.1 인증

#### `POST /api/auth/login`
관리자/운영자 로그인.

Body:
```json
{ "username": "admin", "password": "string(>=8)" }
```

Response 200:
```json
{
  "accessToken": "eyJhbGciOi...",
  "tokenType": "Bearer",
  "expiresIn": 28800,
  "role": "ADMIN | OPERATOR",
  "userId": "uuid"
}
```
Set-Cookie 헤더로 `jwt` HttpOnly 쿠키 동시 발급.

#### `POST /api/auth/logout`
쿠키 `jwt` 를 `maxAge=0` 으로 덮어써 제거.

---

### 2.2 행사

#### `GET /api/events?status=OPEN`
방문자/뽑기판이 사용하는 공개 행사 목록. 기본 `OPEN` 만, `?status=CLOSED` 등도 가능.

Response 200:
```json
[
  {
    "eventCode": "evt-x4p2k9",
    "label": "DEVOPS DAY 2026",
    "eventDate": "2026-05-28",
    "endDate": null,
    "status": "OPEN"
  }
]
```

---

### 2.3 리드 (Lead)

#### `POST /api/leads`
방문자 설문 제출. 분당 rate-limit, 동일 `(phone, eventCode)` 는 upsert.

Body (`LeadSubmitRequest`):
```json
{
  "eventCode": "evt-x4p2k9",
  "firstName": "관진",
  "lastName": "김",
  "company": "WhaTap Labs",
  "email": "gjkim@whatap.io",
  "phone": "01012345678",
  "industry": "IT_SERVICES",
  "jobFunction": "DEVOPS",
  "jobLevel": "MID_MGR",
  "companySize": "MID",
  "employeeCountRange": "R_201_500",
  "monitoringStatus": "USING_OTHER",
  "surveyPayload": { /* 분기별 nested object */ },
  "adoptionBlocker": "COST | INTERNAL_PERSUASION | ...",
  "interestProducts": ["APM", "BPM", "..."],
  "planWithinYear": "A_OPEN | B_EXPAND | C_REPLACE | D_NEW_ADOPT",
  "consultationPreference": "ONSITE_MEETING | EMAIL_OR_PHONE",
  "privacyConsent": true,
  "marketingConsent": true
}
```

Validations:
- `phone` 정규식 `^[0-9+\-\s]+$` (서버 측 `PhoneNormalizer` 가 `010xxxxxxxx` 형태로 정규화)
- `email` 정규식 `^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$`
- `interestProducts` 비어있지 않음
- `privacyConsent`, `marketingConsent` 모두 `true`
- `monitoringStatus` 와 `surveyPayload` 의 분기(`whatap` / `other` / `notUsing`) 일치
- `jobFunction != STUDENT_FREELANCER` 이면 회사 메일 강제 (gmail/naver/kakao 등 11종 도메인 차단)

Response 200:
```json
{
  "leadId": "uuid",
  "eventCode": "evt-x4p2k9",
  "eventId": "uuid",
  "createdAt": "2026-05-28T...",
  "retentionUntil": "2028-05-28"
}
```

Side effects:
- `LeadSubmittedEvent` publish → 비동기로 (a) AI 스코어링, (b) Google Sheets append (활성 시) 실행

#### `GET /api/leads/search?name=&phoneLast4=&eventCode=`
뽑기판 운영자가 응답자를 검색. 이름 + 전화번호 뒷 4자리 + 행사코드 모두 일치.

Response 200:
```json
{
  "eventCode": "evt-x4p2k9",
  "eventDate": "2026-05-28",
  "results": [
    {
      "leadId": "uuid",
      "name": "김관진",
      "jobFunction": "DEVOPS",
      "jobLevel": "MID_MGR",
      "company": "WhaTap Labs",
      "drawn": false,
      "drawnAt": null,
      "ai": null
    }
  ]
}
```

---

### 2.4 추첨

#### `POST /api/draw`
뽑기 실행. 행사·리드 단위 1회만 가능.

Body:
```json
{ "leadId": "uuid", "eventCode": "evt-x4p2k9" }
```

Response 200:
```json
{
  "rank": 3,
  "prizeName": "다이슨 무선청소기",
  "outOfStock": false,
  "drawnAt": "2026-05-28T15:43:00+09:00",
  "drawnBy": { "id": "uuid", "username": "operator1" }
}
```

`outOfStock=true` 인 경우 `rank=null`, `prizeName=null` — 꽝. 4xx 아님(정상 처리).

Errors: `EVENT_NOT_FOUND`, `ALREADY_DRAWN`.

#### `GET /api/draw/history?leadId=&eventCode=`
특정 리드의 행사 추첨 이력 조회.

Response 200:
```json
{ "drawn": true, "drawnAt": "...", "awardedRank": 3, "prizeId": "uuid" }
```
또는 `{ "drawn": false }`.

---

### 2.5 경품

#### `GET /api/prizes?eventCode=evt-x4p2k9`
행사 경품 잔량 조회. 뽑기판이 사용.

Response 200:
```json
{
  "eventCode": "evt-x4p2k9",
  "eventDate": "2026-05-28",
  "prizes": [
    { "rank": 1, "name": "다이슨 무선청소기", "initial": 1, "awarded": 0, "remaining": 1 },
    { "rank": 2, "name": "에어팟 프로", "initial": 3, "awarded": 1, "remaining": 2 }
  ]
}
```

---

## 3. 어드민 API — `ROLE_ADMIN` 필요

### 3.1 행사 관리 — `/api/admin/events`

| Method | Path | 동작 |
| --- | --- | --- |
| `POST` | `/api/admin/events` | 행사 생성 (eventCode 미지정 시 `evt-XXXXXX` 자동 생성) |
| `GET` | `/api/admin/events` | 전체 행사 목록 (관리용, 모든 상태) |
| `GET` | `/api/admin/events/{id}` | 단건 조회 |
| `PATCH` | `/api/admin/events/{id}` | label / eventDate / endDate / status 부분 수정 |
| `PUT` | `/api/admin/events/{id}/form` | `formTemplateId` 매핑 변경 (form_locked=true 면 거부) |
| `DELETE` | `/api/admin/events/{id}` | 행사 삭제 (추첨 이력 있으면 거부) |
| `POST` | `/api/admin/events/{id}/regenerate-qr` | QR 캐시 무효화 |
| `PUT` | `/api/admin/events/{id}/sheets` | Google Sheets 매핑 설정 (`spreadsheetId`/`sheetName`/`enabled`) |
| `POST` | `/api/admin/events/{id}/sheets/sync` | 행사 내 모든 리드 Sheets 재동기화 |

Create body:
```json
{
  "eventCode": "evt-mybooth",  // optional
  "eventDate": "2026-05-28",
  "endDate": "2026-05-29",
  "label": "DEVOPS DAY 2026",
  "formTemplateId": "uuid",     // optional
  "status": "OPEN"              // default DRAFT
}
```

Update body 는 모두 optional, null 이면 변경 없음.

Sheets config body:
```json
{ "spreadsheetId": "1AbCdEf...", "sheetName": "Leads", "enabled": true }
```

Sheets sync response:
```json
{ "total": 42, "ok": 41, "fail": 1, "firstError": "..." }
```

### 3.2 경품 관리 — `/api/admin/events/{eventId}/prizes`, `/api/admin/prizes/{prizeId}`

| Method | Path | 동작 |
| --- | --- | --- |
| `POST` | `/api/admin/events/{eventId}/prizes` | 등수별 bulk upsert |
| `PATCH` | `/api/admin/prizes/{prizeId}` | 단건 부분 수정 |
| `DELETE` | `/api/admin/prizes/{prizeId}` | 당첨 이력 없을 때만 삭제 가능 |

Bulk upsert body:
```json
{ "prizes": [ { "rank": 1, "name": "다이슨", "initialQty": 1 } ] }
```
- 초기 수량은 이미 당첨된 양보다 작게 설정 불가
- 증감 시 remaining 도 동일하게 조정

### 3.3 폼 템플릿 — `/api/admin/forms`

| Method | Path | 동작 |
| --- | --- | --- |
| `GET` | `/api/admin/forms` | 목록 (id/name/isSystemDefault/version/updatedAt) |
| `GET` | `/api/admin/forms/{id}` | 단건 (schema JSON 포함) |
| `POST` | `/api/admin/forms/clone` | 다른 템플릿 복사 |
| `PUT` | `/api/admin/forms/{id}` | 수정 (system_default 는 거부, version 일치 필요) |
| `DELETE` | `/api/admin/forms/{id}` | 사용 중이거나 system_default 면 거부 |

Clone body: `{ "sourceId": "uuid", "name": "새 이름" }`
Update body: `{ "name": "...", "schema": { /* JsonNode */ }, "version": 3 }`

### 3.4 리드 — `/api/admin/leads`

| Method | Path | 동작 |
| --- | --- | --- |
| `GET` | `/api/admin/leads` | 페이지/필터 (eventCode, industry, jobFunction, jobLevel, companySize, employeeCountRange, monitoringStatus, planWithinYear, consultationPreference, adoptionBlocker, grade, q (이름/이메일/전화/회사 OR 검색), page, size) |
| `GET` | `/api/admin/leads/{id}` | 상세 (surveyPayload 포함) |
| `POST` | `/api/admin/leads/insights` | 필터된 결과 LLM 인사이트 (body: `{label, filters, totalElements, gradeDistribution, segmentCounts}`) |
| `GET` | `/api/admin/leads/export.csv` | 필터 적용 CSV 다운로드 |
| `DELETE` | `/api/admin/leads/expired` | retention_until 지난 리드 hard delete |

List response:
```json
{
  "content": [ /* 평탄화된 리드 객체 */ ],
  "totalElements": 234,
  "totalPages": 5,
  "page": 0,
  "size": 50
}
```

각 리드는 모든 surveyPayload 필드가 top-level 로 평탄화돼 있음 (`whatapProficiency`, `commercialProducts`, `annualBudget` 등). 어드민 wide table 에서 그대로 사용.

### 3.5 AI 스코어링 — `/api/ai/lead-score`, `/api/admin/leads/*`

| Method | Path | 동작 |
| --- | --- | --- |
| `POST` | `/api/ai/lead-score` | 리드 1건 강제 (재)스코어링. body `{leadId, force?}` |
| `PATCH` | `/api/admin/leads/{leadId}/score` | Stage 수동 override (`MANUAL_OVERRIDE`). body `{grade, score, nextAction, reason}` 모두 optional |
| `GET` | `/api/admin/leads/pending-scores` | PENDING/FAILED 카운트 + 목록 |
| `POST` | `/api/admin/leads/rescore` | 일괄 재스코어링. body `{eventCode?, aiStatus?}` (없으면 PENDING+FAILED) |

`Grade` enum: `MQL`, `KNOWN_LEAD` (2 단계). RuleEngine 정책:
- **MQL**: `consultationPreference=ONSITE_MEETING` OR `planWithinYear ∈ {C_REPLACE, D_NEW_ADOPT}`
- 그 외: **KNOWN_LEAD**

### 3.6 추첨 당첨자 — `/api/admin/draw/winners`

| Method | Path | 동작 |
| --- | --- | --- |
| `GET` | `/api/admin/draw/winners?eventCode=` | 행사 당첨자 목록 (등수 + 경품 + 리드 join) |
| `GET` | `/api/admin/draw/winners.csv?eventCode=` | 위 결과 CSV |

### 3.7 대시보드 — `/api/admin/dashboard`

| Method | Path | 동작 |
| --- | --- | --- |
| `GET` | `/api/admin/dashboard/summary?eventCode=` | leadCount / drawCount / wantsConsultationCount / emailRejectionCount / validEmailRatio |
| `GET` | `/api/admin/dashboard/timeline?from=&to=` | 일자별 series `{date, submitted, drawn, consultations}` |
| `GET` | `/api/admin/dashboard/segments?eventCode=` | industry / jobFunction / jobLevel / companySize / monitoringStatus 카운트 |
| `GET` | `/api/admin/dashboard/intent?eventCode=` | interestProducts / planWithinYear / consultationPreference / adoptionBlocker |
| `GET` | `/api/admin/dashboard/prizes?eventCode=` | 행사 경품 진행률 + outOfStockCount |
| `GET` | `/api/admin/dashboard/monitoring?eventCode=` | 상용툴/오픈소스/만족도/교체이유 |
| `GET` | `/api/admin/dashboard/whatap-users?eventCode=` | 와탭 사용자 활용도 분포 + 평균 + 필요 도움 |
| `POST` | `/api/admin/dashboard/insights?eventCode=` | 행사 단위 LLM 인사이트 생성 |

### 3.8 대시보드 CSV 내보내기 — `/api/admin/dashboard/export`

| Method | Path | 동작 |
| --- | --- | --- |
| `GET` | `/api/admin/dashboard/export/summary.csv?eventCode=` | 요약 |
| `GET` | `/api/admin/dashboard/export/timeline.csv` | 타임라인 |
| `GET` | `/api/admin/dashboard/export/segments.csv?eventCode=` | 세그먼트 |
| `GET` | `/api/admin/dashboard/export/intent.csv?eventCode=` | 관심/도입의사 |
| `GET` | `/api/admin/dashboard/export/monitoring.csv?eventCode=` | 모니터링 |

### 3.9 사용자 관리 — `/api/admin/users`

| Method | Path | 동작 |
| --- | --- | --- |
| `POST` | `/api/admin/users` | 계정 생성 (`{username, password, role}`) |
| `GET` | `/api/admin/users` | 목록 |
| `PATCH` | `/api/admin/users/{id}` | 부분 수정 (`enabled` / `role` / `newPassword`) |
| `DELETE` | `/api/admin/users/{id}` | 삭제 (본인 계정 거부) |

### 3.10 시스템 설정 — `/api/admin/settings`

| Method | Path | 동작 |
| --- | --- | --- |
| `GET` | `/api/admin/settings` | Anthropic 키 마스킹 + Google 서비스 계정 이메일 표시. raw 값은 절대 반환하지 않음 |
| `PUT` | `/api/admin/settings` | `anthropic`/`google` 분기 부분 업데이트. Google JSON 은 저장 전 Jackson 으로 형식 검증 (type=service_account, private_key 존재, client_email 형식) |
| `DELETE` | `/api/admin/settings/anthropic/api-key` | Anthropic 키 초기화 |
| `DELETE` | `/api/admin/settings/google/service-account` | Google JSON 초기화 |
| `POST` | `/api/admin/settings/google/test` | `{spreadsheetId}` 로 Sheets 메타 조회해 권한 확인 |

PUT body 형태:
```json
{
  "anthropic": { "apiKey": "sk-ant-...", "model": "claude-haiku-4-5", "enabled": true },
  "google":    { "serviceAccountJson": "{...}" }
}
```

---

## 4. SSR / 페이지 라우트

| Method | Path | 권한 | 비고 |
| --- | --- | --- | --- |
| `GET` | `/` | 공개 | `/admin` 으로 리다이렉트 |
| `GET` | `/admin/login` | 공개 | 로그인 폼 |
| `GET` | `/admin` | ADMIN | 홈 (행사 카드 + KPI) |
| `GET` | `/admin/events` | ADMIN | 행사 관리 |
| `GET` | `/admin/events/{id}/prizes` | ADMIN | 경품 재고 |
| `GET` | `/admin/events/{id}/preview` | ADMIN | 어드민 미리보기 (상태 무관) |
| `GET` | `/admin/leads` | ADMIN | 리드 wide table (URL 쿼리로 필터 초기화) |
| `GET` | `/admin/leads/{id}` | ADMIN | 리드 상세 |
| `GET` | `/admin/forms` | ADMIN | 폼 템플릿 목록 |
| `GET` | `/admin/forms/{id}/edit` | ADMIN | 폼 JSON 에디터 |
| `GET` | `/admin/users` | ADMIN | 계정 관리 |
| `GET` | `/admin/settings` | ADMIN | LLM 키 + Google JSON 설정 |
| `GET` | `/admin/dashboard` | ADMIN | 차트 11종 + AI 인사이트 |
| `GET` | `/survey/{eventCode}` | 공개 | 설문 폼 (행사 상태가 OPEN 인 경우만) |
| `GET` | `/survey/{eventCode}/complete` | 공개 | 완료 안내 |
| `GET` | `/survey/{eventCode}/closed` | 공개 | 마감 안내 |
| `GET` | `/event/{eventCode}/qr` | 공개 | 부스 풀스크린 QR 페이지 |
| `GET` | `/event/{eventCode}/qr.png` | 공개 | QR PNG (ZXing 동적 생성) |

---

## 5. 외부 시스템

### 5.1 LLM 게이트웨이

`io.whatap.picker.ai.client.LlmGateway` 가 다음 순서로 시도:

1. **Rule engine** (`RuleEngine`) — deterministic, LLM 호출 0회 우선
2. **Ollama** (`qwen2.5:1.5b`) — 로컬, 본 패키지 기본
3. **Anthropic Claude** — `app_setting.anthropic.api_key` 등록 시 폴백
4. 모두 실패 → `AiStatus.FAILED`, 어드민 재시도 가능

### 5.2 Google Sheets 자동 연동

리드 제출 시 `LeadSubmittedEvent` → `SheetsSyncService.onLeadSubmitted` (비동기) → 다음 조건 만족 시 한 행 append:

- 행사에 `sheets_enabled=true` 이고 `spreadsheet_id` 설정됨
- `app_setting.google.service_account_json` 등록됨
- 시트가 해당 서비스 계정에 **Editor** 공유됨

첫 append 전 헤더가 비어있으면 18컬럼 헤더 자동 작성 (`ensureHeader`).

실패는 로그만 남기고 본 제출에는 영향 없음.

---

## 6. Rate limit / 보안 정책

- **`POST /api/leads`** — 분당 한도 (Bucket4j 기반, `leadSubmitRateLimiter` qualifier).
  기본 IP 당 분당 10회 — `security.rate-limit.lead-submit-per-min-per-ip`. 초과 시 `TOO_MANY_REQUESTS`
- **`POST /api/auth/login`** — Bucket4j 기반 `loginRateLimiter`. 기본 IP 당 15분에 5회
  — `security.rate-limit.login-attempts-per-15min`. 성공 시 reset
- **JWT secret** — `JWT_SECRET` 환경변수, 32 바이트 이상 강제
- **CSRF** — disabled (REST + JWT)
- **세션** — STATELESS
- **CORS** — Spring Security 기본
- **개인 메일 도메인 차단** — `LeadProperties.blockedEmailDomains()` (gmail/naver/kakao 등 11종), `STUDENT_FREELANCER` 직무는 예외
- **보존 기간** — `LeadProperties.retentionMonths` (기본 24개월), 만료 후 `DELETE /api/admin/leads/expired` 로 hard delete

---

## 7. 데이터베이스 마이그레이션

Flyway, `src/main/resources/db/migration/`:

| 버전 | 내용 |
| --- | --- |
| V1 | 초기 스키마 (event / lead / lead_score / prize / draw_history / form_template / app_user / email_rejection_log) |
| V2 | full_name 정렬을 `last_name||first_name` 으로 수정 (한국어 검색 호환) |
| V3 | system_default form template 강제 재시드 (FK-safe) |
| V4 | `app_setting` 테이블 (key-value 동적 설정) |
| V5 | `event` 에 `spreadsheet_id`, `sheet_name`, `sheets_enabled` 컬럼 |
| V6 | `lead_score.grade` varchar(1) → varchar(20), 기존 A/B → MQL, C → KNOWN_LEAD |
| V7 | system_default form template 재시드 (휴대폰 안내 문구 변경) |
