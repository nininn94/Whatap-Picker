package io.whatap.picker.sheets;

import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.http.HttpRequestInitializer;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.sheets.v4.Sheets;
import com.google.api.services.sheets.v4.SheetsScopes;
import com.google.api.services.sheets.v4.model.AppendValuesResponse;
import com.google.api.services.sheets.v4.model.ValueRange;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.auth.oauth2.GoogleCredentials;
import io.whatap.picker.setting.AppSettingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Google Sheets 클라이언트.
 * AppSetting 에 저장된 Service Account JSON 으로 인증해서 행을 append.
 * 호출 시점마다 JSON 을 다시 읽어 새 Sheets 인스턴스 생성 (간단함 우선).
 */
@Component
public class SheetsClient {

    private static final Logger log = LoggerFactory.getLogger(SheetsClient.class);
    private static final String APPLICATION_NAME = "WhaTap-Picker";

    private final AppSettingService settings;

    public SheetsClient(AppSettingService settings) {
        this.settings = settings;
    }

    public boolean isConfigured() {
        return settings.isGoogleSheetsConfigured();
    }

    /**
     * 시트의 마지막 행 뒤에 한 행 append.
     * @param spreadsheetId Google Sheet 의 ID (URL 의 /d/{id}/ 부분)
     * @param sheetName     탭 이름 (예: "Leads"). 따옴표 자동 처리.
     * @param row           컬럼값 리스트 (문자열/숫자/Boolean 등 객체)
     */
    public void appendRow(String spreadsheetId, String sheetName, List<Object> row) throws Exception {
        Sheets service = buildService();
        ValueRange body = new ValueRange().setValues(List.of(row));
        String range = quoteSheetName(sheetName) + "!A:A";
        AppendValuesResponse resp = service.spreadsheets().values()
                .append(spreadsheetId, range, body)
                .setValueInputOption("USER_ENTERED")
                .setInsertDataOption("INSERT_ROWS")
                .execute();
        log.info("Sheets append OK spreadsheetId={} range={} updated={}",
                spreadsheetId, range,
                resp.getUpdates() != null ? resp.getUpdates().getUpdatedRange() : "?");
    }

    /**
     * 헤더 행이 비어있으면 채움. 이미 데이터가 있으면 그대로 둠.
     * (간단한 정책: A1 셀이 비어있는지 검사 → 비어있으면 헤더 1행을 update)
     */
    public void ensureHeader(String spreadsheetId, String sheetName, List<Object> header) throws Exception {
        Sheets service = buildService();
        String range = quoteSheetName(sheetName) + "!A1";
        ValueRange existing = service.spreadsheets().values()
                .get(spreadsheetId, range)
                .execute();
        boolean empty = existing.getValues() == null || existing.getValues().isEmpty()
                || existing.getValues().get(0).isEmpty()
                || existing.getValues().get(0).get(0) == null
                || existing.getValues().get(0).get(0).toString().isBlank();
        if (!empty) return;

        String headerRange = quoteSheetName(sheetName) + "!A1";
        service.spreadsheets().values()
                .update(spreadsheetId, headerRange, new ValueRange().setValues(List.of(header)))
                .setValueInputOption("RAW")
                .execute();
    }

    /** 인증 + 시트 메타 단순 호출로 연결 확인. throw 가능. */
    public String testConnection(String spreadsheetId) throws Exception {
        Sheets service = buildService();
        var sheet = service.spreadsheets().get(spreadsheetId).execute();
        return sheet.getProperties() != null ? sheet.getProperties().getTitle() : "(no title)";
    }

    private Sheets buildService() throws Exception {
        String json = settings.googleServiceAccountJson();
        if (json == null || json.isBlank()) {
            throw new IllegalStateException("Google Sheets 가 설정되지 않았습니다. /admin/settings 에서 Service Account JSON 을 등록하세요.");
        }
        GoogleCredentials credentials = GoogleCredentials
                .fromStream(new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)))
                .createScoped(List.of(SheetsScopes.SPREADSHEETS));
        HttpRequestInitializer init = new HttpCredentialsAdapter(credentials);
        NetHttpTransport transport = GoogleNetHttpTransport.newTrustedTransport();
        return new Sheets.Builder(transport, GsonFactory.getDefaultInstance(), init)
                .setApplicationName(APPLICATION_NAME)
                .build();
    }

    private static String quoteSheetName(String name) {
        if (name == null || name.isBlank()) return "'Leads'";
        return "'" + name.replace("'", "''") + "'";
    }
}
