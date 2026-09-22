import { callbackUrl, cors, json, randomState, requireUser, service } from '../_shared/common.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const user = await requireUser(req)
    const { provider } = await req.json()
    if (!['youtube','tiktok','twitch'].includes(provider)) return json({ error: 'invalid_provider' }, 400)
    const state = randomState()
    const { error } = await service.from('creator_oauth_states').insert({ state, user_id: user.id, provider, expires_at: new Date(Date.now()+10*60*1000).toISOString() })
    if (error) throw error
    let url = ''
    if (provider === 'youtube') {
      const id = Deno.env.get('GOOGLE_CLIENT_ID'); if (!id) throw new Error('google_not_configured')
      const p = new URLSearchParams({ client_id:id, redirect_uri:callbackUrl, response_type:'code', scope:'openid email profile https://www.googleapis.com/auth/youtube.readonly', access_type:'offline', prompt:'consent', include_granted_scopes:'true', state })
      url = `https://accounts.google.com/o/oauth2/v2/auth?${p}`
    } else if (provider === 'tiktok') {
      const id = Deno.env.get('TIKTOK_CLIENT_KEY'); if (!id) throw new Error('tiktok_not_configured')
      const p = new URLSearchParams({ client_key:id, redirect_uri:callbackUrl, response_type:'code', scope:'user.info.basic,user.info.profile,user.info.stats,video.list', state })
      url = `https://www.tiktok.com/v2/auth/authorize/?${p}`
    } else {
      const id = Deno.env.get('TWITCH_CLIENT_ID'); if (!id) throw new Error('twitch_not_configured')
      const p = new URLSearchParams({ client_id:id, redirect_uri:callbackUrl, response_type:'code', scope:'user:read:email moderator:read:followers', state, force_verify:'true' })
      url = `https://id.twitch.tv/oauth2/authorize?${p}`
    }
    return json({ url })
  } catch (e) { return json({ error: e.message || String(e) }, 400) }
})
