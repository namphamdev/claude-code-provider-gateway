import assert from "node:assert/strict";
import test from "node:test";
import { buildDefaultConfig } from "../../config/index.js";
import { createProxyApp } from "../app.js";

test("OpenAI chat completions route rejects invalid API key with OpenAI error shape", async () => {
  const config = buildDefaultConfig();
  config.server.authToken = "secret";
  const app = createProxyApp(config, { loadConfig: () => config });

  const response = await app.request("/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer wrong" },
    body: JSON.stringify({
      model: "anthropic/openrouter/claude-test",
      messages: [{ role: "user", content: "hello" }],
    }),
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: {
      message: "Invalid API key",
      type: "authentication_error",
      code: "authentication_error",
    },
  });
});

test("models route returns OpenAI shape unless the caller is Anthropic", async () => {
  const config = buildDefaultConfig();
  config.server.authToken = "secret";
  config.providers.commandcode.enabled = true;
  config.providers.commandcode.apiKey = "test";
  config.providers.copilot.enabled = true;
  config.providers.copilot.authType = "oauth";
  config.providers.copilot.oauth = {
    accessToken: "gho_test",
    copilotToken: "copilot_test",
    copilotExpiresAt: Date.now() + 10 * 60_000,
    copilotEndpoint: "https://api.individual.githubcopilot.com",
  };
  config.activeProvider = "commandcode";
  config.modelMode = "single";
  const app = createProxyApp(config, { loadConfig: () => config });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://api.commandcode.ai/provider/v1/models") {
      return Response.json({
        object: "list",
        data: [
          {
            id: "deepseek/deepseek-v4-pro",
            object: "model",
            created: 1780058158,
            name: "DeepSeek V4 Pro",
          },
        ],
      });
    }
    if (url === "https://api.individual.githubcopilot.com/models") {
      return Response.json({
        object: "list",
        data: [
          {
            id: "claude-sonnet-4.6",
            name: "Claude Sonnet 4.6",
            capabilities: { type: "chat", supports: { streaming: true, tool_calls: true } },
            model_picker_enabled: true,
            policy: { state: "enabled" },
            supported_endpoints: ["/chat/completions"],
          },
        ],
      });
    }
    return Response.json({ error: "unexpected url" }, { status: 500 });
  };

  try {
    const openaiResponse = await app.request("/v1/models", {
      headers: { Authorization: "Bearer secret" },
    });
    assert.equal(openaiResponse.status, 200);
    const openaiBody = (await openaiResponse.json()) as {
      object?: string;
      data?: Array<{ id: string; object: string; owned_by: string }>;
    };
    assert.equal(openaiBody.object, "list");
    assert.ok(Array.isArray(openaiBody.data));
    assert.ok(openaiBody.data.some((model) => model.id === "commandcode/deepseek-v4-pro"));
    assert.ok(openaiBody.data.some((model) => model.id === "copilot/claude-sonnet-4.6"));
    assert.equal(
      openaiBody.data.find((model) => model.id === "commandcode/deepseek-v4-pro")?.owned_by,
      "commandcode",
    );

    const anthropicResponse = await app.request("/v1/models", {
      headers: { Authorization: "Bearer secret", "anthropic-version": "2023-06-01" },
    });
    assert.equal(anthropicResponse.status, 200);
    const anthropicBody = (await anthropicResponse.json()) as {
      object?: string;
      data?: Array<{ id: string; type: string; display_name: string }>;
    };
    assert.equal(anthropicBody.object, undefined);
    assert.ok(Array.isArray(anthropicBody.data));
    assert.ok(
      anthropicBody.data.some(
        (model) => model.id === "anthropic/commandcode/deepseek/deepseek-v4-pro",
      ),
    );
    assert.ok(
      !anthropicBody.data.some((model) => model.id === "anthropic/copilot/claude-sonnet-4.6"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI chat completions accepts short provider/model IDs", async () => {
  const config = buildDefaultConfig();
  config.server.authToken = "secret";
  config.providers.commandcode.enabled = true;
  const app = createProxyApp(config, { loadConfig: () => config });

  const response = await app.request("/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer secret" },
    body: JSON.stringify({
      model: "commandcode/deepseek-v4-pro",
      messages: [{ role: "user", content: "hello" }],
    }),
  });

  assert.equal(response.status, 401);
  const body = (await response.json()) as { error?: { message?: string } };
  assert.match(body.error?.message ?? "", /Command Code API key is missing/);
});
