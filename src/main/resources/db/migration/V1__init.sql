-- WhaTap Picker 초기 스키마 (plan v8 §3)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- AppUser
-- ============================================================
CREATE TABLE app_user (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(50) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN','OPERATOR')),
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES app_user(id)
);

-- ============================================================
-- FormTemplate
-- ============================================================
CREATE TABLE form_template (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               VARCHAR(120) NOT NULL,
    is_system_default  BOOLEAN NOT NULL DEFAULT FALSE,
    schema             JSONB NOT NULL,
    version            INT NOT NULL DEFAULT 0,
    cloned_from_id     UUID REFERENCES form_template(id),
    created_by         UUID REFERENCES app_user(id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX form_template_one_system_default
    ON form_template(is_system_default) WHERE is_system_default = TRUE;

-- ============================================================
-- Event
-- ============================================================
CREATE TABLE event (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_code            VARCHAR(80) NOT NULL UNIQUE,
    event_date            DATE NOT NULL,
    end_date              DATE,
    label                 VARCHAR(200) NOT NULL,
    form_template_id      UUID REFERENCES form_template(id),
    form_schema_snapshot  JSONB,
    form_locked           BOOLEAN NOT NULL DEFAULT FALSE,
    qr_image_path         VARCHAR(255),
    status                VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                          CHECK (status IN ('DRAFT','OPEN','CLOSED','ARCHIVED')),
    created_by            UUID REFERENCES app_user(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX event_status_idx ON event(status);

-- ============================================================
-- Prize
-- ============================================================
CREATE TABLE prize (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    rank            SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 9),
    name            VARCHAR(120) NOT NULL,
    initial_qty     INT NOT NULL CHECK (initial_qty >= 0),
    remaining_qty   INT NOT NULL CHECK (remaining_qty >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(event_id, rank)
);

-- ============================================================
-- Lead (행사별 1행)
-- ============================================================
CREATE TABLE lead (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id                 UUID NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    first_name               VARCHAR(40) NOT NULL,
    last_name                VARCHAR(40) NOT NULL,
    full_name                VARCHAR(80) GENERATED ALWAYS AS (first_name || last_name) STORED,
    phone                    VARCHAR(11) NOT NULL,
    phone_last4              VARCHAR(4) GENERATED ALWAYS AS (right(phone, 4)) STORED,
    company                  VARCHAR(120),
    email                    VARCHAR(160) NOT NULL,
    email_domain             VARCHAR(120) NOT NULL,
    industry                 VARCHAR(40) NOT NULL,
    job_function             VARCHAR(40) NOT NULL,
    job_level                VARCHAR(40) NOT NULL,
    company_size             VARCHAR(40) NOT NULL,
    employee_count_range     VARCHAR(40) NOT NULL,
    monitoring_status        VARCHAR(40) NOT NULL,
    survey_payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
    adoption_blocker         VARCHAR(40),
    interest_products        JSONB NOT NULL DEFAULT '[]'::jsonb,
    plan_within_year         VARCHAR(40),
    consultation_preference  VARCHAR(40),
    wants_consultation       BOOLEAN NOT NULL DEFAULT FALSE,
    privacy_consent_at       TIMESTAMPTZ NOT NULL,
    marketing_consent_at     TIMESTAMPTZ NOT NULL,
    retention_until          DATE NOT NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(phone, event_id)
);

CREATE INDEX lead_event_name_phone_idx
    ON lead(event_id, full_name, phone_last4);
CREATE INDEX lead_event_industry_idx          ON lead(event_id, industry);
CREATE INDEX lead_event_monitoring_idx        ON lead(event_id, monitoring_status);
CREATE INDEX lead_event_plan_idx              ON lead(event_id, plan_within_year);
CREATE INDEX lead_retention_idx               ON lead(retention_until);
CREATE INDEX lead_survey_payload_gin          ON lead USING GIN (survey_payload jsonb_path_ops);

-- ============================================================
-- DrawHistory
-- ============================================================
CREATE TABLE draw_history (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id        UUID REFERENCES lead(id) ON DELETE SET NULL,
    event_id       UUID NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    prize_id       UUID REFERENCES prize(id) ON DELETE SET NULL,
    awarded_rank   SMALLINT,
    drawn_by       UUID REFERENCES app_user(id),
    drawn_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(lead_id, event_id)
);

-- ============================================================
-- LeadScore
-- ============================================================
CREATE TABLE lead_score (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id                  UUID NOT NULL UNIQUE REFERENCES lead(id) ON DELETE CASCADE,
    ai_status                VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                             CHECK (ai_status IN ('PENDING','DONE','FAILED','RULE_ONLY','MANUAL_OVERRIDE')),
    grade                    VARCHAR(1) CHECK (grade IN ('A','B','C')),
    score                    SMALLINT CHECK (score BETWEEN 0 AND 100),
    next_action              VARCHAR(40),
    reason                   TEXT,
    source                   VARCHAR(20) CHECK (source IN ('RULE','LLM','RULE_LLM_HYBRID','MANUAL')),
    rule_hits                JSONB NOT NULL DEFAULT '[]'::jsonb,
    model_name               VARCHAR(80),
    model_version            VARCHAR(80),
    attempt_count            INT NOT NULL DEFAULT 0,
    last_attempted_at        TIMESTAMPTZ,
    manually_overridden_by   UUID REFERENCES app_user(id),
    manually_overridden_at   TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lead_score_status_idx ON lead_score(ai_status, last_attempted_at);
CREATE INDEX lead_score_grade_idx  ON lead_score(grade, score);

-- ============================================================
-- AiRule
-- ============================================================
CREATE TABLE ai_rule (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(80) NOT NULL UNIQUE,
    name        VARCHAR(200) NOT NULL,
    priority    INT NOT NULL DEFAULT 100,
    condition   JSONB NOT NULL,
    outcome     JSONB NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by  UUID REFERENCES app_user(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_rule_active_priority_idx ON ai_rule(enabled, priority);

-- ============================================================
-- AiPromptTemplate
-- ============================================================
CREATE TABLE ai_prompt_template (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(120) NOT NULL UNIQUE,
    body        TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT FALSE,
    version     INT NOT NULL DEFAULT 0,
    updated_by  UUID REFERENCES app_user(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ai_prompt_one_active
    ON ai_prompt_template(is_active) WHERE is_active = TRUE;

-- ============================================================
-- EmailRejectionLog (validEmailRatio 분모)
-- ============================================================
CREATE TABLE email_rejection_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id          UUID REFERENCES event(id) ON DELETE SET NULL,
    attempted_email_hash  VARCHAR(64),
    reason            VARCHAR(40) NOT NULL,
    job_function      VARCHAR(40),
    ip_hash           VARCHAR(64),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_rejection_log_event_idx ON email_rejection_log(event_id, created_at);

-- ============================================================
-- AuditLog (인증/CSV/등급 수정 추적)
-- ============================================================
CREATE TABLE audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID REFERENCES app_user(id) ON DELETE SET NULL,
    username    VARCHAR(50),
    action      VARCHAR(60) NOT NULL,
    target      VARCHAR(120),
    metadata    JSONB,
    ip_hash     VARCHAR(64),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_action_idx ON audit_log(action, created_at);
