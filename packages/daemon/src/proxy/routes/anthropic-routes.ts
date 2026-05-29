import type { Hono } from "hono";
import type { CountTokensRequest, MessagesRequest } from "../../core/anthropic/index.js";
import { toOpenAIModels } from "../../core/openai/stream.js";
import { getSessionConfig } from "../../runtime/sessions/index.js";
import { getProxySessionId, requireAnthropicAuth } from "../middleware/auth.js";
import type { ProxyRuntime } from "../runtime.js";
import { MessageService, ModelService } from "../services/index.js";

export function registerAnthropicRoutes(app: Hono, runtime: ProxyRuntime): void {
  const messages = new MessageService(runtime);
  const models = new ModelService(runtime);

  app.use("/v1/messages", requireAnthropicAuth(runtime));
  app.use("/v1/messages/*", requireAnthropicAuth(runtime));
  app.use("/v1/models", requireAnthropicAuth(runtime));

  app.on(["HEAD", "OPTIONS"], "/v1/messages", (_c) => new Response(null, { status: 204 }));
  app.on(
    ["HEAD", "OPTIONS"],
    "/v1/messages/count_tokens",
    (_c) => new Response(null, { status: 204 }),
  );

  app.post("/v1/messages/count_tokens", async (c) => {
    const req = await c.req.json<CountTokensRequest>();
    const tokens = messages.countTokens(req as MessagesRequest, getProxySessionId(c));
    return c.json({ input_tokens: tokens });
  });

  app.get("/v1/models", async (c) => {
    const sessionConfig = getSessionConfig(getProxySessionId(c));
    const config = sessionConfig ?? runtime.currentConfig();
    if (!c.req.header("anthropic-version")) {
      const modelList = await models.listModels({
        ...config,
        modelMode: "all",
        activeModelFallbackSlug: null,
      });
      return c.json(toOpenAIModels(modelList));
    }
    const modelList = await models.listModels(config);
    return c.json(modelList);
  });

  app.post("/v1/messages", async (c) => {
    const req = await c.req.json<MessagesRequest>();
    const result = await messages.createMessage(req, getProxySessionId(c), c.req.raw.signal);

    if (result.kind === "error") {
      if (result.status === 499) {
        return new Response(JSON.stringify(result.body), {
          status: result.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      return c.json(result.body, result.status);
    }

    return new Response(result.stream as unknown as BodyInit, {
      status: result.status,
      headers: result.headers,
    });
  });
}
