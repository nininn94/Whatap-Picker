package io.whatap.picker.csv;

import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * RFC 4180 + UTF-8 BOM CSV writer for Excel 호환.
 */
public class CsvWriter implements AutoCloseable {

    private static final byte[] BOM = new byte[] { (byte)0xEF, (byte)0xBB, (byte)0xBF };

    private final PrintWriter out;

    public CsvWriter(OutputStream stream) {
        try {
            stream.write(BOM);
            stream.flush();
        } catch (Exception e) {
            throw new IllegalStateException("BOM write failed", e);
        }
        this.out = new PrintWriter(new OutputStreamWriter(stream, StandardCharsets.UTF_8), false);
    }

    public void writeRow(List<String> cells) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < cells.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(escape(cells.get(i)));
        }
        sb.append("\r\n");
        out.write(sb.toString());
    }

    public void flush() { out.flush(); }

    @Override public void close() { out.flush(); }

    private String escape(String value) {
        if (value == null) return "";
        boolean needsQuote = value.contains(",") || value.contains("\"") || value.contains("\n") || value.contains("\r");
        String escaped = value.replace("\"", "\"\"");
        return needsQuote ? "\"" + escaped + "\"" : escaped;
    }
}
