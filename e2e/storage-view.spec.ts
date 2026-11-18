import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";

test.beforeAll(() => {
  mkdirSync(outDir, { recursive: true });
});

test("storage view edits sizes, checks fit, and keeps the phone tabs for the plan", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await page.getByTestId("export-reminder-later").click();
  await expect(page.getByTestId("export-reminder")).toHaveCount(0);

  await page.getByTestId("furniture-bed").click();
  await page.getByTestId("storage-name").fill("ベッド下");
  await page.getByTestId("storage-width").fill("90");
  await page.getByTestId("storage-depth").fill("190");
  await page.getByTestId("storage-height").fill("20");
  await page.getByTestId("storage-add").click();
  await page.getByTestId("stored-name").fill("衣装ケース");
  await page.getByTestId("stored-qty").fill("1");
  await page.getByTestId("stored-add").click();

  await page.getByTestId("fixture-add-storage").click();
  await page.getByTestId("fixture-width").fill("80");
  await page.getByTestId("fixture-depth").fill("45");
  await page.getByTestId("fixture-height").fill("180");
  await page.getByTestId("fixture-commit").click();
  await expect(page.getByText("備え付け収納（左上）")).toBeVisible();

  await page.getByTestId("work-mode-storage").click();
  await expect(page.getByTestId("storage-workspace")).toBeVisible();
  await expect(page.getByTestId("phone-tabs")).toHaveCount(0);
  await expect(page.getByTestId("storage-unit-bed")).toBeVisible();
  await page.locator("[data-testid^='storage-builtin-']").click();
  await expect(page.getByTestId("storage-detail")).toContainText("中の段や収納物は、まだ記録できません");
  await expect(page.getByTestId("storage-editor")).toContainText("まだここでは登録できません");

  await page.getByTestId("storage-unit-bed").click();
  await expect(page.getByTestId("storage-detail")).toContainText("内寸 90.0 × 190.0 × 20.0 cm");
  await page.locator("[data-testid^='storage-view-space-'] button").first().click();
  await page.getByTestId("space-edit-height").fill("25");
  await page.getByTestId("space-edit-height").press("Enter");
  await expect(page.getByTestId("storage-detail")).toContainText("内寸 90.0 × 190.0 × 25.0 cm");
  await page.getByTestId("space-edit-height").fill("20");
  await page.getByTestId("space-edit-height").press("Enter");

  await page.locator("[data-testid^='storage-view-item-']").click();
  await page.getByTestId("item-edit-name").fill("冬服");
  await page.getByTestId("item-edit-name").press("Enter");
  await page.getByTestId("item-edit-qty").fill("2");
  await page.getByTestId("item-edit-qty").press("Enter");
  await expect(page.locator("[data-testid^='storage-view-item-']")).toContainText("冬服 × 2");

  await page.getByTestId("storage-view-search").fill("冬服");
  await expect(page.getByTestId("storage-search-hits")).toContainText("ベッド · ベッド下");
  await page.getByTestId("storage-view-search").fill("");

  await fillSize(page, "40", "30", "10");
  await expect(page.locator("[data-testid^='item-fit-']")).toHaveText("入る");

  await fillSize(page, "180", "40", "10");
  await expect(page.locator("[data-testid^='item-fit-']")).toHaveText("向きを変えると入る");

  await fillSize(page, "180", "40", "30");
  await expect(page.locator("[data-testid^='item-fit-']")).toHaveText("高さが足りない");

  await fillSize(page, "100", "200", "10");
  await expect(page.locator("[data-testid^='item-fit-']")).toHaveText("入らない");

  await fillSize(page, "80", "40", "10");
  await page.getByTestId("item-edit-qty").fill("11");
  await page.getByTestId("item-edit-qty").press("Enter");
  await expect(page.locator("[data-testid^='item-fit-']")).toHaveText("入る");
  await expect(page.locator("[data-testid^='item-count-']")).toContainText("11個分の容積は、このスペースの目安を超えます");
  await expect(page.locator("[data-testid^='space-fill-']")).toHaveText("目安 103%");
  await expect(page.getByTestId("storage-detail")).toContainText("目安");

  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-status")).toContainText("保存済み");
  const saved = await page.evaluate(() => localStorage.getItem("room-planner.project.v1") ?? "");
  const document = JSON.parse(saved) as { schemaVersion: number; storedItems: { width?: number }[] };
  expect(document.schemaVersion).toBe(5);
  expect(document.storedItems[0].width).toBeGreaterThan(0);

  await page.setViewportSize({ width: 1024, height: 768 });
  const list = await page.locator(".storage-workspace .list-panel").boundingBox();
  const detail = await page.getByTestId("storage-detail").boundingBox();
  const editor = await page.getByTestId("storage-editor").boundingBox();
  expect(list && detail && editor).toBeTruthy();
  expect(list!.x).toBeLessThan(detail!.x);
  expect(detail!.x + detail!.width).toBeLessThanOrEqual(editor!.x + 2);
  await expect(page.getByTestId("phone-tabs")).toHaveCount(0);
  await page.screenshot({ path: `${outDir}/storage-view-ipad-1024.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("phone-tabs")).toHaveCount(0);
  await expect(page.getByTestId("storage-back")).toBeVisible();
  await expect(page.locator("[data-testid^='item-fit-']")).toHaveText("入る");
  await page.screenshot({ path: `${outDir}/storage-view-iphone-390.png` });

  await page.getByTestId("storage-back").click();
  await expect(page.getByTestId("storage-unit-bed")).toBeVisible();
  await page.getByTestId("work-mode-layout").click();
  await expect(page.getByTestId("phone-tabs")).toBeVisible();
  await expect(page.getByTestId("phone-tab-furniture")).toBeVisible();
  await expect(page.getByTestId("phone-tab-edit")).toBeVisible();
  await expect(page.getByTestId("phone-tab-room")).toBeVisible();
});

async function fillSize(page: import("@playwright/test").Page, width: string, depth: string, height: string) {
  await page.getByTestId("item-edit-width").fill(width);
  await page.getByTestId("item-edit-depth").fill(depth);
  await page.getByTestId("item-edit-height").fill(height);
  await page.getByTestId("item-edit-height").press("Enter");
}
