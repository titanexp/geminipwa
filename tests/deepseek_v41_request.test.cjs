// DeepSeek V4.1 beta request compatibility test (no network/API key).
// Calls the actual callDeepSeekApi method with a simulated fetch.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8")
  .replace(/\r\n/g, "\n");
let scripts = 0;
for (const part of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  if (part[1].trim()) { new vm.Script(part[1]); scripts++; }
}
assert.ok(scripts >= 1);
assert.match(html, /<option value="deepseek-flash">/);
assert.match(html, /DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash'/);
assert.equal((html.match(/id="deepseek-thinking-mode"/g) || []).length, 1);
assert.equal((html.match(/id="deepseek-reasoning-effort"/g) || []).length, 1);
assert.match(html, /newSettings\.deepSeekThinkingMode = elements\.deepSeekThinkingModeSelect\.value/);
assert.match(html, /newSettings\.deepSeekReasoningEffort = elements\.deepSeekReasoningEffortSelect\.value/);
assert.match(html, /contextDeepSeekThinkingMode =/);
assert.match(html, /contextDeepSeekReasoningEffort =/);
assert.match(html, /commonGenerationConfig\.deepSeekThinkingMode = contextDeepSeekThinkingMode/);
assert.match(html, /commonGenerationConfig\.deepSeekReasoningEffort = contextDeepSeekReasoningEffort/);
assert.match(html, /config\.deepSeekThinkingMode = state\.settings\.deepSeekThinkingMode/);
assert.match(html, /config\.deepSeekReasoningEffort = state\.settings\.deepSeekReasoningEffort/);

const start = html.indexOf("async callDeepSeekApi(");
const end = html.indexOf("async *handleDeepSeekStreamingResponse(", start);
assert.ok(start >= 0 && end > start);
const code = html.slice(start, end);
const state = { settings: { deepSeekApiEndpoint: "" } };
const calls = [];
const fetchMock = async (endpoint, options) => {
  const request = JSON.parse(options.body);
  calls.push({ endpoint, options, request });
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: { content: "OK", reasoning_content: "reasoned" },
        finish_reason: "stop"
      }]
    })
  };
};
const factory = new Function(
  "state", "DEEPSEEK_API_DEFAULT_BASE_URL", "isSecureOutboundUrl",
  "multiBackendUtils", "fetch",
  "return ({ " + code + " }).callDeepSeekApi;"
);
const call = factory(
  state, "https://api.deepseek.com", () => true,
  { getActiveBackend: () => ({ url: "https://openrouter.ai/api/v1" }) },
  fetchMock
);
const streamStart = html.indexOf("async *handleDeepSeekStreamingResponse(");
const streamEnd = html.indexOf("async callClaudeApi(", streamStart);
assert.ok(streamStart >= 0 && streamEnd > streamStart);
const streamMethod = new Function(
  "state", "usageNormalizer", "TextDecoderStream",
  "return ({ " + html.slice(streamStart, streamEnd) + " }).handleDeepSeekStreamingResponse;"
)(
  { abortController: null },
  { normalize: (_provider, usage) => usage },
  TextDecoderStream
);
const image = { inlineData: { mimeType: "image/png", data: "aGVsbG8=" } };
const messages = [
  { role: "user", parts: [{ text: "これは？" }, image] },
  { role: "model", parts: [{ text: "前の回答" }] }
];
const sys = { parts: [{ text: "システムプロンプト" }] };
async function send(model, config, input = messages, provider = "deepseek", stream = false) {
  const response = await call.call({}, "test-key", model, input, config, sys, stream, provider);
  assert.equal(response.ok, true);
  const last = calls.at(-1);
  assert.equal(last.request.model, model);
  assert.equal(last.request.stream, stream);
  if (provider === "deepseek") {
    assert.equal(last.options.headers.Authorization, "Bearer test-key");
    assert.equal(last.endpoint, "https://api.deepseek.com/chat/completions");
  }
  return last.request;
}
(async () => {
  for (const effort of ["low", "high", "max"]) {
    const req = await send("deepseek-flash", {
      deepSeekThinkingMode: "enabled", deepSeekReasoningEffort: effort,
      maxOutputTokens: 8192, temperature: 1.2, presencePenalty: 0.6,
      frequencyPenalty: 0.5, topP: 0.97
    });
    assert.deepEqual(req.thinking, { type: "enabled" });
    assert.equal(req.reasoning_effort, effort);
    assert.ok(!("temperature" in req));
    assert.ok(!("presence_penalty" in req));
    assert.ok(!("frequency_penalty" in req));
    assert.equal(req.max_tokens, 8192);
    assert.equal(req.top_p, 0.97);
    assert.equal(req.messages[0].role, "system");
    assert.equal(req.messages[0].content, "システムプロンプト");
    assert.equal(req.messages[1].role, "user");
    assert.deepEqual(req.messages[1].content, [
      { type: "text", text: "これは？" },
      { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } }
    ]);
    assert.equal(req.messages[2].role, "assistant");
  }
  const off = await send("deepseek-flash", {
    deepSeekThinkingMode: "disabled", deepSeekReasoningEffort: "max",
    temperature: 0.75, presencePenalty: 0.2
  });
  assert.deepEqual(off.thinking, { type: "disabled" });
  assert.ok(!("reasoning_effort" in off));
  assert.equal(off.temperature, 0.75);
  assert.equal(off.presence_penalty, 0.2);
  const legacy = await send("deepseek-flash", {}, messages, "deepseek", true);
  assert.ok(!("thinking" in legacy) && !("reasoning_effort" in legacy));
  assert.ok(!("temperature" in legacy));
  assert.ok(!("deepSeekThinkingMode" in legacy));
  const alias = await send("deepseek-v4-flash", {}, messages);
  assert.equal(alias.messages[1].content[1].type, "image_url");
  await assert.rejects(send("deepseek-v4-pro", {}, messages), /画像・ファイルに対応していません/);
  // The common OpenAI-compatible aggregator must not receive DeepSeek-only fields.
  const agg = await send("openai/any", {
    deepSeekThinkingMode: "enabled", deepSeekReasoningEffort: "max",
    temperature: 0.5
  }, [{ role: "user", parts: [{ text: "Hello" }] }], "llmaggregator");
  assert.ok(!("thinking" in agg));
  assert.ok(!("reasoning_effort" in agg));
  assert.equal(agg.temperature, 0.5);
  const encoder = new TextEncoder();
  const streamResponse = {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(
          'data: {"choices":[{"delta":{"reasoning_content":"考える","content":"回答"},"finish_reason":null}]}\n\n' +
          'data: {"choices":[{"delta":{"content":"です"},"finish_reason":"stop"}],"usage":{"total_tokens":13}}\n\n' +
          'data: [DONE]\n\n'
        ));
        controller.close();
      }
    })
  };
  const events = [];
  for await (const event of streamMethod(streamResponse)) events.push(event);
  assert.equal(events[0].thoughtText, "考える");
  assert.equal(events[0].contentText, "回答");
  assert.equal(events[1].contentText, "です");
  assert.equal(events.at(-1).usageMetadata.total_tokens, 13);
  console.log("PASS: DeepSeek V4.1 request modes, low/high/max, vision, legacy, streaming, aggregator, JS syntax");
})().catch(err => { console.error(err); process.exitCode = 1; });
