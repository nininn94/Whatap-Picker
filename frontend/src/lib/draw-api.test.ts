import { afterEach, describe, expect, it, vi } from "vitest";
import {
  drawPrize,
  fetchEvents,
  fetchDrawHistory,
  fetchPrizeInventory,
  searchLeads,
} from "./draw-api";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("draw-api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches prize inventory with the event code query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        eventCode: "event-1",
        eventDate: "2026-05-28",
        prizes: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchPrizeInventory("event-1");

    expect(response.eventCode).toBe("event-1");
    expect(fetchMock).toHaveBeenCalledWith("/api/prizes?eventCode=event-1", {
      credentials: "include",
      headers: {},
    });
  });

  it("posts draw requests as JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        rank: 2,
        prizeName: "텀블러",
        drawnAt: "2026-05-28T12:00:00Z",
        drawnBy: { id: "admin-1", username: "admin" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await drawPrize({ leadId: "lead-1", eventCode: "event-1" });

    expect(fetchMock).toHaveBeenCalledWith("/api/draw", {
      method: "POST",
      body: JSON.stringify({ leadId: "lead-1", eventCode: "event-1" }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("fetches public events through the Next API proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          eventCode: "event-1",
          eventDate: "2026-05-28",
          endDate: null,
          label: "첫 번째 이벤트",
          status: "OPEN",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchEvents();

    expect(response[0].eventCode).toBe("event-1");
    expect(fetchMock).toHaveBeenCalledWith("/api/events", {
      credentials: "include",
      headers: {},
    });
  });

  it("normalizes backend lead search AI payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        eventCode: "event-1",
        eventDate: "2026-05-28",
        results: [
          {
            leadId: "lead-1",
            name: "홍길동",
            jobFunction: "DEVELOPER",
            jobLevel: "STAFF",
            company: "와탭랩스",
            drawn: false,
            drawnAt: null,
            ai: {
              status: "DONE",
              grade: "B",
              score: 68,
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await searchLeads({ name: "홍길동", phoneLast4: "1234", eventCode: "event-1" });

    expect(response.results[0]).toMatchObject({
      aiStatus: "DONE",
      grade: "B",
      score: 68,
    });
  });

  it("normalizes backend draw history payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          drawn: true,
          drawnAt: "2026-05-28T12:00:00Z",
          awardedRank: 3,
          prizeId: "prize-1",
        }),
      ),
    );

    const response = await fetchDrawHistory({ leadId: "lead-1", eventCode: "event-1" });

    expect(response).toMatchObject({
      rank: 3,
      prizeName: null,
      outOfStock: false,
      drawnAt: "2026-05-28T12:00:00Z",
    });
  });

  it("throws DrawApiError for API error payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          { code: "LEAD_NOT_FOUND", message: "설문 제출 내역을 찾을 수 없습니다." },
          { status: 404 },
        ),
      ),
    );

    await expect(
      searchLeads({ name: "홍길동", phoneLast4: "1234", eventCode: "event-1" }),
    ).rejects.toMatchObject({
      code: "LEAD_NOT_FOUND",
      status: 404,
      message: "설문 제출 내역을 찾을 수 없습니다.",
    });
  });
});
