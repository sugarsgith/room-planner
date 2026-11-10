import { expect, test } from "@playwright/test";

test("manifest and service worker are available in the production build", async ({ page }) => {
  const response = await page.request.get("./manifest.webmanifest");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"] ?? "").toMatch(/manifest\+json|application\/json/);
  const manifest = await response.json();
  expect(manifest.name).toBe("部屋プランナー");
  expect(manifest.short_name).toBe("部屋プランナー");
  expect(manifest.display).toBe("standalone");
  expect(manifest.theme_color).toBe("#f4f0e8");
  expect(manifest.background_color).toBe("#f4f0e8");
  expect(manifest.start_url).toBe("./");
  expect(manifest.scope).toBe("./");
  const icons = manifest.icons as { src: string; sizes: string; purpose?: string }[];
  expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(icons.some((icon) => (icon.purpose ?? "").includes("maskable"))).toBe(true);
  expect(icons.every((icon) => !icon.src.startsWith("/"))).toBe(true);
  for (const icon of icons) {
    const iconUrl = new URL(icon.src, response.url());
    const iconResponse = await page.request.get(iconUrl.toString());
    expect(iconResponse.ok()).toBeTruthy();
  }

  await page.goto("./");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.webmanifest/);
  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    return { scope: ready.scope, script: ready.active?.scriptURL ?? "" };
  });
  expect(registration.scope).toBe("http://127.0.0.1:4173/");
  expect(registration.script).toContain("sw.js");
  expect(new URL(registration.script).pathname.endsWith("/sw.js")).toBe(true);
});

test("update banner stays until the user chooses to reload", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("./");
  await expect(page.getByTestId("view-2d")).toBeVisible();
  await expect(page.getByTestId("update-banner")).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem("room-planner.pwa-sentinel", "still-here"));
  await page.evaluate(() => window.dispatchEvent(new Event("room-planner-update-available")));
  await expect(page.getByTestId("update-banner")).toBeVisible();
  await expect(page.getByTestId("update-banner")).toContainText("新しい版があります");
  await expect(page.getByTestId("update-apply")).toHaveText("更新");
  const list = await page.locator(".list-panel").boundingBox();
  const view = await page.getByTestId("view-2d").boundingBox();
  const inspector = await page.getByTestId("inspector").boundingBox();
  expect(list && view && inspector).toBeTruthy();
  expect(list!.x).toBeLessThan(view!.x);
  expect(view!.x + view!.width).toBeLessThanOrEqual(inspector!.x + 2);
  await page.screenshot({ path: "/opt/cursor/artifacts/pwa-update-banner.png" });

  const reloaded = page.waitForEvent("load");
  await page.getByTestId("update-apply").click();
  await reloaded;
  expect(await page.evaluate(() => localStorage.getItem("room-planner.pwa-sentinel"))).toBe("still-here");
});
