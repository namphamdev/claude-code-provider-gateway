import { randomUUID } from "node:crypto";
import type { ModelsListResponse } from "../anthropic/types.js";
import type {
  OpenAIChatCompletionResponse,
  OpenAIModel,
  OpenAIModelsResponse,
  OpenAIToolCall,
} from "./types.js";
import { toOpenAIModelId } from "./model-alias.js";

type FinishReason = "stop" | "length" | "tool_calls" | null;

interface AnthropicEvent {
  event: string;
  data: Record<string, unknown>;
}

interface ToolAccumulator {
  id: string;
  name: string;
  arguments: string;
}

interface CompletionAccumulator {
  id: string;
  created: number;
  model: string;
  content: string;
  tools: Map<number, ToolAccumulator>;
  promptTokens: number;
  completionTokens: number;
  finishReason: FinishReason;
}

export function toOpenAIModels(models: ModelsListResponse): OpenAIModelsResponse {
  return {
    object: "list",
    data: models.data.map((model): OpenAIModel => {
      const created = Math.floor(new Date(model.created_at).getTime() / 1000);
      const id = toOpenAIModelId(model.id);
      return {
        id,
        object: "model",
        created: Number.isFinite(created) ? created : 0,
        owned_by: ownerFromModelId(id),
      };
    }),
  };
}

export function anthropicStreamToOpenAI(
  stream: ReadableStream<string>,
  requestedModel: string,
): ReadableStream<string> {
  const state = createAccumulator(requestedModel);
  let buffer = "";

  return new ReadableStream<string>({
    async start(controller) {
      const reader = stream.getReader();
      const enqueue = (payload: unknown) => {
        controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`);
      };

      enqueue(chunk(state, { role: "assistant", content: "" }, null));

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += value;
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const event = parseAnthropicFrame(frame);
            if (!event) continue;
            for (const payload of applyAnthropicEvent(state, event)) enqueue(payload);
          }
        }

        enqueue(chunk(state, {}, state.finishReason ?? "stop"));
        controller.enqueue("data: [DONE]\n\n");
      } catch (err) {
        enqueue({
          error: {
            message: String(err),
            type: "api_error",
          },
        });
      } finally {
        controller.close();
      }
    },
  });
}

export async function anthropicStreamToOpenAICompletion(
  stream: ReadableStream<string>,
  requestedModel: string,
): Promise<OpenAIChatCompletionResponse> {
  const state = createAccumulator(requestedModel);
  let buffer = "";
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const event = parseAnthropicFrame(frame);
      if (event) applyAnthropicEvent(state, event);
    }
  }

  const toolCalls = [...state.tools.values()].map((tool): OpenAIToolCall => ({
    id: tool.id,
    type: "function",
    function: { name: tool.name, arguments: tool.arguments },
  }));

  return {
    id: state.id,
    object: "chat.completion",
    created: state.created,
    model: state.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: state.content || null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: state.finishReason ?? "stop",
      },
    ],
    usage: {
      prompt_tokens: state.promptTokens,
      completion_tokens: state.completionTokens,
      total_tokens: state.promptTokens + state.completionTokens,
    },
  };
}

function createAccumulator(model: string): CompletionAccumulator {
  return {
    id: `chatcmpl-${randomUUID().replace(/-/g, "")}`,
    created: Math.floor(Date.now() / 1000),
    model,
    content: "",
    tools: new Map(),
    promptTokens: 0,
    completionTokens: 0,
    finishReason: null,
  };
}

function parseAnthropicFrame(frame: string): AnthropicEvent | null {
  let event = "";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    if (line.startsWith("data: ")) dataLines.push(line.slice(6));
  }
  if (!event || !dataLines.length) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

function applyAnthropicEvent(
  state: CompletionAccumulator,
  event: AnthropicEvent,
): Array<Record<string, unknown>> {
  if (event.event === "message_start") {
    const message = event.data.message as Record<string, unknown> | undefined;
    const usage = message?.usage as Record<string, unknown> | undefined;
    state.promptTokens = Number(usage?.input_tokens ?? 0);
    return [];
  }

  if (event.event === "content_block_start") {
    const block = event.data.content_block as Record<string, unknown> | undefined;
    if (block?.type !== "tool_use") return [];
    const index = Number(event.data.index ?? 0);
    const toolIndex = state.tools.size;
    state.tools.set(index, {
      id: String(block.id ?? `call_${toolIndex}`),
      name: String(block.name ?? "tool"),
      arguments: "",
    });
    return [
      chunk(
        state,
        {
          tool_calls: [
            {
              index: toolIndex,
              id: state.tools.get(index)?.id,
              type: "function",
              function: { name: state.tools.get(index)?.name, arguments: "" },
            },
          ],
        },
        null,
      ),
    ];
  }

  if (event.event === "content_block_delta") {
    const delta = event.data.delta as Record<string, unknown> | undefined;
    if (delta?.type === "text_delta") {
      const text = String(delta.text ?? "");
      state.content += text;
      return [chunk(state, { content: text }, null)];
    }
    if (delta?.type === "input_json_delta") {
      const index = Number(event.data.index ?? 0);
      const tool = state.tools.get(index);
      if (!tool) return [];
      const partial = String(delta.partial_json ?? "");
      tool.arguments += partial;
      return [
        chunk(
          state,
          {
            tool_calls: [
              {
                index: [...state.tools.keys()].indexOf(index),
                function: { arguments: partial },
              },
            ],
          },
          null,
        ),
      ];
    }
  }

  if (event.event === "message_delta") {
    const delta = event.data.delta as Record<string, unknown> | undefined;
    const usage = event.data.usage as Record<string, unknown> | undefined;
    state.completionTokens = Number(usage?.output_tokens ?? state.completionTokens);
    state.finishReason = mapFinishReason(String(delta?.stop_reason ?? ""));
  }

  return [];
}

function chunk(
  state: CompletionAccumulator,
  delta: Record<string, unknown>,
  finishReason: FinishReason,
) {
  return {
    id: state.id,
    object: "chat.completion.chunk",
    created: state.created,
    model: state.model,
    choices: [{ index: 0, delta, logprobs: null, finish_reason: finishReason }],
    usage: null,
  };
}

function mapFinishReason(reason: string): FinishReason {
  if (reason === "max_tokens") return "length";
  if (reason === "tool_use") return "tool_calls";
  if (reason) return "stop";
  return null;
}

function ownerFromModelId(id: string): string {
  const match = /^(?:anthropic\/)?([^/]+)/.exec(id);
  return match?.[1] ?? "cc-provider-gateway";
}
