# 백엔드 개발 계획서

> [`ai-hackathon-lead-draw-plan.md`](./ai-hackathon-lead-draw-plan.md) 기획서를 기반으로 작성한 Spring Boot 백엔드 개발 계획입니다.

## 1. 목표 및 범위

해커톤 MVP에서 다음을 책임지는 백엔드 서버를 구현합니다.

- 모바일 설문 데이터 수집 및 검증
- 운영자 화면용 참여자 조회
- 일자별 중복 참여 방지 + 일자별 재고 관리 기반 추첨 실행
- 추첨 결과 영속화 + 재고 차감 원자적 처리
- AI(OpenAI 또는 사내 AI)로 리드 등급 분류

**범위 외 (Out of Scope)**
- 운영자 로그인/인증 (단일 운영 화면 가정, 필요 시 단순 토큰 또는 IP 화이트리스트로 확장)
- 관리자 UI (재고/경품은 초기 설정 JSON 또는 SQL로 시드)
- 다국어, 결제, 푸시 알림

---

## 2. 기술 스택

| 영역 | 선택 | 비고 |
| --- | --- | --- |
| 언어/프레임워크 | Java 17 + Spring Boot 3.x | 팀 내 Java 보유 |
| 빌드 | Gradle | Wrapper 포함 |
| DB | H2 (file mode) | MVP 단순화. 안정성 필요 시 PostgreSQL로 교체 |
| ORM | Spring Data JPA | 마이그레이션은 `schema.sql` 또는 Flyway 최소 적용 |
| 검증 | Jakarta Bean Validation | `@NotBlank`, `@Pattern` 등 |
| AI 연동 | OpenAI Chat Completions API (또는 사내 AI) | WebClient 비동기 호출 |
| 직렬화 | Jackson | LocalDate/LocalDateTime ISO-8601 |
| 테스트 | JUnit 5 + Spring Boot Test + Testcontainers(선택) | 동시성 테스트 포함 |
| 문서화 | Springdoc OpenAPI (`/swagger-ui.html`) | 프론트엔드 협업용 |

---

## 3. 데이터 모델

```
Lead (설문 제출자)
├── id (PK, UUID)
├── name
├── phone (정규화된 11자리, UNIQUE)
├── phone_last4 (검색 가속용)
├── company
├── email (회사 메일만)
├── job_title
├── interest_product
├── consider_period (도입 검토 시기)
├── wants_consultation (boolean)
├── privacy_consent_at
├── marketing_consent_at
├── created_at
└── (1:N) DrawHistory

Event (행사 일자)
├── id (PK)
├── event_date (UNIQUE)
└── label

Prize (행사일자 × 등수 재고)
├── id (PK)
├── event_id (FK)
├── rank (1~5)
├── name (경품명)
├── initial_qty
├── remaining_qty
└── UNIQUE(event_id, rank)

DrawHistory (추첨 결과)
├── id (PK)
├── lead_id (FK)
├── event_id (FK)
├── prize_id (FK, nullable: 꽝 처리 시 NULL)
├── awarded_rank (nullable)
├── drawn_at
└── UNIQUE(lead_id, event_id)   ← 일자별 1회 제한

LeadScore (AI 분석 결과)
├── id (PK)
├── lead_id (FK, UNIQUE)
├── grade (A/B/C)
├── reason
├── next_action
└── created_at
```

**인덱스**
- `Lead(phone)` UNIQUE: 동일 휴대폰 재제출은 upsert(같은 사람으로 인정)
- `Lead(name, phone_last4)`: 운영자 검색 가속
- `DrawHistory(lead_id, event_id)` UNIQUE: 일자별 중복 참여 차단 (DB 레벨 보장)

---

## 4. API 명세

### 4.1 설문 제출 — `POST /api/leads`

**Request**
```json
{
  "name": "홍길동",
  "phone": "01012345678",
  "company": "와탭랩스",
  "email": "user@whatap.io",
  "jobTitle": "백엔드 개발자",
  "interestProduct": "APM",
  "considerPeriod": "3개월 이내",
  "wantsConsultation": true,
  "privacyConsent": true,
  "marketingConsent": true
}
```

**검증**
- `name`: 필수, 1~30자
- `phone`: `^010\d{8}$` (하이픈 자동 제거)
- `email`: 형식 + **개인 메일 도메인 차단** (`gmail.com`, `naver.com`, `daum.net`, `hanmail.net`, `kakao.com`, `nate.com`, `hotmail.com`, `outlook.com`, `yahoo.com` 등 → `application.yml`에서 관리)
- `privacyConsent`, `marketingConsent`: 둘 다 `true`여야 통과 (`@AssertTrue`)
- 동일 `phone` 재제출 시 → 기존 Lead 정보 업데이트(이름/회사 등 변경 가능성 인정)

**Response (200)**
```json
{ "leadId": "uuid", "createdAt": "2026-05-28T10:00:00" }
```

**Error**
- `400` 검증 실패 (필드별 에러 메시지)
- `409` 차단 도메인 / 동의 누락

### 4.2 참여자 검색 — `GET /api/leads/search?name={}&phoneLast4={}`

**검증**
- `name` 필수, `phoneLast4` 정확히 4자리 숫자

**Response (200)**
```json
{
  "results": [
    {
      "leadId": "uuid",
      "name": "홍길동",
      "company": "와탭랩스",
      "submitted": true,
      "drawnToday": false
    }
  ]
}
```
- 동명이인/뒷자리 중복 시 여러 건 반환 → 프론트에서 회사명으로 선택
- `submitted=false` (설문 미제출): 빈 결과로 반환하거나 별도 코드 처리. **MVP는 빈 결과**.
- `drawnToday`: 오늘 날짜 기준 `DrawHistory` 존재 여부

### 4.3 뽑기 실행 — `POST /api/draw`

**Request**
```json
{ "leadId": "uuid", "eventDate": "2026-05-28" }
```

**처리 (트랜잭션 + 비관적 락)**
1. `Lead` 존재 확인 → 없으면 `404`
2. `Event` 조회 (`event_date`로) → 없으면 `404`
3. `DrawHistory(lead_id, event_id)` 존재 확인 → 있으면 `409 ALREADY_DRAWN`
4. 해당 `event_id`의 `Prize` 전체를 `SELECT FOR UPDATE`로 락
5. **사전 랜덤 풀 방식** 추첨:
   - 등수별 잔여 수량 합 = N
   - 예상 참여자 수 vs N 비교해 꽝 슬롯도 풀에 포함시킬지는 정책 결정 (MVP는 **5등을 사실상 무제한 또는 큰 수**로 두어 꽝 없음)
   - `Random.nextInt(N)` 위치를 잡고 등수 누적 분포로 매핑
6. 선택된 `Prize`의 `remaining_qty -= 1`
7. `DrawHistory` insert (UNIQUE 제약이 동시성 최종 방어)
8. 커밋

**Response (200)**
```json
{
  "rank": 3,
  "prizeName": "스타벅스 1만원권",
  "drawnAt": "2026-05-28T10:05:12"
}
```

**Error**
- `404` Lead/Event 없음
- `409 ALREADY_DRAWN` 같은 날 중복 참여
- `409 OUT_OF_STOCK` 모든 등수 소진 (정책상 발생 시)

### 4.4 경품 현황 — `GET /api/prizes?eventDate=2026-05-28`

```json
{
  "eventDate": "2026-05-28",
  "prizes": [
    { "rank": 1, "name": "AirPods", "initial": 2, "awarded": 1, "remaining": 1 },
    ...
  ]
}
```

### 4.5 참여 이력 — `GET /api/draw/history?leadId={}&eventDate={}`

특정 참여자가 해당 일자 참여했는지 확인 (검색과 별개로 단건 조회용).

### 4.6 AI 리드 등급 — `POST /api/ai/lead-score`

**Request**: `{ "leadId": "uuid" }`

**처리**
- `Lead` 정보를 프롬프트로 구성 → OpenAI API 호출 (`gpt-4o-mini` 또는 사내 AI)
- JSON 응답 강제 (`response_format: json_object`)
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
- 입력 필드: 회사, 직무, 관심 제품, 도입 시기, 상담 희망 여부
- 등급 기준은 마케터가 정한 룰을 시스템 프롬프트로 주입
- 실패/타임아웃 시 `grade=null, reason="AI 분석 보류"` 폴백

---

## 5. 핵심 로직 상세

### 5.1 동시성 제어

같은 사람이 동시에 2번 요청 / 동일 등수가 동시 소진되는 케이스를 막아야 합니다.

| 위험 | 방어 |
| --- | --- |
| 같은 leadId+eventDate 동시 추첨 | `DrawHistory(lead_id, event_id)` UNIQUE + 잡힌 `DataIntegrityViolationException`을 `ALREADY_DRAWN`으로 변환 |
| 동일 등수 재고 음수 | 트랜잭션 내 `SELECT ... FOR UPDATE` 후 `remaining_qty` 검사 |
| 추첨 후 커밋 전 중복 호출 | UNIQUE 제약 (위 항목과 동일) |

### 5.2 입력값 정규화

- 휴대폰: 정규식 적용 전 `-`, 공백, `+82` 제거 후 `01012345678` 형태로 통일
- 이메일: lower-case
- 이름: trim, 양끝 공백 제거

### 5.3 차단 도메인 관리

```yaml
# application.yml
lead:
  blocked-email-domains:
    - gmail.com
    - naver.com
    - daum.net
    - hanmail.net
    - kakao.com
    - nate.com
    - hotmail.com
    - outlook.com
    - yahoo.com
```

→ `@ConfigurationProperties`로 바인딩 후 검증기에서 사용. 화요일 논의에서 프리랜서/학생 예외 룰 확정되면 옵션 필드 추가.

### 5.4 추첨 알고리즘 (사전 랜덤 풀)

```
prizes = [Prize{rank:1, remaining:2}, Prize{rank:2, remaining:5}, ...]
total = sum(remaining)
roll = random.nextInt(total)
누적합으로 prizes 순회하며 roll이 들어가는 칸 선택
```

5등을 "큰 수"로 두면 사실상 꽝 없는 이벤트가 됩니다. 화요일에 5등 재고 정책 확정 후 시드값 결정.

---

## 6. 디렉토리 구조 (제안)

```
src/main/java/io/whatap/picker/
├── PickerApplication.java
├── config/
│   ├── OpenAiConfig.java
│   └── WebConfig.java
├── lead/
│   ├── Lead.java
│   ├── LeadRepository.java
│   ├── LeadController.java
│   ├── LeadService.java
│   ├── dto/LeadSubmitRequest.java
│   └── validation/EmailDomainValidator.java
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
│   └── client/OpenAiClient.java
└── common/
    ├── ApiException.java
    └── GlobalExceptionHandler.java
```

---

## 7. 개발 단계 (해커톤 타임라인)

> 해커톤 1일 또는 2일 가정. 시간 박스에 맞춰 우선순위 엄수.

### Phase 0 — 셋업 (30분)
- Spring Boot 프로젝트 생성, H2 + JPA 연결
- 공통 예외 핸들러, OpenAPI 의존성 추가
- 시드 데이터 SQL 작성 (`Event` 1~2건, `Prize` 등수별 재고)

### Phase 1 — 핵심 CRUD (1.5시간)
- `Lead` 엔티티 + 제출 API + 검증 (`@Pattern`, `@AssertTrue`, 도메인 차단)
- `GET /api/leads/search` 구현

### Phase 2 — 추첨 (2시간)
- `Event`, `Prize`, `DrawHistory` 엔티티 + 트랜잭션/락
- 사전 랜덤 풀 알고리즘
- 동시성 단위 테스트 (`ExecutorService`로 동일 leadId 10건 동시 호출)
- `GET /api/prizes`, `GET /api/draw/history`

### Phase 3 — AI 연동 (1.5시간)
- OpenAI WebClient 구성 + API 키 환경변수
- 프롬프트 작성 (마케터 협의)
- 실패 폴백 처리

### Phase 4 — 통합 & 데모 (남는 시간)
- 프론트엔드와 CORS / 인터페이스 합치기
- 시연 시나리오 리허설 (QR → 설문 → 검색 → 뽑기 → AI 등급)
- Swagger 캡처 / README 정리

**전체 5~6시간 + 통합/디버깅 버퍼.**

---

## 8. 테스트 전략

| 레벨 | 대상 | 방법 |
| --- | --- | --- |
| 단위 | 이메일 도메인 차단, 휴대폰 정규화, 추첨 알고리즘 분포 | JUnit, 1000회 추첨 시 등수별 비율 확인 |
| 통합 | API 라운드트립, 검증 에러 응답 포맷 | `@SpringBootTest` + MockMvc |
| 동시성 | 동일 leadId+eventDate 100 동시 호출 → 1건만 성공 | `CountDownLatch` + `ExecutorService` |
| 시나리오 | 설문 제출 → 검색 → 추첨 → 재고 차감 검증 | End-to-end 테스트 1~2건 |

---

## 9. 환경설정

```yaml
# application.yml (요약)
spring:
  datasource:
    url: jdbc:h2:file:./data/picker;DB_CLOSE_DELAY=-1
  jpa:
    hibernate.ddl-auto: validate
    open-in-view: false
  sql.init.mode: always

openai:
  api-key: ${OPENAI_API_KEY}
  model: gpt-4o-mini

lead:
  blocked-email-domains: [gmail.com, naver.com, daum.net, ...]

draw:
  pool-strategy: pre-random   # 추후 probability 추가 가능
```

---

## 10. 화요일 미팅에서 확정해야 할 백엔드 결정사항

기획서 §12 체크리스트 중 백엔드 영향 항목만 정리.

- [ ] **저장소**: H2 file mode 확정 vs Google Sheets API 연동 필요 여부
- [ ] **운영자 인증**: 무인증 단일 화면 OK인지, 단순 토큰/IP 제한 필요한지
- [ ] **중복 기준**: `phone + eventDate` 확정 (이 계획서는 이 가정)
- [ ] **5등 재고**: 유한 수량 vs 사실상 무제한 (꽝 없음)
- [ ] **개인 메일 차단 목록 최종안** + 프리랜서/학생 예외 룰
- [ ] **AI**: OpenAI vs 사내 AI, 모델 및 비용 한도
- [ ] **데이터 보존/삭제**: 행사 종료 후 처리 정책 (개인정보)
- [ ] **다중 행사일** 시드 방법 (어드민 API vs SQL 시드)

---

## 11. 발표용 백엔드 어필 포인트

1. **AI 코딩 도구로 5~6시간 안에 풀스택 백엔드 + AI 분석까지 구현**
2. **동시성 안전 추첨**: UNIQUE 제약 + 비관적 락으로 더블 추첨/음수 재고 차단
3. **현장 운영 친화 검증**: 회사 메일 강제, 휴대폰 정규화, 일자별 1회 정책을 DB 제약으로 보장
4. **리드 데이터 → AI 등급 자동화**로 영업 후속 액션 시간 단축

---

*이 계획서는 화요일 개발 논의 전 초안입니다. 의사결정 결과에 따라 §3 데이터 모델과 §4 API 응답 코드가 조정될 수 있습니다.*
