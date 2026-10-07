export type AiProvider = 'cloudflare' | 'openai' | 'gemini' | 'groq' | 'openrouter';

export type AiLevel = 'FAST' | 'STANDARD' | 'ADVANCED';

export type AiFeature =
  | 'assistant_chat'
  | 'process_analysis'
  | 'process_document'
  | 'risk_register'
  | 'risk_heatmap'
  | 'materiality'
  | 'significant_accounts'
  | 'enterprise_overview'
  | 'regulatory_intelligence';

export type AiSensitivity = 'public' | 'internal' | 'confidential' | 'restricted';

export type AiTask =
  | 'process_analysis'
  | 'process_flow'
  | 'process_document_analysis'
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
  institutionId?: string;
  feature?: AiFeature;
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
  aiLevel?: AiLevel;
  routingSource?: 'admin' | 'default';
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
