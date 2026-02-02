import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCustomerPortalUrl, isPayPalConfigured } from '@/lib/paypal'

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

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('paypal_subscription_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404, headers: corsHeaders }
      )
    }

    const subscriptionId = profile.paypal_subscription_id
    if (!subscriptionId) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 400, headers: corsHeaders }
      )
    }

    const portalUrl = await getCustomerPortalUrl(subscriptionId)

    return NextResponse.json({
      url: portalUrl,
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('PayPal portal error:', error)
    return NextResponse.json(
      { error: 'Failed to get customer portal', message: (error as Error).message },
      { status: 500, headers: corsHeaders }
    )
  }
}
