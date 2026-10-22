// Offline regression test for Gemini 3.8 Flash request compatibility.
// No API key or network access is used.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8")
  .replace(/\r\n/g, "\n");

// Check all inline scripts in the actual served HTML.
let scriptCount = 0;
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  if (match[1].trim()) {
    new vm.Script(match[1]);
    scriptCount++;
  }
}
assert.ok(scriptCount > 0, "inline JavaScript found");

function codeBetween(begin, end, startAt = 0) {
  const a = html.indexOf(begin, startAt);
  const b = html.indexOf(end, a + begin.length);
  assert.ok(a >= 0 && b > a, `could not extract ${begin}`);
  return html.slice(a, b);
}

// Execute the production code that appends dummy messages and prepares configs.
const messagesCode = codeBetween(
  "const dummyUserTextToUse =",
  "let systemInstructionForProvider ="
);
const buildMessages = new Function(
  "apiMessages", "selectedApiProvider", "modelNameToUse",
  "contextEnableDummyUser", "contextDummyUser",
  "contextEnableDummyModel", "contextDummyModel",
  "contextTemperature", "contextMaxTokens", "contextTopP",
  "contextPresencePenalty", "contextFrequencyPenalty",
  "contextGeminiTopK", "contextGeminiThinkingBudget",
  "contextGeminiThinkingLevel38", "contextIncludeThoughts",
  messagesCode + "\nreturn { apiMessages, commonGenerationConfig };"
);
function messageCase(model, level, includeThoughts = false) {
  return buildMessages(
    [{ role: "user", parts: [{ text: "Hello" }] }],
    "gemini", model, true, "dummy user", true, "dummy model",
    0.7, 2048, 0.9, 0, 0, 40, 777, level, includeThoughts
  );
}

const requestCode = codeBetween(
  "const finalGenerationConfig = { ...generationConfig };",
  "          try {\n            const response = await fetch",
  html.indexOf("async callGeminiApi(")
);
const buildRequest = new Function(
  "model", "generationConfig", "messagesForApi", "systemInstruction",
  "serviceTier", "state", "enableImageGen", "enableGrounding",
  requestCode + "\nreturn requestBody;"
);
const state = { settings: {
  geminiThinkingBudget: 777, geminiIncludeThoughts: true,
  geminiImageAspectRatio: "", geminiImageResolution: ""
} };
function requestCase(model, messages, config) {
  return buildRequest(
    model, config, messages,
    { parts: [{ text: "System prompt" }] },
    undefined, state, false, false
  );
}

for (const level of ["low", "medium", "high"]) {
  const { apiMessages, commonGenerationConfig } = messageCase(
    "gemini-3.8-flash", level, true
  );
  assert.deepEqual(apiMessages.map((m) => m.role), ["user", "user"]);
  assert.deepEqual(commonGenerationConfig.thinkingConfig, {
    thinkingLevel: level.toUpperCase(), includeThoughts: true
  });
  commonGenerationConfig.candidateCount = 2;
  const req = requestCase("gemini-3.8-flash", apiMessages, commonGenerationConfig);
  for (const field of [
    "temperature", "topP", "topK", "presencePenalty",
    "frequencyPenalty", "candidateCount"
  ]) {
    assert.ok(!(field in req.generationConfig), field + " must be omitted");
  }
  assert.deepEqual(req.generationConfig.thinkingConfig, {
    thinkingLevel: level.toUpperCase(), includeThoughts: true
  });
  assert.equal(req.safetySettings.length, 4);
}
const defaults = messageCase("gemini-3.8-flash", "", false);
const defaultReq = requestCase(
  "gemini-3.8-flash", defaults.apiMessages, defaults.commonGenerationConfig
);
assert.ok(!defaultReq.generationConfig?.thinkingConfig?.thinkingLevel);

// Existing behavior for earlier models must remain intact.
const legacy = messageCase("gemini-2.5-pro", "low");
assert.deepEqual(legacy.apiMessages.map((m) => m.role), ["user", "user", "model"]);
assert.equal(legacy.commonGenerationConfig.thinkingConfig.thinkingBudget, 777);
const legacyReq = requestCase(
  "gemini-2.5-pro", legacy.apiMessages, legacy.commonGenerationConfig
);
assert.equal(legacyReq.generationConfig.thinkingConfig.thinkingBudget, 777);
const argon = requestCase("gemini-4-argon", [], {
  temperature: 0.3, thinkingConfig: { thinkingBudget: 777 }
});
assert.ok(!argon.generationConfig?.thinkingConfig?.thinkingBudget);

assert.equal((html.match(/id="gemini-thinking-level-38"/g) || []).length, 1);
assert.match(html, /contextConcatDummyModel && dummyModelTextToUse && !isGemini38FlashRequest/);
console.log("PASS: 3.8 request compatibility, 2.5/Argon regression, inline JS syntax");
