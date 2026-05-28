import { expect, test, type Page } from "@playwright/test";

async function mockPrizeInventory(page: Page) {
  await page.route("**/api/prizes?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        eventCode: "event-1",
        eventDate: "2026-05-28",
        prizes: [
          { rank: 1, name: "프리미엄 굿즈", initial: 10, awarded: 2, remaining: 8 },
          { rank: 2, name: "텀블러", initial: 40, awarded: 10, remaining: 30 },
        ],
      }),
    });
  });
}

test("validates participant fields before search", async ({ page }) => {
  await mockPrizeInventory(page);
  await page.goto("/?eventCode=event-1");

  await page.getByRole("button", { name: /이벤트 참여하기/ }).click();

  await expect(page.getByText("고객 성, 이름과 전화번호 뒷자리 4자리를 입력해주세요.")).toBeVisible();
});

test("moves a matched lead into the draw board", async ({ page }) => {
  await mockPrizeInventory(page);
  await page.route("**/api/leads/search?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        eventCode: "event-1",
        eventDate: "2026-05-28",
        results: [
          {
            leadId: "lead-1",
            name: "홍길동",
            jobFunction: "Engineering",
            jobLevel: "Manager",
            company: "WhaTap",
            drawn: false,
            drawnAt: null,
            aiStatus: "DONE",
            grade: "A",
            score: 92,
          },
        ],
      }),
    });
  });
  await page.goto("/?eventCode=event-1");

  await page.getByLabel("성").fill("홍");
  await page.getByLabel("이름").fill("길동");
  await page.getByLabel("전화번호 뒷자리").fill("1234");
  await page.getByRole("button", { name: /이벤트 참여하기/ }).click();

  await expect(page.getByText("홍길동 · 1234")).toBeVisible();
  await expect(page.getByRole("img", { name: /500칸 뽑기 차트/ })).toBeVisible();
});

test("shows a mock draw result for the test participant", async ({ page }) => {
  await mockPrizeInventory(page);
  await page.goto("/?eventCode=event-1");

  await page.getByLabel("성").fill("wha");
  await page.getByLabel("이름").fill("tap");
  await page.getByLabel("전화번호 뒷자리").fill("1111");
  await page.getByRole("button", { name: /이벤트 참여하기/ }).click();

  await expect(page.getByText("테스트 등수 선택")).toBeVisible();
  await page.getByRole("button", { name: /3등.*Mock 스티커팩/ }).click();

  await expect(page.getByTestId("draw-result-rank")).toHaveText("3등", { timeout: 5_000 });
});
