// PayPal API 封装（订阅 Billing Plans）

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '<YOUR_PAYPAL_CLIENT_ID>'
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '<YOUR_PAYPAL_CLIENT_SECRET>'
const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || '<YOUR_PAYPAL_WEBHOOK_ID>'
const PAYPAL_PLAN_ID = process.env.PAYPAL_PLAN_ID || '<YOUR_PAYPAL_PLAN_ID>'
const PAYPAL_ENV = process.env.PAYPAL_ENV || 'sandbox'
const PAYPAL_BASE_URL = process.env.PAYPAL_BASE_URL || (
  PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
)

export const PLAN_IDS = {
  PRO_MONTHLY: PAYPAL_PLAN_ID,
}

let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (
    cachedToken &&
    cachedToken.expiresAt > Date.now() + 60_000
  ) {
    return cachedToken.value
  }

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64')

  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`PayPal auth error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 0) * 1000,
  }

  return cachedToken.value
}

async function paypalRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()

  return fetch(`${PAYPAL_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  })
}

export async function createSubscription(
  userId: string,
  userEmail: string,
  planId: string,
  returnUrl: string,
  cancelUrl: string
) {
  const response = await paypalRequest('/v1/billing/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: planId,
      custom_id: userId,
      subscriber: {
        email_address: userEmail,
      },
      application_context: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
        brand_name: 'ChatWindows',
        user_action: 'SUBSCRIBE_NOW',
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`PayPal API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  const approvalLink = (data.links || []).find((link: { rel: string }) => link.rel === 'approve')

  if (!approvalLink?.href) {
    throw new Error('PayPal approval link not found')
  }

  return {
    id: data.id,
    url: approvalLink.href,
  }
}

export async function getSubscription(subscriptionId: string) {
  const response = await paypalRequest(`/v1/billing/subscriptions/${subscriptionId}`)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`PayPal API error: ${response.status} - ${error}`)
  }

  return response.json()
}

export async function getCustomerPortalUrl(subscriptionId: string): Promise<string> {
  const data = await getSubscription(subscriptionId)
  const links = data.links || []
  const relPriority = ['manage', 'edit', 'self']

  for (const rel of relPriority) {
    const link = links.find((item: { rel: string }) => item.rel === rel)
    if (link?.href) return link.href
  }

  throw new Error('PayPal customer portal link not available')
}

export async function verifyWebhookSignature(
  payload: string,
  headers: Headers
): Promise<boolean> {
  const transmissionId = headers.get('paypal-transmission-id')
  const transmissionTime = headers.get('paypal-transmission-time')
  const certUrl = headers.get('paypal-cert-url')
  const authAlgo = headers.get('paypal-auth-algo')
  const transmissionSig = headers.get('paypal-transmission-sig')

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return false
  }

  const response = await paypalRequest('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: PAYPAL_WEBHOOK_ID,
      webhook_event: JSON.parse(payload),
    }),
  })

  if (!response.ok) {
    return false
  }

  const data = await response.json()
  return data.verification_status === 'SUCCESS'
}

export const isPayPalConfigured =
  PAYPAL_CLIENT_ID &&
  !PAYPAL_CLIENT_ID.includes('<') &&
  PAYPAL_CLIENT_SECRET &&
  !PAYPAL_CLIENT_SECRET.includes('<') &&
  PAYPAL_WEBHOOK_ID &&
  !PAYPAL_WEBHOOK_ID.includes('<') &&
  PAYPAL_PLAN_ID &&
  !PAYPAL_PLAN_ID.includes('<')
