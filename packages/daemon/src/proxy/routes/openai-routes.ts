import type { Hono } from "hono";
import { openAIToAnthropic } from "../../core/openai/conversion.js";
import {
  anthropicStreamToOpenAI,
  anthropicStreamToOpenAICompletion,
} from "../../core/openai/stream.js";
import { toInternalModelId, toOpenAIModelId } from "../../core/openai/model-alias.js";
import type { OpenAIChatCompletionRequest } from "../../core/openai/types.js";
import { getProxySessionId, requireOpenAIAuth } from "../middleware/auth.js";
import type { ProxyRuntime } from "../runtime.js";
import { MessageService } from "../services/index.js";

export function registerOpenAIRoutes(app: Hono, runtime: ProxyRuntime): void {
  const messages = new MessageService(runtime);

  app.use("/v1/chat/*", requireOpenAIAuth(runtime));

  app.on(["HEAD", "OPTIONS"], "/v1/chat/completions", (_c) => new Response(null, { status: 204 }));

  app.post("/v1/chat/completions", async (c) => {
    const req = await c.req.json<OpenAIChatCompletionRequest>();
    const requestedModel = req.model;
    const anthropicReq = openAIToAnthropic({ ...req, model: toInternalModelId(req.model) });
    const result = await messages.createMessage(
      anthropicReq,
      getProxySessionId(c),
      c.req.raw.signal,
    );

    if (result.kind === "error") {
      return new Response(
        JSON.stringify({
          error: {
            message: result.body.error.message,
            type: result.body.error.type,
            code: result.body.error.type,
          },
        }),
        { status: result.status, headers: { "Content-Type": "application/json" } },
      );
    }

    if (req.stream) {
      return new Response(
        anthropicStreamToOpenAI(
          result.stream,
          toOpenAIModelId(requestedModel),
        ) as unknown as BodyInit,
        {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        },
      );
    }

    return c.json(
      await anthropicStreamToOpenAICompletion(result.stream, toOpenAIModelId(requestedModel)),
    );
  });
}
