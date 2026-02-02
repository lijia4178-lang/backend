import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createSubscription, PLAN_IDS, isPayPalConfigured } from '@/lib/paypal'

const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'http://localhost:5173',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    if (!isPayPalConfigured) {
      return NextResponse.json(
        { error: 'Payment service not configured' },
        { status: 503, headers: corsHeaders }
      )
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing authorization header' },
        { status: 401, headers: corsHeaders }
      )
    }

    const token = authHeader.split(' ')[1]
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401, headers: corsHeaders }
      )
    }

    const body = await request.json()
    const { planId } = body
    const validPlanId = planId || PLAN_IDS.PRO_MONTHLY

    if (!validPlanId || validPlanId.includes('<')) {
      return NextResponse.json(
        { error: 'Plan ID not configured. Please set up PayPal Billing Plans.' },
        { status: 400, headers: corsHeaders }
      )
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const successUrl = `${frontendUrl}/subscription/success`
    const cancelUrl = `${frontendUrl}/subscription/cancel`

    const subscription = await createSubscription(
      user.id,
      user.email || '',
      validPlanId,
      successUrl,
      cancelUrl
    )

    return NextResponse.json({
      subscriptionId: subscription.id,
      url: subscription.url,
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('PayPal checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create PayPal subscription', message: (error as Error).message },
      { status: 500, headers: corsHeaders }
    )
  }
}
