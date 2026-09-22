window.LUNAVISUAL_CONFIG = Object.freeze({
  supabaseUrl: 'https://pdibtleothnnmihhrbcr.supabase.co',
  supabasePublishableKey: 'sb_publishable_f74qPRFJj8MQHT1L1Z3GIw_ue3Jx3yK',
  siteUrl: 'https://lunavisual.ru',
  supportEmail: 'techbitsupport@gmail.com',
  telegramUrl: 'https://t.me/Luna_visual',
  discordUrl: 'https://discord.gg/7FhVmvPtME',
  funpayUrl: 'https://funpay.com/users/17507792/',
  creatorThresholds: Object.freeze({ youtube: 1000, tiktok: 2000, twitch: 500 })
});

// Production canonical domain: never keep visitors on plain HTTP.
(() => {
  const h = location.hostname;
  const local = h === 'localhost' || h === '127.0.0.1' || h === '';
  if (!local && location.protocol === 'http:') {
    location.replace(`https://${location.host}${location.pathname}${location.search}${location.hash}`);
  }
})();
