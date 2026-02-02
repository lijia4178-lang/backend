import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { AVAILABLE_MODELS, DEFAULT_MODEL } from '@/lib/openrouter'

const FREE_DAILY_MESSAGES = parseInt(process.env.FREE_DAILY_MESSAGES || '30')

// CORS 头
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'http://localhost:5173',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// 获取用户信息和用量
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401, headers: corsHeaders }
      )
    }

    const token = authHeader.substring(7)

    // 验证用户
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

    // 获取今日用量
    const today = new Date().toISOString().split('T')[0]
    const { data: dailyUsage } = await supabaseAdmin
      .from('daily_usage')
      .select('message_count')
      .eq('user_id', user.id)
      .eq('date', today)
      .single()

    const isPro = profile.is_pro && 
      (!profile.subscription_end_date || new Date(profile.subscription_end_date) > new Date())

    // 返回用户信息
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        display_name: profile.display_name,
      },
      subscription: {
        is_pro: isPro,
        credits: profile.credits,
        subscription_end_date: profile.subscription_end_date,
      },
      usage: {
        today_messages: dailyUsage?.message_count || 0,
        daily_limit: isPro ? null : FREE_DAILY_MESSAGES,
        remaining_today: isPro ? null : Math.max(0, FREE_DAILY_MESSAGES - (dailyUsage?.message_count || 0)),
      },
      available_models: isPro 
        ? [...AVAILABLE_MODELS.free, ...AVAILABLE_MODELS.pro]
        : AVAILABLE_MODELS.free,
      default_model: DEFAULT_MODEL[isPro ? 'pro' : 'free'],
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('User API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
