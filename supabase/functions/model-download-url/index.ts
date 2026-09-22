import { cors, json, requireUser, service } from '../_shared/common.ts'
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  try{
    const user=await requireUser(req), {model_id}=await req.json()
    const {data,error}=await service.from('user_models').select('model_id,models(id,name,asset_path,active)').eq('user_id',user.id).eq('model_id',model_id).maybeSingle()
    if(error||!data)return json({error:'not_owned'},403)
    const m:any=data.models; if(!m?.active||!m.asset_path)return json({error:'asset_unavailable'},404)
    const {data:s,error:se}=await service.storage.from('models-assets').createSignedUrl(m.asset_path,300)
    if(se)throw se
    return json({ok:true,model_id:m.id,name:m.name,url:s.signedUrl,expires_in:300})
  }catch(e){return json({error:e.message||String(e)},400)}
})
