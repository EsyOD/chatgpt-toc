#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
version=$(git show HEAD:manifest.json | node -e '
  const manifest = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  if (typeof manifest.version !== "string" || !/^\d+(\.\d+){0,3}$/.test(manifest.version)) {
    throw new Error("Invalid version in the committed manifest.json");
  }
  console.log(manifest.version);
')

mkdir -p dist
archive="dist/chatgpt-toc-v${version}.zip"
git archive --format=zip --prefix=chatgpt-toc/ -o "$archive" HEAD \
  README.md content.js icons manifest.json styles.js
unzip -tqq "$archive"
printf "%s\n" "$archive"
