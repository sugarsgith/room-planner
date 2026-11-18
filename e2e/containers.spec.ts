import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";

test.beforeAll(() => {
  mkdirSync(outDir, { recursive: true });
});

test("a FITS case under the bed holds clothes, and removing the case keeps them", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await page.getByTestId("export-reminder-later").click();

  await page.getByTestId("furniture-bed").click();
  await page.getByTestId("storage-name").fill("ベッド下");
  await page.getByTestId("storage-width").fill("90");
  await page.getByTestId("storage-depth").fill("190");
  await page.getByTestId("storage-height").fill("20");
  await page.getByTestId("storage-add").click();
  await page.getByTestId("stored-name").fill("FITS");
  await page.getByTestId("stored-qty").fill("1");
  await page.getByTestId("stored-add").click();
  await page.getByTestId("stored-name").fill("冬服");
  await page.getByTestId("stored-add").click();

  await page.getByTestId("work-mode-storage").click();
  await page.getByTestId("storage-unit-bed").click();
  await page.getByRole("button", { name: /FITS/ }).click();
  await fillSize(page, "item-edit-width", "item-edit-depth", "item-edit-height", "40", "30", "15");
  await fillSize(page, "item-edit-inner-width", "item-edit-inner-depth", "item-edit-inner-height", "35", "25", "12");
  await expect(page.getByTestId("item-edit-qty")).toBeDisabled();

  await page.getByRole("button", { name: /冬服/ }).click();
  await page.getByTestId("item-edit-place").selectOption({ label: "FITS の中" });
  await fillSize(page, "item-edit-width", "item-edit-depth", "item-edit-height", "30", "20", "5");
  const nest = page.locator("[data-testid^='container-block-']");
  await expect(nest).toContainText("冬服");
  await expect(nest.locator("[data-testid^='item-fit-']")).toHaveText("入る");
  await expect(page.locator("[data-testid^='container-fill-']")).toContainText("目安");

  await page.getByTestId("storage-view-search").fill("冬服");
  await expect(page.getByTestId("storage-search-hits")).toContainText("冬服 / FITS（ベッド下）");

  await page.getByTestId("save-button").click();
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem("room-planner.project.v1") ?? "{}")) as {
    schemaVersion: number;
    storedItems: { name: string; containerId?: string; spaceId: string }[];
  };
  expect(saved.schemaVersion).toBe(5);
  const clothes = saved.storedItems.find((item) => item.name === "冬服");
  const fits = saved.storedItems.find((item) => item.name === "FITS");
  expect(clothes?.containerId).toBeTruthy();
  expect(clothes?.spaceId).toBe(fits?.spaceId);

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: `${outDir}/storage-view-ipad-1024.png` });
  await page.getByTestId("storage-view-search").fill("");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("storage-back")).toBeVisible();
  await expect(nest).toContainText("冬服");
  await page.screenshot({ path: `${outDir}/storage-view-iphone-390.png` });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: /FITS/ }).click();
  await page.getByTestId("remove-stored-item").click();
  await expect(page.getByTestId("remove-stored-dialog")).toContainText("冬服");
  await page.getByTestId("remove-item-cancel").click();
  await expect(nest).toContainText("冬服");
  await page.getByTestId("remove-stored-item").click();
  await page.getByTestId("remove-item-release").click();
  await expect(page.locator("[data-testid^='container-block-']")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /冬服/ })).toBeVisible();
});

async function fillSize(page: Page, widthId: string, depthId: string, heightId: string, width: string, depth: string, height: string) {
  await page.getByTestId(widthId).fill(width);
  await page.getByTestId(depthId).fill(depth);
  await page.getByTestId(heightId).fill(height);
  await page.getByTestId(heightId).press("Enter");
}
