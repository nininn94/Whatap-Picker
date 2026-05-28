-- 휴대폰 안내 문구 변경을 반영하기 위해 system_default form template 재시드.
-- (V3 와 동일 패턴: 참조하는 event.form_template_id 를 NULL 로 만든 뒤 행 제거 → Seeder 가 재시드)
UPDATE event SET form_template_id = NULL
 WHERE form_template_id IN (SELECT id FROM form_template WHERE is_system_default = TRUE);
DELETE FROM form_template WHERE is_system_default = TRUE;
