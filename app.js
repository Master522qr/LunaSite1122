// LunaVisual Client Page Logic & Supabase Authentication System

/* ==========================================================================
   Supabase Configuration
   ========================================================================== */
const SUPABASE_CONFIG = {
  url: "https://pdibtleothnnmihhrbcr.supabase.co",
  anonKey: "sb_publishable_f74qPRFJj8MQHT1L1Z3GIw_ue3Jx3yK"
};

// Check if actual Supabase keys are configured
const cleanUrl = SUPABASE_CONFIG.url.replace(/\/rest\/v1\/?$/, '').trim();
const isSupabaseConfigured = 
  cleanUrl !== "YOUR_SUPABASE_URL" && 
  SUPABASE_CONFIG.anonKey !== "YOUR_SUPABASE_ANON_KEY" &&
  typeof window.supabase !== "undefined";

let supabaseClient = null;

const LUNAVISUAL_OWNER_EMAIL = ''; // roles are stored in Supabase admin_roles
const LUNAVISUAL_PROJECT_AVATAR = 'project-avatar.png';
const LUNAVISUAL_FALLBACK_AVATAR = 'lunavisual-logo.png';

function setLunaAvatar(img, nickname, email) {
  if (!img) return;
  const isOwner = String(email || '').toLowerCase() === LUNAVISUAL_OWNER_EMAIL;
  if (isOwner) {
    img.onerror = null;
    img.src = LUNAVISUAL_PROJECT_AVATAR;
    img.alt = 'LunaVisual';
    return;
  }
  const nick = String(nickname || 'MHF_Steve').trim() || 'MHF_Steve';
  let fallbackStep = 0;
  img.onerror = () => {
    fallbackStep += 1;
    if (fallbackStep === 1) {
      img.src = `https://minotar.net/avatar/${encodeURIComponent(nick)}/80`;
      return;
    }
    img.onerror = null;
    img.src = LUNAVISUAL_FALLBACK_AVATAR;
  };
  img.src = `https://mc-heads.net/avatar/${encodeURIComponent(nick)}/80`;
  img.alt = nick;
}

if (isSupabaseConfigured) {
  try {
    supabaseClient = window.supabase.createClient(cleanUrl, SUPABASE_CONFIG.anonKey.trim(), {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'lunavisual-auth-v2' }
    });
    // Один общий клиент для всех скриптов страницы. Это важно: второй GoTrueClient
    // мог не видеть уже сохранённую сессию на GitHub Pages.
    window.LunaVisualSupabase = supabaseClient;
    console.log("Supabase успешно подключен к проекту:", cleanUrl);
  } catch (err) {
    console.error("Ошибка инициализации Supabase:", err);
  }
}

// 1. FAQ Accordion Click Handler
document.querySelectorAll('.faq-question').forEach(question => {
  question.addEventListener('click', () => {
    const item = question.parentElement;
    const answer = item.querySelector('.faq-answer');
    const isActive = item.classList.contains('active');
    
    document.querySelectorAll('.faq-item').forEach(otherItem => {
      otherItem.classList.remove('active');
      otherItem.querySelector('.faq-answer').style.maxHeight = null;
    });

    if (!isActive) {
      item.classList.add('active');
      answer.style.maxHeight = answer.scrollHeight + "px";
    }
  });
});

// 3. Navigation & Smooth Scrolling
document.querySelectorAll('.scroll-link').forEach(button => {
  const scrollToTarget = () => {
    const target = document.querySelector(button.dataset.target);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };
  button.addEventListener('click', scrollToTarget);
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      scrollToTarget();
    }
  });
});

document.querySelectorAll('.external-link').forEach(button => {
  button.addEventListener('click', () => {
    window.open(button.dataset.url, '_blank', 'noopener,noreferrer');
  });
});

// 4. Content Copy & Image Protection
document.addEventListener('contextmenu', (event) => event.preventDefault());
let allowProgrammaticCopy = false;
document.addEventListener('copy', (event) => {
  if (!allowProgrammaticCopy && !event.target.closest?.('.key-gen-result')) {
    event.preventDefault();
  }
});
document.addEventListener('cut', (event) => event.preventDefault());
document.addEventListener('dragstart', (event) => event.preventDefault());
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && ['a', 'c', 's', 'u'].includes(event.key.toLowerCase())) {
    event.preventDefault();
  }
});


/* ==========================================================================
   5. Authentication & Profile Dashboard Controller
   ========================================================================== */
const authModal = document.getElementById('auth-modal');
const profileModal = document.getElementById('profile-modal');
const btnOpenAuth = document.getElementById('btn-open-auth');
const btnOpenProfile = document.getElementById('btn-open-profile');
const btnCloseAuth = document.getElementById('btn-close-auth');
const btnCloseAuthAlt = document.getElementById('btn-close-auth-alt');
const btnCloseProfile = document.getElementById('btn-close-profile');
const btnCloseProfileAlt = document.getElementById('btn-close-profile-alt');
const tabLoginBtn = document.getElementById('tab-login-btn');
const tabRegisterBtn = document.getElementById('tab-register-btn');
const formLogin = document.getElementById('form-login');
const formRegister = document.getElementById('form-register');
const authAlert = document.getElementById('auth-alert');
const profileAlert = document.getElementById('profile-alert');
const btnDiscordLogin = document.getElementById('btn-discord-login');
const btnLogout = document.getElementById('btn-logout');
const btnResetHwid = document.getElementById('btn-reset-hwid');
const formRedeemKey = document.getElementById('form-redeem-key');
const inputLicenseKey = document.getElementById('input-license-key');
const adminGenBox = document.getElementById('admin-generator-box');
const btnAdminGenKey = document.getElementById('btn-admin-generate-key');
const selectKeyPlan = document.getElementById('select-key-plan');
const adminLastKeyDisplay = document.getElementById('admin-last-created-key');

// Current user state (Live or Demo fallback)
let currentUser = null;

// Helper: Show alert banner
function showAlert(el, message, type = 'error') {
  if (!el) return;
  el.textContent = message;
  el.className = `alert-msg ${type}`;
  el.style.display = 'block';
}

function clearAlert(el) {
  if (!el) return;
  el.style.display = 'none';
  el.textContent = '';
}

// Modal open/close helpers
function openModal(modal) {
  if (!modal) return;
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
}

// Open Auth & Profile -> Standalone page
if (btnOpenAuth) {
  btnOpenAuth.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'profile.html';
  });
}

if (btnOpenProfile) {
  btnOpenProfile.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'profile.html';
  });
}

// Close Buttons
if (btnCloseAuth) btnCloseAuth.addEventListener('click', () => closeModal(authModal));
if (btnCloseAuthAlt) btnCloseAuthAlt.addEventListener('click', () => closeModal(authModal));
if (btnCloseProfile) btnCloseProfile.addEventListener('click', () => closeModal(profileModal));
if (btnCloseProfileAlt) btnCloseProfileAlt.addEventListener('click', () => closeModal(profileModal));

// Close on Overlay Click
[authModal, profileModal].forEach(modal => {
  if (!modal) return;
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal);
    }
  });
});

// Close on Escape Key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal(authModal);
    closeModal(profileModal);
  }
});

// Auth Tabs Switcher
function switchTab(tab) {
  clearAlert(authAlert);
  if (tab === 'login') {
    tabLoginBtn.classList.add('active');
    tabRegisterBtn.classList.remove('active');
    formLogin.classList.add('active');
    formRegister.classList.remove('active');
    document.getElementById('auth-modal-title').textContent = 'Вход в аккаунт';
  } else {
    tabRegisterBtn.classList.add('active');
    tabLoginBtn.classList.remove('active');
    formRegister.classList.add('active');
    formLogin.classList.remove('active');
    document.getElementById('auth-modal-title').textContent = 'Регистрация';
  }
}

if (tabLoginBtn) tabLoginBtn.addEventListener('click', () => switchTab('login'));
if (tabRegisterBtn) tabRegisterBtn.addEventListener('click', () => switchTab('register'));

// Update Header UI based on auth state
function updateHeaderAuth(user) {
  currentUser = user;
  if (user) {
    if (btnOpenAuth) btnOpenAuth.style.display = 'none';
    if (btnOpenProfile) {
      btnOpenProfile.style.display = 'inline-flex';
      const nickEl = document.getElementById('nav-user-nick');
      if (nickEl) {
        nickEl.textContent = user.user_metadata?.mc_nickname || user.email?.split('@')[0] || 'Кабинет';
      }
    }
  } else {
    if (btnOpenAuth) btnOpenAuth.style.display = 'block';
    if (btnOpenProfile) btnOpenProfile.style.display = 'none';
  }
}

// Render Profile Modal Data
async function fetchAndRenderProfile() {
  if (!currentUser) return;

  if (supabaseClient) {
    try {
      const email = currentUser.email;
      const nick = currentUser.user_metadata?.mc_nickname;
      
      let query = supabaseClient.from('profiles').select('*');
      if (email && nick) {
        query = query.or(`email.eq.${email},mc_nickname.ilike.${nick},id.eq.${currentUser.id}`);
      } else if (email) {
        query = query.or(`email.eq.${email},id.eq.${currentUser.id}`);
      } else {
        query = query.eq('id', currentUser.id);
      }
      
      const { data: profs, error } = await query.limit(1);

      if (profs && profs.length > 0) {
        const prof = profs[0];
        if (!currentUser.user_metadata) currentUser.user_metadata = {};
        currentUser.user_metadata.hwid = (prof.hwid && prof.hwid !== 'null') ? prof.hwid : null;
        
        const isDbActive = prof.subscription_active === true || prof.subscription_active === 'true' || 
          (prof.subscription_until && prof.subscription_until !== 'Не активна' && prof.subscription_until !== 'Требуется активация ключа');
        currentUser.user_metadata.subscription_active = isDbActive;
        
        if (prof.subscription_until) currentUser.user_metadata.subscription_until = prof.subscription_until;
        if (prof.mc_nickname) currentUser.user_metadata.mc_nickname = prof.mc_nickname;
      }
    } catch (err) {
      console.warn("Error fetching latest profile:", err);
    }
  }

  renderProfileData();
}

function renderProfileData() {
  if (!currentUser) return;
  
  const nickname = currentUser.user_metadata?.mc_nickname || currentUser.email?.split('@')[0] || 'Player';
  const email = currentUser.email || 'Не указан';
  const hwid = currentUser.user_metadata?.hwid || 'Не привязан';
  
  const rawSubActive = currentUser.user_metadata?.subscription_active;
  const rawSubUntil = currentUser.user_metadata?.subscription_until;
  
  const subActive = rawSubActive === true || rawSubActive === 'true' || 
    (rawSubUntil && rawSubUntil !== 'Не активна' && rawSubUntil !== 'Требуется активация ключа');
  
  const subExpiry = rawSubUntil || (subActive ? 'Навсегда (Lifetime)' : 'Требуется активация ключа');

  // Update DOM elements
  const nickEl = document.getElementById('profile-username');
  const emailEl = document.getElementById('profile-email');
  const avatarEl = document.getElementById('profile-mc-avatar');
  const subBadge = document.getElementById('profile-sub-badge');
  const subExpiryEl = document.getElementById('profile-sub-expiry');
  const hwidValEl = document.getElementById('profile-hwid-val');

  if (nickEl) nickEl.textContent = nickname;
  if (emailEl) emailEl.textContent = email;
  if (avatarEl) {
    setLunaAvatar(avatarEl, nickname, email);
  }

  if (subBadge) {
    if (subActive) {
      subBadge.textContent = 'Активна';
      subBadge.className = 'card-status-badge';
    } else {
      subBadge.textContent = 'Не активна';
      subBadge.className = 'card-status-badge inactive';
    }
  }

  if (subExpiryEl) {
    subExpiryEl.textContent = subActive ? `Действует: ${subExpiry}` : 'Требуется активация ключа';
  }

  if (hwidValEl) {
    hwidValEl.textContent = hwid;
  }

  // Show admin generator box & HWID reset button strictly for admin
  const isAdmin = email.toLowerCase() === '' || currentUser.user_metadata?.role === 'Admin';
  if (adminGenBox) {
    adminGenBox.style.display = isAdmin ? 'block' : 'none';
  }
  if (btnResetHwid) {
    btnResetHwid.style.display = isAdmin ? 'flex' : 'none';
  }

  // Show client download box for anyone with active subscription (and admin)
  const dlBox = document.getElementById('profile-download-box');
  if (dlBox) {
    dlBox.style.display = (subActive || isAdmin) ? 'block' : 'none';
  }
}

// --------------------------------------------------------------------------
// Login Handler
// --------------------------------------------------------------------------
if (formLogin) {
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert(authAlert);
    const loginInput = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const submitBtn = document.getElementById('login-submit-btn');

    if (!loginInput) {
      showAlert(authAlert, window.getLangString('auth_err_fill_fields'), 'error');
      return;
    }

    if (!password) {
      showAlert(authAlert, window.getLangString('auth_err_fill_fields'), 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = window.getLangString('btn_signing_in');

    // Determine if input is email or nickname
    let targetEmail = loginInput;

    if (supabaseClient) {
      // Live Supabase Auth
      try {
        // If user entered nickname instead of email, look up their email in database
        if (!loginInput.includes('@')) {
          try {
            const { data: userProfiles, error: pErr } = await supabaseClient
              .from('profiles')
              .select('email')
              .ilike('mc_nickname', loginInput.trim())
              .limit(1);

            if (userProfiles && userProfiles.length > 0 && userProfiles[0].email) {
              targetEmail = userProfiles[0].email;
            } else {
              showAlert(authAlert, window.getLangString('auth_err_invalid_login'), 'error');
              submitBtn.disabled = false;
              submitBtn.textContent = window.getLangString('prof_btn_login');
              return;
            }
          } catch (err) {
            console.error("Profile lookup error:", err);
          }
        }

        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: targetEmail,
          password: password
        });

        if (error) {
          let userMsg = error.message;
          if (error.message.includes('Invalid login') || error.message.includes('Invalid login credentials')) {
            userMsg = window.getLangString('auth_err_invalid_login');
          } else if (error.message.includes('Email not confirmed')) {
            userMsg = 'Email not confirmed.';
          }
          showAlert(authAlert, userMsg, 'error');
        } else {
          showAlert(authAlert, window.getLangString('auth_success_login'), 'success');
          // Sync profile to table if missing
          try {
            const nick = data.user.user_metadata?.mc_nickname || loginInput;
            await supabaseClient.from('profiles').upsert([
              {
                id: data.user.id,
                email: data.user.email,
                mc_nickname: nick,
                subscription_active: data.user.user_metadata?.subscription_active === true,
                subscription_until: data.user.user_metadata?.subscription_until || 'Не активна'
              }
            ], { onConflict: 'id' });
          } catch (ignored) {}

          setTimeout(() => {
            closeModal(authModal);
            updateHeaderAuth(data.user);
          }, 700);
        }
      } catch (err) {
        showAlert(authAlert, window.getLangString('auth_err_server'), 'error');
      }
    } else {
      // Demo / Local Mode (when Supabase keys are not entered yet)
      setTimeout(() => {
        const demoUser = {
          id: 'demo-' + Date.now(),
          email: targetEmail.includes('@') ? targetEmail : `${targetEmail}@lunavisual.client`,
          user_metadata: {
            mc_nickname: loginInput.replace('@', '_'),
            hwid: 'HWID-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
            subscription_active: false,
            subscription_until: 'Не активна'
          }
        };
        localStorage.setItem('lunavisual_demo_user', JSON.stringify(demoUser));
        showAlert(authAlert, 'Успешный вход! (Демо-режим)', 'success');
        setTimeout(() => {
          closeModal(authModal);
          updateHeaderAuth(demoUser);
        }, 600);
      }, 400);
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Войти в аккаунт';
  });
}

// --------------------------------------------------------------------------
// Register Handler
// --------------------------------------------------------------------------
if (formRegister) {
  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert(authAlert);
    const nickname = document.getElementById('reg-nickname').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const passwordConfirm = document.getElementById('reg-password-confirm').value;
    const submitBtn = document.getElementById('reg-submit-btn');

    if (!nickname) {
      showAlert(authAlert, window.getLangString('auth_err_nick_req'), 'error');
      return;
    }

    if (!email || !email.includes('@') || !email.includes('.')) {
      showAlert(authAlert, window.getLangString('auth_err_email_invalid'), 'error');
      return;
    }

    if (password.length < 6) {
      showAlert(authAlert, window.getLangString('auth_err_pass_min'), 'error');
      return;
    }

    if (password !== passwordConfirm) {
      showAlert(authAlert, window.getLangString('auth_err_pass_mismatch'), 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = window.getLangString('btn_registering');

    if (supabaseClient) {
      // Live Supabase Sign Up
      try {
        const { data, error } = await supabaseClient.auth.signUp({
          email: email,
          password: password,
          options: {
            data: {
              mc_nickname: nickname,
              hwid: null,
              subscription_active: false,
              subscription_until: 'Не активна'
            }
          }
        });

        if (error) {
          showAlert(authAlert, error.message, 'error');
        } else {
          // Save to profiles table
          if (data.user) {
            try {
              await supabaseClient.from('profiles').upsert([
                {
                  id: data.user.id,
                  email: email,
                  mc_nickname: nickname,
                  hwid: null,
                  subscription_active: false,
                  subscription_until: 'Не активна'
                }
              ]);
            } catch (err) {
              console.warn("Could not insert profile:", err);
            }
          }

          showAlert(authAlert, window.getLangString('auth_success_reg'), 'success');
          if (data.user) {
            setTimeout(() => {
              closeModal(authModal);
              updateHeaderAuth(data.user);
            }, 800);
          }
        }
      } catch (err) {
        showAlert(authAlert, window.getLangString('auth_err_server'), 'error');
      }
    } else {
      // Demo / Local Mode
      setTimeout(() => {
        const demoUser = {
          id: 'demo-' + Date.now(),
          email: email,
          user_metadata: {
            mc_nickname: nickname,
            hwid: null,
            subscription_active: false,
            subscription_until: 'Не активна'
          }
        };
        localStorage.setItem('lunavisual_demo_user', JSON.stringify(demoUser));
        showAlert(authAlert, window.getLangString('auth_success_reg'), 'success');
        setTimeout(() => {
          closeModal(authModal);
          updateHeaderAuth(demoUser);
        }, 800);
      }, 500);
    }

    submitBtn.disabled = false;
    submitBtn.textContent = window.getLangString('prof_btn_register');
  });
}

// --------------------------------------------------------------------------
// Key Redemption Handler (Supabase RPC; one website session only)
// --------------------------------------------------------------------------
if (formRedeemKey) {
  formRedeemKey.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert(profileAlert);
    const keyInput = inputLicenseKey?.value.trim().toUpperCase() || '';
    if (!keyInput) { showAlert(profileAlert, 'Введите ключ LunaVisual.', 'error'); return; }
    if (!supabaseClient) { showAlert(profileAlert, 'Сервер авторизации недоступен.', 'error'); return; }
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const sessionUser = sessionData?.session?.user || currentUser;
    if (!sessionUser) { showAlert(profileAlert, 'Сначала зарегистрируйтесь или войдите на сайте.', 'error'); return; }
    const btnRedeem = document.getElementById('btnRedeemKey') || document.getElementById('btn-redeem-key');
    if (btnRedeem) { btnRedeem.disabled = true; btnRedeem.textContent = 'Проверка...'; }
    try {
      const { data, error } = await supabaseClient.rpc('redeem_lunavisual_key', { p_code: keyInput });
      if (error) throw error;
      if (!data?.ok) {
        const map = { not_found:'Ключ не найден.', used:'Ключ уже использован.', rate_limited:'Слишком много попыток. Попробуйте позже.' };
        showAlert(profileAlert, map[data?.error] || 'Не удалось активировать ключ.', 'error');
        return;
      }
      inputLicenseKey.value = '';
      const { data: fresh } = await supabaseClient.auth.getUser();
      if (fresh?.user) currentUser = fresh.user;
      if (typeof loadProfileFromDatabase === 'function') { try { await loadProfileFromDatabase(); } catch (_) {} }
      if (typeof renderProfileData === 'function') renderProfileData();
      showAlert(profileAlert, `✓ Ключ активирован. Подписка: ${data.subscription_until || 'активна'}`, 'success');
    } catch (err) {
      const msg = String(err?.message || err || 'Ошибка сервера');
      showAlert(profileAlert, msg.includes('login_required') ? 'Сначала зарегистрируйтесь или войдите на сайте.' : `Ошибка активации: ${msg}`, 'error');
    } finally {
      if (btnRedeem) { btnRedeem.disabled = false; btnRedeem.textContent = 'Применить'; }
    }
  });
}

// --------------------------------------------------------------------------
// Custom Dropdown & Admin Key Generator Handler
// --------------------------------------------------------------------------
const customPlanSelect = document.getElementById('custom-plan-select');
const customPlanTrigger = document.getElementById('custom-plan-trigger');
const customPlanLabel = document.getElementById('custom-plan-selected-label');
const customPlanOptions = document.querySelectorAll('#custom-plan-options .custom-option');
const hiddenKeyPlanInput = document.getElementById('select-key-plan');

if (customPlanTrigger && customPlanSelect) {
  customPlanTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    customPlanSelect.classList.toggle('open');
  });

  customPlanOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      customPlanOptions.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const val = opt.getAttribute('data-value');
      const labelText = opt.textContent.replace('✓', '').trim();
      if (hiddenKeyPlanInput) hiddenKeyPlanInput.value = val;
      if (customPlanLabel) customPlanLabel.textContent = labelText;
      customPlanSelect.classList.remove('open');
    });
  });

  document.addEventListener('click', () => {
    customPlanSelect.classList.remove('open');
  });
}

// Universal reliable clipboard copy function with textarea fallback
async function copyTextToClipboard(text) {
  let copied = false;
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch (e) {}
  }
  if (!copied) {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      textArea.setAttribute("readonly", "");
      document.body.appendChild(textArea);
      textArea.select();
      textArea.setSelectionRange(0, 99999);
      allowProgrammaticCopy = true;
      copied = document.execCommand('copy');
      allowProgrammaticCopy = false;
      document.body.removeChild(textArea);
    } catch (err) {
      allowProgrammaticCopy = false;
    }
  }
  return copied;
}

if (adminLastKeyDisplay) {
  adminLastKeyDisplay.style.cursor = 'pointer';
  adminLastKeyDisplay.title = 'Нажмите, чтобы скопировать ключ';
  adminLastKeyDisplay.addEventListener('click', async () => {
    const keyText = adminLastKeyDisplay.getAttribute('data-key') || adminLastKeyDisplay.textContent.replace(/[^\w-]/g, '').trim();
    if (keyText) {
      await copyTextToClipboard(keyText);
      showAlert(profileAlert, `Ключ ${keyText} скопирован в буфер обмена!`, 'success');
    }
  });
}

if (btnAdminGenKey) {
  btnAdminGenKey.addEventListener('click', async () => {
    clearAlert(profileAlert);
    if (!supabaseClient) { showAlert(profileAlert, 'Supabase не подключён.', 'error'); return; }
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const user = sessionData?.session?.user || currentUser;
    if (!user) { showAlert(profileAlert, 'Сначала войдите на сайте под аккаунтом владельца.', 'error'); return; }
    if ((user.email || '').toLowerCase() !== LUNAVISUAL_OWNER_EMAIL) {
      const { data: profile } = await supabaseClient.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
      if (!profile?.is_admin) { showAlert(profileAlert, 'Создание ключей доступно только владельцу/администратору.', 'error'); return; }
    }
    const planVal = hiddenKeyPlanInput ? hiddenKeyPlanInput.value : '9999';
    const days = parseInt(planVal, 10) || 9999;
    btnAdminGenKey.disabled = true; btnAdminGenKey.textContent = 'Создание...';
    try {
      const { data, error } = await supabaseClient.rpc('generate_lunavisual_keys', { p_count: 1, p_duration_days: days });
      if (error) throw error;
      const key = Array.isArray(data) ? data[0]?.code : data?.code;
      if (!key) throw new Error('Сервер не вернул созданный ключ');
      if (adminLastKeyDisplay) {
        adminLastKeyDisplay.style.display = 'block';
        adminLastKeyDisplay.setAttribute('data-key', key);
        adminLastKeyDisplay.innerHTML = `✓ Ключ создан (нажмите для копирования): <strong>${key}</strong>`;
      }
      await copyTextToClipboard(key);
      showAlert(profileAlert, `Ключ ${key} создан и сохранён в базе.`, 'success');
    } catch (err) {
      const msg=String(err?.message||err);
      showAlert(profileAlert, `Ошибка генерации: ${msg}`, 'error');
    } finally { btnAdminGenKey.disabled=false; btnAdminGenKey.textContent='+ Создать ключ'; }
  });
}

// --------------------------------------------------------------------------
// Discord OAuth Login
// --------------------------------------------------------------------------
if (btnDiscordLogin) {
  btnDiscordLogin.addEventListener('click', async () => {
    if (supabaseClient) {
      try {
        const { error } = await supabaseClient.auth.signInWithOAuth({
          provider: 'discord',
          options: {
            redirectTo: window.location.origin + window.location.pathname
          }
        });
        if (error) showAlert(authAlert, `Ошибка Discord: ${error.message}`, 'error');
      } catch (err) {
        showAlert(authAlert, 'Ошибка запуска Discord авторизации.', 'error');
      }
    } else {
      showAlert(authAlert, 'Для входа через Discord укажите ключи Supabase в app.js', 'error');
    }
  });
}

// --------------------------------------------------------------------------
// Reset HWID Handler
// --------------------------------------------------------------------------
if (btnResetHwid) {
  btnResetHwid.addEventListener('click', async () => {
    if (!currentUser) return;
    clearAlert(profileAlert);

    btnResetHwid.disabled = true;
    btnResetHwid.textContent = 'Сброс привязки...';

    if (supabaseClient) {
      try {
        const { error } = await supabaseClient.auth.updateUser({
          data: { hwid: null }
        });

        // Also reset in profiles table
        try {
          await supabaseClient
            .from('profiles')
            .update({ hwid: null })
            .eq('id', currentUser.id);
        } catch (e) {}

        if (error) {
          showAlert(profileAlert, `Ошибка сброса: ${error.message}`, 'error');
        } else {
          currentUser.user_metadata.hwid = null;
          renderProfileData();
          showAlert(profileAlert, '✓ Привязка HWID успешно сброшена! Новый ПК привяжется автоматически при первом запуске игры.', 'success');
        }
      } catch (err) {
        showAlert(profileAlert, 'Ошибка отправки запроса на сброс HWID.', 'error');
      }
    } else {
      // Demo Mode
      setTimeout(() => {
        currentUser.user_metadata.hwid = 'Не привязан (Сброшено)';
        localStorage.setItem('lunavisual_demo_user', JSON.stringify(currentUser));
        renderProfileData();
        showAlert(profileAlert, '✓ Привязка HWID успешно сброшена! (Демо-режим)', 'success');
      }, 400);
    }

    btnResetHwid.disabled = false;
    btnResetHwid.innerHTML = '<span>⟳</span> Сбросить привязку HWID';
  });
}

// --------------------------------------------------------------------------
// Logout Handler
// --------------------------------------------------------------------------
if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    } else {
      localStorage.removeItem('lunavisual_demo_user');
    }
    updateHeaderAuth(null);
    closeModal(profileModal);
  });
}

// --------------------------------------------------------------------------
// Initialize Auth State on Page Load
// --------------------------------------------------------------------------
async function checkInitialSession() {
  if (supabaseClient) {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session && session.user) {
        updateHeaderAuth(session.user);
        fetchAndRenderProfile();
      }

      supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session && session.user) {
          updateHeaderAuth(session.user);
          fetchAndRenderProfile();
        } else {
          updateHeaderAuth(null);
        }
      });
    } catch (err) {
      console.error("Ошибка проверки сессии Supabase:", err);
    }
  } else {
    // Demo mode restore
    const savedDemoUser = localStorage.getItem('lunavisual_demo_user');
    if (savedDemoUser) {
      try {
        const user = JSON.parse(savedDemoUser);
        updateHeaderAuth(user);
        renderProfileData();
      } catch (e) {}
    }
  }
}

// --------------------------------------------------------------------------
// Standalone Profile & Auth Page Controller (profile.html)
// --------------------------------------------------------------------------
function initStandaloneProfilePage() {
  const authView = document.getElementById('authView');
  const profileView = document.getElementById('profileView');
  if (!authView && !profileView) return; // Not on profile.html

  const tabLoginBtn = document.getElementById('tabLoginBtn');
  const tabRegisterBtn = document.getElementById('tabRegisterBtn');
  const formLogin = document.getElementById('formLogin');
  const formRegister = document.getElementById('formRegister');
  const authAlert = document.getElementById('authAlert');
  const profileAlert = document.getElementById('profileAlert');

  const profileAvatar = document.getElementById('profileAvatar');
  const profileUsername = document.getElementById('profileUsername');
  const profileUserEmail = document.getElementById('profileUserEmail');
  const profileSubBadge = document.getElementById('profileSubBadge');
  const profileSubExpiry = document.getElementById('profileSubExpiry');
  const profileHwidVal = document.getElementById('profileHwidVal');
  const formRedeemKey = document.getElementById('formRedeemKey');
  const inputLicenseKey = document.getElementById('inputLicenseKey');
  const btnRedeemKey = document.getElementById('btnRedeemKey');

  const adminGenBox = document.getElementById('adminGeneratorBox');
  const btnAdminGenKey = document.getElementById('btnAdminGenKey');
  const selectKeyPlan = document.getElementById('selectKeyPlan');
  const adminLastKeyDisplay = document.getElementById('adminLastKeyDisplay');
  const customPlanSelect = document.getElementById('customPlanSelect');
  const customPlanTrigger = document.getElementById('customPlanTrigger');
  const customPlanLabel = document.getElementById('customPlanSelectedLabel');
  const customPlanOptions = document.querySelectorAll('#customPlanOptions .custom-option');

  const dlBox = document.getElementById('profileDownloadBox');
  const btnDownloadClient = document.getElementById('btnDownloadClient');
  const btnResetHwid = document.getElementById('btnResetHwid');
  const btnLogout = document.getElementById('btnLogout');

  // Tab switcher
  if (tabLoginBtn && tabRegisterBtn && formLogin && formRegister) {
    tabLoginBtn.addEventListener('click', () => {
      tabLoginBtn.classList.add('active');
      tabRegisterBtn.classList.remove('active');
      formLogin.classList.add('active');
      formRegister.classList.remove('active');
      clearAlert(authAlert);
    });
    tabRegisterBtn.addEventListener('click', () => {
      tabRegisterBtn.classList.add('active');
      tabLoginBtn.classList.remove('active');
      formRegister.classList.add('active');
      formLogin.classList.remove('active');
      clearAlert(authAlert);
    });
  }

  // Render profile view on profile.html
  async function renderStandaloneProfile(user) {
    if (!user) {
      if (authView) authView.classList.add('active');
      if (profileView) profileView.classList.remove('active');
      return;
    }

    if (authView) authView.classList.remove('active');
    if (profileView) profileView.classList.add('active');

    let nickname = user.user_metadata?.mc_nickname || user.email?.split('@')[0] || 'Игрок';
    let email = user.email || 'Не указан';
    let hwid = user.user_metadata?.hwid || 'Не привязан';
    let rawSubActive = user.user_metadata?.subscription_active;
    let rawSubUntil = user.user_metadata?.subscription_until;
    let prof = null;

    // Pull live HWID and subscription from profiles table
    if (supabaseClient) {
      try {
        let query = supabaseClient.from('profiles').select('*');
        if (email && nickname) {
          query = query.or(`email.eq.${email},mc_nickname.ilike.${nickname},id.eq.${user.id}`);
        } else {
          query = query.eq('id', user.id);
        }
        const { data: profs } = await query.limit(1);
        if (profs && profs.length > 0) {
          prof = profs[0];
          if (prof.hwid && prof.hwid !== 'null' && prof.hwid !== '') {
            hwid = prof.hwid;
            if (!user.user_metadata) user.user_metadata = {};
            user.user_metadata.hwid = prof.hwid;
          }
          if (prof.mc_nickname) nickname = prof.mc_nickname;
          if (prof.subscription_until) rawSubUntil = prof.subscription_until;
          if (prof.subscription_active !== undefined) rawSubActive = prof.subscription_active;
        }

        // Check if user has an admin license key (ADMIN_id or used_by email)
        const { data: aKeys } = await supabaseClient.from('license_keys')
          .select('id, code, used_by')
          .or(`code.eq.ADMIN_${user.id},used_by.eq.${email}`)
          .limit(1);
        if (aKeys && aKeys.length > 0) {
          prof = prof || {};
          prof.is_admin = true;
        }
      } catch (e) {
        console.warn("Live profile fetch error:", e);
      }
    }

    const isBanned = (rawSubUntil === 'BANNED' || hwid === 'BANNED' || rawSubUntil === 'Заблокирован');
    if (isBanned) {
      if (supabaseClient) await supabaseClient.auth.signOut();
      if (authView) authView.classList.add('active');
      if (profileView) profileView.classList.remove('active');
      showAlert(authAlert, '⛔ Ваш аккаунт заблокирован администратором!', 'error');
      return;
    }

    const subActive = rawSubActive === true || rawSubActive === 'true' || 
      (rawSubUntil && rawSubUntil !== 'Не активна' && rawSubUntil !== 'Требуется активация ключа');
    const subExpiry = rawSubUntil || (subActive ? 'Навсегда (Lifetime)' : 'Требуется активация ключа');

    if (profileUsername) profileUsername.textContent = nickname;
    if (profileUserEmail) profileUserEmail.textContent = email;
    if (profileAvatar) {
      setLunaAvatar(profileAvatar, nickname, email);
    }

    if (profileSubBadge) {
      if (subActive) {
        profileSubBadge.setAttribute('data-i18n', 'prof_sub_active');
        profileSubBadge.textContent = window.getLangString ? window.getLangString('prof_sub_active') : 'Активна';
        profileSubBadge.className = 'card-status-badge';
      } else {
        profileSubBadge.setAttribute('data-i18n', 'prof_sub_inactive');
        profileSubBadge.textContent = window.getLangString ? window.getLangString('prof_sub_inactive') : 'Не активна';
        profileSubBadge.className = 'card-status-badge inactive';
      }
    }

    if (profileSubExpiry) {
      if (subActive) {
        profileSubExpiry.textContent = subExpiry;
        profileSubExpiry.removeAttribute('data-i18n');
      } else {
        profileSubExpiry.setAttribute('data-i18n', 'prof_sub_need_key');
        profileSubExpiry.textContent = window.getLangString ? window.getLangString('prof_sub_need_key') : 'Требуется активация ключа';
      }
    }

    if (profileHwidVal) {
      if (hwid && hwid !== 'Не привязан' && hwid !== 'Not bound' && hwid !== 'null') {
        profileHwidVal.textContent = hwid;
        profileHwidVal.removeAttribute('data-i18n');
      } else {
        profileHwidVal.setAttribute('data-i18n', 'prof_hwid_not_bound');
        profileHwidVal.textContent = window.getLangString ? window.getLangString('prof_hwid_not_bound') : 'Не привязан';
      }
    }

    const btnAdminPanel = document.getElementById('btnAdminPanel');
    const isAdmin = (email && email.toLowerCase() === '') || 
                    user.user_metadata?.role === 'Admin' || 
                    (prof && (prof.is_admin === true || prof.is_admin === 'true' || prof.role === 'Admin'));
    if (btnAdminPanel) btnAdminPanel.style.display = isAdmin ? 'inline-flex' : 'none';
    if (adminGenBox) adminGenBox.style.display = isAdmin ? 'block' : 'none';
    if (btnResetHwid) btnResetHwid.style.display = isAdmin ? 'inline-flex' : 'none';
    if (dlBox) dlBox.style.display = (subActive || isAdmin) ? 'block' : 'none';
  }

  // Update standalone on auth change
  const originalUpdateHeader = updateHeaderAuth;
  updateHeaderAuth = function(user) {
    originalUpdateHeader(user);
    renderStandaloneProfile(user);
  };

  if (currentUser) {
    renderStandaloneProfile(currentUser);
  } else {
    renderStandaloneProfile(null);
  }

  // Form Login
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(authAlert);
      const emailInput = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const btn = document.getElementById('btnSubmitLogin');

      if (!emailInput || !password) {
        showAlert(authAlert, window.getLangString('auth_err_fill_fields'), 'error');
        return;
      }

      btn.disabled = true;
      btn.textContent = window.getLangString('btn_signing_in');

      if (supabaseClient) {
        try {
          const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: emailInput,
            password: password
          });
          if (error) {
            showAlert(authAlert, error.message.includes('Invalid login') ? window.getLangString('auth_err_invalid_login') : error.message, 'error');
          } else {
            // Check if user is banned
            const { data: profs } = await supabaseClient.from('profiles').select('*').eq('id', data.user.id).limit(1);
            const prof = profs && profs[0];
            const isBan = prof && (prof.subscription_until === 'BANNED' || prof.hwid === 'BANNED' || prof.subscription_until === 'Заблокирован');
            if (isBan) {
              await supabaseClient.auth.signOut();
              showAlert(authAlert, window.getLangString('auth_err_banned'), 'error');
              btn.disabled = false;
              btn.textContent = window.getLangString('prof_btn_login');
              return;
            }
            showAlert(authAlert, window.getLangString('auth_success_login'), 'success');
            updateHeaderAuth(data.user);
            fetchAndRenderProfile();
          }
        } catch (err) {
          showAlert(authAlert, window.getLangString('auth_err_server'), 'error');
        }
      }
      btn.disabled = false;
      btn.textContent = window.getLangString('prof_btn_login');
    });
  }

  // Form Register
  if (formRegister) {
    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(authAlert);
      const nick = document.getElementById('regNickname').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const pass = document.getElementById('regPassword').value;
      const btn = document.getElementById('btnSubmitRegister');

      if (!nick || !email || !pass) {
        showAlert(authAlert, window.getLangString('auth_err_reg_fill'), 'error');
        return;
      }
      if (pass.length < 6) {
        showAlert(authAlert, window.getLangString('auth_err_pass_min'), 'error');
        return;
      }

      btn.disabled = true;
      btn.textContent = window.getLangString('btn_registering');

      if (supabaseClient) {
        try {
          const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: pass,
            options: {
              data: {
                mc_nickname: nick,
                hwid: null,
                subscription_active: false,
                subscription_until: 'Не активна'
              }
            }
          });
          if (error) {
            showAlert(authAlert, error.message, 'error');
          } else {
            if (data.user) {
              try {
                await supabaseClient.from('profiles').upsert([{
                  id: data.user.id,
                  email: email,
                  mc_nickname: nick,
                  hwid: null,
                  subscription_active: false,
                  subscription_until: 'Не активна'
                }]);
              } catch (e) {}
              showAlert(authAlert, window.getLangString('auth_success_reg'), 'success');
              updateHeaderAuth(data.user);
              fetchAndRenderProfile();
            }
          }
        } catch (err) {
          showAlert(authAlert, window.getLangString('auth_err_server'), 'error');
        }
      }
      btn.disabled = false;
      btn.textContent = window.getLangString('prof_btn_register');
    });
  }

  // Form Key Redeem — keys are activated only for the logged-in WEBSITE account.
  if (formRedeemKey) {
    formRedeemKey.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(profileAlert);
      const keyVal = inputLicenseKey ? inputLicenseKey.value.trim().toUpperCase() : '';
      if (!keyVal) { showAlert(profileAlert, 'Введите ключ LunaVisual.', 'error'); return; }
      if (!supabaseClient) { showAlert(profileAlert, 'Сервер авторизации недоступен.', 'error'); return; }
      if (btnRedeemKey) { btnRedeemKey.disabled = true; btnRedeemKey.textContent = 'Проверка...'; }
      try {
        let { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData?.session) {
          const refreshed = await supabaseClient.auth.refreshSession();
          if (refreshed.error) throw refreshed.error;
          sessionData = refreshed.data;
        }
        const siteUser = sessionData?.session?.user;
        if (!siteUser) throw new Error('login_required');
        currentUser = siteUser;
        const { data, error } = await supabaseClient.rpc('redeem_lunavisual_key', { p_code: keyVal });
        if (error) throw error;
        if (!data?.ok) {
          const errors = {not_found:'Ключ не найден.',used:'Этот ключ уже использован.',rate_limited:'Слишком много попыток. Попробуйте позже.'};
          showAlert(profileAlert, errors[data?.error] || 'Ключ не удалось активировать.', 'error');
          return;
        }
        inputLicenseKey.value = '';
        await renderStandaloneProfile(siteUser);
        showAlert(profileAlert, `✓ Ключ активирован. Подписка: ${data.subscription_until || 'активна'}`, 'success');
      } catch (err) {
        const raw=String(err?.message||err||'Ошибка сервера');
        showAlert(profileAlert, raw.includes('login_required') ? 'Сначала зарегистрируйтесь или войдите на сайте.' : `Ошибка активации: ${raw}`, 'error');
      } finally {
        if (btnRedeemKey) { btnRedeemKey.disabled=false; btnRedeemKey.textContent = window.getLangString ? window.getLangString('prof_key_btn') : 'Применить'; }
      }
    });
  }

  // Admin Custom Dropdown
  if (customPlanTrigger && customPlanSelect) {
    customPlanTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      customPlanSelect.classList.toggle('open');
    });
    customPlanOptions.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        customPlanOptions.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        const val = opt.getAttribute('data-value');
        if (selectKeyPlan) selectKeyPlan.value = val;
        if (customPlanLabel) customPlanLabel.textContent = opt.textContent.trim();
        customPlanSelect.classList.remove('open');
      });
    });
    document.addEventListener('click', () => customPlanSelect.classList.remove('open'));
  }

  // Admin Key Generator — only the website account is required.
  // The launcher has no separate registration and is not consulted here.
  if (btnAdminGenKey) {
    btnAdminGenKey.addEventListener('click', async () => {
      clearAlert(profileAlert);
      if (!supabaseClient) {
        showAlert(profileAlert, 'Supabase не подключён.', 'error');
        return;
      }

      const planVal = selectKeyPlan ? selectKeyPlan.value : '9999';
      const rawDays = parseInt(planVal, 10);
      const days = rawDays >= 9000 ? 999999 : Math.max(1, rawDays || 30);
      const oldText = btnAdminGenKey.textContent;
      btnAdminGenKey.disabled = true;
      btnAdminGenKey.textContent = 'Генерация...';

      try {
        // Validate the WEBSITE session. There is intentionally no launcher-account check.
        let { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData?.session) {
          const refreshed = await supabaseClient.auth.refreshSession();
          if (refreshed.error) throw refreshed.error;
          sessionData = refreshed.data;
        }
        const siteUser = sessionData?.session?.user;
        if (!siteUser) throw new Error('Сессия сайта истекла. Войдите на сайте ещё раз. Регистрация в лаунчере не нужна.');

        const isOwner = String(siteUser.email || '').toLowerCase() === LUNAVISUAL_OWNER_EMAIL;
        let isAdmin = isOwner;
        if (!isAdmin) {
          const { data: prof } = await supabaseClient.from('profiles').select('is_admin').eq('id', siteUser.id).maybeSingle();
          isAdmin = prof?.is_admin === true;
        }
        if (!isAdmin) throw new Error('Создавать ключи может только администратор LunaVisual.');

        const { data, error } = await supabaseClient.rpc('generate_lunavisual_keys', {
          p_count: 1,
          p_duration_days: days
        });
        if (error) throw error;
        const generatedCode = Array.isArray(data) ? data[0]?.code : data?.code;
        if (!generatedCode) throw new Error('База данных не вернула созданный ключ. Повторно выполните supabase_setup.sql.');

        if (adminLastKeyDisplay) {
          adminLastKeyDisplay.style.display = 'block';
          adminLastKeyDisplay.innerHTML = `
            <div class="key-gen-result">
              <div class="key-gen-info">
                <span class="key-gen-label">Сгенерированный ключ</span>
                <span class="key-gen-code">${generatedCode}</span>
              </div>
              <button type="button" class="btn-copy-key" id="btnCopyGenKey"><span>Скопировать</span></button>
            </div>`;
          document.getElementById('btnCopyGenKey')?.addEventListener('click', async () => {
            const copied = await copyTextToClipboard(generatedCode);
            if (!copied) showAlert(profileAlert, 'Не удалось скопировать автоматически.', 'error');
          });
        }
        showAlert(profileAlert, `✓ Ключ ${generatedCode} создан и сохранён в базе.`, 'success');
      } catch (err) {
        const raw = String(err?.message || err || 'Ошибка генерации');
        const msg = raw.includes('login_required') || raw.includes('JWT')
          ? 'Сессия сайта не подтверждена. Выйдите и войдите снова на сайте. Аккаунт лаунчера для генерации НЕ нужен.'
          : raw;
        showAlert(profileAlert, `Ошибка генерации: ${msg}`, 'error');
      } finally {
        btnAdminGenKey.disabled = false;
        btnAdminGenKey.textContent = oldText || '+ Создать ключ';
      }
    });
  }

  // Custom Confirm Dialog Modal Helper
  function showCustomConfirm({ title = 'Подтвердите действие', message = 'Вы уверены?', confirmText = 'Да, сбросить', onConfirm }) {
    const modal = document.getElementById('confirmModal');
    if (!modal) {
      if (confirm(message)) {
        if (typeof onConfirm === 'function') onConfirm();
      }
      return;
    }

    const titleEl = document.getElementById('confirmModalTitle');
    const msgEl = document.getElementById('confirmModalMsg');
    const btnOk = document.getElementById('btnConfirmOk');
    const btnCancel = document.getElementById('btnConfirmCancel');

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (btnOk) btnOk.textContent = confirmText;

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');

    const handleCancel = () => {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
      cleanup();
    };

    const handleOk = () => {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
      cleanup();
      if (typeof onConfirm === 'function') onConfirm();
    };

    const handleOverlay = (e) => {
      if (e.target === modal) handleCancel();
    };

    function cleanup() {
      if (btnCancel) btnCancel.removeEventListener('click', handleCancel);
      if (btnOk) btnOk.removeEventListener('click', handleOk);
      modal.removeEventListener('click', handleOverlay);
    }

    if (btnCancel) btnCancel.addEventListener('click', handleCancel);
    if (btnOk) btnOk.addEventListener('click', handleOk);
    modal.addEventListener('click', handleOverlay);
  }

  // HWID Reset with Custom Neon Confirmation
  if (btnResetHwid) {
    btnResetHwid.addEventListener('click', () => {
      showCustomConfirm({
        title: window.getLangString ? window.getLangString('prof_modal_title') : 'Подтвердите действие',
        message: window.getLangString ? window.getLangString('prof_modal_msg') : 'Вы уверены, что хотите сбросить привязку HWID?',
        confirmText: window.getLangString ? window.getLangString('prof_modal_ok') : 'Да, сбросить',
        onConfirm: async () => {
          clearAlert(profileAlert);
          btnResetHwid.disabled = true;
          btnResetHwid.textContent = '...';

          if (supabaseClient && currentUser) {
            try {
              await supabaseClient.auth.updateUser({ data: { hwid: null } });
              try { await supabaseClient.from('profiles').update({ hwid: null }).eq('id', currentUser.id); } catch(e){}
              currentUser.user_metadata.hwid = null;
              renderStandaloneProfile(currentUser);
              showAlert(profileAlert, '✓ ' + (window.getLangString ? window.getLangString('toast_reset_hwid_success').replace('{nick}', currentUser.user_metadata?.mc_nickname || '') : 'HWID сброшен.'), 'success');
            } catch (err) {
              showAlert(profileAlert, 'Ошибка связи с сервером при сбросе HWID.', 'error');
            }
          }
          btnResetHwid.disabled = false;
          btnResetHwid.innerHTML = `<span>⟳</span> ${window.getLangString ? window.getLangString('prof_btn_reset_hwid') : 'Сбросить привязку HWID'}`;
        }
      });
    });
  }

  // Logout
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      if (supabaseClient) {
        await supabaseClient.auth.signOut();
      } else {
        localStorage.removeItem('lunavisual_demo_user');
      }
      updateHeaderAuth(null);
      renderStandaloneProfile(null);
    });
  }

  // Re-render profile dynamically on language toggle
  window.addEventListener('languageChanged', () => {
    if (currentUser) {
      renderStandaloneProfile(currentUser);
    }
  });
}

// Auto-run Standalone Profile Page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStandaloneProfilePage);
} else {
  initStandaloneProfilePage();
}

checkInitialSession();

// Direct Client Download via Supabase Cloud Storage (LunaVisual.exe launcher)
const btnDownloadClient = document.getElementById('btnDownloadClient') || document.getElementById('btn-download-client');
if (btnDownloadClient) {
  btnDownloadClient.addEventListener('click', () => {
    const downloadUrl = './LunaVisual-Launcher.zip';
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = 'LunaVisual-Launcher.zip';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

/* ==========================================================================
   6. AnyPay Checkout & Payment Controller
   ========================================================================== */
const checkoutModal = document.getElementById('checkout-modal');
const btnCloseCheckout = document.getElementById('btn-close-checkout');
const formCheckout = document.getElementById('form-checkout');
const checkoutPlanNameEl = document.getElementById('checkout-plan-name');
const checkoutPlanPriceEl = document.getElementById('checkout-plan-price');
const checkoutHiddenPlan = document.getElementById('checkout-hidden-plan');
const checkoutHiddenPrice = document.getElementById('checkout-hidden-price');
const checkoutNickInput = document.getElementById('checkout-nickname');
const checkoutEmailInput = document.getElementById('checkout-email');
const checkoutAlert = document.getElementById('checkout-alert');

// AnyPay Project ID
const ANYPAY_PROJECT_ID = '18155';

// Discord Purchase Link
const DISCORD_PURCHASE_URL = 'https://discord.gg/7FhVmvPtME';

// Direct Buy Plan click -> Open Discord
document.querySelectorAll('.btn-buy-plan').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    window.open(DISCORD_PURCHASE_URL, '_blank');
  });
});

if (btnCloseCheckout) {
  btnCloseCheckout.addEventListener('click', () => closeModal(checkoutModal));
}

// Close checkout modal on overlay click
if (checkoutModal) {
  checkoutModal.addEventListener('click', (e) => {
    if (e.target === checkoutModal) closeModal(checkoutModal);
  });
}

// Handle Payment Submission -> Discord Redirect
if (formCheckout) {
  formCheckout.addEventListener('submit', (e) => {
    e.preventDefault();
    window.open(DISCORD_PURCHASE_URL, '_blank');
  });
}

// Check if returning from payment
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('payment') === 'success') {
  setTimeout(() => {
    alert('🎉 Оплата успешно завершена! Ваш ключ активируется автоматически. Если у вас возникнут вопросы — напишите нам в Discord!');
    window.history.replaceState({}, document.title, window.location.pathname);
  }, 600);
} else if (urlParams.get('payment') === 'fail') {
  setTimeout(() => {
    alert('❌ Оплата была отменена или не завершена. Попробуйте снова или выберите другой способ оплаты.');
    window.history.replaceState({}, document.title, window.location.pathname);
  }, 600);
}

/* ==========================================================================
   7. Interactive Visual Comparison Slider ("Играй по-своему")
   ========================================================================== */
function initComparisonSlider() {
  const frame = document.getElementById('comparisonFrame');
  const layerAfter = document.getElementById('layerAfter');
  const slider = document.getElementById('comparisonSlider');
  const hint = document.getElementById('comparisonHint');
  const afterImg = layerAfter ? layerAfter.querySelector('img') : null;

  if (!frame || !layerAfter || !slider) return;

  let isDragging = false;

  function updateAfterImgWidth() {
    if (afterImg && frame) {
      afterImg.style.width = `${frame.offsetWidth}px`;
    }
  }

  window.addEventListener('resize', updateAfterImgWidth);
  updateAfterImgWidth();

  function setSliderPosition(xRatio) {
    const clamped = Math.max(0, Math.min(1, xRatio));
    const percent = (clamped * 100).toFixed(2);
    layerAfter.style.width = `${percent}%`;
    slider.style.left = `${percent}%`;
    if (hint && !frame.classList.contains('has-interacted')) {
      frame.classList.add('has-interacted');
    }
  }

  function handlePointer(e) {
    const rect = frame.getBoundingClientRect();
    const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
    const xRatio = (clientX - rect.left) / rect.width;
    setSliderPosition(xRatio);
  }

  frame.addEventListener('mousedown', (e) => {
    isDragging = true;
    frame.classList.add('is-dragging');
    layerAfter.style.transition = 'none';
    slider.style.transition = 'none';
    handlePointer(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    handlePointer(e);
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      frame.classList.remove('is-dragging');
    }
  });

  frame.addEventListener('touchstart', (e) => {
    isDragging = true;
    frame.classList.add('is-dragging');
    layerAfter.style.transition = 'none';
    slider.style.transition = 'none';
    handlePointer(e);
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    handlePointer(e);
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (isDragging) {
      isDragging = false;
      frame.classList.remove('is-dragging');
    }
  });

  // Smooth intro reveal animation when scrolling into view
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          updateAfterImgWidth();
          layerAfter.style.transition = 'width 0.85s cubic-bezier(0.25, 1, 0.5, 1)';
          slider.style.transition = 'left 0.85s cubic-bezier(0.25, 1, 0.5, 1)';
          setSliderPosition(0.5);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });

    observer.observe(frame);
  } else {
    setSliderPosition(0.5);
  }
}

// Auto-run Comparison Slider
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initComparisonSlider);
} else {
  initComparisonSlider();
}

// --------------------------------------------------------------------------
// Smooth Page Transitions
// --------------------------------------------------------------------------
function smoothNavigate(url) {
  if (!url) return;
  if (url.startsWith('#') || url.startsWith('javascript:')) return;
  
  if (url.startsWith('http://') || url.startsWith('https://')) {
    if (!url.includes(window.location.host)) {
      window.open(url, '_blank');
      return;
    }
  }

  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const targetBase = url.split('#')[0].split('?')[0];
  if (targetBase === currentPath && url.includes('#')) {
    const hash = url.substring(url.indexOf('#'));
    const targetEl = document.querySelector(hash);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth' });
      return;
    }
  }

  document.body.classList.add('page-transition-exit');
  setTimeout(() => {
    window.location.href = url;
  }, 320);
}

// Intercept page navigations
document.addEventListener('click', (e) => {
  const target = e.target.closest('button, a');
  if (!target) return;

  const onclickAttr = target.getAttribute('onclick');
  if (onclickAttr && (onclickAttr.includes("location.href") || onclickAttr.includes('window.location'))) {
    const match = onclickAttr.match(/location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/);
    if (match && match[1]) {
      const url = match[1];
      if (!url.startsWith('http') || url.includes(window.location.host)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        smoothNavigate(url);
        return;
      }
    }
  }

  if (target.tagName === 'A') {
    const href = target.getAttribute('href');
    const targetAttr = target.getAttribute('target');
    if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:') && targetAttr !== '_blank') {
      if (!href.startsWith('http') || href.includes(window.location.host)) {
        e.preventDefault();
        smoothNavigate(href);
      }
    }
  }
}, true);

// Reset transition on pageshow (e.g. browser back/forward buttons)
window.addEventListener('pageshow', () => {
  document.body.classList.remove('page-transition-exit');
});

/* ==========================================================================
   Global Site Configuration & Dynamic Theme Engine
   ========================================================================== */
const THEME_PRESETS = {
  purple: {
    name: 'Cyber-Purple',
    '--p-primary': '#9d4edd',
    '--p-primary-hover': '#b366ff',
    '--p-glow': 'rgba(157, 78, 221, 0.45)',
    '--p-deep': '#5a189a',
    '--p-electric': '#7b2cbf',
    '--p-light': '#c77dff',
    '--p-soft': '#e0aaff',
    '--p-muted': '#9f8bc2',
    '--p-contrast-text': '#ffffff',
    '--text-muted': '#a39bb5',
    '--text-dim': '#706884',
    '--bg-dark': '#07060b',
    '--bg-surface': '#0e0a16',
    '--bg-card': 'rgba(20, 14, 32, 0.75)',
    '--bg-card-hover': 'rgba(32, 22, 52, 0.9)',
    '--border-subtle': 'rgba(157, 78, 221, 0.22)',
    '--border-active': 'rgba(199, 125, 255, 0.5)',
    '--theme-glow-1': '#7b2cbf',
    '--theme-glow-2': '#5a189a',
    '--theme-glow-3': '#9d4edd'
  },
  white: {
    name: 'Cyber-Silver',
    '--p-primary': '#e2e8f0',
    '--p-primary-hover': '#ffffff',
    '--p-glow': 'rgba(255, 255, 255, 0.35)',
    '--p-deep': '#475569',
    '--p-electric': '#94a3b8',
    '--p-light': '#f8fafc',
    '--p-soft': '#cbd5e1',
    '--p-muted': '#94a3b8',
    '--p-contrast-text': '#07090e',
    '--text-muted': '#94a3b8',
    '--text-dim': '#64748b',
    '--bg-dark': '#060709',
    '--bg-surface': '#0d0f14',
    '--bg-card': 'rgba(18, 22, 28, 0.75)',
    '--bg-card-hover': 'rgba(30, 36, 46, 0.9)',
    '--border-subtle': 'rgba(255, 255, 255, 0.2)',
    '--border-active': 'rgba(255, 255, 255, 0.6)',
    '--theme-glow-1': '#94a3b8',
    '--theme-glow-2': '#64748b',
    '--theme-glow-3': '#cbd5e1'
  },
  red: {
    name: 'Crimson Flame',
    '--p-primary': '#ef4444',
    '--p-primary-hover': '#f87171',
    '--p-glow': 'rgba(239, 68, 68, 0.45)',
    '--p-deep': '#991b1b',
    '--p-electric': '#dc2626',
    '--p-light': '#fca5a5',
    '--p-soft': '#fecaca',
    '--p-muted': '#f87171',
    '--p-contrast-text': '#ffffff',
    '--text-muted': '#baa3a5',
    '--text-dim': '#85686a',
    '--bg-dark': '#0b0405',
    '--bg-surface': '#16080a',
    '--bg-card': 'rgba(32, 12, 15, 0.75)',
    '--bg-card-hover': 'rgba(50, 18, 22, 0.9)',
    '--border-subtle': 'rgba(239, 68, 68, 0.22)',
    '--border-active': 'rgba(248, 113, 113, 0.5)',
    '--theme-glow-1': '#dc2626',
    '--theme-glow-2': '#991b1b',
    '--theme-glow-3': '#ef4444'
  },
  blue: {
    name: 'Royal Cobalt',
    '--p-primary': '#3b82f6',
    '--p-primary-hover': '#60a5fa',
    '--p-glow': 'rgba(59, 130, 246, 0.45)',
    '--p-deep': '#1e40af',
    '--p-electric': '#2563eb',
    '--p-light': '#93c5fd',
    '--p-soft': '#bfdbfe',
    '--p-muted': '#60a5fa',
    '--p-contrast-text': '#ffffff',
    '--text-muted': '#98b2ce',
    '--text-dim': '#607a9b',
    '--bg-dark': '#04070d',
    '--bg-surface': '#080f1d',
    '--bg-card': 'rgba(10, 20, 40, 0.75)',
    '--bg-card-hover': 'rgba(16, 32, 64, 0.9)',
    '--border-subtle': 'rgba(59, 130, 246, 0.22)',
    '--border-active': 'rgba(96, 165, 250, 0.5)',
    '--theme-glow-1': '#2563eb',
    '--theme-glow-2': '#1e40af',
    '--theme-glow-3': '#3b82f6'
  },
  green: {
    name: 'Toxic Emerald',
    '--p-primary': '#10b981',
    '--p-primary-hover': '#34d399',
    '--p-glow': 'rgba(16, 185, 129, 0.45)',
    '--p-deep': '#065f46',
    '--p-electric': '#059669',
    '--p-light': '#6ee7b7',
    '--p-soft': '#a7f3d0',
    '--p-muted': '#34d399',
    '--p-contrast-text': '#ffffff',
    '--text-muted': '#96bfae',
    '--text-dim': '#5a8470',
    '--bg-dark': '#030a06',
    '--bg-surface': '#06140c',
    '--bg-card': 'rgba(8, 28, 18, 0.75)',
    '--bg-card-hover': 'rgba(14, 44, 28, 0.9)',
    '--border-subtle': 'rgba(16, 185, 129, 0.22)',
    '--border-active': 'rgba(52, 211, 153, 0.5)',
    '--theme-glow-1': '#059669',
    '--theme-glow-2': '#065f46',
    '--theme-glow-3': '#10b981'
  },
  cyan: {
    name: 'Neon Aqua',
    '--p-primary': '#06b6d4',
    '--p-primary-hover': '#22d3ee',
    '--p-glow': 'rgba(6, 182, 212, 0.45)',
    '--p-deep': '#155e75',
    '--p-electric': '#0891b2',
    '--p-light': '#67e8f9',
    '--p-soft': '#a5f3fc',
    '--p-muted': '#22d3ee',
    '--p-contrast-text': '#ffffff',
    '--text-muted': '#92bfc9',
    '--text-dim': '#54838f',
    '--bg-dark': '#03090b',
    '--bg-surface': '#061217',
    '--bg-card': 'rgba(6, 26, 34, 0.75)',
    '--bg-card-hover': 'rgba(10, 42, 54, 0.9)',
    '--border-subtle': 'rgba(6, 182, 212, 0.22)',
    '--border-active': 'rgba(34, 211, 238, 0.5)',
    '--theme-glow-1': '#0891b2',
    '--theme-glow-2': '#155e75',
    '--theme-glow-3': '#06b6d4'
  },
  pink: {
    name: 'Hot Magenta',
    '--p-primary': '#ec4899',
    '--p-primary-hover': '#f472b6',
    '--p-glow': 'rgba(236, 72, 153, 0.45)',
    '--p-deep': '#9d174d',
    '--p-electric': '#db2777',
    '--p-light': '#f9a8d4',
    '--p-soft': '#fbcfe8',
    '--p-muted': '#f472b6',
    '--p-contrast-text': '#ffffff',
    '--text-muted': '#c29bb3',
    '--text-dim': '#8b607a',
    '--bg-dark': '#0b0408',
    '--bg-surface': '#170711',
    '--bg-card': 'rgba(34, 12, 26, 0.75)',
    '--bg-card-hover': 'rgba(52, 18, 40, 0.9)',
    '--border-subtle': 'rgba(236, 72, 153, 0.22)',
    '--border-active': 'rgba(244, 114, 182, 0.5)',
    '--theme-glow-1': '#db2777',
    '--theme-glow-2': '#9d174d',
    '--theme-glow-3': '#ec4899'
  },
  gold: {
    name: 'Amber Royale',
    '--p-primary': '#f59e0b',
    '--p-primary-hover': '#fbbf24',
    '--p-glow': 'rgba(245, 158, 11, 0.45)',
    '--p-deep': '#92400e',
    '--p-electric': '#d97706',
    '--p-light': '#fcd34d',
    '--p-soft': '#fde68a',
    '--p-muted': '#fbbf24',
    '--p-contrast-text': '#120d04',
    '--text-muted': '#c2b496',
    '--text-dim': '#8a7b5c',
    '--bg-dark': '#0a0803',
    '--bg-surface': '#151006',
    '--bg-card': 'rgba(30, 22, 10, 0.75)',
    '--bg-card-hover': 'rgba(48, 34, 14, 0.9)',
    '--border-subtle': 'rgba(245, 158, 11, 0.22)',
    '--border-active': 'rgba(251, 191, 36, 0.5)',
    '--theme-glow-1': '#d97706',
    '--theme-glow-2': '#92400e',
    '--theme-glow-3': '#f59e0b'
  },
  orange: {
    name: 'Blaze Lava',
    '--p-primary': '#f97316',
    '--p-primary-hover': '#fb923c',
    '--p-glow': 'rgba(249, 115, 22, 0.45)',
    '--p-deep': '#9a3412',
    '--p-electric': '#ea580c',
    '--p-light': '#fdba74',
    '--p-soft': '#fed7aa',
    '--p-muted': '#fb923c',
    '--p-contrast-text': '#ffffff',
    '--text-muted': '#c4aaa0',
    '--text-dim': '#8c6d62',
    '--bg-dark': '#0b0603',
    '--bg-surface': '#160c05',
    '--bg-card': 'rgba(34, 16, 8, 0.75)',
    '--bg-card-hover': 'rgba(52, 26, 12, 0.9)',
    '--border-subtle': 'rgba(249, 115, 22, 0.22)',
    '--border-active': 'rgba(251, 146, 60, 0.5)',
    '--theme-glow-1': '#ea580c',
    '--theme-glow-2': '#9a3412',
    '--theme-glow-3': '#f97316'
  },
  violet: {
    name: 'Ultra Violet',
    '--p-primary': '#8b5cf6',
    '--p-primary-hover': '#a78bfa',
    '--p-glow': 'rgba(139, 92, 246, 0.45)',
    '--p-deep': '#4c1d95',
    '--p-electric': '#6d28d9',
    '--p-light': '#c4b5fd',
    '--p-soft': '#ddd6fe',
    '--p-muted': '#a78bfa',
    '--p-contrast-text': '#ffffff',
    '--text-muted': '#aca2cc',
    '--text-dim': '#756b99',
    '--bg-dark': '#07040d',
    '--bg-surface': '#0f081a',
    '--bg-card': 'rgba(22, 12, 38, 0.75)',
    '--bg-card-hover': 'rgba(36, 18, 62, 0.9)',
    '--border-subtle': 'rgba(139, 92, 246, 0.22)',
    '--border-active': 'rgba(167, 139, 250, 0.5)',
    '--theme-glow-1': '#6d28d9',
    '--theme-glow-2': '#4c1d95',
    '--theme-glow-3': '#8b5cf6'
  }
};

const DEFAULT_SITE_CONFIG = {
  siteName: 'LunaVisual',
  heroTitle: 'Визуалы Нового Поколения <span>LunaVisual</span>',
  heroDesc: 'Улучшайте свой геймплей с помощью передовых шейдерных эффектов Chams, кастомных ViewModel, ESP-подсветки и адаптивного HUD. Создано для Fabric Loader 1.21.11 с полной оптимизацией GPU пайплайнов.',
  theme: 'moon',
  plans: {
    d7: { price: '270 ₽', desc: 'Полный доступ к LunaVisual на 7 дней' },
    d30: { price: '450 ₽', desc: 'Полный доступ к LunaVisual на 30 дней' },
    d90: { price: '670 ₽', desc: 'Полный доступ к LunaVisual на 90 дней' },
    life: { price: '1500 ₽', desc: 'Пожизненный доступ ко всем функциям и обновлениям' }
  }
};

let currentSiteConfig = DEFAULT_SITE_CONFIG;
const cachedSiteCfg = null;
if (cachedSiteCfg) {
  try {
    currentSiteConfig = Object.assign({}, DEFAULT_SITE_CONFIG, JSON.parse(cachedSiteCfg));
  } catch(e){}
}

/* ==========================================================================
   8. Multi-Language (i18n) System (RU / EN)
   ========================================================================== */
const TRANSLATIONS = {
  ru: {
    // Navigation
    nav_home: "Главная",
    nav_features: "Особенности",
    nav_pricing: "Цены",
    nav_comparison: "Сравнение",
    nav_faq: "FAQ",
    nav_login: "Войти",
    nav_profile: "Кабинет",
    nav_profile_long: "Личный кабинет",
    nav_buy: "Купить",
    nav_discord: "Discord",
    nav_to_home: "На главную",
    nav_to_profile: "В профиль",

    // Hero Section
    hero_title: "Визуалы Нового Поколения <span>LunaVisual</span>",
    hero_desc: "Улучшайте свой геймплей с помощью передовых шейдерных эффектов Chams, кастомных ViewModel, ESP-подсветки и адаптивного HUD. Создано для Fabric Loader 1.21.11 с полной оптимизацией GPU пайплайнов.",
    hero_btn: "Приобрести LunaVisual",
    stat_fabric: "Minecraft Fabric",
    stat_fps: "Стабильный FPS",
    stat_hwid: "Надёжная Защита",

    // Features Section
    feat_tag: "Преимущества",
    feat_title: "Почему выбирают <span>LunaVisual</span>",
    feat_subtitle: "Мы разработали уникальный рендеринг, который не влияет на производительность игры и выводит визуальную составляющую на новый уровень.",
    feat_1_title: "Шейдерные эффекты (Chams & ESP)",
    feat_1_desc: "Подсветка игроков и важных объектов. Мягкое свечение силуэтов, кастомные градиенты и гибкая настройка отображения сущностей.",
    feat_2_title: "ViewModel Кастомизатор",
    feat_2_desc: "Настраивайте положение, масштаб и углы поворота предметов на экране в реальном времени. Включает в себя интеграцию подсветки HoverGlow для комфортного редактирования.",
    feat_3_title: "GPU Mojang Pipeline",
    feat_3_desc: "Полная интеграция с новым графическим API Mojang (RenderPipeline, GpuTexture, CommandEncoder). Никаких просадок FPS при обработке полноэкранных шейдеров.",
    feat_4_title: "Защита по HWID",
    feat_4_desc: "Сервер авторизации LunaVisual проверяет ваш уникальный HWID компьютера через API. Исключает несанкционированный доступ и кражу вашей сборки.",

    // Pricing Section
    price_tag: "Приобретение",
    price_title: "Выберите Тарифный <span>План</span>",
    price_subtitle: "Получите моментальный доступ к премиум-визуалам LunaVisual сразу после оплаты. Никаких ручных проверок.",
    plan_reset_title: "Сброс HWID",
    plan_reset_desc: "Отвязка от старого ПК для переноса на новое устройство",
    plan_reset_f1: "Моментальный сброс привязки",
    plan_reset_f2: "Перенос клиента на новый ПК",
    plan_reset_f3: "Сохранение срока вашей подписки",
    plan_reset_f4: "Автоматическая смена устройства",
    plan_7d_title: "7 Дней",
    plan_7d_desc: "Полный доступ к LunaVisual на 7 дней",
    plan_90d_title: "90 Дней",
    plan_90d_desc: "Полный доступ к LunaVisual на 90 дней",
    plan_30d_title: "30 Дней",
    plan_30d_desc: "Полный доступ к LunaVisual на 30 дней",
    plan_30d_f1: "Доступ ко всем визуальным функциям",
    plan_30d_f2: "Кастомные темы оформления интерфейса",
    plan_30d_f3: "Интеграция с Discord RPC",
    plan_30d_f4: "Бесплатные обновления клиента",
    plan_1yr_title: "1 Год",
    plan_1yr_desc: "Выгодный доступ ко всем визуалам на 365 дней",
    plan_1yr_f1: "Доступ ко всем визуальным функциям",
    plan_1yr_f2: "Кастомные темы оформления интерфейса",
    plan_1yr_f3: "Интеграция с Discord RPC",
    plan_1yr_f4: "Бесплатные обновления клиента",
    plan_life_title: "Навсегда",
    plan_life_desc: "Пожизненный доступ ко всем функциям и обновлениям",
    plan_life_f1: "Доступ ко всем визуальным функциям",
    plan_life_f2: "Кастомные темы оформления интерфейса",
    plan_life_f3: "Интеграция с Discord RPC",
    plan_life_f4: "Пожизненные обновления клиента",
    featured_ribbon: "⭐ Популярный",
    btn_buy: "Купить",

    // Comparison & FAQ
    comp_tag: "Кастомизация",
    comp_title: "Играй <span>по-своему</span>",
    comp_subtitle: "Выбирай: сочный HD-дизайн клиента или мрачная классика Minecraft. Решение за тобой — всегда.",
    comp_hint: "◂ Тяните ползунок для сравнения ▸",
    faq_tag: "Вопросы и Ответы",
    faq_title: "Часто Задаваемые <span>Вопросы</span>",
    faq_subtitle: "Возникли вопросы по установке или работе? Здесь собраны популярные ответы.",
    faq_q1: "Как работает автоматическая привязка HWID?",
    faq_a1: "При регистрации вы указываете свой игровой никнейм. Когда вы заходите в игру с установленным модом LunaVisual, клиент собирает аппаратный идентификатор вашего ПК (HWID) и автоматически привязывает его к вашему профилю в базе. Сбросить привязку в любой момент можно прямо в личном кабинете на сайте.",
    faq_q2: "Каковы системные требования мода?",
    faq_a2: "Поскольку мы переписали рендеринг под нативное GPU API от Mojang (используя шейдерный конвейер Yarn), визуалы LunaVisual не нагружают процессор и требуют любую современную видеокарту с поддержкой OpenGL 3.2+ (практически любая видеокарта за последние 12 лет).",
    faq_q3: "Совместим ли LunaVisual с другими модами?",
    faq_a3: "Да, LunaVisual отлично работает на Fabric Loader 1.21.11 совместно с Sodium, Iris Shaders, Lithium и другими популярными модами для оптимизации.",

    // Footer
    footer_home: "Главная",
    footer_features: "Особенности",
    footer_pricing: "Тарифы",
    footer_profile: "Личный кабинет",
    footer_discord: "Discord Сообщество",
    footer_terms: "Пользовательское соглашение",
    footer_privacy: "Политика конфиденциальности",
    footer_support_title: "Служба технической поддержки:",
    footer_copy: "© 2026 LunaVisual. Все права защищены. Minecraft является торговой маркой Mojang Synergies AB. Данный сайт не аффилирован с Mojang.",

    // Checkout Modal
    checkout_kicker: "ОФОРМЛЕНИЕ ЗАКАЗА",
    checkout_title: "Покупка тарифа",
    checkout_subtitle: "Моментальная автоматическая выдача сразу после оплаты",
    checkout_plan_label: "Выбранный тариф",
    checkout_nick_label: "Игровой никнейм (Minecraft)",
    checkout_email_label: "Email для получения ключа и чека",
    checkout_methods_note: "💳 Доступные методы оплаты:",
    method_cards: "Банковские Карты",
    checkout_submit: "Перейти к оплате",

    // Profile & Auth
    prof_back: "← Вернуться на главную",
    prof_tag: "Аккаунт LunaVisual",
    prof_auth_title: "Авторизация <span>LunaVisual</span>",
    prof_auth_subtitle: "Войдите в личный кабинет для доступа к подписке и ключам",
    prof_tab_login: "Вход",
    prof_tab_register: "Регистрация",
    prof_login_email_lbl: "Email",
    prof_login_pass_lbl: "Пароль",
    prof_forgot_pass: "Забыли пароль?",
    prof_btn_login: "Войти в аккаунт",
    prof_reg_nick_lbl: "Игровой никнейм (Minecraft)",
    prof_reg_nick_ph: "Например: SadeWow",
    prof_reg_email_lbl: "Email",
    prof_reg_pass_lbl: "Пароль (минимум 6 символов)",
    prof_btn_register: "Зарегистрироваться",
    prof_player: "Игрок",
    prof_sub_label: "Статус подписки",
    prof_sub_inactive: "Не активна",
    prof_sub_active: "Активна",
    prof_sub_need_key: "Требуется активация ключа",
    prof_hwid_label: "Привязанный HWID",
    prof_hwid_not_bound: "Не привязан",
    prof_hwid_detail: "Привязывается автоматически при входе в игру",
    prof_key_label: "Активация по ключу",
    prof_key_ph: "Введите ключ (LUNAVISUALKEY-....)",
    prof_key_btn: "Применить",
    prof_admin_gen_label: "⚡ Панель создания ключей (Администратор)",
    prof_admin_gen_btn: "+ Создать ключ",
    prof_dl_title: "Скачать LunaVisual Launcher",
    prof_dl_sub: "Полный комплект лаунчера (ZIP)",
    prof_btn_admin: "⚡ Админ-панель",
    prof_btn_reset_hwid: "⟳ Сбросить привязку HWID",
    prof_btn_logout: "Выйти из аккаунта",
    auth_err_invalid_login: "Неверный Email или пароль.",
    auth_err_fill_fields: "Заполните все поля для входа.",
    auth_err_banned: "⛔ Ваш аккаунт заблокирован администратором!",
    auth_success_login: "Успешный вход! Загрузка профиля...",
    auth_err_server: "Ошибка связи с сервером.",
    auth_err_pass_min: "Пароль должен быть минимум 6 символов.",
    auth_err_reg_fill: "Заполните все поля регистрации.",
    auth_err_nick_req: "Пожалуйста, введите ваш никнейм в Minecraft.",
    auth_err_email_invalid: "Введите корректный адрес электронной почты.",
    auth_err_pass_mismatch: "Введенные пароли не совпадают!",
    auth_success_reg: "Аккаунт успешно создан!",
    auth_err_key_required: "Введите лицензионный ключ.",
    auth_err_key_not_found: "Ключ не найден или введен неверно!",
    auth_err_key_used: "Этот ключ уже был активирован ранее!",
    auth_success_hwid_reset: "✓ Ключ сброса применен! HWID сброшен.",
    auth_success_key_sub: "✓ Подписка активирована: {sub}!",
    btn_signing_in: "Вход...",
    btn_registering: "Создание...",
    btn_verifying: "Проверка...",
    // Dropdown Plan Options (Key Generator)
    plan_opt_reset: "🔄 Сброс HWID (HWID Reset)",
    plan_opt_7d: "7 Дней (Розыгрыши)",
    plan_opt_30d: "30 Дней",
    plan_opt_90d: "90 Дней",
    plan_opt_lifetime: "Навсегда (Lifetime)",

    // Admin Panel
    admin_loading_title: "Проверка прав доступа...",
    admin_loading_desc: "Пожалуйста, подождите, проверяем статус учетной записи.",
    admin_denied_title: "Доступ ограничен",
    admin_denied_desc: "Эта панель предназначена исключительно для администраторов LunaVisual Visuals.<br>Войдите под учетной записью с правами администратора.",
    admin_denied_btn: "Вернуться в личный кабинет",
    admin_header_title: "⚡ Админ-панель LunaVisual",
    admin_back_btn: "← Вернуться в профиль",
    admin_stat_users: "Всего пользователей",
    admin_stat_subs: "Активных подписок",
    admin_stat_hwids: "Привязанных HWID",
    admin_stat_banned: "Заблокированных",
    admin_maint_title: "⚙️ Статус лаунчера",
    admin_maint_desc: "Управление режимом технического обслуживания лаунчера LunaVisual.",
    admin_maint_btn_on: "Включить техработы",
    admin_maint_btn_off: "Отключить техработы",
    admin_users_title: "👥 Управление пользователями",
    admin_users_search_ph: "Поиск по никнейму или email...",
    admin_refresh_btn: "Обновить",
    admin_col_user: "Пользователь",
    admin_col_sub: "Подписка",
    admin_col_hwid: "HWID",
    admin_col_role: "Роль",
    admin_col_status: "Статус",
    admin_col_actions: "Действия",
    admin_loading_users: "Загрузка списка пользователей...",
    admin_users_not_found: "Пользователи не найдены",
    admin_owner_badge: "★ Владелец",
    admin_master_lock: "🔒 Главный аккаунт",
    admin_sub_grant_btn: "+ Подписка",
    admin_sub_revoke_btn: "Отозвать",
    admin_hwid_reset_btn: "Сброс HWID",
    admin_ban_btn: "Бан",
    admin_unban_btn: "Разбан",
    admin_make_admin_btn: "Сделать админом",
    admin_remove_admin_btn: "Снять админа",
    admin_status_active: "Активен",
    admin_status_banned: "Заблокирован",
    admin_grant_title: "💎 Выдача подписки",
    admin_grant_desc: "Выберите срок действия подписки для игрока",
    admin_grant_dur_label: "Срок подписки:",
    admin_grant_btn_cancel: "Отмена",
    admin_grant_btn_submit: "Выдать подписку",
    dur_7d: "7 Дней",
    dur_30d: "30 Дней (1 Месяц)",
    dur_90d: "90 Дней (3 Месяца)",
    dur_180d: "180 Дней (6 Месяцев)",
    dur_90d: "90 Дней",
    dur_lifetime: "Навсегда (Lifetime)",
    admin_confirm_cancel: "Отмена",
    admin_confirm_ok: "Подтвердить",
    admin_toast_close: "Понятно",
    admin_footer_copy: "© 2026 LunaVisual. Панель управления администратора.",

    // Confirmation Modals & Toasts
    confirm_revoke_title: "Отозвать подписку",
    confirm_revoke_msg: "Вы уверены, что хотите отозвать подписку у игрока {nick}?",
    toast_revoke_success: "Подписка отозвана у {nick}.",
    confirm_reset_hwid_title: "Сброс HWID",
    confirm_reset_hwid_msg: "Сбросить привязанный компьютер у игрока {nick}? Новый ПК привяжется автоматически при следующем входе.",
    toast_reset_hwid_success: "HWID игрока {nick} успешно сброшен.",
    confirm_ban_title: "Блокировка пользователя",
    confirm_unban_title: "Разблокировка пользователя",
    confirm_ban_msg: "Вы действительно хотите заблокировать игрока {nick}?",
    confirm_unban_msg: "Вы действительно хотите разблокировать игрока {nick}?",
    toast_ban_success: "Игрок {nick} заблокирован.",
    toast_unban_success: "Игрок {nick} разблокирован.",
    confirm_make_admin_title: "Назначить администратором",
    confirm_remove_admin_title: "Снять права администратора",
    confirm_make_admin_msg: "Изменить роль игрока {nick} на Администратор?",
    confirm_remove_admin_msg: "Изменить роль игрока {nick} на Пользователь?",
    toast_make_admin_success: "Игрок {nick} назначен администратором!",
    toast_remove_admin_success: "С игрока {nick} сняты права администратора.",
    toast_protect_title: "Защита",
    toast_protect_revoke: "Действие запрещено! Нельзя отозвать подписку у Главного Администратора.",
    toast_protect_ban: "Действие запрещено! Нельзя заблокировать Главного Администратора.",
    toast_protect_role: "Действие запрещено! Нельзя изменить роль Главного Администратора.",
    toast_success_title: "Успех",
    toast_error_title: "Ошибка",
    toast_load_error: "Ошибка загрузки",
    toast_grant_success: "Подписка успешно выдана: {sub}!",
    toast_maint_title: "Лаунчер",
    toast_maint_enabled: "Режим технических работ ВКЛЮЧЕН! Вход для обычных пользователей закрыт.",
    toast_maint_disabled: "Режим технических работ ВЫКЛЮЧЕН. Вход открыт для всех.",

    // Site Settings Page
    admin_settings_btn: "⚙️ Настройки сайта",
    settings_page_title: "Настройки сайта",
    settings_page_subtitle: "Управление названием, цветовой палитрой, ценами и описаниями тарифов проекта",
    settings_back_admin: "← Назад в админ-панель",
    settings_brand_title: "🏷️ Название и Главный экран",
    settings_brand_desc: "Отображение бренда в шапке, подвале и главном баннере главной страницы",
    settings_lbl_sitename: "Название проекта (Бренд)",
    settings_lbl_herotitle: "Главный заголовок Hero",
    settings_lbl_herodesc: "Описание на главном экране (Hero)",
    settings_theme_title: "🎨 Цветовая тема оформления",
    settings_theme_desc: "Выберите акцентную палитру — цвет применится ко всем страницам, кнопкам, свечению и элементам",
    settings_plans_title: "💎 Тарифные планы и Цены",
    settings_plans_desc: "Настройте стоимость и краткие описания карточек в блоке покупки на главной странице",
    settings_lbl_price: "Цена",
    settings_lbl_desc: "Описание тарифа",
    settings_btn_reset: "🔄 Восстановить стандартные",
    settings_btn_save: "💾 Сохранить и применить для всех страниц",
    settings_saved_title: "Настройки сохранены",
    settings_saved_msg: "Параметры сайта и цветовая тема успешно обновлены для всех страниц!"
  },
  en: {
    // Navigation
    nav_home: "Home",
    nav_features: "Features",
    nav_pricing: "Pricing",
    nav_comparison: "Comparison",
    nav_faq: "FAQ",
    nav_login: "Sign In",
    nav_profile: "Dashboard",
    nav_profile_long: "Dashboard",
    nav_buy: "Buy Now",
    nav_discord: "Discord",
    nav_to_home: "Home",
    nav_to_profile: "Profile",

    // Hero Section
    hero_title: "Next-Gen Visuals <span>LunaVisual</span>",
    hero_desc: "Elevate your gameplay with cutting-edge Chams shader effects, custom ViewModel, ESP highlighting, and an adaptive HUD. Built for Fabric Loader 1.21.11 with full GPU pipeline optimization.",
    hero_btn: "Get LunaVisual Now",
    stat_fabric: "Minecraft Fabric",
    stat_fps: "Stable FPS",
    stat_hwid: "Rock-solid Protection",

    // Features Section
    feat_tag: "Features",
    feat_title: "Why Choose <span>LunaVisual</span>",
    feat_subtitle: "We engineered a custom rendering pipeline that preserves high performance while taking your in-game visuals to the next level.",
    feat_1_title: "Shader Effects (Chams & ESP)",
    feat_1_desc: "Player and entity highlighting. Soft silhouette glow, custom gradients, and flexible entity rendering options.",
    feat_2_title: "ViewModel Customizer",
    feat_2_desc: "Fine-tune item position, scale, and rotation angles in real-time. Includes HoverGlow highlighting for effortless adjustments.",
    feat_3_title: "GPU Mojang Pipeline",
    feat_3_desc: "Full integration with the modern Mojang rendering engine (RenderPipeline, GpuTexture, CommandEncoder). Zero FPS drops during full-screen shader processing.",
    feat_4_title: "HWID Protection",
    feat_4_desc: "The LunaVisual authentication server verifies your unique hardware ID via API, preventing unauthorized access and build theft.",

    // Pricing Section
    price_tag: "Pricing",
    price_title: "Choose Your <span>Plan</span>",
    price_subtitle: "Get instant access to LunaVisual premium visuals immediately after payment. No manual checks required.",
    plan_reset_title: "HWID Reset",
    plan_reset_desc: "Unlink old PC to transfer license to a new device",
    plan_reset_f1: "Instant hardware unlinking",
    plan_reset_f2: "Transfer client to a new PC",
    plan_reset_f3: "Preserve remaining subscription time",
    plan_reset_f4: "Automated device switch",
    plan_7d_title: "7 Days",
    plan_7d_desc: "Full LunaVisual access for 7 days",
    plan_90d_title: "90 Days",
    plan_90d_desc: "Full LunaVisual access for 90 days",
    plan_30d_title: "30 Days",
    plan_30d_desc: "Full LunaVisual access for 30 days",
    plan_30d_f1: "Access to all visual features",
    plan_30d_f2: "Custom UI theme presets",
    plan_30d_f3: "Discord RPC integration",
    plan_30d_f4: "Free client updates",
    plan_1yr_title: "1 Year",
    plan_1yr_desc: "Best-value access to all visuals for 365 days",
    plan_1yr_f1: "Access to all visual features",
    plan_1yr_f2: "Custom UI theme presets",
    plan_1yr_f3: "Discord RPC integration",
    plan_1yr_f4: "Free client updates",
    plan_life_title: "Lifetime",
    plan_life_desc: "Lifetime access to all features and updates",
    plan_life_f1: "Access to all visual features",
    plan_life_f2: "Custom UI theme presets",
    plan_life_f3: "Discord RPC integration",
    plan_life_f4: "Lifetime client updates",
    featured_ribbon: "⭐ Most Popular",
    btn_buy: "Purchase",

    // Comparison & FAQ
    comp_tag: "Customization",
    comp_title: "Play <span>Your Way</span>",
    comp_subtitle: "Choose between vibrant HD client styling or dark vanilla Minecraft classic. The choice is always yours.",
    comp_hint: "◂ Drag slider to compare ▸",
    faq_tag: "FAQ",
    faq_title: "Frequently Asked <span>Questions</span>",
    faq_subtitle: "Have questions about installation or setup? Find popular answers below.",
    faq_q1: "How does automated HWID binding work?",
    faq_a1: "Upon registration, you provide your in-game nickname. When you launch the game with LunaVisual mod installed, the client collects your PC hardware ID (HWID) and binds it to your profile. You can reset your HWID binding at any time in your dashboard on the website.",
    faq_q2: "What are the system requirements?",
    faq_a2: "Because our renderer is built on Mojang's native GPU API (using Yarn shader pipeline), LunaVisual does not strain the CPU and runs smoothly on any graphics card supporting OpenGL 3.2+ (virtually any GPU released in the last 12 years).",
    faq_q3: "Is LunaVisual compatible with other mods?",
    faq_a3: "Yes, LunaVisual runs flawlessly on Fabric Loader 1.21.11 alongside Sodium, Iris Shaders, Lithium, and other popular performance mods.",

    // Footer
    footer_home: "Home",
    footer_features: "Features",
    footer_pricing: "Pricing",
    footer_profile: "Dashboard",
    footer_discord: "Discord Community",
    footer_terms: "Terms of Service",
    footer_privacy: "Privacy Policy",
    footer_support_title: "Technical Support Service:",
    footer_copy: "© 2026 LunaVisual. All rights reserved. Minecraft is a trademark of Mojang Synergies AB. This website is not affiliated with Mojang.",

    // Checkout Modal
    checkout_kicker: "ORDER CHECKOUT",
    checkout_title: "Purchase Plan",
    checkout_subtitle: "Instant automated delivery right after payment",
    checkout_plan_label: "Selected Plan",
    checkout_nick_label: "In-game Nickname (Minecraft)",
    checkout_email_label: "Email for license key & receipt",
    checkout_methods_note: "💳 Available Payment Methods:",
    method_cards: "Credit/Debit Cards",
    checkout_submit: "Proceed to Payment",

    // Profile & Auth
    prof_back: "← Return to Home",
    prof_tag: "LunaVisual Account",
    prof_auth_title: "Authentication <span>LunaVisual</span>",
    prof_auth_subtitle: "Sign in to your dashboard to manage subscriptions and keys",
    prof_tab_login: "Sign In",
    prof_tab_register: "Register",
    prof_login_email_lbl: "Email",
    prof_login_pass_lbl: "Password",
    prof_forgot_pass: "Forgot password?",
    prof_btn_login: "Sign In to Account",
    prof_reg_nick_lbl: "In-game Nickname (Minecraft)",
    prof_reg_nick_ph: "e.g. SadeWow",
    prof_reg_email_lbl: "Email",
    prof_reg_pass_lbl: "Password (min 6 characters)",
    prof_btn_register: "Create Account",
    prof_player: "Player",
    prof_sub_label: "Subscription Status",
    prof_sub_inactive: "Inactive",
    prof_sub_active: "Active",
    prof_sub_need_key: "License key activation required",
    prof_hwid_label: "Bound HWID",
    prof_hwid_not_bound: "Not bound",
    prof_hwid_detail: "Binds automatically upon launching the game",
    prof_key_label: "Key Activation",
    prof_key_ph: "Enter key (LUNAVISUALKEY-....)",
    prof_key_btn: "Redeem",
    prof_admin_gen_label: "⚡ Key Creation Panel (Admin)",
    prof_admin_gen_btn: "+ Create Key",
    prof_dl_title: "Download LunaVisual Launcher",
    prof_dl_sub: "Full launcher bundle (ZIP)",
    prof_btn_admin: "⚡ Admin Panel",
    prof_btn_reset_hwid: "⟳ Reset HWID Binding",
    prof_btn_logout: "Log Out",
    auth_err_invalid_login: "Invalid email or password.",
    auth_err_fill_fields: "Please fill in all fields.",
    auth_err_banned: "⛔ Your account has been suspended by an administrator.",
    auth_success_login: "Signed in successfully! Loading profile...",
    auth_err_server: "Server connection error. Please try again.",
    auth_err_pass_min: "Password must be at least 6 characters long.",
    auth_err_reg_fill: "Please fill in all registration fields.",
    auth_err_nick_req: "Please enter your Minecraft in-game nickname.",
    auth_err_email_invalid: "Please enter a valid email address.",
    auth_err_pass_mismatch: "Passwords do not match!",
    auth_success_reg: "Account created successfully!",
    auth_err_key_required: "Please enter a license key.",
    auth_err_key_not_found: "Key not found or entered incorrectly!",
    auth_err_key_used: "This key has already been redeemed!",
    auth_success_hwid_reset: "✓ Reset key applied! HWID has been reset.",
    auth_success_key_sub: "✓ Subscription activated: {sub}!",
    btn_signing_in: "Signing in...",
    btn_registering: "Creating...",
    btn_verifying: "Verifying...",
    prof_modal_title: "Confirm Action",
    prof_modal_msg: "Are you sure you want to reset your HWID binding?",
    prof_modal_cancel: "Cancel",
    prof_modal_ok: "Yes, Reset",

    // Dropdown Plan Options (Key Generator)
    plan_opt_reset: "🔄 HWID Reset",
    plan_opt_7d: "7 Days (Giveaways)",
    plan_opt_30d: "30 Days",
    plan_opt_90d: "90 Days",
    plan_opt_lifetime: "Lifetime",

    // Admin Panel
    admin_loading_title: "Checking permissions...",
    admin_loading_desc: "Please wait, verifying account status.",
    admin_denied_title: "Access Denied",
    admin_denied_desc: "This panel is strictly intended for LunaVisual Visuals administrators.<br>Please log in with an administrator account.",
    admin_denied_btn: "Return to Dashboard",
    admin_header_title: "⚡ LunaVisual Admin Panel",
    admin_back_btn: "← Return to Profile",
    admin_stat_users: "Total Users",
    admin_stat_subs: "Active Subscriptions",
    admin_stat_hwids: "Bound HWIDs",
    admin_stat_banned: "Banned Users",
    admin_maint_title: "⚙️ Launcher Status",
    admin_maint_desc: "Manage maintenance mode for the LunaVisual launcher.",
    admin_maint_btn_on: "Enable Maintenance",
    admin_maint_btn_off: "Disable Maintenance",
    admin_users_title: "👥 User Management",
    admin_users_search_ph: "Search by nickname or email...",
    admin_refresh_btn: "Refresh",
    admin_col_user: "User",
    admin_col_sub: "Subscription",
    admin_col_hwid: "HWID",
    admin_col_role: "Role",
    admin_col_status: "Status",
    admin_col_actions: "Actions",
    admin_loading_users: "Loading users list...",
    admin_users_not_found: "No users found",
    admin_owner_badge: "★ Owner",
    admin_master_lock: "🔒 Master Account",
    admin_sub_grant_btn: "+ Subscription",
    admin_sub_revoke_btn: "Revoke",
    admin_hwid_reset_btn: "Reset HWID",
    admin_ban_btn: "Ban",
    admin_unban_btn: "Unban",
    admin_make_admin_btn: "Make Admin",
    admin_remove_admin_btn: "Remove Admin",
    admin_status_active: "Active",
    admin_status_banned: "Banned",
    admin_grant_title: "💎 Grant Subscription",
    admin_grant_desc: "Select subscription duration for player",
    admin_grant_dur_label: "Subscription Duration:",
    admin_grant_btn_cancel: "Cancel",
    admin_grant_btn_submit: "Grant Subscription",
    dur_7d: "7 Days",
    dur_30d: "30 Days (1 Month)",
    dur_90d: "90 Days (3 Months)",
    dur_180d: "180 Days (6 Months)",
    dur_90d: "90 Days",
    dur_lifetime: "Lifetime",
    admin_confirm_cancel: "Cancel",
    admin_confirm_ok: "Confirm",
    admin_toast_close: "Got it",
    admin_footer_copy: "© 2026 LunaVisual. Administrator control panel.",

    // Confirmation Modals & Toasts
    confirm_revoke_title: "Revoke Subscription",
    confirm_revoke_msg: "Are you sure you want to revoke the subscription from player {nick}?",
    toast_revoke_success: "Subscription revoked from {nick}.",
    confirm_reset_hwid_title: "Reset HWID",
    confirm_reset_hwid_msg: "Reset bound hardware for player {nick}? New PC will bind automatically upon next launch.",
    toast_reset_hwid_success: "HWID for player {nick} successfully reset.",
    confirm_ban_title: "Ban User",
    confirm_unban_title: "Unban User",
    confirm_ban_msg: "Are you sure you want to ban player {nick}?",
    confirm_unban_msg: "Are you sure you want to unban player {nick}?",
    toast_ban_success: "Player {nick} has been banned.",
    toast_unban_success: "Player {nick} has been unbanned.",
    confirm_make_admin_title: "Grant Admin Role",
    confirm_remove_admin_title: "Revoke Admin Role",
    confirm_make_admin_msg: "Change player {nick}'s role to Administrator?",
    confirm_remove_admin_msg: "Change player {nick}'s role to User?",
    toast_make_admin_success: "Player {nick} granted Administrator privileges!",
    toast_remove_admin_success: "Administrator privileges removed from {nick}.",
    toast_protect_title: "Protection",
    toast_protect_revoke: "Action forbidden! Cannot revoke subscription from Master Admin.",
    toast_protect_ban: "Action forbidden! Cannot ban Master Admin.",
    toast_protect_role: "Action forbidden! Cannot modify Master Admin role.",
    toast_success_title: "Success",
    toast_error_title: "Error",
    toast_load_error: "Loading error",
    toast_grant_success: "Subscription successfully granted: {sub}!",
    toast_maint_title: "Launcher",
    toast_maint_enabled: "Maintenance mode ENABLED! User access is closed.",
    toast_maint_disabled: "Maintenance mode DISABLED. User access is open.",

    // Site Settings Page
    admin_settings_btn: "⚙️ Site Settings",
    settings_page_title: "Site Settings",
    settings_page_subtitle: "Manage brand name, color palette, pricing, and plan descriptions",
    settings_back_admin: "← Back to Admin Panel",
    settings_brand_title: "🏷️ Brand & Hero Section",
    settings_brand_desc: "Configure project name and header content for the main page",
    settings_lbl_sitename: "Project Name (Brand)",
    settings_lbl_herotitle: "Hero Main Title",
    settings_lbl_herodesc: "Hero Subtitle Description",
    settings_theme_title: "🎨 Site Color Theme",
    settings_theme_desc: "Select an accent color palette — applied globally across all pages, glows, and elements",
    settings_plans_title: "💎 Plans & Pricing",
    settings_plans_desc: "Configure plan costs and feature highlights on the store page",
    settings_lbl_price: "Price",
    settings_lbl_desc: "Plan Description",
    settings_btn_reset: "🔄 Reset Defaults",
    settings_btn_save: "💾 Save & Apply Globally",
    settings_saved_title: "Settings Saved",
  }
};

let currentLang = localStorage.getItem('lunavisual_lang') || 'ru';

function setLanguage(lang) {
  if (!TRANSLATIONS[lang]) lang = 'ru';
  currentLang = lang;
  localStorage.setItem('lunavisual_lang', lang);
  document.documentElement.lang = lang;

  const dict = TRANSLATIONS[lang];
  const brandName = (currentSiteConfig && currentSiteConfig.siteName) ? currentSiteConfig.siteName : 'LunaVisual';

  // 1. Update all [data-i18n] text / html elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key] !== undefined) {
      let val = dict[key];

      // Dynamic brand name replacement across all translated strings
      if (brandName) {
        val = val.replace(/\bLunaVisual\b/g, brandName).replace(/\bLUNAVISUAL\b/g, brandName.toUpperCase());
      }

      // Respect custom heroTitle / heroDesc if saved in settings (only when Russian is active and custom title exists)
      if (lang === 'ru') {
        if (key === 'hero_title' && currentSiteConfig && currentSiteConfig.heroTitle && currentSiteConfig.heroTitle !== DEFAULT_SITE_CONFIG.heroTitle) {
          val = currentSiteConfig.heroTitle;
        }
        if (key === 'hero_desc' && currentSiteConfig && currentSiteConfig.heroDesc && currentSiteConfig.heroDesc !== DEFAULT_SITE_CONFIG.heroDesc) {
          val = currentSiteConfig.heroDesc;
        }
      }

      if (val.includes('<span') || val.includes('<br') || val.includes('©') || val.includes('⚡') || val.includes('⟳') || val.includes('💎') || val.includes('⚙️') || val.includes('👥')) {
        el.innerHTML = val;
      } else {
        el.textContent = val;
      }
    }
  });

  // 2. Update all [data-i18n-placeholder] input placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (dict[key] !== undefined) {
      let val = dict[key];
      if (brandName) {
        val = val.replace(/\bLunaVisual\b/g, brandName).replace(/\bLUNAVISUAL\b/g, brandName.toUpperCase());
      }
      el.setAttribute('placeholder', val);
    }
  });

  // 3. Switch [data-lang-view] blocks (e.g. on terms.html)
  document.querySelectorAll('[data-lang-view]').forEach(el => {
    if (el.getAttribute('data-lang-view') === lang) {
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  });

  // 4. Update active state on language switcher buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    if (btn.getAttribute('data-lang') === lang) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // 5. Notify listeners (e.g. dynamic tables in admin.html)
  window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
}

// Global helper for scripts to fetch translation strings
window.getLangString = function(key) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS['ru'];
  let val = dict[key] !== undefined ? dict[key] : key;
  const brandName = (currentSiteConfig && currentSiteConfig.siteName) ? currentSiteConfig.siteName : 'LunaVisual';
  if (typeof val === 'string' && brandName) {
    val = val.replace(/\bLunaVisual\b/g, brandName).replace(/\bLUNAVISUAL\b/g, brandName.toUpperCase());
  }
  return val;
};
window.TRANSLATIONS = TRANSLATIONS;
window.setLanguage = setLanguage;
window.currentLang = currentLang;

// Attach click listeners to language switcher buttons
function initLanguageSwitcher() {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const selectedLang = btn.getAttribute('data-lang');
      if (selectedLang) {
        setLanguage(selectedLang);
      }
    });
  });

  // Apply saved language on load
  setLanguage(currentLang);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLanguageSwitcher);
} else {
  initLanguageSwitcher();
}

/* ==========================================================================
   Content Protection: Anti-Copy, Anti-Image Download & Context Menu
   ========================================================================== */
(function initContentProtection() {
  // Prevent context menu (right click) except inside input/textarea
  document.addEventListener('contextmenu', (e) => {
    const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
    if (!isInput) {
      e.preventDefault();
      return false;
    }
  });

  // Prevent copying text outside inputs
  document.addEventListener('copy', (e) => {
    const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
    if (!isInput) {
      e.preventDefault();
      return false;
    }
  });

  // Prevent cutting text outside inputs
  document.addEventListener('cut', (e) => {
    const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
    if (!isInput) {
      e.preventDefault();
      return false;
    }
  });

  // Prevent image dragging and drag-saving
  document.addEventListener('dragstart', (e) => {
    if (e.target && (e.target.nodeName === 'IMG' || e.target.nodeName === 'A' || e.target.nodeName === 'CANVAS')) {
      e.preventDefault();
      return false;
    }
  });

  // Prevent keyboard shortcuts for copying and saving (Ctrl+S, Ctrl+U, Ctrl+C outside inputs)
  document.addEventListener('keydown', (e) => {
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

    // Disable Ctrl+S (Save), Ctrl+U (View Source)
    if (isCtrlOrCmd && (key === 's' || key === 'u')) {
      e.preventDefault();
      return false;
    }

    // Disable Ctrl+C / Ctrl+X outside inputs
    if (isCtrlOrCmd && (key === 'c' || key === 'x') && !isInput) {
      e.preventDefault();
      return false;
    }
  });

  // Set draggable="false" on all current and dynamically added images
  function protectImages() {
    document.querySelectorAll('img').forEach(img => {
      img.setAttribute('draggable', 'false');
      img.setAttribute('oncontextmenu', 'return false;');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', protectImages);
  } else {
    protectImages();
  }
})();

/* ==========================================================================
   Global Site Configuration & Dynamic Theme Engine
   ========================================================================== */
function applyThemePreset(themeId) {
  const t = THEME_PRESETS[themeId] || THEME_PRESETS['purple'];
  const root = document.documentElement;
  Object.keys(t).forEach(k => {
    if (k.startsWith('--')) {
      root.style.setProperty(k, t[k]);
    }
  });

  // Update ambient glow elements
  const g1 = document.querySelector('.ambient-glow-1');
  if (g1) g1.style.background = `radial-gradient(ellipse at center, ${t['--theme-glow-1']} 0%, ${t['--p-electric']} 35%, transparent 70%)`;
  const g2 = document.querySelector('.ambient-glow-2');
  if (g2) g2.style.background = `radial-gradient(circle, ${t['--theme-glow-2']} 0%, ${t['--p-deep']} 40%, transparent 70%)`;
}

function applySiteConfig(config) {
  if (!config) return;
  currentSiteConfig = Object.assign({}, DEFAULT_SITE_CONFIG, config);

  // 1. Apply Theme
  if (config.theme) {
    applyThemePreset(config.theme);
  }

  // 2. Refresh all translations & DOM with the new brand name and hero text
  if (typeof setLanguage === 'function') {
    setLanguage(currentLang);
  }

  // 3. Brand Name in header/footer/logo
  if (config.siteName) {
    const brand = config.siteName;
    document.querySelectorAll('.logo span, #headerBrandName, .footer-brand, .footer-logo').forEach(el => {
      if (el.classList.contains('footer-brand') || el.classList.contains('footer-logo')) {
        el.innerHTML = `<img class="logo-img" src="lunavisual-logo.png" alt="Logo" style="width:28px;height:28px;"> ${brand} VISUALS`;
      } else {
        el.textContent = brand;
      }
    });
  }

  // 4. Plans Prices & Descriptions
  if (config.plans) {
    Object.keys(config.plans).forEach(key => {
      const plan = config.plans[key];
      if (plan.price) {
        document.querySelectorAll(`[data-plan-price="${key}"]`).forEach(el => {
          el.textContent = plan.price;
        });
      }
      if (plan.desc && currentLang === 'ru' && (!DEFAULT_SITE_CONFIG.plans[key] || plan.desc !== DEFAULT_SITE_CONFIG.plans[key].desc)) {
        document.querySelectorAll(`[data-plan-desc="${key}"]`).forEach(el => {
          el.textContent = plan.desc;
        });
      }
    });
  }

  window.dispatchEvent(new CustomEvent('siteConfigApplied', { detail: config }));
}

// Initial Configuration Auto-Loader — LunaVisual fixed defaults.
(function initSiteConfig() {
  try { localStorage.removeItem('lunavisual_site_config'); } catch(e) {}
  applySiteConfig(DEFAULT_SITE_CONFIG);
})();



window.THEME_PRESETS = THEME_PRESETS;
window.DEFAULT_SITE_CONFIG = DEFAULT_SITE_CONFIG;
window.applyThemePreset = applyThemePreset;
window.applySiteConfig = applySiteConfig;


