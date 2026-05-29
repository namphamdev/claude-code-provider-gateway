import { http } from "../../../shared/api/http.js";
import type { OpenAIGatewayInfo, OpenAIGatewayModels } from "../domain/types.js";

export const openaiGatewayService = {
  get: () => http.get<OpenAIGatewayInfo>("/openai-gateway"),
  models: () => http.get<OpenAIGatewayModels>("/openai-gateway/models"),
};
