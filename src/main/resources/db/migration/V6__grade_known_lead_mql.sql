-- Lifecycle Stage 를 2 단계로 단순화: A/B → MQL, C → KNOWN_LEAD
ALTER TABLE lead_score
    ALTER COLUMN grade TYPE varchar(20);

UPDATE lead_score SET grade = 'MQL'        WHERE grade IN ('A', 'B');
UPDATE lead_score SET grade = 'KNOWN_LEAD' WHERE grade = 'C';
