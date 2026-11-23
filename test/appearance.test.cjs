const assert = require("node:assert/strict");
const test = require("node:test");
const { withPage, openFixture, loadContentScripts } = require("./browser.cjs");

async function openAppearanceFixture(page) {
  await page.addInitScript(() => {
    const listeners = [];
    const store = () => JSON.parse(localStorage.getItem("test-appearance") || "{}");
    const save = (value, changes) => {
      localStorage.setItem("test-appearance", JSON.stringify(value));
      for (const listener of listeners) listener(changes, "local");
    };
    window.chrome ??= {};
    window.chrome.storage = {
      local: {
        get: async () => store(),
        set: async (update) => save({ ...store(), ...update }, Object.fromEntries(
          Object.entries(update).map(([key, newValue]) => [key, { newValue }]))),
        remove: async (keys) => {
          const state = store();
          const changes = {};
          for (const key of keys) {
            changes[key] = { oldValue: state[key] };
            delete state[key];
          }
          save(state, changes);
        },
      },
      onChanged: { addListener: listener => listeners.push(listener) },
    };
  });
  const prompts = Array.from({ length: 30 }, (_, i) => '<article data-turn="user">Prompt ' + (i + 1) + '</article>').join("");
  await openFixture(page, "<main>" + prompts + "</main>", "/c/example");
  assert.equal(await page.evaluate(() => typeof window.chrome?.storage?.local.get), "function");
  await loadContentScripts(page);
  const host = page.locator("#chatgpt-question-toc-extension");
  return {
    host,
    launcher: page.getByRole("button", { name: "提问目录", exact: true }),
    panel: host.locator(".panel"),
    settings: page.getByRole("button", { name: "外观设置" }),
  };
}

async function setNarrowViewport(page) {
  await page.setViewportSize({ width: 360, height: 560 });
  // The extension clamps its position on resize and ResizeObserver callbacks.
  await page.waitForFunction(() => {
    const { left, top, right, bottom } = document.getElementById("chatgpt-question-toc-extension")
      .shadowRoot.querySelector(".panel").getBoundingClientRect();
    return innerWidth === 360 && innerHeight === 560 &&
      left >= 0 && top >= 0 && right <= innerWidth + 1 && bottom <= innerHeight + 1;
  });
}

test("Appearance settings persist, fit narrow windows and reset", () => withPage({ width: 1180, height: 850 }, async (page) => {
  const { host, launcher, panel, settings } = await openAppearanceFixture(page);
  const size = async (name, value) => {
    const control = page.getByRole("spinbutton", { name });
    await control.fill(value);
    await control.press("Tab");
  };
  await launcher.click();
  assert.equal((await panel.boundingBox()).width, 350);
  await settings.click();
  await page.getByRole("combobox", { name: "停靠位置" }).selectOption("top-left");
  await size("宽度（px）", "480");
  await size("最大高度（px）", "420");
  await size("水平边距（px）", "70");
  await size("垂直边距（px）", "65");
  await page.keyboard.press("Escape");
  let bounds = await panel.boundingBox();
  assert.deepEqual([bounds.x, bounds.y, bounds.width, bounds.height], [70, 65, 480, 420]);
  await page.reload();
  await loadContentScripts(page);
  await page.waitForFunction(() => document.getElementById("chatgpt-question-toc-extension").dataset.position === "top-left");
  await launcher.click();
  bounds = await panel.boundingBox();
  assert.deepEqual([bounds.x, bounds.y, bounds.width, bounds.height], [70, 65, 480, 420]);
  await setNarrowViewport(page);
  await settings.click();
  await page.getByRole("combobox", { name: "停靠位置" }).selectOption("bottom-left");
  await page.getByRole("combobox", { name: "停靠位置" }).selectOption("top-right");
  bounds = await panel.boundingBox();
  assert.ok(bounds.x + bounds.width <= 360 && bounds.y === 65);
  await page.getByRole("button", { name: "恢复默认" }).click();
  await page.keyboard.press("Escape");
  assert.equal(await host.getAttribute("data-position"), "bottom-right");
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("test-appearance"))), {});
  await page.getByRole("searchbox", { name: "搜索提问" }).fill("Prompt 30");
  assert.equal(await page.locator(".question").count(), 1);
}));

test("Pointer and keyboard move or resize the directory", () => withPage({ width: 1180, height: 850 }, async (page) => {
  const { host, launcher, panel, settings } = await openAppearanceFixture(page);
  const grip = page.getByRole("button", { name: "调整面板大小" });
  const drag = async (locator, dx, dy) => {
    const bounds = await locator.boundingBox();
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
    await page.mouse.up();
  };
  await launcher.click();
  assert.equal((await panel.boundingBox()).width, 350);
  await drag(grip, -90, -50);
  let bounds = await panel.boundingBox();
  assert.deepEqual([bounds.width, bounds.height], [440, 570]);
  assert.equal(bounds.x + bounds.width, 1156);
  assert.equal(bounds.y + bounds.height, 826);
  const beforeDrag = bounds;
  await drag(panel.locator("h2"), -250, -120);
  bounds = await panel.boundingBox();
  assert.deepEqual([bounds.x, bounds.y], [beforeDrag.x - 250, beforeDrag.y - 120]);
  assert.equal(await host.getAttribute("data-position"), "free");
  await drag(grip, 90, 60);
  bounds = await panel.boundingBox();
  assert.deepEqual([bounds.x, bounds.y, bounds.width, bounds.height], [466, 136, 530, 630]);
  await page.reload();
  await loadContentScripts(page);
  await page.waitForFunction(() => document.getElementById("chatgpt-question-toc-extension").dataset.position === "free");
  await launcher.click();
  bounds = await panel.boundingBox();
  assert.deepEqual([bounds.x, bounds.y, bounds.width, bounds.height], [466, 136, 530, 630]);
  await grip.press("ArrowLeft");
  assert.equal((await panel.boundingBox()).width, 522);
  await page.getByRole("button", { name: "收起目录" }).click();
  const closed = await launcher.boundingBox();
  await drag(launcher, -100, -80);
  assert.equal(await panel.isVisible(), false);
  const moved = await launcher.boundingBox();
  assert.deepEqual([moved.x, moved.y], [closed.x - 100, closed.y - 80]);
  await launcher.click();
  assert.equal(await panel.isVisible(), true);
  await setNarrowViewport(page);
  await settings.click();
  assert.equal(await page.getByRole("combobox", { name: "停靠位置" }).inputValue(), "free");
  await page.getByRole("button", { name: "恢复默认" }).click();
  await page.keyboard.press("Escape");
  assert.equal(await host.getAttribute("data-position"), "bottom-right");
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("test-appearance"))), {});
}));
