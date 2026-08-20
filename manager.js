/**
 * Integration Manager (core engine)
 * -------------------------------------------------
 * A central registry that owns every integration plugin independently.
 * Each plugin exposes: config, enabled, save, load, validate, initialize,
 * and optionally test + handleEvent. A failure in one plugin never breaks
 * the others (everything is isolated in try/catch).
 *
 * Responsibilities:
 *  - Store settings + enabled state in localStorage (real persistence).
 *  - Route real store events to ENABLED plugins only.
 *  - Genuinely inject / remove tracking code with a de-duplication guard.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'bazaar.integrations.settings.v1';
  const MANAGER = window.IntegrationManager = {};
  const registry = (MANAGER.registry = {});

  // ---------------------------------------------------------------------------
  // PERSISTENCE
  // ---------------------------------------------------------------------------
  let _state = { enabled: {}, config: {} };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      _state = raw ? JSON.parse(raw) : { enabled: {}, config: {} };
    } catch (e) {
      _state = { enabled: {}, config: {} };
    }
    if (!_state.enabled) _state.enabled = {};
    if (!_state.config) _state.config = {};
    return _state;
  }

  function persistState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_state)); } catch (e) { /* storage unavailable */ }
  }

  loadState();
  MANAGER.getState = () => _state;
  MANAGER.isEnabled = (id) => !!_state.enabled[id];
  MANAGER.storageKey = STORAGE_KEY;

  // ---------------------------------------------------------------------------
  // REGISTRY
  // ---------------------------------------------------------------------------
  MANAGER.register = function (plugin, fields) {
    if (registry[plugin.id]) return registry[plugin.id];
    if (fields !== undefined) plugin.fields = fields; // explicit arg wins; else keep plugin.fields
    plugin.fields = plugin.fields || [];
    plugin.validate = plugin.validate || function () { return { ok: true }; };
    plugin.initialize = plugin.initialize || function () {};
    plugin.test = plugin.test || function () {
      return { ok: true, message: 'No automated test - verify manually.' };
    };
    plugin.handleEvent = plugin.handleEvent || function () { return false; };
    plugin.inject = plugin.inject || function () {};
    registry[plugin.id] = plugin;
    // Seed enabled flag from the plugin's declared default unless it was
    // already explicitly saved by the user (so defaults survive a reload
    // but are still fully user-controllable).
    const st = loadState();
    if (!(plugin.id in st.enabled)) st.enabled[plugin.id] = !!plugin.enabled;
    persistState(); _state = st;
    return plugin;
  };

  MANAGER.ids = () => Object.keys(registry);

  MANAGER.getConfig = (id) => (loadState().config[id] || {});
  MANAGER.get = MANAGER.getConfig; // alias
  MANAGER.isEnabled = (id) => !!loadState().enabled[id];

  // Merge persisted values into defaults (defaults kept in plugin.values).
  MANAGER.values = function (id) {
    const plugin = registry[id];
    if (!plugin) return {};
    const base = {};
    (plugin.fields || []).forEach((f) => { base[f.key] = f.default !== undefined ? f.default : ''; });
    return Object.assign(base, loadState().config[id] || {});
  };

  // ---------------------------------------------------------------------------
  // SAVE
  // ---------------------------------------------------------------------------
  MANAGER.save = function (id, values) {
    const plugin = registry[id];
    if (!plugin) return { ok: false, message: 'Unknown plugin' };
    // Validate with the new values first.
    const merged = (function () {
      const base = {};
      (plugin.fields || []).forEach((f) => { base[f.key] = base[f.key] !== undefined ? base[f.key] : (f.default || ''); });
      return Object.assign(base, values);
    })();
    const check = plugin.validate(merged);
    if (check.ok === false) return { ok: false, message: check.message || 'Invalid settings' };

    const state = loadState();
    state.config[id] = merged;
    persistState(); _state = state;
    applyPlugin(id); // live-apply (inject/remove)
    return { ok: true, values: merged };
  };

  // ---------------------------------------------------------------------------
  // ENABLE / DISABLE
  // ---------------------------------------------------------------------------
  MANAGER.setEnabled = function (id, on) {
    const state = loadState();
    state.enabled[id] = !!on;
    persistState(); _state = state;
    applyPlugin(id);
    return { ok: true };
  };

  // When started from the published bazar-dzair (window.BAZAAR_INTEGRATIONS),
  // adopt those stored values so the SAME state carries to the live site.
  function adoptBootstrap() {
    const boot = window.BAZAAR_INTEGRATIONS;
    if (!boot || !boot.enabled) return;
    const state = loadState();
    Object.keys(boot.enabled || {}).forEach((id) => { if (boot.enabled[id]) state.enabled[id] = true; });
    Object.keys(boot.config || {}).forEach((id) => { state.config[id] = Object.assign(state.config[id] || {}, boot.config[id]); });
    persistState(); _state = state;
  }

  // ---------------------------------------------------------------------------
  // INJECTION ENGINE (with de-duplication)
  // ---------------------------------------------------------------------------
  // Every plugin's injected HTML is wrapped in sentinel comments so we can
  // find and replace it without ever producing duplicates.
  const MARK = (id) => `<!-- bazaar-integration:${id} -->`;
  const CMARK = (id) => `<!-- /bazaar-integration:${id} -->`;

  function headNode() { return document.head || document.querySelector('head'); }

  function stripInjected(id) {
    const node = headNode();
    if (!node) return;
    Array.from(node.querySelectorAll('[data-bazar="' + id + '"]')).forEach((n) => n.remove());
  }
  function escapeRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function applyPlugin(id) {
    const plugin = registry[id];
    if (!plugin) return;
    const state = loadState();
    const enabled = state.enabled[id] === true;
    const cfg = state.config[id] || {};

    // Disabled => remove any injected code and never load the snippet.
    if (!enabled) { stripInjected(id); return; }

    // Validate before injecting; an invalid plugin is silently skipped.
    const check = plugin.validate(cfg);
    if (check && check.ok === false) { stripInjected(id); return; }

    // Initialize is intentionally isolated.
    try { plugin.initialize(cfg); } catch (e) { console.error('[' + id + '] init:', e); }

    // Inject / refresh with dedup.
    if (typeof plugin.inject === 'function') {
      try { plugin.inject(cfg); } catch (e) { console.error('[' + id + '] inject:', e); }
    }
  }

  MANAGER.applyPlugin = applyPlugin;
  MANAGER.stripInjected = stripInjected;

  // Rewrite the whole <head> to match enabled state (used on initialize).
  MANAGER.initialize = function () {
    Object.keys(registry).forEach(applyPlugin);
  };

  // -------------------------------------------------------------------------
  // UNIFIED EVENT ENGINE
  // -------------------------------------------------------------
  const EVENT_TYPES = ['page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'];
  MANAGER.EVENT_TYPES = EVENT_TYPES;

  MANAGER.emit = function (type, payload) {
    payload = payload || {};
    const results = [];
    Object.keys(registry).forEach((id) => {
      const p = registry[id];
      const state = loadState();
      if (!state.enabled[id]) return; // OFF plugin gets nothing.
      const cfg = state.config[id] || {};
      if (typeof p.handleEvent !== 'function') return;
      try {
        const r = p.handleEvent({ name: type, payload, config: cfg });
        results.push({ id, status: r ? 'sent' : 'ignored', detail: r || null });
      } catch (e) {
        results.push({ id, status: 'error', detail: String(e && e.message ? e.message : e) });
      }
    });
    const bubble = typeof window.__onEventEmit === 'function' ? window.__onEventEmit : null;
    if (bubble) { try { bubble(type, payload, results); } catch (e) {} }
    return { event: type, payload, plugins: results };
  };

  // -------------------------------------------------------------------------
  // TEST
  // -------------------------------------------------------------------------
  MANAGER.test = function (id) {
    const p = registry[id];
    if (!p) return { ok: false, message: 'Plugin not found' };
    const cfg = loadState().config[id] || {};
    try { return p.test(cfg) || { ok: false, message: 'No result' }; }
    catch (e) { return { ok: false, message: (e && e.message) || String(e) }; }
  };

  // -------------------------------------------------------------------------
  // INSTALL SNIPPET for the live bazar-dzair.github.io site
  // -------------------------------------------------------------------------
  MANAGER.buildInstallSnippet = function () {
    const state = loadState();
    const enabled = {};
    const config = {};
    Object.keys(state.enabled || {}).forEach((id) => { if (state.enabled[id]) enabled[id] = true; });
    Object.keys(state.config || {}).forEach((id) => { config[id] = state.config[id]; });
    const data = JSON.stringify({ enabled, config }).replace(/</g, '\\u003c');
    const files = [
      '/js/manager.js',
      '/js/plugins.js'
    ];
    const importLine = files.map((f) => `<script src="${f}"></script>`).join('\n');
    return [
      '<!-- ===== Bazaar Integrations (paste once inside <head>) ===== -->',
      '<script id="bazaar-integrations-state">window.BAZAAR_INTEGRATIONS = ' + data + ';</script>',
      importLine,
      '<script>window.addEventListener("DOMContentLoaded", function(){ if(window.IntegrationManager) window.IntegrationManager.initialize(); if(window.BAZAAR==null)window.BAZAAR={}; if(window.BAZAAR.emit==null) window.BAZAAR={emit:function(t,d){return window.IntegrationManager.emit(t,d)}};});</script>',
      '<!-- ========================= end ================================= -->'
    ].join('\n');
  };

})();