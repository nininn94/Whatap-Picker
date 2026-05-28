-- V6 에서 lead_score.grade 컬럼을 varchar(20) 로 확장하고 기존 행의 값을
-- A/B → MQL, C → KNOWN_LEAD 로 마이그레이션했지만, V1 의 CHECK 제약
-- (grade IN ('A','B','C')) 을 갱신하지 않아 새 값 insert/update 가 거부됨.
-- 제약을 새 enum 값에 맞게 교체.

-- 제약 이름은 V1 의 inline CHECK 라 Postgres 가 자동 부여한 이름 (lead_score_grade_check)
ALTER TABLE lead_score DROP CONSTRAINT IF EXISTS lead_score_grade_check;
ALTER TABLE lead_score
    ADD CONSTRAINT lead_score_grade_check
    CHECK (grade IS NULL OR grade IN ('MQL', 'KNOWN_LEAD'));
