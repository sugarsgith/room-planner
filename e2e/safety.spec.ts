import { expect, test } from "@playwright/test";

const room = {
  id: "room-main",
  name: "自分の部屋",
  width: 2.7,
  depth: 3.6,
  ceilingHeight: 2.4,
  outline: [
    { x: 0, z: 0 },
    { x: 2.7, z: 0 },
    { x: 2.7, z: 3.6 },
    { x: 0, z: 3.6 },
  ],
  openings: [] as unknown[],
  fixtures: [] as unknown[],
};

test("import asks before replacing, and a bad file changes nothing", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./");
  await expect(page.getByTestId("room-name")).toHaveValue("自分の部屋");

  await page.getByTestId("import-file").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(page.getByTestId("import-confirm")).toHaveCount(0);
  await expect(page.getByTestId("import-error")).toBeVisible();
  await expect(page.getByTestId("room-name")).toHaveValue("自分の部屋");

  await page.getByTestId("import-file").setInputFiles({
    name: "room.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(version1("読み込み前の確認"))),
  });
  await expect(page.getByTestId("import-confirm-message")).toHaveText("この端末の記録を、ファイルの内容に置き換えます。");
  await page.getByTestId("import-confirm-cancel").click();
  await expect(page.getByTestId("import-confirm")).toHaveCount(0);
  await expect(page.getByTestId("room-name")).toHaveValue("自分の部屋");

  await page.getByTestId("import-file").setInputFiles({
    name: "room.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(version1("昔の部屋"))),
  });
  await page.getByTestId("import-confirm-accept").click();
  await expect(page.getByTestId("room-name")).toHaveValue("昔の部屋");
  await expect(page.getByTestId("furniture-bed")).toContainText("古いベッド");

  await page.getByTestId("import-file").setInputFiles({
    name: "sized.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(version5WithSize())),
  });
  await page.getByTestId("import-confirm-accept").click();
  const saved = await page.evaluate(() => localStorage.getItem("room-planner.project.v1") ?? "");
  const document = JSON.parse(saved) as { schemaVersion: number; storedItems: { name: string; width: number }[] };
  expect(document.schemaVersion).toBe(5);
  expect(document.storedItems[0].name).toBe("小さい箱");
  expect(document.storedItems[0].width).toBeCloseTo(0.2);

  await page.getByTestId("work-mode-storage").click();
  await page.getByTestId("storage-unit-shelf").click();
  await expect(page.locator("[data-testid^='item-fit-']")).toHaveText("入る");
});

test("a failed load cannot overwrite until the raw text is exported", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("room-planner.project.v1", "{\"schemaVersion\":1,\"broken\":true}");
  });
  await page.goto("./");
  await expect(page.getByTestId("corrupt-banner")).toBeVisible();
  await expect(page.getByTestId("corrupt-resume")).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem("room-planner.project.v1"))).toContain("broken");

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("corrupt-export").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("backup");
  await expect(page.getByTestId("corrupt-resume")).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem("room-planner.project.v1"))).toContain("broken");

  await page.getByTestId("corrupt-resume").click();
  await expect(page.getByTestId("corrupt-banner")).toHaveCount(0);
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem("room-planner.project.v1") ?? "{}")) as {
    schemaVersion: number;
  };
  expect(saved.schemaVersion).toBe(5);
});

test("export reminder appears until a file is written, and a dismissal lasts across reload", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByTestId("export-reminder")).toContainText("まだファイルに書き出していません");
  await page.getByTestId("export-reminder-later").click();
  await expect(page.getByTestId("export-reminder")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("export-reminder")).toHaveCount(0);
});

test("an old export asks again, and writing a file clears the note", async ({ page }) => {
  await page.addInitScript(() => {
    const day = 24 * 60 * 60 * 1000;
    localStorage.setItem(
      "room-planner.export-reminder.v1",
      JSON.stringify({ lastExportedAt: Date.now() - 40 * day, dismissedAt: Date.now() - 8 * day }),
    );
  });
  await page.goto("./");
  await expect(page.getByTestId("export-reminder")).toContainText("40日前");
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-reminder-go").click();
  await downloadPromise;
  await expect(page.getByTestId("export-reminder")).toHaveCount(0);
  const stored = JSON.parse(
    await page.evaluate(() => localStorage.getItem("room-planner.export-reminder.v1") ?? "{}"),
  ) as { lastExportedAt?: number };
  expect(stored.lastExportedAt).toBeGreaterThan(Date.now() - 60_000);
});

function version1(name: string) {
  return {
    schemaVersion: 1,
    app: "room-planner",
    room: { ...room, name, fixtures: undefined },
    activeLayoutId: "layout-default",
    layouts: [
      {
        id: "layout-default",
        name: "現在の配置",
        furniture: [
          {
            id: "bed",
            name: "古いベッド",
            shape: "box",
            width: 1,
            depth: 2,
            height: 0.4,
            color: "#7d8fa3",
            x: 1,
            z: 2,
            rotation: 0,
          },
        ],
      },
    ],
  };
}

function version5WithSize() {
  return {
    schemaVersion: 5,
    app: "room-planner",
    room,
    furniture: [
      {
        id: "shelf",
        name: "棚",
        shape: "box",
        width: 0.9,
        depth: 0.4,
        height: 1.8,
        color: "#8d6e63",
        spaces: [{ id: "middle", name: "中段", width: 0.8, depth: 0.35, height: 0.3, note: "" }],
      },
    ],
    storedItems: [
      { id: "small", name: "小さい箱", quantity: 1, spaceId: "middle", note: "", width: 0.2, depth: 0.2, height: 0.1 },
    ],
    layouts: [
      {
        id: "layout-default",
        name: "現在の配置",
        placements: [
          { furnitureId: "shelf", x: 1, z: 1, rotation: 0, elevation: 0, allowOverlapIds: [] },
        ],
      },
    ],
    activeLayoutId: "layout-default",
    baselineLayoutId: "layout-default",
  };
}
