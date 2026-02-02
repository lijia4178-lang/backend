import { NextRequest, NextResponse } from 'next/server'
import { AVAILABLE_MODELS, DEFAULT_MODEL } from '@/lib/openrouter'

// CORS 头
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'http://localhost:5173',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// 获取可用模型列表（无需认证）
export async function GET(request: NextRequest) {
  return NextResponse.json({
    models: {
      free: AVAILABLE_MODELS.free.map(id => ({
        id,
        name: getModelDisplayName(id),
        tier: 'free',
      })),
      pro: AVAILABLE_MODELS.pro.map(id => ({
        id,
        name: getModelDisplayName(id),
        tier: 'pro',
      })),
    },
    defaults: {
      free: DEFAULT_MODEL.free,
      pro: DEFAULT_MODEL.pro,
    },
  }, { headers: corsHeaders })
}

// 获取模型显示名称
function getModelDisplayName(modelId: string): string {
  const displayNames: Record<string, string> = {
    'meta-llama/llama-3.1-8b-instruct:free': 'Llama 3.1 8B (Free)',
    'google/gemma-2-9b-it:free': 'Gemma 2 9B (Free)',
    'mistralai/mistral-7b-instruct:free': 'Mistral 7B (Free)',
    'anthropic/claude-3.5-sonnet': 'Claude 3.5 Sonnet',
    'openai/gpt-4o': 'GPT-4o',
    'openai/gpt-4o-mini': 'GPT-4o Mini',
    'google/gemini-pro-1.5': 'Gemini Pro 1.5',
    'meta-llama/llama-3.1-70b-instruct': 'Llama 3.1 70B',
  }
  return displayNames[modelId] || modelId
}
