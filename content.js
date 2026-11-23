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
  const INACTIVE = '[hidden], [inert], [aria-hidden="true"], [data-app-shell-active-page="false"]';
  const CONVERSATION_PATH = /(?:^|\/)(?:c|share|codex|work|remote)(?:\/|$)/;
  const VIRTUAL_TURN = "[data-virtualized-turn]";
  const TURN_ID = "[data-turn-key], [data-content-search-turn-key]";
  const RAIL = "[data-rail-chat-transcript]";
  const MAIN = 'main, [role="main"], [data-app-shell-focus-area="main"]';
  const TASK_PATH = /(?:^|\/)(?:codex|work|remote)(?:\/|$)/;
  const CONVERSATION_UI = `#prompt-textarea, #mobile-composer-prompt, ${CODEX_TRANSCRIPT}, ${RAIL}`;
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
  const launcher = create("button", { className: "launcher", type: "button", hidden: true, title: "点击展开，拖动移动" },
    indexIcon(), create("span", null, "提问目录"), launcherCount);
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-controls", "question-panel");

  const count = create("p", { className: "count" });
  const closeButton = create("button", {
    className: "close", type: "button", ariaLabel: "收起目录", title: "收起目录",
  }, create("span", { ariaHidden: "true" }));
  const settingsButton = create("button", {
    className: "settings-button", type: "button", ariaLabel: "外观设置", title: "外观设置",
  }, create("span", { ariaHidden: "true" }, "⚙︎"));
  settingsButton.setAttribute("aria-expanded", "false");
  settingsButton.setAttribute("aria-controls", "toc-appearance");
  const header = create("header", { title: "拖动移动提问目录" },
    create("div", { className: "title-icon", ariaHidden: "true" }, indexIcon()),
    create("div", { className: "heading" }, create("h2", { id: "panel-title" }, "提问目录"), count),
    settingsButton, closeButton);
  const search = create("input", {
    type: "search", ariaLabel: "搜索提问", placeholder: "搜索提问…", autocomplete: "off", spellcheck: false,
  });
  const list = create("ol", { className: "questions", ariaLabel: "本对话的提问" });
  const empty = create("p", { className: "empty", hidden: true });
  empty.setAttribute("role", "status");
  const readAll = create("button", { className: "read-all", type: "button", hidden: true }, "读取完整对话");
  const corners = {
    "bottom-right": "右下", "top-right": "右上", "bottom-left": "左下", "top-left": "左上",
  };
  const position = create("select");
  for (const [value, text] of Object.entries(corners)) {
    position.append(create("option", { value }, text));
  }
  position.append(create("option", { value: "free" }, "自由位置"));
  const fixedHeight = create("input", { type: "checkbox" });
  const dimensions = {
    width: { label: "宽度（px）", min: 240, max: 760, initial: 350 },
    height: { label: "最大高度（px）", min: 220, max: 1100, initial: 520 },
    x: { label: "水平边距（px）", min: 0, max: 360 },
    y: { label: "垂直边距（px）", min: 0, max: 360 },
  };
  const fields = new Map([["position", position], ["fixedHeight", fixedHeight]]);
  const sizeFields = create("div", { className: "settings-grid" });
  for (const [key, { label, min, max }] of Object.entries(dimensions)) {
    const input = create("input", { type: "number", min, max, step: 1, placeholder: "自动" });
    fields.set(key, input);
    sizeFields.append(create("label", { className: key === "x" || key === "y" ? "dock-offset" : "" },
      create("span", null, label), input));
  }
  const resetAppearance = create("button", { className: "reset-appearance", type: "button" }, "恢复默认");
  const settings = create("div", { className: "settings", id: "toc-appearance", hidden: true },
    create("label", null, create("span", null, "停靠位置"), position), sizeFields,
    create("label", { className: "fixed-height" }, fixedHeight, create("span", null, "固定面板高度")),
    resetAppearance);
  const resizeHandle = create("button", {
    className: "resize-handle", type: "button", ariaLabel: "调整面板大小", title: "拖动或按方向键调整大小",
  }, create("span", { ariaHidden: "true" }));
  const panel = create("section", { className: "panel", id: "question-panel", hidden: true },
    header,
    create("label", { className: "search" }, create("span", { className: "search-icon", ariaHidden: "true" }), search),
    create("div", { className: "results" }, list, empty), readAll, settings, resizeHandle);
  panel.setAttribute("aria-labelledby", "panel-title");
  root.append(launcher, panel);
  document.documentElement.append(host);

  const rows = new Map();
  const systemTheme = matchMedia("(prefers-color-scheme: dark)");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const turnSelector = 'article[data-testid^="conversation-turn"], [data-testid^="conversation-turn-"]';

  let messages = [];
  let activeKey = null;
  let indexedScope = null;
  let virtualMode = false;
  let transcriptScroller = null;
  let scan = null;
  let pendingJump = null;
  let currentUrl = location.href;
  let refreshFrame = 0;
  let scrollFrame = 0;

  function setSettings(open) {
    settings.hidden = !open;
    panel.classList.toggle("show-settings", open);
    settingsButton.setAttribute("aria-expanded", String(open));
    (open ? position : settingsButton).focus({ preventScroll: true });
  }

  const appearancePrefix = "tocAppearance.";
  const appearanceStorage = globalThis.chrome?.storage;
  const updatedAppearance = new Set();
  let freePosition = null;
  let skipLauncherClick = false;

  function fitFreePosition() {
    if (!freePosition) return;
    const left = Math.min(freePosition.left, Math.max(0, window.innerWidth - host.offsetWidth));
    const top = Math.min(freePosition.top, Math.max(0, window.innerHeight - host.offsetHeight));
    host.style.setProperty("--free-left", `${left}px`);
    host.style.setProperty("--free-top", `${top}px`);
  }

  function rectanglePosition() {
    const { left, top } = host.getBoundingClientRect();
    return { left, top };
  }

  function saveAppearance(changes) {
    const values = {};
    for (const [key, value] of Object.entries(changes)) {
      updatedAppearance.add(key);
      values[appearancePrefix + key] = value;
    }
    appearanceStorage?.local.set(values).catch(console.warn);
  }

  function applyAppearance(key, value) {
    if (key === "position") {
      freePosition = Number.isFinite(value?.left) && Number.isFinite(value?.top) ?
        { left: Math.max(0, Math.round(value.left)), top: Math.max(0, Math.round(value.top)) } : null;
      const corner = typeof value === "string" && Object.hasOwn(corners, value) ? value : "bottom-right";
      const mode = freePosition ? "free" : corner;
      host.dataset.position = mode;
      position.value = mode;
      fitFreePosition();
      return freePosition ?? corner;
    }
    if (key === "fixedHeight") {
      fixedHeight.checked = value === true;
      host.toggleAttribute("data-fixed-height", fixedHeight.checked);
      return fixedHeight.checked;
    }

    const { min, max, initial } = dimensions[key];
    const pixels = Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : null;
    if (pixels === null) host.style.removeProperty(`--toc-${key}`);
    else host.style.setProperty(`--toc-${key}`, `${pixels}px`);
    fields.get(key).value = String(pixels ?? initial ?? "");
    return pixels;
  }

  function initializeAppearance() {
    const storageKeys = Array.from(fields.keys(), (key) => appearancePrefix + key);
    for (const [key, control] of fields) {
      applyAppearance(key);
      control.addEventListener("change", () => {
        let value = control.valueAsNumber;
        if (key === "position") value = position.value === "free" ? rectanglePosition() : position.value;
        if (key === "fixedHeight") value = fixedHeight.checked;
        saveAppearance({ [key]: applyAppearance(key, value) });
      });
    }

    resetAppearance.addEventListener("click", () => {
      for (const key of fields.keys()) {
        updatedAppearance.add(key);
        applyAppearance(key);
      }
      appearanceStorage?.local.remove(storageKeys).catch(console.warn);
    });

    appearanceStorage?.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      for (const key of fields.keys()) {
        if (!Object.hasOwn(changes, appearancePrefix + key)) continue;
        updatedAppearance.add(key);
        applyAppearance(key, changes[appearancePrefix + key].newValue);
      }
    });
    appearanceStorage?.local.get(storageKeys).then((saved) => {
      for (const key of fields.keys()) {
        if (!updatedAppearance.has(key)) applyAppearance(key, saved[appearancePrefix + key]);
      }
    }).catch(console.warn);
    new ResizeObserver(fitFreePosition).observe(host);
  }

  function trackPointer(control, start) {
    let interaction;
    control.addEventListener("pointerdown", (event) => {
      if (interaction || event.button !== 0 || !event.isPrimary) return;
      const gesture = start(event);
      if (!gesture) return;
      interaction = { gesture, id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      control.setPointerCapture(event.pointerId);
    });
    control.addEventListener("pointermove", (event) => {
      if (interaction?.id !== event.pointerId) return;
      const x = event.clientX - interaction.x;
      const y = event.clientY - interaction.y;
      if (!interaction.moved && Math.hypot(x, y) < 4) return;
      interaction.moved = true;
      host.toggleAttribute("data-adjusting", true);
      interaction.gesture.move(x, y);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      control.addEventListener(type, (event) => {
        if (interaction?.id !== event.pointerId) return;
        const { gesture, moved } = interaction;
        interaction = null;
        host.removeAttribute("data-adjusting");
        if (moved) gesture.finish();
      });
    }
  }

  function moveGesture() {
    const { left, top } = rectanglePosition();
    return {
      move(x, y) {
        applyAppearance("position", {
          left: Math.min(left + x, window.innerWidth - host.offsetWidth),
          top: Math.min(top + y, window.innerHeight - host.offsetHeight),
        });
      },
      finish() {
        saveAppearance({ position: freePosition });
      },
    };
  }

  function resizeGesture() {
    const { left, top, width, height } = host.getBoundingClientRect();
    const anchor = host.dataset.position;
    const across = anchor.endsWith("right") ? -1 : 1;
    const down = anchor.startsWith("bottom") ? -1 : 1;
    let values;
    return {
      move(x, y) {
        const maxWidth = freePosition ? window.innerWidth - left : Infinity;
        const maxHeight = freePosition ? window.innerHeight - top : Infinity;
        values = {
          width: applyAppearance("width", Math.min(maxWidth, width + x * across)),
          height: applyAppearance("height", Math.min(maxHeight, height + y * down)),
          fixedHeight: applyAppearance("fixedHeight", true),
        };
      },
      finish() {
        saveAppearance(values);
      },
    };
  }

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
    const main = Array.from(document.querySelectorAll(MAIN)).find((element) =>
      isVisible(element) && !element.closest(RAIL) && element.querySelector(MESSAGE_MARKERS));
    const transcripts = Array.from(document.querySelectorAll(CODEX_TRANSCRIPT)).filter((element) =>
      isVisible(element) && !element.closest(RAIL) && element.querySelector(MESSAGE_MARKERS));
    const transcript = transcripts.find((element) => main?.contains(element)) ??
      (main?.querySelector(CHATGPT_MARKERS) ? null : transcripts[0]);
    const scope = main && (!transcript || main.contains(transcript)) ? main : transcript ?? document;

    let markers = Array.from(scope.querySelectorAll(MESSAGE_MARKERS)).filter((element) => {
      if (element.closest(RAIL) || !isVisible(element)) return false;
      const container = element.closest(CODEX_TRANSCRIPT);
      if (container && container !== transcript) return false;
      return element.matches(CHATGPT_MARKERS) || container ||
        element.closest(`${CODEX_TURN}, ${CHATGPT_MARKERS}`) ||
        (main?.contains(element) && CONVERSATION_PATH.test(location.pathname));
    });
    let messageScope = transcript ?? main ?? document.body;
    if (!markers.length) {
      // Work can show the task's conversation alongside a document or another app.
      for (const rail of document.querySelectorAll(RAIL)) {
        if (!TASK_PATH.test(location.pathname) && !rail.closest("[data-app-shell-focus-area]")) continue;
        markers = Array.from(rail.querySelectorAll(MESSAGE_MARKERS)).filter((element) =>
          element.closest(RAIL) === rail && isVisible(element));
        if (markers.length) {
          messageScope = rail;
          break;
        }
      }
    }
    if (!markers.length && indexedScope?.isConnected && isVisible(indexedScope)) {
      messageScope = indexedScope;
    }
    const virtual = Boolean(messageScope.querySelector(VIRTUAL_TURN) || messageScope.closest(VIRTUAL_TURN));

    const candidates = new Set(markers);
    const wrappers = new Map();
    for (const element of candidates) {
      for (let parent = element.parentElement.closest(MESSAGE_MARKERS); parent;
        parent = parent.parentElement?.closest(MESSAGE_MARKERS)) {
        if (candidates.has(parent)) wrappers.set(parent, (wrappers.get(parent) ?? 0) + 1);
      }
    }

    const found = [];
    const seen = new Set();
    const turnOrdinals = new Map();
    const scroller = markers.length && (virtual || virtualMode) ? scrollContainer(markers[0]) : null;
    const scrollTop = scroller?.scrollTop ?? window.scrollY;
    const scrollOrigin = scroller?.getBoundingClientRect().top ?? 0;
    for (const element of candidates) {
      // A turn can contain more than one prompt, including follow-up instructions.
      if (wrappers.has(element)) continue;
      const role = element.closest(CHATGPT_MESSAGE);
      const turn = element.closest(TURN_ID);
      const turnId = turn?.getAttribute("data-turn-key") || turn?.getAttribute("data-content-search-turn-key");
      const ordinal = turn ? (turnOrdinals.get(turn) ?? 0) : 0;
      if (turn) turnOrdinals.set(turn, ordinal + 1);
      const messageId = element.getAttribute("data-message-id") ||
        (wrappers.get(role) === 1 && role.getAttribute("data-message-id"));
      const key = messageId ? `message:${messageId}` : turnId ? `turn:${turnId}:${ordinal}` : element;
      if (seen.has(key)) continue;
      seen.add(key);

      const parts = questionParts(element);
      const label = parts.map(({ text }) => text).join("");
      const position = virtual || virtualMode ? scrollTop + element.getBoundingClientRect().top - scrollOrigin : 0;
      found.push({ element, key, label, parts, searchable: searchText(label), position });
    }
    return { found, scope: messageScope, virtual, scroller };
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

    const firstMounted = messages.find(({ element }) => element?.isConnected);
    if (!firstMounted) return;
    const scroller = scrollContainer(firstMounted.element);
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
      if (!message.element?.isConnected) continue;
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
    scan = null;
    const message = messages.find((entry) => entry.key === key);
    if (!message) return;
    if (!message.element?.isConnected) {
      pendingJump = { key, expires: performance.now() + 3000 };
      const scroller = transcriptScroller?.isConnected ? transcriptScroller : window;
      scroller.scrollTo({ top: Math.max(0, message.position - readingOffset(scroller.clientHeight ?? innerHeight)), behavior: "instant" });
      queueRefresh();
      return;
    }
    pendingJump = null;
    jumpToMounted(message);
  }

  function jumpToMounted({ key, element }) {
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
    count.textContent = query ? `${rows.size} / ${messages.length} 条提问` :
      `${virtualMode ? "已读取" : "本对话共"} ${messages.length} 条提问`;
    readAll.hidden = !virtualMode;
    readAll.textContent = scan ? "停止读取" : "读取完整对话";
    empty.hidden = rows.size > 0;
    empty.textContent = empty.hidden ? "" : query ? "没有匹配的提问" : "暂未识别到提问";
    updateActive(activeKey);
  }

  function refresh() {
    refreshFrame = 0;
    const { found, scope, virtual, scroller } = collectMessages();
    const sameScope = indexedScope === scope;
    const wasVirtual = virtualMode;
    virtualMode = virtual || (sameScope && virtualMode);
    indexedScope = scope;
    transcriptScroller = scroller ?? (sameScope ? transcriptScroller : null);
    let next = found;

    if (virtualMode && sameScope) {
      const indexed = new Map(found.map((message) => [message.key, message]));
      for (const previous of messages) {
        if (typeof previous.key === "string" && !indexed.has(previous.key) &&
            !previous.element?.isConnected) {
          indexed.set(previous.key, { ...previous, element: null });
        }
      }
      next = Array.from(indexed.values()).sort((left, right) => left.position - right.position);
    } else if (!sameScope) {
      pendingJump = null;
    }

    const changed = virtualMode !== wasVirtual || next.length !== messages.length || next.some((message, index) =>
      message.key !== messages[index].key || message.label !== messages[index].label ||
      message.parts.length !== messages[index].parts.length ||
      message.parts.some((part, partIndex) => {
        const previous = messages[index].parts[partIndex];
        return part.code !== previous.code || part.text !== previous.text;
      }));
    messages = next;
    if (changed) render();
    else syncLauncher();
    if (pendingJump) {
      const target = messages.find(({ key, element }) => key === pendingJump.key && element?.isConnected);
      if (target) {
        pendingJump = null;
        jumpToMounted(target);
      } else if (performance.now() > pendingJump.expires) {
        pendingJump = null;
      }
    }
    queueScrollSync();
  }

  function queueRefresh() {
    if (!refreshFrame) refreshFrame = requestAnimationFrame(refresh);
  }

  function setOpen(open, returnFocus = false) {
    if (!open && !settings.hidden) setSettings(false);
    panel.hidden = !open;
    if (!open && scan) {
      scan = null;
      readAll.textContent = "读取完整对话";
    }
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
    indexedScope = null;
    virtualMode = false;
    transcriptScroller = null;
    pendingJump = null;
    scan = null;
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
      ...ROLE_ATTRIBUTES, "data-message-id", "data-rail-chat-transcript", "data-app-shell-active-page",
      "data-app-shell-focus-area", "data-virtualized-turn", "data-content-search-turn-key", "aria-hidden", "hidden", "inert",
    ],
  });
  const themeObserver = new MutationObserver(updateTheme);
  const themeOptions = { attributes: true, attributeFilter: ["class", "data-theme"] };
  themeObserver.observe(document.documentElement, themeOptions);
  themeObserver.observe(document.body, themeOptions);

  async function readTranscript() {
    if (scan) {
      scan = null;
      readAll.textContent = "读取完整对话";
      return;
    }

    const scope = indexedScope;
    const scroller = transcriptScroller?.isConnected ? transcriptScroller : document.scrollingElement;
    if (!scope || !scroller) return;
    const currentScan = {};
    scan = currentScan;
    pendingJump = null;
    readAll.textContent = "停止读取";
    const originalTop = scroller.scrollTop;
    const stillReading = () => scan === currentScan && indexedScope === scope && scroller.isConnected;

    const step = Math.max(1, Math.floor(scroller.clientHeight * 0.7));
    let lastTop = -1;
    for (let top = 0; stillReading();) {
      scroller.scrollTo({ top, behavior: "instant" });
      await new Promise((resolve) => setTimeout(resolve, 60));
      if (!stillReading()) break;
      if (refreshFrame) cancelAnimationFrame(refreshFrame);
      refresh();
      const currentTop = scroller.scrollTop;
      const bottom = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      if (currentTop >= bottom - 1 || currentTop <= lastTop) break;
      lastTop = currentTop;
      top = Math.min(bottom, currentTop + step);
    }

    if (stillReading()) scroller.scrollTo({ top: originalTop, behavior: "instant" });
    if (scan === currentScan) {
      scan = null;
      readAll.textContent = "读取完整对话";
    }
  }

  readAll.addEventListener("click", readTranscript);
  trackPointer(launcher, () => {
    skipLauncherClick = false;
    const gesture = moveGesture();
    return { move: gesture.move, finish: () => {
      skipLauncherClick = true;
      gesture.finish();
    } };
  });
  trackPointer(header, (event) => event.target.closest("button") ? null : moveGesture());
  trackPointer(resizeHandle, resizeGesture);
  resizeHandle.addEventListener("keydown", (event) => {
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!Object.hasOwn(directions, event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 32 : 8;
    const [x, y] = directions[event.key];
    const gesture = resizeGesture();
    gesture.move(x * step, y * step);
    gesture.finish();
  });
  launcher.addEventListener("click", (event) => {
    if (!skipLauncherClick || event.detail === 0) setOpen(true);
    skipLauncherClick = false;
  });
  closeButton.addEventListener("click", () => setOpen(false, true));
  settingsButton.addEventListener("click", () => setSettings(settings.hidden));
  search.addEventListener("input", () => {
    list.parentElement.scrollTop = 0;
    render();
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      event.preventDefault();
      event.stopPropagation();
      if (!settings.hidden) setSettings(false);
      else setOpen(false, true);
    }
  });
  window.addEventListener("popstate", updateLocation);
  window.navigation?.addEventListener("currententrychange", updateLocation);
  window.addEventListener("scroll", queueScrollSync, { capture: true, passive: true });
  window.addEventListener("resize", () => {
    fitFreePosition();
    queueRefresh();
    queueScrollSync();
  }, { passive: true });
  systemTheme.addEventListener("change", updateTheme);

  initializeAppearance();
  updateTheme();
  render();
  refresh();
})();
