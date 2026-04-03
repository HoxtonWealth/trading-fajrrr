import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabaseBrowser(): SupabaseClient | null {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return null
    _client = createClient(url, key)
  }
  return _client
}

// Convenience export — lazy singleton, returns null-safe proxy
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseBrowser()
    if (!client) {
      // Return a no-op that resolves to empty data
      if (prop === 'from') {
        return () => new Proxy({} as any, {
          get() {
            return (..._args: any[]) => new Proxy({} as any, {
              get(_t: any, p: string) {
                if (p === 'then') return undefined // not a thenable
                if (p === 'single') return () => Promise.resolve({ data: null, error: null })
                return (..._a: any[]) => new Proxy({} as any, {
                  get(_t2: any, p2: string) {
                    if (p2 === 'then') return undefined
                    if (p2 === 'single') return () => Promise.resolve({ data: null, error: null })
                    return (..._a2: any[]) => Promise.resolve({ data: [], error: null })
                  },
                })
              },
            })
          },
        })
      }
      if (prop === 'channel') return () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) })
      if (prop === 'removeChannel') return () => {}
      return () => {}
    }
    return (client as any)[prop]
  },
})
