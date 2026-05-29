import type {
  ContentBlock,
  MessagesRequest,
  OpenAIChatCompletionRequest,
  OpenAIChatMessage,
  Tool,
} from "./types.js";

const DEFAULT_MAX_TOKENS = 4096;

export function openAIToAnthropic(req: OpenAIChatCompletionRequest): MessagesRequest {
  const system: string[] = [];
  const messages: MessagesRequest["messages"] = [];

  for (const message of req.messages ?? []) {
    if (message.role === "system" || message.role === "developer") {
      const text = contentToText(message.content);
      if (text) system.push(text);
      continue;
    }

    if (message.role === "tool") {
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.tool_call_id ?? "tool_call",
            content: contentToText(message.content),
          },
        ],
      });
      continue;
    }

    if (message.role === "assistant") {
      messages.push({ role: "assistant", content: assistantContent(message) });
      continue;
    }

    messages.push({ role: "user", content: userContent(message.content) });
  }

  const anthropic: MessagesRequest = {
    model: req.model,
    messages,
    max_tokens: req.max_completion_tokens ?? req.max_tokens ?? DEFAULT_MAX_TOKENS,
  };

  if (system.length) anthropic.system = system.join("\n\n");
  if (req.temperature !== undefined) anthropic.temperature = req.temperature;
  if (req.top_p !== undefined) anthropic.top_p = req.top_p;
  if (req.stop) anthropic.stop_sequences = Array.isArray(req.stop) ? req.stop : [req.stop];
  if (req.tools?.length) anthropic.tools = req.tools.map(openAIToolToAnthropic);
  if (req.tool_choice) anthropic.tool_choice = openAIToolChoiceToAnthropic(req.tool_choice);

  return anthropic;
}

function openAIToolToAnthropic(tool: NonNullable<OpenAIChatCompletionRequest["tools"]>[number]): Tool {
  return {
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters ?? { type: "object", properties: {} },
  };
}

function openAIToolChoiceToAnthropic(
  choice: NonNullable<OpenAIChatCompletionRequest["tool_choice"]>,
): MessagesRequest["tool_choice"] | undefined {
  if (choice === "none") return undefined;
  if (choice === "auto") return { type: "auto" };
  if (choice === "required") return { type: "any" };
  return { type: "tool", name: choice.function.name };
}

function assistantContent(message: OpenAIChatMessage): string | ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const text = contentToText(message.content);
  if (text) blocks.push({ type: "text", text });

  for (const call of message.tool_calls ?? []) {
    blocks.push({
      type: "tool_use",
      id: call.id,
      name: call.function.name,
      input: parseToolArguments(call.function.arguments),
    });
  }

  return blocks.length ? blocks : "";
}

function userContent(content: OpenAIChatMessage["content"]): string | ContentBlock[] {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content.flatMap((part): ContentBlock[] => {
    if (part.type === "text") return [{ type: "text", text: part.text }];
    const image = imageUrlToAnthropic(part.image_url.url);
    return image ? [image] : [{ type: "text", text: part.image_url.url }];
  });
}

function contentToText(content: OpenAIChatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function imageUrlToAnthropic(url: string): ContentBlock | null {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(url);
  if (match) {
    return {
      type: "image",
      source: { type: "base64", media_type: match[1], data: match[2] },
    };
  }
  return { type: "image", source: { type: "url", url } };
}

function parseToolArguments(value: string): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
