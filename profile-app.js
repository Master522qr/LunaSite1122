(() => {
  'use strict';
  const cfg = window.LUNAVISUAL_CONFIG || {};
  const $ = id => document.getElementById(id);
  let sb = null;

  const show = (el, msg, ok=false) => { if (!el) return; el.textContent=msg; el.className=`alert-msg ${ok?'success':'error'}`; el.style.display='block'; };
  const hide = el => { if (el) { el.style.display='none'; el.textContent=''; } };
  const rankLabel = r => ({user:'Пользователь',admin:'Админ',youtube:'YouTube',tiktok:'TikTok',twitch_streamer:'Twitch Streamer',tester:'Тестер',super_admin:'Super Admin'}[r] || r || 'Пользователь');

  function initClient(){
    if(!window.supabase||!cfg.supabaseUrl||!cfg.supabasePublishableKey) throw new Error('Supabase не настроен');
    sb=window.LunaVisualSupabase||window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'lunavisual-auth-v2'}});
    window.LunaVisualSupabase=sb;
  }

  async function ensureProfile(user){
    const {data,error}=await sb.from('profiles').select('*').eq('id',user.id).maybeSingle();
    if(error) throw error;
    if(data) return data;
    const payload={id:user.id,email:user.email,mc_nickname:user.user_metadata?.mc_nickname||user.user_metadata?.full_name||user.email?.split('@')[0]||'Player',avatar_url:user.user_metadata?.avatar_url||null};
    const created=await sb.from('profiles').upsert(payload).select('*').single(); if(created.error)throw created.error; return created.data;
  }

  async function getAdminRole(){ const {data,error}=await sb.rpc('current_lunavisual_role'); return error?'user':(data||'user'); }
  function setAvatar(img,p,role){
    if(!img)return;
    if(role==='super_admin'){img.onerror=null;img.src='project-avatar.png';return;}
    if(p.avatar_url){img.onerror=()=>{img.onerror=null;img.src='lunavisual-logo.png'};img.src=p.avatar_url;return;}
    const n=String(p.mc_nickname||'MHF_Steve');let step=0;img.onerror=()=>{step++;if(step===1)img.src=`https://minotar.net/avatar/${encodeURIComponent(n)}/96`;else{img.onerror=null;img.src='lunavisual-logo.png'}};img.src=`https://mc-heads.net/avatar/${encodeURIComponent(n)}/96`;
  }

  async function renderSession(session){
    hide($('authAlert')); hide($('profileAlert'));
    if(!session?.user){$('authView')?.classList.add('active');$('profileView')?.classList.remove('active');return;}
    $('authView')?.classList.remove('active');$('profileView')?.classList.add('active');
    const user=session.user, p=await ensureProfile(user), adminRole=await getAdminRole();
    $('profileUsername').textContent=p.mc_nickname||user.email?.split('@')[0]||'Player'; $('profileUserEmail').textContent=user.email||''; setAvatar($('profileAvatar'),p,adminRole);

    const active=!!(p.subscription_lifetime || (p.subscription_expires_at && new Date(p.subscription_expires_at)>new Date()) || (!p.subscription_expires_at && p.subscription_active));
    const badge=$('profileSubBadge'); if(badge){badge.textContent=active?'Активна':'Не активна';badge.classList.toggle('active',active);badge.classList.toggle('inactive',!active)}
    if($('profileSubExpiry')) $('profileSubExpiry').textContent=p.subscription_lifetime?'Навсегда':(p.subscription_expires_at?`до ${new Date(p.subscription_expires_at).toLocaleDateString('ru-RU')}`:(p.subscription_until||'Требуется активация ключа'));
    if($('profileHwidVal')) $('profileHwidVal').textContent=p.hwid||'Не привязан';
    if($('profileRank')) $('profileRank').textContent=rankLabel(adminRole==='super_admin'?'super_admin':(p.rank||'user'));
    const alpha=!!(p.alpha_lifetime || (p.alpha_access_until && new Date(p.alpha_access_until)>new Date()));
    if($('profileAlphaBadge')){$('profileAlphaBadge').textContent=alpha?'Активен':'Не активен';$('profileAlphaBadge').classList.toggle('active',alpha);$('profileAlphaBadge').classList.toggle('inactive',!alpha)}
    if($('profileAlphaExpiry')) $('profileAlphaExpiry').textContent=p.alpha_lifetime?'Навсегда':(p.alpha_access_until?`до ${new Date(p.alpha_access_until).toLocaleString('ru-RU')}`:'Активируйте ALPHALUNA-KEY');

    const isAdmin=['admin','super_admin'].includes(adminRole);
    if($('adminGeneratorBox')) $('adminGeneratorBox').style.display=isAdmin?'block':'none';
    if($('btnAdminPanel')) $('btnAdminPanel').style.display=isAdmin?'inline-flex':'none';
    if($('profileDownloadBox')) $('profileDownloadBox').style.display=(active||isAdmin)?'block':'none';
    if($('btnResetHwid')) $('btnResetHwid').style.display=p.hwid?'inline-flex':'none';
  }

  function setupTabs(){
    $('tabLoginBtn')?.addEventListener('click',()=>{$('tabLoginBtn').classList.add('active');$('tabRegisterBtn').classList.remove('active');$('formLogin').classList.add('active');$('formRegister').classList.remove('active')});
    $('tabRegisterBtn')?.addEventListener('click',()=>{$('tabRegisterBtn').classList.add('active');$('tabLoginBtn').classList.remove('active');$('formRegister').classList.add('active');$('formLogin').classList.remove('active')});
  }

  function setupAuth(){
    $('formLogin')?.addEventListener('submit',async e=>{e.preventDefault();hide($('authAlert'));const btn=$('btnSubmitLogin');btn.disabled=true;try{const {data,error}=await sb.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});if(error)throw error;await renderSession(data.session)}catch(err){show($('authAlert'),`Ошибка входа: ${err.message}`)}finally{btn.disabled=false}});
    $('formRegister')?.addEventListener('submit',async e=>{e.preventDefault();hide($('authAlert'));const nick=$('regNickname').value.trim(),email=$('regEmail').value.trim(),password=$('regPassword').value;if(!nick||!email||password.length<6){show($('authAlert'),'Заполните поля. Пароль — минимум 6 символов.');return}const btn=$('btnSubmitRegister');btn.disabled=true;try{const {data,error}=await sb.auth.signUp({email,password,options:{data:{mc_nickname:nick},emailRedirectTo:`${cfg.siteUrl}/profile.html`}});if(error)throw error;if(data.session){await renderSession(data.session);show($('profileAlert'),'Аккаунт создан. Сессия сохранена на этом устройстве.',true)}else show($('authAlert'),'Аккаунт создан. Подтвердите email и затем войдите.',true)}catch(err){show($('authAlert'),`Ошибка регистрации: ${err.message}`)}finally{btn.disabled=false}});
  }

  function setupPlanSelect(){const trigger=$('customPlanTrigger'),menu=$('customPlanOptions'),wrapper=$('customPlanSelect'),hidden=$('selectKeyPlan'),label=$('customPlanSelectedLabel');if(!trigger||!menu||!hidden)return;trigger.addEventListener('click',()=>wrapper?.classList.toggle('open'));menu.querySelectorAll('.custom-option').forEach(opt=>opt.addEventListener('click',()=>{menu.querySelectorAll('.custom-option').forEach(x=>x.classList.remove('selected'));opt.classList.add('selected');hidden.value=opt.dataset.value||'30';if(label)label.textContent=opt.textContent;wrapper?.classList.remove('open')}));document.addEventListener('click',e=>{if(!e.target.closest('#customPlanSelect'))wrapper?.classList.remove('open')})}

  function setupActions(){
    $('btnLogout')?.addEventListener('click',async()=>{await sb.auth.signOut();await renderSession(null)});
    $('formRedeemKey')?.addEventListener('submit',async e=>{e.preventDefault();hide($('profileAlert'));const code=$('inputLicenseKey').value.trim().toUpperCase();if(!/^LUNAVISUALKEY-\d{4}-\d{4}-\d{4}-\d{4}-\d{4}$/.test(code)){show($('profileAlert'),'Неверный формат обычного ключа.');return}const {data,error}=await sb.rpc('redeem_lunavisual_key',{p_code:code});if(error||!data?.ok){show($('profileAlert'),`Ключ не активирован: ${error?.message||data?.error||'unknown'}`);return}show($('profileAlert'),data.free_alpha_7d?'Ключ активирован. Пожизненный тариф также дал бесплатный Alpha на 7 дней.':'Ключ активирован.',true);const {data:s}=await sb.auth.getSession();await renderSession(s.session)});
    $('formRedeemAlphaKey')?.addEventListener('submit',async e=>{e.preventDefault();hide($('profileAlert'));const code=$('inputAlphaKey').value.trim().toUpperCase();if(!/^ALPHALUNA-KEY-(?:[A-Z0-9]{6}-){6}[A-Z0-9]{6}$/.test(code)){show($('profileAlert'),'Неверный формат Alpha-ключа.');return}const {data,error}=await sb.rpc('redeem_lunavisual_alpha_key',{p_code:code});if(error||!data?.ok){show($('profileAlert'),`Alpha-ключ не активирован: ${error?.message||data?.error||'unknown'}`);return}show($('profileAlert'),'Alpha-доступ активирован.',true);const {data:s}=await sb.auth.getSession();await renderSession(s.session)});
    $('btnAdminGenKey')?.addEventListener('click',async()=>{hide($('profileAlert'));const days=Number($('selectKeyPlan')?.value||0);const {data,error}=await sb.rpc('generate_lunavisual_keys',{p_count:1,p_duration_days:days>=9000?null:days});if(error){show($('profileAlert'),`Ошибка генерации: ${error.message}`);return}const key=Array.isArray(data)?data[0]?.code:data?.code;if($('adminLastKeyDisplay')){$('adminLastKeyDisplay').style.display='block';$('adminLastKeyDisplay').textContent=key||'Ключ создан'}show($('profileAlert'),'Ключ создан и записан в базу.',true)});
    $('btnResetHwid')?.addEventListener('click',async()=>{const {error}=await sb.rpc('reset_my_lunavisual_hwid');if(error)show($('profileAlert'),`Ошибка: ${error.message}`);else{show($('profileAlert'),'HWID сброшен.',true);const {data:s}=await sb.auth.getSession();await renderSession(s.session)}});
    $('btnDownloadClient')?.addEventListener('click',()=>location.href='LunaVisual-Launcher.zip');
  }

  async function boot(){try{initClient();setupTabs();setupAuth();setupPlanSelect();setupActions();const {data,error}=await sb.auth.getSession();if(error)throw error;await renderSession(data.session);sb.auth.onAuthStateChange((_e,s)=>setTimeout(()=>renderSession(s).catch(console.error),0))}catch(e){show($('authAlert'),`Ошибка подключения: ${e.message}`)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
