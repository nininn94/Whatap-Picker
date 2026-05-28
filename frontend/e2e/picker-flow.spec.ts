import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "whatap-picker-display-v9";

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

test("runs a full mock draw cycle for the test participant", async ({ page }) => {
  await mockPrizeInventory(page);
  await page.goto("/?eventCode=event-1");

  await page.getByLabel("성").fill("wha");
  await page.getByLabel("이름").fill("tap");
  await page.getByLabel("전화번호 뒷자리").fill("1111");
  await page.getByRole("button", { name: /이벤트 참여하기/ }).click();

  await expect(page.getByText("이벤트 및 테스트 관리")).toBeVisible();
  await expect(page.getByText("현재 선택된 이벤트: event-1")).toBeVisible();
  await page.getByRole("button", { name: /상승형/ }).click();
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))
    .toContain("\"pattern\":\"rising\"");
  await page.getByRole("button", { name: /3등.*Mock 스티커팩/ }).click();

  await expect(page.getByTestId("draw-result-rank")).toBeVisible({ timeout: 5_000 });
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))
    .toContain("\"picked\":true");
});

test("resets locally saved picked cells", async ({ page }) => {
  await mockPrizeInventory(page);
  await page.goto("/?eventCode=event-1");
  await page.evaluate(() => {
    localStorage.setItem(
      "whatap-picker-display-v9",
      JSON.stringify({
        eventTitle: "Whatap 경품 뽑기",
        pattern: "scatter",
        prizes: [
          { rank: "1등", name: "프리미엄 굿즈", count: 500 },
        ],
        cells: Array.from({ length: 500 }, (_, index) => ({
          id: `cell-${index}`,
          rank: "1등",
          name: "프리미엄 굿즈",
          prizeIndex: 0,
          tone: "blue",
          picked: index === 0,
        })),
        results: [{ id: "result-1", cellNumber: 1, rank: "1등", name: "프리미엄 굿즈", pickedAt: "now" }],
      }),
    );
  });
  await page.reload();
  await expect(page.getByRole("button", { name: /초기화/ })).toBeEnabled();

  await page.getByRole("button", { name: /초기화/ }).click();

  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))
    .not.toContain("\"picked\":true");
});
