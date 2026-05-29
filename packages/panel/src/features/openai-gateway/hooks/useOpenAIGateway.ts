import { useMemo } from "react";
import { useAsyncResource } from "../../../shared/hooks/useAsyncResource.js";
import { openaiGatewayService } from "../services/openaiGatewayService.js";

export function useOpenAIGateway() {
  const resource = useAsyncResource(openaiGatewayService.get, []);
  const models = useAsyncResource(openaiGatewayService.models, []);

  const cursorFields = useMemo(() => {
    if (!resource.data) return [];
    return [
      { key: "baseUrl", label: "OpenAI Base URL", value: resource.data.baseUrl },
      { key: "apiKey", label: "API Key", value: resource.data.apiKey },
      { key: "modelsUrl", label: "Models Endpoint", value: resource.data.modelsUrl },
      {
        key: "chatCompletionsUrl",
        label: "Chat Completions",
        value: resource.data.chatCompletionsUrl,
      },
    ];
  }, [resource.data]);

  return { ...resource, cursorFields, models };
}
