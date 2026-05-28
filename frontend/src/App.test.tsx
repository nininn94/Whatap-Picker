import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

function inventoryResponse(eventCode = "event-1", prizes: unknown[] = []) {
  return new Response(
    JSON.stringify({
      eventCode,
      eventDate: "2026-05-28",
      prizes,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

function eventsResponse() {
  return new Response(
    JSON.stringify([
      {
        id: "event-id-1",
        eventCode: "event-1",
        eventDate: "2026-05-28",
        endDate: null,
        label: "첫 번째 이벤트",
        status: "OPEN",
      },
      {
        id: "event-id-2",
        eventCode: "event-2",
        eventDate: "2026-05-29",
        endDate: null,
        label: "두 번째 이벤트",
        status: "OPEN",
      },
    ]),
    { headers: { "Content-Type": "application/json" } },
  );
}

function renderAppWithEventCode(path = "/?eventCode=event-1", prizes: unknown[] = []) {
  window.history.pushState({}, "", path);
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const parsedUrl = new URL(url, window.location.origin);
      if (parsedUrl.pathname === "/api/admin/events") {
        return Promise.resolve(eventsResponse());
      }

      const eventCode = parsedUrl.searchParams.get("eventCode") || "event-1";
      return Promise.resolve(inventoryResponse(eventCode, prizes));
    }),
  );
  render(<App />);
}

describe("App participant form", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("shows validation feedback when required participant fields are empty", async () => {
    const user = userEvent.setup();
    renderAppWithEventCode();

    const submitButton = screen.getByRole("button", { name: /이벤트 참여하기/ });
    await waitFor(() => expect(submitButton).toBeEnabled());
    await user.click(submitButton);

    expect(screen.getByText("고객 성, 이름과 전화번호 뒷자리 4자리를 입력해주세요.")).toBeInTheDocument();
  });

  it("opens the management page for the hidden admin credentials", async () => {
    const user = userEvent.setup();
    renderAppWithEventCode();

    await user.type(screen.getByLabelText("성"), "wha");
    await user.type(screen.getByLabelText("이름"), "tap");
    await user.type(screen.getByLabelText("전화번호 뒷자리"), "1111");
    await user.click(screen.getByRole("button", { name: /이벤트 참여하기/ }));

    expect(await screen.findByText("이벤트 및 테스트 관리")).toBeInTheDocument();
    expect(screen.getByText(/현재 선택된 이벤트: event-1/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /500칸 뽑기 차트/ })).toBeInTheDocument();
  });

  it("initializes the picker board with API prize quantities", async () => {
    const user = userEvent.setup();
    renderAppWithEventCode("/?eventCode=event-1", [
      { rank: 1, name: "API 1등", initial: 20, awarded: 0, remaining: 20 },
      { rank: 2, name: "API 2등", initial: 80, awarded: 0, remaining: 80 },
      { rank: 3, name: "API 3등", initial: 100, awarded: 0, remaining: 100 },
      { rank: 4, name: "API 4등", initial: 120, awarded: 0, remaining: 120 },
      { rank: 5, name: "API 5등", initial: 180, awarded: 0, remaining: 180 },
    ]);

    await user.type(screen.getByLabelText("성"), "wha");
    await user.type(screen.getByLabelText("이름"), "tap");
    await user.type(screen.getByLabelText("전화번호 뒷자리"), "1111");
    await user.click(screen.getByRole("button", { name: /이벤트 참여하기/ }));

    expect(await screen.findByRole("button", { name: /3등.*Mock API 3등/ })).toBeInTheDocument();
    expect(localStorage.getItem("whatap-picker-display-v8") ?? "").not.toContain("\"cells\"");
  });

  it("blocks picking when remaining API stock is zero", async () => {
    const user = userEvent.setup();
    renderAppWithEventCode("/?eventCode=event-1", [
      { rank: 1, name: "API 1등", initial: 20, awarded: 20, remaining: 0 },
      { rank: 2, name: "API 2등", initial: 80, awarded: 80, remaining: 0 },
      { rank: 3, name: "API 3등", initial: 100, awarded: 100, remaining: 0 },
      { rank: 4, name: "API 4등", initial: 120, awarded: 120, remaining: 0 },
      { rank: 5, name: "API 5등", initial: 180, awarded: 180, remaining: 0 },
    ]);

    await user.type(screen.getByLabelText("성"), "wha");
    await user.type(screen.getByLabelText("이름"), "tap");
    await user.type(screen.getByLabelText("전화번호 뒷자리"), "1111");
    await user.click(screen.getByRole("button", { name: /이벤트 참여하기/ }));
    await user.click(await screen.findByRole("button", { name: /3등.*Mock API 3등/ }));

    expect(screen.getByText("선택 가능한 칸이 없습니다. 뽑기판을 초기화해 주세요.")).toBeInTheDocument();
  });

  it("opens the management page without an event code", async () => {
    const user = userEvent.setup();
    renderAppWithEventCode("/");

    await user.type(screen.getByLabelText("성"), "wha");
    await user.type(screen.getByLabelText("이름"), "tap");
    await user.type(screen.getByLabelText("전화번호 뒷자리"), "1111");
    await user.click(screen.getByRole("button", { name: /이벤트 참여하기/ }));

    expect(await screen.findByText("이벤트 및 테스트 관리")).toBeInTheDocument();
    expect(screen.getByText("현재 선택된 이벤트: 미선택")).toBeInTheDocument();
  });

  it("applies the selected event code from the management page", async () => {
    const user = userEvent.setup();
    renderAppWithEventCode();

    await user.type(screen.getByLabelText("성"), "wha");
    await user.type(screen.getByLabelText("이름"), "tap");
    await user.type(screen.getByLabelText("전화번호 뒷자리"), "1111");
    await user.click(screen.getByRole("button", { name: /이벤트 참여하기/ }));
    const eventSelect = await screen.findByLabelText("이벤트 코드");
    await waitFor(() => expect(eventSelect).toBeEnabled());
    await user.selectOptions(eventSelect, "event-2");
    await user.click(screen.getByRole("button", { name: "이벤트 적용" }));

    expect(screen.getByText(/현재 선택된 이벤트: event-2/)).toBeInTheDocument();
    expect(window.location.search).toContain("eventCode=event-2");
    expect(localStorage.getItem("whatap-picker-selected-event-code")).toBe("event-2");
  });

  it("reads event code from event path URLs", async () => {
    renderAppWithEventCode("/event/event-1");

    expect(await screen.findByText("event-1")).toBeInTheDocument();
    expect(screen.queryByText("행사를 먼저 선택해주세요.")).not.toBeInTheDocument();
  });
});
