// Regression checks for iOS/Android native chat text selection.
// No browser, API keys or network required.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const start = html.indexOf("        handleTouchStart(event) {");
const end = html.indexOf("        updateTwinEngineSummaryStatus(", start);
assert.ok(start !== -1 && end > start, "swipe handlers found");

// Exercise the production methods instead of reproducing their logic in tests.
const factory = new Function(
  "state",
  "window",
  "uiUtils",
  "SWIPE_THRESHOLD",
  `return ({${html.slice(start, end)}});`
);

function setup() {
  const state = {
    settings: { enableSwipeNavigation: true },
    touchStartX: 0,
    touchStartY: 0,
    touchEndX: 0,
    touchEndY: 0,
    isSwiping: false,
    isZoomed: false,
  };
  let selected = false;
  const screens = [];
  const window = {
    getSelection() {
      return {
        isCollapsed: !selected,
        toString() {
          throw new Error("selection text must never be materialized");
        },
      };
    },
  };
  const handlers = factory(
    state,
    window,
    { showScreen(name) { screens.push(name); } },
    50
  );
  handlers.updateZoomState = () => {};
  const event = (isText, x = 150, y = 60) => ({
    target: {
      tagName: "P",
      closest(selector) {
        assert.match(selector, /message-content/);
        return isText ? {} : null;
      },
    },
    touches: [{ clientX: x, clientY: y }],
    cancelable: true,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  });
  return {
    state,
    handlers,
    screens,
    event,
    setSelected(value) { selected = value; },
  };
}

// Long-press, drag and release within response text cannot start navigation.
{
  const t = setup();
  t.handlers.handleTouchStart(t.event(true));
  const move = t.event(true, 35);
  t.handlers.handleTouchMove(move);
  t.handlers.handleTouchEnd(move);
  assert.equal(move.prevented, false);
  assert.deepEqual(t.screens, []);
  assert.equal(t.state.isSwiping, false);
}

// Existing selected text also cancels a navigation already in progress.
{
  const t = setup();
  t.handlers.handleTouchStart(t.event(false));
  t.setSelected(true);
  const move = t.event(false, 25);
  t.handlers.handleTouchMove(move);
  t.handlers.handleTouchEnd(move);
  assert.equal(move.prevented, false);
  assert.deepEqual(t.screens, []);
  assert.equal(t.state.touchStartX, 0);
}

// Swiping across blank screen still performs the existing navigation.
{
  const t = setup();
  t.handlers.handleTouchStart(t.event(false));
  const move = t.event(false, 25);
  t.handlers.handleTouchMove(move);
  assert.equal(move.prevented, true);
  t.handlers.handleTouchEnd(move);
  assert.deepEqual(t.screens, ["settings"]);
}

assert.match(
  html,
  /#chat-screen \.message-content,[\s\S]*?-webkit-user-select: text;/
);
assert.match(
  html,
  /Do not change bubble layout while the OS is selecting its text\.[\s\S]*?getSelection\(\)\?\.isCollapsed === false/
);
console.log("Mobile native text-selection regressions: passed");
