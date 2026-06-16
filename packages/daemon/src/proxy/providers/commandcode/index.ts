import type { ProviderConfig } from "../../../config/schema.js";
import type { MessagesRequest, ModelInfo } from "../../../core/anthropic/types.js";
import { fetchProviderJson } from "../shared/api-client.js";
import { BaseProvider, type ProviderRequestOptions, type StreamResult } from "../shared/base.js";
import { stripGatewayProviderPrefix } from "../shared/model-prefix.js";
import { AnthropicMessagesTransport } from "../transports/anthropic.js";
import { OpenAIChatTransport } from "../transports/openai.js";

export const DEFAULT_COMMANDCODE_BASE_URL = "https://api.commandcode.ai/alpha/generate";

interface CommandCodeModel {
  id: string;
  name?: string;
  created?: number;
}

export class CommandCodeProvider extends BaseProvider {
  private readonly anthropic: CommandCodeAnthropicTransport;
  private readonly openai: CommandCodeOpenAITransport;

  constructor(config: ProviderConfig) {
    super(config);
    this.anthropic = new CommandCodeAnthropicTransport(config);
    this.openai = new CommandCodeOpenAITransport(config);
  }

  get id() {
    return "commandcode";
  }

  get label() {
    return "Command Code";
  }

  async streamResponse(
    req: MessagesRequest,
    inputTokens: number,
    options?: ProviderRequestOptions,
  ): Promise<StreamResult> {
    const model = resolveCommandCodeModel(req.model);
    const transport = isAnthropicMessagesModel(model) ? this.anthropic : this.openai;
    return transport.streamResponse(req, inputTokens, options);
  }

  override async listModels(): Promise<ModelInfo[]> {
    if (this.requiresApiKey() && !this.hasApiKey()) {
      throw new Error(this.missingApiKeyMessage());
    }

    const url = `${this.baseUrl().replace(/\/$/, "")}/models`;
    const json = await fetchProviderJson<{ data?: CommandCodeModel[] }>({
      url,
      headers: { Authorization: this.authHeader() },
      timeoutMs: this.requestTimeoutMs(),
    });

    const data = Array.isArray(json.data) ? json.data : [];
    return data
      .filter(
        (entry): entry is CommandCodeModel =>
          typeof entry === "object" && entry !== null && typeof entry.id === "string",
      )
      .map(normalizeCommandCodeModel)
      .filter((model): model is CommandCodeModel => !!model)
      .map((model) => ({
        type: "model" as const,
        id: `anthropic/${this.id}/${model.id}`,
        display_name: `${this.label} · ${model.name ?? model.id}`,
        created_at: new Date((model.created ?? 0) * 1000).toISOString(),
      }));
  }

  protected override baseUrl(): string {
    return commandCodeBaseUrl(this.config);
  }
}

class CommandCodeAnthropicTransport extends AnthropicMessagesTransport {
  get id() {
    return "commandcode";
  }

  get label() {
    return "Command Code";
  }

  protected override baseUrl(): string {
    return commandCodeBaseUrl(this.config);
  }

  protected override resolveModel(model: string): string {
    return resolveCommandCodeModel(model);
  }
}

class CommandCodeOpenAITransport extends OpenAIChatTransport {
  get id() {
    return "commandcode";
  }

  get label() {
    return "Command Code";
  }

  protected override baseUrl(): string {
    return commandCodeBaseUrl(this.config);
  }

  protected override resolveModel(model: string): string {
    return resolveCommandCodeModel(model);
  }
}

function normalizeCommandCodeModel(model: CommandCodeModel): CommandCodeModel | null {
  const id = stripCommandCodeModelPrefix(model.id.trim());
  if (!id) return null;
  return { ...model, id };
}

function commandCodeBaseUrl(config: ProviderConfig): string {
  const configured = config.baseUrl?.trim().replace(/\/$/, "");
  if (
    !configured ||
    configured === DEFAULT_COMMANDCODE_BASE_URL ||
    configured === "https://api.commandcode.ai/provider/v1"
  ) {
    return DEFAULT_COMMANDCODE_BASE_URL;
  }
  return configured;
}

function resolveCommandCodeModel(model: string): string {
  return stripCommandCodeModelPrefix(stripGatewayProviderPrefix(model, "commandcode"));
}

function stripCommandCodeModelPrefix(model: string): string {
  if (model.startsWith("commandcode/")) return model.slice("commandcode/".length);
  if (model.startsWith("anthropic/")) return model.slice("anthropic/".length);
  return model;
}

function isAnthropicMessagesModel(model: string): boolean {
  return model.startsWith("claude-");
}
