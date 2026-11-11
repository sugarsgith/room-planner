import { expect, test } from "@playwright/test";

const outDir = "/opt/cursor/artifacts";

test("layouts stay in the existing frames and compare read-only", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await expect(page.getByTestId("view-2d")).toBeVisible();
  await expect(page.getByTestId("layout-bar")).toBeVisible();
  await expect(page.getByTestId("layout-compare")).toBeDisabled();
  const list = await page.locator(".list-panel").boundingBox();
  const view = await page.getByTestId("view-2d").boundingBox();
  const inspector = await page.getByTestId("inspector").boundingBox();
  expect(list && view && inspector).toBeTruthy();
  expect(list!.x).toBeLessThan(view!.x);
  expect(view!.x + view!.width).toBeLessThanOrEqual(inspector!.x + 2);
  await page.screenshot({ path: `${outDir}/layout-pc-normal-1440.png` });
  await page.screenshot({
    path: `${outDir}/layout-manage-1440.png`,
    clip: { x: list!.x, y: list!.y, width: list!.width, height: Math.min(list!.height, 280) },
  });

  await page.getByTestId("layout-duplicate").click();
  await expect(page.getByTestId("layout-select")).not.toHaveValue("layout-default");
  await page.getByTestId("furniture-sofa").click();
  await expect(page.getByTestId("shared-note")).toContainText("全部の案に共通");
  await page.getByTestId("pos-x").fill("100");
  await page.getByTestId("pos-x").press("Enter");
  await page.getByTestId("layout-compare").click();
  await expect(page.getByTestId("compare-left")).toBeVisible();
  await expect(page.getByTestId("compare-right")).toBeVisible();
  await expect(page.getByTestId("view-2d")).toHaveCount(0);
  await expect(page.getByTestId("diff-moved-sofa")).toBeVisible();
  await expect(page.getByTestId("issue-compare")).toBeVisible();
  await expect(page.getByTestId("clearance-compare")).toBeVisible();
  const left = await page.getByTestId("compare-left").boundingBox();
  const right = await page.getByTestId("compare-right").boundingBox();
  expect(left && right).toBeTruthy();
  expect(left!.x + left!.width).toBeLessThanOrEqual(right!.x + 2);
  await page.screenshot({ path: `${outDir}/layout-pc-compare-1440.png` });

  await page.setViewportSize({ width: 1024, height: 768 });
  const ipadList = await page.locator(".list-panel").boundingBox();
  const ipadStage = await page.getByTestId("stage").boundingBox();
  const ipadInspector = await page.getByTestId("inspector").boundingBox();
  expect(ipadList && ipadStage && ipadInspector).toBeTruthy();
  expect(ipadList!.x).toBeLessThan(ipadStage!.x);
  expect(ipadStage!.x + ipadStage!.width).toBeLessThanOrEqual(ipadInspector!.x + 2);
  await expect(page.getByTestId("phone-tabs")).toBeHidden();
  await page.screenshot({ path: `${outDir}/layout-ipad-compare-1024.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("phone-tabs")).toBeVisible();
  const phoneStage = await page.getByTestId("stage").boundingBox();
  expect(phoneStage).toBeTruthy();
  expect(phoneStage!.width).toBeGreaterThan(300);
  expect(phoneStage!.height).toBeGreaterThan(300);
  const phoneLeft = await page.getByTestId("compare-left").boundingBox();
  const phoneRight = await page.getByTestId("compare-right").boundingBox();
  expect(phoneLeft && phoneRight).toBeTruthy();
  expect(phoneRight!.y).toBeGreaterThan(phoneLeft!.y + 40);
  await page.getByTestId("phone-tab-furniture").click();
  await expect(page.getByTestId("diff-list")).toBeVisible();
  await page.screenshot({ path: `${outDir}/layout-iphone-compare-390.png` });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("edit-variant").click();
  await expect(page.getByTestId("view-2d")).toBeVisible();
  await page.getByTestId("furniture-sofa").click();
  await page.getByTestId("delete-furniture").click();
  await expect(page.getByTestId("delete-furniture-dialog")).toBeVisible();
  await expect(page.getByTestId("delete-furniture-impact")).toContainText("現在の配置");
  await expect(page.getByTestId("delete-furniture-impact")).toContainText("検討案A");
  await page.getByTestId("delete-furniture-dialog").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${outDir}/layout-delete-confirm-1440.png` });
});
