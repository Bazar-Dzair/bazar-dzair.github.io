/**
 * app.js — Bazaar Integrations admin UI.
 * Renders the 8 plugin cards, modal settings, save/load, enable/disable,
 * real-time event feed, and the install-snippet exporter.
 */
(function () {
  'use strict';
  const M = window.IntegrationManager;
  if (!M) {
    document.body.innerHTML = '⚠ محرك الإضافات لم يُحمل.';
    return;
  }
  document.getElementById('evlog') || document.body.appendChild(document.createElement('div'));

  const ELS = {
    grid: document.getElementById('pluginGrid'),
    evlog: document.getElementById('evlog'),
    saveFlag: document.getElementById('saveFlag'),
    modal: document.getElementById('modal'),
    installModal: document.getElementById('installModal'),
    modalHead: document.getElementById('modalHead'),
    modalBody: document.getElementById('modalBody'),
    modalFoot: document.getElementById('modalFoot'),
    modalX: document.getElementById('modalX'),
    modalCancel: document.getElementById('modalCancel'),
    modalSave: document.getElementById('modalSave'),
    installText: document.getElementById('installText'),
    search: document.getElementById('search')
  };

  const ICON_STYLE = {
    meta: ['f', '#3b8cff'], tiktok: ['♪', '#f4f4f4'], ga: ['GA', '#f4b942'],
    gtm: ['GTM', '#f4a142'], gsc: ['GSC', '#f7b32b'], snapchat: ['S', '#fffc00'],
    pinterest: ['P', '#e60023'], sheets: ['S', '#2fa84f']
  };
  const EV = { page_view: 'زيارة', view_item: 'معاينة', add_to_cart: 'سلة', begin_checkout: 'بدء دفع', purchase: 'شراء' };

  let activeFilter = 'all';

  // ---------------------------------------------------------------------------
  // RENDERING
  // ---------------------------------------------------------------------------
  function buildCard(p) {
    const on = M.isEnabled(p.id);
    const [glyph, color] = ICON_STYLE[p.icon] || ['●', '#888'];
    const card = document.createElement('article');
    card.className = 'card';

    const evTags = (p.events || []).length
      ? p.events.map((e) => `<span class="ev-tag">${EV[e] || e}</span>`).join(' ')
      : '<span class="muted">لا أحداث</span>';

    card.innerHTML = `
      <div class="card-top">
        <div class="ic" style="background:${color}22;color:${color};">${glyph}</div>
        <div class="card-title">
          <div class="p-name">${p.name}</div>
          <div class="tag">${p.tagline || ''}</div>
        </div>
        <label class="switch" title="تفعيل/تعطيل">
          <input type="checkbox" data-toggle="${p.id}" ${on ? 'checked' : ''}>
          <span class="sw-track"><i></i></span>
        </label>
      </div>
      <div class="card-events">${evTags}</div>
      <div class="card-actions">
        <div class="act">
          ${p.test ? `<button class="info-btn" data-test="${p.id}" type="button">اختبار</button>` : ''}
          <button class="set-btn" data-set="${p.id}" type="button">⚙ الإعدادات</button>
        </div>
        <span class="status-pill"><span class="status-dot ${on ? 'status-on' : 'status-off'}"></span>${on ? 'مفعّلة' : 'معطّلة'}</span>
      </div>`;
    return card;
  }

  function render() {
    ELS.grid.innerHTML = '';
    const q = (ELS.search.value || '').trim().toLowerCase();
    M.ids().forEach((id) => {
      const p = M.registry[id];
      const on = M.isEnabled(id);
      if (activeFilter === 'on' && !on) return;
      if (activeFilter === 'off' && on) return;
      if (q && !p.name.toLowerCase().includes(q) && !(p.tagline || '').toLowerCase().includes(q)) return;
      ELS.grid.appendChild(buildCard(p));
    });
    if (!ELS.grid.children.length) ELS.grid.innerHTML = '<div class="muted">لا نتائج.</div>';
  }

  // ---------------------------------------------------------------- modal
  function openSettings(id) {
    const p = M.registry[id];
    if (!p) return;
    const [glyph, color] = ICON_STYLE[id] || ['●', '#888'];
    ELS.modal.classList.add('modal-open');
    ELS.modalHead.innerHTML = `
      <div class="ic" style="background:${color}22;color:${color};">${glyph}</div>
      <div>
        <h3 style="margin:0;font-size:19px">${p.name}</h3>
        <div class="tag" style="color:var(--muted);font-size:12px">
          ${M.isEnabled(id) ? '🟢 مفعّلة' : '⚫ معطّلة'} • أحداث: ${(p.events || []).join('، ') || '—'}
        </div>
      </div>`;

    const vals = M.values(id);
    const fields = (p.fields || []).map((f) => {
      let input;
      if (f.type === 'select') {
        const opts = (f.options || []).map((o) => `<option value="${o}" ${vals[f.key] === o ? 'selected' : ''}>${o}</option>`).join('');
        input = `<select data-field="${f.key}">${opts}</select>`;
      } else {
        input = `<input type="text" data-field="${f.key}" value="${(vals[f.key] || '').replace(/"/g, '&quot;')}" placeholder="${(f.placeholder || '').replace(/"/g, '&quot;')}">`;
      }
      return `<div class="field"><label>${f.label || f.key}${f.required ? ' *' : ''}</label>${input}
        ${f.help ? `<div class="help">${f.help}</div>` : ''}</div>`;
    }).join('');

    let extra = '';
    if (p.id === 'googleSearchConsole') {
      extra = `<div class="field-note" style="margin-top:14px">
        <b>طريقة التحقق الموصى بها لـ GitHub Pages: Meta Tag</b><br>
        في Google Search Console ← <code>إضافة خاصية</code> اختر <code>بادئة URL</code> وأدخل
        <code>https://bazar-dzair.github.io/</code>، ثم اختر طريقة التحقق <code>علامة HTML</code>.
        انسخ قيمة الوسم والصق كامل السطر أو القيمة فقط هنا واحفظها. سيُثبَّت الوسم داخل رأس الموقع
        عند التفعيل ولن يتكرر. ثم اضغط «تحقق» في Google بعد رفع التحديثات.
        <div style="margin-top:8px"><a href="https://search.google.com/search-console" target="_blank" class="btn-ghost" style="display:inline-block">↗ فتح Google Search Console</a></div>
      </div>`;
    }
    if (p.id === 'googleSheets') {
      extra = `<div class="field-note" style="margin-top:12px">
        <b>قالب Apps Script</b> (أنشئه في ورقة Google ثم انشر كتطبيق ويب):<br>
        <textarea readonly class="code-block">${(p.endpointTemplate || '').replace(/</g, '&lt;')}</textarea>
        <div class="help">انشر → نشر كتطبيق ويب → تنفيذ: أي شخص لديه الرابط. الصق الناتج في حقل Webhook بالأعلى ثم جرب زر الاختبار.</div>
      </div>`;
    }
    ELS.modalBody.innerHTML = fields + extra;
    ELS.modalFoot.innerHTML = `
      <span class="msg" id="modalMsg" style="visibility:hidden"></span>
      ${p.test ? `<button class="btn-ghost" data-test="${id}" id="modalTest" type="button">اختبار</button>` : ''}
      <button class="btn" id="modalCancel" type="button">إلغاء</button>
      <button class="btn-primary" id="modalSave" type="button">حفظ الإعدادات</button>`;
  }

  function flash(msg, kind) {
    const el = ELS.modalFoot.querySelector('#modalMsg');
    if (!el) return;
    el.textContent = msg;
    el.className = 'msg ' + (kind === 'err' ? 'msg-err' : 'msg-ok');
    el.style.visibility = 'visible';
  }
  function clearFlash() {
    const el = ELS.modalFoot.querySelector('#modalMsg');
    if (el) el.style.visibility = 'hidden';
  }

  function collectFields() {
    const out = {};
    ELS.modalBody.querySelectorAll('[data-field]').forEach((el) => { out[el.dataset.field] = (el.value || '').trim(); });
    return out;
  }

  function doTest() {
    const v = collectFields();
    const id = ELS.modal.dataset.ptid;
    const p = M.registry[id];
    if (!p || !p.test) return;
    const empty = (p.fields || []).filter((f) => f.required && !v[f.key]);
    if (empty.length) { flash('✗ املأ الحقول أولاً: ' + empty.map((f) => f.label).join('، '), 'err'); return; }
    const btn = ELS.modalFoot.querySelector('#modalTest');
    const old = btn.textContent; btn.textContent = '…';
    Promise.resolve(p.test(v)).then((r) => {
      btn.textContent = old;
      flash((r.ok ? '✓ ' : '✗ ') + (r.message || (r.ok ? 'ناجح' : 'فشل')), r.ok ? '' : 'err');
    }).catch((e) => { btn.textContent = old; flash('✗ ' + (e && e.message), 'err'); });
  }

  function runCardTest(id) {
    const p = M.registry[id];
    if (!p || !p.test) return;
    const v = M.values(id);
    const empty = (p.fields || []).filter((f) => f.required && !v[f.key]);
    const btn = document.querySelector(`[data-test="${id}"]`);
    if (btn) btn.textContent = '…';
    Promise.resolve(empty.length ? { ok: false, message: 'املأ الإعدادات أولاً' } : p.test(v)).then((r) => {
      if (btn) btn.textContent = 'اختبار';
      alert((r.ok ? '✓ ' : '✗ ') + (r.message || (r.ok ? 'ناجح' : 'فشل')));
    }).catch((e) => { if (btn) btn.textContent = 'اختبار'; alert('✗ ' + (e && e.message)); });
  }

  // ----------------------------------------------------------------- event feed
  window.__onEventEmit = function (type, payload, results) {
    const icon = { page_view: '📄', view_item: '🛍', add_to_cart: '🛒', begin_checkout: '🧾', purchase: '💰' }[type] || '⚡';
    const label = EV[type] || type;
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const got = results.filter((r) => r.status === 'sent').length;
    const errs = results.filter((r) => r.status === 'error');
    const empty = ELS.evlog.querySelector('.evlog-empty');
    if (empty) empty.remove();
    let details = '';
    if (errs.length) details += `<span class="rec" style="color:var(--danger)">خطأ: ${errs.map((r) => r.id + (r.detail ? ' — ' + r.detail : '')).join('، ')}</span>`;
    else details += `<span class="rec">استقبلتها ${got} إضافة مفعّلة</span>`;
    const row = document.createElement('div');
    row.className = 'entry';
    row.innerHTML = `<b>${icon} ${label}</b> <span class="muted">• ${ts}</span><br>${details}`;
    ELS.evlog.prepend(row);
    while (ELS.evlog.children.length > 40) ELS.evlog.lastChild.remove();
  };

  // ----------------------------------------------------------------- install
  function openInstall() {
    ELS.installText.value = M.buildInstallSnippet();
    ELS.installModal.classList.add('modal-open');
  }

  // -------------------------------------------------------------------------
  function fireEvent(e) {
    const demo = {
      page_view: { page: '/', source: 'bazaar-demo' },
      view_item: { content_ids: ['P1001'], content_type: 'product', value: 9 },
      add_to_cart: { content_ids: ['P1001'], content_type: 'product', value: 9, quantity: 1 },
      begin_checkout: { value: 18, currency: 'DZD', content_type: 'cart' },
      purchase: { value: 18, currency: 'DZD', content_ids: ['P1001', 'P1002'] }
    };
    const p = demo[e] || {};
    M.emit(e, p);
  }

  function bindGlobalClick() {
    document.addEventListener('click', (el) => {
      if (el.target.closest) {
        const tg = el.target.closest('input[data-toggle]');
        if (tg) { M.setEnabled(tg.dataset.toggle, tg.checked); render(); return; }
        const se = el.target.closest('[data-set]');
        if (se) { ELS.modal.dataset.ptid = se.dataset.set; openSettings(se.dataset.set); return; }
        const te = el.target.closest('[data-test]');
        if (te) { runCardTest(te.dataset.test); return; }
      }
    });
  }

  function bindUi() {
    // modal foot buttons are recreated by openSettings, so delegate catch-all.
    document.getElementById('modal').addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest && t.closest('#modalSave')) { doSave(); return; }
      if (t.closest && t.closest('#modalCancel')) ELS.modal.classList.remove('modal-open');
      if (t.closest && t.closest('#modalTest')) doTest();
    });
    ELS.modalX.addEventListener('click', () => ELS.modal.classList.remove('modal-open'));
    ELS.search.addEventListener('input', () => render());
    document.getElementById('btnClearLog').addEventListener('click', () => {
      ELS.evlog.innerHTML = '<div class="evlog-empty">تم مسح السجل.</div>';
    });
    document.getElementById('installBtn').addEventListener('click', openInstall);
    document.getElementById('installX').addEventListener('click', () => ELS.installModal.classList.remove('modal-open'));
    document.getElementById('btnCopyInstall').addEventListener('click', async () => {
      const t = ELS.installText.value;
      try { await navigator.clipboard.writeText(t); alert('تم النسخ ✓'); }
      catch (e) { try { document.execCommand && document.execCommand('copy'); } catch (_) {} alert('انسخ الكود يدويا من الصندوق.'); }
    });
    document.querySelectorAll('.filter-chips .chip').forEach((c) => {
      c.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach((x) => (x.className = 'chip'));
        c.className = 'chip chip-on';
        activeFilter = c.dataset.filter;
        render();
      });
    });
    document.querySelectorAll('[data-e]').forEach((btn) => btn.addEventListener('click', () => fireEvent(btn.dataset.e)));
  }

  let doSave = null; // set below to avoid forward decl ordering
  doSave = function () {
    const id = ELS.modal.dataset.ptid;
    if (!id) return;
    const v = collectFields();
    if (id === 'googleSearchConsole') {
      if (!v.site) v.site = 'https://bazar-dzair.github.io/';
      if (!v.verifyMethod) v.verifyMethod = 'meta';
    }
    const r = M.save(id, v);
    if (r.ok) { flash('✓ تم الحفظ وتطبيقه', ''); render(); }
    else flash('✗ ' + (r.message || 'فشل الحفظ'), 'err');
  };

  // ----------------------------------------------------------------- init
  function init() {
    // populate app-level defaults then re-apply injection state from storage.
    M.initialize();
    bindGlobalClick();
    bindUi();
    render();
    fireEvent('page_view');
  }
  init();
})();