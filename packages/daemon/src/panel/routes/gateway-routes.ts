import type { Hono } from "hono";
import type { PanelRuntime } from "../runtime.js";

type OpenAIModelsResponse = {
  data?: Array<{
    id?: string;
    object?: string;
    created?: number;
    owned_by?: string;
  }>;
};

export function registerGatewayRoutes(app: Hono, runtime: PanelRuntime): void {
  app.get("/api/openai-gateway", (c) => {
    const config = runtime.currentConfig();
    const baseUrl = `http://127.0.0.1:${config.server.proxyPort}/v1`;
    const apiKey = config.server.authToken;
    const exampleModel = "commandcode/deepseek-v4-pro";
    const examples = [
      {
        key: "models",
        title: "List models",
        command: [`curl ${baseUrl}/models`, `  -H "Authorization: Bearer ${apiKey}"`].join(
          " \\\n",
        ),
      },
      {
        key: "chat",
        title: "Chat completion",
        command: [
          `curl ${baseUrl}/chat/completions`,
          `  -H "Authorization: Bearer ${apiKey}"`,
          `  -H "Content-Type: application/json"`,
          `  -d '{"model":"${exampleModel}","messages":[{"role":"user","content":"Hello"}]}'`,
        ].join(" \\\n"),
      },
      {
        key: "stream",
        title: "Streaming chat",
        command: [
          `curl ${baseUrl}/chat/completions`,
          `  -H "Authorization: Bearer ${apiKey}"`,
          `  -H "Content-Type: application/json"`,
          `  -d '{"model":"${exampleModel}","stream":true,"messages":[{"role":"user","content":"Write one short sentence."}]}'`,
        ].join(" \\\n"),
      },
    ];

    return c.json({
      baseUrl,
      chatCompletionsUrl: `${baseUrl}/chat/completions`,
      modelsUrl: `${baseUrl}/models`,
      apiKey,
      exampleModel,
      curl: examples[1].command,
      examples,
    });
  });

  app.get("/api/openai-gateway/models", async (c) => {
    const config = runtime.currentConfig();
    const baseUrl = `http://127.0.0.1:${config.server.proxyPort}/v1`;

    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${config.server.authToken}` },
      });
      const body = (await response.json().catch(() => ({}))) as OpenAIModelsResponse & {
        error?: { message?: string };
      };

      if (!response.ok) {
        return c.json(
          { error: body.error?.message ?? `Model list failed: HTTP ${response.status}` },
          502,
        );
      }

      return c.json({
        models: (body.data ?? [])
          .filter((model) => typeof model.id === "string" && model.id)
          .map((model) => ({
            id: model.id!,
            ownedBy: model.owned_by ?? "cc-provider-gateway",
            created: model.created ?? 0,
          })),
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 502);
    }
  });
}
