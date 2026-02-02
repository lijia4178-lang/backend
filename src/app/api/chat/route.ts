import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createSupabaseClient } from '@/lib/supabase'
import { chatCompletionStream, isModelAllowed, DEFAULT_MODEL, AVAILABLE_MODELS, THINKING_MODEL } from '@/lib/openrouter'

const FREE_DAILY_MESSAGES = parseInt(process.env.FREE_DAILY_MESSAGES || '30')

// CORS 头
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'http://localhost:5173',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// 处理 OPTIONS 预检请求
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    // 获取认证 token
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401, headers: corsHeaders }
      )
    }

    const token = authHeader.substring(7)

    // 验证用户 token
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders }
      )
    }

    // 获取用户配置
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404, headers: corsHeaders }
      )
    }

    // 解析请求体
    const body = await request.json()
    const { messages, model: requestedModel, webSearch, thinkingMode } = body

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400, headers: corsHeaders }
      )
    }

    // 检查用户是否为 Pro
    const isPro = profile.is_pro && 
      (!profile.subscription_end_date || new Date(profile.subscription_end_date) > new Date())

    // 确定使用的模型
    let model = requestedModel || DEFAULT_MODEL[isPro ? 'pro' : 'free']
    
    // 如果启用深度思考模式，使用思考模型（仅 Pro 用户）
    if (thinkingMode && isPro) {
      model = THINKING_MODEL
    }
    
    // 验证模型权限
    if (!isModelAllowed(model, isPro)) {
      // 如果请求的模型不允许，降级到默认模型
      model = DEFAULT_MODEL[isPro ? 'pro' : 'free']
    }

    // 网络搜索仅 Pro 用户可用
    const enableWebSearch = webSearch && isPro

    // 免费用户检查每日用量
    if (!isPro) {
      const today = new Date().toISOString().split('T')[0]
      
      // 获取今日用量
      const { data: dailyUsage } = await supabaseAdmin
        .from('daily_usage')
        .select('message_count')
        .eq('user_id', user.id)
        .eq('date', today)
        .single()

      const currentCount = dailyUsage?.message_count || 0

      if (currentCount >= FREE_DAILY_MESSAGES) {
        // 检查是否还有免费点数
        if (profile.credits <= 0) {
          return NextResponse.json(
            { 
              error: 'Daily limit reached',
              message: `您今日的 ${FREE_DAILY_MESSAGES} 条免费消息已用完，请升级到 Pro 获得无限消息`,
              upgrade_required: true
            },
            { status: 429, headers: corsHeaders }
          )
        }
        // 使用点数
        await supabaseAdmin
          .from('profiles')
          .update({ credits: profile.credits - 1, updated_at: new Date().toISOString() })
          .eq('id', user.id)
      }

      // 更新每日用量
      await supabaseAdmin
        .from('daily_usage')
        .upsert({
          user_id: user.id,
          date: today,
          message_count: currentCount + 1,
        }, { onConflict: 'user_id,date' })
    }

    // 调用 OpenRouter API（流式），传递选项
    const stream = await chatCompletionStream(messages, model, {
      webSearch: enableWebSearch,
      thinkingMode: thinkingMode && isPro,
    })

    // 创建转换流，用于记录 token 使用
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    let totalContent = ''

    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const text = decoder.decode(chunk)
        totalContent += text
        controller.enqueue(chunk)
      },
      async flush() {
        // 流结束后，记录用量（简化处理，实际应解析 SSE 获取准确 token 数）
        const estimatedTokens = Math.ceil(totalContent.length / 4)
        
        await supabaseAdmin
          .from('usage_logs')
          .insert({
            user_id: user.id,
            tokens_used: estimatedTokens,
            model: model,
          })
      },
    })

    // 返回流式响应
    const responseStream = stream.pipeThrough(transformStream)

    return new Response(responseStream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: (error as Error).message },
      { status: 500, headers: corsHeaders }
    )
  }
}
