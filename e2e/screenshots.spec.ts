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
  await expect(page.getByTestId("phone-tabs")).toBeHidden();
  const list = await page.locator(".list-panel").boundingBox();
  const view = await page.getByTestId("view-2d").boundingBox();
  const box = await page.getByTestId("inspector").boundingBox();
  expect(list).not.toBeNull();
  expect(view).not.toBeNull();
  expect(box).not.toBeNull();
  expect(list!.x).toBeLessThan(view!.x);
  expect(view!.x + view!.width).toBeLessThanOrEqual(box!.x + 2);
  expect(view!.width).toBeGreaterThan(300);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1024 + 1);
  await page.screenshot({ path: `${outDir}/room-2d-ipad.png` });
  await page.screenshot({ path: `${outDir}/ipad-2d-1024.png` });

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
  await page.getByTestId("fixture-span-x").fill("30");
  await page.getByTestId("fixture-span-z").fill("30");
  await page.getByTestId("fixture-commit").click();
  await expect(page.locator("[data-fixture-type=pillar]")).toBeVisible();

  await page.getByTestId("fixture-add-storage").click();
  await page.getByTestId("fixture-corner").selectOption("front-left");
  await page.getByTestId("fixture-width").fill("90");
  await page.getByTestId("fixture-depth").fill("45");
  await page.getByTestId("fixture-height").fill("180");
  await page.getByTestId("fixture-door").selectOption("double");
  await page.getByTestId("fixture-commit").click();
  await expect(page.getByTestId("door-swing")).toHaveCount(2);
  await page.getByRole("button", { name: "備え付け収納（左下）" }).click();
  await expect(page.getByTestId("edit-fixture-door")).toBeVisible();
  await expect(page.getByTestId("edit-fixture-door")).toHaveValue("double");
  await expect(page.getByTestId("edit-storage-width")).toHaveValue("90.0");
  await expect(page.getByTestId("fixture-panel")).not.toContainText("mm");
  await page.getByTestId("edit-fixture-door").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${outDir}/room-storage-edit-1440.png` });
  await page.getByTestId("edit-fixture-door").selectOption("single");
  await expect(page.getByTestId("edit-hinge-left")).toBeVisible();
  await page.getByTestId("edit-hinge-right").click();
  await expect(page.getByTestId("edit-hinge-right")).toHaveClass(/active/);
  await expect(page.getByTestId("door-swing")).toHaveCount(1);
  await page.getByTestId("edit-fixture-door").selectOption("double");
  await expect(page.getByTestId("door-swing")).toHaveCount(2);

  await page.getByTestId("fixture-add-beam").click();
  await page.getByTestId("fixture-wall-back").click();
  await page.getByTestId("fixture-wall-right").click();
  await page.getByTestId("fixture-wall-left").click();
  await page.getByTestId("fixture-beam-out").fill("30");
  await page.getByTestId("fixture-beam-drop").fill("30");
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

test("window, entrance, and allowed overlap", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");

  await page.getByTestId("fixture-add-window").click();
  await expect(page.getByTestId("fixture-opening-offset")).toBeVisible();
  await expect(page.locator("label").filter({ has: page.getByTestId("fixture-opening-offset") })).toContainText("右端から");
  await page.getByTestId("fixture-opening-offset").fill("52.5");
  await page.getByTestId("fixture-opening-width").fill("165");
  await page.getByTestId("fixture-window-sill").fill("90");
  await page.getByTestId("fixture-window-height").fill("110");
  await page.getByTestId("fixture-window-recess").fill("30");
  await page.getByTestId("fixture-commit").click();
  await expect(page.getByTestId("fixture-window")).toBeVisible();

  await page.getByRole("button", { name: "窓（上）" }).click();
  await expect(page.getByTestId("edit-window-style")).toHaveValue("sliding");
  await expect(page.getByTestId("edit-window-width")).toHaveValue("165.0");
  await page.getByTestId("edit-window-style").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${outDir}/room-window-edit-1440.png` });

  await page.getByTestId("fixture-add-entrance").click();
  await page.getByTestId("fixture-opening-offset").fill("95");
  await page.getByTestId("fixture-opening-width").fill("80");
  await page.getByTestId("fixture-commit").click();
  await expect(page.getByTestId("fixture-entrance")).toBeVisible();

  await page.getByRole("button", { name: "箱を追加" }).click();
  await expect(page.getByTestId("item-name")).toHaveValue("新しい家具");
  await page.getByTestId("item-name").fill("チェア");
  await page.getByTestId("item-name").press("Enter");
  await page.getByTestId("dim-width").fill("55");
  await page.getByTestId("dim-width").press("Enter");
  await page.getByTestId("dim-depth").fill("55");
  await page.getByTestId("dim-depth").press("Enter");
  await page.getByTestId("dim-height").fill("90");
  await page.getByTestId("dim-height").press("Enter");
  await page.getByTestId("pos-x").fill("70");
  await page.getByTestId("pos-x").press("Enter");
  await page.getByTestId("pos-z").fill("90");
  await page.getByTestId("pos-z").press("Enter");
  await page.getByTestId("allow-desk").check();
  await expect(page.getByTestId("overlap-warning")).toHaveCount(0);
  await page.getByTestId("allow-overlap").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${outDir}/room-allow-overlap-1440.png` });

  await page.getByTestId("view-mode-2d").click();
  await page.screenshot({ path: `${outDir}/room-window-entrance-2d-1440.png` });
  await page.getByTestId("view-mode-3d").click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/room-window-entrance-3d-1440.png` });
});

test("iPhone portrait stacks the view and switches panels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await expect(page.getByTestId("phone-tabs")).toBeVisible();
  await expect(page.getByTestId("toolbar-more")).toBeVisible();
  await expect(page.locator(".toolbar-secondary")).toBeHidden();
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-status")).toContainText("保存済み");

  const view = await page.getByTestId("view-2d").boundingBox();
  expect(view).not.toBeNull();
  expect(view!.width).toBeGreaterThan(300);
  expect(view!.height).toBeGreaterThan(300);
  await page.screenshot({ path: `${outDir}/iphone-2d-390.png` });

  await page.getByTestId("phone-tab-room").click();
  await expect(page.getByTestId("room-width")).toBeVisible();
  await expect(page.getByText("部屋の出っ張り")).toBeVisible();
  await expect(page.getByTestId("furniture-bed")).toBeHidden();
  await expect(page.getByTestId("item-name")).toBeHidden();
  await page.screenshot({ path: `${outDir}/iphone-room-tab-390.png` });

  await page.getByTestId("phone-tab-furniture").click();
  await expect(page.getByTestId("furniture-bed")).toBeVisible();
  await expect(page.getByTestId("room-width")).toBeHidden();
  await page.getByTestId("furniture-sofa").click();
  await expect(page.getByTestId("phone-tab-edit")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("item-name")).toHaveValue("2人掛けソファ");
  await expect(page.getByTestId("furniture-bed")).toBeHidden();
  await expect(page.getByTestId("room-width")).toBeHidden();

  await page.getByTestId("view-mode-3d").click();
  await expect(page.getByTestId("view-3d")).toBeVisible();
  const view3d = await page.getByTestId("view-3d").boundingBox();
  expect(view3d).not.toBeNull();
  expect(view3d!.width).toBeGreaterThan(300);
  expect(view3d!.height).toBeGreaterThan(300);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/iphone-3d-390.png` });
});
