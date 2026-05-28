-- 시스템 기본 폼 템플릿을 다음 부트 시 시드 JSON으로 강제 재반영하기 위해 표시 삭제.
-- FormTemplateSeeder.seedSystemDefaultIfMissing 가 다시 시드한다.
-- 외래키(Event.form_template_id 등)는 ON DELETE 없이 nullable 이므로 안전.
DELETE FROM form_template WHERE is_system_default = TRUE;
