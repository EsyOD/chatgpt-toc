(() => {
  "use strict";

  const HOST_ID = "chatgpt-question-toc-extension";
  const CHATGPT_MESSAGE = '[data-message-author-role="user"]';
  const CHATGPT_USER_TURN = '[data-turn="user"]';
  const CHATGPT_MARKERS = `${CHATGPT_MESSAGE}, ${CHATGPT_USER_TURN}`;
  const CODEX_TRANSCRIPT = "[data-thread-user-message-navigation-content]";
  const CODEX_MESSAGE = "[data-user-message-bubble]";
  const MESSAGE_MARKERS = `${CHATGPT_MARKERS}, ${CODEX_MESSAGE}`;
  const CODEX_TURN = "[data-turn-transcript], [data-turn-key], [data-chatgpt-conversation-turn]";
  const INACTIVE = '[hidden], [inert], [aria-hidden="true"]';
  const CONVERSATION_PATH = /(?:^|\/)(?:c|share|codex|work)(?:\/|$)/;
  const CONVERSATION_UI = '#prompt-textarea, #mobile-composer-prompt, ' + CODEX_TRANSCRIPT;
  const RAIL = "[data-rail-chat-transcript]";
  const ROLE_ATTRIBUTES = ["data-message-author-role", "data-turn", "data-user-message-bubble", "data-thread-user-message-navigation-content", "data-turn-transcript", "data-turn-key", "data-chatgpt-conversation-turn"];
  const EXCLUDED_TEXT = 'button, [role="button"], [aria-hidden="true"], [hidden], .sr-only, [data-markdown-copy="exclude"], [contenteditable="true"], script, style, svg';
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: "open" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CHATGPT_QUESTION_TOC_STYLES);
  root.adoptedStyleSheets = [sheet];
  function create(tag, properties, ...children) {
    const element = Object.assign(document.createElement(tag), properties);
    element.append(...children);
    return element;
  }

  function indexIcon() {
    return create("span", { className: "index-icon", ariaHidden: "true" },
      create("i"), create("i"), create("i"));
  }

  const launcherCount = create("span", { className: "launcher-count", ariaHidden: "true" });
  const launcher = create("button", { className: "launcher", type: "button", hidden: true },
    indexIcon(), create("span", null, "提问目录"), launcherCount);
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-controls", "question-panel");

  const count = create("p", { className: "count" });
  const closeButton = create("button", {
    className: "close", type: "button", ariaLabel: "收起目录", title: "收起目录",
  }, create("span", { ariaHidden: "true" }));
  const header = create("header", null,
    create("div", { className: "title-icon", ariaHidden: "true" }, indexIcon()),
    create("div", { className: "heading" }, create("h2", { id: "panel-title" }, "提问目录"), count),
    closeButton);
  const search = create("input", {
    type: "search", ariaLabel: "搜索提问", placeholder: "搜索提问…", autocomplete: "off", spellcheck: false,
  });
  const list = create("ol", { className: "questions", ariaLabel: "本对话的提问" });
  const empty = create("p", { className: "empty", hidden: true });
  empty.setAttribute("role", "status");
  const panel = create("section", { className: "panel", id: "question-panel", hidden: true },
    header,
    create("label", { className: "search" }, create("span", { className: "search-icon", ariaHidden: "true" }), search),
    create("div", { className: "results" }, list, empty));
  panel.setAttribute("aria-labelledby", "panel-title");
  root.append(launcher, panel);
  document.documentElement.append(host);

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
    const theme = page.dataset.theme || document.body.dataset.theme;
    const dark = theme === "dark" || (theme !== "light" && page.classList.contains("dark"));
    const light = theme === "light" || page.classList.contains("light");
    host.dataset.theme = dark || (!light && systemTheme.matches) ? "dark" : "light";
  }

  function isVisible(element) {
    if (element.closest(INACTIVE)) return false;
    // Keep mounted messages in offscreen content-visibility:auto sections.
    return element.checkVisibility?.({ checkVisibilityCSS: true, visibilityProperty: true }) ??
      (element.getClientRects().length > 0 && getComputedStyle(element).visibility === "visible");
  }

  function syncLauncher() {
    const onConversationPage = CONVERSATION_PATH.test(location.pathname) ||
      Boolean(document.querySelector(CONVERSATION_UI));
    launcher.hidden = !panel.hidden || (!messages.length && !onConversationPage);
  }

  function searchText(text) {
    return text.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
  }

  function questionParts(element) {
    const bubble = element.querySelector(CODEX_MESSAGE) ?? element;
    const copy = bubble.cloneNode(true);
    copy.querySelectorAll(EXCLUDED_TEXT).forEach((child) => child.remove());
    copy.querySelectorAll("br").forEach((lineBreak) => lineBreak.replaceWith(" "));
    copy.querySelectorAll("div, p, li, pre, blockquote, h1, h2, h3, h4, h5, h6")
      .forEach((block) => { block.prepend(" "); block.append(" "); });

    const parts = [];
    let pendingSpace = false;
    const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const raw = node.data.replace(/\s+/gu, " ");
      const text = raw.trim();
      if (!text) {
        pendingSpace ||= raw.length > 0;
        continue;
      }
      const code = Boolean(node.parentElement.closest("code, pre"));
      const previous = parts.at(-1);
      const space = previous && (pendingSpace || raw.startsWith(" ")) ? " " : "";
      if (previous?.code === code) {
        previous.text += space + text;
      } else {
        if (space) parts.push({ text: space, code: false });
        parts.push({ text, code });
      }
      pendingSpace = raw.endsWith(" ");
    }
    if (parts.length) return parts;

    const media = element.closest(turnSelector) ?? element;
    const filename = media.querySelector("[download]")?.getAttribute("download");
    const hasMedia = media.querySelector("img, video, audio, [data-testid*='attachment'], [data-testid*='file'], [data-user-message-file-icon]");
    return [{ text: filename || (hasMedia ? "附件消息" : "未命名提问"), code: false }];
  }

  function collectMessages() {
    const main = Array.from(document.querySelectorAll('main, [role="main"]')).find((element) =>
      isVisible(element) && !element.closest(RAIL) && element.querySelector(MESSAGE_MARKERS));
    const transcripts = Array.from(document.querySelectorAll(CODEX_TRANSCRIPT)).filter((element) =>
      isVisible(element) && !element.closest(RAIL) && element.querySelector(MESSAGE_MARKERS));
    const transcript = transcripts.find((element) => main?.contains(element)) ??
      (main?.querySelector(CHATGPT_MARKERS) ? null : transcripts[0]);
    const scope = main && (!transcript || main.contains(transcript)) ? main : transcript ?? document;

    const candidates = new Set(Array.from(scope.querySelectorAll(MESSAGE_MARKERS)).filter((element) => {
      if (element.closest(RAIL) || !isVisible(element)) return false;
      const container = element.closest(CODEX_TRANSCRIPT);
      if (container && container !== transcript) return false;
      return element.matches(CHATGPT_MARKERS) || container ||
        element.closest(`${CODEX_TURN}, ${CHATGPT_MARKERS}`) ||
        (main?.contains(element) && CONVERSATION_PATH.test(location.pathname));
    }));
    const wrappers = new Map();
    for (const element of candidates) {
      for (let parent = element.parentElement.closest(MESSAGE_MARKERS); parent;
        parent = parent.parentElement?.closest(MESSAGE_MARKERS)) {
        if (candidates.has(parent)) wrappers.set(parent, (wrappers.get(parent) ?? 0) + 1);
      }
    }

    const found = [];
    const seen = new Set();
    for (const element of candidates) {
      // A turn can contain more than one prompt, including follow-up instructions.
      if (wrappers.has(element)) continue;
      const role = element.closest(CHATGPT_MESSAGE);
      const key = element.getAttribute("data-message-id") ||
        (wrappers.get(role) === 1 && role.getAttribute("data-message-id")) || element;
      if (seen.has(key)) continue;
      seen.add(key);

      const parts = questionParts(element);
      const label = parts.map(({ text }) => text).join("");
      found.push({ element, key, label, parts, searchable: searchText(label) });
    }
    return found;
  }

  function updateActive(key) {
    rows.get(activeKey)?.removeAttribute("aria-current");
    activeKey = key;
    rows.get(key)?.setAttribute("aria-current", "location");
  }

  function readingOffset(height) {
    return Math.min(88, height * 0.16);
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
    const readingLine = atEnd ? bottom - 1 : top + readingOffset(bottom - top) + 2;
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
    const padding = readingOffset(scroller?.clientHeight ?? innerHeight);
    const offset = element.getBoundingClientRect().top - top - padding;
    (scroller ?? window).scrollBy({ top: offset, behavior });
    updateActive(key);
    if (innerWidth <= 600) setOpen(false, true);
  }

  function render() {
    const query = searchText(search.value);
    const previousFocus = root.activeElement;
    const focusedKey = previousFocus?.classList.contains("question") ?
      Array.from(rows).find(([, row]) => row === previousFocus)?.[0] : null;
    const previousScroll = list.parentElement.scrollTop;
    rows.clear();

    const items = document.createDocumentFragment();
    messages.forEach((message, index) => {
      if (!message.searchable.includes(query)) return;
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "question";
      button.title = message.label.length > 1000 ? `${message.label.slice(0, 1000)}…` : message.label;
      const number = document.createElement("span");
      number.className = "number";
      number.setAttribute("aria-hidden", "true");
      number.textContent = String(index + 1).padStart(2, "0");
      const label = document.createElement("span");
      label.className = "question-label";
      label.dir = "auto";
      for (const part of message.parts) {
        if (part.code) {
          const code = document.createElement("code");
          code.textContent = part.text;
          label.append(code);
        } else {
          label.append(part.text);
        }
      }
      button.append(number, label);
      button.addEventListener("click", () => jumpTo(message.key));
      item.append(button);
      items.append(item);
      rows.set(message.key, button);
    });
    list.replaceChildren(items);
    list.parentElement.scrollTop = previousScroll;
    if (focusedKey !== null) rows.get(focusedKey)?.focus({ preventScroll: true });

    syncLauncher();
    launcherCount.hidden = !messages.length;
    launcherCount.textContent = String(messages.length);
    count.textContent = query ? `${rows.size} / ${messages.length} 条提问` : `本对话共 ${messages.length} 条提问`;
    empty.hidden = rows.size > 0;
    empty.textContent = empty.hidden ? "" : query ? "没有匹配的提问" : "暂未识别到提问";
    updateActive(activeKey);
  }

  function refresh() {
    refreshFrame = 0;
    const next = collectMessages();
    const changed = next.length !== messages.length || next.some((message, index) =>
      message.key !== messages[index].key || message.label !== messages[index].label ||
      message.parts.length !== messages[index].parts.length ||
      message.parts.some((part, partIndex) => {
        const previous = messages[index].parts[partIndex];
        return part.code !== previous.code || part.text !== previous.text;
      }));
    messages = next;
    if (changed) render();
    else syncLauncher();
    queueScrollSync();
  }

  function queueRefresh() {
    if (!refreshFrame) refreshFrame = requestAnimationFrame(refresh);
  }

  function setOpen(open, returnFocus = false) {
    panel.hidden = !open;
    syncLauncher();
    launcher.setAttribute("aria-expanded", String(open));
    if (open) {
      queueRefresh();
      closeButton.focus({ preventScroll: true });
    } else if (returnFocus && !launcher.hidden) {
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

  function hasConversationUI(node) {
    return node instanceof Element &&
      (node.matches(CONVERSATION_UI) || Boolean(node.querySelector(CONVERSATION_UI)));
  }

  const observer = new MutationObserver((records) => {
    if (updateLocation()) return;
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target?.closest(MESSAGE_MARKERS) ||
          (record.type === "attributes" && (ROLE_ATTRIBUTES.includes(record.attributeName) || hasQuestion(target))) ||
          Array.from(record.addedNodes).some(hasQuestion) ||
          Array.from(record.removedNodes).some(hasQuestion) ||
          (!messages.length && !CONVERSATION_PATH.test(location.pathname) &&
            (Array.from(record.addedNodes).some(hasConversationUI) ||
             Array.from(record.removedNodes).some(hasConversationUI)))) {
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
      ...ROLE_ATTRIBUTES, "data-message-id", "data-rail-chat-transcript", "aria-hidden", "hidden", "inert",
    ],
  });
  const themeObserver = new MutationObserver(updateTheme);
  const themeOptions = { attributes: true, attributeFilter: ["class", "data-theme"] };
  themeObserver.observe(document.documentElement, themeOptions);
  themeObserver.observe(document.body, themeOptions);

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
