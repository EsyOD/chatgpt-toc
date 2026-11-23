const assert = require("node:assert/strict");
const test = require("node:test");
const { withPage, openFixture, loadContentScripts } = require("./browser.cjs");

test("Virtualized prompts stay indexed and can be reached after unmounting", () => withPage({ width: 1200, height: 900 }, async (page) => {
  await openFixture(page,
    '<main><div id="scroll" style="height:410px; overflow:auto"><div id="transcript" data-thread-user-message-navigation-content></div></div></main>',
    "/codex/cloud/task/virtual");
  await page.evaluate(() => {
    const scroll = document.getElementById("scroll");
    const list = document.getElementById("transcript");
    for (let i = 0; i < 9; i++) {
      const turn = document.createElement("article");
      turn.dataset.turnKey = "turn-" + i;
      turn.dataset.virtualizedTurn = "";
      turn.style.height = "205px";
      list.append(turn);
    }
    const update = () => {
      for (const [i, turn] of Array.from(list.children).entries()) {
        const visible = i * 205 < scroll.scrollTop + scroll.clientHeight && (i + 1) * 205 > scroll.scrollTop;
        if (visible && !turn.firstElementChild) {
          const bubble = document.createElement("div");
          bubble.dataset.userMessageBubble = "";
          bubble.textContent = i === 1 || i === 2 ? "Repeated prompt" : "Prompt " + (i + 1);
          turn.append(bubble);
        } else if (!visible && turn.firstElementChild) {
          turn.firstElementChild.remove();
        }
      }
    };
    scroll.addEventListener("scroll", update);
    scroll.scrollTop = 615;
    update();
  });
  await loadContentScripts(page);
  await page.getByRole("button", { name: "提问目录", exact: true }).click();
  await page.getByRole("button", { name: "Prompt 4" }).waitFor();
  const labels = page.locator(".question-label");
  assert.deepEqual(await labels.allTextContents(), ["Prompt 4", "Prompt 5"]);
  await page.locator("#scroll").evaluate(element => element.scrollTop = 1025);
  await page.getByRole("button", { name: "Prompt 7" }).waitFor();
  assert.deepEqual(await labels.allTextContents(), ["Prompt 4", "Prompt 5", "Prompt 6", "Prompt 7"]);
  await page.locator("#scroll").evaluate(element => element.scrollTop = 615);
  await page.getByRole("button", { name: "读取完整对话" }).click();
  await page.getByRole("button", { name: "读取完整对话" }).waitFor();
  await page.waitForFunction(() => document.getElementById("scroll").scrollTop === 615);
  assert.deepEqual(await labels.allTextContents(), ["Prompt 1", "Repeated prompt", "Repeated prompt", "Prompt 4", "Prompt 5", "Prompt 6", "Prompt 7", "Prompt 8", "Prompt 9"]);
  assert.equal(await page.locator(".count").textContent(), "已读取 9 条提问");
  await page.getByRole("button", { name: "Prompt 1", exact: true }).click();
  await page.waitForFunction(() => document.getElementById("scroll").scrollTop <= 2 &&
    document.querySelector('[data-turn-key="turn-0"] [data-user-message-bubble]'));
  assert.equal(await labels.count(), 9);
  await page.evaluate(() => {
    history.pushState({}, "", "/codex/cloud/task/other");
    document.querySelector("main").innerHTML = '<div data-message-author-role="user">New task</div>';
  });
  await page.getByRole("button", { name: "New task" }).waitFor();
  assert.deepEqual(await labels.allTextContents(), ["New task"]);
}));

test("A prompt keeps one entry when its message ID arrives or its turn is rendered twice", () =>
  withPage({ width: 1200, height: 900 }, async (page) => {
    await openFixture(page, `
      <main data-thread-user-message-navigation-content>
        <article id="original" data-turn-key="first" data-virtualized-turn>
          <div data-user-message-bubble>同样的问题</div>
          <div data-user-message-bubble>同样的问题</div>
        </article>
      </main>`, "/codex/cloud/task/identities");
    await loadContentScripts(page);
    await page.getByRole("button", { name: "提问目录", exact: true }).click();
    const rows = page.locator(".question-label");
    assert.deepEqual(await rows.allTextContents(), ["同样的问题", "同样的问题"]);

    await page.evaluate(() => {
      const old = document.querySelector("#original");
      const replacement = old.cloneNode(true);
      replacement.id = "replacement";
      Array.from(replacement.children).forEach((bubble, i) => { bubble.dataset.messageId = "sent-" + i; });
      old.replaceWith(replacement);
      document.querySelector("main").insertAdjacentHTML("beforeend", `
        <article data-turn-key="second"><div data-user-message-bubble>后续问题</div></article>`);
    });
    await page.getByRole("button", { name: "后续问题", exact: true }).waitFor();
    assert.deepEqual(await rows.allTextContents(), ["同样的问题", "同样的问题", "后续问题"]);

    await page.evaluate(() => {
      const clone = document.querySelector("#replacement").cloneNode(true);
      clone.removeAttribute("id");
      for (const bubble of clone.children) bubble.removeAttribute("data-message-id");
      const marker = document.createElement("div");
      marker.dataset.userMessageBubble = "";
      marker.textContent = "再检查一次";
      document.querySelector("main").append(clone, marker);
    });
    await page.getByRole("button", { name: "再检查一次", exact: true }).waitFor();
    assert.deepEqual(await rows.allTextContents(), ["同样的问题", "同样的问题", "后续问题", "再检查一次"]);
  }));
