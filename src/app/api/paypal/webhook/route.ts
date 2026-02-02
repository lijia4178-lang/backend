import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSubscription, verifyWebhookSignature } from '@/lib/paypal'

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text()
    const isValid = await verifyWebhookSignature(payload, request.headers)

    if (!isValid) {
      console.error('Invalid PayPal webhook signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = JSON.parse(payload)
    const eventType = event.event_type as string

    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.CREATED':
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
      case 'BILLING.SUBSCRIPTION.UPDATED':
      case 'BILLING.SUBSCRIPTION.RE-ACTIVATED':
        await handleSubscriptionUpsert(event.resource)
        break

      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
      case 'BILLING.SUBSCRIPTION.EXPIRED':
        await handleSubscriptionEnded(event.resource)
        break

      case 'PAYMENT.SALE.COMPLETED':
      case 'PAYMENT.SALE.DENIED':
        await handlePaymentEvent(event.resource)
        break

      case 'PAYMENT.SALE.REFUNDED':
      case 'PAYMENT.SALE.REVERSED':
        await handleRefundEvent(event.resource)
        break

      default:
        console.log(`Unhandled PayPal event type: ${eventType}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('PayPal webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function handleSubscriptionUpsert(resource: any) {
  const subscriptionId = resource.id as string | undefined
  const userId = resource.custom_id as string | undefined
  const payerId = resource.subscriber?.payer_id as string | undefined
  const status = resource.status as string | undefined
  const nextBillingTime = resource.billing_info?.next_billing_time as string | undefined

  const targetUserId = userId || (subscriptionId ? await findUserIdBySubscriptionId(subscriptionId) : null)
  if (!targetUserId || !subscriptionId) {
    console.error('PayPal subscription event missing user context')
    return
  }

  const isPro = status === 'ACTIVE'

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      is_pro: isPro,
      paypal_subscription_id: subscriptionId,
      paypal_payer_id: payerId || null,
      subscription_end_date: nextBillingTime ? new Date(nextBillingTime).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetUserId)

  if (error) {
    console.error('Failed to update profile from subscription:', error)
  }
}

async function handleSubscriptionEnded(resource: any) {
  const subscriptionId = resource.id as string | undefined
  const userId = resource.custom_id as string | undefined

  const targetUserId = userId || (subscriptionId ? await findUserIdBySubscriptionId(subscriptionId) : null)
  if (!targetUserId || !subscriptionId) {
    console.error('PayPal subscription end event missing user context')
    return
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      is_pro: false,
      subscription_end_date: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetUserId)

  if (error) {
    console.error('Failed to downgrade profile after subscription end:', error)
  }
}

async function handlePaymentEvent(resource: any) {
  const subscriptionId = extractSubscriptionId(resource)
  if (!subscriptionId) {
    console.log('PayPal payment event without subscription id')
    return
  }

  try {
    const subscription = await getSubscription(subscriptionId)
    await handleSubscriptionUpsert(subscription)
  } catch (error) {
    console.error('Failed to sync subscription after payment event:', error)
  }
}

async function handleRefundEvent(resource: any) {
  const subscriptionId = extractSubscriptionId(resource)
  if (!subscriptionId) {
    console.log('PayPal refund event without subscription id')
    return
  }

  const targetUserId = await findUserIdBySubscriptionId(subscriptionId)
  if (!targetUserId) {
    console.error('PayPal refund event missing user context')
    return
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      is_pro: false,
      subscription_end_date: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetUserId)

  if (error) {
    console.error('Failed to downgrade profile after refund:', error)
  }
}

async function findUserIdBySubscriptionId(subscriptionId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('paypal_subscription_id', subscriptionId)
    .single()

  return profile?.id || null
}

function extractSubscriptionId(resource: any): string | null {
  return (
    resource?.billing_agreement_id ||
    resource?.billing_subscription_id ||
    resource?.subscription_id ||
    null
  )
}
