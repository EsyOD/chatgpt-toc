const assert = require("node:assert/strict");
const test = require("node:test");
const { withPage, openFixture, loadContentScripts } = require("./browser.cjs");

const first = "如何整理研究笔记？";
const second = "Give me three examples of atomic notes.";
const third = "请对比 SQLite 和 PostgreSQL。";
const turn = (id, role, contents) => `<article data-testid="conversation-turn-${id}"><div data-message-id="m-${id}" data-message-author-role="${role}">${contents}</div></article>`;
const reply = (id) => turn(id, "assistant", "ASSISTANT STREAM");
const fixture = `<!doctype html><html lang="zh-CN" class="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { margin: 0; font: 16px system-ui; background: #fafafa; color: #202123 }
.dark body { background: #202124; color: white }
main { max-width: 760px; height: 100dvh; overflow-y: auto; margin: auto }
article { max-width: 560px; margin: 34px auto; padding: 14px 20px; }
article:has([data-message-author-role=user]) { background: #eee; color: #222; border-radius: 16px; }
article:has([data-message-author-role=assistant]) { min-height: 590px; }
</style>
<main>${turn(1, "user", `<div class="whitespace-pre-wrap">${first}<button>编辑</button></div>`)}
${reply(2)}${turn(3, "user", second)}${reply(4)}
<div hidden>${turn(30, "user", "HIDDEN BRANCH")}</div>
${turn(5, "user", third)}${reply(6)}
</main></html>`;

test("ChatGPT and Codex prompts, search, jump, counts and route changes", () => withPage({ width: 1400, height: 900 }, async (page) => {
  await openFixture(page, fixture, "/c/example");
  await loadContentScripts(page);
  const host = page.locator("#chatgpt-question-toc-extension");
  const button = host.getByRole("button", { name: "提问目录" });
  const rows = host.locator(".question-label");
  const search = host.getByRole("searchbox", { name: "搜索提问" });
  const current = host.locator('[aria-current="location"] .question-label');
  const visible = (locator) => locator.waitFor({ state: "visible" });
  const labels = async (expected) => {
    await page.waitForFunction((expected) => {
      const root = document.querySelector("#chatgpt-question-toc-extension")?.shadowRoot;
      const labels = Array.from(root?.querySelectorAll(".question-label") ?? [], (label) => label.textContent);
      return JSON.stringify(labels) === JSON.stringify(expected);
    }, expected);
    assert.deepEqual(await rows.allTextContents(), expected);
  };
  await visible(button);
  assert.equal(await button.locator(".launcher-count").textContent(), "3");
  await button.click();
  await labels([first, second, third]);
  assert.equal(await current.textContent(), first);
  await search.fill("ATOMIC");
  await labels([second]);
  assert.equal(await host.locator(".number").textContent(), "02");
  await host.getByRole("button", { name: second }).click();
  await page.waitForFunction(() => {
    const rect = document.querySelector('[data-message-id="m-3"]').getBoundingClientRect();
    return rect.top >= 60 && rect.top <= 115;
  });
  assert.equal(await current.textContent(), second);
  await search.fill("no matches");
  await labels([]);
  await visible(host.getByText("没有匹配的提问"));
  await search.fill("");
  await page.evaluate(() => { document.documentElement.className = "dark"; });
  await page.waitForFunction(() => document.querySelector("#chatgpt-question-toc-extension").dataset.theme === "dark");
  await page.keyboard.press("Escape");
  await visible(button);
  assert.equal(await button.evaluate(el => el.getRootNode().activeElement === el), true);
  await button.click();
  await page.locator("main").evaluate((main, html) => main.insertAdjacentHTML("beforeend", html),
    turn(7, "user", "下一条提问") + reply(8) + turn(9, "user", '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">'));
  await labels([first, second, third, "下一条提问", "附件消息"]);
  await page.locator('[data-message-id="m-7"]').evaluate((el) => { el.firstChild.data = "修改后的提问"; });
  await labels([first, second, third, "修改后的提问", "附件消息"]);
  await page.locator('[data-message-id="m-7"]').evaluate((el) => { el.dataset.messageAuthorRole = "assistant"; });
  await labels([first, second, third, "附件消息"]);
  await search.fill("SQLite");
  await labels([third]);
  await page.evaluate((html) => {
    history.pushState({}, "", "/c/next");
    document.querySelector("main").innerHTML = html;
  }, turn(11, "user", "切换对话") + reply(12) + turn(13, "user", "窄屏测试") + reply(14));
  await labels(["切换对话", "窄屏测试"]);
  assert.equal(await search.inputValue(), "");
  await page.setViewportSize({ width: 390, height: 740 });
  const panel = await host.locator(".panel").boundingBox();
  assert.ok(panel.x >= 0 && panel.x + panel.width <= 390);
  await host.getByRole("button", { name: "窄屏测试" }).click();
  await visible(button);
  await page.waitForFunction(() => document.querySelector("main").scrollTop > 400);
  await button.click();
  await page.evaluate(() => { document.querySelector("main").replaceChildren(); });
  await visible(host.getByText("暂未识别到提问"));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.evaluate(() => {
    history.pushState({}, "", "/codex/cloud/task/test");
    document.querySelector("main").innerHTML = `
      <div inert><section data-thread-user-message-navigation-content><div data-user-message-bubble>Hidden thread</div></section></div>
      <div data-rail-chat-transcript><section data-thread-user-message-navigation-content><div data-user-message-bubble>Side conversation</div></section></div>
      <section data-thread-user-message-navigation-content style="min-height: 1600px">
        <article data-turn-transcript>
          <div data-user-message-bubble><p>Codex 初始提问</p><div data-markdown-copy="exclude">操作控件</div></div>
          <div style="height: 570px" data-markdown-text-style="assistant-message">Codex 回复</div>
          <div data-user-message-bubble>Codex 补充指令</div>
        </article>
        <article data-turn-transcript><div data-user-message-bubble><div data-user-message-file-icon></div></div></article>
      </section>`;
  });
  await labels(["Codex 初始提问", "Codex 补充指令", "附件消息"]);
  await search.fill("补充");
  await labels(["Codex 补充指令"]);
  await host.getByRole("button", { name: "Codex 补充指令" }).click();
  await page.waitForFunction(() => {
    const element = Array.from(document.querySelectorAll("[data-user-message-bubble]"))
      .find((element) => element.textContent === "Codex 补充指令");
    return element?.getBoundingClientRect().top >= 60 && element.getBoundingClientRect().top <= 115;
  });
  assert.equal(await current.textContent(), "Codex 补充指令");
  await search.fill("");
  const activeTranscript = page.locator("section[data-thread-user-message-navigation-content]").last();
  await activeTranscript.evaluate((element) => {
    element.querySelector("article:last-child [data-user-message-bubble]").remove();
    element.insertAdjacentHTML("beforeend", '<div data-user-message-bubble>Codex 新提问</div>');
  });
  await labels(["Codex 初始提问", "Codex 补充指令", "Codex 新提问"]);
  await activeTranscript.evaluate((element) => { element.lastElementChild.remove(); });
  await labels(["Codex 初始提问", "Codex 补充指令"]);
  await page.evaluate(() => {
    history.pushState({}, "", "/c/new-layout");
    document.querySelector("main").outerHTML = `
      <main hidden><article data-turn="user">隐藏对话</article></main>
      <div role="main" style="height: 100dvh; overflow: auto">
        <article data-turn="user" data-testid="conversation-turn-1">如何使用 <code><span>git</span> <span>status</span></code>？</article>
        <article data-turn="assistant" style="height: 650px">助手回复</article>
        <article data-turn="user" data-testid="conversation-turn-3">
          <div data-message-author-role="user" data-message-id="one">保留 <code>ＦＯＯ</code></div>
          <button>编辑</button>
        </article>
        <div data-rail-chat-transcript><article data-turn="user">侧栏消息</article></div>
      </div>`;
    document.documentElement.className = "";
    document.body.dataset.theme = "dark";
  });
  await labels(["如何使用 git status？", "保留 ＦＯＯ"]);
  assert.deepEqual(await host.locator(".question-label code").allTextContents(), ["git status", "ＦＯＯ"]);
  await search.fill("foo");
  await labels(["保留 ＦＯＯ"]);
  assert.equal(await host.getAttribute("data-theme"), "dark");
  await search.fill("");
  await page.keyboard.press("Escape");
  await visible(button);
  await page.evaluate(() => { document.querySelector('[role="main"]').remove(); });
  await visible(button);
  await page.evaluate(() => { history.pushState({}, "", "/settings"); });
  await button.waitFor({ state: "hidden" });
  const seven = ["第一条", "第二条", "第三条", "第四条", "第五条", "第六条", "第七条"];
  await page.evaluate((seven) => {
    history.pushState({}, "", "/codex/cloud/task/seven");
    document.querySelector("main").outerHTML = `
      <main>
        <section data-testid="conversation-turn-shared">
          <div data-message-author-role="user">${seven[0]}</div>
          <div data-message-author-role="user">${seven[1]}</div>
        </section>
        <section data-thread-user-message-navigation-content>
          <article data-turn="user">
            <div data-user-message-bubble>${seven[2]}</div>
            <div data-user-message-bubble>${seven[3]}</div>
          </article>
          <article data-turn-transcript>
            <div data-user-message-bubble>${seven[4]}</div>
            <div data-markdown-text-style="assistant-message" style="height: 1800px">不计入</div>
          </article>
        </section>
        <section data-rail-chat-transcript><div data-message-author-role="user">侧栏</div></section>
        <article data-turn-transcript style="content-visibility:auto; contain-intrinsic-size: 80px">
          <div data-user-message-bubble>${seven[5]}</div>
        </article>
        <article data-turn="user"><div data-message-author-role="user" data-message-id="last">${seven[6]}</div></article>
        <article><div data-message-author-role="user" data-message-id="last">${seven[6]}</div></article>
      </main>`;
  }, seven);
  await visible(button);
  await button.click();
  await labels(seven);
  assert.equal(await host.locator(".count").textContent(), "本对话共 7 条提问");
  await search.fill("第七");
  await labels(["第七条"]);
  assert.equal(await host.locator(".count").textContent(), "1 / 7 条提问");
}));

test("Codex task detects the active side transcript", () =>
  withPage({ width: 1200, height: 900 }, async (page) => {
    await openFixture(page, `
      <main>任务产物</main>
      <aside data-app-shell-focus-area="right-panel">
        <section data-app-shell-active-page="false" data-rail-chat-transcript>
          <div data-user-message-bubble>其他任务的提问</div>
        </section>
        <section id="task" data-app-shell-active-page="true" data-rail-chat-transcript
          style="height: 350px; overflow: auto">
          <article data-turn-transcript><div data-user-message-bubble>任务首条提问</div></article>
          <div style="height: 650px">助手回复</div>
          <article data-turn-transcript><div data-user-message-bubble>任务后续追问</div></article>
          <div style="height: 500px"></div>
        </section>
      </aside>`, "/codex/cloud/task/side-panel");
    await loadContentScripts(page);

    await page.getByRole("button", { name: "提问目录", exact: true }).click();
    const rows = page.locator(".question-label");
    assert.deepEqual(await rows.allTextContents(), ["任务首条提问", "任务后续追问"]);

    await page.getByRole("button", { name: "任务后续追问" }).click();
    await page.waitForFunction(() => document.querySelector("#task").scrollTop > 500);

    await page.evaluate(() => {
      const rails = document.querySelectorAll("[data-rail-chat-transcript]");
      rails[0].dataset.appShellActivePage = "true";
      rails[1].dataset.appShellActivePage = "false";
    });
    await page.getByRole("button", { name: "其他任务的提问", exact: true }).waitFor();
    assert.deepEqual(await rows.allTextContents(), ["其他任务的提问"]);
  }));
