import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// CORS 头
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'http://localhost:5173',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// 提交用户反馈
export async function POST(request: NextRequest) {
  try {
    // 验证用户身份（可选，允许匿名反馈）
    const authHeader = request.headers.get('authorization')
    let userId: string | null = null
    let userEmail: string | null = null

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]
      const { data: { user } } = await supabaseAdmin.auth.getUser(token)
      if (user) {
        userId = user.id
        userEmail = user.email || null
      }
    }

    // 解析请求体
    const body = await request.json()
    const { type, message, email: providedEmail, rating, page } = body

    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Feedback message is required' },
        { status: 400, headers: corsHeaders }
      )
    }

    if (message.length > 5000) {
      return NextResponse.json(
        { error: 'Feedback message is too long (max 5000 characters)' },
        { status: 400, headers: corsHeaders }
      )
    }

    // 确定使用的邮箱（登录用户邮箱或用户提供的邮箱）
    const feedbackEmail = userEmail || providedEmail || null

    // 存储到 Supabase feedbacks 表
    const { data, error } = await supabaseAdmin
      .from('feedbacks')
      .insert({
        user_id: userId,
        email: feedbackEmail,
        type: type || 'general', // general, bug, feature, other
        message: message.trim(),
        rating: rating || null, // 1-5 评分（可选）
        page: page || null, // 用户提交反馈时所在的页面
        user_agent: request.headers.get('user-agent') || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to save feedback:', error)
      return NextResponse.json(
        { error: 'Failed to save feedback' },
        { status: 500, headers: corsHeaders }
      )
    }

    console.log(`Feedback received from ${feedbackEmail || 'anonymous'}: ${message.substring(0, 100)}...`)

    return NextResponse.json({
      success: true,
      id: data.id,
      message: 'Thank you for your feedback!',
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('Feedback API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
