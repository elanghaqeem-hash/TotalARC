export type AiProvider = 'cloudflare' | 'gemini' | 'groq' | 'openrouter';

export type AiSensitivity = 'public' | 'internal' | 'confidential' | 'restricted';

export type AiTask =
  | 'process_analysis'
  | 'process_flow'
  | 'risk_identification'
  | 'control_gap'
  | 'rcm_generation'
  | 'rcsa'
  | 'tod'
  | 'toe'
  | 'remediation'
  | 'root_cause'
  | 'classification'
  | 'control_classification'
  | 'summarization'
  | 'evidence_summary'
  | 'chat';

export interface AiGatewayRequest {
  task: AiTask;
  sensitivity?: AiSensitivity;
  systemPrompt: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  requireJson?: boolean;
}

export interface AiGatewayResult {
  requestId: string;
  text: string;
  provider: AiProvider;
  model: string;
  attemptedProviders: AiProvider[];
  fallbackUsed: boolean;
  redactions: number;
  durationMs: number;
}

export interface AiProviderStatus {
  provider: AiProvider;
  configured: boolean;
  model: string;
  role: string;
}

export interface AiGatewayStatus {
  defaultSensitivity: AiSensitivity;
  externalSensitiveFallbackEnabled: boolean;
  externalRedactionEnabled: boolean;
  providers: AiProviderStatus[];
}
