import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Billing endpoint removed' },
    { status: 404 }
  )
}
