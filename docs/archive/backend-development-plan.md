# 백엔드 개발 계획서

> [`ai-hackathon-lead-draw-plan.md`](./ai-hackathon-lead-draw-plan.md) 기획서를 기반으로 작성한 Spring Boot 백엔드 개발 계획입니다.
>
> **확정된 결정사항 (2026-05-28)**
> - DB: PostgreSQL 16 (Docker)
> - 경품 재고: 전부 유한, 어드민이 직접 설정 → 재고 소진 시 꽝 처리
> - 이메일 정책: `jobFunction == STUDENT_FREELANCER`면 개인 메일 허용, 나머지 14종은 회사 메일 강제
> - AI: 오픈소스 **Ollama** (Docker, CPU only), 모델 **`qwen2.5:1.5b`** (≈1GB, 한국어 분석 + JSON 모드 안정)
> - **Spring Boot 3.4 (LTS) + Spring AI 1.x** — `ChatClient` + `BeanOutputConverter`로 구조화 출력(JSON 파싱 코드 0줄), `PromptTemplate` 변수 치환, Advisors로 로깅/메모리, Micrometer 자동 통합. (Spring Boot 4 GA는 메이븐 센트럴 미배포 시점이라 3.4 LTS 채택)
> - **부스 운영(검색/추첨/재고)은 비인증 공개** (기획서 운영자 흐름), **어드민 페이지/API만 로그인 필요**, 초기 어드민은 앱 기동 시 자동 시드
> - JWT 만료: 8시간
> - 데이터 보존: 24개월 (수집일 기준), 만료 시 hard delete
> - 차단 이메일 도메인: gmail.com, naver.com, empas.com, nate.com, daum.net, hanmail.net, hotmail.com, yahoo.co.kr, icloud.com, outlook.com, kakao.com
> - 어드민 대시보드: 풀 대시보드 (요약·타임라인·세그먼트·모니터링·도입의사·경품·와탭 NPS 7개 API)
> - 설문 폼: 실제 와탭 설문 8페이지 분기 폼 그대로 반영 (스크린샷 기반)
> - **SSR**: Thymeleaf로 QR/설문/Thank-you/어드민 폼 빌더 페이지 직접 렌더링 (뽑기·검색은 별도 SPA가 `/api/**` 호출)
> - **QR**: ZXing으로 PNG 생성, 부스 풀스크린 페이지(`/event/{code}/qr`) 제공
> - **폼 관리**: `FormTemplate` JSONB 스키마로 정의, 어드민이 행사별로 기본 템플릿을 복사·커스텀
> - **CSV 다운로드**: 리드 + 대시보드 집계 6종 CSV export (UTF-8 BOM, RFC 4180, 한국어 라벨)
> - **Lead-Event 1:N**: Lead row마다 행사 1개에 귀속, UNIQUE(phone, event_id) — 다행사 참여 시 새 row
> - **폼 스냅샷**: 행사 첫 제출 시점에 `Event.form_schema_snapshot`에 JSON 잠금, 이후 FormTemplate 수정해도 진행 중 행사 영향 없음
> - **Event 상태머신**: DRAFT → OPEN → CLOSED → ARCHIVED
> - **AI 리드 등급 v6**: 룰 선적용 + LLM 폴백, `NextAction` enum, 0~100 점수, 재시도(30s/5m/30m), 수동 등급 수정, 마케터 룰/프롬프트 어드민 편집, 모델 버전 추적, PENDING 모니터링

---

## 1. 목표 및 범위

### MVP 범위 (필수 구현)

- 와탭 8페이지 분기 설문 데이터 수집 및 직무 기반 이메일 검증
- **Thymeleaf SSR 페이지**: 설문 폼 / Thank-you / 마감 / QR 풀스크린 / 어드민 폼 빌더
- **행사별 QR 생성** (ZXing PNG + 부스 풀스크린 표시 페이지)
- **폼 빌더**: `FormTemplate` JSONB 스키마, 행사마다 기본 템플릿 복사 후 커스텀 가능
- 검색/추첨/재고/이력 비인증 공개 (부스 운영자는 별도 로그인 없이 즉시 사용)
- 어드민 로그인 + 행사·경품·운영자·리드·폼 관리
- 일자별 중복 방지 + 유한 재고 추첨 (꽝 포함)
- Ollama 로컬 LLM 리드 등급 분류
- 풀 어드민 대시보드 7개 API
- **리드/대시보드 CSV 다운로드** (UTF-8 BOM, 한국어 라벨, 스트리밍)
- 2년 보존 + 만료 파기 API

### 확장 후보 (시간 여유 시)
- 폼 빌더 시각화 UI (현재 MVP는 JSON 직편집)
- AI 후속 메시지 초안 생성 — `POST /api/ai/follow-up-message`
- XLSX export (현재 MVP는 CSV)
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
| 언어/프레임워크 | **Java 21 + Spring Boot 3.4 (LTS)** | Spring Framework 6.2, Jakarta EE 10 |
| 빌드 | Gradle 8.14 (Docker 이미지) | Wrapper 미사용, `gradle:8.14-jdk21` 빌드 컨테이너 |
| DB | **PostgreSQL 16 (Docker)** | `docker-compose up`으로 즉시 기동 |
| ORM | **Spring Data JPA + Hibernate 6.6** | 마이그레이션은 Flyway (V1, V2…) |
| 인증 | **Spring Security 6.4 + JWT (jjwt 0.12)** | 어드민 로그인, 운영 endpoint는 비인증 |
| 비밀번호 해시 | BCrypt | Spring Security `PasswordEncoder` |
| 검증 | Jakarta Bean Validation 3.1 | `@NotBlank`, `@Pattern`, custom validator |
| **SSR 템플릿** | **Thymeleaf** | QR 표시·설문 폼·Thank you 페이지·어드민 폼 빌더 |
| **클라이언트 보조** | HTMX + Alpine.js (CDN) | 분기 표시/숨김, 폼 단계 이동 — SPA 없이 가벼운 인터랙션 |
| **QR 생성** | `com.google.zxing:core` + `zxing:javase` | PNG/SVG 출력 |
| **AI 프레임워크** | **Spring AI 1.x** (`spring-ai-starter-model-ollama`) | `ChatClient`, `BeanOutputConverter`, `PromptTemplate`, Advisors, Micrometer 자동 통합 |
| AI 런타임 | **Ollama (Docker, CPU only)** | `http://ollama:11434`, 모델 **`qwen2.5:1.5b`** (≈1GB). GPU 미사용 |
| 직렬화 | Jackson | LocalDate/LocalDateTime ISO-8601 |
| 테스트 | JUnit 5 + Spring Boot Test + Testcontainers | Postgres 컨테이너 + Ollama 통합 테스트 |
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

Lead (설문 제출자 — 1 행사 1 row)
├── id (PK, UUID)
├── event_id (FK Event)            ← 어느 행사 QR로 들어왔는지
├── first_name (이름; 예: "길동")
├── last_name (성;   예: "홍")
├── full_name (검색용 generated column = last_name || first_name; 예: "홍길동" — 한국 이름 관례)
├── phone (정규화된 11자리)
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
└── UNIQUE(phone, event_id)        # 같은 행사 같은 사람은 1번만, 다른 행사면 새 row

EmailRejectionLog (검증 실패 시도 — validEmailRatio 분모용)
├── id (PK)
├── event_id (FK Event, nullable)
├── attempted_email (해시값만 저장 - 원본 PII 안 남김)
├── reason (BLOCKED_DOMAIN | INVALID_FORMAT | CONSENT_MISSING)
├── job_function (ENUM, nullable)
├── created_at
└── ip_hash

Event (행사)
├── id (PK)
├── event_code (UNIQUE, 짧은 슬러그 - URL용 예: "devops-day-2026")
├── event_date (행사 일자, 다일 행사면 시작일)
├── end_date (다일 행사 종료일, nullable)
├── label (예: "DEVOPS DAY 2026")
├── form_template_id (FK FormTemplate, 참고용 - 어디서 복사했는지)
├── form_schema_snapshot (JSONB - 행사 첫 제출 시점에 잠금)
├── form_locked (boolean - 첫 제출 후 true. 폼 교체/수정 차단)
├── qr_image_path (서버 캐시된 QR PNG 경로, nullable)
├── status (ENUM EventStatus: DRAFT | OPEN | CLOSED | ARCHIVED)
├── created_by (FK AppUser)
├── created_at
└── (1:1) FormTemplate (snapshot via JSONB)

FormTemplate (설문 폼 정의)
├── id (PK)
├── name (예: "와탭 기본 설문 v1", "DEVOPS DAY 커스텀")
├── is_system_default (boolean - 와탭 기본 템플릿은 1개, 잠금)
├── schema (JSONB - 페이지/필드/분기/검증 정의, 아래 3.5 참고)
├── version (낙관적 잠금용)
├── created_by (FK AppUser)
├── cloned_from_id (FK self, nullable - 어떤 템플릿을 복사했는지)
├── created_at
└── updated_at

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
├── ai_status (ENUM AiStatus: PENDING | DONE | FAILED | RULE_ONLY | MANUAL_OVERRIDE)
├── grade (ENUM Grade: A | B | C, nullable)
├── score (SMALLINT 0~100, nullable)         # 정렬·필터용 점수
├── next_action (ENUM NextAction)            # 자유 텍스트 아닌 enum
├── reason (TEXT)                            # 룰/LLM 산출 사유 1~2문장
├── source (ENUM ScoreSource: RULE | LLM | RULE_LLM_HYBRID | MANUAL)
├── rule_hits (TEXT[])                       # 적용된 룰 code 목록
├── model_name (예: "qwen2.5:1.5b", nullable)
├── model_version (Ollama digest, nullable)
├── attempt_count (INT, 재시도 누적)
├── last_attempted_at
├── manually_overridden_by (FK AppUser, nullable)
├── manually_overridden_at (nullable)
├── created_at
└── updated_at

AiRule (마케터 편집 가능한 룰 — 선적용)
├── id (PK)
├── code (UNIQUE, 예: "EXEC_PLAN_AUTO_A")
├── name (예: "결정권자 + 교체 계획 → A")
├── priority (INT, 낮을수록 먼저 적용)
├── condition (JSONB - 조건식)
├── outcome (JSONB - { grade, score, nextAction, reason })
├── enabled (boolean)
├── updated_by (FK AppUser)
├── created_at
└── updated_at

AiPromptTemplate (시스템 프롬프트 — 마케터 편집 가능)
├── id (PK)
├── name (UNIQUE)
├── body (TEXT, 변수 치환)
├── is_active (boolean - partial UNIQUE WHERE is_active = true)
├── version (낙관적 잠금)
├── updated_by (FK AppUser)
├── created_at
└── updated_at
```

**`NextAction` enum (자유 텍스트 → 분류 가능)**

| value | 의미 |
| --- | --- |
| `MEETING_PROPOSAL_24H` | 24시간 내 영업 미팅 제안 |
| `MEETING_PROPOSAL_WEEK` | 1주 내 미팅 제안 |
| `PRODUCT_INTRO_EMAIL` | 제품 소개 이메일 발송 |
| `TECH_CONSULT_EMAIL` | 기술 컨설팅 안내 |
| `NURTURE_NEWSLETTER` | 뉴스레터 등록 후속 |
| `WEBINAR_INVITE` | 웨비나 초대 |
| `NO_ACTION` | 후속 액션 불필요 |

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

### 3.4 인덱스 / 제약

- `AppUser(username)` UNIQUE
- `Lead(phone, event_id)` UNIQUE — 같은 행사 내 중복 제출만 차단, 다른 행사면 별도 row 허용
- `Lead(event_id, full_name, phone_last4)` 운영자 검색 가속 (행사별 검색)
- `Lead(event_id, industry)`, `Lead(event_id, monitoring_status)`, `Lead(event_id, plan_within_year)` 대시보드 집계용
- `Lead(retention_until)` 보존 만료 배치용
- `Lead(survey_payload jsonb_path_ops)` GIN — 모니터링 제품별 집계
- `DrawHistory(lead_id, event_id)` UNIQUE — Postgres에서 `lead_id` NULL은 distinct 취급되므로 익명화 후에도 충돌 없음
- `Prize(event_id, rank)` UNIQUE
- `Event(event_code)` UNIQUE
- `Event(status)` 활성 행사 조회용
- `FormTemplate(is_system_default)` partial UNIQUE WHERE is_system_default = true
- `EmailRejectionLog(event_id, created_at)` 비율 계산용
- `LeadScore(ai_status, last_attempted_at)` PENDING 모니터링/재시도 대상 조회용
- `LeadScore(grade, score)` 대시보드/정렬용
- `AiRule(enabled, priority)` 룰 적용 시 순회용
- `AiPromptTemplate(is_active)` partial UNIQUE WHERE is_active = true

### 3.5 FormTemplate `schema` JSONB 구조

폼 빌더로 편집 가능한 폼 정의. 와탭 기본 템플릿은 §3.1 / §4.1 구조를 그대로 JSON으로 옮겨 시드.

```jsonc
{
  "version": 1,
  "title": "WhaTap 설문 이벤트",
  "subtitle": "본 설문은 데이터의 신뢰성을 위해 ...",
  "pages": [
    {
      "id": "common-1",
      "title": "기본 정보",
      "fields": [
        { "key": "firstName",  "type": "TEXT",  "label": "성",    "required": true },
        { "key": "lastName",   "type": "TEXT",  "label": "이름",  "required": true },
        { "key": "company",    "type": "TEXT",  "label": "회사명", "required": true },
        {
          "key": "email", "type": "EMAIL", "label": "회사 이메일", "required": true,
          "helper": "경품은 기입하신 비즈니스 이메일을 통해 본인 확인 후 발송됩니다. (gmail, naver, kakao 등 개인 이메일 기재 시 당첨 제외)",
          "validation": "COMPANY_EMAIL_IF_NOT_STUDENT_FREELANCER"
        },
        { "key": "phone",      "type": "PHONE", "label": "핸드폰 번호", "required": true,
          "pattern": "^010\\d{8}$" },
        { "key": "industry",      "type": "SELECT",       "label": "산업군",   "required": true, "optionsRef": "INDUSTRY" },
        { "key": "jobFunction",   "type": "SELECT",       "label": "직무",     "required": true, "optionsRef": "JOB_FUNCTION" },
        { "key": "jobLevel",      "type": "SELECT",       "label": "직급",     "required": true, "optionsRef": "JOB_LEVEL" },
        { "key": "companySize",   "type": "SELECT",       "label": "기업 규모", "required": true, "optionsRef": "COMPANY_SIZE" },
        { "key": "employeeCountRange", "type": "SELECT",  "label": "직원 수",   "required": true, "optionsRef": "EMPLOYEE_COUNT_RANGE" },
        { "key": "monitoringStatus", "type": "RADIO",     "label": "현재 모니터링을 사용하고 계신가요?", "required": true, "optionsRef": "MONITORING_STATUS" }
      ],
      "branching": [
        { "when": { "monitoringStatus": "USING_WHATAP" }, "goTo": "whatap" },
        { "when": { "monitoringStatus": "USING_OTHER"  }, "goTo": "other" },
        { "when": { "monitoringStatus": "NOT_USING"   },  "goTo": "not-using" }
      ]
    },
    {
      "id": "other",
      "title": "사용 중인 모니터링",
      "fields": [
        { "key": "surveyPayload.other.commercialProducts", "type": "CHECKBOX_MULTI",
          "label": "어떤 모니터링을 사용하고 계신가요? (복수선택 가능)", "required": true,
          "optionsRef": "COMMERCIAL_PRODUCT" },
        { "key": "surveyPayload.other.commercialOther", "type": "LONG_ANSWER",
          "label": "사용하고 계신 상용 모니터링 제품을 작성해 주세요.",
          "showWhen": { "surveyPayload.other.commercialProducts": { "contains": "OTHER" } } },
        { "key": "surveyPayload.other.openSourceProducts", "type": "CHECKBOX_MULTI",
          "label": "어떤 오픈소스 모니터링을 사용하고 계신가요? (복수선택 가능)",
          "showWhen": { "surveyPayload.other.commercialProducts": { "contains": "OPEN_SOURCE" } },
          "optionsRef": "OPEN_SOURCE_PRODUCT" }
        /* ... 동일 패턴으로 페이지 #3, #5 분기까지 정의 */
      ]
    }
    /* "whatap", "not-using", "common-7" 페이지도 같은 구조 */
  ],
  "options": {
    "INDUSTRY":             [{ "value": "FINANCE_INSURANCE", "label": "금융 및 보험 서비스" }, ...],
    "JOB_FUNCTION":         [{ "value": "DEVOPS",            "label": "DevOps" }, ...],
    "JOB_LEVEL":            [...],
    "COMPANY_SIZE":         [...],
    "EMPLOYEE_COUNT_RANGE": [...],
    "MONITORING_STATUS":    [...],
    "COMMERCIAL_PRODUCT":   [...],
    "OPEN_SOURCE_PRODUCT":  [...],
    "INTEREST_PRODUCT":     [{ "value": "APM", "label": "애플리케이션 모니터링" }, ...],
    "ADOPTION_BLOCKER":     [...],
    "PLAN_WITHIN_YEAR":     [...],
    "CONSULTATION_PREFERENCE": [...]
    /* enum 카탈로그를 schema 안에 임베드 — 어드민이 라벨만 바꿀 수 있도록 (value는 enum 고정) */
  },
  "consents": [
    { "key": "privacyConsent",   "label": "개인정보 수집·이용 동의", "required": true, "body": "..." },
    { "key": "marketingConsent", "label": "마케팅 활용 동의",       "required": true, "body": "..." }
  ],
  "thankYou": {
    "headline": "설문에 참여해 주셔서 감사합니다.",
    "subhead": "완료하신 분께서는 이 화면을 직원에게 보여 주세요!",
    "body": "..."
  }
}
```

**필드 타입**: `TEXT`, `EMAIL`, `PHONE`, `LONG_ANSWER`, `SELECT`, `RADIO`, `CHECKBOX_MULTI`, `SCALE_1_10`, `CONSENT`

**커스터마이즈 범위**
- 페이지 추가/삭제/순서 변경
- 필드 추가/삭제/순서/required 변경, 라벨 변경
- 분기 조건(`branching`/`showWhen`) 편집
- 옵션 카탈로그(`options`) 라벨 변경 (단, value는 enum 고정 — 분석 일관성 유지)
- 동의 문구 본문 편집
- Thank you 메시지 편집

**불변 (잠금)**
- enum value 추가/제거 (예: 새 산업군 추가는 코드 변경 필요)
- 시스템 핵심 키 제거 — `firstName`, `lastName`, `phone`, `email`, `industry`, `jobFunction`, `jobLevel`, `companySize`, `employeeCountRange`, `monitoringStatus`, `adoptionBlocker`, `interestProducts`, `planWithinYear`, `consultationPreference`, `privacyConsent`, `marketingConsent` (검색·검증·집계가 의존)
- `showWhen` 표기는 **필드 key 기반**으로 단순화: `{ "monitoringStatus": "USING_OTHER" }` 같은 단일 키 매칭만 허용. 깊은 경로(`surveyPayload.other.commercialProducts`)는 빌더 UI에서 노출 안 함 — schema 저장 시 평탄화 키 사용

**역할별 권한 매트릭스**

기획서 운영자 흐름(이름+휴대폰 뒷자리로 즉시 추첨)을 따라 **부스 운영용 API는 비인증 공개**. 어드민(행사/경품/리드/CSV 관리)만 로그인 필요.

| 리소스 | 비인증 | ADMIN |
| --- | --- | --- |
| `POST /api/leads` (설문 제출, IP rate-limit 10/min) | ✅ | ✅ |
| `GET /api/leads/search` (이름 + 휴대폰 뒷자리) | ✅ | ✅ |
| `POST /api/draw` | ✅ | ✅ |
| `GET /api/draw/history` | ✅ | ✅ |
| `GET /api/prizes` | ✅ | ✅ |
| `GET /survey/**`, `GET /event/**` (SSR) | ✅ | ✅ |
| `POST /api/auth/login` (5회 실패 IP 15분 잠금) | ✅ | ✅ |
| `POST /api/ai/lead-score` (재분석은 ADMIN, 설문 제출 직후 자동 호출은 시스템 내부) | ❌ | ✅ |
| `/api/admin/**`, `/admin/**` (SSR) | ❌ | ✅ |

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
  "role": "OPERATOR",
  "userId": "uuid"
}
```

- JWT는 stateless, 만료 8시간
- 리프레시 토큰 없음 (만료 시 재로그인)
- **5회 연속 실패 시 IP 15분 잠금** (`Bucket4j` 또는 in-memory `Caffeine`로 구현, MVP 필수)
- 로그인 실패는 `AuditLog`에 기록 (username + ipHash + ts)

### 4.1 설문 제출 — `POST /api/leads` (비인증)

페이지 #1~#7 응답을 한 번에 제출 받음. 프론트는 단계별 진행 상태를 로컬에 유지하다가 Submit 시점에 통째로 POST.

**Request**
```jsonc
{
  "eventCode": "devops-day-2026",            // 어느 행사 QR로 진입했는지 (URL path에서 자동 주입 가능)
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
- `eventCode`: 필수, `Event(event_code)` 존재 확인 → 없으면 `404`, `status != OPEN`이면 `409 EVENT_CLOSED`
- `firstName`, `lastName`: 필수, 각 1~20자
- `phone`: `^010\d{8}$` (하이픈/공백/+82 정규화 후)
- `email`: 형식 검증 통과
- `privacyConsent`, `marketingConsent`: 둘 다 `true` (`@AssertTrue`)
- 모든 enum 필드 값 유효성
- **동일 `(phone, event_id)` 재제출 시 → 기존 row upsert** (`retention_until` 새로 계산). 다른 행사면 새 row
- 검증 실패(차단 도메인/형식/동의) 시 `EmailRejectionLog`에 시도 기록 (해시만)
- 첫 제출일 때 `Event.form_schema_snapshot`이 비어있으면 `FormTemplate.schema`를 복사해 잠금, `form_locked=true`

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
  "eventCode": "devops-day-2026",
  "eventId": "uuid",
  "createdAt": "2026-05-28T10:00:00",
  "retentionUntil": "2028-05-28"
}
```

**Error**
- `400` 필드 검증 실패
- `404 EVENT_NOT_FOUND` — eventCode 존재 안 함
- `409 EVENT_CLOSED` — 행사 상태 OPEN 아님
- `409 PERSONAL_EMAIL_NOT_ALLOWED` — 비학생/비프리랜서인데 개인 메일 (rejection 로그 기록)
- `409 SURVEY_PAYLOAD_MISMATCH` — `monitoringStatus`와 `surveyPayload` 키 불일치
- `409 CONSENT_REQUIRED` — 동의 누락
- `429 TOO_MANY_REQUESTS` — IP 기반 분당 10건 초과

### 4.2 참여자 검색 — `GET /api/leads/search?name={}&phoneLast4={}&eventCode={}` (OPERATOR/ADMIN)

**검증**
- `name` 필수, `phoneLast4` 정확히 4자리 숫자
- `eventCode` 필수 — Lead는 행사별 row이므로 `event_id`로 좁혀 검색

**Response (200)**
```json
{
  "eventCode": "devops-day-2026",
  "eventDate": "2026-05-28",
  "results": [
    {
      "leadId": "uuid",
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

- `aiStatus`가 `PENDING`이면 운영자 화면에서 "분석 중..." 표시 (등급/점수 hidden)
- `FAILED`면 "분석 실패 (재시도 가능)" + 재시도 버튼
- Lead가 행사별 row이므로 응답은 항상 해당 행사 제출자만 (`submitted` 플래그 불필요 — 결과에 있으면 제출했다는 뜻)
- 동명이인/뒷자리 중복 시 여러 건 → 프론트에서 회사명/직급으로 선택

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
  "drawnAt": "2026-05-28T10:05:12",
  "drawnBy": { "id": "uuid", "username": "operator01" }
}
```

재고 소진 시:
```json
{ "rank": null, "prizeName": null, "outOfStock": true, "drawnAt": "...", "drawnBy": {...} }
```

### 4.4 경품 현황 — `GET /api/prizes?eventCode={}` (OPERATOR/ADMIN)

```json
{
  "eventCode": "devops-day-2026",
  "eventDate": "2026-05-28",
  "prizes": [
    { "rank": 1, "name": "AirPods", "initial": 2, "awarded": 1, "remaining": 1 }
  ]
}
```

### 4.5 참여 이력 — `GET /api/draw/history?leadId={}&eventCode={}` (OPERATOR/ADMIN)

### 4.6 AI 리드 등급 (룰 선적용 + LLM 폴백)

#### 4.6.0 처리 파이프라인

```
설문 제출 (POST /api/leads)
    ↓
LeadSubmittedEvent 발행
    ↓
@Async LeadScoringPipeline (트랜잭션 분리, retry 가능)
    ↓
┌─────────────────────────────────────────────────────┐
│ 1. LeadScore upsert (ai_status=PENDING, attempt+1)   │
│ 2. AiRule 적용 (enabled=true, priority asc)          │
│    - condition 매칭 → outcome 채택, rule_hits 누적   │
│    - 결정적 룰 hit (grade + score 확정) → 종료(RULE)│
│    - 일부 룰만 hit → LLM에 hint 전달 (HYBRID)        │
│ 3. LLM 호출 (룰 결정 안 된 경우만 — 전체의 20%↓ 목표)│
│    - Spring AI `ChatClient.prompt(...).entity(LeadScoreResult.class)` │
│    - 내부: OllamaChatModel → /api/chat              │
│    - BeanOutputConverter가 JSON → Record 자동 매핑   │
│    - 모델 qwen2.5:1.5b (CPU only, 응답 1~3s)         │
│    - timeout 15s, num_ctx=2048, num_predict=200, temperature=0 │
│    - 입력: Lead 분류 + 의사 + survey_payload 요약    │
│    - 출력 record: LeadScoreResult(grade, score,     │
│      nextAction, reason) - JSON 파싱 코드 0줄        │
│ 4. LeadScore 업데이트 (DONE | RULE_ONLY | FAILED)    │
└─────────────────────────────────────────────────────┘
    ↓ (FAILED 경우)
재시도 스케줄러: 30초 → 5분 → 30분 (최대 3회)
    ↓
1시간 이상 PENDING 잔존 → 어드민 알림 (Phase 9 확장)
```

#### 4.6.1 자동/수동 분석 — `POST /api/ai/lead-score` (OPERATOR/ADMIN)

**Request**
```json
{ "leadId": "uuid", "force": false }
```

- `force=true`: 기존 LeadScore가 DONE이어도 재실행 (모델 교체 시)
- 호출 시점: ① 설문 제출 후 자동 비동기, ② 운영자/어드민 수동 재시도

**Response (200)**
```json
{
  "leadId": "uuid",
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

**Status 의미**
- `PENDING`: 분석 진행 중 (방금 제출 + 비동기 잡 미완료)
- `DONE`: LLM 또는 룰로 분석 완료
- `RULE_ONLY`: 룰만으로 결정 (LLM 호출 안 함)
- `FAILED`: 재시도 한도 도달, 수동 재시도 필요
- `MANUAL_OVERRIDE`: 어드민이 수동 편집

#### 4.6.2 수동 등급 수정 — `PATCH /api/admin/leads/{leadId}/score` (ADMIN)

**Request**
```json
{
  "grade": "B",
  "score": 65,
  "nextAction": "PRODUCT_INTRO_EMAIL",
  "reason": "도입 시기 불확실해서 등급 하향 조정 (검수자: 김마케터)"
}
```

- `ai_status` → `MANUAL_OVERRIDE`, `source` → `MANUAL`
- `manually_overridden_by` = 호출한 어드민
- 이후 자동 분석에서 덮어쓰지 않음 (재분석 원하면 `force=true`로 별도 호출)

#### 4.6.3 시스템 프롬프트 (활성 1개)

`AiPromptTemplate.is_active=true`인 row의 body를 사용. 변수는 Java side에서 안전하게 치환.

**기본 프롬프트 (시드)**

```text
당신은 WhaTap(통합 모니터링 솔루션) 사내 부스 이벤트에서 수집된 B2B 리드를 평가하는 분류기입니다.

[등급 기준]
- A: 결정 권한 있음 + 도입/교체 계획 명확 + 현재 솔루션 불만족 또는 미사용
- B: 영향력 있음 + 추가 도입/확장 계획 또는 만족하지만 신기능 관심
- C: 결정권 낮음 + 명확한 계획 없음 또는 학생/프리랜서

[점수 0-100]
- A 등급: 80-100
- B 등급: 50-79
- C 등급: 0-49

[적용 가능한 nextAction]
- MEETING_PROPOSAL_24H, MEETING_PROPOSAL_WEEK,
  PRODUCT_INTRO_EMAIL, TECH_CONSULT_EMAIL,
  NURTURE_NEWSLETTER, WEBINAR_INVITE, NO_ACTION

[입력]
직무: {{jobFunction}}, 직급: {{jobLevel}}, 산업: {{industry}},
기업규모: {{companySize}}, 직원수: {{employeeCountRange}},
현재 모니터링: {{monitoringStatus}}
{{#if commercial}}
사용 상용툴: {{commercial.products}}, 만족도: {{commercial.satisfaction}},
주요 불만: {{commercial.complaints}}, 연간예산: {{commercial.annualBudget}}
{{/if}}
{{#if openSource}}
오픈소스 어려움: {{openSource.difficulties}}
{{/if}}
망설이는 이유: {{adoptionBlocker}}
관심 제품: {{interestProducts}}
1년 내 계획: {{planWithinYear}}
상담 희망: {{consultationPreference}}

{{#if ruleHits}}
[적용된 룰 힌트] {{ruleHits}}
{{/if}}

[출력 형식 - JSON만, 다른 텍스트 금지]
{
  "grade": "A" | "B" | "C",
  "score": 0-100 사이 정수,
  "nextAction": 위 enum 중 하나,
  "reason": "한국어 1~2문장 사유"
}
```

#### 4.6.4 시드 룰 (AiRule 초기 데이터)

| code | priority | condition (요약) | outcome |
| --- | --- | --- | --- |
| `STUDENT_AUTO_C` | 10 | `jobFunction == STUDENT_FREELANCER` | C, 20, NURTURE_NEWSLETTER → **종료** |
| `EXEC_REPLACE_AUTO_A` | 20 | `jobLevel ∈ {TOP_EXECUTIVE, SENIOR_MGR} && planWithinYear ∈ {C_REPLACE, D_NEW_ADOPT}` | A, 90, MEETING_PROPOSAL_24H → **종료** |
| `EXEC_ONSITE_AUTO_A` | 25 | `jobLevel == TOP_EXECUTIVE && consultationPreference == ONSITE_MEETING` | A, 85, MEETING_PROPOSAL_24H → **종료** |
| `MGR_REPLACE_AUTO_A` | 27 | `jobLevel == MID_MGR && planWithinYear == C_REPLACE && consultationPreference == ONSITE_MEETING` | A, 82, MEETING_PROPOSAL_WEEK → **종료** |
| `DISSATISFIED_REPLACE_AUTO_A` | 30 | `survey_payload.other.commercial.satisfaction ∈ {DISSATISFIED, VERY_DISSATISFIED} && planWithinYear ∈ {C_REPLACE, D_NEW_ADOPT}` | A, 80, MEETING_PROPOSAL_WEEK → **종료** |
| `STAFF_NO_PLAN_AUTO_C` | 35 | `jobLevel == STAFF && planWithinYear == A_OPEN && consultationPreference == EMAIL_OR_PHONE` | C, 30, NURTURE_NEWSLETTER → **종료** |
| `EXPAND_PLAN_AUTO_B` | 40 | `planWithinYear == B_EXPAND && jobLevel ∈ {SENIOR_MGR, MID_MGR}` | B, 65, PRODUCT_INTRO_EMAIL → **종료** |
| `NO_INTEREST_AUTO_C` | 45 | `interestProducts is empty && planWithinYear == A_OPEN` | C, 25, NURTURE_NEWSLETTER → **종료** |
| `DISSATISFIED_HINT` | 60 | `survey_payload.other.commercial.satisfaction ∈ {DISSATISFIED, VERY_DISSATISFIED}` | grade hint=A → **LLM** |
| `EXEC_HINT` | 70 | `jobLevel ∈ {TOP_EXECUTIVE, SENIOR_MGR}` | hint → **LLM** |

→ **결정적 룰 8개로 약 80~85% Lead가 LLM 호출 없이 즉시 분류**. 나머지 borderline만 LLM 사용.

- 결정적 룰 = `outcome.grade`가 확정값일 때 LLM 생략
- hint 룰 = LLM에 컨텍스트로 전달, 최종 판단은 LLM
- `priority` 낮은 것부터 적용, 결정적 룰 hit 시 즉시 종료

#### 4.6.5 재시도 정책

- 첫 호출 실패 시 → 30초 후 자동 재시도 (Spring `@Retryable` + `@Async`)
- 2번째 실패 → 5분 후
- 3번째 실패 → 30분 후
- 세 번 모두 실패 → `ai_status=FAILED`, 어드민 알림 필요
- JSON 파싱 실패도 재시도 사유로 카운트
- `attempt_count`, `last_attempted_at` 매 시도마다 갱신

#### 4.6.6 PENDING/FAILED 모니터링

`GET /api/admin/leads/pending-scores` (ADMIN)

**응답**
```json
{
  "pendingCount": 4,
  "failedCount": 1,
  "pending": [
    { "leadId": "uuid", "attemptCount": 1, "lastAttemptedAt": "2026-05-28T10:01:00+09:00" }
  ],
  "failed": [
    { "leadId": "uuid", "attemptCount": 3, "reason": "AI 분석 보류: 타임아웃" }
  ]
}
```

- 어드민 홈 대시보드 카드에 "분석 대기/실패 N건" 표시 (`pendingCount + failedCount`)
- (Phase 9 확장) Slack/메일 알림 — `@Scheduled` 15분마다 체크

#### 4.6.7 PENDING 자동 파기 정책

- `Lead.retention_until` 도래 시 LeadScore도 cascade 삭제
- PENDING/FAILED 상태도 동일하게 보존 기간 따름 (별도 만료 정책 없음)

#### 4.6.8 모델 버전 추적

- Ollama `/api/show` 응답의 `digest`를 `model_version`에 기록
- 모델 교체 시 어드민이 `force=true`로 일괄 재분석 가능 (`POST /api/admin/leads/rescore?model=qwen2.5:1.5b`)

#### 4.6.9 Spring AI 사용 패턴

**의존성 (build.gradle)**
```gradle
implementation 'org.springframework.boot:spring-boot-starter-web'
implementation 'org.springframework.ai:spring-ai-starter-model-ollama'
```

**LeadScoreResult record (구조화 출력 타깃)**
```java
public record LeadScoreResult(
    Grade grade,            // A | B | C
    int score,              // 0-100
    NextAction nextAction,  // enum
    String reason
) {}
```

**`LeadScoringPipeline` 핵심 호출**
```java
@Service
class LeadScoringPipeline {
    private final ChatClient chatClient;
    private final AiPromptService promptService;
    private final AiRuleEvaluator ruleEvaluator;

    public LeadScoringPipeline(ChatClient.Builder builder,
                               AiPromptService promptService,
                               AiRuleEvaluator ruleEvaluator) {
        this.chatClient = builder
            .defaultOptions(OllamaOptions.builder()
                .model("qwen2.5:1.5b")
                .temperature(0.0)
                .numCtx(2048)
                .numPredict(200)
                .build())
            .defaultAdvisors(new SimpleLoggerAdvisor())
            .build();
        this.promptService = promptService;
        this.ruleEvaluator = ruleEvaluator;
    }

    @Async
    @Retryable(maxAttempts = 3, backoff = @Backoff(delay = 30_000, multiplier = 10))
    public LeadScoreResult score(Lead lead) {
        // 1. 룰 선적용
        RuleOutcome rule = ruleEvaluator.evaluate(lead);
        if (rule.isTerminal()) return rule.toResult();   // LLM 호출 생략

        // 2. LLM 호출 (Spring AI ChatClient)
        PromptTemplate tpl = promptService.activePromptTemplate();
        return chatClient.prompt()
            .system(tpl.render(lead, rule.hints()))
            .user("위 입력으로 등급을 평가하세요.")
            .call()
            .entity(LeadScoreResult.class);          // ← JSON 파싱 자동
    }
}
```

**효과**
- `format=json` 강제, OutputParser 작성, Jackson 매핑 등의 코드가 모두 사라짐
- 응답 스키마 변경 시 record만 수정하면 됨
- Micrometer 메트릭(`spring.ai.chat.client.*`)으로 호출 횟수/지연 자동 집계 → 어드민 대시보드에 노출 가능

#### 4.6.10 Spring AI Advisors 활용

| Advisor | 용도 |
| --- | --- |
| `SimpleLoggerAdvisor` | 모든 LLM 호출 prompt/response 로깅 (개발/디버깅) |
| `MessageChatMemoryAdvisor` | (확장) follow-up message 생성 시 대화 컨텍스트 유지 |
| 커스텀 `RuleContextAdvisor` | 시스템 메시지 앞에 `ruleHits`를 자동 주입 |

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

#### `GET /api/admin/leads`
**쿼리 파라미터** — 모두 선택. 미지정 시 전체.
- `eventCode` (행사 코드. 단일 행사 선택)
- `industry`, `jobLevel`, `monitoringStatus`, `planWithinYear` (enum)
- `grade` (A/B/C — AI 등급)
- `page` (기본 0), `size` (기본 50)

**응답**
```json
{
  "content": [
    {
      "id": "uuid",
      "eventId": "uuid",
      "name": "홍길동",
      "company": "와탭랩스",
      "industry": "IT_SERVICES",
      "jobLevel": "STAFF",
      "monitoringStatus": "USING_OTHER",
      "createdAt": "...",
      "retentionUntil": "2028-05-28",
      "aiStatus": "DONE",
      "grade": "B",
      "score": 68
    }
  ],
  "totalElements": 142,
  "totalPages": 3,
  "page": 0,
  "size": 50
}
```

- `aiStatus`/`grade`/`score`는 `LeadScore`가 있는 리드만 포함
- `grade` 필터는 응답 결과에서 등급으로 1차 필터링 (Specification → in-memory)

#### 그 외
- `GET /api/admin/leads/{id}` — 상세 (설문 + 추첨 + AI 등급 묶음, `survey_payload` 포함)
- `DELETE /api/admin/leads/expired` — 보존 기간(2년) 만료 리드 일괄 파기 → `{"deleted": n}`

### 리드 CSV 다운로드 — `GET /api/admin/leads/export.csv`

쿼리 파라미터(목록 조회와 동일): `eventCode`, `industry`, `jobLevel`, `monitoringStatus`, `planWithinYear`, `grade`, `from`, `to`, `consultationPreference`

**응답 헤더**
```
Content-Type: text/csv; charset=UTF-8
Content-Disposition: attachment; filename="leads_2026-05-28_175430.csv"
```

**포맷 (RFC 4180 + Excel 호환)**
- 인코딩: **UTF-8 + BOM** (`EF BB BF`) — Excel 한글 깨짐 방지
- 구분자: `,`
- 줄바꿈: `\r\n`
- 따옴표 escape: `"` → `""`, 콤마/줄바꿈 포함 시 전체 필드를 `"..."`로 감쌈
- 첫 줄 헤더, 한국어 라벨

**컬럼 (47개)**
```
이벤트 코드, 이벤트 일자,
리드 ID, 성, 이름, 회사명, 회사 이메일, 휴대폰,
산업군, 직무, 직급, 기업 규모, 직원 수,
현재 모니터링 상태,
사용 상용 모니터링 (콤마 구분), 상용 모니터링 기타,
사용 오픈소스 모니터링 (콤마 구분), 오픈소스 모니터링 기타,
상용 운영방식, 상용 만족도, 상용 불만 (콤마 구분), 상용 연간예산, 상용 비용체감, 상용 교체이유,
오픈소스 운영방식 (콤마 구분), 오픈소스 만족도, 오픈소스 어려운점 (콤마 구분),
미사용자 운영고민 (콤마 구분), 미사용자 빈도문제 (콤마 구분),
와탭 활용도, 와탭 필요도움 (콤마 구분),
망설이는 이유, 관심 제품 (콤마 구분), 1년내 계획, 미팅 희망,
개인정보 동의 시각, 마케팅 동의 시각, 보존 만료일,
AI 등급, AI 사유, AI 후속액션, AI 산출 시각,
추첨 등수, 경품명, 추첨 시각, 추첨 운영자,
제출 시각
```

- enum 값은 **한국어 라벨로 변환** (예: `IT_SERVICES` → `정보기술(IT) 및 서비스`)
- `survey_payload` 깊은 구조는 위에 평탄화된 컬럼으로 펼침
- 비어있는 값은 빈 문자열 (`null` 직접 출력 금지)
- 동의·추첨 시각은 ISO-8601 (`2026-05-28T10:05:12+09:00`)

**스트리밍 구현**
- 대량 데이터 대비 `ResponseBodyEmitter` 또는 `StreamingResponseBody`로 청크 단위 전송
- 메모리에 전체 row 안 올림
- `Cursor` 기반 페치 (`@QueryHints` `FETCH_SIZE`)

**감사 로그**
- `AuditLog`에 `username`, `endpoint`, `filter`, `rowCount`, `ipAddress` 기록 (개인정보 export는 추적)

### 대시보드 CSV 다운로드 (ADMIN)

집계 결과도 CSV로 받을 수 있도록 — 마케터가 엑셀에서 가공할 때 편함.

| 엔드포인트 | 파라미터 | 컬럼 |
| --- | --- | --- |
| `GET /api/admin/dashboard/export/summary.csv` | `eventCode` | 이벤트 코드 / 이벤트 일자 / 총 리드 / 추첨 / 상담 희망 / 유효 메일 비율 / 거부 이메일 |
| `GET /api/admin/dashboard/export/timeline.csv` | `from`, `to` | 일자 / 제출 / 추첨 / 상담 희망 |
| `GET /api/admin/dashboard/export/segments.csv` | `eventCode` | 세그먼트(industry/jobFunction/jobLevel/companySize/monitoringStatus) / 값 / 건수 (long-format) |
| `GET /api/admin/dashboard/export/monitoring.csv` | `eventCode` | 그룹(commercialProductUsage/openSourceUsage/commercialSatisfaction/switchReasons/adoptionBlockers) / 값 / 건수 |
| `GET /api/admin/dashboard/export/intent.csv` | `eventCode` | 그룹(interestProducts/planWithinYear/consultationPreference/adoptionBlocker) / 값 / 건수 |

공통 규약: UTF-8 BOM, RFC 4180, `Content-Disposition: attachment; filename="dashboard-*.csv"`, 한국어 헤더, `StreamingResponseBody`.

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
  "validEmailRatio": 0.93,           // leadCount / (leadCount + emailRejectionCount)
  "emailRejectionCount": 11,         // EmailRejectionLog 카운트
  "gradeDistribution": { "A": 23, "B": 71, "C": 44, "PENDING": 4 }
}
```

- `validEmailRatio` 분모는 `Lead` + `EmailRejectionLog` 합 — 검증 통과 비율 정의
- `PENDING`은 AI 호출 보류/실패 (`LeadScore.grade IS NULL`)

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

## 4.C 서버사이드 페이지 (Thymeleaf SSR)

> 부스 모바일 진입을 빠르게 하기 위해 SSR. 운영자/어드민 페이지 중 뽑기 실행 같은 동적 인터랙션이 강한 것은 **별도 React/Vue SPA가 `/api/**`를 호출**하는 구조 (이 plan의 백엔드 책임은 SSR 페이지 + API 둘 다 제공).

### 4.C.1 행사 진입 QR — `GET /event/{eventCode}/qr.png` (공개)

ZXing으로 PNG 생성. 첫 호출 시 `event.qr_image_path`에 캐시.

- 인코딩 대상: `https://<host>/survey/{eventCode}`
- 크기: 1024×1024, 여백 4 모듈
- 캐시: 24h `Cache-Control`

### 4.C.2 부스 표시용 풀스크린 QR — `GET /event/{eventCode}/qr` (공개)

부스 모니터/태블릿에 띄울 풀스크린 페이지.

- 행사 라벨, 큰 QR 이미지, 짧은 안내 문구
- `<meta http-equiv="refresh">` 또는 JS로 1시간마다 새로고침 (재고/상태 동기화)
- 어드민 메뉴에서 미리보기 가능

### 4.C.3 설문 폼 — `GET /survey/{eventCode}` (공개)

- 해당 행사의 `FormTemplate.schema`를 읽어 Thymeleaf로 동적 렌더링
- HTMX/Alpine.js로 페이지 간 이동 + 분기 표시/숨김
- Submit은 `POST /api/leads` (eventCode 함께 전송 → 서버에서 `event_id` 매핑)
- 행사가 `archived=true`면 마감 안내 페이지

### 4.C.4 제출 완료 — `GET /survey/{eventCode}/complete` (공개)

- `FormTemplate.schema.thankYou` 렌더링
- "이 화면을 직원에게 보여 주세요" 안내
- 직전 제출의 `leadId`를 쿼리/쿠키로 잠깐 유지 (운영자 검색 도움용)

### 4.C.5 마감 안내 — `GET /survey/{eventCode}/closed` (공개)

행사 종료/재고 소진 시.

### 4.C.6 어드민 SSR 페이지 (ADMIN)

모든 어드민 페이지는 Thymeleaf로 렌더링하고, 동적 작업은 HTMX로 `/api/admin/**` 호출.

| 경로 | 페이지 | 주요 기능 |
| --- | --- | --- |
| `GET /admin` | 대시보드 홈 | 활성 행사 카드, 오늘 처리량, 빠른 링크 |
| `GET /admin/events` | 행사 목록 | DRAFT/OPEN/CLOSED/ARCHIVED 필터, 행사 생성 |
| `GET /admin/events/{id}` | 행사 상세 | 라벨/일자/QR 미리보기/폼 연결 상태/추첨 통계 |
| `GET /admin/events/{id}/prizes` | **경품 재고 관리** | 등수별 row 편집, 수량 추가/감소, 잔여/소진율 실시간 |
| `GET /admin/events/{id}/qr` | QR 미리보기 | `/event/{code}/qr` iframe + PNG 다운로드 |
| `GET /admin/forms` | 폼 템플릿 목록 | 시스템 기본 + 커스텀 목록, clone 버튼 |
| `GET /admin/forms/{id}/edit` | 폼 편집 | JSON 직편집 (MVP) + 라이브 미리보기 |
| `POST /admin/forms/{id}/preview` | 폼 미리보기 | 저장 없이 임시 렌더 |
| `GET /admin/users` | 운영자 계정 | 생성/활성화 토글/비밀번호 리셋 |
| `GET /admin/leads` | 리드 조회 | 필터 + 페이징 + 행 클릭 시 상세 + CSV 다운로드 버튼 |
| `GET /admin/dashboard` | 분석 대시보드 | §4.B 7개 API 결과를 카드/차트로 시각화 |
| `GET /admin/ai-rules` | AI 룰 관리 | 룰 목록, priority drag-and-drop, condition/outcome 편집, 시뮬레이션 |
| `GET /admin/ai-prompts` | AI 프롬프트 관리 | 활성 프롬프트 본문 편집, 샘플 입력 테스트, 활성화 토글 |
| `GET /admin/leads/{id}` | 리드 상세 + 등급 수동 수정 | grade/score/nextAction 편집 폼, `PATCH /api/admin/leads/{id}/score` 호출 |

**재고 관리 화면 상세 (`/admin/events/{id}/prizes`)**
- 표 형태로 1~5등 + 새 등수 추가 가능
- 컬럼: 등수 / 경품명 / 초기 수량 / 당첨 수 / 잔여 수량 / 소진율 / 액션
- 인라인 편집 (HTMX `PATCH /api/admin/prizes/{id}`)
- "행사 시작 후에는 수량 줄이기만 가능 (이미 차감된 양 이하 불가)" 가드
- 등수별 색상/이름 변경 가능
- 페이지 하단에 `/admin/dashboard/prizes` API의 burnRate 차트 미니뷰

---

## 4.D 폼 빌더 API (ADMIN)

### 4.D.1 폼 템플릿 목록 — `GET /api/admin/forms`

```json
{
  "templates": [
    { "id": "uuid", "name": "와탭 기본 설문 v1", "isSystemDefault": true, "usedByEvents": 3 },
    { "id": "uuid", "name": "DEVOPS DAY 커스텀", "isSystemDefault": false, "usedByEvents": 1 }
  ]
}
```

### 4.D.2 기본 템플릿 복사 — `POST /api/admin/forms/clone`

```json
{ "sourceId": "uuid", "name": "DEVOPS DAY 커스텀" }
```

→ `is_system_default=false`로 새 템플릿 생성. `cloned_from_id`에 출처 기록.

### 4.D.3 폼 조회 — `GET /api/admin/forms/{id}`

`schema` JSON 전체 반환.

### 4.D.4 폼 저장 — `PUT /api/admin/forms/{id}`

```json
{ "name": "...", "schema": { ... }, "version": 3 }
```

- 시스템 기본(`is_system_default=true`)은 **수정 불가** (`409 LOCKED_TEMPLATE`)
- 낙관적 잠금: `version` 불일치 시 `409 CONFLICT`
- `schema` 검증: 시스템 핵심 키 누락 시 `400 SCHEMA_INVALID`

### 4.D.5 폼 삭제 — `DELETE /api/admin/forms/{id}`

- 시스템 기본은 삭제 불가
- 사용 중인 행사 = `status ∈ {DRAFT, OPEN, CLOSED}` 행사가 있으면 `409 IN_USE` (archived 행사는 snapshot으로만 운영되므로 영향 없음, 삭제 가능)

### 4.D.6 행사에 폼 연결 — `PUT /api/admin/events/{eventId}/form`

```json
{ "formTemplateId": "uuid" }
```

- 행사 생성 시 자동으로 시스템 기본 템플릿이 연결됨 (`form_template_id` 세팅, snapshot은 비어있음)
- 어드민이 위 API로 다른 템플릿으로 교체 가능 — **단 `Event.form_locked == false`일 때만**
- 첫 제출(`POST /api/leads`) 발생 시점에 `form_schema_snapshot`에 schema 복사 + `form_locked=true`로 잠금
- 이후 같은 행사는 snapshot으로 렌더링되므로 FormTemplate 수정해도 영향 없음
- 잠금된 행사에 폼 교체 시도 시 `409 EVENT_FORM_LOCKED`

### 4.D.7 행사 코드/QR 재생성 — `POST /api/admin/events/{eventId}/regenerate-qr`

URL 변경 시 (예: `event_code` 변경) QR 캐시 무효화 + 재생성.

응답:
```json
{ "eventCode": "devops-day-2026", "qrUrl": "/event/devops-day-2026/qr.png" }
```

---

## 4.F AI 룰 / 프롬프트 관리 API (ADMIN)

마케터가 코드 수정/배포 없이 등급 룰과 시스템 프롬프트를 편집.

### 4.F.1 룰 목록 / 편집
- `GET /api/admin/ai-rules` — 룰 목록 (priority asc)
- `POST /api/admin/ai-rules` — 새 룰 생성 (`code`, `name`, `priority`, `condition`, `outcome`, `enabled`)
- `PATCH /api/admin/ai-rules/{id}` — 룰 수정
- `DELETE /api/admin/ai-rules/{id}` — 룰 삭제 (시드 룰은 disable만 가능, 삭제 불가)
- `POST /api/admin/ai-rules/{id}/test` — 가상 Lead 입력으로 룰 시뮬레이션

**`condition` JSONB 예시**
```json
{
  "all": [
    { "field": "jobLevel", "op": "in", "value": ["TOP_EXECUTIVE", "SENIOR_MGR"] },
    { "field": "planWithinYear", "op": "in", "value": ["C_REPLACE", "D_NEW_ADOPT"] }
  ]
}
```

지원 op: `eq`, `neq`, `in`, `not_in`, `contains` (JSONB 경로 지원: `survey_payload.other.commercial.satisfaction`)

### 4.F.2 시스템 프롬프트 관리
- `GET /api/admin/ai-prompts` — 프롬프트 목록
- `GET /api/admin/ai-prompts/{id}` — 본문 + 변수 목록
- `POST /api/admin/ai-prompts` — 새 프롬프트
- `PATCH /api/admin/ai-prompts/{id}` — 본문 수정 (낙관적 잠금)
- `POST /api/admin/ai-prompts/{id}/activate` — 활성화 (다른 프롬프트 자동 비활성화)
- `POST /api/admin/ai-prompts/{id}/test` — 샘플 Lead로 LLM 응답 테스트

### 4.F.3 일괄 재분석 — `POST /api/admin/leads/rescore` (ADMIN)

**Request**
```json
{ "eventCode": "devops-day-2026", "aiStatus": "FAILED" }
```

- `eventCode` (선택): 특정 행사만 대상. 미지정 시 전 행사
- `aiStatus` (선택): 특정 상태만 (`PENDING`/`FAILED`). 미지정 시 PENDING + FAILED 모두

**Response**
```json
{ "queued": 27 }
```

- 큐잉된 건수 반환. 처리는 비동기(`@Async` + `@Retryable`).
- 처리 결과는 `LeadScore.ai_status` 폴링 또는 `/api/admin/leads/pending-scores`로 추적.

---

## 4.E 행사 생성 흐름 (어드민 시나리오)

1. `POST /api/admin/events` — 행사 생성 (eventCode, label, date)
   → 자동으로 시스템 기본 `FormTemplate` 연결
   → QR 이미지 lazy 생성 (`/event/{eventCode}/qr.png` 첫 호출 시)
2. `POST /api/admin/forms/clone` — 기본 템플릿 복사 (선택)
3. `PUT /api/admin/forms/{newId}` — 라벨/문구/분기 커스텀
4. `PUT /api/admin/events/{eventId}/form` — 행사에 커스텀 폼 연결
5. `POST /api/admin/events/{eventId}/prizes` — 등수별 경품 등록
6. 부스에서 `/event/{eventCode}/qr` 풀스크린 페이지 띄움
7. 방문자가 QR 스캔 → `/survey/{eventCode}` 진입 → 설문 제출 → `/survey/{eventCode}/complete`

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
- 만료 시점에 어드민이 일괄 파기 또는 자동 배치(Phase 9 확장)로 hard delete
- 익명화가 아닌 **물리 삭제** (개인정보 원본은 남기지 않음)
- `DrawHistory`는 집계용으로 보존 → 파기 시 `lead_id`를 NULL로 set, `prize_id`/`event_id`/`awarded_rank`/`drawn_at`만 유지
- **NULL 충돌 없음 보장**: Postgres는 UNIQUE(lead_id, event_id)에서 NULL을 distinct로 취급 → 같은 event에 여러 NULL row 가능. 운영 통계 무결성 OK
- `LeadScore`는 `ON DELETE CASCADE`로 Lead와 함께 제거

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
> - **활용 채널**: 이메일, 유선 연락
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
│   ├── WebConfig.java
│   └── BootstrapAdminRunner.java       # 최초 어드민 시드 (Ollama는 spring-ai-starter가 자동 구성)
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
│   ├── AiController.java                 # /api/ai/lead-score, /api/admin/leads/{id}/score (override)
│   ├── LeadScoringPipeline.java          # 룰 선적용 → LLM 폴백 오케스트레이션
│   ├── LeadScoreService.java
│   ├── LeadScore.java
│   ├── enums/                            # NextAction, Grade, AiStatus, ScoreSource
│   ├── rules/
│   │   ├── AiRule.java
│   │   ├── AiRuleRepository.java
│   │   ├── AiRuleEvaluator.java          # JSONB condition 평가기 (eq/in/contains/AND/OR)
│   │   └── AdminRuleController.java      # /api/admin/ai-rules
│   ├── prompt/
│   │   ├── AiPromptTemplate.java
│   │   ├── AiPromptService.java          # 변수 치환
│   │   └── AdminPromptController.java    # /api/admin/ai-prompts
│   ├── retry/
│   │   ├── ScoringRetryScheduler.java    # 30s/5m/30m 백오프
│   │   └── PendingMonitorJob.java        # 1h+ PENDING 어드민 알림
│   ├── FollowUpMessageService.java       # 확장
│   └── config/ChatClientConfig.java       # Spring AI ChatClient.Builder + 기본 옵션 + Advisors
├── admin/
│   ├── AdminEventController.java
│   ├── AdminPrizeController.java
│   ├── AdminUserController.java
│   ├── AdminLeadController.java
│   ├── AdminFormController.java          # 폼 빌더 API
│   └── dashboard/
│       ├── DashboardController.java
│       └── LeadAnalyticsService.java
├── form/
│   ├── FormTemplate.java
│   ├── FormTemplateRepository.java
│   ├── FormTemplateService.java
│   ├── schema/                            # SchemaNode, FieldDef, PageDef, BranchingRule
│   └── validation/SchemaValidator.java
├── page/                                  # SSR 페이지 컨트롤러
│   ├── SurveyPageController.java          # /survey/{eventCode}, /complete, /closed
│   ├── QrPageController.java              # /event/{eventCode}/qr, qr.png
│   └── admin/
│       ├── AdminHomePageController.java       # /admin
│       ├── AdminEventPageController.java      # /admin/events, /{id}, /{id}/qr
│       ├── AdminPrizePageController.java      # /admin/events/{id}/prizes
│       ├── AdminFormBuilderPageController.java # /admin/forms, /edit, /preview
│       ├── AdminUserPageController.java       # /admin/users
│       ├── AdminLeadPageController.java       # /admin/leads, /{id} (등급 수동 수정 폼 포함)
│       ├── AdminAiRulePageController.java     # /admin/ai-rules
│       ├── AdminAiPromptPageController.java   # /admin/ai-prompts
│       └── AdminDashboardPageController.java  # /admin/dashboard
├── qr/
│   └── QrCodeService.java                 # ZXing 래퍼
├── csv/
│   ├── CsvExporter.java                   # UTF-8 BOM, RFC 4180, 한국어 라벨
│   ├── LeadCsvWriter.java
│   └── DashboardCsvWriter.java
└── common/
    ├── ApiException.java
    └── GlobalExceptionHandler.java
```

**Flyway 마이그레이션 (`src/main/resources/db/migration/`)**

| 버전 | 내용 |
| --- | --- |
| `V1__init.sql` | 11개 테이블 + 인덱스 (app_user, form_template, event, prize, lead, draw_history, lead_score, ai_rule, ai_prompt_template, email_rejection_log, audit_log) |
| `V2__fullname_order.sql` | `lead.full_name` generated column 순서를 `last_name \|\| first_name` 으로 재정의 + 검색 인덱스 재생성 |

**Thymeleaf 템플릿 위치**

```
src/main/resources/templates/
├── survey/
│   ├── form.html              # 동적 schema 렌더링
│   ├── complete.html
│   └── closed.html
├── event/
│   └── qr-display.html        # 부스 풀스크린 QR 페이지
├── admin/
│   ├── layout.html
│   ├── home.html
│   ├── events/
│   │   ├── list.html
│   │   ├── detail.html
│   │   ├── prizes.html        # 재고 관리
│   │   └── qr.html
│   ├── forms/
│   │   ├── list.html
│   │   ├── edit.html          # JSON editor + 미리보기
│   │   └── preview.html
│   ├── users/list.html
│   ├── leads/
│   │   ├── list.html          # 필터 + CSV 다운로드 버튼
│   │   └── detail.html        # 설문 응답 + AI 등급 수동 수정 폼
│   ├── ai/
│   │   ├── rules.html         # 룰 목록/편집/시뮬레이션
│   │   └── prompts.html       # 프롬프트 편집/테스트
│   └── dashboard.html
└── fragments/
    ├── field/                 # 필드 타입별 partial (text, select, radio, ...)
    └── consent.html
```

---

## 7. 개발 단계 (해커톤 타임라인)

> Spring AI 도입으로 JSON 파싱/HTTP 클라이언트 코드 사라져 약 0.5h 절감. **약 20~24h** (2.5~3일 분량). 해커톤 시연만 기준이면 룰/프롬프트 편집 UI는 Phase 9로 미루고 시드 룰 하드코딩으로 시작 가능.

### Phase 0 — 인프라 셋업 (1h)
- **Spring Boot 3.4 (LTS)** 프로젝트 생성, Gradle Kotlin DSL
- 의존성: `web` + `thymeleaf` + `data-jpa` + `security` + `validation` + `flyway-postgresql` + **`spring-ai-starter-model-ollama`**
- `docker-compose.yml` 작성 (Postgres + Ollama + 앱)
- Flyway 초기 마이그레이션, 공통 예외 핸들러, Springdoc OpenAPI
- Ollama 컨테이너에 `qwen2.5:1.5b` pull (`spring.ai.ollama.init.pull-model-strategy=when_missing`로 앱이 자동 처리도 가능)

### Phase 1 — 인증 (1.5h)
- `AppUser` + BCrypt, Spring Security 6.4 + JWT (jjwt 0.12)
- `POST /api/auth/login`, `BootstrapAdminRunner`

### Phase 2 — 설문 도메인 (3h)
- 모든 enum + `Lead` 엔티티 + `survey_payload` JSONB
- `POST /api/leads` + 모든 validator
- 단위 테스트

### Phase 3 — 폼 템플릿 + SSR 페이지 (3h)
- `FormTemplate` 엔티티 + 시스템 기본 템플릿 시드 (와탭 폼을 JSON으로)
- `SchemaValidator`
- Thymeleaf 설문 폼 페이지 (`/survey/{eventCode}`) — 동적 schema 렌더링, HTMX 분기
- Thank you / closed 페이지
- 필드 타입별 fragment (text/select/radio/checkbox_multi/scale_1_10)

### Phase 4 — QR + 풀스크린 페이지 (1h)
- ZXing 의존성, `QrCodeService`
- `/event/{eventCode}/qr.png` PNG
- `/event/{eventCode}/qr` 풀스크린 페이지

### Phase 5 — 추첨 + 재고 (2h)
- `Event`, `Prize`, `DrawHistory`
- 트랜잭션/비관적 락, 사전 랜덤 풀
- `/api/leads/search`, `/api/draw`, `/api/prizes`, `/api/draw/history`
- 동시성 테스트

### Phase 6 — 어드민 핵심 + 폼 빌더 + CSV (4h)
- `/api/admin/events`, `/api/admin/prizes`, `/api/admin/users`, `/api/admin/leads`
- `/api/admin/forms/clone|PUT|DELETE`, `/admin/forms` SSR 페이지 (JSON 직편집 MVP)
- `/api/admin/leads/expired` 만료 파기
- `CsvExporter` + 리드 CSV (`/api/admin/leads/export.csv`) + 대시보드 CSV 5종
- UTF-8 BOM, RFC 4180, 한국어 라벨 매핑 테이블
- `StreamingResponseBody` + JPA `FETCH_SIZE`

### Phase 7 — 대시보드 (3h)
- `LeadAnalyticsService` + §4.B 7개 엔드포인트
- JSONB 집계 SQL, `@Cacheable` 60초

### Phase 8 — AI 리드 등급 (2.5h, Spring AI 도입으로 단축)
- `ChatClientConfig`: `ChatClient.Builder` + `OllamaOptions` + `SimpleLoggerAdvisor`
- `LeadScoreResult` record + Spring AI 구조화 출력 (BeanOutputConverter 자동)
- `AiRuleEvaluator` JSONB condition 평가
- `LeadScoringPipeline` (룰 선적용 → `ChatClient.entity()` 폴백)
- `@Async` + `@Retryable(maxAttempts=3, backoff=@Backoff(delay=30000, multiplier=10))` (spring-retry 의존성 필요)
- 시드 룰 10개 + 시드 프롬프트 1개 Flyway 마이그레이션
- `PATCH /api/admin/leads/{id}/score` 수동 수정
- `/api/admin/ai-rules`, `/api/admin/ai-prompts` CRUD + SSR 페이지
- `PendingMonitorJob` (PENDING 1h+ 카운트)

### Phase 9 — 통합 & 데모 (2h 데모 + 잉여)
- Phase 0~8 합계 ≈ 21h, **버퍼 + 데모 리허설 2~3h 확보 → 총 23~24h**
- 데모 시나리오: 어드민 행사 생성 → 폼 커스텀 → 경품 세팅(`/admin/events/{id}/prizes`) → QR 풀스크린 → 모바일 QR 스캔 → 설문 → (운영자가 부스에서 이름+휴대폰 뒷자리로) 검색 → 뽑기 → 어드민에서 AI 등급/대시보드/CSV 확인
- 여유 시: 폼 시각화 빌더, follow-up message, XLSX export, 자동 파기 배치, 동의 철회 셀프 API

---

## 8. 테스트 전략

| 레벨 | 대상 | 방법 |
| --- | --- | --- |
| 단위 | 이메일 검증 (`jobFunction` 분기), 휴대폰 정규화, 추첨 분포, JWT 발급/검증, schema 검증기 | JUnit |
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

spring.ai:
  model:
    embedding: none                          # 사용하지 않는 임베딩 모델 자동 pull 차단
  ollama:
    base-url: ${OLLAMA_BASE_URL:http://localhost:11434}
    init:
      pull-model-strategy: when_missing      # 앱 기동 시 모델 자동 pull
      timeout: 5m
    chat:
      options:
        model: ${OLLAMA_MODEL:qwen2.5:1.5b}  # ~1GB, CPU 1~3초
        temperature: 0.0                     # 결정성 우선
        num-ctx: 2048
        num-predict: 200
        top-p: 0.9

# 재시도는 yml 키가 아닌 @Retryable로 (§4.6.9 코드 참고)
# @Retryable(maxAttempts=3, backoff=@Backoff(delay=30000, multiplier=10))
# → 30s → 5m → 50m

security:
  jwt:
    secret: ${JWT_SECRET}            # 최소 32바이트. 미설정 시 앱 시작 거부 (BootstrapAdminRunner와 동일 가드)
    expiration-hours: 8
  rate-limit:
    login-attempts-per-15min: 5      # 초과 시 IP 잠금
    lead-submit-per-min-per-ip: 10
  cors:
    allowed-origins:                 # 운영자/어드민 SPA가 별도 도메인일 때
      - http://localhost:5173
      - https://picker-operator.whatap.io

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
    environment:
      OLLAMA_NUM_PARALLEL: "1"          # 동시 요청 1개 (CPU 보호)
      OLLAMA_MAX_LOADED_MODELS: "1"     # 모델 1개만 메모리 유지
      OLLAMA_KEEP_ALIVE: "10m"          # 10분 미사용 시 모델 unload
      OLLAMA_HOST: "0.0.0.0:11434"
    deploy:
      resources:
        limits:
          cpus: "2.0"                   # CPU 2코어 상한
          memory: 3G                    # 1.5B 모델 + 컨텍스트 여유 포함
    # 최초 기동 후: docker exec -it <ollama> ollama pull qwen2.5:1.5b

  app:
    build: .
    depends_on:
      postgres: { condition: service_healthy }
      ollama:   { condition: service_started }
    environment:
      DB_HOST: postgres
      OLLAMA_BASE_URL: http://ollama:11434
      OLLAMA_MODEL: qwen2.5:1.5b
      JWT_SECRET: ${JWT_SECRET}
      BOOTSTRAP_ADMIN_USERNAME: admin
      BOOTSTRAP_ADMIN_PASSWORD: ${BOOTSTRAP_ADMIN_PASSWORD}
      APP_PUBLIC_BASE_URL: ${APP_PUBLIC_BASE_URL:-http://localhost:8181}
    ports: ["8181:8080"]   # 호스트 8080 점유 회피 (httpd 등)

volumes:
  postgres_data:
  ollama_data:
```

### 9.3 기동 절차

```bash
export JWT_SECRET=$(openssl rand -base64 32)
export BOOTSTRAP_ADMIN_PASSWORD=ChangeMe!2026

docker compose up -d postgres ollama
docker exec -it $(docker compose ps -q ollama) ollama pull qwen2.5:1.5b  # ~1GB 다운로드
docker compose up -d app

# 헬스체크
curl http://localhost:8181/actuator/health   # → {"status":"UP"}
```

### 9.4 `Dockerfile`

Gradle wrapper 미사용 — 빌드 시점에 `gradle:8.14-jdk21` 이미지로 컴파일 후 `eclipse-temurin:21-jre`에 jar만 복사하는 멀티 스테이지.

```dockerfile
FROM gradle:8.14-jdk21 AS build
WORKDIR /workspace
COPY settings.gradle.kts build.gradle.kts ./
COPY src ./src
RUN gradle --no-daemon bootJar -x test

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
```

### 9.5 접근 URL

| 경로 | 용도 |
| --- | --- |
| `http://localhost:8181/admin` | 어드민 SSR (JWT 토큰을 `localStorage.jwt` 에 저장 후 접근) |
| `http://localhost:8181/survey/{eventCode}` | 방문자용 설문 폼 |
| `http://localhost:8181/event/{eventCode}/qr` | 부스 풀스크린 QR 페이지 |
| `http://localhost:8181/event/{eventCode}/qr.png` | QR 이미지 (1024×1024 PNG, 24h cache) |
| `http://localhost:8181/swagger-ui.html` | OpenAPI 자동 문서 |
| `http://localhost:8181/actuator/health` | 헬스체크 |

---

## 10. 남은 결정사항 (해커톤 전 확정 필요)

확정된 것은 ✅로 표시.

- ✅ DB: PostgreSQL 16 (Docker)
- ✅ 재고 정책: 전부 유한, 어드민 설정, 소진 시 꽝
- ✅ 이메일 정책: 직무 기반 분기 (STUDENT_FREELANCER만 개인 메일 허용)
- ✅ AI: Ollama (Docker, **CPU only, GPU 불요**), 모델 **`qwen2.5:1.5b`** (≈1GB, 메모리 3GB / CPU 2코어 상한)
- ✅ 부스 운영(검색/추첨/재고)은 비인증 공개, 어드민만 로그인, 초기 어드민 자동 시드
- ✅ JWT 만료: 8시간
- ✅ 데이터 보존: 24개월, hard delete + 어드민 일괄 파기 API
- ✅ 차단 도메인 11개 (§5.3)
- ✅ 풀 대시보드 7개 API (§4.B)
- ✅ 설문 폼: 와탭 실제 설문 8페이지 분기 폼 반영
- ✅ SSR: Thymeleaf로 설문/QR/폼 빌더 직접 렌더링
- ✅ QR: ZXing PNG + 부스 풀스크린 페이지
- ✅ 폼 빌더: FormTemplate JSONB schema, 행사별 복사·커스텀
- ✅ 데이터 CSV 다운로드: 리드 + 대시보드 5종, UTF-8 BOM, 한국어 라벨, 스트리밍
- ✅ Lead-Event 모델: 1 행사 1 row, UNIQUE(phone, event_id)
- ✅ 폼 schema 스냅샷: 첫 제출 시 잠금, `form_locked` 플래그
- ✅ DrawHistory 익명화: `lead_id` NULL set, 통계 보존 (Postgres NULL distinct)
- ✅ 보안: BCrypt + JWT + 5회 실패 IP 15분 잠금 + 설문 IP rate-limit 10/min
- ✅ CORS: `security.cors.allowed-origins` 설정으로 운영자 SPA 허용
- ✅ EmailRejectionLog: 검증 실패 시도 추적, validEmailRatio 분모용
- ✅ LeadScore 트리거: 설문 제출 직후 비동기 자동 호출, 어드민 재시도 가능
- ✅ AI 등급: 룰 선적용 + LLM 폴백, NextAction enum, 0~100 점수
- ✅ 재시도: 30초 / 5분 / 30분 백오프 3회
- ✅ 마케터 편집: AiRule/AiPromptTemplate 어드민 SSR + API
- ✅ 모델 버전 추적: Ollama digest를 model_version 저장
- ✅ 수동 등급 수정: `PATCH /api/admin/leads/{id}/score`, MANUAL_OVERRIDE 상태
- ✅ PENDING 모니터링: 1h+ PENDING 카운트, 일괄 재분석 API
- ✅ Ollama 최소 리소스: CPU 2코어 + 메모리 3GB 상한, `OLLAMA_NUM_PARALLEL=1`, `MAX_LOADED_MODELS=1`, `KEEP_ALIVE=10m`
- ✅ 룰 시드 10개로 강화: 결정적 룰 8개 + LLM 힌트 2개 → 약 80~85% Lead가 LLM 호출 없이 분류
- ✅ Spring Boot 3.4 (LTS) + Spring AI 1.x: `ChatClient` + `BeanOutputConverter` 구조화 출력, Advisors, Micrometer 자동 통합
- ✅ Java 21, Spring Security 6.4, Hibernate 6.6 (SB3.4 기본)
- [ ] 자동 파기 배치 — 어드민 수동 버튼만으로 갈지, `@Scheduled` 잡 추가할지
- [ ] 동의 철회 API — `event@whatap.io` 수신 수동 처리만 vs `POST /api/leads/{id}/withdraw`
- [ ] 폼 빌더 UI 수준 — JSON 직편집 MVP 충분한지 vs 시각화 빌더까지 가야 하는지
- [ ] QR 호스트 도메인 — 사내 호스팅 vs Cloudflare Tunnel vs ngrok

---

## 11. 발표용 백엔드 어필 포인트

1. **Docker Compose 한 방으로 전체 스택(앱 + Postgres + Ollama LLM) 기동** — 외부 API 의존 없는 자기완결형 솔루션
2. **GPU 없이 CPU만으로 돌아가는 로컬 LLM** — Ollama + `qwen2.5:1.5b`(≈1GB), 메모리 3GB / CPU 2코어로 노트북에서도 시연. 데이터 외부 유출 없음
3. **동시성 안전 추첨**: UNIQUE 제약 + 비관적 락으로 더블 추첨/음수 재고 차단
4. **직무 기반 동적 검증**: STUDENT_FREELANCER만 개인 메일 허용, 나머지 14종 직무는 회사 메일 강제
5. **현장 친화 접근 제어**: 부스 운영자는 별도 로그인 없이 검색/추첨 즉시 가능, 어드민(세팅·대시보드·CSV)만 로그인 (기획서 §4 운영자 흐름 반영)
6. **JSONB 활용 풀 대시보드**: 8페이지 분기 설문 응답을 단일 컬럼에 보관, GIN 인덱스로 모니터링 제품·만족도 즉시 집계
7. **법적 안전장치 내장**: 2년 자동 보존 + 만료 파기 API + 동의 시각 서버 기록
8. **데이터 기반 폼 빌더**: 행사마다 폼을 JSONB로 정의·복사·커스텀 — 다음 행사에서 바로 재사용 가능
9. **풀스크린 QR 페이지**: 부스 모니터에 띄울 수 있는 SSR 페이지 자동 생성, 1024×1024 PNG 캐시
10. **즉시 분석 가능한 CSV**: 47컬럼 리드 export + 대시보드 5종 CSV — Excel에서 한글 안 깨지고 바로 피벗 가능
11. **무중단 폼 변경**: 행사 첫 제출 시점에 schema snapshot으로 잠금 → 진행 중 행사가 폼 수정에 영향받지 않음
12. **보안 기본기**: BCrypt, JWT, IP 기반 brute force 잠금, 공개 엔드포인트 rate limit, 검증 실패 시도 로깅
13. **하이브리드 AI 등급**: 시드 룰 8개로 약 80~85% Lead를 LLM 호출 없이 즉시 분류, 나머지 borderline만 LLM 평가 — CPU 환경에서도 처리량 확보
14. **마케터 셀프 서비스 AI**: 룰/프롬프트를 코드 배포 없이 어드민 UI에서 편집, 시뮬레이션으로 검증, 일괄 재분석 가능
15. **Spring AI 1.x 활용**: `ChatClient.entity(Record.class)`로 JSON 파싱 코드 제거, `PromptTemplate` 변수 치환, Advisors로 로깅, Micrometer 메트릭 자동 통합 — Spring Boot 3.4 + Spring AI 1.x 표준 패턴

---

*이 계획서는 v11 (로컬 E2E 검증 결과 코드 현실 반영: Spring Boot 4 → 3.4 LTS, hypersistence 제거, V2 fullname 순서 마이그레이션, embedding 자동 pull 차단, 호스트 포트 8181, Dockerfile gradle 이미지) 입니다.*
