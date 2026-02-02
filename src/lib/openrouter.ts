// OpenRouter API 封装

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
  plugins?: string[]  // OpenRouter 插件（如 web search）
}

export interface ChatCompletionOptions {
  temperature?: number
  max_tokens?: number
  webSearch?: boolean
  thinkingMode?: boolean
}

export interface ChatCompletionResponse {
  id: string
  choices: {
    message: ChatMessage
    finish_reason: string
  }[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// 可用模型列表
export const AVAILABLE_MODELS = {
  // 免费用户可用
  free: [
    'meta-llama/llama-3.1-8b-instruct:free',
    'google/gemma-2-9b-it:free',
    'mistralai/mistral-7b-instruct:free',
  ],
  // Pro 用户可用
  pro: [
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'google/gemini-pro-1.5',
    'meta-llama/llama-3.1-70b-instruct',
    'deepseek/deepseek-r1',  // 深度思考模型
  ],
}

// 深度思考模型
export const THINKING_MODEL = 'deepseek/deepseek-r1'

// 默认模型
export const DEFAULT_MODEL = {
  free: 'meta-llama/llama-3.1-8b-instruct:free',
  pro: 'openai/gpt-4o-mini',
}

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

// 非流式请求
export async function chatCompletion(
  messages: ChatMessage[],
  model: string,
  options?: { temperature?: number; max_tokens?: number }
): Promise<ChatCompletionResponse> {
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
      'X-Title': 'AI Chat Desktop',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 2048,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`)
  }

  return response.json()
}

// 流式请求
export async function chatCompletionStream(
  messages: ChatMessage[],
  model: string,
  options?: ChatCompletionOptions
): Promise<ReadableStream> {
  // 构建请求体
  const requestBody: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.max_tokens ?? 2048,
  }

  // 如果启用网络搜索，添加 plugins
  if (options?.webSearch) {
    requestBody.plugins = ['web']
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
      'X-Title': 'AI Chat Desktop',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`)
  }

  return response.body!
}

// 验证模型是否可用
export function isModelAllowed(model: string, isPro: boolean): boolean {
  if (isPro) {
    return [...AVAILABLE_MODELS.free, ...AVAILABLE_MODELS.pro].includes(model)
  }
  return AVAILABLE_MODELS.free.includes(model)
}
