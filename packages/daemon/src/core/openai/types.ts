import type { ContentBlock, MessagesRequest, Tool } from "../anthropic/types.js";

export type OpenAIChatRole = "system" | "developer" | "user" | "assistant" | "tool";

export type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type OpenAIMessageContent = string | OpenAIContentPart[] | null;

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface OpenAIChatMessage {
  role: OpenAIChatRole;
  content?: OpenAIMessageContent;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
}

export interface OpenAIFunctionTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface OpenAIChatCompletionRequest {
  model: string;
  messages: OpenAIChatMessage[];
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  tools?: OpenAIFunctionTool[];
  tool_choice?:
    | "auto"
    | "none"
    | "required"
    | { type: "function"; function: { name: string } };
  stop?: string | string[];
}

export interface OpenAIModel {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}

export interface OpenAIModelsResponse {
  object: "list";
  data: OpenAIModel[];
}

export interface OpenAIChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: "stop" | "length" | "tool_calls" | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type { ContentBlock, MessagesRequest, Tool };
