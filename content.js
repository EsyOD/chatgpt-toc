(() => {
  "use strict";

  const HOST_ID = "chatgpt-question-toc-extension";
  const CHATGPT_MESSAGE = '[data-message-author-role="user"]';
  const CODEX_TRANSCRIPT = "[data-thread-user-message-navigation-content]";
  const CODEX_MESSAGE = "[data-user-message-bubble]";
  const MESSAGE_MARKERS = `${CHATGPT_MESSAGE}, ${CODEX_MESSAGE}`;
  const USER_MESSAGE = `${CHATGPT_MESSAGE}, ${CODEX_TRANSCRIPT} ${CODEX_MESSAGE}`;
  const EXCLUDED_TEXT = 'button, [role="button"], [aria-hidden="true"], [hidden], .sr-only, [data-markdown-copy="exclude"], script, style, svg';
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: "open" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CHATGPT_QUESTION_TOC_STYLES);
  root.adoptedStyleSheets = [sheet];
  root.innerHTML = `
    <button class="launcher" type="button" aria-expanded="false" aria-controls="question-panel">
      <span class="index-icon" aria-hidden="true"><i></i><i></i><i></i></span>
      <span>提问目录</span>
      <span class="launcher-count" aria-hidden="true"></span>
    </button>
    <section class="panel" id="question-panel" aria-labelledby="panel-title" hidden>
      <header>
        <div class="title-icon" aria-hidden="true">
          <span class="index-icon"><i></i><i></i><i></i></span>
        </div>
        <div class="heading">
          <h2 id="panel-title">提问目录</h2>
          <p class="count"></p>
        </div>
        <button class="close" type="button" aria-label="收起目录" title="收起目录">
          <span aria-hidden="true"></span>
        </button>
      </header>
      <label class="search">
        <span class="search-icon" aria-hidden="true"></span>
        <input type="search" aria-label="搜索提问" placeholder="搜索提问…" autocomplete="off" spellcheck="false">
      </label>
      <div class="results">
        <ol class="questions" aria-label="本对话的提问"></ol>
        <p class="empty" role="status" hidden></p>
      </div>
    </section>`;
  document.documentElement.append(host);

  const launcher = root.querySelector(".launcher");
  const launcherCount = root.querySelector(".launcher-count");
  const panel = root.querySelector(".panel");
  const closeButton = root.querySelector(".close");
  const count = root.querySelector(".count");
  const search = root.querySelector("input");
  const list = root.querySelector("ol");
  const empty = root.querySelector(".empty");
  const rows = new Map();
  const systemTheme = matchMedia("(prefers-color-scheme: dark)");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const turnSelector = 'article[data-testid^="conversation-turn"], [data-testid^="conversation-turn-"]';

  let messages = [];
  let activeKey = null;
  let currentUrl = location.href;
  let refreshFrame = 0;
  let scrollFrame = 0;

  function updateTheme() {
    const page = document.documentElement;
    const theme = page.getAttribute("data-theme");
    const dark = page.classList.contains("dark") || theme === "dark";
    const light = page.classList.contains("light") || theme === "light";
    host.dataset.theme = dark || (!light && systemTheme.matches) ? "dark" : "light";
  }

  function isVisible(element) {
    return element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility === "visible" &&
      !element.closest('[hidden], [inert], [aria-hidden="true"]');
  }

  function questionLabel(element) {
    const textBlocks = element.querySelectorAll(".whitespace-pre-wrap");
    const sources = textBlocks.length ? Array.from(textBlocks) : [element];
    const label = sources.map((source) => {
      const copy = source.cloneNode(true);
      copy.querySelectorAll(EXCLUDED_TEXT).forEach((child) => child.remove());
      copy.querySelectorAll("br").forEach((lineBreak) => lineBreak.replaceWith(" "));
      copy.querySelectorAll("div, p, li, pre, blockquote").forEach((block) => block.append(" "));
      return copy.textContent.replace(/\s+/gu, " ").trim();
    }).filter(Boolean).join(" ");
    if (label) return label;

    const media = element.closest(turnSelector) ?? element;
    const filename = media.querySelector("[download]")?.getAttribute("download");
    if (filename) return filename;
    if (media.querySelector("img, video, audio, [data-testid*='attachment'], [data-testid*='file'], [data-user-message-file-icon]")) {
      return "附件消息";
    }
    return "未命名提问";
  }

  function collectMessages() {
    const found = [];
    const seen = new Set();
    const main = document.querySelector("main") ?? document;
    const codexTranscripts = Array.from(document.querySelectorAll(CODEX_TRANSCRIPT)).filter((transcript) =>
      isVisible(transcript) && !transcript.closest("[data-rail-chat-transcript]") &&
      Array.from(transcript.querySelectorAll(CODEX_MESSAGE)).some(isVisible));
    const transcript = codexTranscripts.find((candidate) => main.contains(candidate)) ??
      codexTranscripts[0] ?? main;
    const selector = transcript.matches?.(CODEX_TRANSCRIPT) ? USER_MESSAGE : CHATGPT_MESSAGE;
    for (const element of transcript.querySelectorAll(selector)) {
      if (!isVisible(element) || element.parentElement.closest(selector)) continue;
      const turn = element.closest(turnSelector);
      const key = element.getAttribute("data-message-id") ||
        (element.matches(CHATGPT_MESSAGE) && turn?.getAttribute("data-testid")) || element;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ element, key, label: questionLabel(element) });
    }
    return found;
  }

  function updateActive(key) {
    activeKey = key;
    for (const [rowKey, row] of rows) {
      if (rowKey === key) row.setAttribute("aria-current", "location");
      else row.removeAttribute("aria-current");
    }
  }

  function syncScroll() {
    scrollFrame = 0;
    if (panel.hidden || !messages.length) return;

    const scroller = scrollContainer(messages[0].element);
    const bounds = scroller?.getBoundingClientRect();
    const top = Math.max(0, bounds?.top ?? 0);
    const bottom = Math.min(innerHeight, bounds?.bottom ?? innerHeight);
    if (bottom <= top) return;
    const scrollArea = scroller ?? document.scrollingElement;
    const atEnd = scrollArea && scrollArea.scrollTop > 0 &&
      scrollArea.scrollHeight - scrollArea.clientHeight - scrollArea.scrollTop <= 2;
    const readingLine = atEnd ? bottom - 1 : top + Math.min(180, (bottom - top) * 0.25);
    let key = null;
    for (const message of messages) {
      if (!message.element.isConnected) continue;
      const rect = message.element.getBoundingClientRect();
      if (rect.top <= readingLine) key = message.key;
      else {
        if (key === null && rect.top < bottom) key = message.key;
        break;
      }
    }
    if (key !== activeKey) updateActive(key);
  }

  function queueScrollSync() {
    if (!panel.hidden && !scrollFrame) scrollFrame = requestAnimationFrame(syncScroll);
  }

  function scrollContainer(element) {
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      if (parent.scrollHeight > parent.clientHeight && /^(auto|scroll|overlay)$/.test(getComputedStyle(parent).overflowY)) {
        return parent;
      }
    }
    return null;
  }

  function jumpTo(key) {
    const message = messages.find((entry) => entry.key === key);
    if (!message?.element.isConnected) return;
    const { element } = message;
    const behavior = reducedMotion.matches ? "instant" : "smooth";
    const scroller = scrollContainer(element);
    const bounds = scroller?.getBoundingClientRect();
    const top = bounds?.top ?? 0;
    const padding = Math.min(88, (scroller?.clientHeight ?? innerHeight) * 0.16);
    const offset = element.getBoundingClientRect().top - top - padding;
    (scroller ?? window).scrollBy({ top: offset, behavior });
    updateActive(key);
    if (innerWidth <= 600) setOpen(false, true);
  }

  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    const previousFocus = root.activeElement;
    const focusedKey = previousFocus?.classList.contains("question") ?
      Array.from(rows).find(([, row]) => row === previousFocus)?.[0] : null;
    const previousScroll = list.parentElement.scrollTop;
    rows.clear();

    const items = document.createDocumentFragment();
    messages.forEach((message, index) => {
      if (!message.label.toLocaleLowerCase().includes(query)) return;
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "question";
      button.title = message.label;
      const number = document.createElement("span");
      number.className = "number";
      number.setAttribute("aria-hidden", "true");
      number.textContent = String(index + 1).padStart(2, "0");
      const label = document.createElement("span");
      label.className = "question-label";
      label.textContent = message.label;
      button.append(number, label);
      button.addEventListener("click", () => jumpTo(message.key));
      item.append(button);
      items.append(item);
      rows.set(message.key, button);
    });
    list.replaceChildren(items);
    list.parentElement.scrollTop = previousScroll;
    if (focusedKey !== null) rows.get(focusedKey)?.focus({ preventScroll: true });

    launcherCount.hidden = !messages.length;
    launcherCount.textContent = String(messages.length);
    count.textContent = query ? `${rows.size} / ${messages.length} 条提问` : `本对话共 ${messages.length} 条提问`;
    empty.hidden = rows.size > 0;
    empty.textContent = empty.hidden ? "" : query ? "没有匹配的提问" : "这段对话还没有提问";
    updateActive(activeKey);
  }

  function refresh() {
    refreshFrame = 0;
    const next = collectMessages();
    const changed = next.length !== messages.length || next.some((message, index) =>
      message.key !== messages[index].key || message.label !== messages[index].label);
    messages = next;
    if (changed) render();
    queueScrollSync();
  }

  function queueRefresh() {
    if (!refreshFrame) refreshFrame = requestAnimationFrame(refresh);
  }

  function setOpen(open, returnFocus = false) {
    panel.hidden = !open;
    launcher.hidden = open;
    launcher.setAttribute("aria-expanded", String(open));
    if (open) {
      queueRefresh();
      closeButton.focus({ preventScroll: true });
    } else if (returnFocus) {
      launcher.focus({ preventScroll: true });
    }
  }

  function updateLocation() {
    if (currentUrl === location.href) return false;
    currentUrl = location.href;
    search.value = "";
    list.parentElement.scrollTop = 0;
    activeKey = null;
    messages = [];
    render();
    queueRefresh();
    return true;
  }

  function hasQuestion(node) {
    return (node instanceof Element) &&
      (node.matches(MESSAGE_MARKERS) || Boolean(node.querySelector(MESSAGE_MARKERS)));
  }

  const observer = new MutationObserver((records) => {
    if (updateLocation()) return;
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target?.closest(USER_MESSAGE) ||
          (record.type === "attributes" && (["data-message-author-role", "data-user-message-bubble",
            "data-thread-user-message-navigation-content"].includes(record.attributeName) || hasQuestion(target))) ||
          Array.from(record.addedNodes).some(hasQuestion) ||
          Array.from(record.removedNodes).some(hasQuestion)) {
        queueRefresh();
        return;
      }
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      "data-message-author-role", "data-message-id", "data-user-message-bubble",
      "data-thread-user-message-navigation-content", "aria-hidden", "hidden", "inert",
    ],
  });
  new MutationObserver(updateTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme"],
  });

  launcher.addEventListener("click", () => setOpen(true));
  closeButton.addEventListener("click", () => setOpen(false, true));
  search.addEventListener("input", () => {
    list.parentElement.scrollTop = 0;
    render();
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false, true);
    }
  });
  window.addEventListener("popstate", updateLocation);
  window.navigation?.addEventListener("currententrychange", updateLocation);
  window.addEventListener("scroll", queueScrollSync, { capture: true, passive: true });
  window.addEventListener("resize", () => {
    queueRefresh();
    queueScrollSync();
  }, { passive: true });
  systemTheme.addEventListener("change", updateTheme);

  updateTheme();
  render();
  refresh();
})();
