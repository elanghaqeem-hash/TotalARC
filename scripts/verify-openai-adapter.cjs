const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const compiled = ts.transpileModule(fs.readFileSync('src/lib/ai/openai.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const { openAiRequestBody, parseOpenAiResponse } = context.exports;
const body = openAiRequestBody({ model: 'configured-model', systemPrompt: 'Analisis', prompt: 'data', maxOutputTokens: 512, requireJson: true });
assert.equal(body.store, false);
assert.equal(body.text.format.type, 'json_object');
assert.equal(body.temperature, undefined);
assert.equal(parseOpenAiResponse({ status: 'completed', output: [
  { type: 'reasoning', content: [] },
  { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hasil' }] }
] }), 'hasil');
for (const data of [
  { status: 'incomplete', output: [] },
  { status: 'completed', output: [] },
  { status: 'completed', error: {}, output: [] }
]) assert.throws(() => parseOpenAiResponse(data));
console.log('OpenAI adapter checks passed: JSON request, no storage, reasoning-safe parsing, incomplete/empty/error rejected.');
