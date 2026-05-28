# WhaTap Picker — 서버 아키텍처

> 본 문서는 코드 기반 서버 구조 개요입니다. 구현 세부는 [`API.md`](./API.md) 와 소스 트리를 참조.

---

## 1. 한눈에

```
                ┌────────────────────────────────────────────────────────────┐
                │  Browser (운영자/방문자/뽑기판)                                  │
                └──────────┬───────────────────────────┬──────────────────────┘
                           │ HTTPS/HTTP                 │ HTTPS rewrite (선택)
                           ▼                           ▼
            ┌────────────────────────┐    ┌─────────────────────────────┐
            │  Spring Boot (EC2)     │    │  Vercel (Next.js, 뽑기판 등)  │
            │  Thymeleaf SSR + REST  │    │  /api/* → 백엔드 proxy        │
            └────────────────────────┘    └─────────────────────────────┘
                         │
       ┌─────────────────┼────────────────────────────┐
       ▼                 ▼                            ▼
   PostgreSQL       Ollama (CPU)                Anthropic (옵션)
   (Docker)         qwen2.5:1.5b                 claude-haiku-4-5
                    └── 폴백 시 비활성 → Anthropic ───┘

                                  ▼
                        Google Sheets (옵션)
                        Service Account append
```

---

## 2. 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| 런타임 | Java 21, Spring Boot 3.4.0 (LTS) |
| Web | Spring MVC, Thymeleaf SSR (어드민/설문/QR), REST API |
| 인증 | Spring Security 6.4, JWT (jjwt 0.12), HttpOnly 쿠키 + Bearer 헤더 dual |
| ORM | Spring Data JPA (Hibernate 6.6) |
| DB | PostgreSQL 16, Flyway 10 |
| AI | Spring AI 1.0.2 (Ollama), JDK HttpClient (Anthropic) |
| Sheets | google-api-services-sheets v4, google-auth-library-oauth2-http |
| 빌드 | Gradle 8.14 (Kotlin DSL), Docker 멀티 스테이지 |
| 배포 | GitHub Actions → GHCR → EC2 Docker Compose |

---

## 3. 소스 구조

```
src/main/java/io/whatap/picker
├── PickerApplication.java        # @SpringBootApplication, @EnableAsync, CommandLineRunner 시드
├── admin
│   ├── AdminEventController.java
│   ├── AdminLeadController.java
│   ├── AdminFormController.java
│   ├── AdminPrizeController.java
│   ├── AdminUserController.java
│   ├── AdminWinnerController.java
│   ├── AdminSettingController.java
│   ├── dto/                     # 어드민 전용 Request/Response record
│   └── dashboard/
│       ├── DashboardController.java        # 7개 GET + POST /insights
│       ├── DashboardCsvController.java     # 5개 CSV export
│       ├── LeadAnalyticsService.java       # 집계 핵심 (timeline/segments/intent/...)
│       └── MarketingInsightService.java    # LLM 으로 자연어 인사이트
├── ai
│   ├── AiController.java                  # 스코어링/재분석/override
│   ├── LeadScoringPipeline.java           # @EventListener+@Async, RuleEngine→LLM 순
│   ├── LeadScore.java / LeadScoreResult.java
│   ├── enums/ {Grade, NextAction, AiStatus, ScoreSource}
│   ├── rules/RuleEngine.java              # MQL/KNOWN_LEAD 2단계 deterministic
│   └── client/ {LlmGateway, AnthropicClient}        # Ollama 는 Spring AI starter 가 ChatClient 빈으로 자동 노출
├── auth
│   ├── AuthController.java                # /api/auth/login,logout
│   ├── AppUser.java + Repository, Role enum
│   └── jwt/ {JwtTokenProvider, JwtAuthenticationFilter, JwtProperties}
├── common
│   ├── ApiException.java, ErrorCode.java, GlobalExceptionHandler
│   ├── ClientIp.java, rate/RateLimiter.java
├── config/
│   ├── SecurityConfig.java                # csrf disabled, JWT filter, route 권한
│   └── ...
├── csv/CsvWriter.java                     # RFC 4180, UTF-8 BOM
├── draw/
│   ├── DrawController.java, DrawService.java
│   ├── DrawHistory.java + Repository
├── event/
│   ├── Event.java (+spreadsheetId/sheetName/sheetsEnabled), EventController.java
│   └── EventRepository, EventStatus enum
├── form/
│   ├── FormTemplate.java + Repository, FormTemplateService.java
│   └── FormTemplateSeeder.java            # 부팅 시 system_default 시드
├── lead/
│   ├── LeadController.java, LeadService.java, LeadSearchService.java
│   ├── Lead.java + Repository, LeadSpecifications.java (필터)
│   ├── dto/ {LeadSubmitRequest, LeadSubmitResponse, LeadSearchResponse}
│   ├── enums/ {Industry, JobFunction, ..., InterestProduct}
│   ├── event/LeadSubmittedEvent.java      # 발행: 스코어링·Sheets 연동 트리거
│   └── payload/SurveyPayload.java         # 분기 응답 nested record
├── page/
│   ├── QrPageController.java              # /event/{code}/qr, /qr.png
│   ├── SurveyPageController.java          # /survey/{code}, /complete, /closed
│   └── admin/AdminPageController.java     # /admin/** SSR
├── prize/
│   ├── Prize.java + Repository, PrizeController.java
├── setting/
│   ├── AppSetting.java + Repository, AppSettingService.java
└── sheets/
    ├── SheetsClient.java                  # Google API 호출 (인증 + append + ensureHeader)
    └── SheetsSyncService.java             # @EventListener+@Async
```

---

## 4. 요청 흐름

### 4.1 설문 제출 (`POST /api/leads`)

```
[Browser] ───▶ JwtFilter ───▶ LeadController.submit
                                      │
                                      ▼
                              LeadService.submit
                                ├── RateLimiter check
                                ├── Event lookup + OPEN 검증
                                ├── 이메일 도메인 정책
                                ├── 분기 surveyPayload 검증
                                ├── Lead upsert (phone+eventId unique)
                                └── ApplicationEventPublisher.publish(LeadSubmittedEvent)
                                              │
                            ┌─────────────────┼────────────────┐
                            ▼                                  ▼
                   LeadScoringPipeline                  SheetsSyncService
                   (@Async)                              (@Async)
                   ├── RuleEngine.evaluate               ├── isConfigured 체크
                   ├── 결정 종료 → DB save               ├── Event.sheetsEnabled 체크
                   └── 미결 → LlmGateway                 └── SheetsClient.appendRow
                       └── Ollama → Anthropic 폴백
```

### 4.2 추첨 (`POST /api/draw`)

```
DrawController.draw → DrawService
  ├── 행사 OPEN 검증
  ├── (leadId, eventId) 중복 추첨 검증 → ALREADY_DRAWN
  ├── Prize 잔량 트랜잭션 차감 (Pessimistic 또는 @Version)
  │     └── 모든 등수 0 이면 outOfStock=true 반환 (꽝)
  └── DrawHistory insert
```

### 4.3 AI 스코어링 (Lifecycle Stage 결정)

```
LeadScoringPipeline.score
  ├── 기존 LeadScore 조회 (MANUAL_OVERRIDE 면 그대로 반환)
  ├── status PENDING + attemptCount++ 저장
  ├── RuleEngine.evaluate (MQL/KNOWN_LEAD deterministic)
  │     ├── MQL  조건: consultationPreference=ONSITE_MEETING
  │     │           OR planWithinYear ∈ {C_REPLACE, D_NEW_ADOPT}
  │     └── 그 외: KNOWN_LEAD
  ├── 룰만으로 종료 (RULE_ONLY) — 현재는 항상 terminal
  └── (잔존 옵션) LlmGateway 호출 → MANUAL/AI 결정
```

현재 룰 엔진은 모든 케이스를 deterministic 으로 처리하므로 LLM 호출 0회. `MarketingInsightService` 만 LLM 사용.

---

## 5. 데이터 모델 핵심

```
event 1 ──< lead         (phone+event_id UNIQUE)
event 1 ──< prize        (event_id+rank UNIQUE)
lead  1 ─── lead_score   (lead_id UNIQUE, grade=MQL|KNOWN_LEAD)
lead  1 ──< draw_history (lead_id+event_id UNIQUE)
prize 1 ──< draw_history (prize_id nullable: 꽝)
form_template 1 ──< event (form_template_id, 첫 제출 시 form_schema_snapshot 잠금)
app_user 1 ──< * (created_by, updated_by)
app_setting (key PK, value TEXT, updated_by, updated_at)
email_rejection_log (집계용 익명 로그)
```

---

## 6. 설정 (런타임 변경 가능)

`app_setting` 테이블의 key-value 로 어드민 UI 에서 변경:

| key | 용도 |
| --- | --- |
| `anthropic.api_key` | Claude 폴백 API 키 |
| `anthropic.model` | 기본 `claude-haiku-4-5` |
| `anthropic.enabled` | true/false |
| `google.service_account_json` | Sheets 연동용 Service Account JSON 전체 |

GET 응답은 모두 마스킹/식별자만 노출. raw 값은 반환 안 함.

행사 단위 매핑은 `event` 테이블의 `spreadsheet_id` / `sheet_name` / `sheets_enabled` 컬럼.

---

## 7. 보안 요약

| 항목 | 처리 |
| --- | --- |
| JWT 서명 | HS256, `JWT_SECRET` env var (32 byte+) |
| JWT 전송 | HttpOnly 쿠키 + `Authorization: Bearer` 헤더 (둘 다 허용) |
| API 키 | DB 평문 저장, GET 응답에서 마스킹/숨김 (logs 에도 미노출) |
| 설정 endpoint | `@PreAuthorize("hasRole('ADMIN')")` 전체 |
| 설문 제출 rate-limit | Bucket4j, IP 당 분당 10회 (`security.rate-limit.lead-submit-per-min-per-ip`) |
| 로그인 rate-limit | Bucket4j, IP 당 15분에 5회 (`security.rate-limit.login-attempts-per-15min`), 성공 시 reset |
| 이메일 도메인 | 11종 개인 메일 차단 (학생/프리랜서 제외) |
| HTTPS | EC2 직접 접근 시 HTTP, 운영 배포 시 ALB/CloudFront/Caddy 권장 |

---

## 8. 비동기 처리

- `@EnableAsync` 활성 (`PickerApplication`)
- `LeadScoringPipeline.onLeadSubmitted`, `SheetsSyncService.onLeadSubmitted` 모두 `@EventListener + @Async`
- 본 제출 응답에는 영향 없음. 실패는 로그만 남기고 재시도(스코어링) 또는 무시(Sheets)

---

## 9. 배포

[`DEPLOYMENT.md`](./DEPLOYMENT.md) 참조.

핵심 흐름: `main` push → GHA → `gradle bootJar` → Docker buildx → GHCR push → EC2 SSH → `.env` 작성 → `docker compose pull && up -d`.
