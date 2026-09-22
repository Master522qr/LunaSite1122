import { callbackUrl, fetchProviderProfile, service, SITE_URL, upsertConnection } from '../_shared/common.ts'

function redirect(message: string, ok=true) {
  const u = new URL(`${SITE_URL}/creators.html`); u.searchParams.set(ok?'connected':'oauth_error', message)
  return Response.redirect(u.toString(), 302)
}

Deno.serve(async req => {
  try {
    const u = new URL(req.url), state = u.searchParams.get('state') || '', code = u.searchParams.get('code') || ''
    const providerError = u.searchParams.get('error')
    if (providerError) return redirect(providerError, false)
    if (!state || !code) return redirect('missing_state_or_code', false)
    const { data: st, error: se } = await service.from('creator_oauth_states').select('*').eq('state', state).maybeSingle()
    if (se || !st || new Date(st.expires_at).getTime()<Date.now()) return redirect('invalid_or_expired_state', false)
    const provider = st.provider
    let token: any
    if (provider === 'youtube') {
      const body = new URLSearchParams({ client_id:Deno.env.get('GOOGLE_CLIENT_ID')||'', client_secret:Deno.env.get('GOOGLE_CLIENT_SECRET')||'', code, grant_type:'authorization_code', redirect_uri:callbackUrl })
      const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}); token=await r.json(); if(!r.ok) throw new Error(`google_token:${token.error_description||token.error||r.status}`)
    } else if (provider === 'tiktok') {
      const body = new URLSearchParams({ client_key:Deno.env.get('TIKTOK_CLIENT_KEY')||'', client_secret:Deno.env.get('TIKTOK_CLIENT_SECRET')||'', code, grant_type:'authorization_code', redirect_uri:callbackUrl })
      const r=await fetch('https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}); token=await r.json(); if(!r.ok) throw new Error(`tiktok_token:${token.error_description||token.error||r.status}`)
    } else if (provider === 'twitch') {
      const body = new URLSearchParams({ client_id:Deno.env.get('TWITCH_CLIENT_ID')||'', client_secret:Deno.env.get('TWITCH_CLIENT_SECRET')||'', code, grant_type:'authorization_code', redirect_uri:callbackUrl })
      const r=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}); token=await r.json(); if(!r.ok) throw new Error(`twitch_token:${token.message||r.status}`)
    } else throw new Error('invalid_provider')
    const expires = Number(token.expires_in || 3600)
    const { error: te } = await service.from('creator_oauth_tokens').upsert({ user_id:st.user_id, provider, access_token:token.access_token, refresh_token:token.refresh_token || null, expires_at:new Date(Date.now()+expires*1000).toISOString(), scope:Array.isArray(token.scope)?token.scope.join(' '):(token.scope||''), updated_at:new Date().toISOString() }, {onConflict:'user_id,provider'})
    if (te) throw te
    const profile = await fetchProviderProfile(provider, token.access_token)
    await upsertConnection(st.user_id, provider, profile)
    await service.from('creator_oauth_states').delete().eq('state', state)
    return redirect(provider, true)
  } catch(e) { console.error(e); return redirect(e.message || 'oauth_failed', false) }
})
