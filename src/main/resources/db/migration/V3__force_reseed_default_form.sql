-- 시스템 기본 폼 템플릿을 다음 부트 시 시드 JSON으로 강제 재반영하기 위해 행 제거.
-- FormTemplateSeeder.seedSystemDefaultIfMissing 가 다시 시드한다.
--
-- 주의: Event.form_template_id 가 system_default 행을 참조 중이면 그대로 DELETE 시
-- FK 위반 발생. 먼저 참조하는 행의 form_template_id 를 NULL 로 set 한다.
-- SurveyPageController 는 form_template_id 가 null 이면 새 시스템 기본을 fallback 사용.
UPDATE event SET form_template_id = NULL
 WHERE form_template_id IN (SELECT id FROM form_template WHERE is_system_default = TRUE);
DELETE FROM form_template WHERE is_system_default = TRUE;
