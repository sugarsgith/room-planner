import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";

test.beforeAll(() => {
  mkdirSync(outDir, { recursive: true });
});

test("a normal browser tab does not add a status-bar gap", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await expect(page.locator("html")).not.toHaveClass(/standalone/);
  const toolbar = await page.locator(".toolbar").boundingBox();
  expect(toolbar).toBeTruthy();
  expect(toolbar!.y).toBeLessThan(16);
  const list = await page.locator(".list-panel").boundingBox();
  const view = await page.getByTestId("stage").boundingBox();
  expect(list && view).toBeTruthy();
  expect(view!.y).toBeLessThan(list!.y);
});

test("home-screen insets keep the header below the status bar", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "standalone", { configurable: true, get: () => true });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.evaluate(() => {
    const style = document.documentElement.style;
    style.setProperty("--safe-area-top", "59px");
    style.setProperty("--safe-area-right", "0px");
    style.setProperty("--safe-area-bottom", "34px");
    style.setProperty("--safe-area-left", "0px");
  });
  await expect(page.locator("html")).toHaveClass(/standalone/);
  expect(await page.locator('meta[name="viewport"]').getAttribute("content")).toContain("viewport-fit=cover");
  await page.getByTestId("export-reminder-later").click();
  await page.getByTestId("work-mode-storage").click();

  const toolbar = await page.locator(".toolbar").boundingBox();
  const status = await page.locator(".status").boundingBox();
  expect(toolbar && status).toBeTruthy();
  expect(toolbar!.y).toBeGreaterThanOrEqual(59);
  expect(toolbar!.y).toBeLessThan(59 + 8);
  expect(status!.y + status!.height).toBeLessThanOrEqual(844 - 34 + 1);
  await page.screenshot({ path: `${outDir}/iphone-safe-area-portrait.png` });

  await page.evaluate(() => {
    const style = document.documentElement.style;
    style.setProperty("--safe-area-top", "0px");
    style.setProperty("--safe-area-right", "47px");
    style.setProperty("--safe-area-bottom", "21px");
    style.setProperty("--safe-area-left", "47px");
  });
  await page.setViewportSize({ width: 844, height: 390 });
  const landscapeBar = await page.locator(".toolbar").boundingBox();
  const landscapeStatus = await page.locator(".status").boundingBox();
  expect(landscapeBar && landscapeStatus).toBeTruthy();
  expect(landscapeBar!.x).toBeGreaterThanOrEqual(47);
  expect(landscapeBar!.x + landscapeBar!.width).toBeLessThanOrEqual(844 - 47 + 1);
  expect(landscapeStatus!.y + landscapeStatus!.height).toBeLessThanOrEqual(390 - 21 + 1);
  await page.screenshot({ path: `${outDir}/iphone-safe-area-landscape.png` });
});

test("iPad width stays three columns without a standalone inset", async ({ page }) => {
  await openPlain(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  const list = await page.locator(".list-panel").boundingBox();
  const view = await page.getByTestId("stage").boundingBox();
  const inspector = await page.getByTestId("inspector").boundingBox();
  expect(list && view && inspector).toBeTruthy();
  expect(list!.x).toBeLessThan(view!.x);
  expect(view!.x + view!.width).toBeLessThanOrEqual(inspector!.x + 2);
  const toolbar = await page.locator(".toolbar").boundingBox();
  expect(toolbar!.y).toBeLessThan(16);
});

async function openPlain(page: Page) {
  await page.goto("./");
  await expect(page.locator("html")).not.toHaveClass(/standalone/);
}
