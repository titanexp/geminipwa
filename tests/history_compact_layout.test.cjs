// Keep the beta history rows as compact as the titan823 layout, without
// losing their additional count, pin action, search preview, or highlight.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const start = html.indexOf('<ul id="history-list"');
const end = html.indexOf("</ul>", start);
assert.ok(start >= 0 && end > start, "history list is present");
const template = html.slice(start, end);
const titleRow = template.match(/<div class="history-item-title-row">([\s\S]*?)<\/div>/);
assert.ok(titleRow, "history title row is present");
assert.match(
  titleRow[1],
  /<span class="history-item-title"><\/span>\s*<span class="history-item-msg-count"><\/span>\s*<button class="js-pin-btn"/,
  "message count sits immediately to the left of pin"
);
assert.equal(
  (template.match(/class="history-item-msg-count"/g) || []).length,
  1,
  "each tab renders exactly one count"
);
assert.doesNotMatch(template, /history-item-meta/, "count-only row was removed");
assert.match(template, /history-item-bottom-row/);
assert.match(template, /history-item-dates/);
assert.match(template, /history-item-snippet hidden/);
assert.match(template, /js-link-session-btn/);
assert.match(template, /js-edit-title-btn/);
assert.match(template, /js-delete-btn/);

assert.match(html, /\.history-item-title-row \.history-item-title\s*\{\s*flex: 1 1 auto;\s*min-width: 0;/);
assert.match(html, /\.history-item-title-row \.history-item-msg-count\s*\{\s*flex: 0 0 auto;[\s\S]*?white-space: nowrap;/);
assert.match(html, /\.history-item \.js-pin-btn\s*\{[\s\S]*?padding: 1px 5px;/);
assert.match(html, /li\.querySelector\("\.history-item-msg-count"\)\.textContent\s*=\s*`💬 \$\{msgs\.length\}`/);
assert.match(html, /li\.querySelector\("\.js-pin-btn"\)\.onclick/);
assert.match(html, /li\.classList\.add\("is-current"\)/);
assert.match(html, /const APP_VERSION = "0\.26ti \(629\)";/);

console.log("PASS: compact history rows, count-before-pin, and all original controls");
