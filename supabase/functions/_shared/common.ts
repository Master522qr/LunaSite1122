import { createClient } from 'npm:@supabase/supabase-js@2'

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const secretMap = Deno.env.get('SUPABASE_SECRET_KEYS')
export const SERVICE_KEY = secretMap ? JSON.parse(secretMap)['default'] : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
export const SITE_URL = (Deno.env.get('SITE_URL') || 'https://lunavisual.ru').replace(/\/$/, '')
export const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

export const cors = {
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } })
}

export async function requireUser(req: Request) {
  const header = req.headers.get('Authorization') || ''
  const jwt = header.replace(/^Bearer\s+/i, '')
  if (!jwt) throw new Error('login_required')
  const { data, error } = await service.auth.getUser(jwt)
  if (error || !data.user) throw new Error('invalid_session')
  return data.user
}

export const callbackUrl = `${SUPABASE_URL}/functions/v1/creator-oauth-callback`

export function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export function quality(provider: string, s: Record<string, number>) {
  const followers = Number(s.followers || 0)
  const videos = Number(s.videos || 0)
  const likes = Number(s.likes || 0)
  const views = Number(s.views || 0)
  let score = 70
  let suspicious = false
  const notes: string[] = []
  if (provider === 'youtube') {
    if (followers >= 1000 && videos < 3) { suspicious = true; score -= 30; notes.push('слишком мало публичных видео для размера канала') }
    if (followers >= 1000 && views > 0 && views < followers) { score -= 20; notes.push('низкое отношение просмотров к подписчикам') }
    score += Math.min(20, Math.floor(videos / 5))
  } else if (provider === 'tiktok') {
    if (followers >= 2000 && videos < 5) { suspicious = true; score -= 30; notes.push('слишком мало публичных видео для размера аккаунта') }
    if (followers >= 5000 && likes > 0 && likes < followers / 2) { score -= 20; notes.push('необычно низкое число лайков относительно подписчиков') }
    score += Math.min(20, Math.floor(videos / 10))
  } else if (provider === 'twitch') {
    // Twitch does not expose enough information to prove follower authenticity.
    score = followers >= 500 ? 75 : 55
    notes.push('Twitch API подтверждает владельца и количество фолловеров; качество аудитории требует ручной проверки')
  }
  score = Math.max(0, Math.min(100, score))
  return { score, suspicious, note: notes.join('; ') || 'аномалий по доступным публичным метрикам не обнаружено' }
}

export async function fetchProviderProfile(provider: string, accessToken: string) {
  if (provider === 'youtube') {
    const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id,snippet,statistics&mine=true', { headers: { Authorization: `Bearer ${accessToken}` } })
    const j = await r.json(); if (!r.ok) throw new Error(`youtube_api:${j?.error?.message || r.status}`)
    const c = j.items?.[0]; if (!c) throw new Error('youtube_channel_not_found')
    const followers = Number(c.statistics?.subscriberCount || 0), videos = Number(c.statistics?.videoCount || 0), views = Number(c.statistics?.viewCount || 0)
    const q = quality(provider, { followers, videos, views })
    return { provider_user_id: c.id, handle: c.snippet?.customUrl || c.snippet?.title || c.id, display_name: c.snippet?.title || 'YouTube', avatar_url: c.snippet?.thumbnails?.high?.url || c.snippet?.thumbnails?.default?.url || null, profile_url: `https://www.youtube.com/channel/${c.id}`, follower_count: followers, following_count: null, likes_count: null, video_count: videos, view_count: views, provider_verified: true, quality_score: q.score, suspicious: q.suspicious, quality_note: q.note }
  }
  if (provider === 'tiktok') {
    const fields = 'open_id,union_id,avatar_url,display_name,bio_description,profile_deep_link,is_verified,username,follower_count,following_count,likes_count,video_count'
    const r = await fetch(`https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(fields)}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    const j = await r.json(); if (!r.ok || j?.error?.code !== 'ok') throw new Error(`tiktok_api:${j?.error?.message || r.status}`)
    const u = j.data?.user; if (!u?.open_id) throw new Error('tiktok_user_not_found')
    const followers = Number(u.follower_count || 0), videos = Number(u.video_count || 0), likes = Number(u.likes_count || 0)
    const q = quality(provider, { followers, videos, likes })
    return { provider_user_id: u.open_id, handle: u.username || u.display_name || u.open_id, display_name: u.display_name || u.username || 'TikTok', avatar_url: u.avatar_url || null, profile_url: u.profile_deep_link || null, follower_count: followers, following_count: Number(u.following_count || 0), likes_count: likes, video_count: videos, view_count: null, provider_verified: !!u.is_verified, quality_score: q.score, suspicious: q.suspicious, quality_note: q.note }
  }
  if (provider === 'twitch') {
    const clientId = Deno.env.get('TWITCH_CLIENT_ID')!; if (!clientId) throw new Error('twitch_not_configured')
    const ur = await fetch('https://api.twitch.tv/helix/users', { headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': clientId } })
    const uj = await ur.json(); if (!ur.ok) throw new Error(`twitch_user_api:${ur.status}`)
    const u = uj.data?.[0]; if (!u) throw new Error('twitch_user_not_found')
    const fr = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${encodeURIComponent(u.id)}`, { headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': clientId } })
    const fj = await fr.json(); if (!fr.ok) throw new Error(`twitch_followers_api:${fr.status}`)
    const followers = Number(fj.total || 0), q = quality(provider, { followers })
    return { provider_user_id: u.id, handle: u.login, display_name: u.display_name || u.login, avatar_url: u.profile_image_url || null, profile_url: `https://www.twitch.tv/${u.login}`, follower_count: followers, following_count: null, likes_count: null, video_count: null, view_count: null, provider_verified: true, quality_score: q.score, suspicious: q.suspicious, quality_note: q.note }
  }
  throw new Error('invalid_provider')
}

export async function upsertConnection(userId: string, provider: string, profile: Record<string, unknown>) {
  const payload = { user_id: userId, provider, ...profile, last_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  const { data, error } = await service.from('creator_connections').upsert(payload, { onConflict: 'user_id,provider' }).select().single()
  if (error) throw error
  return data
}
