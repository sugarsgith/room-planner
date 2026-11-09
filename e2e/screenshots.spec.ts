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
  await expect(page.getByTestId("item-name")).toHaveValue("2人掛けソファ");
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

test("fixtures, save status, swing warning, and 3D", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await page.getByTestId("fixture-add-pillar").click();
  await page.getByTestId("fixture-span-x").fill("300");
  await page.getByTestId("fixture-span-z").fill("300");
  await page.getByTestId("fixture-commit").click();
  await expect(page.locator("[data-fixture-type=pillar]")).toBeVisible();

  await page.getByTestId("fixture-add-storage").click();
  await page.getByTestId("fixture-corner").selectOption("front-left");
  await page.getByTestId("fixture-width").fill("900");
  await page.getByTestId("fixture-depth").fill("450");
  await page.getByTestId("fixture-height").fill("1800");
  await page.getByTestId("fixture-door").selectOption("double");
  await page.getByTestId("fixture-commit").click();
  await expect(page.getByTestId("door-swing")).toHaveCount(2);

  await page.getByTestId("fixture-add-beam").click();
  await page.getByTestId("fixture-wall-back").click();
  await page.getByTestId("fixture-wall-right").click();
  await page.getByTestId("fixture-wall-left").click();
  await page.getByTestId("fixture-beam-out").fill("300");
  await page.getByTestId("fixture-beam-drop").fill("300");
  await page.getByTestId("fixture-commit").click();
  await expect(page.locator("[data-fixture-type=beam]")).toHaveCount(3);

  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-status")).toContainText("保存済み");
  await page.screenshot({ path: `${outDir}/room-fixtures-2d-1440.png` });
  await page.getByTestId("fixture-panel").screenshot({ path: `${outDir}/room-fixtures-panel-1440.png` });

  await page.getByTestId("furniture-desk").click();
  await expect(page.getByTestId("swing-warning")).toBeVisible();
  await page.getByTestId("swing-warning").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${outDir}/room-fixtures-swing-1440.png` });

  await page.getByTestId("view-mode-3d").click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/room-fixtures-3d-1440.png` });

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByTestId("view-mode-2d").click();
  await expect(page.locator("[data-fixture-type=pillar]")).toBeVisible();
  await page.screenshot({ path: `${outDir}/room-fixtures-2d-ipad.png` });
});
