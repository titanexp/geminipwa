// Offline regression guard for the beta history list's compact metadata.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const templateStart = html.indexOf('<ul id="history-list"');
const templateEnd = html.indexOf("</ul>", templateStart);
assert.ok(templateStart >= 0 && templateEnd > templateStart);
const template = html.slice(templateStart, templateEnd);

assert.doesNotMatch(template, /history-item-badge|history-item-last-role|開いている/);
assert.match(template, /history-item-title/);
assert.match(template, /history-item-msg-count/);
assert.match(template, /history-item-snippet/);
assert.match(template, /js-pin-btn/);
assert.match(html, /\.history-item\.is-current\s*\{/);
assert.match(html, /li\.classList\.add\("is-current"\)/);
assert.doesNotMatch(html, /history-item-badge|history-item-last-role/);
assert.doesNotMatch(html, /あなたの発言で終了|AIの返答で終了/);
assert.match(html, /const APP_VERSION = "0\.26ti \(629\)";/);

console.log("PASS: history title, active highlight, count, preview and pin retained; badges removed");
