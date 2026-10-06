/** Server-side Responses API adapter shared by inference and Admin connectivity tests. */
export function openAiRequestBody(input: {
  model: string;
  systemPrompt: string;
  prompt: string;
  maxOutputTokens: number;
  requireJson: boolean;
}) {
  return {
    model: input.model,
    instructions: input.systemPrompt + (input.requireJson ? '\nReturn a valid JSON object.' : ''),
    input: input.prompt,
    max_output_tokens: input.maxOutputTokens,
    store: false,
    ...(input.requireJson ? { text: { format: { type: 'json_object' } } } : {})
  };
}

export function parseOpenAiResponse(data: Record<string, unknown>): string {
  if (data.status !== 'completed' || data.error) {
    throw new Error('OpenAI belum menyelesaikan analisis. Coba kembali atau tambah batas token.');
  }
  const text = (Array.isArray(data.output) ? data.output : [])
    .filter(item => item?.type === 'message' && item?.role === 'assistant')
    .flatMap(item => Array.isArray(item.content) ? item.content : [])
    .filter(part => part?.type === 'output_text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('OpenAI tidak mengembalikan teks analisis.');
  return text;
}
