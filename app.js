/* Dialysis Log v1 – a pure tracker. It records numbers the user enters and does arithmetic on them.
 * It never gives medical, diet or fluid advice and never judges a value. */
(function () {
  'use strict';
  var C = window.DIALYSIS_CONFIG || {};
  var KEY = 'dialysislog:v1';
  var TERMS_KEY = 'dialysislog:terms';
  var TERMS_VERSION = C.TERMS_VERSION || '2026-10-11';
  function termsRecord() { try { return JSON.parse(localStorage.getItem(TERMS_KEY)); } catch (e) { return null; } }
  function termsOk() { var r = termsRecord(); return !!(r && r.version === TERMS_VERSION && r.agreed === true); }
  var ML_PER_OZ = 29.5735;
  var S;

  /* ---------------- helpers ---------------- */
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return dayKey(Date.now()); }
  function parseDay(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtDay(k) { return parseDay(k).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); }
  function fmtTime(t) { return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function num(v) { if (v == null) return null; v = String(v).trim().replace(',', '.'); if (v === '') return null; var n = Number(v); return isFinite(n) ? n : NaN; }
  function round(n, d) { var f = Math.pow(10, d || 0); return Math.round(n * f) / f; }
  function fu() { return S.settings.fluidUnit; }
  function toUnit(ml) { return fu() === 'oz' ? round(ml / ML_PER_OZ, 1) : Math.round(ml); }
  function fromUnit(v) { return fu() === 'oz' ? v * ML_PER_OZ : v; }
  function fmtFluid(ml) { return toUnit(ml) + ' ' + (fu() === 'oz' ? 'oz' : 'mL'); }
  function cupLabel(c) { return toUnit(c.ml) + ' ' + (fu() === 'oz' ? 'oz' : 'mL'); }

  /* ---------------- state ---------------- */
  function defaults() {
    return { v: 1, fluids: [], sessions: [], labs: [], meds: [], settings: {
      setupDone: false, fluidUnit: 'oz', weightUnit: 'lb', ufUnit: 'L', limitMl: null, whose: '',
      cups: [{ id: 'c1', label: 'Small cup', ml: 4 * ML_PER_OZ }, { id: 'c2', label: 'Cup', ml: 8 * ML_PER_OZ }, { id: 'c3', label: 'Mug', ml: 12 * ML_PER_OZ }, { id: 'c4', label: 'Ice chips', ml: 2 * ML_PER_OZ }],
      textSize: 'large', dark: false, license: null, lastBackup: null, backupNagAt: null, deviceId: null, persisted: null, createdAt: Date.now() } };
  }
  function migrate(o) {
    var d = defaults();
    if (!o || typeof o !== 'object') return d;
    var s = { v: 1, fluids: Array.isArray(o.fluids) ? o.fluids : [], sessions: Array.isArray(o.sessions) ? o.sessions : [], labs: Array.isArray(o.labs) ? o.labs : [], meds: Array.isArray(o.meds) ? o.meds : [], settings: Object.assign({}, d.settings, o.settings || {}) };
    if (!Array.isArray(s.settings.cups)) s.settings.cups = d.settings.cups;
    s.fluids = s.fluids.filter(function (f) { return f && isFinite(f.ml) && f.ml > 0 && isFinite(f.t); });
    var L = s.settings.license;
    if (L && L.ok && (!L.source || (L.source === 'dev' && !C.DEV_MODE))) s.settings.license = null;
    return s;
  }
  function load() { try { S = migrate(JSON.parse(localStorage.getItem(KEY))); } catch (e) { S = defaults(); } }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save – phone storage may be full. Save a backup now.', 6000); }
    if (S.settings.persisted == null && navigator.storage && navigator.storage.persist) {
      S.settings.persisted = false;
      navigator.storage.persist().then(function (ok) { S.settings.persisted = !!ok; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }).catch(function () {});
    }
  }

  /* ---------------- calculations (pure arithmetic only) ---------------- */
  function dayTotalMl(k) { return S.fluids.reduce(function (a, f) { return a + (dayKey(f.t) === k ? f.ml : 0); }, 0); }
  function sessionsSorted() { return S.sessions.slice().sort(function (a, b) { return (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')) || b.createdAt - a.createdAt; }); }
  function lastSession() { return sessionsSorted()[0] || null; }
  function sessionEndTs(s) { var d = parseDay(s.date); if (s.time) { var p = s.time.split(':'); d.setHours(+p[0], +p[1]); } else d.setHours(23, 59, 59); return d.getTime(); }
  function sinceLastSessionMl() { var s = lastSession(); if (!s) return null; var t0 = sessionEndTs(s); return S.fluids.reduce(function (a, f) { return a + (f.t > t0 ? f.ml : 0); }, 0); }
  function weightChange(s) { return (s.preW != null && s.postW != null) ? round(s.postW - s.preW, 1) : null; }
  function gainSincePrev(s) {
    var list = sessionsSorted(), i = list.indexOf(s), prev = list[i + 1];
    if (!prev || prev.postW == null || s.preW == null || (prev.wUnit || 'lb') !== (s.wUnit || 'lb')) return null;
    return round(s.preW - prev.postW, 1);
  }
  window.DialysisCalc = { dayTotalMl: function (k) { return dayTotalMl(k); }, ML_PER_OZ: ML_PER_OZ };

  /* ---------------- license (Gumroad per-buyer keys, same approach as Rowbin) ---------------- */
  function isPro() { return !!(S.settings.license && S.settings.license.ok); }
  function maskKey(k) { k = String(k || ''); return k.length > 8 ? k.slice(0, 4) + '…' + k.slice(-4) : k; }
  function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function sha256Hex(str) {
    if (window.crypto && crypto.subtle && window.TextEncoder) return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, '0'); }).join(''); });
    return Promise.resolve('');
  }
  function deviceId() { if (!S.settings.deviceId) { S.settings.deviceId = uid() + uid(); save(); } return S.settings.deviceId; }
  function supportLine() { return C.SUPPORT_EMAIL ? ' Contact ' + C.SUPPORT_EMAIL + ' for help.' : ''; }
  function gumroadVerify(key, increment) {
    var body = new URLSearchParams();
    body.set('product_id', C.GUMROAD_PRODUCT_ID || ''); body.set('license_key', key); body.set('increment_uses_count', increment ? 'true' : 'false');
    var ctrl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    return fetch(C.LICENSE_VERIFY_URL || 'https://api.gumroad.com/v2/licenses/verify', { method: 'POST', body: body, signal: ctrl ? ctrl.signal : undefined, cache: 'no-store' })
      .then(function (r) { clearTimeout(to); return r.json().catch(function () { return { success: false, message: 'Unexpected reply (HTTP ' + r.status + ').' }; }).then(function (j) { j._http = r.status; return j; }); })
      .catch(function (e) { clearTimeout(to); return { _network: true, message: String(e && e.message || e) }; });
  }
  function judge(j) {
    if (!j || j._network) return { state: 'network', msg: 'Couldn’t reach Gumroad. Connect to the internet once to activate your key; after that Pro works offline.' };
    if (!j.success) {
      if (j._http >= 500) return { state: 'network', msg: 'Gumroad is having trouble right now. Please try again in a few minutes.' };
      var dis = /disabled|revoked/i.test(String(j.message || ''));
      return { state: dis ? 'revoked' : 'invalid', msg: (dis ? 'This license key has been disabled.' : 'That key wasn’t recognized. Check it against your Gumroad receipt.') + supportLine() };
    }
    var pu = j.purchase || {};
    if (pu.refunded) return { state: 'revoked', msg: 'This purchase was refunded, so the key no longer unlocks Pro.' + supportLine() };
    if (pu.chargebacked || (pu.disputed && !pu.dispute_won)) return { state: 'revoked', msg: 'This purchase was disputed or charged back, so the key no longer unlocks Pro.' + supportLine() };
    if (pu.subscription_ended_at || pu.subscription_cancelled_at || pu.subscription_failed_at) return { state: 'revoked', msg: 'This purchase is no longer active.' + supportLine() };
    if (C.GUMROAD_PRODUCT_ID && pu.product_id && pu.product_id !== C.GUMROAD_PRODUCT_ID) return { state: 'invalid', msg: 'That key belongs to a different product.' };
    return { state: 'valid', uses: typeof j.uses === 'number' ? j.uses : null, sale: pu.sale_id || pu.id || null };
  }
  function tryUnlock(code) {
    var key = String(code || '').trim(), n = normCode(key);
    if (n.length < 4) return Promise.resolve({ ok: false, msg: 'Please enter your license key.' });
    var devP = C.DEV_MODE ? sha256Hex('dialysis:' + n).then(function (h) { return (C.DEV_UNLOCK_CODE_SHA256 || []).indexOf(h) !== -1; }) : Promise.resolve(false);
    return devP.then(function (isDev) {
      if (isDev) { S.settings.license = { ok: true, key: key.toUpperCase(), at: Date.now(), source: 'dev', verifiedAt: Date.now() }; save(); return { ok: true, msg: 'Dev unlock (DEV_MODE is on).' }; }
      if (!C.GUMROAD_PRODUCT_ID) return { ok: false, msg: 'Pro purchases aren’t set up yet. Everything else is free – check back soon.' };
      if (navigator.onLine === false) return { ok: false, msg: 'You’re offline. Connect to the internet once to activate your key; after that Pro works offline.' };
      var cur = S.settings.license, same = cur && cur.ok && cur.source === 'gumroad' && normCode(cur.key) === n;
      return gumroadVerify(key, !same).then(function (j) {
        var r = judge(j);
        if (r.state !== 'valid') { if (r.state === 'revoked' && same) { S.settings.license = null; save(); } return { ok: false, msg: r.msg }; }
        var max = C.MAX_ACTIVATIONS || 0;
        if (!same && max && r.uses !== null && r.uses > max) return { ok: false, msg: 'This key has already been activated on ' + r.uses + ' devices (limit ' + max + '). If you got a new phone, ' + (C.SUPPORT_EMAIL ? 'email ' + C.SUPPORT_EMAIL + ' to reset it.' : 'contact the seller through your Gumroad receipt to reset it.') };
        S.settings.license = { ok: true, key: key.toUpperCase(), at: (same && cur.at) || Date.now(), source: 'gumroad', verifiedAt: Date.now(), uses: r.uses, sale: r.sale, device: deviceId() };
        save();
        return { ok: true, msg: same ? 'Key re-checked. Pro is active.' : 'Pro unlocked. Thank you!' };
      });
    });
  }
  function recheckLicense() {
    var L = S.settings.license, days = C.RECHECK_DAYS;
    if (!L || !L.ok || L.source !== 'gumroad' || !days || !C.GUMROAD_PRODUCT_ID || navigator.onLine === false) return Promise.resolve(null);
    if (L.verifiedAt && Date.now() - L.verifiedAt < days * 86400000) return Promise.resolve(null);
    return gumroadVerify(L.key, false).then(function (j) {
      var r = judge(j);
      if (r.state === 'valid') { L.verifiedAt = Date.now(); save(); }
      else if (r.state === 'revoked') { S.settings.license = { ok: false, key: L.key, revokedAt: Date.now(), reason: r.msg }; save(); render(); toast(r.msg, 6000); }
      return r.state;
    });
  }

  /* ---------------- UI primitives ---------------- */
  var toastTimer;
  function toast(msg, ms) { var t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('on'); }, ms || 2600); }
  function sheet(html) { $('#sheet-root').innerHTML = '<div class="sheet-bg" data-act="sheet-close"><div class="sheet" role="dialog" aria-modal="true">' + html + '</div></div>'; var f = $('.sheet input, .sheet button'); if (f) f.focus(); }
  function closeSheet() { $('#sheet-root').innerHTML = ''; }
  function confirmBox(q, yes, cb) { sheet('<h2 style="margin-top:0">' + esc(q) + '</h2><div class="grid2"><button class="btn alt" data-x="no">Cancel</button><button class="btn danger" data-x="yes">' + esc(yes || 'Delete') + '</button></div>'); confirmCb = cb; }
  var confirmCb = null;
  function applyLook() { var h = document.documentElement; h.classList.toggle('xl', S.settings.textSize === 'xl'); h.classList.toggle('dark', !!S.settings.dark); }
  var DISCLAIMER = '<div class="disclaimer" role="note"><b>Not medical advice.</b> This app only records the numbers you enter. It does not tell you how much to drink or whether a number is good or bad. Always follow your care team.</div>';
  function nav(active) {
    var tabs = [['#/', 'Today', '💧'], ['#/sessions', 'Sessions', '🩺'], ['#/trends', 'Trends', '📈'], ['#/more', 'More', '☰']];
    return '<nav class="tabs" aria-label="Main">' + tabs.map(function (t) { return '<a href="' + t[0] + '"' + (active === t[0] ? ' aria-current="page"' : '') + '><span class="ic" aria-hidden="true">' + t[2] + '</span>' + t[1] + '</a>'; }).join('') + '</nav>';
  }
  function numInput(id, label, val, hint) { return '<label class="field"><span>' + label + '</span><input type="text" inputmode="decimal" id="' + id + '" value="' + (val == null ? '' : esc(val)) + '" autocomplete="off"' + (hint ? ' placeholder="' + esc(hint) + '"' : '') + '></label>'; }

  /* ---------------- screens ---------------- */
  function vTerms() {
    var prev = termsRecord();
    return '<main id="main" class="terms-gate"><h1>' + (prev && prev.agreed ? 'Our terms have changed' : 'Before you start') + '</h1>' +
      '<p>Please read this once. It takes a minute.</p>' +
      '<div class="card" id="terms-summary"><ul class="tsum">' +
      '<li><b>Not medical advice.</b> Dialysis Log is not a medical device. It does not diagnose, treat or recommend anything. It only records the numbers you enter.</li>' +
      '<li><b>Follow your care team.</b> You are responsible for what you enter. Your care team’s advice always comes first.</li>' +
      '<li><b>Not for emergencies.</b> In an emergency, call your local emergency number (911 in the US).</li>' +
      '<li><b>Your data stays on this phone.</b> Nobody else can see it or recover it, so save backups.</li>' +
      '<li><b>Provided as is,</b> with no warranty. The maker is not liable for health outcomes, decisions or lost data, as far as the law allows.</li>' +
      '</ul><p class="tlinks"><a href="terms.html" id="terms-link">Read the full Terms of Use</a><a href="privacy.html" id="privacy-link">Read the Privacy page</a></p></div>' +
      '<label class="agree" for="agree-box"><input type="checkbox" id="agree-box"><span>I understand this is not medical advice and I agree to the Terms of Use.</span></label>' +
      '<button class="btn" data-act="agree" id="agree-btn" disabled aria-describedby="agree-hint">Continue</button>' +
      '<p class="small muted" id="agree-hint">Tick the box to continue. Terms version ' + esc(TERMS_VERSION) + '.</p></main>';
  }

  function vSetup() {
    var st = S.settings;
    return '<main id="main"><h1>Welcome to Dialysis Log</h1><p>Just one quick screen. You can change all of this later in More → Settings, and you can skip it.</p>' + DISCLAIMER +
      '<div class="card"><h3>Drinks in</h3><div class="seg" role="group" aria-label="Fluid unit"><button data-act="su-fu" data-v="oz" aria-pressed="' + (st.fluidUnit === 'oz') + '">ounces (oz)</button><button data-act="su-fu" data-v="ml" aria-pressed="' + (st.fluidUnit === 'ml') + '">mL</button></div>' +
      '<h3 style="margin-top:14px">Weight in</h3><div class="seg" role="group" aria-label="Weight unit"><button data-act="su-wu" data-v="lb" aria-pressed="' + (st.weightUnit === 'lb') + '">pounds (lb)</button><button data-act="su-wu" data-v="kg" aria-pressed="' + (st.weightUnit === 'kg') + '">kg</button></div>' +
      numInput('su-limit', 'Daily fluid limit from your care team (optional)', '', 'Leave empty if you don’t have one') +
      '<p class="small muted">The app never suggests a limit. It only uses the number you type.</p>' +
      '<label class="field"><span>Whose log is this? (optional)</span><input type="text" id="su-whose" maxlength="40" placeholder="e.g. Dad – if you track for someone else"></label></div>' +
      '<button class="btn" data-act="su-done">Start</button><p></p><button class="btn alt" data-act="su-skip">Skip for now</button></main>';
  }

  function vToday() {
    var st = S.settings, k = today(), tot = dayTotalMl(k), lim = st.limitMl, pro = isPro();
    var head;
    if (lim) {
      var left = lim - tot, pct = Math.min(100, tot / lim * 100);
      head = '<div class="card status" aria-live="polite"><div class="small"><b>Left today</b> (of the ' + fmtFluid(lim) + ' limit you entered)</div><div class="big-num" id="left-num">' + (left >= 0 ? fmtFluid(left) : '0 ' + (fu() === 'oz' ? 'oz' : 'mL')) + '</div>' +
        (left < 0 ? '<div><b>' + fmtFluid(-left) + ' past the limit you entered</b></div>' : '') +
        '<div class="bar' + (left < 0 ? ' over' : '') + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(pct) + '" aria-label="Share of your limit used"><i style="width:' + pct + '%"></i></div>' +
        '<div>Had today: <b id="today-total">' + fmtFluid(tot) + '</b></div></div>';
    } else {
      head = '<div class="card status" aria-live="polite"><div class="small"><b>Had today</b></div><div class="big-num" id="today-total">' + fmtFluid(tot) + '</div><div class="small"><a href="#/settings">Add your limit</a> to see what’s left.</div></div>';
    }
    var since = sinceLastSessionMl();
    var sinceHtml = since != null ? '<p class="small" id="since">Since your last session (' + esc(fmtDay(lastSession().date)) + '): <b>' + fmtFluid(since) + '</b></p>' : '';
    var cups = st.cups.map(function (c) { return '<button class="btn quick" data-act="add" data-id="' + esc(c.id) + '">+ ' + esc(cupLabel(c)) + '<small>' + esc(c.label) + '</small></button>'; }).join('');
    var entries = S.fluids.filter(function (f) { return dayKey(f.t) === k; }).sort(function (a, b) { return b.t - a.t; });
    var nag = '';
    var hasData = S.fluids.length + S.sessions.length > 0;
    if (hasData && (!st.lastBackup || Date.now() - st.lastBackup > 14 * 86400000) && (!st.backupNagAt || Date.now() - st.backupNagAt > 3 * 86400000))
      nag = '<div class="banner" id="backup-nag"><b>Don’t lose your log.</b> Your entries live only on this phone. Save a backup file now and then.<div class="row" style="margin-top:8px"><button class="btn sm" data-act="backup">Save backup</button><button class="btn sm alt" data-act="nag-later">Later</button></div></div>';
    return '<main id="main"><h1>Today' + (st.whose ? ' · ' + esc(st.whose) : '') + '</h1><p class="muted small">' + esc(fmtDay(k)) + '</p>' + nag + head + sinceHtml +
      '<h2>Add a drink</h2><div class="grid2" id="cups">' + cups + '<button class="btn quick alt" data-act="add-other">+ Other<small>type amount</small></button></div>' +
      '<p class="small"><a href="#/settings">Change drink buttons</a></p>' +
      '<h2>Today’s drinks</h2>' + (entries.length ? '<ul class="list" id="today-list">' + entries.map(entryLi).join('') + '</ul>' : '<p class="muted" id="today-list">Nothing logged yet today.</p>') +
      '<p><a class="btn alt" href="#/history">See past days</a></p>' + DISCLAIMER + '</main>' + nav('#/');
  }
  function entryLi(f) { return '<li><div class="grow"><b>' + fmtFluid(f.ml) + '</b> ' + esc(f.label || '') + '<div class="small muted">' + fmtTime(f.t) + '</div></div><button class="btn sm alt" data-act="edit-fluid" data-id="' + esc(f.id) + '" aria-label="Edit ' + fmtFluid(f.ml) + ' at ' + fmtTime(f.t) + '">Edit</button></li>'; }

  function vHistory() {
    var days = {};
    S.fluids.forEach(function (f) { var k = dayKey(f.t); days[k] = (days[k] || 0) + f.ml; });
    S.sessions.forEach(function (s) { if (!(s.date in days)) days[s.date] = days[s.date] || 0; });
    var keys = Object.keys(days).sort().reverse();
    return '<main id="main"><h1>Past days</h1><p class="small muted">Every day you’ve logged, kept forever (on this phone). Tap a day to see or change it.</p>' +
      '<button class="btn alt" data-act="pick-day">Open a different date</button>' +
      (keys.length ? '<ul class="list" id="days">' + keys.map(function (k) {
        var n = S.sessions.filter(function (s) { return s.date === k; }).length;
        return '<li><a class="grow" href="#/day/' + k + '" style="color:inherit;text-decoration:none"><b>' + esc(fmtDay(k)) + '</b><div class="small">Drinks: ' + fmtFluid(days[k]) + (S.settings.limitMl ? ' · limit you entered: ' + fmtFluid(S.settings.limitMl) : '') + (n ? ' · ' + n + ' session' + (n > 1 ? 's' : '') : '') + '</div></a><span aria-hidden="true">›</span></li>';
      }).join('') + '</ul>' : '<p class="muted">No history yet.</p>') + '</main>' + nav('#/');
  }
  function vDay(k) {
    var entries = S.fluids.filter(function (f) { return dayKey(f.t) === k; }).sort(function (a, b) { return a.t - b.t; });
    var ss = S.sessions.filter(function (s) { return s.date === k; });
    return '<main id="main"><p><a href="#/history">‹ Past days</a></p><h1>' + esc(fmtDay(k)) + '</h1>' +
      '<div class="card"><b>Drinks total: <span id="day-total">' + fmtFluid(dayTotalMl(k)) + '</span></b></div>' +
      (entries.length ? '<ul class="list">' + entries.map(entryLi).join('') + '</ul>' : '<p class="muted">No drinks logged this day.</p>') +
      '<button class="btn" data-act="add-past" data-day="' + k + '">+ Add a drink to this day</button>' +
      (ss.length ? '<h2>Sessions</h2><ul class="list">' + ss.map(sessionLi).join('') + '</ul>' : '') + '</main>' + nav('#/');
  }

  function sessionLi(s) {
    var wu = s.wUnit || S.settings.weightUnit, ch = weightChange(s), bits = [];
    if (s.preW != null) bits.push('Pre ' + s.preW + ' ' + wu);
    if (s.postW != null) bits.push('Post ' + s.postW + ' ' + wu);
    if (ch != null) bits.push('Change ' + (ch > 0 ? '+' : '') + ch + ' ' + wu);
    if (s.uf != null) bits.push('UF ' + s.uf + ' ' + (s.ufUnit || 'L'));
    if (s.preSys != null) bits.push('BP before ' + s.preSys + '/' + (s.preDia == null ? '–' : s.preDia));
    if (s.postSys != null) bits.push('BP after ' + s.postSys + '/' + (s.postDia == null ? '–' : s.postDia));
    return '<li><a class="grow" href="#/session/' + esc(s.id) + '" style="color:inherit;text-decoration:none"><b>' + esc(fmtDay(s.date)) + (s.time ? ' · ' + esc(s.time) : '') + '</b><div class="small">' + esc(bits.join(' · ') || 'No numbers yet – tap to add') + '</div>' + (s.notes ? '<div class="small muted">' + esc(s.notes.slice(0, 80)) + '</div>' : '') + '</a><span aria-hidden="true">›</span></li>';
  }
  function vSessions() {
    var list = sessionsSorted();
    return '<main id="main"><h1>Sessions</h1><a class="btn" href="#/session/new" id="new-session">+ Log a session</a>' +
      '<p class="small muted">Fill in what you have now (like your weight before) and add the rest later. Every field is optional.</p>' +
      (list.length ? '<ul class="list" id="session-list">' + list.map(sessionLi).join('') + '</ul>' : '<p class="muted">No sessions yet.</p>') + DISCLAIMER + '</main>' + nav('#/sessions');
  }
  function vSession(id) {
    var s = id === 'new' ? null : S.sessions.filter(function (x) { return x.id === id; })[0];
    if (id !== 'new' && !s) return '<main id="main"><p>Session not found.</p><a class="btn" href="#/sessions">Back</a></main>' + nav('#/sessions');
    var draft = id === 'new' && S.settings.draft ? S.settings.draft : null;
    var v = s || draft || { date: today(), time: '', wUnit: S.settings.weightUnit, ufUnit: S.settings.ufUnit };
    var wu = v.wUnit || S.settings.weightUnit, ufu = v.ufUnit || S.settings.ufUnit;
    var g = s ? gainSincePrev(s) : null, ch = s ? weightChange(s) : null;
    return '<main id="main"><p><a href="#/sessions">‹ Sessions</a></p><h1>' + (s ? 'Session' : 'Log a session') + '</h1>' +
      '<form id="sform" autocomplete="off"><div class="grid2"><label class="field"><span>Date</span><input type="date" id="s-date" value="' + esc(v.date) + '" required></label><label class="field"><span>Time (optional)</span><input type="time" id="s-time" value="' + esc(v.time || '') + '"></label></div>' +
      '<div class="card"><h3>Weight (' + esc(wu) + ')</h3><div class="grid2">' + numInput('s-preW', 'Before', v.preW) + numInput('s-postW', 'After', v.postW) + '</div>' +
      (ch != null ? '<p class="small">After minus before: <b>' + (ch > 0 ? '+' : '') + ch + ' ' + esc(wu) + '</b></p>' : '') +
      (g != null ? '<p class="small">Before weight minus last session’s after weight: <b>' + (g > 0 ? '+' : '') + g + ' ' + esc(wu) + '</b></p>' : '') + '</div>' +
      '<div class="card"><h3>Blood pressure</h3><div class="grid2">' + numInput('s-preSys', 'Before – top', v.preSys) + numInput('s-preDia', 'Before – bottom', v.preDia) + numInput('s-postSys', 'After – top', v.postSys) + numInput('s-postDia', 'After – bottom', v.postDia) + '</div></div>' +
      '<div class="card"><h3>Fluid removed (UF)</h3>' + numInput('s-uf', 'Amount removed', v.uf) +
      '<div class="seg" role="group" aria-label="UF unit">' + ['L', 'mL', 'kg', 'lb'].map(function (u) { return '<button type="button" data-act="uf-unit" data-v="' + u + '" aria-pressed="' + (ufu === u) + '">' + u + '</button>'; }).join('') + '</div></div>' +
      '<label class="field"><span>Notes</span><textarea id="s-notes" placeholder="How you felt, cramps, anything to tell your team">' + esc(v.notes || '') + '</textarea></label>' +
      '<input type="hidden" id="s-ufu" value="' + esc(ufu) + '"><input type="hidden" id="s-wu" value="' + esc(wu) + '">' +
      '<button class="btn" type="submit" id="s-save">Save session</button></form>' +
      (s ? '<p></p><button class="btn danger" data-act="del-session" data-id="' + esc(s.id) + '">Delete this session</button>' : '') + '<p class="small muted">Saved only on this phone.</p></main>' + nav('#/sessions');
  }
  function readSessionForm() {
    var f = { date: $('#s-date').value || today(), time: $('#s-time').value || '', wUnit: $('#s-wu').value, ufUnit: $('#s-ufu').value, notes: $('#s-notes').value.trim() }, bad = [];
    [['preW', 'Weight before'], ['postW', 'Weight after'], ['preSys', 'BP before top'], ['preDia', 'BP before bottom'], ['postSys', 'BP after top'], ['postDia', 'BP after bottom'], ['uf', 'UF']].forEach(function (p) {
      var n = num($('#s-' + p[0]).value); if (isNaN(n) || (n != null && n < 0)) bad.push(p[1]); f[p[0]] = (n == null || isNaN(n)) ? null : n;
    });
    return { f: f, bad: bad };
  }

  /* ---- trends (free: last 30 days; Pro: 90 days / all) ---- */
  function lineChart(title, series, unit) {
    // series: [{name, pts:[{x:dayKey,y}]}]; returns SVG
    var all = []; series.forEach(function (s) { s.pts.forEach(function (p) { all.push(p); }); });
    if (all.length < 2) return '<div class="card"><h3>' + esc(title) + '</h3><p class="muted small">Not enough entries yet to draw this.</p></div>';
    var xs = all.map(function (p) { return parseDay(p.x).getTime(); }), ys = all.map(function (p) { return p.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    if (x1 === x0) x1 = x0 + 86400000; if (y1 === y0) { y1 += 1; y0 -= 1; }
    var pad = (y1 - y0) * 0.1; y0 -= pad; y1 += pad;
    var W = 340, H = 180, L = 46, B = 26, T = 10, R = 10;
    function X(t) { return L + (t - x0) / (x1 - x0) * (W - L - R); } function Y(v) { return T + (1 - (v - y0) / (y1 - y0)) * (H - T - B); }
    var colors = ['var(--pri)', 'var(--warn)', 'var(--ok)'], dash = ['', '6 4', '2 3'];
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + ' chart">';
    [y0 + pad, (y0 + y1) / 2, y1 - pad].forEach(function (v) { svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="var(--line)" stroke-width="1"/><text x="' + (L - 4) + '" y="' + (Y(v) + 4) + '" font-size="11" text-anchor="end" fill="currentColor">' + round(v, 1) + '</text>'; });
    svg += '<text x="' + L + '" y="' + (H - 6) + '" font-size="11" fill="currentColor">' + esc(parseDay(dayKey(x0)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) + '</text><text x="' + (W - R) + '" y="' + (H - 6) + '" font-size="11" text-anchor="end" fill="currentColor">' + esc(parseDay(dayKey(x1)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) + '</text>';
    series.forEach(function (s, i) {
      var pts = s.pts.slice().sort(function (a, b) { return a.x.localeCompare(b.x); });
      if (!pts.length) return;
      svg += '<polyline fill="none" stroke="' + colors[i] + '" stroke-width="3" stroke-dasharray="' + dash[i] + '" points="' + pts.map(function (p) { return X(parseDay(p.x).getTime()) + ',' + Y(p.y); }).join(' ') + '"/>';
      pts.forEach(function (p) { svg += '<circle cx="' + X(parseDay(p.x).getTime()) + '" cy="' + Y(p.y) + '" r="3.5" fill="' + colors[i] + '"/>'; });
    });
    svg += '</svg>';
    var legend = series.length > 1 ? '<p class="small">' + series.map(function (s, i) { return '<span style="color:' + colors[i] + ';font-weight:800">' + (i === 0 ? '━' : i === 1 ? '╍' : '┅') + '</span> ' + esc(s.name); }).join(' &nbsp; ') + '</p>' : '';
    return '<div class="card"><h3>' + esc(title) + (unit ? ' (' + esc(unit) + ')' : '') + '</h3>' + svg + legend + '</div>';
  }
  function vTrends(range) {
    var pro = isPro(); range = range || '30';
    if (!pro && range !== '30') range = '30';
    var cutoff = range === 'all' ? '0000' : dayKey(Date.now() - (+range - 1) * 86400000);
    var wu = S.settings.weightUnit;
    var ss = S.sessions.filter(function (s) { return s.date >= cutoff && (s.wUnit || wu) === wu; });
    var fl = {}; S.fluids.forEach(function (f) { var k = dayKey(f.t); if (k >= cutoff) fl[k] = (fl[k] || 0) + f.ml; });
    var fluidPts = Object.keys(fl).map(function (k) { return { x: k, y: toUnit(fl[k]) }; });
    var limitPts = S.settings.limitMl && fluidPts.length ? fluidPts.map(function (p) { return { x: p.x, y: toUnit(S.settings.limitMl) }; }) : [];
    var segs = [['30', 'Last 30 days'], ['90', '90 days'], ['all', 'All time']];
    return '<main id="main"><h1>Trends</h1><p class="small muted">Your own numbers drawn over time. The app does not judge them – bring them to your care team.</p>' +
      '<div class="seg" role="group" aria-label="Range">' + segs.map(function (s) { var locked = !pro && s[0] !== '30'; return '<button data-act="range" data-v="' + s[0] + '" aria-pressed="' + (range === s[0]) + '">' + s[1] + (locked ? ' 🔒' : '') + '</button>'; }).join('') + '</div>' +
      lineChart('Drinks per day', [{ name: 'Drinks', pts: fluidPts }].concat(limitPts.length ? [{ name: 'Limit you entered', pts: limitPts }] : []), fu() === 'oz' ? 'oz' : 'mL') +
      lineChart('Session weight', [{ name: 'Before', pts: ss.filter(function (s) { return s.preW != null; }).map(function (s) { return { x: s.date, y: s.preW }; }) }, { name: 'After', pts: ss.filter(function (s) { return s.postW != null; }).map(function (s) { return { x: s.date, y: s.postW }; }) }], wu) +
      lineChart('Blood pressure before session', [{ name: 'Top', pts: ss.filter(function (s) { return s.preSys != null; }).map(function (s) { return { x: s.date, y: s.preSys }; }) }, { name: 'Bottom', pts: ss.filter(function (s) { return s.preDia != null; }).map(function (s) { return { x: s.date, y: s.preDia }; }) }], '') +
      lineChart('Fluid removed (UF)', [{ name: 'UF', pts: ss.filter(function (s) { return s.uf != null && (s.ufUnit || S.settings.ufUnit) === S.settings.ufUnit; }).map(function (s) { return { x: s.date, y: s.uf }; }) }], S.settings.ufUnit) +
      DISCLAIMER + '</main>' + nav('#/trends');
  }

  /* ---- Pro: labs, meds, printable summary ---- */
  function proGate(title) {
    return '<main id="main"><p><a href="#/more">‹ More</a></p><h1>' + esc(title) + ' <span class="lock">Pro</span></h1><div class="card"><p>This is part of Pro, a one-time unlock (' + esc(C.PRO_PRICE || '') + ', ' + esc(C.PRO_PRICE_NOTE || '') + ').</p><p class="small">Everything else – logging, full history, backups and the 30-day trends – stays free forever.</p><a class="btn" href="#/pro">See Pro</a></div></main>' + nav('#/more');
  }
  function vLabs() {
    if (!isPro()) return proGate('Lab results');
    var list = S.labs.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    return '<main id="main"><p><a href="#/more">‹ More</a></p><h1>Lab results</h1><p class="small muted">Write down results exactly as your clinic gives them. No ranges or flags are added.</p>' +
      '<form id="labform" class="card"><div class="grid2"><label class="field"><span>Date</span><input type="date" id="l-date" value="' + today() + '"></label><label class="field"><span>Test</span><input type="text" id="l-name" maxlength="40" placeholder="e.g. Potassium" list="lab-names"></label></div><div class="grid2">' + numInput('l-val', 'Result', '') + '<label class="field"><span>Unit</span><input type="text" id="l-unit" maxlength="16" placeholder="as on your report"></label></div><button class="btn" type="submit">Add result</button></form>' +
      '<datalist id="lab-names">' + uniq(S.labs.map(function (l) { return l.name; })).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>' +
      (list.length ? '<ul class="list" id="lab-list">' + list.map(function (l) { return '<li><div class="grow"><b>' + esc(l.name) + ': ' + esc(l.value) + ' ' + esc(l.unit || '') + '</b><div class="small muted">' + esc(fmtDay(l.date)) + '</div></div><button class="btn sm danger" data-act="del-lab" data-id="' + esc(l.id) + '">Delete</button></li>'; }).join('') + '</ul>' : '<p class="muted">No results yet.</p>') + '</main>' + nav('#/more');
  }
  function uniq(a) { var o = {}; return a.filter(function (x) { return x && !o[x] && (o[x] = 1); }); }
  function vMeds() {
    if (!isPro()) return proGate('Medicine list');
    return '<main id="main"><p><a href="#/more">‹ More</a></p><h1>Medicine list</h1><p class="small muted">A simple list to show your care team or take to appointments. Copy it from your pharmacy label. No reminders.</p>' +
      '<form id="medform" class="card"><label class="field"><span>Name</span><input type="text" id="m-name" maxlength="60"></label><div class="grid2"><label class="field"><span>Dose</span><input type="text" id="m-dose" maxlength="30"></label><label class="field"><span>When</span><input type="text" id="m-when" maxlength="40" placeholder="e.g. with meals"></label></div><button class="btn" type="submit">Add medicine</button></form>' +
      (S.meds.length ? '<ul class="list" id="med-list">' + S.meds.map(function (m) { return '<li><div class="grow"><b>' + esc(m.name) + '</b><div class="small">' + esc([m.dose, m.when].filter(Boolean).join(' · ')) + '</div></div><button class="btn sm danger" data-act="del-med" data-id="' + esc(m.id) + '">Delete</button></li>'; }).join('') + '</ul>' : '<p class="muted">No medicines listed.</p>') + '</main>' + nav('#/more');
  }
  function vReport() {
    if (!isPro()) return proGate('Printable summary');
    var cutoff = dayKey(Date.now() - 29 * 86400000), ss = sessionsSorted().filter(function (s) { return s.date >= cutoff; });
    var days = []; for (var i = 0; i < 30; i++) { var k = dayKey(Date.now() - i * 86400000), t = dayTotalMl(k); if (t) days.push([k, t]); }
    return '<main id="main"><p class="noprint"><a href="#/more">‹ More</a></p><h1>Summary – last 30 days' + (S.settings.whose ? ' · ' + esc(S.settings.whose) : '') + '</h1><p class="small">Made ' + esc(fmtDay(today())) + ' with Dialysis Log. Numbers as entered by the user.</p>' +
      '<button class="btn noprint" data-act="print">Print or save as PDF</button>' +
      '<h2>Sessions</h2>' + (ss.length ? '<table class="t"><tr><th>Date</th><th>Weight before/after (' + esc(S.settings.weightUnit) + ')</th><th>BP before</th><th>BP after</th><th>UF</th><th>Notes</th></tr>' + ss.map(function (s) { return '<tr><td>' + esc(s.date) + '</td><td>' + esc((s.preW == null ? '–' : s.preW) + ' / ' + (s.postW == null ? '–' : s.postW)) + '</td><td>' + esc(s.preSys != null ? s.preSys + '/' + (s.preDia == null ? '–' : s.preDia) : '–') + '</td><td>' + esc(s.postSys != null ? s.postSys + '/' + (s.postDia == null ? '–' : s.postDia) : '–') + '</td><td>' + esc(s.uf != null ? s.uf + ' ' + (s.ufUnit || '') : '–') + '</td><td>' + esc(s.notes || '') + '</td></tr>'; }).join('') + '</table>' : '<p>None.</p>') +
      '<h2>Drinks per day</h2>' + (days.length ? '<table class="t"><tr><th>Date</th><th>Total</th></tr>' + days.map(function (d) { return '<tr><td>' + d[0] + '</td><td>' + fmtFluid(d[1]) + '</td></tr>'; }).join('') + '</table>' : '<p>None.</p>') +
      (S.settings.limitMl ? '<p>Daily limit entered by user: ' + fmtFluid(S.settings.limitMl) + '</p>' : '') +
      (S.meds.length ? '<h2>Medicine list</h2><ul>' + S.meds.map(function (m) { return '<li>' + esc(m.name) + ' ' + esc([m.dose, m.when].filter(Boolean).join(' · ')) + '</li>'; }).join('') + '</ul>' : '') + DISCLAIMER + '</main>' + nav('#/more');
  }

  function vMore() {
    var pro = isPro();
    return '<main id="main"><h1>More</h1>' +
      '<div class="card"><h3>Your data</h3><p class="small">Everything is stored only on this phone. Save a backup file regularly (e.g. to Files, Drive or email it to yourself).</p>' +
      '<button class="btn" data-act="backup">Save backup file</button><p></p><button class="btn alt" data-act="restore">Restore from backup</button><p></p><button class="btn alt" data-act="csv">Export spreadsheet (CSV)</button>' +
      '<p class="small muted">' + (S.settings.lastBackup ? 'Last backup: ' + esc(fmtDay(dayKey(S.settings.lastBackup))) : 'No backup saved yet.') + '</p><input type="file" id="restore-file" accept=".json,application/json" hidden></div>' +
      '<div class="card"><h3>Pro ' + (pro ? '✓' : '<span class="lock">' + esc(C.PRO_PRICE || '') + '</span>') + '</h3><ul class="list">' +
      '<li><a class="grow" href="#/labs">Lab results' + (pro ? '' : ' 🔒') + '</a></li><li><a class="grow" href="#/meds">Medicine list' + (pro ? '' : ' 🔒') + '</a></li><li><a class="grow" href="#/report">Printable summary' + (pro ? '' : ' 🔒') + '</a></li><li><a class="grow" href="#/pro">' + (pro ? 'Your Pro license' : 'About Pro / enter license key') + '</a></li></ul></div>' +
      '<p><a class="btn alt" href="#/settings">Settings</a></p><p><a class="btn alt" href="#/history">Past days</a></p><p><a class="btn alt" href="#/about">About, privacy & help</a></p><p><a class="btn alt" href="terms.html" id="more-terms">Terms of Use</a></p>' + DISCLAIMER + '</main>' + nav('#/more');
  }
  function vPro() {
    var pro = isPro(), st = S.settings, ready = !!C.GUMROAD_PRODUCT_ID;
    return '<main id="main"><p><a href="#/more">‹ More</a></p><h1>Dialysis Log Pro</h1>' +
      '<div class="card"><p><b>' + esc(C.PRO_PRICE || '') + '</b> – ' + esc(C.PRO_PRICE_NOTE || '') + '</p><ul><li>Trends for 90 days and all time</li><li>Lab results log</li><li>Medicine list</li><li>Printable 30-day summary for appointments</li></ul><p class="small">Free forever, no matter what: drink logging, sessions, full history, backup, CSV export, 30-day trends.</p>' +
      (pro ? '<p id="pro-status">✓ Pro is unlocked on this phone' + (st.license.source === 'dev' ? ' (dev test code)' : '') + '. Key ' + esc(maskKey(st.license.key)) + '.</p>'
        : (st.license && st.license.revokedAt ? '<p style="color:var(--danger)">' + esc(st.license.reason || 'Your license is no longer active.') + '</p>' : '') +
          (ready && C.CHECKOUT_URL ? '<a class="btn" id="buy" href="' + esc(C.CHECKOUT_URL) + '" target="_blank" rel="noopener">Buy Pro on Gumroad</a>' : '<p id="pro-soon"><b>Pro is coming soon.</b> Everything you log now will be there when it arrives.</p>')) +
      '</div><div class="card"><label class="field"><span>' + (pro ? 'Re-enter or change license key' : 'Have a license key?') + '</span><input type="text" id="lic" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="From your Gumroad receipt"></label>' +
      '<button class="btn" data-act="unlock" id="unlock-btn">Activate</button><p class="small muted">Activating needs internet once. Your key is sent only to Gumroad to check it. Pro then works offline.</p><p id="lic-msg" role="status"></p></div></main>' + nav('#/more');
  }
  function vSettings() {
    var st = S.settings;
    return '<main id="main"><p><a href="#/more">‹ More</a></p><h1>Settings</h1>' +
      '<div class="card"><h3>Daily fluid limit</h3>' + numInput('set-limit', 'Limit from your care team (' + (fu() === 'oz' ? 'oz' : 'mL') + ')', st.limitMl ? toUnit(st.limitMl) : '', 'empty = no limit') + '<p class="small muted">Only the number you type is used. The app never suggests one.</p><button class="btn" data-act="save-limit">Save limit</button></div>' +
      '<div class="card"><h3>Units</h3><div class="seg" role="group" aria-label="Fluid unit"><button data-act="set-fu" data-v="oz" aria-pressed="' + (st.fluidUnit === 'oz') + '">oz</button><button data-act="set-fu" data-v="ml" aria-pressed="' + (st.fluidUnit === 'ml') + '">mL</button></div><p></p>' +
      '<div class="seg" role="group" aria-label="Weight unit"><button data-act="set-wu" data-v="lb" aria-pressed="' + (st.weightUnit === 'lb') + '">lb</button><button data-act="set-wu" data-v="kg" aria-pressed="' + (st.weightUnit === 'kg') + '">kg</button></div><p class="small muted">Changing weight unit affects new sessions only. Old sessions keep the unit they were saved in.</p></div>' +
      '<div class="card"><h3>Drink buttons</h3><ul class="list" id="cup-list">' + st.cups.map(function (c) { return '<li><div class="grow"><b>' + esc(c.label) + '</b> · ' + esc(cupLabel(c)) + '</div><button class="btn sm danger" data-act="del-cup" data-id="' + esc(c.id) + '" aria-label="Remove ' + esc(c.label) + '">Remove</button></li>'; }).join('') + '</ul>' +
      '<div class="grid2"><label class="field"><span>Name</span><input type="text" id="cup-label" maxlength="24" placeholder="e.g. Coffee mug"></label>' + numInput('cup-amt', 'Amount (' + (fu() === 'oz' ? 'oz' : 'mL') + ')', '') + '</div><button class="btn" data-act="add-cup">Add button</button><p class="small muted">Tip: measure your own cups once with a measuring cup.</p></div>' +
      '<div class="card"><h3>Reading</h3><div class="seg" role="group" aria-label="Text size"><button data-act="set-ts" data-v="large" aria-pressed="' + (st.textSize !== 'xl') + '">Large text</button><button data-act="set-ts" data-v="xl" aria-pressed="' + (st.textSize === 'xl') + '">Extra large</button></div><p></p>' +
      '<div class="seg" role="group" aria-label="Colors"><button data-act="set-dark" data-v="0" aria-pressed="' + !st.dark + '">Light</button><button data-act="set-dark" data-v="1" aria-pressed="' + !!st.dark + '">Dark</button></div></div>' +
      '<div class="card"><label class="field"><span>Whose log is this? (optional)</span><input type="text" id="set-whose" maxlength="40" value="' + esc(st.whose) + '"></label><button class="btn alt" data-act="save-whose">Save name</button></div>' +
      '<div class="card"><h3>Erase</h3><button class="btn danger" data-act="erase">Erase all data on this phone</button></div></main>' + nav('#/more');
  }
  function vAbout() {
    return '<main id="main"><p><a href="#/more">‹ More</a></p><h1>About Dialysis Log</h1>' + DISCLAIMER +
      '<div class="card"><h3>Privacy</h3><p class="small" id="privacy">No accounts, no ads, no analytics, no trackers. What you enter stays only on this phone, in this browser’s storage, and is never uploaded. After the first visit the app works without internet. The one exception: if you enter a Pro license key, it is sent to Gumroad (the store) to check it. <a href="privacy.html">Full privacy page</a>.</p></div>' +
      '<div class="card"><h3>Put it on your home screen</h3><p class="small"><b>iPhone:</b> in Safari tap Share → “Add to Home Screen”. <b>Android:</b> in Chrome tap ⋮ → “Add to Home screen” / “Install app”.</p></div>' +
      '<div class="card"><h3>New phone?</h3><p class="small">More → Save backup file, move the file to the new phone, then More → Restore. Re-enter your Pro key if you have one.</p></div>' +
      '<div class="card"><h3>Terms of Use</h3><p class="small">Dialysis Log is provided as is and is not medical advice. <a href="terms.html" id="about-terms">Read the Terms of Use</a>.</p>' + (function () { var r = termsRecord(); return r && r.at ? '<p class="small muted" id="agreed-on">You agreed to version ' + esc(r.version) + ' on ' + esc(new Date(r.at).toLocaleDateString()) + '.</p>' : ''; })() + '</div>' +
      '<p class="small muted">Version 1.1.2</p></main>' + nav('#/more');
  }

  /* ---------------- router ---------------- */
  var trendRange = '30';
  function render() {
    applyLook();
    var h = location.hash || '#/', html;
    if (!termsOk()) html = vTerms();
    else if (!S.settings.setupDone) html = vSetup();
    else if (h === '#/' || h === '#') html = vToday();
    else if (h === '#/history') html = vHistory();
    else if (h.indexOf('#/day/') === 0) html = vDay(h.slice(6));
    else if (h === '#/sessions') html = vSessions();
    else if (h.indexOf('#/session/') === 0) html = vSession(decodeURIComponent(h.slice(10)));
    else if (h === '#/trends') html = vTrends(trendRange);
    else if (h === '#/more') html = vMore();
    else if (h === '#/settings') html = vSettings();
    else if (h === '#/pro') html = vPro();
    else if (h === '#/labs') html = vLabs();
    else if (h === '#/meds') html = vMeds();
    else if (h === '#/report') html = vReport();
    else if (h === '#/about') html = vAbout();
    else html = vToday();
    $('#app').innerHTML = html;
  }
  function go(h) { if (location.hash === h) render(); else location.hash = h; }

  /* ---------------- actions ---------------- */
  function addFluid(ml, label, t) {
    var e = { id: uid(), t: t || Date.now(), ml: ml, label: label || '' };
    S.fluids.push(e); save(); render();
    toast('Added ' + fmtFluid(ml) + ' – tap Edit to change', 2600);
  }
  function amountSheet(title, cb, pre) {
    sheet('<h2 style="margin-top:0">' + esc(title) + '</h2>' + numInput('amt', 'Amount (' + (fu() === 'oz' ? 'oz' : 'mL') + ')', pre && pre.amt) + '<label class="field"><span>What (optional)</span><input type="text" id="amt-label" maxlength="24" value="' + esc(pre && pre.label || '') + '"></label>' +
      (pre && pre.withTime ? '<label class="field"><span>Time</span><input type="time" id="amt-time" value="' + esc(pre.time || '12:00') + '"></label>' : '') +
      '<div class="grid2"><button class="btn alt" data-x="no">Cancel</button><button class="btn" data-x="ok">Save</button></div>' + (pre && pre.del ? '<p></p><button class="btn danger" data-x="del">Delete this drink</button>' : ''));
    amountCb = cb;
  }
  var amountCb = null;
  function download(name, text, type) {
    var blob = new Blob([text], { type: type }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function backupJson() { var copy = JSON.parse(JSON.stringify(S)); delete copy.settings.license; delete copy.settings.deviceId; copy.exportedAt = new Date().toISOString(); copy.app = 'dialysis-log'; return JSON.stringify(copy, null, 1); }
  function csvCell(v) { v = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(v) && isNaN(Number(v))) v = "'" + v; return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function buildCsv() {
    var rows = [['record', 'date', 'time', 'amount', 'unit', 'label_or_test', 'weight_before', 'weight_after', 'weight_unit', 'bp_before', 'bp_after', 'uf', 'uf_unit', 'notes']];
    S.fluids.slice().sort(function (a, b) { return a.t - b.t; }).forEach(function (f) { var d = new Date(f.t); rows.push(['drink', dayKey(f.t), pad(d.getHours()) + ':' + pad(d.getMinutes()), toUnit(f.ml), fu() === 'oz' ? 'oz' : 'mL', f.label, '', '', '', '', '', '', '', '']); });
    sessionsSorted().reverse().forEach(function (s) { rows.push(['session', s.date, s.time, '', '', '', s.preW, s.postW, s.wUnit, s.preSys != null ? s.preSys + '/' + (s.preDia == null ? '' : s.preDia) : '', s.postSys != null ? s.postSys + '/' + (s.postDia == null ? '' : s.postDia) : '', s.uf, s.ufUnit, s.notes]); });
    S.labs.forEach(function (l) { rows.push(['lab', l.date, '', l.value, l.unit, l.name, '', '', '', '', '', '', '', '']); });
    S.meds.forEach(function (m) { rows.push(['medicine', '', '', m.dose, '', m.name, '', '', '', '', '', '', '', m.when]); });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }
  function validBackup(o) { return o && typeof o === 'object' && Array.isArray(o.fluids) && Array.isArray(o.sessions) && o.settings && typeof o.settings === 'object'; }
  function sanitizeImport(o) {
    var s = migrate(o);
    s.sessions = s.sessions.filter(function (x) { return x && typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date); }).map(function (x) {
      var y = { id: String(x.id || uid()), date: x.date, time: /^\d{2}:\d{2}$/.test(x.time || '') ? x.time : '', wUnit: x.wUnit === 'kg' ? 'kg' : 'lb', ufUnit: ['L', 'mL', 'kg', 'lb'].indexOf(x.ufUnit) >= 0 ? x.ufUnit : 'L', notes: String(x.notes || '').slice(0, 2000), createdAt: +x.createdAt || Date.now() };
      ['preW', 'postW', 'preSys', 'preDia', 'postSys', 'postDia', 'uf'].forEach(function (k) { y[k] = typeof x[k] === 'number' && isFinite(x[k]) ? x[k] : null; }); return y;
    });
    s.fluids = s.fluids.map(function (f) { return { id: String(f.id || uid()), t: +f.t, ml: +f.ml, label: String(f.label || '').slice(0, 40) }; });
    s.labs = s.labs.filter(function (l) { return l && l.name; }).map(function (l) { return { id: String(l.id || uid()), date: String(l.date || today()).slice(0, 10), name: String(l.name).slice(0, 40), value: String(l.value == null ? '' : l.value).slice(0, 20), unit: String(l.unit || '').slice(0, 16) }; });
    s.meds = s.meds.filter(function (m) { return m && m.name; }).map(function (m) { return { id: String(m.id || uid()), name: String(m.name).slice(0, 60), dose: String(m.dose || '').slice(0, 30), when: String(m.when || '').slice(0, 40) }; });
    s.settings.cups = s.settings.cups.filter(function (c) { return c && isFinite(c.ml) && c.ml > 0; }).map(function (c) { return { id: String(c.id || uid()), label: String(c.label || '').slice(0, 24), ml: +c.ml }; });
    s.settings.fluidUnit = s.settings.fluidUnit === 'ml' ? 'ml' : 'oz'; s.settings.weightUnit = s.settings.weightUnit === 'kg' ? 'kg' : 'lb';
    s.settings.limitMl = isFinite(s.settings.limitMl) && s.settings.limitMl > 0 ? +s.settings.limitMl : null;
    s.settings.whose = String(s.settings.whose || '').slice(0, 40);
    s.settings.setupDone = true;
    return s;
  }

  document.addEventListener('click', function (e) {
    var x = e.target.closest('[data-x]');
    if (x) {
      var w = x.getAttribute('data-x');
      if (w === 'no') return closeSheet();
      if (w === 'yes') { closeSheet(); if (confirmCb) confirmCb(); return; }
      if (w === 'ok' || w === 'del') { var cb = amountCb; if (cb) cb(w); return; }
    }
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.getAttribute('data-act'), v = el.getAttribute('data-v'), id = el.getAttribute('data-id'), st = S.settings;
    if (act === 'sheet-close') { if (e.target === el) closeSheet(); return; }
    e.preventDefault();
    switch (act) {
      case 'su-fu': st.fluidUnit = v; render(); break;
      case 'su-wu': st.weightUnit = v; st.ufUnit = 'L'; render(); break;
      case 'su-done': {
        var n = num($('#su-limit').value);
        if (isNaN(n) || (n != null && n <= 0)) return toast('Please type the limit as a number, or leave it empty.');
        st.limitMl = n ? fromUnit(n) : null; st.whose = $('#su-whose').value.trim().slice(0, 40);
        st.setupDone = true; save(); go('#/'); break;
      }
      case 'agree': {
        var bx = $('#agree-box'); if (!bx || !bx.checked) return toast('Tick the box first');
        try { localStorage.setItem(TERMS_KEY, JSON.stringify({ agreed: true, version: TERMS_VERSION, at: new Date().toISOString() })); } catch (err) { return toast('Could not save. Phone storage may be full.', 5000); }
        go('#/'); render(); window.scrollTo(0, 0); break;
      }
      case 'su-skip': st.setupDone = true; save(); go('#/'); break;
      case 'add': { var c = st.cups.filter(function (c) { return c.id === id; })[0]; if (c) addFluid(c.ml, c.label); break; }
      case 'add-other': amountSheet('Add a drink', function (w) { var a = num($('#amt').value); if (!a || isNaN(a) || a <= 0) return toast('Type an amount'); var lb = $('#amt-label').value.trim(); closeSheet(); addFluid(fromUnit(a), lb); }); break;
      case 'add-past': {
        var day = el.getAttribute('data-day');
        amountSheet('Add a drink to ' + fmtDay(day), function () { var a = num($('#amt').value); if (!a || isNaN(a) || a <= 0) return toast('Type an amount'); var tm = ($('#amt-time').value || '12:00').split(':'), d = parseDay(day); d.setHours(+tm[0], +tm[1]); var lb = $('#amt-label').value.trim(); closeSheet(); addFluid(fromUnit(a), lb, d.getTime()); }, { withTime: true });
        break;
      }
      case 'edit-fluid': {
        var f = S.fluids.filter(function (f) { return f.id === id; })[0]; if (!f) return;
        var d0 = new Date(f.t);
        amountSheet('Change drink', function (w) {
          if (w === 'del') { S.fluids = S.fluids.filter(function (z) { return z.id !== id; }); save(); closeSheet(); render(); return toast('Drink deleted'); }
          var a = num($('#amt').value); if (!a || isNaN(a) || a <= 0) return toast('Type an amount');
          f.ml = fromUnit(a); f.label = $('#amt-label').value.trim(); var tm = $('#amt-time').value.split(':'); if (tm.length === 2) { var nd = new Date(f.t); nd.setHours(+tm[0], +tm[1]); f.t = nd.getTime(); }
          save(); closeSheet(); render(); toast('Saved');
        }, { amt: toUnit(f.ml), label: f.label, withTime: true, time: pad(d0.getHours()) + ':' + pad(d0.getMinutes()), del: true });
        break;
      }
      case 'nag-later': st.backupNagAt = Date.now(); save(); render(); break;
      case 'uf-unit': $('#s-ufu').value = v; Array.prototype.forEach.call(el.parentNode.children, function (b) { b.setAttribute('aria-pressed', String(b === el)); }); saveDraft(); break;
      case 'del-session': confirmBox('Delete this session?', 'Delete', function () { S.sessions = S.sessions.filter(function (s) { return s.id !== id; }); save(); go('#/sessions'); toast('Session deleted'); }); break;
      case 'range': if (v !== '30' && !isPro()) { go('#/pro'); return toast('90-day and all-time trends are part of Pro'); } trendRange = v; render(); break;
      case 'backup': download('dialysis-log-backup-' + today() + '.json', backupJson(), 'application/json'); st.lastBackup = Date.now(); save(); render(); toast('Backup file saved. Keep it somewhere safe.', 3500); break;
      case 'csv': download('dialysis-log-' + today() + '.csv', buildCsv(), 'text/csv'); toast('Spreadsheet saved'); break;
      case 'restore': $('#restore-file').click(); break;
      case 'print': window.print(); break;
      case 'unlock': {
        var btn = $('#unlock-btn'); btn.disabled = true; $('#lic-msg').textContent = 'Checking…';
        tryUnlock($('#lic').value).then(function (r) { if (r.ok) { render(); toast(r.msg, 4000); } else { btn.disabled = false; $('#lic-msg').textContent = r.msg; } });
        break;
      }
      case 'save-limit': { var n2 = num($('#set-limit').value); if (isNaN(n2) || (n2 != null && n2 <= 0)) return toast('Type a number, or leave it empty for no limit'); st.limitMl = n2 ? fromUnit(n2) : null; save(); render(); toast(n2 ? 'Limit saved' : 'Limit removed'); break; }
      case 'set-fu': st.fluidUnit = v; save(); render(); break;
      case 'set-wu': st.weightUnit = v; save(); render(); break;
      case 'set-ts': st.textSize = v; save(); render(); break;
      case 'set-dark': st.dark = v === '1'; save(); render(); break;
      case 'save-whose': st.whose = $('#set-whose').value.trim().slice(0, 40); save(); toast('Saved'); break;
      case 'add-cup': { var lab = $('#cup-label').value.trim(), am = num($('#cup-amt').value); if (!lab || !am || isNaN(am) || am <= 0) return toast('Type a name and an amount'); st.cups.push({ id: uid(), label: lab.slice(0, 24), ml: fromUnit(am) }); save(); render(); toast('Button added'); break; }
      case 'del-cup': st.cups = st.cups.filter(function (c) { return c.id !== id; }); save(); render(); break;
      case 'del-lab': S.labs = S.labs.filter(function (l) { return l.id !== id; }); save(); render(); break;
      case 'del-med': S.meds = S.meds.filter(function (m) { return m.id !== id; }); save(); render(); break;
      case 'erase': confirmBox('Erase everything on this phone? This cannot be undone. Save a backup first.', 'Erase all', function () { var lic = S.settings.license; S = defaults(); S.settings.license = lic; save(); go('#/'); toast('All data erased'); }); break;
      case 'pick-day': sheet('<h2 style="margin-top:0">Open a date</h2><label class="field"><span>Date</span><input type="date" id="pick" value="' + today() + '" max="' + today() + '"></label><div class="grid2"><button class="btn alt" data-x="no">Cancel</button><button class="btn" data-act="go-day">Open</button></div>'); break;
      case 'go-day': { var pk = $('#pick').value; closeSheet(); if (pk) go('#/day/' + pk); break; }
    }
  });
  function saveDraft() { if (location.hash !== '#/session/new' || !$('#sform')) return; S.settings.draft = readSessionForm().f; save(); }
  document.addEventListener('input', function (e) { if (e.target.closest('#sform')) saveDraft(); });
  document.addEventListener('submit', function (e) {
    e.preventDefault();
    if (e.target.id === 'sform') {
      var r = readSessionForm(); if (r.bad.length) return toast('Please check: ' + r.bad.join(', '), 4000);
      var id = decodeURIComponent(location.hash.slice(10)), s = S.sessions.filter(function (x) { return x.id === id; })[0];
      if (s) Object.assign(s, r.f); else { s = Object.assign({ id: uid(), createdAt: Date.now() }, r.f); S.sessions.push(s); S.settings.draft = null; }
      save(); go('#/session/' + s.id); toast('Session saved');
    } else if (e.target.id === 'labform') {
      var nm = $('#l-name').value.trim(), val = $('#l-val').value.trim(); if (!nm || !val) return toast('Type the test and result');
      S.labs.push({ id: uid(), date: $('#l-date').value || today(), name: nm.slice(0, 40), value: val.slice(0, 20), unit: $('#l-unit').value.trim().slice(0, 16) }); save(); render(); toast('Result added');
    } else if (e.target.id === 'medform') {
      var mn = $('#m-name').value.trim(); if (!mn) return toast('Type a name');
      S.meds.push({ id: uid(), name: mn.slice(0, 60), dose: $('#m-dose').value.trim().slice(0, 30), when: $('#m-when').value.trim().slice(0, 40) }); save(); render(); toast('Medicine added');
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'agree-box') { var ab = $('#agree-btn'); if (ab) ab.disabled = !e.target.checked; return; }
    if (e.target.id !== 'restore-file' || !e.target.files[0]) return;
    var rd = new FileReader();
    rd.onload = function () {
      var o; try { o = JSON.parse(rd.result); } catch (err) { return toast('That file isn’t a Dialysis Log backup.', 4000); }
      if (!validBackup(o)) return toast('That file isn’t a Dialysis Log backup.', 4000);
      confirmBox('Replace what’s on this phone with the backup (' + o.fluids.length + ' drinks, ' + o.sessions.length + ' sessions)?', 'Restore', function () {
        var keepLic = S.settings.license, keepDev = S.settings.deviceId, next = sanitizeImport(o);
        next.settings.license = keepLic || null; next.settings.deviceId = keepDev; S = next; save(); go('#/'); toast('Backup restored');
      });
    };
    rd.readAsText(e.target.files[0]);
    e.target.value = '';
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
  window.addEventListener('hashchange', function () { closeSheet(); render(); window.scrollTo(0, 0); });
  window.addEventListener('storage', function (e) { if (e.key === KEY || e.key === TERMS_KEY) { load(); render(); } });
  var lastDay = today();
  setInterval(function () { if (today() !== lastDay) { lastDay = today(); render(); } }, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && today() !== lastDay) { lastDay = today(); render(); } });

  load(); render();
  window.Dialysis = { state: function () { return JSON.parse(JSON.stringify(S)); }, csv: buildCsv, judge: judge };
  if ('serviceWorker' in navigator && location.protocol !== 'file:') window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  setTimeout(function () { recheckLicense().catch(function () {}); }, 3000);
  window.addEventListener('online', function () { recheckLicense().catch(function () {}); });
})();
