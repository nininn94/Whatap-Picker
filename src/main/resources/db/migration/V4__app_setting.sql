-- 어드민이 런타임에 변경하는 key-value 설정.
-- ex) anthropic.api_key, anthropic.model, anthropic.enabled
CREATE TABLE app_setting (
    "key"        VARCHAR(120) PRIMARY KEY,
    "value"      TEXT,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by   UUID REFERENCES app_user(id) ON DELETE SET NULL
);
