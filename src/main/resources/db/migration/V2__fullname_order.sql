-- 한국 이름 관행에 맞춰 full_name 을 (성 + 이름) 순서로 재정의
DROP INDEX IF EXISTS lead_event_name_phone_idx;
ALTER TABLE lead DROP COLUMN full_name;
ALTER TABLE lead ADD COLUMN full_name VARCHAR(80) GENERATED ALWAYS AS (last_name || first_name) STORED;
CREATE INDEX lead_event_name_phone_idx ON lead(event_id, full_name, phone_last4);
