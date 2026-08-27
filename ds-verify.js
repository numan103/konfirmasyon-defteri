const https = require('https');
function fetchText(u, headers) {
  return new Promise((res, rej) => {
    https.get(u, { headers: headers || {} }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(d));
    }).on('error', rej);
  });
}
(async () => {
  const q = '?v=' + Date.now();
  const html = await fetchText('https://alfa-trader.com/' + q);
  const sw = await fetchText('https://alfa-trader.com/sw.js' + q);
  const botHome = await fetchText('https://alfa-trader.com/', { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' });
  const botAt = await fetchText('https://alfa-trader.com/?page=alfatrading', { 'User-Agent': 'TelegramBot (like TwitterBot)' });
  const marks = {
    APP_BUILD_b85: html.includes("APP_BUILD = 'b85'"),
    APP_BUILD_b86: html.includes("APP_BUILD = 'b86'"),
    APP_BUILD_b87: html.includes("APP_BUILD = 'b87'"),
    og_title_static: html.includes('Alfa Traders — Konfirmasyon Defteri'),
    og_not_old: html.includes("APP_BUILD = 'b87'"),
    og_image_static: html.includes('alfa-trader.com/og.png'),
    bot_og_title: botHome.includes('<title>Alfa Traders — Konfirmasyon Defteri</title>'),
    bot_og_page: botAt.includes('og:title" content="Alfa Traders — Alfa Trading"') && botAt.includes('og:description" content="Alfa Trading — analiz ve işlem paylaşım akışı'),
    bot_og_image: botAt.includes('https://alfa-trader.com/og.png'),
    bot_og_card: botAt.includes('summary_large_image'),
    beklenti_panel: html.includes('bd-pl-beklenti'),
    beklenti_body: html.includes('bd-pl-beklenti-body'),
    beklenti_after_mid: html.indexOf('bd-pl-beklenti') > html.indexOf('bd-pl-mid') && html.indexOf('bd-pl-beklenti') < html.indexOf('bd-pl-holdings-panel'),
    plans_at_bottom: html.indexOf('bd-pl-table-panel') < html.indexOf('bd-pl-plans'),
    no_note_div: !html.includes('id="bd-pl-note"'),
    price_optional_label: html.includes('opsiyonel'),
    price_hint: html.includes('sadece yatırdığın tutar'),
    pfPosCalc_fallback: html.includes('if (a === null || pos.type === \'custom\') { value = cost; }'),
    pfPosCalc_guard: html.includes('if (cur !== null && !(cur > 0)) cur = null;'),
    pfGoldGramFix_fn: html.includes('function pfGoldGramFix'),
    pfSummary_unpriced: html.includes('else { totalValue += c.cost; unpriced++; }'),
    pfPlanBeklenti_fn: html.includes('function pfPlanBeklenti'),
    pfHoldings_key: html.includes('groups[k].key = k'),
    life_panel: html.includes('id="bd-life-panel"'),
    life_body: html.includes('id="bd-life-body"'),
    life_css: html.includes('.bd-life-track'),
    life_key: html.includes("LIFE_KEY = 'alfa-karne-life-v1'"),
    life_i18n: html.includes("'pg.life.t'"),
    life_save_btn: html.includes('id="bd-life-save"'),
    life_after_daily: html.indexOf('id="bd-life-panel"') > html.indexOf('id="kr-ai-wrap"') && html.indexOf('id="bd-life-panel"') < html.indexOf('id="kr-hist"'),
    icon_pick: html.includes('BUTCE_ICONS'),
    icon_pick_css: html.includes('.bd-iconpick-btn'),
    clear_filter_btn: html.includes('bd-clear-cat'),
    coingecko_fallback: html.includes('api.coingecko.com'),
    earnings_per_pos: html.includes('bd-pl-hrow-earn'),
    earnings_summary: html.includes('bd-pl-hld-summary'),
    sw_v30: sw.includes('alfa-v30'),
    basvuru_admin_gate: html.includes("name === 'basvuru' && !amAllowed()"),
    basvuru_nav_hidden: html.includes('id="tab-ek"') && html.includes('page-ek'),
    alfa_portfoy_page: !html.includes('id="page-alfaportfoy"'),
    alfa_portfoy_tab: html.includes('data-bdt="alfaportfoy"'),
    alfa_portfoy_view: html.includes('id="bd-view-alfaportfoy"'),
    alfa_portfoy_render: html.includes('function renderAlfaPortfoy2'),
    alfa_portfoy_data_key: html.includes("AP2_KEY = 'alfa-fund-v1'"),
    alfa_portfoy_bind: html.includes('function bindAlfaPortfoy2'),
    alfa_portfoy_balance: html.includes('startBalance: 1000') || html.includes('startBalance'),
    alfa_portfoy_sell: html.includes('function ap2SellConfirm') && html.includes('ap2Data.sells.push'),
    alfa_portfoy_sellform: html.includes('id="ap2-sell-form"'),
    alfa_portfoy_sell_hist: html.includes('id="ap2-sell-hist"'),
    alfa_portfoy_cash_hero: html.includes('data-accent="pc"'),
    sw_b85: sw.includes("'b85'"),
    sw_b86: sw.includes("'b86'"),
    sw_b87: sw.includes("'b87'"),
    alfa_portfoy_render_fix: html.includes("if (bdTab === 'alfaportfoy') {") && html.includes('ap2IsMember'),
    alfa_portfoy_autoprice: html.includes('function ap2LoadPrices'),
    alfa_portfoy_share_card: html.includes('ap2-share-card'),
    alfa_portfoy_scroll_legend: html.includes('ap2-donut-legend::-webkit-scrollbar'),
    alfa_portfoy_modern_ui: html.includes('ap2-sum-sm') && html.includes('ap2-donut-panel') && html.includes('ap2-chart-panel'),
    alfa_portfoy_member_gate: html.includes('ap2-gate') && html.includes('AP2_MEMBER_KEY') && html.includes('CRYPTOAHMET'),
    alfa_portfoy_share_buttons: html.includes('ap2-share-copy') && html.includes('ap2-share-dl') && html.includes('ap2-share-native'),
    alfa_portfoy_share_download: html.includes('ap2ShareDownload') && html.includes('ap2ShareCopy'),
    alfa_portfoy_mobile_sticky_fix: html.includes('position: static !important'),
    alfa_portfoy_gate_content: html.includes('ap2-gate-content'),
    alfa_portfoy_gate_teaser: html.includes('ap2-gate-teaser') && (html.includes('ap2-gt-cards') || html.includes('ap2-gt-total')),
    alfa_portfoy_public_teaser: html.includes('ap2-public-teaser') && html.includes('ap2RenderPublicTeaser'),
    alfa_portfoy_share_chart: html.includes('Path2D') && html.includes('ap2-gt-chart'),
    sw_v30: sw.includes('alfa-v30'),
    alfa_portfoy_cloud_sync: html.includes('ap2SyncCloud') && html.includes('ap2FetchCloud'),
    alfa_portfoy_cloud_render: html.includes('ap2RenderTeaserTarget') && html.includes('ap2-sum-sm-lbl'),
    alfa_portfoy_monthly: html.includes('ap2RenderMonthly') && html.includes('ap2-monthly-body') && html.includes('ap2MonthKey'),
    alfa_portfoy_monthly_full: html.includes('ap2MonthRange') && html.includes('ap2-mn-grid') && html.includes('ap2-monthly-this'),
    alfa_portfoy_monthly_chart: html.includes('ap2-mn-chart') && html.includes('barRows'),
    alfa_portfoy_chart_range: html.includes('ap2-chart-range') && html.includes('ap2ChartRange') && html.includes('ap2ChartWindow'),
    alfa_portfoy_monthly_chrono: html.includes('function ap2MonthOpenOf') && html.includes('function ap2Timeline') && !html.includes("(histByMonth[mk] || []).sort(function(a, b) { return a - b; })"),
    alfa_portfoy_share_png_copy: html.includes('ap2ShareCanvas') && html.includes('ClipboardItem') && html.includes('ap2ShareCopyText'),
    alfa_portfoy_share_pie: html.includes('ap2-share-pie') && html.includes('ap2ShareMonthlyStrip'),
    alfa_portfoy_share_start: html.includes('shareStartTxt') && html.includes('Ba\\u015flang\\u0131\\u00e7'),
  };
  let ok = true;
  for (const [k, v] of Object.entries(marks)) {
    console.log((v ? 'OK   ' : 'MISS ') + k);
    if (!v) ok = false;
  }
  console.log(ok ? 'ALL LIVE OK' : 'MISSING MARKERS');
})().catch(e => { console.error('fetch error', e.message); process.exit(1); });
