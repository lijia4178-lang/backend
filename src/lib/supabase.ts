import { createClient } from '@supabase/supabase-js'

// 服务端 Supabase 客户端（使用 service role key，绕过 RLS）
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

// 创建带用户 token 的客户端（遵守 RLS）
export const createSupabaseClient = (accessToken: string) => {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    }
  )
}

// 用户配置类型
export interface UserProfile {
  id: string
  email: string
  display_name: string | null
  credits: number
  is_pro: boolean
  subscription_end_date: string | null
  created_at: string
  updated_at: string
}

// 用量记录类型
export interface UsageLog {
  id: number
  user_id: string
  tokens_used: number
  model: string
  created_at: string
}

// 每日用量类型
export interface DailyUsage {
  user_id: string
  date: string
  message_count: number
}
