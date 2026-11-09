import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";

test.beforeAll(() => {
  mkdirSync(outDir, { recursive: true });
});

test("desktop 2D, selection, overlap, and 3D", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await expect(page.getByTestId("view-2d")).toBeVisible();
  await expect(page.getByTestId("furniture-bed")).toBeVisible();
  await page.screenshot({ path: `${outDir}/room-2d-1440.png` });

  await page.getByTestId("furniture-bed").click();
  await expect(page.getByTestId("inspector")).toBeVisible();
  await expect(page.getByTestId("pos-x")).toBeVisible();
  await expect(page.getByTestId("item-name")).toHaveValue("シングルベッド");
  await page.screenshot({ path: `${outDir}/room-2d-selected-1440.png` });

  await page.getByTestId("view-mode-3d").click();
  await expect(page.getByTestId("view-3d")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/room-3d-1440.png` });
  await page.getByTestId("view-mode-2d").click();
  await expect(page.getByTestId("view-2d")).toBeVisible();

  await page.getByTestId("furniture-sofa").click();
  await page.getByTestId("pos-x").fill("45");
  await page.getByTestId("pos-x").press("Enter");
  await page.getByTestId("pos-z").fill("90");
  await page.getByTestId("pos-z").press("Enter");
  await expect(page.getByTestId("overlap-warning")).toBeVisible();
  await page.screenshot({ path: `${outDir}/room-2d-overlap-1440.png` });
});

test("iPad-sized 2D, selection, overlap, and 3D", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("./");
  await expect(page.getByTestId("view-2d")).toBeVisible();
  const box = await page.getByTestId("inspector").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(1024 + 1);
  await page.screenshot({ path: `${outDir}/room-2d-ipad.png` });

  await page.getByTestId("furniture-table").click();
  await expect(page.getByTestId("dim-width")).toBeVisible();
  await page.screenshot({ path: `${outDir}/room-2d-selected-ipad.png` });

  await page.getByTestId("pos-x").fill("45");
  await page.getByTestId("pos-x").press("Enter");
  await page.getByTestId("pos-z").fill("90");
  await page.getByTestId("pos-z").press("Enter");
  await expect(page.getByTestId("overlap-warning")).toBeVisible();
  await page.screenshot({ path: `${outDir}/room-overlap-ipad.png` });

  await page.getByTestId("view-mode-3d").click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/room-3d-ipad.png` });
});
