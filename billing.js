// Dopamodoro Mobile — Google Play Billing (HYBRID: Capacitor plugin + TWA DGA)
// ---------------------------------------------------------------------------
// The live Play app is the Capacitor native build (android/), where billing runs
// through cordova-plugin-purchase (window.CdvPurchase). The same src/ is also
// hosted on the web (harelos.github.io/dopamodoro-app) and can be wrapped as a
// TWA, where billing runs through the Digital Goods API instead. This file
// detects the environment at runtime and uses whichever backend exists:
//   1. window.CdvPurchase            → Capacitor/Cordova plugin  (the Play AAB)
//   2. window.getDigitalGoodsService → Digital Goods + PaymentRequest (TWA)
//   3. neither                       → dev stub (paywall renders, buy = notice)
// Prereqs either way: products created in Play Console with the IDs below, app
// installed from a Play track, license tester for test purchases.
//
// Loaded as a classic script AFTER app.js. Entitlement is cached in
// `dopamodoroState` and broadcast via `dopamodoro-pro-changed` for app.js.
// ---------------------------------------------------------------------------

(function () {
  'use strict';

  // ---- Offer, locked ----
  // Prices are the ones you set in Play Console; the Digital Goods API fetches
  // localized strings at runtime. These fallbacks show if fetch hasn't happened.
  const PRODUCTS = {
    yearly:   { id: 'dopamodoro_pro_yearly',   kind: 'sub',  price: '$59.99', per: '/year',  tag: '7-day free trial · save 50%' },
    monthly:  { id: 'dopamodoro_pro_monthly',  kind: 'sub',  price: '$9.99',  per: '/month', tag: '7-day free trial' },
    lifetime: { id: 'dopamodoro_pro_lifetime', kind: 'once', price: '$129',   per: ' once',  tag: 'Pay once, keep forever' }
  };
  const PRODUCT_LIST = [PRODUCTS.yearly, PRODUCTS.monthly, PRODUCTS.lifetime];

  // Free-tier limits other code can read via Billing.LIMITS.
  const LIMITS = { folders: 3, northStars: 1 };

  const BILLING_METHOD = 'https://play.google.com/billing';
  let dgs = null;            // DigitalGoodsService (Play Billing)
  let ready = false;
  let selectedKey = 'yearly';
  let _isPro = false;        // cached entitlement (app.js is a module — private scope)

  // ---------- storage (mirrors app.js STORAGE_KEY, independent + safe) ----------
  const KEY = 'dopamodoroState';
  const cap = (typeof window !== 'undefined' && window.Capacitor) ? window.Capacitor : null;
  const Prefs = cap?.Plugins?.Preferences || null;
  async function readStore() {
    try {
      if (Prefs) { const { value } = await Prefs.get({ key: KEY }); return value ? JSON.parse(value) : {}; }
      const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : {};
    } catch { return {}; }
  }
  async function writePremium(isPro) {
    _isPro = !!isPro;
    // Persist directly (app.js is a module — its `state` isn't in our scope).
    try {
      const s = await readStore(); s.isPremium = _isPro;
      if (Prefs) await Prefs.set({ key: KEY, value: JSON.stringify(s) });
      else localStorage.setItem(KEY, JSON.stringify(s));
    } catch {}
    updateProUI(_isPro);
    if (_isPro) closePaywall();   // purchase landed via async handlers — dismiss the sheet
    // app.js listens for this to sync its in-memory state + re-render live.
    document.dispatchEvent(new CustomEvent('dopamodoro-pro-changed', { detail: { isPro: _isPro } }));
  }

  function isProNow() { return _isPro; }

  function updateProUI(isPro) {
    const badge = document.getElementById('proBadge');
    if (badge) badge.classList.toggle('hidden', !isPro);
    const go = document.getElementById('goProBtn');
    if (go) go.classList.toggle('hidden', !!isPro);
  }

  // ---------- Play Billing init (hybrid: CdvPurchase → Digital Goods → stub) ----------
  let backend = 'none';      // 'cdv' | 'dga' | 'none'
  let store = null;          // CdvPurchase.store (cdv backend)

  async function init() {
    updateProUI(isProNow());
    if (window.CdvPurchase && window.CdvPurchase.store) { await initCdv(); return; }
    if (typeof window.getDigitalGoodsService === 'function') { await initDga(); return; }
    // Plain browser — paywall renders, buy shows the "installed app" notice.
  }

  // ===== Backend 1: cordova-plugin-purchase (the Capacitor Play AAB) =====
  async function initCdv() {
    const CdvPurchase = window.CdvPurchase;
    const { ProductType, Platform, LogLevel } = CdvPurchase;
    store = CdvPurchase.store;
    try {
      store.verbosity = LogLevel.WARNING;
      store.register(PRODUCT_LIST.map(p => ({
        id: p.id,
        type: p.kind === 'sub' ? ProductType.PAID_SUBSCRIPTION : ProductType.NON_CONSUMABLE,
        platform: Platform.GOOGLE_PLAY
      })));
      store.when()
        .productUpdated(() => refreshPrices())
        .approved(t => t.verify())
        .verified(r => { r.finish(); recomputeEntitlement(); })   // finish() = acknowledge
        .receiptUpdated(() => recomputeEntitlement())
        .unverified(() => recomputeEntitlement());
      await store.initialize([Platform.GOOGLE_PLAY]);
      backend = 'cdv';
      ready = true;
      refreshPrices();
      recomputeEntitlement();
    } catch (e) { console.warn('[billing] CdvPurchase init failed', e); }
  }

  // ===== Backend 2: Digital Goods API (TWA wrap of the hosted web app) =====
  async function initDga() {
    try {
      dgs = await window.getDigitalGoodsService(BILLING_METHOD);
      if (!dgs) return;
      backend = 'dga';
      ready = true;
      await refreshPrices();
      await recomputeEntitlement();
    } catch (e) { console.warn('[billing] Digital Goods service unavailable', e); }
  }

  // Read what Play says the user owns, and flip entitlement.
  async function recomputeEntitlement() {
    if (!ready) return;
    if (backend === 'cdv') {
      const owned = PRODUCT_LIST.some(p => { try { return store.owned(p.id); } catch { return false; } });
      // Only downgrade when billing is live (never nuke entitlement from a dev stub).
      if (owned) writePremium(true); else writePremium(false);
      return;
    }
    if (backend === 'dga') {
      try {
        const purchases = await dgs.listPurchases();
        const ids = new Set(PRODUCT_LIST.map(p => p.id));
        const owned = (purchases || []).some(pu => ids.has(pu.itemId));
        // Acknowledge anything not yet acknowledged so Play doesn't auto-refund.
        for (const pu of (purchases || [])) {
          if (ids.has(pu.itemId) && pu.acknowledged !== true && typeof dgs.acknowledge === 'function') {
            try { await dgs.acknowledge(pu.purchaseToken, 'onetime'); } catch {}
          }
        }
        writePremium(owned);
      } catch (e) { console.warn('[billing] listPurchases failed', e); }
    }
  }

  function fmtMoney(micros, currency) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(micros / 1e6); }
    catch { return `${currency} ${(micros / 1e6).toFixed(2)}`; }
  }

  async function refreshPrices() {
    if (backend === 'cdv' && store) {
      const P = window.CdvPurchase.Platform.GOOGLE_PLAY;
      PRODUCT_LIST.forEach(p => {
        try {
          const prod = store.get(p.id, P);
          const offer = prod?.getOffer?.();
          const phase = offer?.pricingPhases?.slice(-1)[0];
          const price = phase?.price || prod?.pricing?.price;
          const micros = phase?.priceMicros ?? prod?.pricing?.priceMicros;
          const currency = phase?.currency || prod?.pricing?.currency;
          if (price) { p.price = price; p.per = ''; }
          if (micros) { p.micros = micros; p.currency = currency; }
        } catch {}
      });
    } else if (backend === 'dga' && dgs) {
      try {
        const details = await dgs.getDetails(PRODUCT_LIST.map(p => p.id));
        const byId = {}; (details || []).forEach(d => { byId[d.itemId] = d; });
        PRODUCT_LIST.forEach(p => {
          const amt = byId[p.id] && byId[p.id].price;   // { currency, value }
          if (amt && amt.value != null) {
            const cur = amt.currency === 'USD' ? '$' : (amt.currency + ' ');
            p.price = `${cur}${amt.value}`; p.per = '';
            p.micros = Math.round(parseFloat(amt.value) * 1e6); p.currency = amt.currency;
          }
        });
      } catch (e) { console.warn('[billing] getDetails failed', e); }
    }
    if (document.getElementById('pwSheet')) renderPlans();
  }

  // ---------- purchase / restore ----------
  async function buy(key) {
    const p = PRODUCTS[key]; if (!p) return;
    if (!ready) { toast('Purchases only work in the installed app from Google Play.'); return; }

    if (backend === 'cdv') {
      try {
        const P = window.CdvPurchase.Platform.GOOGLE_PLAY;
        let offer = store.get(p.id, P)?.getOffer?.();
        if (!offer) {
          // Product details may not have arrived yet (or just landed after a
          // Console change) — force a refresh once before giving up.
          toast('Loading plan…');
          try { await store.update(); } catch {}
          offer = store.get(p.id, P)?.getOffer?.();
        }
        if (!offer) {
          toast('This plan isn\'t available on your Play account yet — try again shortly.');
          console.warn('[billing] no offer for', p.id, '— product not returned by Play (check regional availability / track install)');
          return;
        }
        await store.order(offer);
        // entitlement flips via the verified/receiptUpdated handlers; close on success.
      } catch (e) {
        if (e && /cancel/i.test(e.message || '')) return;
        toast('Could not start checkout — try again.');
      }
      return;
    }

    if (backend === 'dga') {
      if (typeof window.PaymentRequest !== 'function') { toast('Purchases only work in the installed app from Google Play.'); return; }
      try {
        const request = new PaymentRequest(
          [{ supportedMethods: BILLING_METHOD, data: { sku: p.id } }],
          { total: { label: 'Dopamodoro Pro', amount: { currency: 'USD', value: '0' } } }
        );
        const response = await request.show();          // opens the Play purchase sheet
        const token = response.details && response.details.token;
        await response.complete('success');
        if (token) { try { if (dgs.acknowledge) await dgs.acknowledge(token, 'onetime'); } catch {} }
        writePremium(true);
        toast('Welcome to Pro');
        closePaywall();
      } catch (e) {
        if (e && (e.name === 'AbortError' || /cancel/i.test(e.message || ''))) return; // user dismissed
        console.warn('[billing] purchase failed', e);
        toast('Could not start checkout — try again.');
      }
    }
  }

  async function restore() {
    if (!ready) { toast('Open the installed app to restore.'); return; }
    toast('Restoring…');
    try {
      if (backend === 'cdv') await store.restorePurchases();
      await recomputeEntitlement();
      toast(isProNow() ? 'Pro restored ✓' : 'No purchases found');
    } catch { toast('Restore failed — try again.'); }
  }

  function toast(msg) {
    try { if (typeof showToast === 'function') { showToast(msg); return; } } catch {}
    const t = document.createElement('div');
    t.className = 'pw-toast'; t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, 1900);
  }

  // ---------- paywall UI ----------
  // Personalization pulled from the onboarding quiz (cached at boot).
  let quiz = {};              // { pattern, goal, ... }
  let offerDeadline = 0;      // shared countdown with the onboarding offer
  let pwCountdown = null;

  function pwHeadline() {
    const pain = {
      scroll:    'Stop losing your mornings to the scroll.',
      drift:     'Stop watching your focus fade mid-task.',
      choose:    'Stop burning energy deciding where to start.',
      interrupt: 'Stop letting one interruption eat the whole day.'
    }[quiz.pattern];
    return pain || 'Stop losing 2+ hours a day to distraction.';
  }
  function pwSubline() {
    const goal = {
      work:    'your work moving',
      study:   'your studying done in less time',
      project: 'real progress on your project every week',
      life:    'your days calm and in control'
    }[quiz.goal] || 'real progress every single day';
    return `Pro makes starting automatic and keeps ${goal} — even on your worst days.`;
  }

  // `trigger` is just for future analytics on which touchpoint converted.
  function openPaywall(trigger) {
    if (isProNow()) { toast('You\'re already Pro ✓'); return; }
    let ov = document.getElementById('pwOverlay');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'pwOverlay'; ov.className = 'pw-overlay';
      document.body.appendChild(ov);
      ov.addEventListener('click', e => { if (e.target === ov) closePaywall(); });
    }
    ov.dataset.trigger = trigger || 'manual';
    const holdLeft = offerDeadline - Date.now();
    ov.innerHTML = `
      <div class="pw-sheet" id="pwSheet">
        <button class="pw-close" id="pwClose" aria-label="Close">×</button>
        <div class="pw-head">
          <div class="pw-title">${pwHeadline()}</div>
          <div class="pw-sub">${pwSubline()}</div>
        </div>
        <ul class="pw-benefits">
          <li><b>One-tap start ritual</b> — the first step your brain says yes to</li>
          <li><b>AI Focus Coach</b> — weekly analysis of when &amp; where you focus best</li>
          <li><b>Vivid North Star</b> — your goal in all 5 senses when motivation dips</li>
          <li><b>Streak Freeze</b> — a bad day never becomes quitting</li>
          <li><b>Unlimited folders &amp; goals</b> — every project gets a home</li>
        </ul>
        ${holdLeft > 0 ? `<div class="pw-hold"><span class="pw-hold-dot"></span>Your intro price is held for <b id="pwCountdown">…</b></div>` : ''}
        <div class="pw-plans" id="pwPlans"></div>
        <button class="pw-cta" id="pwCta">Start my 7 free days</button>
        <div class="pw-fine" id="pwFine">No charge today. Google Play reminds you before the trial ends — cancel in 10 seconds, keep everything you wrote.</div>
        <button class="pw-restore" id="pwRestore">Restore purchases</button>
      </div>`;
    ov.classList.add('open');
    renderPlans();
    ov.querySelector('#pwClose').addEventListener('click', closePaywall);
    ov.querySelector('#pwRestore').addEventListener('click', restore);
    ov.querySelector('#pwCta').addEventListener('click', () => buy(selectedKey));
    if (holdLeft > 0) startPwCountdown();
  }
  function startPwCountdown() {
    if (pwCountdown) clearInterval(pwCountdown);
    const tick = () => {
      const left = Math.max(0, offerDeadline - Date.now());
      const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
      const e = document.getElementById('pwCountdown');
      if (e) e.textContent = `${m}:${String(s).padStart(2, '0')}`;
      if (left <= 0) { clearInterval(pwCountdown); pwCountdown = null; document.querySelector('.pw-hold')?.remove(); }
    };
    tick(); pwCountdown = setInterval(tick, 1000);
  }
  function closePaywall() {
    if (pwCountdown) { clearInterval(pwCountdown); pwCountdown = null; }
    document.getElementById('pwOverlay')?.classList.remove('open');
  }

  function renderPlans() {
    const wrap = document.getElementById('pwPlans'); if (!wrap) return;
    const order = ['yearly', 'monthly', 'lifetime'];
    const m = PRODUCTS.monthly, y = PRODUCTS.yearly;
    // Real anchor: 12 months at the monthly rate vs the yearly price (localized).
    let anchor = '', savePct = 50;
    if (m.micros && y.micros && m.currency === y.currency) {
      anchor = fmtMoney(m.micros * 12, m.currency);
      savePct = Math.max(0, Math.round((1 - y.micros / (m.micros * 12)) * 100));
    }
    wrap.innerHTML = order.map(k => {
      const p = PRODUCTS[k];
      const hero = k === 'yearly';
      const tag = hero
        ? `7-day free trial · ${anchor ? `<s>${anchor}</s> → ` : ''}save ${savePct}%`
        : k === 'monthly' ? '7-day free trial · cancel anytime'
        : 'Pay once, yours forever — never a renewal';
      return `<button class="pw-plan${selectedKey === k ? ' sel' : ''}${hero ? ' hero' : ''}" data-k="${k}">
        ${hero ? `<span class="pw-plan-flag">Best value · save ${savePct}%</span>` : ''}
        <span class="pw-plan-name">${k === 'lifetime' ? 'Lifetime' : k[0].toUpperCase() + k.slice(1)}</span>
        <span class="pw-plan-price">${p.price}<em>${p.per}</em></span>
        <span class="pw-plan-tag">${tag}</span>
      </button>`;
    }).join('');
    wrap.querySelectorAll('.pw-plan').forEach(b => b.addEventListener('click', () => {
      selectedKey = b.dataset.k; renderPlans(); syncCta();
    }));
    syncCta();
  }
  function syncCta() {
    const cta = document.getElementById('pwCta');
    const fine = document.getElementById('pwFine');
    if (!cta) return;
    if (selectedKey === 'lifetime') {
      cta.textContent = 'Unlock Lifetime — pay once';
      if (fine) fine.textContent = 'One payment, every Pro feature forever. No subscription, no renewals.';
    } else {
      cta.textContent = 'Start my 7 free days';
      if (fine) fine.textContent = 'No charge today. Google Play reminds you before the trial ends — cancel in 10 seconds, keep everything you wrote.';
    }
  }

  // ---------- styles (self-contained) ----------
  const css = `
  .pw-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s;}
  .pw-overlay.open{opacity:1;pointer-events:auto;}
  .pw-sheet{width:100%;max-width:440px;max-height:92%;overflow-y:auto;background:#150B24;border-top:1px solid rgba(168,85,247,.3);border-radius:20px 20px 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom));position:relative;transform:translateY(14px);transition:transform .2s;font-family:'Nunito',sans-serif;color:#FAF6F0;}
  .pw-overlay.open .pw-sheet{transform:translateY(0);}
  .pw-close{position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:transparent;color:#BBB0CE;font-size:18px;cursor:pointer;}
  .pw-title{font-size:20px;font-weight:800;}
  .pw-sub{font-size:12.5px;color:#BBB0CE;line-height:1.5;margin-top:4px;max-width:36ch;}
  .pw-benefits{list-style:none;margin:14px 0;padding:0;display:flex;flex-direction:column;gap:8px;}
  .pw-benefits li{position:relative;padding-left:24px;font-size:13px;color:#FAF6F0;line-height:1.4;}
  .pw-benefits li::before{content:'';position:absolute;left:2px;top:5px;width:12px;height:7px;border-left:2px solid #22C55E;border-bottom:2px solid #22C55E;transform:rotate(-45deg);}
  .pw-plans{display:flex;flex-direction:column;gap:8px;margin-bottom:14px;}
  .pw-plan{position:relative;display:flex;align-items:center;gap:8px;flex-wrap:wrap;text-align:left;width:100%;padding:12px 13px;border-radius:12px;border:1.5px solid rgba(255,255,255,.12);background:#1B1535;color:#FAF6F0;cursor:pointer;font-family:inherit;}
  .pw-plan.sel{border-color:#A855F7;background:linear-gradient(135deg,rgba(139,92,246,.18),rgba(236,72,153,.10));box-shadow:0 0 0 1px rgba(168,85,247,.35);}
  .pw-plan.hero .pw-plan-flag{position:absolute;top:-9px;left:12px;font-size:8.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#fff;background:linear-gradient(135deg,#C2410C,#9A3412);padding:2px 8px;border-radius:999px;}
  .pw-plan-name{font-size:14px;font-weight:800;}
  .pw-plan-price{margin-left:auto;font-size:15px;font-weight:800;}
  .pw-plan-price em{font-style:normal;font-size:11px;color:#BBB0CE;font-weight:600;}
  .pw-plan-tag{flex-basis:100%;font-size:10.5px;color:#A597C9;}
  .pw-plan-tag s{color:#706089;}
  .pw-hold{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#FBBF24;background:rgba(245,158,11,.10);border:1px solid rgba(245,158,11,.35);border-radius:10px;padding:8px 12px;margin-bottom:12px;}
  .pw-hold b{font-variant-numeric:tabular-nums;}
  .pw-hold-dot{width:7px;height:7px;border-radius:50%;background:#F59E0B;flex-shrink:0;animation:pwPulse 1.2s ease-in-out infinite;}
  @keyframes pwPulse{50%{opacity:.35;}}
  .pw-plan.hero .pw-plan-tag{color:#F59E0B;}
  .pw-cta{width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,#C2410C,#9A3412);color:#fff;font-family:inherit;font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 4px 16px rgba(154,52,18,.4);}
  .pw-fine{font-size:10px;color:#706089;text-align:center;margin-top:9px;line-height:1.4;}
  .pw-restore{display:block;margin:8px auto 0;background:none;border:none;color:#BBB0CE;font-family:inherit;font-size:11.5px;font-weight:700;text-decoration:underline;cursor:pointer;}
  .go-pro-btn{border:1px solid rgba(245,158,11,.4);background:color-mix(in srgb,#F59E0B 14%,transparent);color:#F59E0B;font-family:inherit;font-weight:800;font-size:10.5px;padding:4px 10px;border-radius:999px;cursor:pointer;}
  .pw-toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,10px);z-index:500;background:#271F47;border:1px solid rgba(255,255,255,.15);color:#FAF6F0;font-size:12px;font-weight:700;padding:9px 15px;border-radius:999px;opacity:0;transition:all .25s;font-family:'Nunito',sans-serif;}
  .pw-toast.show{opacity:1;transform:translate(-50%,0);}
  `;
  function injectCss() { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }

  // ---------- boot ----------
  async function boot() {
    injectCss();
    // Seed the cached entitlement + quiz personalization from storage.
    try {
      const s = await readStore();
      _isPro = !!s.isPremium;
      quiz = s.onboardingQuiz || {};
      offerDeadline = s.onbOfferDeadline || 0;
    } catch {}
    updateProUI(_isPro);
    const go = document.getElementById('goProBtn');
    if (go) go.addEventListener('click', () => openPaywall('header'));
    init();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // ---------- public API (for funnel touchpoints + feature gates) ----------
  window.Billing = {
    LIMITS,
    isPro: isProNow,
    openPaywall,
    closePaywall,
    restore,
    // Live handoff from the onboarding quiz (storage writes are debounced, so
    // the first paywall open right after the quiz needs the data pushed in).
    personalize(d) { if (d?.quiz) quiz = d.quiz; if (d?.deadline) offerDeadline = d.deadline; },
    // Call before a Pro-only action; returns true if allowed, else opens paywall.
    requirePro(trigger) { if (isProNow()) return true; openPaywall(trigger); return false; }
  };
})();
