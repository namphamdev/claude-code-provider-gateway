import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderConfig } from "../../../config/schema.js";
import { CommandCodeProvider } from "./index.js";

test("CommandCodeProvider posts Anthropic messages to the Provider API", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedHeaders: Headers;
  let capturedBody: Record<string, unknown> | undefined;

  globalThis.fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedHeaders = new Headers(init?.headers);
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      new ReadableStream<Uint8Array>({ start: (controller) => controller.close() }),
      { status: 200 },
    );
  };

  try {
    const provider = new CommandCodeProvider(commandCodeConfig());
    const result = await provider.streamResponse(
      {
        model: "anthropic/commandcode/claude-sonnet-4-6",
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
      },
      3,
    );

    assert.equal(result.error, undefined);
    assert.equal(capturedUrl, "https://api.commandcode.ai/alpha/generate/messages");
    assert.equal(capturedHeaders!.get("Authorization"), "Bearer user_test");
    assert.equal(capturedHeaders!.get("Content-Type"), "application/json");
    assert.equal(capturedHeaders!.get("anthropic-version"), "2023-06-01");
    assert.equal(capturedBody!.model, "claude-sonnet-4-6");
    assert.equal(capturedBody!.stream, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CommandCodeProvider posts non-Claude models to the OpenAI-compatible endpoint", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedHeaders: Headers;
  let capturedBody: Record<string, any> | undefined;

  globalThis.fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedHeaders = new Headers(init?.headers);
    capturedBody = JSON.parse(String(init?.body)) as Record<string, any>;
    return new Response(
      new ReadableStream<Uint8Array>({ start: (controller) => controller.close() }),
      { status: 200 },
    );
  };

  try {
    const provider = new CommandCodeProvider(commandCodeConfig());
    const result = await provider.streamResponse(
      {
        model: "anthropic/commandcode/deepseek/deepseek-v4-pro",
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
      },
      3,
    );

    assert.equal(result.error, undefined);
    assert.equal(capturedUrl, "https://api.commandcode.ai/alpha/generate/chat/completions");
    assert.equal(capturedHeaders!.get("Authorization"), "Bearer user_test");
    assert.equal(capturedHeaders!.get("Content-Type"), "application/json");
    assert.equal(capturedBody!.model, "deepseek/deepseek-v4-pro");
    assert.equal(capturedBody!.stream, true);
    assert.deepEqual(capturedBody!.messages, [{ role: "user", content: "hi" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CommandCodeProvider treats the legacy provider/v1 URL as the generate API base", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";

  globalThis.fetch = async (url) => {
    capturedUrl = String(url);
    return new Response(
      new ReadableStream<Uint8Array>({ start: (controller) => controller.close() }),
      { status: 200 },
    );
  };

  try {
    const provider = new CommandCodeProvider({
      ...commandCodeConfig(),
      baseUrl: "https://api.commandcode.ai/provider/v1",
    });
    const result = await provider.streamResponse(
      {
        model: "anthropic/commandcode/claude-sonnet-4-6",
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
      },
      3,
    );

    assert.equal(result.error, undefined);
    assert.equal(capturedUrl, "https://api.commandcode.ai/alpha/generate/messages");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CommandCodeProvider lists every discovered model from the Provider API", async () => {
  await assert.rejects(
    new CommandCodeProvider({
      ...commandCodeConfig(),
      apiKey: "",
    }).listModels(),
    /Command Code API key is missing/,
  );

  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedHeaders: Headers;
  globalThis.fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedHeaders = new Headers(init?.headers);
    return Response.json({
      object: "list",
      data: [
        {
          id: "claude-sonnet-4-6",
          object: "model",
          created: 1780031151,
          name: "Claude Sonnet 4.6",
        },
        {
          id: "anthropic/claude-opus-4-8",
          object: "model",
          created: 1780031151,
          name: "Claude Opus 4.8",
        },
        {
          id: "deepseek/deepseek-v4-pro",
          object: "model",
          created: 1780031151,
          name: "DeepSeek V4 Pro",
        },
      ],
    });
  };

  try {
    const models = await new CommandCodeProvider({
      ...commandCodeConfig(),
      models: ["manual/model"],
    }).listModels();

    assert.equal(capturedUrl, "https://api.commandcode.ai/alpha/generate/models");
    assert.equal(capturedHeaders!.get("Authorization"), "Bearer user_test");
    assert.deepEqual(
      models.map((model) => model.id),
      [
        "anthropic/commandcode/claude-sonnet-4-6",
        "anthropic/commandcode/claude-opus-4-8",
        "anthropic/commandcode/deepseek/deepseek-v4-pro",
      ],
    );
    assert.ok(!models.some((model) => model.id.includes("manual/model")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function commandCodeConfig(): ProviderConfig {
  return {
    enabled: true,
    apiKey: "user_test",
    authType: "api_key",
    baseUrl: "https://api.commandcode.ai/alpha/generate",
    rateLimit: 40,
    rateWindow: 60,
    maxConcurrency: 5,
  };
}
