-- Google Sheets 행사별 연동 매핑
ALTER TABLE event
    ADD COLUMN spreadsheet_id  varchar(255),
    ADD COLUMN sheet_name      varchar(255) DEFAULT 'Leads',
    ADD COLUMN sheets_enabled  boolean      NOT NULL DEFAULT FALSE;
