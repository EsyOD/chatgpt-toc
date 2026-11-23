const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { chromium } = require("playwright");

const extension = resolve(__dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(extension, "manifest.json"), "utf8"));
const source = manifest.content_scripts[0].js
  .map((name) => readFileSync(resolve(extension, name), "utf8"))
  .join("\n");

async function withPage(viewport, run) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
  try {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await run(page);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}

async function openFixture(page, body, path) {
  await page.route("https://chatgpt.com/**", (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body }));
  await page.goto(`https://chatgpt.com${path}`);
}

// Run the manifest's content scripts in order against a local HTML fixture.
async function loadContentScripts(page) {
  await page.evaluate(source);
}

module.exports = { withPage, openFixture, loadContentScripts };
