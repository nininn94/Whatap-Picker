# 백엔드 개발 계획서

> [`ai-hackathon-lead-draw-plan.md`](./ai-hackathon-lead-draw-plan.md) 기획서를 기반으로 작성한 Spring Boot 백엔드 개발 계획입니다.
>
> **확정된 결정사항 (2026-05-28)**
> - DB: PostgreSQL 16 (Docker)
> - 경품 재고: 전부 유한, 어드민이 직접 설정 → 재고 소진 시 꽝 처리
> - 이메일 정책: `jobFunction == STUDENT_FREELANCER`면 개인 메일 허용, 나머지 14종은 회사 메일 강제
> - AI: 오픈소스 **Ollama** (Docker), 모델 **`llama3.2:3b`**
> - 운영자/어드민 로그인 필요, 초기 어드민은 앱 기동 시 자동 시드
> - JWT 만료: 8시간
> - 데이터 보존: 24개월 (수집일 기준), 만료 시 hard delete
> - 차단 이메일 도메인: gmail.com, naver.com, empas.com, nate.com, daum.net, hanmail.net, hotmail.com, yahoo.co.kr, icloud.com, outlook.com, kakao.com
> - 어드민 대시보드: 풀 대시보드 (요약·타임라인·세그먼트·모니터링·도입의사·경품·와탭 NPS 7개 API)
> - 설문 폼: 실제 와탭 설문 8페이지 분기 폼 그대로 반영 (스크린샷 기반)

---

## 1. 목표 및 범위

### MVP 범위 (필수 구현)

- 와탭 8페이지 분기 설문 데이터 수집 및 직무 기반 이메일 검증
- 운영자 로그인 + 운영자 페이지 (검색/추첨)
- 어드민 로그인 + 어드민 페이지 (행사·경품·운영자 계정·리드 관리)
- 일자별 중복 참여 방지 + 일자별 재고 관리 기반 추첨 실행 (꽝 포함)
- 추첨 결과 영속화 + 재고 차감 원자적 처리
- Ollama 로컬 LLM으로 리드 등급 분류
- **풀 어드민 대시보드** 7개 API (요약·타임라인·세그먼트·모니터링·도입의사·경품·와탭 NPS)
- 2년 보존 정책 + 어드민 만료 파기 API

### 확장 후보 (시간 여유 시)
- AI 후속 메시지 초안 생성 — `POST /api/ai/follow-up-message`
- 리드 CSV/XLSX export
- 자동 파기 배치 (`@Scheduled`)
- 동의 철회 셀프 API

### 범위 외 (Out of Scope)
- 운영자/어드민 패스워드 리셋 메일, 2FA
- 다국어, 결제, 푸시 알림
- 오프라인 모드(현장 네트워크 장애 폴백)

---

## 2. 기술 스택

| 영역 | 선택 | 비고 |
| --- | --- | --- |
| 언어/프레임워크 | Java 17 + Spring Boot 3.x | 팀 내 Java 보유 |
| 빌드 | Gradle | Wrapper 포함 |
| DB | **PostgreSQL 16 (Docker)** | `docker-compose up`으로 즉시 기동 |
| ORM | Spring Data JPA | 마이그레이션은 Flyway |
| 인증 | **Spring Security 6 + JWT** | 운영자/어드민 로그인 |
| 비밀번호 해시 | BCrypt | Spring Security `PasswordEncoder` |
| 검증 | Jakarta Bean Validation | `@NotBlank`, `@Pattern`, custom validator |
| AI 연동 | **Ollama (Docker)** | `http://ollama:11434/api/chat`, 모델 **`llama3.2:3b`** (가벼움 우선) |
| 직렬화 | Jackson | LocalDate/LocalDateTime ISO-8601 |
| 테스트 | JUnit 5 + Spring Boot Test + Testcontainers | Postgres 컨테이너로 통합 테스트 |
| 문서화 | Springdoc OpenAPI (`/swagger-ui.html`) | 프론트엔드 협업용 |

---

## 3. 데이터 모델

> 실제 와탭 설문 폼(8페이지 분기)을 그대로 옮긴 모델. 분석에 자주 쓰는 필드는 컬럼화, 페이지별 가변 응답은 **PostgreSQL JSONB** 컬럼으로 저장.

```
AppUser (운영자/어드민 계정)
├── id (PK, UUID)
├── username (UNIQUE)
├── password_hash (BCrypt)
├── role (ADMIN | OPERATOR)
├── enabled (boolean)
├── created_at
└── created_by (FK self, nullable)

Lead (설문 제출자)
├── id (PK, UUID)
├── first_name (성)
├── last_name (이름)
├── full_name (검색용 = first_name + last_name)
├── phone (정규화된 11자리, UNIQUE)
├── phone_last4 (검색 가속)
├── company
├── email
├── email_domain (lower-case, 분석/차단 가속)
│
│  -- 분류/속성 (분석 자주 사용) --
├── industry (ENUM Industry, 16종)
├── job_function (ENUM JobFunction, 15종)
├── job_level (ENUM JobLevel: TOP_EXECUTIVE | SENIOR_MGR | MID_MGR | STAFF | OTHER)
├── company_size (ENUM CompanySize: STARTUP | SMALL | SME | MID | LARGE | PUBLIC | UNKNOWN)
├── employee_count_range (ENUM: R_1_50 | R_51_200 | R_201_500 | R_501_1000 | R_1001_5000 | R_5001_PLUS)
│
│  -- 현재 모니터링 상태 (분기 키) --
├── monitoring_status (ENUM: USING_WHATAP | USING_OTHER | NOT_USING)
│
│  -- 페이지별 분기 응답 (가변) --
├── survey_payload (JSONB)        # 페이지 #2~#6 분기 응답 묶음 (아래 스키마 참고)
│
│  -- 페이지 #7 공통 마지막 --
├── adoption_blocker (ENUM: COST | INTERNAL_PERSUASION | TECH_BURDEN | EFFECT_UNCERTAIN | NOT_PRIORITY)
├── interest_products (TEXT[])    # 13종 복수
├── plan_within_year (ENUM: A_OPEN | B_EXPAND | C_REPLACE | D_NEW_ADOPT)
├── consultation_preference (ENUM: ONSITE_MEETING | EMAIL_OR_PHONE)
│
│  -- AI 분류 입력으로 쓰는 약식 필드 (페이지 #7에서 자동 매핑) --
├── wants_consultation (boolean)  # consultation_preference == ONSITE_MEETING 이면 true
│
│  -- 동의 --
├── privacy_consent_at            # 필수
├── marketing_consent_at          # 필수
├── retention_until               # privacy_consent_at + 2년 (자동 계산, 어드민 일괄 파기 기준)
│
├── created_at
├── updated_at
└── (1:N) DrawHistory, (1:1) LeadScore

Event (행사 일자)
├── id (PK)
├── event_date (UNIQUE)
├── label
├── created_by (FK AppUser)
└── created_at

Prize (행사일자 × 등수 재고)
├── id (PK)
├── event_id (FK)
├── rank (1~5)
├── name (경품명)
├── initial_qty (어드민 설정, 유한)
├── remaining_qty
├── created_at
├── updated_at
└── UNIQUE(event_id, rank)

DrawHistory (추첨 결과)
├── id (PK)
├── lead_id (FK)
├── event_id (FK)
├── prize_id (FK, nullable: 재고 소진 시 NULL = 꽝)
├── awarded_rank (nullable)
├── drawn_by (FK AppUser)
├── drawn_at
└── UNIQUE(lead_id, event_id)

LeadScore (AI 분석 결과)
├── id (PK)
├── lead_id (FK, UNIQUE)
├── grade (A/B/C)
├── reason
├── next_action
└── created_at
```

### 3.1 `survey_payload` JSONB 스키마 (분기별)

페이지 흐름에 따라 아래 키 중 하나만 채워짐 (`monitoring_status`로 분기).

```jsonc
// monitoring_status == USING_WHATAP
{
  "whatap": {
    "proficiency": 7,                          // 1~10
    "neededHelps": ["USER_EDUCATION", "NEW_FEATURE_INTRO", "EXTRA_PRODUCT_INTRO", "OTHER"]
  }
}

// monitoring_status == USING_OTHER
{
  "other": {
    "commercialProducts": ["DATADOG", "NEW_RELIC", "DYNATRACE", "APP_DYNAMICS",
                           "SPLUNK", "ELASTIC", "SENTRY", "EXEM", "JENNIFER",
                           "WATCHTEK", "ZENIUS", "NKIA", "OPEN_SOURCE", "OTHER"],
    "commercialOther": "자유응답",                // commercialProducts에 OTHER 있을 때
    "openSourceProducts": ["ZABBIX", "PROMETHEUS", "GRAFANA", "LOG4J", "OTHER"],
    "openSourceOther": "자유응답",

    // 상용 사용자 (commercialProducts에 OPEN_SOURCE만 단독이 아닐 때)
    "commercial": {
      "deployment": "PUBLIC_SAAS | PRIVATE_SAAS | ON_PREMISE",
      "satisfaction": "VERY_SATISFIED | SATISFIED | NEUTRAL | DISSATISFIED | VERY_DISSATISFIED",
      "complaints": ["PERFORMANCE_LACK", "USABILITY_LACK", "SUPPORT_LACK", "PRICE_BURDEN", "OTHER"],
      "complaintsOther": "자유응답",
      "annualBudget": "NONE | LT_1M | M_1_5 | M_5_10 | GTE_10M | UNKNOWN",
      "costPerception": "VERY_REASONABLE | REASONABLE | SOMEWHAT_BURDEN | VERY_BURDEN | UNKNOWN",
      "switchReason": "A_OPS_EFFICIENCY | B_TOOL_CONSOLIDATION | C_ENTERPRISE_SLA | D_ADVANCED_FEATURES"
    },

    // 오픈소스 사용자
    "openSource": {
      "deployment": ["ON_PREMISE", "CLOUD_VM", "MANAGED_SERVICE", "MIXED"],
      "satisfaction": "VERY_SATISFIED | ... | VERY_DISSATISFIED",
      "difficulties": ["INTEGRATION", "EXPERT_LACK", "PERFORMANCE_SCALABILITY",
                       "SUPPORT_LACK", "STAFFING_CONCERN"]
    }
  }
}

// monitoring_status == NOT_USING
{
  "notUsing": {
    "concerns": ["INCIDENT_ROOT_CAUSE_TIME", "INFRA_OVERUSE_DETECTION",
                 "INFRA_UTIL_VISIBILITY", "OPS_DASHBOARD", "DEV_OPS_COMM"],
    "frequentIssues": ["INCIDENT_OVER_1DAY", "INCIDENT_UNRESOLVED",
                       "INFRA_USAGE_UNKNOWN", "MANUAL_OPS_SHARING", "VAGUE_ANXIETY"]
  }
}
```

### 3.2 enum 값 매핑 (요약)

| enum | 값 | 한국어 라벨 (UI 라벨) |
| --- | --- | --- |
| `Industry` | `FINANCE_INSURANCE` | 금융 및 보험 서비스 |
| | `EDUCATION_RESEARCH` | 교육 및 학술 연구 |
| | `IT_SERVICES` | 정보기술(IT) 및 서비스 |
| | `GOVT_PUBLIC` | 정부 및 공공 서비스 |
| | `HEALTHCARE` | 병원 및 의료 서비스 |
| | `MANUFACTURING` | 제조업 |
| | `RETAIL_ECOMMERCE` | 소매 및 전자상거래 |
| | `LOGISTICS` | 운송 및 물류 |
| | `LIFE_SCIENCE` | 헬스케어 및 생명과학(제약/보건/바이오) |
| | `TELECOM` | 통신 |
| | `MEDIA_ENTERTAINMENT` | 미디어 및 엔터테인먼트 |
| | `PROFESSIONAL_SERVICES` | 전문 서비스 (법률, 회계, 컨설팅) |
| | `ENERGY_RESOURCES` | 에너지 및 자원 |
| | `HOTEL_TOURISM` | 호텔 및 관광업 |
| | `SERVICE_INDUSTRY` | 서비스업 (식음료 등) |
| | `OTHER` | 기타 |
| `JobFunction` | `DEVOPS` | DevOps |
| | `IT_OPS` | IT 운영 |
| | `SRE` | SRE |
| | `DEVELOPER` | 개발자 (프론트엔드, 백엔드) |
| | `R_AND_D` | R&D / 연구원 |
| | `IT_PLANNING` | IT 기획 |
| | `SECURITY` | 보안 |
| | `CONSULTING` | 컨설팅 (엔지니어) |
| | `DATA` | 데이터 |
| | `INFRA` | 전산 / 인프라 |
| | `MARKETING_SALES` | 마케팅 / 영업 |
| | `FINANCE_BACKOFFICE` | 재무 / 경영지원 |
| | `EXECUTIVE` | 임원 / 대표 |
| | `STUDENT_FREELANCER` | 학생 / 프리랜서 |
| | `OTHER` | 기타 |
| `JobLevel` | `TOP_EXECUTIVE` | 최종 결정자 (대표/임원) |
| | `SENIOR_MGR` | 상위 관리자 (부장급) |
| | `MID_MGR` | 중간 관리자 (차/과장급) |
| | `STAFF` | 실무자 |
| | `OTHER` | 기타 |
| `CompanySize` | `STARTUP` | 스타트업 (창업 초기, 매출 ~50억) |
| | `SMALL` | 소기업 (50억~200억) |
| | `SME` | 중소기업 (200억~1000억) |
| | `MID` | 중견기업 (1000억~5000억) |
| | `LARGE` | 대기업 (5000억 이상) |
| | `PUBLIC` | 공기업 및 공공기관 |
| | `UNKNOWN` | 정확히 모르겠다 |
| `EmployeeCountRange` | `R_1_50` ~ `R_5001_PLUS` | 1-50 / 51-200 / 201-500 / 501-1000 / 1001-5000 / 5001+ |
| `MonitoringStatus` | `USING_WHATAP` / `USING_OTHER` / `NOT_USING` | 와탭 사용 중 / 타사·오픈소스 사용 중 / 사용하지 않음 |
| `InterestProduct` (TEXT[]) | `AIOPS`, `LLM_OBSERVABILITY`, `RUM`, `NMS`, `SERVER`, `GPU`, `APM`, `KUBERNETES`, `DB`, `LOG`, `SIEM`, `URL`, `OPEN_METRICS` | 페이지 #7 13종 |
| `AdoptionBlocker` | `COST` / `INTERNAL_PERSUASION` / `TECH_BURDEN` / `EFFECT_UNCERTAIN` / `NOT_PRIORITY` | 망설이는 이유 5종 |
| `PlanWithinYear` | `A_OPEN` / `B_EXPAND` / `C_REPLACE` / `D_NEW_ADOPT` | 1년 내 계획 ABCD |
| `ConsultationPreference` | `ONSITE_MEETING` / `EMAIL_OR_PHONE` | 방문 미팅 / 메일·유선 자료 |

### 3.3 이메일 차단 룰 (직무 기반 분기)

폼에 `userType` 단일 필드가 따로 없고, `직무 = 학생/프리랜서`로 분기를 표현하므로 **`job_function == STUDENT_FREELANCER` 일 때만 개인 메일 허용**.

```
if (job_function == STUDENT_FREELANCER) → 개인 메일 OK
else                                    → 회사 메일 강제 (차단 도메인 검사)
```

### 3.4 인덱스

- `AppUser(username)` UNIQUE
- `Lead(phone)` UNIQUE
- `Lead(full_name, phone_last4)` 운영자 검색 가속
- `Lead(industry)`, `Lead(monitoring_status)`, `Lead(plan_within_year)` 대시보드 집계용
- `Lead(retention_until)` 보존 만료 배치용
- `Lead(survey_payload jsonb_path_ops)` GIN — 모니터링 제품별 집계 (확장)
- `DrawHistory(lead_id, event_id)` UNIQUE
- `Prize(event_id, rank)` UNIQUE

**역할별 권한 매트릭스**

| 리소스 | 비인증 | OPERATOR | ADMIN |
| --- | --- | --- | --- |
| `POST /api/leads` (설문 제출) | ✅ | ✅ | ✅ |
| `GET /api/leads/search` | ❌ | ✅ | ✅ |
| `POST /api/draw` | ❌ | ✅ | ✅ |
| `GET /api/prizes` (조회) | ❌ | ✅ | ✅ |
| `POST /api/ai/lead-score` | ❌ | ✅ | ✅ |
| `/api/admin/**` | ❌ | ❌ | ✅ |

---

## 4. API 명세

### 4.0 인증 — `POST /api/auth/login`

**Request**
```json
{ "username": "operator01", "password": "..." }
```

**Response (200)**
```json
{
  "accessToken": "eyJ...",
  "tokenType": "Bearer",
  "expiresIn": 28800,
  "role": "OPERATOR"
}
```

- JWT는 stateless, 만료 8시간(행사 1일 분)
- 리프레시 토큰은 MVP 미포함 (만료 시 재로그인)
- 5회 연속 실패 시 `429` (선택 구현)

### 4.1 설문 제출 — `POST /api/leads` (비인증)

페이지 #1~#7 응답을 한 번에 제출 받음. 프론트는 단계별 진행 상태를 로컬에 유지하다가 Submit 시점에 통째로 POST.

**Request**
```jsonc
{
  "firstName": "길동",
  "lastName": "홍",
  "company": "와탭랩스",
  "email": "user@whatap.io",
  "phone": "010-1234-5678",

  "industry": "IT_SERVICES",
  "jobFunction": "DEVELOPER",
  "jobLevel": "STAFF",
  "companySize": "SME",
  "employeeCountRange": "R_201_500",

  "monitoringStatus": "USING_OTHER",          // 분기 키
  "surveyPayload": {                          // monitoringStatus 값에 따라 키 한 종류만
    "other": {
      "commercialProducts": ["DATADOG", "OPEN_SOURCE"],
      "openSourceProducts": ["PROMETHEUS", "GRAFANA"],
      "commercial": {
        "deployment": "PUBLIC_SAAS",
        "satisfaction": "NEUTRAL",
        "complaints": ["PRICE_BURDEN"],
        "annualBudget": "M_5_10",
        "costPerception": "SOMEWHAT_BURDEN",
        "switchReason": "A_OPS_EFFICIENCY"
      }
    }
  },

  "adoptionBlocker": "COST",
  "interestProducts": ["APM", "KUBERNETES", "AIOPS"],
  "planWithinYear": "B_EXPAND",
  "consultationPreference": "ONSITE_MEETING",

  "privacyConsent": true,
  "marketingConsent": true
}
```

**검증**

공통:
- `firstName`, `lastName`: 필수, 각 1~20자
- `phone`: `^010\d{8}$` (하이픈/공백/+82 정규화 후)
- `email`: 형식 검증 통과
- `privacyConsent`, `marketingConsent`: 둘 다 `true` (`@AssertTrue`)
- 모든 enum 필드 값 유효성
- 동일 `phone` 재제출 시 → 기존 Lead upsert (`retention_until`도 새로 계산)

**이메일 도메인 분기 (직무 기반)**

| `jobFunction` | 이메일 정책 |
| --- | --- |
| `STUDENT_FREELANCER` | 개인 메일 허용 |
| 그 외 14종 | **차단 도메인** 검사, 회사 메일만 허용 |

**`surveyPayload` 검증**
- `monitoringStatus`에 맞는 키 한 종류만 채워졌는지 (`@Valid` + 커스텀 검증기 `SurveyPayloadValidator`)
- 각 enum 값/배열 길이 검증

**보존 기간 자동 계산**
- `retention_until = privacy_consent_at + 24개월` 서버 측 자동 세팅

**Response (200)**
```json
{
  "leadId": "uuid",
  "createdAt": "2026-05-28T10:00:00",
  "retentionUntil": "2028-05-28"
}
```

**Error**
- `400` 필드 검증 실패
- `409 PERSONAL_EMAIL_NOT_ALLOWED` — 비학생/비프리랜서인데 개인 메일
- `409 SURVEY_PAYLOAD_MISMATCH` — `monitoringStatus`와 `surveyPayload` 키 불일치
- `409 CONSENT_REQUIRED` — 동의 누락

### 4.2 참여자 검색 — `GET /api/leads/search?name={}&phoneLast4={}&eventDate={}` (OPERATOR/ADMIN)

**검증**
- `name` 필수, `phoneLast4` 정확히 4자리 숫자
- `eventDate` 필수 (`YYYY-MM-DD`) — 다일 행사 대응

**Response (200)**
```json
{
  "results": [
    {
      "leadId": "uuid",
      "name": "홍길동",
      "userType": "EMPLOYEE",
      "company": "와탭랩스",
      "submitted": true,
      "drawnOnEventDate": false
    }
  ]
}
```
- 동명이인/뒷자리 중복 시 여러 건 반환 → 프론트에서 회사명/소속으로 선택

### 4.3 뽑기 실행 — `POST /api/draw` (OPERATOR/ADMIN)

**Request**: `{ "leadId": "uuid", "eventDate": "2026-05-28" }`

**처리 (트랜잭션 + 비관적 락)**
1. `Lead` 존재 확인 → 없으면 `404`
2. `Event` 조회 → 없으면 `404`
3. `DrawHistory(lead_id, event_id)` 존재 확인 → 있으면 `409 ALREADY_DRAWN`
4. 해당 `event_id`의 `Prize`를 `SELECT FOR UPDATE`로 락
5. **사전 랜덤 풀 방식** 추첨:
   - 등수별 잔여 수량 합 = N
   - 모든 등수 유한이므로 `N=0`이면 `409 OUT_OF_STOCK` (꽝 처리: `prize_id=null` 저장)
   - `Random.nextInt(N)` 위치로 등수 누적 분포 매핑
6. 선택된 `Prize.remaining_qty -= 1`
7. `DrawHistory` insert (`drawn_by`에 현재 인증된 운영자 ID)
8. 커밋

**Response (200)**
```json
{
  "rank": 3,
  "prizeName": "스타벅스 1만원권",
  "drawnAt": "2026-05-28T10:05:12"
}
```

재고 소진 시:
```json
{ "rank": null, "prizeName": null, "outOfStock": true, "drawnAt": "..." }
```

### 4.4 경품 현황 — `GET /api/prizes?eventDate=2026-05-28` (OPERATOR/ADMIN)

```json
{
  "eventDate": "2026-05-28",
  "prizes": [
    { "rank": 1, "name": "AirPods", "initial": 2, "awarded": 1, "remaining": 1 }
  ]
}
```

### 4.5 참여 이력 — `GET /api/draw/history?leadId={}&eventDate={}` (OPERATOR/ADMIN)

### 4.6 AI 리드 등급 — `POST /api/ai/lead-score` (OPERATOR/ADMIN)

**Request**: `{ "leadId": "uuid" }`

**처리**
- `Lead` 정보 + `userType`을 프롬프트로 구성
- Ollama `POST http://ollama:11434/api/chat` 호출
- `format: "json"` 강제 + 시스템 프롬프트에 JSON 스키마 명시
- `LeadScore` 테이블에 upsert

**Response**
```json
{
  "grade": "A",
  "reason": "도입 검토 3개월 이내 + 상담 희망 + 결정권자",
  "nextAction": "영업팀 1차 미팅 제안 메일 발송"
}
```

**프롬프트 가이드라인**
- 입력: userType, 회사, 직무, 관심 제품, 도입 시기, 상담 희망 여부
- userType별 등급 룰 분기 (학생/프리랜서는 자동 C 또는 별도 기준 - 마케터 협의)
- Ollama 호출 타임아웃 10초, 실패 시 `grade=null, reason="AI 분석 보류"` 폴백

### 4.7 AI 후속 메시지 (확장) — `POST /api/ai/follow-up-message` (ADMIN)

스펙은 이전 버전 유지. Ollama 사용으로 변경.

---

## 4.A 어드민 API (ADMIN 권한)

### 행사 관리
- `POST /api/admin/events` — 행사일 생성 (`event_date`, `label`)
- `GET /api/admin/events` — 목록
- `DELETE /api/admin/events/{id}` — 삭제 (`DrawHistory` 있으면 거부)

### 경품 재고 관리
- `POST /api/admin/events/{eventId}/prizes` — 등수별 경품 일괄 등록
  ```json
  {
    "prizes": [
      { "rank": 1, "name": "AirPods", "initialQty": 2 },
      { "rank": 2, "name": "스타벅스", "initialQty": 10 },
      ...
    ]
  }
  ```
  - `remaining_qty = initial_qty`로 초기화
- `PATCH /api/admin/prizes/{id}` — 수량/이름 수정 (이미 차감된 양보다 작게는 못 줄임)
- `DELETE /api/admin/prizes/{id}` — 추첨 이력 없을 때만 가능

### 운영자 계정 관리
- `POST /api/admin/users` — 운영자 생성 (`username`, `password`, `role`)
- `GET /api/admin/users` — 목록
- `PATCH /api/admin/users/{id}` — 비활성화/비밀번호 리셋
- `DELETE /api/admin/users/{id}`

### 리드 조회
- `GET /api/admin/leads?eventDate=&grade=&industry=&jobLevel=&monitoringStatus=&planWithinYear=&page=&size=` — 페이징 + 다중 필터
- `GET /api/admin/leads/{id}` — 상세 (설문 + 추첨 + AI 등급 묶음, `survey_payload` 포함)
- `GET /api/admin/leads/export?eventDate=&format=csv|xlsx` — 내보내기
- `DELETE /api/admin/leads/expired` — 보존 기간(2년) 만료 리드 일괄 파기

### 4.B 풀 대시보드 API (ADMIN)

기획서 §3 성과 지표 + 설문 폼의 분기 응답을 다 활용하는 분석 대시보드.

#### 4.B.1 요약 카드 — `GET /api/admin/dashboard/summary?eventDate=`

```json
{
  "eventDate": "2026-05-28",
  "leadCount": 142,
  "drawCount": 138,
  "wantsConsultationCount": 47,
  "avgProcessingSeconds": 38,        // 검색~추첨 시각 차이 평균
  "validEmailRatio": 0.93,           // 차단되지 않고 통과한 비율
  "gradeDistribution": { "A": 23, "B": 71, "C": 44, "PENDING": 4 }
}
```

#### 4.B.2 일자별 처리량 — `GET /api/admin/dashboard/timeline?from=&to=`

```json
{
  "series": [
    { "date": "2026-05-28", "submitted": 142, "drawn": 138, "consultations": 47 },
    { "date": "2026-05-29", "submitted": 98,  "drawn": 95,  "consultations": 31 }
  ]
}
```

#### 4.B.3 산업·직무·기업규모 분포 — `GET /api/admin/dashboard/segments?eventDate=`

```json
{
  "industry":    { "IT_SERVICES": 58, "FINANCE_INSURANCE": 21, ... },
  "jobFunction": { "DEVOPS": 33, "DEVELOPER": 41, ... },
  "jobLevel":    { "TOP_EXECUTIVE": 12, "MID_MGR": 38, ... },
  "companySize": { "SME": 41, "MID": 30, "LARGE": 22, ... },
  "monitoringStatus": { "USING_WHATAP": 24, "USING_OTHER": 88, "NOT_USING": 30 }
}
```

#### 4.B.4 모니터링 사용 현황 — `GET /api/admin/dashboard/monitoring?eventDate=`

`survey_payload` JSONB를 GIN 인덱스로 집계.

```json
{
  "commercialProductUsage": {
    "DATADOG": 31, "NEW_RELIC": 18, "DYNATRACE": 12, "SPLUNK": 9,
    "ELASTIC": 22, "SENTRY": 7, "EXEM": 14, "JENNIFER": 11, ...
  },
  "openSourceUsage": {
    "PROMETHEUS": 44, "GRAFANA": 51, "ZABBIX": 19, "LOG4J": 8
  },
  "commercialSatisfaction": {
    "VERY_SATISFIED": 6, "SATISFIED": 32, "NEUTRAL": 28,
    "DISSATISFIED": 15, "VERY_DISSATISFIED": 7
  },
  "switchReasons": { "A_OPS_EFFICIENCY": 22, "B_TOOL_CONSOLIDATION": 35,
                     "C_ENTERPRISE_SLA": 18, "D_ADVANCED_FEATURES": 13 },
  "adoptionBlockers": { "COST": 41, "INTERNAL_PERSUASION": 22,
                        "TECH_BURDEN": 15, "EFFECT_UNCERTAIN": 9, "NOT_PRIORITY": 7 }
}
```

#### 4.B.5 관심 제품 / 도입 계획 — `GET /api/admin/dashboard/intent?eventDate=`

```json
{
  "interestProducts": {
    "APM": 71, "KUBERNETES": 55, "AIOPS": 48, "LLM_OBSERVABILITY": 32, "RUM": 28,
    "DB": 25, "LOG": 22, "SERVER": 21, "GPU": 18, "SIEM": 14, "NMS": 11,
    "URL": 8, "OPEN_METRICS": 6
  },
  "planWithinYear": {
    "A_OPEN": 50, "B_EXPAND": 38, "C_REPLACE": 19, "D_NEW_ADOPT": 31
  },
  "consultationPreference": {
    "ONSITE_MEETING": 47, "EMAIL_OR_PHONE": 91
  }
}
```

#### 4.B.6 경품 소진 현황 — `GET /api/admin/dashboard/prizes?eventDate=`

```json
{
  "prizes": [
    { "rank": 1, "name": "AirPods", "initial": 5, "remaining": 0, "burnRate": 1.0 },
    { "rank": 2, "name": "스타벅스 1만원권", "initial": 30, "remaining": 12, "burnRate": 0.6 }
  ],
  "outOfStockCount": 7         // 꽝 발생 횟수
}
```

#### 4.B.7 와탭 사용자 NPS — `GET /api/admin/dashboard/whatap-users?eventDate=`

```json
{
  "proficiencyDistribution": { "1": 1, "2": 0, "3": 3, ..., "10": 8 },
  "proficiencyAvg": 7.2,
  "neededHelps": { "USER_EDUCATION": 14, "NEW_FEATURE_INTRO": 22,
                   "EXTRA_PRODUCT_INTRO": 17, "OTHER": 3 }
}
```

#### 구현 전략
- 모든 집계는 단일 `LeadAnalyticsService`에 모음, JPQL/native SQL `GROUP BY`
- JSONB 집계는 `jsonb_array_elements_text()` + GROUP BY
- 인덱스: `(event_date, industry)`, `(event_date, monitoring_status)`, `survey_payload` GIN
- 캐싱: 단발성 대시보드라 Spring `@Cacheable` 60초 TTL로 충분

### 초기 어드민 계정
- 앱 기동 시 `bootstrap.admin.username` / `bootstrap.admin.password` 환경변수로 시드 (`AppUser`에 없으면 자동 생성)
- 두 환경변수 중 하나라도 없으면 앱 시작 거부 (운영 사고 방지)

---

## 5. 핵심 로직 상세

### 5.1 동시성 제어

| 위험 | 방어 |
| --- | --- |
| 같은 leadId+eventDate 동시 추첨 | `DrawHistory(lead_id, event_id)` UNIQUE + `DataIntegrityViolationException` → `ALREADY_DRAWN` |
| 동일 등수 재고 음수 | 트랜잭션 내 `SELECT ... FOR UPDATE` + `remaining_qty` 검사 |
| 어드민 수량 수정 vs 추첨 경합 | `Prize` 업데이트도 같은 락 사용 |

### 5.2 입력값 정규화

- 휴대폰: `-`, 공백, `+82` 제거 후 `01012345678`
- 이메일: lower-case
- 이름: trim

### 5.3 이메일 도메인 검증 (직무 기반 분기)

```yaml
# application.yml
lead:
  blocked-email-domains:
    - gmail.com
    - naver.com
    - empas.com
    - nate.com
    - daum.net
    - hanmail.net
    - hotmail.com
    - yahoo.co.kr
    - icloud.com
    - outlook.com
    - kakao.com
```

**검증 규칙** (custom `@CompanyEmailIfNotStudentFreelancer` validator):
```
domain = email.split("@")[1].toLowerCase()
if (jobFunction != STUDENT_FREELANCER && blockedDomains.contains(domain)) {
    throw 409 PERSONAL_EMAIL_NOT_ALLOWED
}
// STUDENT_FREELANCER → 모든 도메인 허용
```

### 5.4 추첨 알고리즘 (사전 랜덤 풀, 전부 유한)

```
prizes = active rows with remaining_qty > 0
total = sum(remaining_qty)
if (total == 0) → OUT_OF_STOCK (꽝)
roll = random.nextInt(total)
누적합으로 prizes 순회하며 roll이 들어가는 칸 선택
선택된 Prize.remaining_qty -= 1
```

→ **모든 경품 유한 = 충분히 소진되면 꽝 발생 가능**. 어드민이 사전에 충분한 수량을 5등에 깔아두는 운영 가이드 필요.

### 5.5 데이터 보존 / 파기 (2년)

**정책**
- 보존 기간: 동의일(`privacy_consent_at`) 기준 **24개월**
- 만료 시점에 어드민이 일괄 파기 또는 자동 배치(Phase 6 확장)로 hard delete
- 익명화가 아닌 **물리 삭제** (개인정보 원본은 남기지 않음)
- 단, `DrawHistory` 집계용으로 `lead_id` → null 처리 후 leave (행사 통계 유지)

**구현**
- `Lead.retention_until` 자동 세팅 (제출 시 `+ 24개월`)
- `DELETE /api/admin/leads/expired` — 어드민이 만료된 리드 일괄 파기
- (확장) `@Scheduled(cron="0 0 4 * * ?")` 매일 새벽 4시 자동 파기 잡

**설문 폼에 노출할 동의 문구**

> **개인정보 수집 및 이용 동의 (필수)**
>
> 와탭랩스(주)는 본 이벤트 운영 및 경품 발송을 위해 아래와 같이 개인정보를 수집·이용합니다.
> - **수집 항목**: 성·이름, 회사명, 회사 이메일, 휴대폰 번호, 직무·직급·산업군·기업 규모·직원 수, 현재 모니터링 환경 및 설문 응답
> - **이용 목적**: 부스 이벤트 참여 확인, 경품 발송, 본인 확인, 행사 운영
> - **보유 및 이용 기간**: **수집일로부터 24개월(2년)**, 이후 지체 없이 파기
> - 동의를 거부할 권리가 있으며, 거부 시 본 이벤트에 참여하실 수 없습니다.
>
> ☐ 위 내용에 동의합니다.

> **마케팅 활용 동의 (필수)**
>
> 와탭랩스(주)는 수집한 정보를 아래와 같이 마케팅 목적으로 활용합니다.
> - **활용 목적**: 와탭 제품/서비스 안내, 세미나·웨비나·뉴스레터 발송, 컨설팅 제안, 후속 영업 활동
> - **활용 채널**: 이메일, 휴대폰(SMS/전화)
> - **보유 및 이용 기간**: **동의일로부터 24개월(2년)**, 동의 철회 시까지
> - 동의 철회는 `event@whatap.io`로 요청하실 수 있습니다.
>
> ☐ 위 내용에 동의합니다.

> 자세한 내용은 [개인정보 처리방침](https://whatap.io/privacy)을 참고해 주세요.

**구현 메모**
- 두 동의는 **분리 표시 + 둘 다 체크해야 Submit 가능** (`@AssertTrue` 둘 다)
- 동의 시각은 클라이언트 입력이 아닌 서버 시각으로 기록
- 동의 문구 자체는 `application.yml` 또는 정적 페이지(`/api/legal/consent`)로 노출

### 5.6 인증/인가

- `JwtAuthenticationFilter`로 `Authorization: Bearer <token>` 파싱
- `SecurityFilterChain`:
  - `/api/auth/**`, `POST /api/leads`, `/swagger-ui/**`, `/v3/api-docs/**` → 공개
  - `/api/admin/**` → `hasRole('ADMIN')`
  - 그 외 모든 `/api/**` → `hasAnyRole('OPERATOR', 'ADMIN')`
- 비밀번호: BCrypt strength 12

---

## 6. 디렉토리 구조

```
src/main/java/io/whatap/picker/
├── PickerApplication.java
├── config/
│   ├── SecurityConfig.java
│   ├── OllamaConfig.java
│   ├── WebConfig.java
│   └── BootstrapAdminRunner.java       # 최초 어드민 시드
├── auth/
│   ├── AuthController.java
│   ├── AuthService.java
│   ├── AppUser.java
│   ├── AppUserRepository.java
│   ├── jwt/
│   │   ├── JwtTokenProvider.java
│   │   └── JwtAuthenticationFilter.java
│   └── dto/
├── lead/
│   ├── Lead.java
│   ├── LeadRepository.java
│   ├── LeadController.java
│   ├── LeadService.java
│   ├── enums/                              # Industry, JobFunction, JobLevel, CompanySize, ...
│   ├── payload/                            # SurveyPayload, WhatapAnswer, OtherAnswer, NotUsingAnswer
│   ├── dto/LeadSubmitRequest.java
│   └── validation/
│       ├── CompanyEmailIfNotStudentFreelancerValidator.java
│       └── SurveyPayloadValidator.java
├── draw/
│   ├── DrawController.java
│   ├── DrawService.java
│   ├── DrawHistory.java
│   ├── DrawHistoryRepository.java
│   └── strategy/PrizePoolDrawStrategy.java
├── prize/
│   ├── Prize.java, PrizeRepository.java
│   ├── Event.java, EventRepository.java
│   └── PrizeController.java
├── ai/
│   ├── AiController.java
│   ├── LeadScoreService.java
│   ├── LeadScore.java
│   ├── FollowUpMessageService.java     # 확장
│   └── client/OllamaClient.java
├── admin/
│   ├── AdminEventController.java
│   ├── AdminPrizeController.java
│   ├── AdminUserController.java
│   ├── AdminLeadController.java
│   └── dashboard/
│       ├── DashboardController.java
│       └── LeadAnalyticsService.java
└── common/
    ├── ApiException.java
    └── GlobalExceptionHandler.java
```

---

## 7. 개발 단계 (해커톤 타임라인)

> 폼 복잡도 + 풀 대시보드 + 어드민 + Ollama로 **약 13~16h** 추정. 2일 분량.

### Phase 0 — 인프라 셋업 (1h)
- Spring Boot 프로젝트 생성, Gradle
- `docker-compose.yml` 작성 (Postgres + Ollama + 앱)
- Flyway 초기 마이그레이션 (`V1__init.sql`)
- 공통 예외 핸들러, Springdoc OpenAPI, 환경변수 로딩
- Ollama 컨테이너에 `llama3.2:3b` pull

### Phase 1 — 인증 (1.5h)
- `AppUser` 엔티티, BCrypt
- Spring Security 6 + JWT 필터, `POST /api/auth/login`
- `BootstrapAdminRunner` (어드민 시드, 환경변수 미설정 시 앱 시작 거부)

### Phase 2 — 설문 도메인 & 검증 (3h)
- 모든 enum (Industry, JobFunction, JobLevel, CompanySize, EmployeeCountRange, MonitoringStatus, AdoptionBlocker, PlanWithinYear, ConsultationPreference, InterestProduct)
- `Lead` 엔티티 + `survey_payload` JSONB 매핑 (Hibernate `@JdbcTypeCode(SqlTypes.JSON)`)
- `POST /api/leads` + `CompanyEmailIfNotStudentFreelancerValidator` + `SurveyPayloadValidator`
- 휴대폰 정규화, 동의 검증, `retention_until` 자동 계산
- 단위 테스트: 직무 분기, 도메인 차단, payload 분기 검증

### Phase 3 — 추첨 + 재고 (2h)
- `Event`, `Prize`, `DrawHistory`
- 트랜잭션/비관적 락, 사전 랜덤 풀 알고리즘 (꽝 포함)
- `GET /api/leads/search`, `POST /api/draw`, `GET /api/prizes`, `GET /api/draw/history`
- 동시성 테스트 (100 동시 호출 → 1건만 성공)

### Phase 4 — 어드민 핵심 (2h)
- `/api/admin/events`, `/api/admin/prizes` CRUD
- `/api/admin/users` 운영자 계정 관리
- `/api/admin/leads` 조회 + 필터 + 상세
- `DELETE /api/admin/leads/expired` 보존 만료 파기

### Phase 5 — 대시보드 (3h)
- `LeadAnalyticsService` 집계 로직
- §4.B 7개 엔드포인트 구현
- JSONB 집계 SQL (모니터링 제품, 만족도)
- `@Cacheable` 60초 TTL

### Phase 6 — AI (Ollama) (1.5h)
- `OllamaClient` (WebClient, `format: "json"`)
- `LeadScoreService` + 프롬프트 (Lead의 분류 필드 + 자유응답 요약)
- 타임아웃 10s, 실패 폴백

### Phase 7 — 통합 & 데모 (남는 시간)
- 프론트 CORS, Swagger 캡처
- 데모 시나리오 리허설 (어드민 행사·경품 세팅 → QR 설문 → 운영자 로그인 → 검색 → 뽑기 → AI 등급 → 대시보드)
- 여유 시: `/api/ai/follow-up-message`, CSV/XLSX export, 자동 파기 배치

---

## 8. 테스트 전략

| 레벨 | 대상 | 방법 |
| --- | --- | --- |
| 단위 | 이메일 검증 (userType 분기), 휴대폰 정규화, 추첨 분포, JWT 발급/검증 | JUnit |
| 통합 | API 라운드트립, 권한 분리, Postgres 실 DB | `@SpringBootTest` + Testcontainers |
| 동시성 | 동일 leadId+eventDate 100 동시 호출 → 1건만 성공 | `CountDownLatch` + `ExecutorService` |
| 시나리오 | 어드민 → 행사·경품 세팅 → 설문 → 검색 → 추첨 → 재고 차감 → AI 등급 | E2E |

---

## 9. 환경설정

### 9.1 `application.yml`

```yaml
spring:
  datasource:
    url: jdbc:postgresql://${DB_HOST:localhost}:5432/picker
    username: ${DB_USER:picker}
    password: ${DB_PASSWORD:picker}
  jpa:
    hibernate.ddl-auto: validate
    open-in-view: false
    properties.hibernate.jdbc.time_zone: Asia/Seoul
  flyway:
    enabled: true

ollama:
  base-url: ${OLLAMA_BASE_URL:http://localhost:11434}
  model: ${OLLAMA_MODEL:llama3.2:3b}
  timeout-seconds: 10

security:
  jwt:
    secret: ${JWT_SECRET}            # 최소 32바이트
    expiration-hours: 8

bootstrap:
  admin:
    username: ${BOOTSTRAP_ADMIN_USERNAME:admin}
    password: ${BOOTSTRAP_ADMIN_PASSWORD}   # 미설정 시 앱 시작 거부

lead:
  blocked-email-domains:
    - gmail.com
    - naver.com
    - empas.com
    - nate.com
    - daum.net
    - hanmail.net
    - hotmail.com
    - yahoo.co.kr
    - icloud.com
    - outlook.com
    - kakao.com
  retention-months: 24

draw:
  pool-strategy: pre-random
```

### 9.2 `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: picker
      POSTGRES_USER: picker
      POSTGRES_PASSWORD: picker
    ports: ["5432:5432"]
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U picker"]
      interval: 5s
      timeout: 3s
      retries: 5

  ollama:
    image: ollama/ollama:latest
    ports: ["11434:11434"]
    volumes:
      - ollama_data:/root/.ollama
    # 최초 기동 후: docker exec -it <ollama> ollama pull qwen2.5:7b

  app:
    build: .
    depends_on:
      postgres: { condition: service_healthy }
      ollama:   { condition: service_started }
    environment:
      DB_HOST: postgres
      OLLAMA_BASE_URL: http://ollama:11434
      OLLAMA_MODEL: llama3.2:3b
      JWT_SECRET: ${JWT_SECRET}
      BOOTSTRAP_ADMIN_USERNAME: admin
      BOOTSTRAP_ADMIN_PASSWORD: ${BOOTSTRAP_ADMIN_PASSWORD}
    ports: ["8080:8080"]

volumes:
  postgres_data:
  ollama_data:
```

### 9.3 기동 절차

```bash
export JWT_SECRET=$(openssl rand -base64 32)
export BOOTSTRAP_ADMIN_PASSWORD=ChangeMe!2026

docker compose up -d postgres ollama
docker exec -it $(docker compose ps -q ollama) ollama pull llama3.2:3b
docker compose up -d app

# 헬스체크
curl http://localhost:8080/actuator/health
```

---

## 10. 남은 결정사항 (해커톤 전 확정 필요)

확정된 것은 ✅로 표시.

- ✅ DB: PostgreSQL 16 (Docker)
- ✅ 재고 정책: 전부 유한, 어드민 설정, 소진 시 꽝
- ✅ 이메일 정책: 직무 기반 분기 (STUDENT_FREELANCER만 개인 메일 허용)
- ✅ AI: Ollama (Docker), 모델 `llama3.2:3b`
- ✅ 운영자/어드민 로그인 필요, 초기 어드민 자동 시드
- ✅ JWT 만료: 8시간
- ✅ 데이터 보존: 24개월, hard delete + 어드민 일괄 파기 API
- ✅ 차단 도메인 11개 (§5.3)
- ✅ 풀 대시보드 7개 API (§4.B)
- ✅ 설문 폼: 와탭 실제 설문 8페이지 분기 폼 반영
- [ ] Ollama JSON 응답 안정성 — `format: "json"` 강제만으로 충분한지, `function calling` 흉내(JSON 스키마 프롬프트) 필요한지 실측
- [ ] 자동 파기 배치(Phase 6) — 어드민 수동 버튼만으로 갈지, `@Scheduled` 매일 새벽 잡 추가할지
- [ ] 동의 철회 API — `event@whatap.io` 수신 수동 처리만 vs `POST /api/leads/{id}/withdraw` 엔드포인트 제공

---

## 11. 발표용 백엔드 어필 포인트

1. **Docker Compose 한 방으로 전체 스택(앱 + Postgres + Ollama LLM) 기동** — 외부 API 의존 없는 자기완결형 솔루션
2. **로컬 오픈소스 LLM(Ollama, `llama3.2:3b`)** 활용으로 데이터 외부 유출 없는 리드 분석
3. **동시성 안전 추첨**: UNIQUE 제약 + 비관적 락으로 더블 추첨/음수 재고 차단
4. **직무 기반 동적 검증**: STUDENT_FREELANCER만 개인 메일 허용, 나머지 14종 직무는 회사 메일 강제
5. **역할 기반 접근 제어**: ADMIN(세팅·대시보드) / OPERATOR(현장 운영) 분리
6. **JSONB 활용 풀 대시보드**: 8페이지 분기 설문 응답을 단일 컬럼에 보관, GIN 인덱스로 모니터링 제품·만족도 즉시 집계
7. **법적 안전장치 내장**: 2년 자동 보존 + 만료 파기 API + 동의 시각 서버 기록

---

*이 계획서는 화요일 개발 논의용 v3 (2026-05-28 결정사항 + 실제 와탭 설문 폼 반영) 입니다.*
