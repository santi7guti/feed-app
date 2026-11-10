// ==UserScript==
// @name         Soundeo Feed
// @namespace    soundeo-feed
// @version      2.0.0
// @description  Cargador de Soundeo Feed: abre la app y la mantiene actualizada.
// @match        https://soundeo.com/*
// @match        https://www.soundeo.com/*
// @run-at       document-end
// @inject-into  auto
// @noframes
// ==/UserScript==

// Este archivo se instala una sola vez. La app en sí se descarga de SRC, se guarda en el
// iPhone y se comprueba si hay versión nueva cada vez que abres Soundeo.
(function () {
  'use strict';
  if (window.top !== window.self || window.__SX_LOADER__) return;

  var SRC = 'https://raw.githubusercontent.com/santi7guti/feed-app/main/soundeo-feed.app.js';
  var LOADER_VERSION = '1';
  var K_CODE = 'sxfeed:app:code';
  var K_AT = 'sxfeed:app:checkedAt';
  var CHECK_EVERY_MS = 3 * 60 * 1000;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function versionOf(code) { var m = /const VERSION = '([^']+)'/.exec(code || ''); return m ? m[1] : '?'; }
  function looksValid(code) {
    return typeof code === 'string' && code.length > 20000 && code.indexOf('__SX_FEED__') > 0 && /const VERSION = '/.test(code);
  }
  function notice(msg) {
    try {
      var d = document.createElement('div');
      d.textContent = 'Soundeo Feed: ' + msg;
      d.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:2147483647;background:#111;color:#fff;font:600 14px/1.35 -apple-system,sans-serif;padding:12px 14px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.4)';
      d.addEventListener('click', function () { d.remove(); });
      (document.body || document.documentElement).appendChild(d);
      setTimeout(function () { d.remove(); }, 9000);
    } catch (e) {}
  }
  function run(code) {
    if (window.__SX_FEED__ === true) {
      notice('tienes también instalada la versión antigua. Borra el archivo viejo de la carpeta de Userscripts o desactívalo.');
      return false;
    }
    try {
      (0, eval)(code + '\n//# sourceURL=soundeo-feed.app.js');
      return true;
    } catch (e) {
      notice('no se ha podido arrancar la app (' + (e && e.message) + ').');
      return false;
    }
  }
  function fetchLatest() {
    return fetch(SRC + (SRC.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(), { cache: 'no-store', credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (code) { if (!looksValid(code)) throw new Error('respuesta no válida'); return code; });
  }

  var api = (window.__SX_LOADER__ = {
    version: LOADER_VERSION,
    source: SRC,
    running: null,
    // Descarga la última versión; si es distinta de la guardada, queda lista para la próxima recarga.
    check: function () {
      return fetchLatest().then(function (code) {
        set(K_AT, String(Date.now()));
        var v = versionOf(code);
        if (code !== get(K_CODE)) { set(K_CODE, code); return { updated: true, version: v }; }
        return { updated: false, version: v };
      });
    },
  });

  var cached = get(K_CODE);
  if (looksValid(cached)) {
    api.running = versionOf(cached);
    run(cached);
    var last = parseInt(get(K_AT) || '0', 10) || 0;
    if (Date.now() - last > CHECK_EVERY_MS) {
      api.check().then(function (res) {
        if (res.updated) { try { window.dispatchEvent(new CustomEvent('sxfeed:update', { detail: res })); } catch (e) {} }
      }).catch(function () {});
    }
  } else {
    fetchLatest().then(function (code) {
      set(K_CODE, code);
      set(K_AT, String(Date.now()));
      api.running = versionOf(code);
      run(code);
    }).catch(function (e) {
      notice('no se ha podido descargar la app (' + (e && e.message) + '). Recarga la página para reintentar.');
    });
  }
})();
