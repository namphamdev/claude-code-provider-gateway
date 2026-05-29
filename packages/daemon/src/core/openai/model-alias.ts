export function toOpenAIModelId(internalModelId: string): string {
  if (internalModelId.startsWith("anthropic/commandcode/deepseek/")) {
    return `commandcode/${internalModelId.slice("anthropic/commandcode/deepseek/".length)}`;
  }
  return internalModelId.startsWith("anthropic/")
    ? internalModelId.slice("anthropic/".length)
    : internalModelId;
}

export function toInternalModelId(openAIModelId: string): string {
  if (
    openAIModelId.startsWith("anthropic/") ||
    openAIModelId.startsWith("claude-") ||
    openAIModelId.startsWith("chain/") ||
    openAIModelId.startsWith("fallback/")
  ) {
    return openAIModelId;
  }
  if (openAIModelId.startsWith("commandcode/")) {
    const model = openAIModelId.slice("commandcode/".length);
    if (model && !model.includes("/") && !model.startsWith("claude-")) {
      return `anthropic/commandcode/deepseek/${model}`;
    }
  }
  return `anthropic/${openAIModelId}`;
}
