export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | LlmContentBlock[];
  toolCallId?: string;
}

export type LlmContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface LlmToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LlmCompletionRequest {
  system?: string;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  responseFormat?: 'text' | 'json';
}

export interface LlmCompletionResponse {
  text: string;
  toolCalls: LlmToolCall[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'unknown';
  rawContent?: unknown;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LlmProvider {
  readonly name: string;

  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;

  supportsToolCalling(): boolean;

  isAvailable(): Promise<boolean>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
export const LLM_CLASSIFIER_PROVIDER = Symbol('LLM_CLASSIFIER_PROVIDER');
