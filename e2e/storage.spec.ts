import { expect, test } from "@playwright/test";

const outDir = "/opt/cursor/artifacts";

test("storage spaces stay on the furniture and show on phone", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await page.getByTestId("furniture-bed").click();
  await page.getByTestId("storage-name").fill("ベッド下");
  await page.getByTestId("storage-width").fill("90");
  await page.getByTestId("storage-depth").fill("190");
  await page.getByTestId("storage-height").fill("20");
  await page.getByTestId("storage-note").fill("衣装ケース");
  await page.getByTestId("storage-add").click();
  await expect(page.getByText("ベッド下 90.0 × 190.0 × 20.0 cm")).toBeVisible();
  await page.getByTestId("stored-name").fill("衣装ケース");
  await page.getByTestId("stored-qty").fill("2");
  await page.getByTestId("stored-add").click();
  await expect(page.getByTestId("storage-index")).toContainText("衣装ケース × 2");
  await page.getByTestId("storage-section").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${outDir}/storage-pc-1440.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("phone-tab-edit").click();
  await expect(page.getByTestId("storage-section")).toBeVisible();
  await page.getByTestId("storage-section").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${outDir}/storage-iphone-390.png` });
});
