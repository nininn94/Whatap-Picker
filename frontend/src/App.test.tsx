import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

function inventoryResponse(eventCode = "event-1") {
  return new Response(
    JSON.stringify({
      eventCode,
      eventDate: "2026-05-28",
      prizes: [],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

function renderAppWithEventCode(path = "/?eventCode=event-1") {
  window.history.pushState({}, "", path);
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const eventCode = new URL(url, window.location.origin).searchParams.get("eventCode") || "event-1";
      return Promise.resolve(inventoryResponse(eventCode));
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

  it("opens the management page for the hidden admin pattern", async () => {
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
    await user.clear(await screen.findByLabelText("이벤트 코드"));
    await user.type(screen.getByLabelText("이벤트 코드"), "event-2");
    await user.click(screen.getByRole("button", { name: "이벤트 적용" }));

    expect(screen.getByText(/현재 선택된 이벤트: event-2/)).toBeInTheDocument();
    expect(window.location.search).toContain("eventCode=event-2");
  });

  it("reads event code from event path URLs", async () => {
    renderAppWithEventCode("/event/event-1");

    expect(await screen.findByText("event-1")).toBeInTheDocument();
    expect(screen.queryByText("URL에 eventCode 파라미터가 필요합니다.")).not.toBeInTheDocument();
  });
});
