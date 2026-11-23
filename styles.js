const CHATGPT_QUESTION_TOC_STYLES = `
  :host {
    all: initial;
    position: fixed;
    --default-x: 24px;
    --default-y: 24px;
    --dock-x: min(var(--toc-x, var(--default-x)), max(0px, calc(100vw - 240px)));
    --dock-y: min(var(--toc-y, var(--default-y)), max(0px, calc(100dvh - 230px)));
    --edge-x: max(var(--dock-x), env(safe-area-inset-right));
    --edge-y: max(var(--dock-y), env(safe-area-inset-bottom));
    inset: auto var(--edge-x) var(--edge-y) auto;
    z-index: 2147483000;
    display: block;
    isolation: isolate;
    font: 400 14px/1.5 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    color: var(--ink);
    color-scheme: light;
    --surface: #fff;
    --ink: #222027;
    --muted: #605d69;
    --line: #e8e6ec;
    --field: #f5f4f7;
    --accent: #5839a4;
    --accent-surface: #eee7ff;
    --accent-line: #d9c9f6;
    --hover: #f7f3ff;
    --shadow: 0 16px 56px #2d1d4124, 0 3px 10px #2d1d410d;
  }

  :host([data-position$="left"]) {
    --edge-x: max(var(--dock-x), env(safe-area-inset-left));
    right: auto;
    left: var(--edge-x);
  }

  :host([data-position^="top"]) {
    --default-y: 24px;
    --edge-y: max(var(--dock-y), env(safe-area-inset-top));
    top: var(--edge-y);
    bottom: auto;
  }

  :host([data-theme="dark"]) {
    color-scheme: dark;
    --surface: #242326;
    --ink: #f7f1ff;
    --muted: #b9afc8;
    --line: #403c46;
    --field: #302d35;
    --accent: #d4baff;
    --accent-surface: #382b50;
    --accent-line: #59437d;
    --hover: #30263d;
    --shadow: 0 16px 56px #0009, 0 3px 10px #0004;
  }

  *, *::before, *::after { box-sizing: border-box; }
  [hidden] { display: none !important; }
  button, input, select { color: inherit; font: inherit; }
  button { cursor: pointer; }
  button:focus-visible, .settings :is(input, select):focus-visible, .search:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  .launcher {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 46px;
    padding: 8px 13px;
    border: 1px solid var(--accent-line);
    border-radius: 999px;
    background: var(--surface);
    color: var(--accent);
    box-shadow: var(--shadow);
    font-weight: 650;
  }

  .launcher:hover { background: var(--hover); }

  .launcher-count {
    min-width: 23px;
    padding: 1px 5px;
    border-radius: 9px;
    background: var(--accent-surface);
    text-align: center;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .panel {
    display: flex;
    flex-direction: column;
    width: min(var(--toc-width, 350px), calc(100vw - var(--edge-x) - 12px));
    max-height: min(var(--toc-height, var(--default-height, 520px)), calc(100dvh - var(--edge-y) - 12px));
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 21px;
    background: var(--surface);
    box-shadow: var(--shadow);
    animation: enter 150ms ease-out;
  }

  @keyframes enter {
    from { opacity: 0; transform: translateY(5px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .panel { animation: none; }
  }

  header {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) repeat(2, 32px);
    align-items: center;
    flex-shrink: 0;
    gap: 8px;
    padding: 18px 16px 14px;
  }

  .title-icon {
    display: grid;
    width: 40px;
    height: 40px;
    place-items: center;
    border-radius: 13px;
    background: var(--accent-surface);
    color: var(--accent);
  }

  .index-icon {
    display: grid;
    gap: 3px;
    width: 17px;
  }

  .index-icon i {
    display: grid;
    grid-template-columns: 3px 1fr;
    align-items: center;
    gap: 3px;
  }

  .index-icon i::before, .index-icon i::after {
    height: 2px;
    border-radius: 2px;
    background: currentColor;
    content: "";
  }

  .index-icon i:nth-child(2)::after { width: 72%; }
  h2, p { margin: 0; }
  h2 { font-size: 16px; line-height: 1.35; font-weight: 700; letter-spacing: .02em; }

  .count {
    margin-top: 3px;
    color: var(--muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .close, .settings-button {
    display: grid;
    width: 32px;
    height: 36px;
    place-items: center;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--muted);
  }

  .close:hover, .settings-button:hover, .settings-button[aria-expanded="true"] {
    background: var(--hover);
    color: var(--accent);
  }

  .settings-button { font-size: 19px; line-height: 1; }
  .close span { position: relative; width: 14px; height: 14px; }

  .close span::before, .close span::after {
    position: absolute;
    inset: 6px 0 auto;
    height: 1.5px;
    border-radius: 2px;
    background: currentColor;
    transform: rotate(45deg);
    content: "";
  }

  .close span::after { transform: rotate(-45deg); }

  .search {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 10px;
    min-height: 39px;
    margin: 0 16px 13px;
    padding: 0 11px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--field);
    color: var(--muted);
  }

  .search-icon {
    position: relative;
    width: 12px;
    height: 12px;
    flex: 0 0 12px;
    border: 1.5px solid currentColor;
    border-radius: 50%;
    margin-right: 3px;
  }

  .search-icon::after {
    position: absolute;
    right: -5px;
    bottom: -3px;
    width: 6px;
    height: 1.5px;
    border-radius: 1px;
    background: currentColor;
    transform: rotate(45deg);
    content: "";
  }

  input {
    width: 100%;
    min-width: 0;
    min-height: 36px;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ink);
    font-size: 13px;
  }

  input::placeholder { opacity: 1; color: var(--muted); }

  .results {
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--accent-line) transparent;
    border-top: 1px solid var(--line);
    padding: 7px 9px 9px;
  }

  ol { display: grid; gap: 3px; margin: 0; padding: 0; list-style: none; }

  .question {
    display: grid;
    grid-template-columns: minmax(28px, auto) minmax(0, 1fr);
    align-items: start;
    gap: 9px;
    width: 100%;
    min-height: 41px;
    padding: 8px;
    border: 1px solid transparent;
    border-radius: 11px;
    background: transparent;
    text-align: start;
    line-height: 1.5;
    font-size: 13px;
  }

  .question:hover { background: var(--hover); }
  .question:focus-visible { outline-offset: -2px; }

  .question[aria-current="location"] {
    color: var(--accent);
    border-color: var(--accent-line);
    background: var(--accent-surface);
    font-weight: 600;
  }

  .number {
    justify-self: stretch;
    padding: 2px 4px;
    border-radius: 5px;
    background: var(--field);
    color: var(--muted);
    font: 600 11px/16px ui-monospace, SFMono-Regular, Consolas, monospace;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .question[aria-current="location"] .number { color: var(--accent); background: var(--surface); }

  .question-label {
    display: -webkit-box;
    overflow: hidden;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
  }

  .question-label code {
    padding-inline: .25em;
    border-radius: 4px;
    background: var(--field);
    font: .9em ui-monospace, SFMono-Regular, Consolas, monospace;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }

  .question[aria-current="location"] code { background: var(--surface); }

  .show-settings > :is(.search, .results, .read-all) { display: none; }

  .settings {
    display: grid;
    gap: 12px;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    padding: 12px 16px 16px;
    border-top: 1px solid var(--line);
    font-size: 13px;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 12px;
  }

  .settings label { display: grid; gap: 4px; color: var(--muted); }

  .settings :is(input, select) {
    display: block;
    width: 100%;
    min-height: 36px;
    padding: 4px 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--field);
    color: var(--ink);
    outline-offset: 1px;
    font-size: inherit;
  }

  .reset-appearance {
    justify-self: start;
    border: 0;
    border-radius: 8px;
    background: var(--field);
    color: var(--accent);
    padding: 6px 10px;
  }

  .reset-appearance:hover { background: var(--hover); }

  .read-all {
    align-self: flex-start;
    margin: 8px 12px 11px;
    padding: 4px 9px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--accent);
    font-size: 12px;
  }

  .read-all:hover { background: var(--field); }

  .empty {
    padding: 25px 16px 30px;
    color: var(--muted);
    text-align: center;
    font-size: 13px;
  }

  @media (forced-colors: active) {
    .question[aria-current="location"] { border-color: Highlight; }
  }

  @media (max-width: 600px) {
    :host { --default-x: 12px; --default-y: 82px; --default-height: min(520px, 70dvh); }
    input, .settings :is(input, select) { font-size: 16px; }
  }
`;
