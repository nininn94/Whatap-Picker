import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "@/App";

function inventoryResponse() {
  return new Response(
    JSON.stringify({
      eventCode: "event-1",
      eventDate: "2026-05-28",
      prizes: [],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

function renderAppWithEventCode() {
  window.history.pushState({}, "", "/?eventCode=event-1");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(inventoryResponse()));
  render(<App />);
}

describe("App participant form", () => {
  it("shows validation feedback when required participant fields are empty", async () => {
    const user = userEvent.setup();
    renderAppWithEventCode();

    const submitButton = screen.getByRole("button", { name: /이벤트 참여하기/ });
    await waitFor(() => expect(submitButton).toBeEnabled());
    await user.click(submitButton);

    expect(screen.getByText("고객 성, 이름과 전화번호 뒷자리 4자리를 입력해주세요.")).toBeInTheDocument();
  });

  it("opens the mock prize selection flow for the test participant", async () => {
    const user = userEvent.setup();
    renderAppWithEventCode();

    await user.type(screen.getByLabelText("성"), "wha");
    await user.type(screen.getByLabelText("이름"), "tap");
    await user.type(screen.getByLabelText("전화번호 뒷자리"), "1111");
    await user.click(screen.getByRole("button", { name: /이벤트 참여하기/ }));

    expect(await screen.findByText("테스트 등수 선택")).toBeInTheDocument();
    expect(screen.getByText("Mock · whatap")).toBeInTheDocument();
  });
});
