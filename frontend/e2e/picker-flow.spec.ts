import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "whatap-picker-display-v8";

async function routePrizeInventory(page: Page) {
  await page.route("**/api/events", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          eventCode: "event-1",
          eventDate: "2026-05-28",
          endDate: null,
          label: "첫 번째 이벤트",
          status: "OPEN",
        },
      ]),
    });
  });

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
          { rank: 3, name: "스티커팩", initial: 90, awarded: 0, remaining: 90 },
          { rank: 4, name: "쿠폰", initial: 160, awarded: 0, remaining: 160 },
          { rank: 5, name: "참가 기념품", initial: 200, awarded: 0, remaining: 200 },
        ],
      }),
    });
  });
}

test("validates participant fields before search", async ({ page }) => {
  await routePrizeInventory(page);
  await page.goto("/?eventCode=event-1");

  await page.getByRole("button", { name: /이벤트 참여하기/ }).click();

  await expect(page.getByText("고객 성, 이름과 전화번호 뒷자리 4자리를 입력해주세요.")).toBeVisible();
});

test("moves a matched lead into the draw board", async ({ page }) => {
  await routePrizeInventory(page);
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
            ai: {
              status: "DONE",
              grade: "A",
              score: 92,
            },
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

test("opens admin management for the special account", async ({ page }) => {
  await routePrizeInventory(page);
  await page.goto("/?eventCode=event-1");

  await page.getByLabel("성").fill("wha");
  await page.getByLabel("이름").fill("tap");
  await page.getByLabel("전화번호 뒷자리").fill("1111");
  await page.getByRole("button", { name: /이벤트 참여하기/ }).click();

  await expect(page.getByText("이벤트 및 뽑기판 관리")).toBeVisible();
  await expect(page.getByText(/현재 선택된 이벤트: event-1/)).toBeVisible();
  await expect(page.getByRole("img", { name: /500칸 뽑기 차트/ })).toBeVisible();
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key) || "", STORAGE_KEY))
    .not.toContain("\"cells\"");
});

test("resets locally saved picked cells", async ({ page }) => {
  await routePrizeInventory(page);
  await page.goto("/?eventCode=event-1");
  await page.evaluate(() => {
    localStorage.setItem(
      "whatap-picker-display-v8",
      JSON.stringify({ "event-1": [0] }),
    );
  });
  await page.reload();
  await page.getByLabel("성").fill("wha");
  await page.getByLabel("이름").fill("tap");
  await page.getByLabel("전화번호 뒷자리").fill("1111");
  await page.getByRole("button", { name: /이벤트 참여하기/ }).click();

  await expect(page.getByRole("button", { name: /초기화/ })).toBeEnabled();

  await page.getByRole("button", { name: /초기화/ }).click();

  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const stored = localStorage.getItem(key);
        return stored ? (JSON.parse(stored)["event-1"]?.length ?? 0) : 0;
      }, STORAGE_KEY),
    )
    .toBe(0);
});
