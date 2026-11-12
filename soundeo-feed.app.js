// Soundeo Feed — la app. La carga el cargador (soundeo-feed.user.js) desde GitHub.
// Para publicar una versión nueva: subir este archivo a main con VERSION actualizada.

(function () {
  'use strict';
  if (window.top !== window.self || window.__SX_FEED__) return;
  window.__SX_FEED__ = 'app';

  const VERSION = '1.4.0';

  /* ───────────────────────── utilidades ───────────────────────── */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = (s) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return m + ':' + String(r).padStart(2, '0');
  };

  function mkStore(getArea) {
    let area = null;
    try { area = getArea(); } catch (e) { area = null; }
    return {
      get(k, d) {
        try { const v = area && area.getItem('sxfeed:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
      },
      set(k, v) { try { area && area.setItem('sxfeed:' + k, JSON.stringify(v)); } catch (e) {} },
      del(k) { try { area && area.removeItem('sxfeed:' + k); } catch (e) {} },
    };
  }
  const LS = mkStore(() => window.localStorage);
  const SS = mkStore(() => window.sessionStorage);

  /* ───────────────────────── ajustes ───────────────────────── */
  const DEFAULT_FILTERS = {
    genres: ['12', '81', '5', '14', '11', '86'],
    bpmMin: 127,
    bpmMax: 140,
    time: '0',
    keys: [],
    available: '1',
    trackType: '0',
    search: '',
  };
  const DEFAULT_PREFS = {
    autoNext: true,
    skipHeard: true,
    siteHeard: true,
    listFilter: 'all',
    forceStart: true,
    confirmDownload: true,
    startView: 'feed',
    autoOpen: true,
    preload: true,
    startSection: 'avail',
    immersive: false,
  };
  let defFilters = Object.assign({}, DEFAULT_FILTERS, LS.get('filters', {}));
  let prefs = Object.assign({}, DEFAULT_PREFS, LS.get('prefs', {}));
  const savePrefs = () => LS.set('prefs', prefs);
  // antes "incluir no disponibles" era un filtro; ahora es la sección «Todos los tracks»
  if (!LS.get('prefs', {}).startSection && String(defFilters.available) === '0') prefs.startSection = 'all';

  const FALLBACK_GENRES = [
    ['95', '140 / Deep Dubstep / Grime'], ['102', 'African'], ['89', 'Afro House'], ['98', 'Amapiano'],
    ['100', 'Ambient / Experimental'], ['85', 'Bass / Club'], ['91', 'Bass House'], ['79', 'Big Room'],
    ['101', 'Brazilian Funk'], ['9', 'Breaks / Breakbeat / UK Bass'], ['103', 'Caribbean'], ['104', 'Country'],
    ['39', 'Dance / Pop'], ['12', 'Deep House'], ['16', 'DJ Tools'], ['63', 'Downtempo'], ['1', 'Drum & Bass'],
    ['18', 'Dubstep'], ['94', 'Electro (Classic / Detroit / Modern)'], ['17', 'Electro House'], ['3', 'Electronica'],
    ['40', 'Funk / Soul / Disco'], ['81', 'Funky House'], ['65', 'Future House'], ['49', 'Glitch Hop'],
    ['8', 'Hard Dance / Hardcore'], ['2', 'Hard Techno'], ['105', 'Hip-Hop'], ['5', 'House'], ['37', 'Indie Dance'],
    ['112', 'Indie Tech'], ['97', 'Jackin House'], ['106', 'Latin'], ['111', 'Latin Electronic'],
    ['80', 'Leftfield House & Techno'], ['90', 'Melodic House & Techno'], ['14', 'Minimal / Deep Tech'],
    ['50', 'Nu Disco / Disco'], ['93', 'Organic House'], ['107', 'Pop'], ['15', 'Progressive House'],
    ['13', 'Psy-Trance'], ['108', 'R&B'], ['41', 'Reggae / Dancehall / Dub'], ['109', 'Rock'], ['11', 'Tech House'],
    ['6', 'Techno (Peak Time / Driving)'], ['92', 'Techno (Raw / Deep / Hypnotic)'], ['7', 'Trance'],
    ['99', 'Trance (Raw / Deep / Hypnotic)'], ['87', 'Trap / Future Bass'], ['38', 'Trap / Wave'],
    ['86', 'UK Garage / Bassline'],
  ];
  const TIME_OPTS = [['0', 'Todo'], ['3', '3 días'], ['7', '1 semana'], ['30', '1 mes'], ['90', '3 meses'], ['365', '1 año']];

  function genreOptions() {
    const sel = $('select[name="genreFilter"]');
    if (sel && sel.options.length) return Array.from(sel.options).map((o) => ({ id: o.value, name: clean(o.textContent) }));
    return FALLBACK_GENRES.map(([id, name]) => ({ id, name }));
  }
  function keyOptions() {
    const sel = $('select[name="keyFilter"]');
    let list = sel && sel.options.length ? Array.from(sel.options).map((o) => clean(o.value || o.textContent)) : null;
    if (!list) {
      list = [];
      ['C', 'C♯', 'D♭', 'D', 'D♯', 'E♭', 'E', 'F', 'F♯', 'G♭', 'G', 'G♯', 'A♭', 'A', 'A♯', 'B♭', 'B'].forEach((n) => {
        list.push(n + 'maj', n + 'min');
      });
    }
    return list
      .map((k) => ({ id: k, cam: camelot(k) }))
      .sort((a, b) => camSort(a.cam) - camSort(b.cam));
  }
  function genreName(id) {
    const g = genreOptions().find((x) => x.id === String(id));
    return g ? g.name : id;
  }

  /* ───────────────────────── tonalidad → Camelot ───────────────────────── */
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function parseKey(txt) {
    const m = clean(txt).match(/^([A-G])\s*([♭♯#b]?)\s*(maj(?:or)?|min(?:or)?|m)?$/i);
    if (!m) return null;
    let pc = PC[m[1].toUpperCase()];
    if (m[2] === '#' || m[2] === '♯') pc += 1;
    if (m[2] === 'b' || m[2] === '♭') pc -= 1;
    pc = (pc + 12) % 12;
    const minor = /^m(in)?/i.test(m[3] || '') && !/^maj/i.test(m[3] || '');
    const acc = m[2] === '#' ? '♯' : m[2] === 'b' ? '♭' : m[2];
    return { pc, minor, label: m[1].toUpperCase() + acc + (minor ? 'min' : 'maj') };
  }
  function camelot(txt) {
    const k = typeof txt === 'string' ? parseKey(txt) : txt;
    if (!k) return '';
    let n = (7 * k.pc + (k.minor ? 5 : 8)) % 12;
    if (n === 0) n = 12;
    return n + (k.minor ? 'A' : 'B');
  }
  const camSort = (c) => (parseInt(c, 10) || 99) * 2 + (/B$/.test(c) ? 1 : 0);

  /* ───────────────────────── URL / filtros ───────────────────────── */
  function filtersFromUrl(href) {
    const q = new URL(href || location.href, location.href).searchParams;
    const bpm = (q.get('bpmFilter') || '').split(',').filter(Boolean).map(Number);
    return {
      genres: (q.get('genreFilter') || '').split(',').filter(Boolean),
      bpmMin: bpm.length ? bpm[0] : null,
      bpmMax: bpm.length > 1 ? bpm[1] : null,
      time: q.get('timeFilter') || '0',
      keys: (q.get('keyFilter') || '').split(',').filter(Boolean),
      available: q.get('availableFilter') == null ? '1' : q.get('availableFilter'),
      trackType: q.get('trackTypeFilter') || '0',
      search: q.get('searchFilter') || '',
      artist: q.get('artistFilter') || '',
      label: q.get('labelFilter') || '',
    };
  }
  const bpmParam = (f) => (f.bpmMin != null || f.bpmMax != null ? (f.bpmMin != null ? f.bpmMin : 0) + ',' + (f.bpmMax != null ? f.bpmMax : 260) : '');
  function buildListUrl(f) {
    const p = new URLSearchParams();
    p.set('availableFilter', f.available == null ? '1' : String(f.available));
    p.set('artistFilter', f.artist || '');
    p.set('labelFilter', f.label || '');
    p.set('genreFilter', (f.genres || []).join(','));
    p.set('timeFilter', f.time || '0');
    p.set('bpmFilter', bpmParam(f));
    p.set('keyFilter', (f.keys || []).join(','));
    p.set('modeFilter', '1');
    p.set('trackTypeFilter', f.trackType || '0');
    p.set('searchFilter', f.search || '');
    return location.origin + '/list/tracks?' + p.toString();
  }

  /* ───────────────────────── secciones y fuentes ───────────────────────── */
  // Las secciones son el menú de la web de Soundeo. `loose`: páginas que no son /list (puede que no
  // hagan caso a los filtros por URL; en ese caso el género se filtra aquí).
  const SECTIONS = [
    { key: 'avail', name: 'Descargas disponibles', hint: 'Lo que ya se puede descargar', icon: 'dl', path: '/list/tracks', available: '1', filters: true, hide: true },
    { key: 'all', name: 'Todos los tracks', hint: 'Incluye los que aún hay que votar', icon: 'feed', path: '/list/tracks', available: '0', filters: true, hide: true },
    { key: 'upcoming', name: 'Próximos lanzamientos', hint: 'Upcoming tracks', icon: 'clock', path: '/upcoming', filters: true, loose: true, hide: true },
    { key: 'top100', name: 'Top 100 descargas', hint: 'Lo más descargado', icon: 'up', path: '/top100', filters: true, loose: true },
    { key: 'followed', name: 'Seguidos', hint: 'Todo lo nuevo de los artistas y sellos que sigues, sin filtros', icon: 'user', path: '/account/followed', nofilter: true },
    { key: 'favs', name: 'Mis favoritos', hint: '', icon: 'star', path: '/account/favorites' },
    { key: 'downloads', name: 'Mis descargas', hint: '', icon: 'check', path: '/account/downloads' },
  ];
  const sectionByKey = (k) => SECTIONS.find((s) => s.key === k) || SECTIONS[0];
  function sectionUrl(sec, f) {
    f = f || {};
    if (sec.path === '/list/tracks') return buildListUrl(Object.assign({}, f, { available: sec.available, artist: '', label: '', search: f.search || '' }));
    // Soundeo recuerda los últimos filtros usados y los aplica también aquí: se le piden vacíos a propósito
    // (sin tocar artistFilter/labelFilter, que en esta página son los seguidos). Las demás listas mandan los suyos.
    if (sec.nofilter) return location.origin + sec.path + '?availableFilter=0&genreFilter=&timeFilter=0&bpmFilter=&keyFilter=&modeFilter=1&trackTypeFilter=0&searchFilter=';
    if (!sec.filters) return location.origin + sec.path;
    const p = new URLSearchParams();
    if (f.genres && f.genres.length) p.set('genreFilter', f.genres.join(','));
    if (bpmParam(f)) p.set('bpmFilter', bpmParam(f));
    if (f.keys && f.keys.length) p.set('keyFilter', f.keys.join(','));
    if (f.time && String(f.time) !== '0') p.set('timeFilter', String(f.time));
    const qs = p.toString();
    return location.origin + sec.path + (qs ? '?' + qs : '');
  }
  const cleanFilters = (f) => ({
    genres: (f.genres || []).map(String), bpmMin: f.bpmMin == null ? null : +f.bpmMin, bpmMax: f.bpmMax == null ? null : +f.bpmMax,
    time: String(f.time || '0'), keys: (f.keys || []).slice(), available: f.available == null ? '1' : String(f.available),
    trackType: String(f.trackType || '0'), search: f.search || '', artist: '', label: '',
  });
  // Descripción de una fuente: lo mínimo para poder (re)cargarla.
  function sectionDesc(key, f) {
    const sec = sectionByKey(key);
    const filters = sec.filters ? cleanFilters(Object.assign({}, f || defFilters, sec.available != null ? { available: sec.available } : {})) : null;
    return { kind: 'section', key: sec.key, title: sec.name, url: sectionUrl(sec, filters), filters, canFilter: !!sec.filters, hide: !!sec.hide, loose: !!sec.loose };
  }
  const artistDesc = (id, name) => ({ kind: 'artist', title: name || 'Artista', refId: String(id), url: buildListUrl({ available: '0', artist: String(id), genres: [], time: '0' }) });
  const labelDesc = (id, name) => ({ kind: 'label', title: name || 'Sello', refId: String(id), url: buildListUrl({ available: '0', label: String(id), genres: [], time: '0' }) });
  const releaseDesc = (url, name) => ({ kind: 'release', title: name || 'Release', url });
  const searchDesc = (q) => ({ kind: 'search', title: '“' + q + '”', query: q, url: location.origin + '/search?q=' + encodeURIComponent(q) });
  const genreDesc = (id, name) => {
    const filters = cleanFilters({ genres: [String(id)], available: '1' });
    return { kind: 'genre', key: null, title: name || genreName(id), url: buildListUrl(filters), filters, canFilter: true, hide: true };
  };
  // ¿Qué es esta URL de Soundeo? (para la página en la que arranca la app)
  function describeUrl(href) {
    let u;
    try { u = new URL(href, location.href); } catch (e) { return null; }
    const url = u.href.split('#')[0];
    const p = u.pathname;
    if (/^\/list\/(tracks|releases)/.test(p)) {
      const f = filtersFromUrl(url);
      if (f.artist) return Object.assign(artistDesc(f.artist), { url });
      if (f.label) return Object.assign(labelDesc(f.label), { url });
      const key = String(f.available) === '0' ? 'all' : 'avail';
      return { kind: 'section', key, title: sectionByKey(key).name, url, filters: cleanFilters(f), canFilter: true, hide: true };
    }
    if (/^\/release\//.test(p)) return releaseDesc(url);
    if (/^\/search/.test(p)) return Object.assign(searchDesc(u.searchParams.get('q') || ''), { url });
    const sec = SECTIONS.find((s) => s.path !== '/list/tracks' && p.indexOf(s.path) === 0 && !/\/edit/.test(p));
    if (sec) return Object.assign(sectionDesc(sec.key, sec.filters ? filtersFromUrl(url) : null), { url });
    return { kind: 'page', title: clean(document.title.replace(/»?\s*Soundeo\s*$/i, '')) || 'Soundeo', url };
  }
  const normFilters = (x) => JSON.stringify({
    g: (x.genres || []).map(String).sort(), a: x.bpmMin == null ? null : +x.bpmMin, z: x.bpmMax == null ? null : +x.bpmMax,
    t: String(x.time || '0'), k: (x.keys || []).slice().sort(), av: String(x.available == null ? '1' : x.available),
    tt: String(x.trackType || '0'), s: x.search || '', l: x.label || '', ar: x.artist || '',
  });
  // La app arranca siempre desde una lista normal (disponibles o todos) con los filtros de inicio.
  const startListKey = () => (prefs.startSection === 'all' ? 'all' : 'avail');
  const startUrl = () => sectionUrl(sectionByKey(startListKey()), defFilters);
  function sameAsStart() {
    if (!/^\/list\/tracks/.test(location.pathname)) return false;
    return normFilters(filtersFromUrl()) === normFilters(Object.assign({}, defFilters, { available: sectionByKey(startListKey()).available, artist: '', label: '', search: '' }));
  }
  function describeFilters(f) {
    if (!f) return '';
    const parts = [];
    if (f.genres && f.genres.length) parts.push(f.genres.length === 1 ? genreName(f.genres[0]) : f.genres.length + ' géneros');
    else parts.push('Todos los géneros');
    if (f.bpmMin != null || f.bpmMax != null) parts.push((f.bpmMin != null ? f.bpmMin : 0) + '–' + (f.bpmMax != null ? f.bpmMax : 260) + ' BPM');
    const t = TIME_OPTS.find((x) => x[0] === String(f.time));
    if (t && t[0] !== '0') parts.push(t[1]);
    if (f.keys && f.keys.length) parts.push(f.keys.length + (f.keys.length === 1 ? ' tono' : ' tonos'));
    if (f.search) parts.push('“' + f.search + '”');
    return parts.join(' · ');
  }
  function pageNumber() {
    const n = parseInt(new URL(location.href).searchParams.get('page') || '1', 10);
    return isFinite(n) && n > 0 ? n : 1;
  }
  function parseHash() {
    const h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    return { view: h.get('sx'), id: h.get('id') };
  }
  const isMobile = () => {
    try { return matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 820; } catch (e) { return false; }
  };
  const isLoggedIn = () => !!$('#top-menu-logout, a[href*="/account/logout"]');
  // Solo se da por «sin sesión» si además se ve por dónde entrar (para no avisar en falso si Soundeo cambia su cabecera).
  const looksLoggedOut = () => !isLoggedIn() && !!$('#top-menu-login, a[href*="/account/logon"], a[href*="/account/login"], a[href*="/login"], a[href*="/account/register"], form[action*="logon"], form[action*="login"], input[type="password"]');
  // Aviso sobre la web normal (cuando la app no está abierta).
  function pageNotice(msg, ms, top) {
    try {
      const d = document.createElement('div');
      d.className = 'sx-notice';
      d.textContent = 'Soundeo Feed: ' + msg;
      d.style.cssText = 'position:fixed;left:10px;right:10px;' + (top ? 'top:8px' : 'bottom:calc(env(safe-area-inset-bottom,0px) + 14px)') + ';z-index:2147483647;background:#111;color:#fff;font:600 14px/1.35 -apple-system,sans-serif;padding:12px 14px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.4);text-align:center';
      d.addEventListener('click', () => d.remove());
      (document.body || document.documentElement).appendChild(d);
      setTimeout(() => d.remove(), ms || 9000);
    } catch (e) {}
  }

  /* ───────────────────────── portadas ───────────────────────── */
  const COVER_RE = /-(\d{2,4})(\.(?:jpe?g|png|webp))(\?.*)?$/i;
  const COVER_MAX = 600; // más grande pesa demasiado en el móvil (Soundeo tiene hasta 1400 px)
  let coverSize = LS.get('coverSize', null);
  if (coverSize && +coverSize > COVER_MAX) { coverSize = null; LS.del('coverSize'); }
  function coverAt(url, size) {
    if (!url || !COVER_RE.test(url)) return url || '';
    return url.replace(COVER_RE, '-' + size + '$2$3');
  }
  const bigCover = (url) => coverAt(url, coverSize || '110');
  function imgOk(u) {
    return new Promise((res) => {
      const i = new Image();
      const to = setTimeout(() => res(false), 7000);
      i.onload = () => { clearTimeout(to); res(i.naturalWidth > 60); };
      i.onerror = () => { clearTimeout(to); res(false); };
      i.src = u;
    });
  }
  async function probeCoverSize(sample) {
    if (coverSize || !sample || !COVER_RE.test(sample)) return;
    for (const s of ['500', '400', '300', '250', '200', '150', '110']) {
      if (await imgOk(coverAt(sample, s))) {
        coverSize = s;
        LS.set('coverSize', s);
        refreshCovers();
        return;
      }
    }
  }

  /* ───────────────────────── tracks ───────────────────────── */
  const MONTHS_EN = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
  const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const dayCache = new Map();
  function parseDay(txt) {
    if (dayCache.has(txt)) return dayCache.get(txt);
    const m = clean(txt).match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    const d = m && MONTHS_EN[m[2].toLowerCase()] != null ? new Date(+m[3], MONTHS_EN[m[2].toLowerCase()], +m[1]) : null;
    dayCache.set(txt, d);
    return d;
  }
  // { big: 'Hoy', sub: 'Martes, 10 de noviembre', short: '10 nov' }
  function dayParts(dayTxt) {
    const d = parseDay(dayTxt);
    if (!d) return { big: clean(dayTxt) || 'Tracks', sub: '', short: clean(dayTxt) };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - d) / 86400000);
    const short = d.getDate() + ' ' + MONTHS_ES[d.getMonth()] + (d.getFullYear() !== today.getFullYear() ? ' ' + d.getFullYear() : '');
    let sub = '';
    try { sub = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { sub = short; }
    sub = sub.charAt(0).toUpperCase() + sub.slice(1);
    return { big: diff === 0 ? 'Hoy' : diff === 1 ? 'Ayer' : short, sub, short };
  }
  const dayShort = (txt) => { const p = dayParts(txt); return parseDay(txt) ? (p.big === 'Hoy' || p.big === 'Ayer' ? p.big : p.short) : p.short; };
  function splitTitle(full) {
    let artist = '';
    let rest = full;
    const i = full.indexOf(' - ');
    if (i > 0) { artist = full.slice(0, i); rest = full.slice(i + 3); }
    let name = rest;
    let mix = '';
    const m = rest.match(/^(.*\S)\s*\(([^()]+)\)\s*$/);
    if (m) { name = m[1]; mix = m[2]; }
    return { artist, name, mix };
  }
  const absUrl = (v, base) => { if (!v) return ''; try { return new URL(v, base || location.href).href; } catch (e) { return v; } };
  const absHref = (a, base) => (a ? absUrl(a.getAttribute('href'), base) : '');
  const paramOf = (url, name) => { try { return new URL(url, location.href).searchParams.get(name) || ''; } catch (e) { return ''; } };
  // Botón de voto de Soundeo: <div class="vote"><button class="ico"></button><span class="number">3 | </span><span class="link">Vote</span></div>
  const voteShapes = new Map(); // formas distintas que se han visto (para el diagnóstico)
  // ¿Se ha visto alguna vez en la página un voto ya dado? Entonces la página manda sobre lo que recuerda la app.
  let voteDetect = LS.get('voteDetect', false);
  function readVote(vEl) {
    const numEl = $('.number', vEl);
    const m = clean(numEl ? numEl.textContent : vEl.textContent).match(/\d+/);
    const link = clean(($('.link', vEl) || {}).textContent || '');
    const cls = clean([vEl].concat($$('*', vEl)).map((x) => x.getAttribute('class') || '').join(' '));
    const on = /(^|\s)(voted|unvote|active|selected|checked|on)(\s|$)/i.test(cls) || /voted|unvote|remove|cancel/i.test(link);
    if (on && !voteDetect) { voteDetect = true; LS.set('voteDetect', true); }
    const sig = cls + '|' + link;
    if (!voteShapes.has(sig) && voteShapes.size < 4) voteShapes.set(sig, vEl.outerHTML.replace(/\s+/g, ' ').slice(0, 260));
    return { n: m ? +m[0] : null, on };
  }
  function parseItem(node, day, folder, base, forcedId) {
    const id = forcedId || node.getAttribute('data-track-id');
    const titleA = $('.info strong a', node) || $('a[href*="/track/"]', node) || $('.info a', node);
    const full = clean(titleA && titleA.textContent);
    const parts = splitTitle(full);
    const img = $('img.cover', node) || $('img', node);
    const span = $('.info span', node) || node;
    const links = $$('a[href]', span);
    const relA = links.find((a) => /\/release\//.test(a.getAttribute('href')));
    const labelA = links.find((a) => /[?&]labelFilter=\d/.test(a.getAttribute('href')));
    const genreA = links.find((a) => /[?&]genreFilter=\d/.test(a.getAttribute('href')));
    const dateM = span.textContent.match(/\d{4}-\d{2}-\d{2}/);
    const btn = $('button.action[data-track-url]', node) || $('[data-track-url]', node);
    const dlWrap = $('.download', node);
    const time = $('.info time', node) || $('time', node);
    const vEl = $('.vote', node);
    const vInfo = vEl ? readVote(vEl) : null;
    return {
      id,
      full,
      artist: parts.artist,
      name: parts.name || full,
      mix: parts.mix,
      trackUrl: absHref(titleA, base),
      cover: absUrl(img && img.getAttribute('src'), base),
      preview: btn ? btn.getAttribute('data-track-url') : '',
      duration: clean(time && time.textContent),
      release: clean(relA && relA.textContent),
      releaseUrl: absHref(relA, base),
      label: clean(labelA && labelA.textContent),
      labelId: labelA ? paramOf(absHref(labelA, base), 'labelFilter') : '',
      genre: clean(genreA && genreA.textContent) || folder,
      genreId: genreA ? paramOf(absHref(genreA, base), 'genreFilter') : '',
      date: dateM ? dateM[0] : '',
      day,
      explicit: !!$('.explicit', node),
      downloads: $$('a.track-download-lnk', node).map((a) => ({
        fmt: a.getAttribute('data-track-format'),
        name: clean(a.children[0] && a.children[0].textContent) || 'Archivo',
        size: clean(a.children[1] && a.children[1].textContent),
      })),
      siteDownloaded: !!(dlWrap && dlWrap.className.replace(/\bdownload\b/, '').trim()),
      siteHeard: !!$('.vis.listened', node),
      fav: !!$('button.favorites.favored', node),
      vote: !!vEl,
      votes: vInfo ? vInfo.n : null,
      voted: vInfo ? vInfo.on : false,
    };
  }
  // Tracks de una página de Soundeo (la que está abierta o una traída por fetch).
  function parseTracks(root, startDay, base) {
    const left = (root && ($('.content .left', root) || $('.content', root) || root.body)) || root || $('.content .left') || document.body;
    let day = startDay || '';
    let folder = '';
    const out = [];
    const seen = new Set();
    const add = (t) => { if (t.id && !seen.has(t.id) && (t.full || t.preview)) { seen.add(t.id); out.push(t); } };
    $$('h1, .folder > h2, .trackitem[data-track-id]', left).forEach((n) => {
      if (n.tagName === 'H1') {
        // los h1 con fecha separan los días; "h1.line" es el título de la página (artista, release…)
        const tx = clean(n.textContent);
        if (parseDay(tx)) day = tx;
        else if (!n.classList.contains('line')) day = tx;
        return;
      }
      if (n.tagName === 'H2') { folder = clean(n.textContent); return; }
      add(parseItem(n, day, folder, base));
    });
    if (!out.length) {
      // páginas con otro marcado: cualquier bloque con botón de preview y enlace al track
      $$('[data-track-url]', left).forEach((btn) => {
        let box = btn.parentElement;
        while (box && box !== left && !$('a[href*="/track/"]', box)) box = box.parentElement;
        if (!box || box === left) return;
        const a = $('a[href*="/track/"]', box);
        const id = btn.getAttribute('data-track-id') || box.getAttribute('data-track-id') || ((a.getAttribute('href').match(/-(\d+)\.html/) || [])[1]);
        add(parseItem(box, day, folder, base, id));
      });
    }
    return out;
  }
  // Todo lo que interesa de una página: tracks, título, total, botón de seguir, siguiente página…
  function readDoc(doc, base, startDay) {
    const left = $('.content .left', doc) || $('.content', doc) || doc.body || doc;
    const out = { tracks: parseTracks(doc, startDay, base), title: '', count: null, follow: null, msg: '', next: null, release: null, filtersOn: '' };
    const fr = $('.filter-reset[data-filters]', doc);
    if (fr) out.filtersOn = clean(fr.getAttribute('data-filters'));
    const h = $('h1.line', left);
    if (h) {
      const sup = $('sup', h);
      const n = sup ? parseInt(clean(sup.textContent).replace(/[^\d]/g, ''), 10) : NaN;
      if (isFinite(n)) out.count = n;
      out.title = clean(Array.from(h.childNodes).filter((x) => x.nodeType === 3 || (x.nodeType === 1 && !/^(sup|i|button)$/i.test(x.tagName))).map((x) => x.textContent).join(' ')).replace(/^Tracks by\s+/i, '');
      const fb = $('.favor-btn', h);
      if (fb) out.follow = followInfo(fb);
    }
    out.msg = $$('p.great-message, .great-message', left).map((p) => clean(p.textContent)).filter(Boolean).slice(0, 2).join(' ');
    const act = $('.pagination li.active', left);
    const sib = act && act.nextElementSibling;
    const a = sib && $('a[href]', sib);
    out.next = a ? absHref(a, base) : null;
    const rel = $('.release', left);
    if (rel) {
      const im = $('.thumbnail img, img.cover', rel);
      out.release = {
        cover: absUrl(im && im.getAttribute('src'), base),
        rows: $$('tr', rel).map((tr) => [clean(tr.children[0] && tr.children[0].textContent), clean(tr.children[1] && tr.children[1].textContent)]).filter((r) => r[0] && r[1]).slice(0, 8),
        artists: $$('.full-artist-link a[href*="artistFilter="]', rel).map((x) => [paramOf(absHref(x, base), 'artistFilter'), clean(x.textContent)]).filter((x) => x[0]),
        label: (() => { const x = $$('a[href*="labelFilter="]', rel).find((y) => paramOf(absHref(y, base), 'labelFilter')); return x ? [paramOf(absHref(x, base), 'labelFilter'), clean(x.textContent)] : null; })(),
      };
    }
    return out;
  }
  // <i class="favor-btn favor-artist" data-artist-id="…" title="Follow artist">
  function followInfo(fb) {
    const type = fb.classList.contains('favor-label') ? 'label' : 'artist';
    const id = fb.getAttribute('data-' + type + '-id') || fb.getAttribute('data-artist-id') || fb.getAttribute('data-label-id') || fb.getAttribute('data-id') || '';
    const title = fb.getAttribute('title') || '';
    const on = /favored|active|followed|\bon\b|checked/.test(fb.className.replace(/favor-(btn|artist|label)/g, '')) || /^(un|stop|remove)/i.test(title);
    return id ? { type, id, on } : null;
  }

  /* ───────────────────────── estado persistente ───────────────────────── */
  const HEARD_AFTER = 0.5; // segundos sonando para que cuente como escuchada
  const heard = new Set(LS.get('heard', []));
  let heardSaveT = 0;
  const isHeard = (t) => !!t && (heard.has(t.id) || (prefs.siteHeard && t.siteHeard));
  function markHeard(id) {
    if (!id || heard.has(id)) return;
    heard.add(id);
    clearTimeout(heardSaveT);
    heardSaveT = setTimeout(() => LS.set('heard', Array.from(heard).slice(-8000)), 800);
    const row = listRowById(id);
    if (row) row.classList.add('heard');
    const t = byId.get(id) || (current && current.id === id ? current : null);
    // que la web original también la vea como escuchada
    const vis = /^\d+$/.test(id) ? $('.trackitem[data-track-id="' + id + '"] .vis') : null;
    if (vis) vis.classList.add('listened');
    updateListCount();
    if (prefs.siteHeard) syncListenToSite(id, t);
  }
  // GET /tracks/status/<id>: lo que llama el reproductor de Soundeo al poner un track; lo marca como escuchado en la web
  function syncListenToSite(id, t) {
    try {
      siteRequest('/tracks/status/' + encodeURIComponent(id), 'GET').then(({ r }) => {
        if (t) t.siteHeard = true;
        const tr = r && r.track;
        if (!tr) return;
        const old = metaCache[id] || {};
        if (!old.b || !old.k) {
          const m = { b: old.b || num(tr.bpm), k: old.k || keyFromText(String(tr.key || '').replace(/\s\(.*\)/, '')) };
          if (old.ar) m.ar = old.ar;
          if (m.b || m.k) { metaCache[id] = m; saveMeta(); if (t) paintMeta(t); }
        }
        if (tr.hasOwnProperty('favored') && !favPending.has(id)) { setFavKnown(id, !!tr.favored, t); repaintFav(id); }
        if (t && t.vote && !votePending.has(id)) {
          const vn = toInt(tr.votes);
          const vo = typeof tr.voted === 'boolean' ? tr.voted : null;
          if (vn != null || vo != null) { setVoteKnown(t, vo != null ? vo : isVoted(t), vn != null ? vn : votesOf(t)); repaintVote(id); }
        }
      }).catch(() => {});
    } catch (e) {}
  }
  const hiddenFor = (list) => new Set(prefs.skipHeard ? list.filter((t) => isHeard(t) && !(current && current.id === t.id)).map((t) => t.id) : []);
  const myDownloads = new Set(LS.get('downloaded', []));
  function markDownloaded(id) {
    myDownloads.add(id);
    LS.set('downloaded', Array.from(myDownloads).slice(-3000));
  }
  const metaCache = LS.get('meta', {});
  let metaSaveT = 0;
  function saveMeta() {
    clearTimeout(metaSaveT);
    metaSaveT = setTimeout(() => {
      const keys = Object.keys(metaCache);
      if (keys.length > 3000) keys.slice(0, keys.length - 3000).forEach((k) => delete metaCache[k]);
      LS.set('meta', metaCache);
    }, 1500);
  }

  /* ───────────────────────── BPM / tono / artistas desde la página del track ───────────────────────── */
  const num = (s) => {
    const m = String(s || '').match(/\d{2,3}(?:[.,]\d+)?/);
    if (!m) return null;
    const n = Math.round(parseFloat(m[0].replace(',', '.')));
    return n >= 50 && n <= 250 ? n : null;
  };
  function keyFromText(s) {
    const k = parseKey(String(s || '').slice(0, 10));
    return k ? k.label : null;
  }
  function stripChrome(doc) {
    $$('section.player, header, .right, #sidebarContainer, #relatedTracksContainer, script, style, noscript', doc).forEach((n) => n.remove());
    return $('.content .left', doc) || $('.content', doc) || doc.body;
  }
  function parseTrackPage(html, t) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const og = $('meta[property="og:image"]', doc);
    const ogImg = og ? og.getAttribute('content') : '';
    const scope = stripChrome(doc);
    if (!scope) return null;
    const own = $('.trackitem[data-track-id="' + t.id + '"]', scope);
    const areas = own ? [own, scope] : [scope];
    let bpm = null;
    let key = null;
    for (const a of areas) {
      if (!bpm) { const e = $('a.bpm, .bpm, [title="BPM"]', a); if (e) bpm = num(e.textContent); }
      if (!bpm) for (const x of $$('a[href*="bpmFilter="]', a)) { const n = num(x.textContent); if (n) { bpm = n; break; } }
      if (!key) { const e = $('a.key, .key, [title="Key"]', a); if (e) key = keyFromText(e.textContent); }
      if (!key) for (const x of $$('a[href*="keyFilter="]', a)) { const k = keyFromText(x.textContent); if (k) { key = k; break; } }
    }
    const text = clean(scope.textContent);
    if (!bpm) { const m = text.match(/\bBPM\b\s*:?\s*(\d{2,3}(?:\.\d+)?)/i) || text.match(/(\d{2,3}(?:\.\d+)?)\s*BPM\b/i); if (m) bpm = num(m[1]); }
    if (!key) { const m = text.match(/\bKey\b\s*:?\s*([A-G]\s?[♭♯#b]?\s?(?:maj(?:or)?|min(?:or)?))\b/i); if (m) key = keyFromText(m[1].replace(/\s+/g, '')); }
    // artistas (con su id) para poder abrir su página
    const ar = [];
    $$('.full-artist-link a[href*="artistFilter="], a[href*="artistFilter="]', scope).forEach((a) => {
      const id = paramOf(a.getAttribute('href'), 'artistFilter');
      const name = clean(a.textContent);
      if (id && name && !ar.some((x) => x[0] === id)) ar.push([id, name]);
    });
    // tamaño de portada más grande visto en la página
    let best = 0;
    [ogImg].concat($$('img', scope).map((i) => i.getAttribute('src') || '')).forEach((u) => {
      const m = u && /sndstatic\.com/.test(u) && u.match(COVER_RE);
      if (m && +m[1] > best && +m[1] <= COVER_MAX) best = +m[1];
    });
    if (best && (!coverSize || best > +coverSize)) {
      coverSize = String(best);
      LS.set('coverSize', coverSize);
      refreshCovers();
    }
    return { b: bpm, k: key, ar: ar.slice(0, 6) };
  }
  const metaPending = new Map();
  const metaTried = new Set();
  let metaActive = 0;
  const metaQueue = [];
  function pumpMeta() {
    while (metaActive < 2 && metaQueue.length) {
      const job = metaQueue.shift();
      metaActive++;
      job().finally(() => { metaActive--; pumpMeta(); });
    }
  }
  // needArtists: aunque ya tengamos BPM y tono, volver a mirar la página si faltan los artistas
  function getMeta(t, needArtists, urgent) {
    if (!t || !t.trackUrl) return Promise.resolve(null);
    const have = metaCache[t.id];
    if (have && (have.ar || !needArtists)) return Promise.resolve(have);
    if (metaPending.has(t.id)) return metaPending.get(t.id);
    if (!needArtists && metaTried.has(t.id)) return Promise.resolve(have || null);
    metaTried.add(t.id);
    const p = new Promise((resolve) => {
      const job = () =>
        fetch(t.trackUrl, { credentials: 'include' })
          .then((r) => (r.ok ? r.text() : ''))
          .then((html) => {
            const m = html ? parseTrackPage(html, t) : null;
            if (m && (m.b || m.k || m.ar.length)) {
              const old = metaCache[t.id] || {};
              metaCache[t.id] = { b: m.b || old.b || null, k: m.k || old.k || null, ar: m.ar };
              saveMeta();
            }
            resolve(metaCache[t.id] || m);
          })
          .catch(() => resolve(metaCache[t.id] || null))
          .finally(() => metaPending.delete(t.id));
      if (urgent) metaQueue.unshift(job); else metaQueue.push(job);
      pumpMeta();
    });
    metaPending.set(t.id, p);
    return p;
  }

  /* ───────────────────────── iconos ───────────────────────── */
  const ICON = {
    play: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5.6v12.8c0 .8.9 1.3 1.6.9l10.2-6.4c.6-.4.6-1.3 0-1.7L9.6 4.7C8.9 4.3 8 4.8 8 5.6z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><rect fill="currentColor" x="6" y="5" width="4.2" height="14" rx="1.2"/><rect fill="currentColor" x="13.8" y="5" width="4.2" height="14" rx="1.2"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M5.5 6.4v11.2c0 .8.9 1.2 1.5.8l8.2-5.6c.6-.4.6-1.2 0-1.6L7 5.6c-.6-.4-1.5 0-1.5.8z"/><rect fill="currentColor" x="16.3" y="5.5" width="2.6" height="13" rx="1.2"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M18.5 6.4v11.2c0 .8-.9 1.2-1.5.8l-8.2-5.6c-.6-.4-.6-1.2 0-1.6L17 5.6c.6-.4 1.5 0 1.5.8z"/><rect fill="currentColor" x="5.1" y="5.5" width="2.6" height="13" rx="1.2"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 3.4l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.8l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    starOn: '<svg viewBox="0 0 24 24"><path d="M12 3.4l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.8l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="currentColor" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    dl: '<svg viewBox="0 0 24 24"><path d="M12 4.5v10.5m0 0l-4.3-4.3M12 15l4.3-4.3M5 19.5h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    sliders: '<svg viewBox="0 0 24 24"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="15" cy="7" r="2.3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="17" r="2.3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="5.5" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="18.5" cy="12" r="1.9" fill="currentColor"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M5.5 12a6.5 6.5 0 1 0 2-4.7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M7.6 3.6v4.1h4.1" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fwd: '<svg viewBox="0 0 24 24"><path d="M18.5 12a6.5 6.5 0 1 1-2-4.7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M16.4 3.6v4.1h-4.1" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M6 14.5l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ext: '<svg viewBox="0 0 24 24"><path d="M14 4.5h5.5V10M19.5 4.5l-8.5 8.5M17.5 14v4.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1H10" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    menu: '<svg viewBox="0 0 24 24"><path d="M4.5 7h15M4.5 12h15M4.5 17h15" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="5.8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.2 15.2l4.3 4.3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path d="M14.5 5.5L8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.3" r="3.6" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M5 19.5c.8-3.4 3.6-5.2 7-5.2s6.2 1.8 7 5.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    disc: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>',
    tag: '<svg viewBox="0 0 24 24"><path d="M4.5 12.6V5.5a1 1 0 0 1 1-1h7.1l7 7a1 1 0 0 1 0 1.4l-6.7 6.7a1 1 0 0 1-1.4 0z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="8.6" cy="8.6" r="1.3" fill="currentColor"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 7.6V12l3 2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20.2C7.3 16.5 4 13.6 4 9.9c0-2.5 1.9-4.4 4.3-4.4 1.5 0 2.8.7 3.7 1.9.9-1.2 2.2-1.9 3.7-1.9 2.4 0 4.3 1.9 4.3 4.4 0 3.7-3.3 6.6-8 10.3z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    heartOn: '<svg viewBox="0 0 24 24"><path d="M12 20.2C7.3 16.5 4 13.6 4 9.9c0-2.5 1.9-4.4 4.3-4.4 1.5 0 2.8.7 3.7 1.9.9-1.2 2.2-1.9 3.7-1.9 2.4 0 4.3 1.9 4.3 4.4 0 3.7-3.3 6.6-8 10.3z" fill="currentColor" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    feed: '<svg viewBox="0 0 24 24"><rect x="6" y="3.5" width="12" height="17" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.5 9.6v4.8l4-2.4z" fill="currentColor"/></svg>',
  };

  /* ───────────────────────── estilos ───────────────────────── */
  const PAGE_CSS = `
    #sx-host{position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000;}
    html.sx-open,html.sx-open body{overflow:hidden!important;height:100%!important;width:100%!important;min-width:0!important;max-width:100%!important;margin:0!important;padding:0!important;overscroll-behavior:none!important;background:#0b0b0e!important;}
    html.sx-open.sx-imm{overflow-x:hidden!important;overflow-y:scroll!important;height:auto!important;scrollbar-width:none!important;}
    html.sx-open.sx-imm::-webkit-scrollbar{display:none!important;width:0!important;height:0!important;}
    html.sx-open.sx-imm body{overflow:visible!important;height:auto!important;min-height:calc(100vh + 60000px)!important;}
    html.sx-open body>*:not(#sx-host):not(.ui-dialog):not(.ui-widget-overlay):not(.ui-autocomplete){display:none!important;}
    html.sx-open .ui-widget-overlay{position:fixed!important;inset:0!important;z-index:2147483600!important;}
    html.sx-open .ui-dialog{position:fixed!important;z-index:2147483601!important;top:50%!important;left:50%!important;transform:translate(-50%,-50%)!important;max-width:92vw!important;}
  `;

  const APP_CSS = `
  :host{all:initial;}
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
  button{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer;-webkit-appearance:none;appearance:none;touch-action:manipulation;}
  svg{width:100%;height:100%;display:block;}
  .root{--bg:#0b0b0e;--fg:#f5f5f7;--mut:rgba(245,245,247,.62);--dim:rgba(245,245,247,.38);--line:rgba(255,255,255,.1);
    --glass:rgba(255,255,255,.13);--glass2:rgba(255,255,255,.2);--acc:#2ea8ff;--gold:#ffc83d;--ok:#34d27b;--like:#ff4d6d;
    --st:env(safe-area-inset-top,0px);--sb:env(safe-area-inset-bottom,0px);--sl:env(safe-area-inset-left,0px);--sr:env(safe-area-inset-right,0px);
    --top:calc(var(--st) + 54px);--ctrl:calc(var(--sb) + 118px);
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif;
    color:var(--fg);font-size:15px;line-height:1.3;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;}
  .app{position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;background:var(--bg);overflow:hidden;display:none;user-select:none;-webkit-user-select:none;}
  .root.open .app{display:block;}

  /* barra superior */
  .topbar{position:absolute;left:0;right:0;top:0;z-index:30;padding:calc(var(--st) + 8px) calc(var(--sr) + 12px) 10px calc(var(--sl) + 12px);display:flex;align-items:center;gap:8px;
    background:linear-gradient(to bottom,rgba(0,0,0,.62),rgba(0,0,0,0));pointer-events:none;}
  .app[data-view=list] .topbar{background:rgba(11,11,14,.97);border-bottom:1px solid var(--line);}
  .topbar>*{pointer-events:auto;}
  .seg{display:flex;background:var(--glass);border-radius:999px;padding:3px;}
  .seg button{padding:7px 13px;border-radius:999px;font-size:14px;font-weight:600;color:var(--mut);}
  .seg button.on{background:var(--fg);color:#000;}
  .tb-sp{flex:1;}
  .pill{display:flex;align-items:center;gap:5px;height:34px;padding:0 11px;border-radius:999px;background:var(--glass);font-size:13px;font-weight:600;}
  .pill i{width:16px;height:16px;display:block;}
  .pill.zero{color:#ff8a7a;}
  .pill .vl{display:none;align-items:center;gap:2px;font-size:11px;font-weight:700;color:var(--mut);margin-right:3px;padding-right:7px;border-right:1px solid rgba(255,255,255,.16);height:14px;}
  .pill .vl i{width:11px;height:11px;}
  .pill.hasv .vl{display:flex;}
  .pill .vl.zero{color:#ff8a7a;}
  @media (max-width:374px){.dlleft{display:none;}}
  .ibtn{width:38px;height:38px;border-radius:50%;background:var(--glass);display:grid;place-items:center;}
  .ibtn i{width:21px;height:21px;display:block;}

  /* feed */
  .feed{position:absolute;inset:0;display:flex;overflow-x:scroll;overflow-y:hidden;scroll-snap-type:x mandatory;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:none;touch-action:pan-x;}
  .feed::-webkit-scrollbar{display:none;}
  .root.imm .feed{overscroll-behavior:contain auto;}
  .root.imm.imm-armed .feed{touch-action:pan-x pan-y;}
  .sap{position:absolute;left:0;bottom:0;width:1px;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none;}
  .app[data-view=list] .feed,.app[data-view=list] .controls{display:none;}
  .card{position:relative;flex:0 0 100%;height:100%;width:100%;scroll-snap-align:start;scroll-snap-stop:always;overflow:hidden;}
  .card.ph{background:var(--bg);}
  .bg{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;transition:opacity .25s;pointer-events:none;}
  .bg.on{opacity:.62;}
  .card::after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.15) 0%,rgba(0,0,0,0) 30%,rgba(0,0,0,.45) 75%,rgba(0,0,0,.7) 100%);pointer-events:none;}
  .cin{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;padding:calc(var(--top) + 4px) calc(var(--sr) + 20px) calc(var(--ctrl) + 10px) calc(var(--sl) + 20px);}
  .app.has-ctx .cin{padding-top:calc(var(--top) + 36px);}
  .ctop{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;}
  .chip{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px;border-radius:999px;background:var(--glass);font-size:12.5px;font-weight:600;color:var(--fg);white-space:nowrap;}
  .chip.mut{color:var(--mut);}
  .chip.key b{color:var(--acc);font-weight:700;}
  .chip.e{background:rgba(255,255,255,.85);color:#000;}
  .idx{font-size:12.5px;color:var(--mut);font-variant-numeric:tabular-nums;font-weight:600;}
  .mid{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;}
  .cvw{position:relative;align-self:center;width:var(--cv,min(76vw,300px));height:var(--cv,min(76vw,300px));border-radius:14px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.55);background:#222 center/cover no-repeat;flex:none;}
  .cvw img{width:100%;height:100%;object-fit:cover;display:block;}
  .pind{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.28);opacity:0;transition:opacity .2s;pointer-events:none;}
  .pind i{width:64px;height:64px;display:block;padding:15px;border-radius:50%;background:rgba(0,0,0,.45);}
  .card.paused .pind{opacity:1;}
  .eq{position:absolute;right:10px;bottom:10px;display:flex;gap:3px;align-items:flex-end;height:18px;opacity:0;transition:opacity .2s;}
  .card.playing .eq{opacity:1;}
  .eq span{width:3px;height:100%;background:#fff;border-radius:2px;transform-origin:50% 100%;animation:eq 1s ease-in-out infinite;}
  .eq span:nth-child(2){animation-delay:-.4s}.eq span:nth-child(3){animation-delay:-.7s}.eq span:nth-child(4){animation-delay:-.2s}
  @keyframes eq{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}
  .info{margin-top:18px;flex:none;display:flex;align-items:flex-end;gap:12px;height:var(--ih,auto);}
  .itext{flex:1;min-width:0;display:flex;flex-direction:column;}
  .eyebrow{font-size:11.5px;font-weight:750;letter-spacing:.07em;text-transform:uppercase;color:var(--mut);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .eyebrow b{color:var(--fg);font-weight:750;}
  .ttl{font-size:25px;font-weight:800;letter-spacing:-.02em;line-height:1.12;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
  .mix{font-size:15px;color:var(--mut);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .mix:empty{display:none;}
  .rail{flex:none;display:flex;flex-direction:column;gap:10px;}
  .rbtn{width:50px;height:50px;border-radius:50%;background:var(--glass);display:grid;place-items:center;}
  .rbtn i{width:24px;height:24px;display:block;}
  .rbtn.fav.on{background:var(--gold);color:#1a1300;}
  .rbtn.done{color:var(--ok);}
  .rbtn.vote{display:flex;flex-direction:column;align-items:center;justify-content:center;}
  .rbtn.vote i{width:22px;height:22px;}
  .rbtn.vote em{font-style:normal;font-size:10px;font-weight:700;line-height:1;margin:-1px 0 1px;color:var(--mut);font-variant-numeric:tabular-nums;}
  .rbtn.vote.on{background:var(--like);color:#fff;}
  .rbtn.vote.on em{color:#fff;}
  .rbtn:active{transform:scale(.92);}
  .art{font-size:17px;font-weight:600;margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .rel{font-size:13.5px;color:var(--mut);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .rel .lbl,.rel .relb{color:var(--fg);text-decoration:underline;text-decoration-color:rgba(255,255,255,.3);text-underline-offset:3px;}
  .rel .relb{color:var(--mut);}
  .chips{display:flex;gap:6px;flex-wrap:wrap;overflow:hidden;margin-top:11px;height:26px;}
  .chips .chip:empty{display:none;}
  .end .cin{justify-content:center;align-items:center;text-align:center;gap:14px;}
  .end h3{margin:0;font-size:22px;font-weight:800;}
  .end p{margin:0;color:var(--mut);font-size:15px;max-width:300px;}
  .btn{height:48px;border-radius:14px;padding:0 20px;font-size:15.5px;font-weight:700;background:var(--glass2);display:inline-flex;align-items:center;justify-content:center;gap:8px;}
  .btn.pri{background:var(--fg);color:#000;}
  .btn.acc{background:var(--acc);color:#fff;}
  .btn.full{width:100%;}

  /* controles inferiores (feed) */
  .controls{position:absolute;left:0;right:0;bottom:0;z-index:30;padding:0 calc(var(--sr) + 16px) calc(var(--sb) + 10px) calc(var(--sl) + 16px);pointer-events:none;
    background:linear-gradient(to top,rgba(0,0,0,.75),rgba(0,0,0,0));}
  .controls>*{pointer-events:auto;}
  .prog{display:flex;align-items:center;gap:10px;font-size:11.5px;color:var(--mut);font-variant-numeric:tabular-nums;height:30px;}
  .prog span{width:34px;}
  .prog span:last-child{text-align:right;}
  .bar{position:relative;flex:1;height:30px;touch-action:none;cursor:pointer;}
  .bar::before{content:"";position:absolute;left:0;right:0;top:13px;height:4px;border-radius:4px;background:rgba(255,255,255,.22);}
  .bar .fill{position:absolute;left:0;top:13px;height:4px;border-radius:4px;background:#fff;width:0;}
  .bar .buf{position:absolute;left:0;top:13px;height:4px;border-radius:4px;background:rgba(255,255,255,.25);width:0;}
  .bar .knob{position:absolute;top:8px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:#fff;left:0;box-shadow:0 1px 4px rgba(0,0,0,.4);}
  .btns{display:flex;align-items:center;justify-content:space-between;padding:2px 2px 0;}
  .cb{width:52px;height:52px;display:grid;place-items:center;border-radius:50%;}
  .cb i{width:30px;height:30px;display:block;}
  .cb.sm i{width:26px;height:26px;position:relative;}
  .cb.sm{position:relative;}
  .cb.sm em{position:absolute;font-style:normal;font-size:9.5px;font-weight:800;top:50%;left:50%;transform:translate(-50%,-38%);}
  .cb.big{width:68px;height:68px;background:var(--fg);color:#000;}
  .cb.big i{width:32px;height:32px;}
  .cb:active{transform:scale(.94);}
  .spin .cb.big{animation:pulse 1s ease-in-out infinite;}
  @keyframes pulse{50%{opacity:.6}}

  /* lista */
  .list{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:var(--top) var(--sr) calc(var(--sb) + 96px) var(--sl);display:none;overscroll-behavior:contain;}
  .app[data-view=list] .list{display:block;}
  .lhead{padding:12px 16px 6px;}
  .fsum{width:100%;text-align:left;background:var(--glass);border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:10px;}
  .fsum i{width:20px;height:20px;flex:none;color:var(--acc);}
  .fsum b{display:block;font-size:14.5px;font-weight:650;}
  .fsum small{display:block;font-size:12.5px;color:var(--mut);margin-top:2px;}
  .dhead{padding:4px 16px 12px;}
  .dnav{display:flex;justify-content:space-between;gap:10px;margin-bottom:10px;}
  .dn{height:32px;padding:0 13px;border-radius:999px;background:var(--glass);font-size:13px;font-weight:650;color:var(--fg);}
  .dn[disabled]{opacity:.28;}
  .dbig{font-size:36px;font-weight:850;letter-spacing:-.03em;line-height:1.02;}
  .dsub{font-size:17px;font-weight:650;margin-top:3px;opacity:.9;}
  .dcount{font-size:13.5px;color:var(--mut);margin-top:6px;}
  .lf{margin-top:12px;}
  .gh{position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;padding:10px 16px 7px;font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--mut);background:var(--bg);border-bottom:1px solid var(--line);}
  .gh span{font-variant-numeric:tabular-nums;}
  .lempty{padding:34px 24px;text-align:center;color:var(--mut);font-size:15px;line-height:1.4;}
  .row{display:flex;align-items:center;gap:12px;padding:9px 10px 9px 16px;position:relative;-webkit-touch-callout:none;}
  .row img{pointer-events:none;}
  .row:active{background:rgba(255,255,255,.05);}
  .row.cur{background:rgba(46,168,255,.12);}
  .row .rc{width:52px;height:52px;border-radius:8px;flex:none;background:#222;object-fit:cover;}
  .rm{flex:1;min-width:0;}
  .rt{font-size:15.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .rt small{font-weight:500;color:var(--mut);font-size:13.5px;}
  .ra{font-size:14px;color:var(--fg);opacity:.86;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;}
  .rx{font-size:12.5px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;}
  .row.heard .rm{opacity:.5;}
  .row.heard .rt::before{content:"✓ ";color:var(--ok);}
  .rb{width:40px;height:44px;display:grid;place-items:center;flex:none;color:var(--mut);}
  .rb i{width:22px;height:22px;display:block;}
  .rb.on{color:var(--gold);}
  .rb.done{color:var(--ok);}
  .rb.rvote{display:flex;flex-direction:column;align-items:center;justify-content:center;}
  .rb.rvote i{width:21px;height:21px;}
  .rb.rvote em{font-style:normal;font-size:9.5px;font-weight:700;line-height:1;margin-top:-1px;font-variant-numeric:tabular-nums;}
  .rb.rvote.on{color:var(--like);}
  .pager{display:flex;gap:10px;padding:18px 16px 10px;}
  .pager .btn{flex:1;white-space:nowrap;padding:0 12px;}
  .pager .btn[disabled]{opacity:.35;}

  /* mini reproductor (lista) */
  .mini{position:absolute;left:calc(var(--sl) + 8px);right:calc(var(--sr) + 8px);bottom:calc(var(--sb) + 8px);z-index:30;display:none;align-items:center;gap:10px;padding:8px 8px 8px 8px;border-radius:16px;
    background:rgba(40,40,46,.98);box-shadow:0 10px 30px rgba(0,0,0,.5);overflow:hidden;}
  .app[data-view=list].has-cur .mini{display:flex;}
  .mini img{width:46px;height:46px;border-radius:9px;object-fit:cover;background:#333;flex:none;}
  .mini .mm{flex:1;min-width:0;}
  .mini .mt{font-size:14.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .mini .ma{font-size:12.5px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .mini .mb{width:40px;height:40px;display:grid;place-items:center;flex:none;}
  .mini .mb i{width:24px;height:24px;display:block;}
  .mini .mb.on{color:var(--gold);}
  .mini .mprog{position:absolute;left:0;bottom:0;height:2.5px;background:var(--fg);width:0;}

  /* etiqueta de dónde estás (feed) */
  .ctx{position:absolute;left:50%;top:calc(var(--st) + 56px);transform:translateX(-50%);z-index:29;display:none;align-items:center;max-width:calc(100% - 40px);height:28px;padding:0 13px;border-radius:999px;background:rgba(0,0,0,.45);font-size:12.5px;font-weight:700;color:var(--fg);white-space:nowrap;}
  .ctx .ct{overflow:hidden;text-overflow:ellipsis;}
  .app.has-ctx[data-view=feed] .ctx{display:flex;}

  /* cabecera de artista / sello / release / búsqueda (lista) */
  .shead{display:flex;align-items:center;gap:12px;padding:4px 0 2px;}
  .scov{width:76px;height:76px;border-radius:10px;object-fit:cover;background:#222;flex:none;}
  .stx{flex:1;min-width:0;}
  .skind{font-size:11.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin-bottom:2px;}
  .stitle{font-size:26px;font-weight:850;letter-spacing:-.02em;line-height:1.1;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
  .ssub{font-size:13.5px;color:var(--mut);margin-top:4px;}
  .fol{height:38px;padding:0 16px;font-size:14px;flex:none;}
  .schips{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px;}
  .schips .tag{color:var(--fg);}
  .dhead .dcount:first-child{margin-top:0;}

  /* buscador */
  .srch{position:absolute;inset:0;z-index:45;background:var(--bg);display:none;flex-direction:column;padding:calc(var(--st) + 8px) calc(var(--sr) + 12px) 0 calc(var(--sl) + 12px);}
  .srch.on{display:flex;}
  .srow{display:flex;align-items:center;gap:8px;margin:0;}
  .sq{flex:1;min-width:0;height:42px;border-radius:12px;background:var(--glass);border:1px solid transparent;color:var(--fg);font:inherit;font-size:16px;padding:0 12px;outline:none;-webkit-appearance:none;appearance:none;}
  .sq:focus{border-color:var(--acc);}
  .sgo{height:42px;padding:0 14px;font-size:14.5px;border-radius:12px;}
  .sbody{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:4px 4px calc(var(--sb) + 20px);user-select:text;-webkit-user-select:text;}

  /* hojas */
  .shade{position:absolute;inset:0;z-index:50;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .25s;}
  .shade.on{opacity:1;pointer-events:auto;}
  .sheet{position:absolute;left:0;right:0;bottom:0;z-index:51;background:#17171c;border-radius:20px 20px 0 0;transform:translateY(105%);transition:transform .3s cubic-bezier(.2,.8,.2,1);
    max-height:calc(100% - var(--st) - 24px);display:flex;flex-direction:column;box-shadow:0 -10px 40px rgba(0,0,0,.5);}
  .sheet.on{transform:none;}
  .sh{display:flex;align-items:center;justify-content:space-between;padding:16px 16px 8px 20px;flex:none;}
  .sh h2{margin:0;font-size:20px;font-weight:800;}
  .sb{overflow-y:auto;-webkit-overflow-scrolling:touch;padding:4px calc(var(--sr) + 20px) calc(var(--sb) + 20px) calc(var(--sl) + 20px);overscroll-behavior:contain;user-select:text;-webkit-user-select:text;}
  .sec{margin:18px 0 8px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);}
  .lab{font-size:14px;font-weight:650;margin:14px 0 8px;display:flex;justify-content:space-between;align-items:baseline;}
  .lab small{font-weight:500;color:var(--mut);font-size:12.5px;}
  .lab a{color:var(--acc);font-weight:600;font-size:13px;}
  .tags{display:flex;flex-wrap:wrap;gap:7px;}
  .tag{height:34px;padding:0 13px;border-radius:999px;background:var(--glass);font-size:13.5px;font-weight:600;color:var(--mut);}
  .tag.on{background:var(--acc);color:#fff;}
  .tag small{opacity:.7;font-weight:700;margin-right:4px;}
  .tags.collapsed .tag[data-id]:not(.on){display:none;}
  .tag.tmore{background:none;border:1px dashed rgba(255,255,255,.28);color:var(--fg);}
  .sf{flex:none;display:flex;gap:9px;padding:12px 20px calc(var(--sb) + 12px);border-top:1px solid var(--line);background:#17171c;border-radius:0 0 0 0;}
  .sf .btn{flex:1;padding:0 8px;font-size:14.5px;white-space:nowrap;}
  .bpm{display:flex;align-items:center;gap:10px;}
  .bpm input,.txt{height:44px;border-radius:12px;background:var(--glass);border:1px solid transparent;color:var(--fg);font:inherit;font-size:16px;padding:0 12px;width:100%;outline:none;-webkit-appearance:none;}
  .bpm input{width:96px;text-align:center;font-weight:700;font-variant-numeric:tabular-nums;}
  .bpm input:focus,.txt:focus{border-color:var(--acc);}
  .bpm span{color:var(--mut);}
  .presets{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;}
  .tg{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 0;border-bottom:1px solid var(--line);}
  .tg div b{display:block;font-size:15px;font-weight:600;}
  .tg div small{display:block;font-size:12.5px;color:var(--mut);margin-top:2px;}
  .sw{width:51px;height:31px;border-radius:999px;background:rgba(255,255,255,.18);position:relative;flex:none;transition:background .2s;}
  .sw::after{content:"";position:absolute;left:2px;top:2px;width:27px;height:27px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 2px 4px rgba(0,0,0,.3);}
  .sw.on{background:var(--ok);}
  .sw.on::after{transform:translateX(20px);}
  .seg2{display:flex;background:var(--glass);border-radius:12px;padding:3px;}
  .seg2 button{flex:1;height:36px;border-radius:9px;font-size:14px;font-weight:600;color:var(--mut);}
  .seg2 button.on{background:var(--glass2);color:var(--fg);}
  .stack{display:flex;flex-direction:column;gap:9px;margin-top:16px;}
  .row2{display:flex;gap:9px;}
  .row2 .btn{flex:1;padding:0 10px;font-size:14.5px;}
  .note{font-size:12.5px;color:var(--mut);margin-top:10px;line-height:1.45;}
  .opt{display:flex;align-items:center;gap:12px;width:100%;padding:15px 4px;border-bottom:1px solid var(--line);font-size:16px;font-weight:600;text-align:left;}
  .opt i{width:22px;height:22px;flex:none;color:var(--mut);}
  .opt small{margin-left:auto;color:var(--mut);font-weight:500;font-size:14px;}
  .opt.pri{color:var(--acc);}
  .opt .ol{display:flex;flex-direction:column;min-width:0;flex:1;}
  .opt .ol em{font-style:normal;font-size:13px;font-weight:500;color:var(--mut);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .opt.pri i{color:var(--acc);}
  .opt[disabled]{opacity:.4;}
  .asub{color:var(--mut);font-size:14px;margin:-2px 0 8px;}
  textarea.diag{width:100%;height:220px;border-radius:12px;background:#0d0d10;color:#cfd;border:1px solid var(--line);font:11.5px/1.4 ui-monospace,Menlo,monospace;padding:10px;}

  /* toasts */
  .toasts{position:absolute;left:0;right:0;top:calc(var(--top) + 6px);z-index:60;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;padding:0 16px;}
  .toast{background:rgba(245,245,247,.96);color:#000;font-size:14px;font-weight:600;padding:11px 16px;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.4);max-width:100%;
    display:flex;align-items:center;gap:12px;pointer-events:auto;animation:tin .25s ease-out;}
  .toast button{color:#0a6fd6;font-weight:800;}
  @keyframes tin{from{transform:translateY(10px);opacity:0}to{transform:none;opacity:1}}

  /* botón flotante */
  .fab{position:fixed;right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 16px);z-index:10;display:none;align-items:center;gap:8px;height:48px;padding:0 18px 0 14px;border-radius:999px;
    background:#111;color:#fff;font-size:15px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.15);}
  .fab i{width:22px;height:22px;display:block;}
  .root.fabon:not(.open) .fab{display:flex;}
  
  /* móvil en horizontal: todo más bajo; texto hacia el centro, portada a su derecha y los botones al lado */
  @media (orientation:landscape) and (max-height:500px){
    .root{--top:calc(var(--st) + 46px);--ctrl:calc(var(--sb) + 80px);}
    .topbar{padding-top:calc(var(--st) + 4px);padding-bottom:4px;}
    .ctx{top:calc(var(--st) + 9px);max-width:32%;}
    .cin,.app.has-ctx .cin{padding-top:calc(var(--top) + 2px);padding-bottom:calc(var(--ctrl) + 4px);}
    .mid{flex-direction:row;align-items:center;justify-content:center;gap:20px;}
    .info{display:contents;}
    .itext{order:1;flex:0 1 auto;max-width:44%;max-height:100%;overflow:hidden;}
    .cvw{order:2;}
    .rail{order:3;flex-direction:row;}
    .eyebrow{margin-bottom:3px;}
    .ttl{font-size:21px;-webkit-line-clamp:1;}
    .mix{font-size:13.5px;margin-top:1px;}
    .art{font-size:15.5px;margin-top:4px;}
    .rel{display:none;}
    .chips{margin-top:7px;flex-wrap:nowrap;}
    .chips .chip.mut{display:none;}
    .controls{padding-bottom:calc(var(--sb) + 4px);}
    .prog{height:22px;}
    .btns{padding-top:0;}
    .cb{width:46px;height:46px;}
    .cb.big{width:54px;height:54px;}
    .cb.big i{width:27px;height:27px;}
    .end .cin{flex-direction:row;flex-wrap:wrap;align-content:center;gap:8px 10px;overflow-y:auto;}
    .end h3{width:100%;font-size:19px;}
    .end p{width:100%;max-width:none;font-size:14px;}
  }
  /* y si además Safari enseña sus barras (muy poca altura), fuera las etiquetas de tono/BPM */
  @media (orientation:landscape) and (max-height:300px){
    .chips{display:none;}
  }
  `;

  /* ───────────────────────── app ───────────────────────── */
  let cur = null; // fuente que se está viendo (sección, artista, búsqueda…)
  let stack = []; // navegación: la última es `cur`
  let liveSrc = null; // la lista de la página con la que arrancó Safari
  let tracks = [];
  let byId = new Map();
  let days = [];
  let dayStat = new Map();
  let deck = [];
  let deckPos = new Map();
  let hiddenAtLoad = new Set();
  let forced = new Set();
  function newPages(first) { return { first: first || 1, last: first || 1, hasMore: false, next: null, loading: null, autoEmpty: 0, dayLoads: 0 }; }
  let pages = newPages();
  let activeIdx = 0;
  let current = null; // track cargado en el audio
  let wantPlay = false;
  let view = 'feed';
  let isOpen = false;
  let host, root, app, feedEl, listEl, ctrlEl, miniEl, toastsEl, shadeEl, ctxEl, srchEl;

  const vpMeta = (() => {
    let m = $('meta[name="viewport"]');
    const orig = m ? m.getAttribute('content') : null;
    return {
      apply() {
        if (!m) { m = document.createElement('meta'); m.name = 'viewport'; document.head.appendChild(m); }
        m.setAttribute('content', 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, viewport-fit=cover');
      },
      restore() { if (m) { if (orig == null) m.remove(); else m.setAttribute('content', orig); } },
    };
  })();

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  const i = (name) => '<i>' + ICON[name] + '</i>';

  function buildShell() {
    const style = document.createElement('style');
    style.id = 'sx-page-style';
    style.textContent = PAGE_CSS;
    document.head.appendChild(style);

    host = document.createElement('div');
    host.id = 'sx-host';
    document.body.appendChild(host);
    const sr = host.attachShadow({ mode: 'open' });
    // aislar teclas para que no disparen los atajos de Soundeo
    ['keydown', 'keypress', 'keyup'].forEach((ev) => host.addEventListener(ev, (e) => e.stopPropagation()));
    // al cerrar el teclado Safari puede dejar la página desplazada: devolverla a su sitio
    host.addEventListener('focusout', () => setTimeout(() => { if (isOpen && (!imm.on || imm.paused)) window.scrollTo(0, 0); }, 60));
    // mientras se escribe (teclado abierto) la página vuelve a estar fija, como sin el modo inmersivo
    const typing = () => { const a = sr.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
    host.addEventListener('focusin', () => { if (typing()) immPause(true); });
    host.addEventListener('focusout', () => setTimeout(() => { if (!typing()) immPause(false); }, 120));

    sr.innerHTML = `<style>${APP_CSS}</style>
      <div class="root">
        <div class="app" data-view="feed">
          <div class="feed"></div>
          <div class="list"></div>
          <div class="topbar">
            <button class="ibtn bnav" aria-label="Secciones">${i('menu')}</button>
            <div class="seg"><button data-v="feed">Feed</button><button data-v="list">Lista</button></div>
            <div class="tb-sp"></div>
            <button class="pill dlleft" title="Likes y descargas que te quedan hoy"><span class="vl">${i('heart')}<b>–</b></span>${i('dl')}<span class="dlc">–</span></button>
            <button class="ibtn bsearch" aria-label="Buscar">${i('search')}</button>
            <button class="ibtn bset" aria-label="Ajustes">${i('sliders')}</button>
          </div>
          <button class="ctx"><span class="ct"></span><small class="cs"></small></button>
          <div class="controls">
            <div class="prog"><span class="tc">0:00</span><div class="bar"><div class="buf"></div><div class="fill"></div><div class="knob"></div></div><span class="td">0:00</span></div>
            <div class="btns">
              <button class="cb sm b15" aria-label="Atrás 15 s">${i('back')}<em>15</em></button>
              <button class="cb bprev" aria-label="Anterior">${i('prev')}</button>
              <button class="cb big bplay" aria-label="Reproducir">${i('play')}</button>
              <button class="cb bnext" aria-label="Siguiente">${i('next')}</button>
              <button class="cb sm f30" aria-label="Adelante 30 s">${i('fwd')}<em>30</em></button>
            </div>
          </div>
          <div class="mini">
            <img alt="">
            <div class="mm"><div class="mt"></div><div class="ma"></div></div>
            <button class="mb mfav" aria-label="Guardar">${i('star')}</button>
            <button class="mb mplay" aria-label="Reproducir">${i('play')}</button>
            <button class="mb mnext" aria-label="Siguiente">${i('next')}</button>
            <button class="mb mexp" aria-label="Abrir en feed">${i('up')}</button>
            <div class="mprog"></div>
          </div>
          <div class="srch">
            <form class="srow" action="#">
              <button type="button" class="ibtn sback" aria-label="Cerrar">${i('chev')}</button>
              <input class="sq" type="search" enterkeyhint="search" placeholder="Artista, título o sello" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
              <button type="submit" class="btn pri sgo">Buscar</button>
            </form>
            <div class="sbody"></div>
          </div>
          <div class="toasts"></div>
          <div class="sap"></div>
          <div class="shade"></div>
          <div class="sheet s-settings"><div class="sh"><h2>Ajustes</h2><button class="ibtn sclose">${i('close')}</button></div><div class="sb"></div><div class="sf"></div></div>
          <div class="sheet s-action"><div class="sh"><h2></h2><button class="ibtn sclose">${i('close')}</button></div><div class="sb"></div></div>
        </div>
        <button class="fab">${i('feed')}<span>Abrir Feed</span></button>
      </div>`;
    root = $('.root', sr);
    app = $('.app', sr);
    feedEl = $('.feed', sr);
    listEl = $('.list', sr);
    ctrlEl = $('.controls', sr);
    miniEl = $('.mini', sr);
    toastsEl = $('.toasts', sr);
    shadeEl = $('.shade', sr);
    ctxEl = $('.ctx', sr);
    srchEl = $('.srch', sr);

    // eventos fijos
    $$('.seg button', sr).forEach((b) => b.addEventListener('click', () => setView(b.dataset.v)));
    $('.bnav', sr).addEventListener('click', () => (stack.length > 1 ? goBack() : openMenu()));
    $('.bsearch', sr).addEventListener('click', () => openSearch());
    $('.bset', sr).addEventListener('click', () => openSettings());
    $('.dlleft', sr).addEventListener('click', () => toast(dlLeftText()));
    ctxEl.addEventListener('click', () => setView('list'));
    $('.bplay', sr).addEventListener('click', togglePlay);
    $('.bnext', sr).addEventListener('click', () => step(1, true));
    $('.bprev', sr).addEventListener('click', () => step(-1, true));
    $('.b15', sr).addEventListener('click', () => seekBy(-15));
    $('.f30', sr).addEventListener('click', () => seekBy(30));
    $('.mplay', sr).addEventListener('click', togglePlay);
    $('.mnext', sr).addEventListener('click', () => step(1, true));
    $('.mexp', sr).addEventListener('click', showCurrentInFeed);
    $('.mfav', sr).addEventListener('click', () => current && toggleFav(current));
    $('.mm', sr).addEventListener('click', showCurrentInFeed);
    $('.fab', sr).addEventListener('click', () => {
      SS.del('closed');
      if (cur) openApp(prefs.startView);
      else location.href = startUrl() + '#sx=' + prefs.startView;
    });
    shadeEl.addEventListener('click', closeSheets);
    $$('.sclose', sr).forEach((b) => b.addEventListener('click', closeSheets));
    $('.sback', sr).addEventListener('click', closeSearch);
    $('.srow', sr).addEventListener('submit', (e) => { e.preventDefault(); doSearch($('.sq', srchEl).value); });
    setupBar($('.bar', sr));
    setupListEvents();
    feedEl.addEventListener('scroll', onFeedScroll, { passive: true });
    setupGestures();
    app.addEventListener('click', unlockPlayers, true);
    // Girar la pantalla (o cualquier cambio de ancho) mueve el scroll del feed sin que nadie haya deslizado:
    // se sujeta el feed en la canción activa hasta que todo se asiente.
    let rzT = 0;
    const widthChanged = () => !!feedEl.clientWidth && feedEl.clientWidth !== feedW;
    window.addEventListener('orientationchange', () => { if (isOpen && view === 'feed') holdFeed(900); });
    window.addEventListener('resize', () => {
      if (!isOpen || view !== 'feed') return;
      if (widthChanged()) { holdFeed(700); return; }
      clearTimeout(rzT);
      rzT = setTimeout(() => { if (isOpen && view === 'feed' && performance.now() > holdUntil) layoutCards(); }, 150);
    });
    try {
      new ResizeObserver(() => { if (isOpen && view === 'feed' && widthChanged()) holdFeed(700); }).observe(feedEl);
    } catch (e) {}
    // al volver a Safari (o desbloquear), el feed se recoloca en la que está sonando
    const resync = () => { if (!document.hidden && isOpen && view === 'feed') holdFeed(350); };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('pageshow', resync);
    setupImmersive();
    window.addEventListener('pageshow', (e) => {
      if (!e.persisted || isOpen || !reopenOnReturn || !cur) return;
      reopenOnReturn = false;
      SS.del('closed');
      openApp(view);
    });
    window.addEventListener('popstate', (e) => {
      if (!isOpen) return;
      const d = e.state && typeof e.state.sx === 'number' ? e.state.sx : 0;
      if (d < stack.length - 1) popTo(d);
    });
  }

  /* ───────────── abrir / cerrar / vistas ───────────── */
  function openApp(v) {
    isOpen = true;
    vpMeta.apply();
    document.documentElement.classList.add('sx-open');
    root.classList.add('open');
    $$('audio, video').forEach((m) => { try { m.pause(); } catch (e) {} });
    window.scrollTo(0, 0);
    setView(v || view);
    updateCounters();
    immApply();
  }
  // `away`: se cierra solo para enseñar una página de la web; al volver atrás la app se abre otra vez.
  let reopenOnReturn = false;
  function closeApp(away) {
    isOpen = false;
    reopenOnReturn = !!away;
    SS.set('closed', 1);
    root.classList.remove('open');
    immApply();
    document.documentElement.classList.remove('sx-open');
    vpMeta.restore();
    audio.pause();
    wantPlay = false;
  }

  /* ───────────── barra de Safari (modo inmersivo) ───────────── */
  // El iPhone no deja a una web ponerse en pantalla completa, pero Safari encoge su barra cuando el usuario
  // desliza LA PÁGINA hacia arriba (en horizontal, la esconde). Con este modo, la página que queda debajo de
  // la app (vacía) se puede deslizar: un gesto hacia arriba encoge la barra y, hecho eso, se impide el gesto
  // contrario (deslizar la página hacia abajo), que es lo que la haría volver. Tocar la barra la recupera.
  //   armado    = el feed deja pasar el gesto vertical a la página (la barra está grande o no se sabe)
  //   bloqueado = el feed vuelve a ser solo horizontal, como sin este modo (la barra ya está pequeña)
  const imm = { on: false, paused: false, armed: false, y0: 0, h: 0, w: 0, sab: 0, t0: 0, lockT: 0, log: [] };
  const immSab = () => { const p = root && $('.sap', root); return p ? p.offsetHeight : 0; };
  function immLog(ev) {
    let vv = null;
    try { vv = window.visualViewport ? Math.round(window.visualViewport.height) : null; } catch (e) {}
    imm.log.push({ t: Math.round((performance.now() - imm.t0) / 100) / 10, ev, y: Math.round(window.scrollY), ih: window.innerHeight, vv, sab: immSab() });
    if (imm.log.length > 16) imm.log.shift();
  }
  function immArm(why) {
    if (!imm.on || imm.paused) return;
    clearTimeout(imm.lockT);
    // de paso, volver al principio del recorrido si se está acabando (la barra está grande: no molesta)
    if (window.scrollY > 36000) window.scrollTo(0, 0);
    imm.y0 = window.scrollY;
    imm.h = 0;
    if (imm.armed) return;
    imm.armed = true;
    root.classList.add('imm-armed');
    immLog('armar:' + why);
  }
  function immLock() {
    imm.h = 0; // la medida anterior ya no vale hasta volver a medir
    imm.armed = false;
    root.classList.remove('imm-armed');
    immLog('bloquear');
    // cuando la barra termina de encogerse, apuntar cómo queda la pantalla para notar si vuelve a crecer
    clearTimeout(imm.lockT);
    imm.lockT = setTimeout(() => { imm.h = window.innerHeight; imm.w = window.innerWidth; imm.sab = immSab(); immLog('medido'); }, 700);
  }
  // ¿Ha vuelto a salir la barra? (la pantalla útil se encoge o crece el margen inferior)
  function immCheck() {
    if (!imm.on || imm.armed || !imm.h) return;
    if (window.innerWidth !== imm.w) { immArm('giro'); return; }
    if (window.innerHeight < imm.h - 24 || immSab() > imm.sab + 8) immArm('barra');
  }
  // Fuera del feed: si el gesto movería la página hacia abajo (dedo bajando) y no hay una lista que lo absorba, se impide.
  let immT = null;
  const immScroller = (e) => {
    const path = e.composedPath ? e.composedPath() : [];
    for (const n of path) {
      if (n === app) break;
      if (!n || n.nodeType !== 1) continue;
      if (n.scrollHeight > n.clientHeight + 1) {
        const oy = getComputedStyle(n).overflowY;
        if (oy === 'auto' || oy === 'scroll') return n;
      }
    }
    return null;
  };
  const immStart = (e) => {
    immT = null;
    if (!imm.on || e.touches.length !== 1) return;
    const t = e.touches[0];
    const own = !!(e.target.closest && (e.target.closest('.feed') || e.target.closest('.controls')));
    immT = { x: t.clientX, y: t.clientY, own, sc: own ? null : immScroller(e), block: false, dec: false };
  };
  const immMove = (e) => {
    const q = immT;
    if (!q || q.own || !imm.on) return; // feed y controles: lo decide setupGestures
    if (q.block) { if (e.cancelable) e.preventDefault(); return; }
    if (q.dec) return;
    const t = e.touches[0];
    const dx = t.clientX - q.x;
    const dy = t.clientY - q.y;
    if (!dx && !dy) return;
    q.dec = true;
    if (dy > 0 && dy >= Math.abs(dx) && !q.sc) { q.block = true; if (e.cancelable) e.preventDefault(); }
  };
  // Con el teclado abierto Safari mueve la página a su aire: se deja fija hasta que se cierra.
  function immPause(p) {
    if (!imm.on || imm.paused === p) return;
    imm.paused = p;
    document.documentElement.classList.toggle('sx-imm', !p);
    immLog(p ? 'teclado' : 'sin teclado');
    if (p) { clearTimeout(imm.lockT); imm.armed = false; root.classList.remove('imm-armed'); imm.h = 0; } else immArm('teclado');
  }
  function immApply() {
    if (!root) return;
    const want = isOpen && !!prefs.immersive && TOUCH;
    document.documentElement.classList.toggle('sx-imm', want && !imm.paused);
    root.classList.toggle('imm', want);
    if (want === imm.on) return;
    imm.paused = false;
    imm.on = want;
    if (want) {
      imm.t0 = performance.now();
      imm.log = [];
      imm.armed = false;
      imm.h = 0;
      app.addEventListener('touchstart', immStart, { capture: true, passive: true });
      app.addEventListener('touchmove', immMove, { capture: true, passive: false });
      immArm('abrir');
      const k = LS.get('immHint', 0);
      if (k < 3) { LS.set('immHint', k + 1); setTimeout(() => { if (imm.on && imm.armed) toast('Desliza hacia arriba para esconder la barra de Safari'); }, 1500); }
    } else {
      clearTimeout(imm.lockT);
      imm.armed = false;
      root.classList.remove('imm-armed');
      app.removeEventListener('touchstart', immStart, { capture: true });
      app.removeEventListener('touchmove', immMove, { capture: true });
      window.scrollTo(0, 0);
    }
  }
  function setupImmersive() {
    window.addEventListener('scroll', () => {
      if (!imm.on || imm.paused) return;
      const y = window.scrollY;
      if (y < imm.y0) imm.y0 = y;
      else if (imm.armed && y - imm.y0 >= 24) immLock();
    }, { passive: true });
    window.addEventListener('resize', immCheck);
    window.addEventListener('orientationchange', () => immArm('giro'));
    const back = () => { if (!document.hidden) immArm('volver'); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('pageshow', back);
    try { if (window.visualViewport) window.visualViewport.addEventListener('resize', immCheck); } catch (e) {}
    try {
      const ro = new ResizeObserver(immCheck);
      ro.observe(app);
      ro.observe($('.sap', root));
    } catch (e) {}
  }
  function switchView(v) {
    view = v === 'list' ? 'list' : 'feed';
    app.dataset.view = view;
    $$('.seg button', root).forEach((b) => b.classList.toggle('on', b.dataset.v === view));
    SS.set('view', view);
  }
  function setView(v) {
    // si sales del feed a mitad de un deslizamiento, la tarjeta a la que ibas ya cuenta
    if (view === 'feed' && v === 'list' && isOpen) {
      clearTimeout(settleT);
      const t = deck[activeIdx];
      if (t && current && current.id !== t.id) load(t, wantPlay);
    }
    switchView(v);
    if (view === 'feed') {
      feedJump(activeIdx);
      paintProgress();
      requestAnimationFrame(() => {
        layoutCards();
        feedJump(activeIdx);
        onActive(activeIdx, true);
        // en el feed suena lo que se ve
        const t = deck[activeIdx];
        if (isOpen && t && current && current.id !== t.id) onSettle();
      });
    } else {
      prepList();
      paintProgress();
    }
    syncHash();
  }
  // Deja la lista en el día de la canción actual y, si algo suena, centrada en ella.
  function prepList() {
    if (cur && cur.mode === 'day' && current && byId.has(current.id)) {
      const k = days.indexOf(current.day);
      if (k >= 0 && k !== listDay) { listDay = k; listDirty = true; }
    }
    const fresh = listDirty;
    if (listDirty) renderList();
    const r = current && listRowById(current.id);
    const playing = current && (!audio.paused || audio.currentTime > 0);
    if (r && playing) listEl.scrollTop = Math.max(0, r.offsetTop - (listEl.clientHeight - r.offsetHeight) / 2);
    else if (fresh) listEl.scrollTop = 0;
  }
  // Desde el mini reproductor: enseñar en el feed lo que está sonando.
  function showCurrentInFeed() {
    if (!current) { setView('feed'); return; }
    if (byId.has(current.id)) {
      if (!deckPos.has(current.id)) { forced.add(current.id); buildDeck(); renderFeed(); }
      activeIdx = deckPos.get(current.id) || 0;
      setView('feed');
      return;
    }
    // la que suena es de otra lista: volver a ella si está en el camino de vuelta
    for (let d = stack.length - 2; d >= 0; d--) {
      const s = stack[d];
      if (!s.tracks.some((t) => t.id === current.id)) continue;
      s.at = current.id;
      s.view = 'feed';
      s.forced.add(current.id);
      try {
        if (history.state && history.state.sx === stack.length - 1) { history.go(d - (stack.length - 1)); return; }
      } catch (e) {}
      popTo(d);
      return;
    }
    // o es de la lista que se dejó al cambiar de sección: volver a ella
    if (queueOn()) {
      const q = queue;
      stash();
      q.src.at = current.id;
      q.src.forced.add(current.id);
      stack = q.stack.slice();
      switchView('feed');
      adopt(q.src);
      return;
    }
    setView('feed');
  }
  let hashT = 0;
  function syncHash() {
    clearTimeout(hashT);
    hashT = setTimeout(() => {
      try {
        const h = 'sx=' + view + (deck[activeIdx] ? '&id=' + deck[activeIdx].id : '');
        history.replaceState(history.state, '', location.pathname + location.search + '#' + h);
      } catch (e) {}
      saveNav();
    }, 350);
  }

  /* ───────────── gestos ───────────── */
  // Izquierda/derecha = siguiente/anterior (scroll nativo del feed). Abajo = ir a la lista.
  function setupGestures() {
    const EDGE = 20;
    let g = null;
    const start = (e) => {
      g = null;
      scrollLock = null; // el dedo manda sobre cualquier desplazamiento en curso
      if (view === 'feed' && e.currentTarget === feedEl) touchFeed();
      if (e.touches.length !== 1 || view !== 'feed' || (e.target.closest && e.target.closest('.bar'))) return;
      const t = e.touches[0];
      const inFeed = e.currentTarget === feedEl;
      const edge = inFeed && (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE);
      g = { x: t.clientX, y: t.clientY, mode: '', dx: 0, dy: 0, manual: edge || !inFeed, inFeed };
      // en el borde de la pantalla Safari tiene su gesto de "atrás": lo evitamos y pasamos de canción nosotros
      if (edge && e.cancelable) e.preventDefault();
    };
    const move = (e) => {
      if (!g || g.mode === 'n') return;
      const t = e.touches[0];
      g.dx = t.clientX - g.x;
      g.dy = t.clientY - g.y;
      if (!g.mode) {
        const ax = Math.abs(g.dx);
        const ay = Math.abs(g.dy);
        // modo inmersivo: un dedo que baja movería la página hacia abajo y Safari volvería a sacar su barra
        if (imm.on && (imm.armed || !g.inFeed) && g.dy > 0 && ay >= ax) { g.manual = true; if (e.cancelable) e.preventDefault(); }
        if (ax < 10 && ay < 10) return;
        if (ay > ax * 1.3) g.mode = g.dy > 0 ? 'y' : 'n';
        else g.mode = g.manual ? 'x' : 'n'; // horizontal dentro del feed: lo hace el scroll nativo
        // hacia arriba con el feed bloqueado: por si la barra ha vuelto sin que se note, el siguiente gesto ya la esconde
        if (g.mode === 'n' && ay > ax * 1.3 && imm.on && !imm.armed && g.inFeed) immArm('gesto');
        if (g.mode === 'n') return;
      }
      if (e.cancelable) e.preventDefault();
      // hacia abajo: en cuanto el dedo baja lo suficiente, a la lista (sin animaciones)
      if (g.mode === 'y' && g.dy > 64) { g.mode = 'done'; setView('list'); }
    };
    const end = (e) => {
      const q = g;
      g = null;
      if (!q || !q.mode || q.mode === 'n') return;
      if (e.cancelable) e.preventDefault(); // que no cuente como toque en un botón
      if (q.mode === 'y' && e.type === 'touchend' && q.dy > 36) setView('list');
      else if (q.mode === 'x' && e.type === 'touchend' && Math.abs(q.dx) > 45) step(q.dx < 0 ? 1 : -1, false);
    };
    [feedEl, ctrlEl].forEach((n) => {
      n.addEventListener('touchstart', start, { passive: false });
      n.addEventListener('touchmove', move, { passive: false });
      n.addEventListener('touchend', end, { passive: false });
      n.addEventListener('touchcancel', end, { passive: false });
    });
    // mini reproductor (lista): arriba = volver al feed, izquierda/derecha = siguiente/anterior
    let m = null;
    miniEl.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      m = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
    }, { passive: true });
    miniEl.addEventListener('touchend', (e) => {
      const q = m;
      m = null;
      const t = e.changedTouches && e.changedTouches[0];
      if (!q || !t) return;
      const dx = t.clientX - q.x;
      const dy = t.clientY - q.y;
      if (dy < -30 && Math.abs(dy) > Math.abs(dx) * 1.3) {
        if (e.cancelable) e.preventDefault();
        showCurrentInFeed();
      } else if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (e.cancelable) e.preventDefault();
        step(dx < 0 ? 1 : -1, true);
      }
    }, { passive: false });
  }

  /* ───────────── cola: lo que suena mientras se mira otra lista ───────────── */
  // Al cambiar de lista la canción sigue sonando y su lista de origen queda como cola: al acabar (o con
  // siguiente / anterior) se sigue por ella. La cola se suelta al elegir una canción de la lista que se mira.
  // (En el feed no hay cola: ahí suena lo que se ve.)
  let queue = null; // { src, stack, list, moved }
  const queueOn = () => !!(queue && current && view === 'list' && cur !== queue.src && queue.list.some((t) => t.id === current.id));
  // Antes de cambiar de fuente: si lo que suena es de la que se deja, su orden pasa a ser la cola.
  function keepQueue() {
    if (!current) { queue = null; return; }
    if (queueOn()) return; // suena algo de otra lista: su cola sigue valiendo
    if (!byId.has(current.id)) return;
    const order = view === 'list' && listOrder.includes(current.id) ? listOrder.map((id) => byId.get(id)).filter(Boolean) : deck.slice();
    queue = order.some((t) => t.id === current.id) ? { src: cur, stack: stack.slice(), list: order, moved: false } : null;
  }
  function stepQueue(d, play, quiet) {
    const k = queue.list.findIndex((t) => t.id === current.id);
    const t = queue.list[k + d];
    if (!t) { if (!quiet) toast(d > 0 ? 'Fin de «' + queue.src.title + '»' : 'Es la primera de «' + queue.src.title + '»'); return false; }
    // al volver a esa lista, que esté en la canción que suena
    queue.src.at = t.id;
    queue.src.forced.add(t.id);
    queue.moved = true;
    load(t, play);
    return true;
  }

  /* ───────────── fuentes: abrir, volver, cargar ───────────── */
  function mkSrc(d) {
    return Object.assign({
      kind: 'page', key: null, title: '', url: '', filters: null, canFilter: false, hide: false, loose: false, xhr: false, refId: '', query: '',
      tracks: [], hidden: new Set(), forced: new Set(), pages: newPages(), activeIdx: 0, listDay: 0, listScroll: 0, view: null, mode: 'all',
      loaded: false, loading: null, error: '', msg: '', count: null, follow: null, release: null, cut: 0, live: false, at: null, probe: null,
      web: '', tries: null, filtersOn: '',
    }, d);
  }
  const setHidden = (set) => { hiddenAtLoad = set; if (cur) cur.hidden = set; };
  const setForced = (set) => { forced = set; if (cur) cur.forced = set; };
  function stash() {
    if (!cur) return;
    cur.tracks = tracks;
    cur.hidden = hiddenAtLoad;
    cur.forced = forced;
    cur.activeIdx = activeIdx;
    cur.listDay = listDay;
    cur.view = view;
    if (listEl && view === 'list') cur.listScroll = listEl.scrollTop;
    cur.at = deck[activeIdx] ? deck[activeIdx].id : null;
  }
  // Pone una fuente en pantalla (feed + lista).
  function adopt(s) {
    cur = s;
    tracks = s.tracks;
    hiddenAtLoad = s.hidden;
    forced = s.forced;
    pages = s.pages;
    listDay = s.listDay || 0;
    indexTracks();
    if (queue && s === queue.src) {
      // de vuelta en la lista de lo que suena: si la cola ha avanzado, la lista se pone en el día de la canción
      if (queue.moved && s.mode === 'day' && current && byId.has(current.id)) { const k = days.indexOf(byId.get(current.id).day); if (k >= 0) listDay = k; }
      queue = null;
    }
    buildDeck();
    const at = s.at != null ? deckPos.get(s.at) : null;
    activeIdx = at != null ? at : Math.max(0, Math.min(s.activeIdx || 0, deck.length));
    renderFeed();
    listDirty = true;
    paintChrome();
    if (view === 'list') {
      renderList();
      listEl.scrollTop = s.listScroll || 0;
    } else {
      feedJump(activeIdx);
      requestAnimationFrame(() => {
        if (cur !== s) return;
        layoutCards();
        feedJump(activeIdx);
        onActive(activeIdx, true);
        // en el feed suena lo que se ve
        if (isOpen && s.loaded && deck[activeIdx]) onSettle();
      });
    }
    syncHash();
  }
  function paintChrome() {
    if (!root) return;
    const deep = stack.length > 1;
    const nav = $('.bnav', root);
    nav.innerHTML = i(deep ? 'chev' : 'menu');
    nav.setAttribute('aria-label', deep ? 'Atrás' : 'Secciones');
    // en el feed, una etiqueta con dónde estás (salvo en la sección de siempre)
    const show = !!cur && (deep || cur.key !== startListKey() || cur.kind !== 'section');
    app.classList.toggle('has-ctx', show);
    $('.ct', ctxEl).textContent = cur ? (kindName(cur) ? kindName(cur) + ' · ' : '') + cur.title : '';
    $('.cs', ctxEl).textContent = '';
  }
  const kindName = (s) => ({ artist: 'Artista', label: 'Sello', release: 'Release', search: 'Búsqueda', genre: 'Género', similar: 'También descargan' }[s.kind] || '');
  const sameUrl = (a, b) => { try { const x = new URL(a, location.href); const y = new URL(b, location.href); return x.pathname === y.pathname && normFilters(filtersFromUrl(x.href)) === normFilters(filtersFromUrl(y.href)) && (x.searchParams.get('q') || '') === (y.searchParams.get('q') || '') && (x.searchParams.get('page') || '1') === (y.searchParams.get('page') || '1'); } catch (e) { return false; } };
  function openSource(d, opts) {
    opts = opts || {};
    closeSheets();
    closeSearch();
    if (cur && !opts.root && !opts.replace && cur.url && sameUrl(cur.url, d.url)) {
      if (opts.view && opts.view !== view) setView(opts.view);
      return cur;
    }
    keepQueue();
    stash();
    // la lista con la que arrancó la página (o la de lo que está sonando) ya está cargada: no hace falta pedirla otra vez
    const known = opts.root ? [liveSrc, queue && queue.stack.length === 1 ? queue.src : null].find((x) => x && x.loaded && !x.error && x.kind === d.kind && sameUrl(x.url, d.url)) : null;
    let s = known || mkSrc(d);
    if (opts.root) stack = [s];
    else if (opts.replace) stack[stack.length - 1] = s;
    else {
      stack.push(s);
      try { history.pushState({ sx: stack.length - 1 }, '', location.href); } catch (e) {}
    }
    if (opts.view) switchView(opts.view);
    if (!s.loaded) ensureLoaded(s);
    adopt(s);
    return s;
  }
  function goBack() {
    if (stack.length <= 1) return;
    try {
      if (history.state && history.state.sx === stack.length - 1) { history.back(); return; }
    } catch (e) {}
    popTo(stack.length - 2);
  }
  function popTo(depth) {
    if (depth < 0 || depth >= stack.length - 1) return;
    closeSheets();
    closeSearch();
    keepQueue();
    stash();
    stack.length = depth + 1;
    const s = stack[depth];
    if (s.view) switchView(s.view);
    if (!s.loaded) ensureLoaded(s);
    adopt(s);
  }
  // Soundeo contesta con una página o, en sus bloques "perezosos", con JSON que lleva el HTML dentro.
  function docFromText(txt) {
    const t = String(txt || '').trim();
    if (t[0] === '{' || t[0] === '[') {
      try {
        let best = '';
        const walk = (v) => {
          if (typeof v === 'string') { if (v.length > best.length && /data-track|trackitem/.test(v)) best = v; }
          else if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k]));
        };
        walk(JSON.parse(t));
        return new DOMParser().parseFromString('<section class="content"><div class="left">' + best + '</div></section>', 'text/html');
      } catch (e) {}
    }
    return new DOMParser().parseFromString(txt, 'text/html');
  }
  function fetchDoc(url, xhr) {
    const init = { credentials: 'include' };
    if (xhr) init.headers = { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/html, */*; q=0.01' };
    return fetch(url, init).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text().then((html) => ({ doc: docFromText(html), finalUrl: r.url || url }));
    });
  }
  // Seguidos se pide sin filtros; si a Soundeo no le sirve esa petición (o no devuelve nada), se pide como siempre.
  function fetchSource(s) {
    const first = fetchDoc(s.url, s.xhr);
    if (s.key !== 'followed' || s.url.indexOf('?') < 0) return first;
    const plain = s.url.split('?')[0];
    const again = (r) => fetchDoc(plain).then((r2) => { if (!r || parseTracks(r2.doc, '', plain).length) { s.url = plain; return r2; } return r; }, (e) => { if (r) return r; throw e; });
    return first.then((r) => (parseTracks(r.doc, '', s.url).length ? r : again(r)), () => again(null));
  }
  function ensureLoaded(s) {
    if (s.loaded) return Promise.resolve(s);
    if (s.loading) return s.loading;
    s.error = '';
    s.loading = (s.kind === 'similar' ? fetchSimilar(s) : fetchSource(s))
      .then(({ doc, finalUrl }) => { applyDoc(s, doc, finalUrl); s.loaded = true; })
      .catch((e) => {
        // Soundeo no tiene ese bloque para esta canción: no es un fallo que se arregle reintentando
        if (e && e.none) { s.tracks = []; s.loaded = true; s.msg = 'Soundeo no tiene «también descargan» para esta canción.'; return; }
        s.error = short(e && e.message, 90) || 'error';
      })
      .then(() => { s.loading = null; if (s === cur) adopt(s); return s; });
    return s.loading;
  }
  // Páginas que no hacen caso a los filtros por URL: el género se filtra aquí.
  function localFilter(s, list) {
    if (!(s.loose && s.filters && s.filters.genres && s.filters.genres.length)) return list;
    const set = new Set(s.filters.genres.map(String));
    const kept = list.filter((t) => !t.genreId || set.has(t.genreId));
    s.cut += list.length - kept.length;
    return kept;
  }
  function listModeFor(list) {
    const ds = new Set(list.map((t) => t.day));
    return list.some((t) => parseDay(t.day)) && list.length / ds.size >= 12 ? 'day' : 'all';
  }
  function applyDoc(s, doc, finalUrl) {
    const info = readDoc(doc, s.url);
    if (s.key === 'top100') info.tracks.forEach((t, k) => { t.rank = k + 1; });
    s.cut = 0;
    s.tracks = localFilter(s, info.tracks);
    const first = s.pages ? s.pages.first : 1;
    s.pages = newPages(first);
    s.pages.next = info.next;
    s.pages.hasMore = !!info.next && info.tracks.length > 0;
    s.count = info.count;
    s.follow = info.follow;
    s.release = info.release;
    s.msg = info.msg;
    s.filtersOn = info.filtersOn;
    if (info.title && /^(artist|label|release|page)$/.test(s.kind)) s.title = info.title;
    s.mode = listModeFor(s.tracks);
    s.hidden = s.hide ? hiddenFor(s.tracks) : new Set();
    s.forced = new Set();
    if (s.at) s.forced.add(s.at);
    s.probe = null;
    if (!info.tracks.length) {
      // sin tracks: guardar cómo es la página (para el diagnóstico) y avisar si Soundeo ha mandado a otro sitio
      s.probe = pageShape(doc);
      try {
        const fp = new URL(finalUrl).pathname;
        if (fp !== new URL(s.url).pathname) s.msg = s.msg || 'Soundeo ha redirigido a ' + fp;
      } catch (e) {}
    }
  }
  // Cambiar los filtros de la fuente actual (desde Ajustes).
  function refilter(f) {
    const s = cur;
    f = cleanFilters(f);
    let d;
    if (s.loose) d = sectionDesc(s.key, f);
    else if (s.kind === 'genre' && f.genres.length === 1) d = Object.assign(genreDesc(f.genres[0]), { filters: f, url: buildListUrl(f) });
    else d = sectionDesc(String(f.available) === '0' ? 'all' : 'avail', f);
    openSource(d, stack.length > 1 ? { replace: true } : { root: true });
  }
  // Cambiar de sección se abre en lista: se mira lo que hay sin cortar lo que suena.
  function openSection(key) {
    if (stack.length === 1 && cur && cur.key === key && cur.kind === 'section' && !cur.error) { toast('Ya estás en ' + sectionByKey(key).name); return; }
    openSource(sectionDesc(key), { root: true, view: 'list' });
  }
  function saveNav() {
    try {
      if (!cur) return;
      SS.set('nav', stack.map((s) => ({
        kind: s.kind, key: s.key, title: s.title, url: s.url, filters: s.filters, canFilter: s.canFilter, hide: s.hide, loose: s.loose, xhr: s.xhr,
        refId: s.refId, query: s.query, web: s.web, live: s.live, view: s === cur ? view : s.view, at: s === cur ? (deck[activeIdx] ? deck[activeIdx].id : null) : s.at,
      })));
    } catch (e) {}
  }
  function openMenu() {
    const here = stack.length === 1 && cur && cur.kind === 'section' ? cur.key : '';
    const opts = SECTIONS.map((sec) => ({ label: sec.name, hint: sec.hint, icon: sec.icon, small: here === sec.key ? '●' : '', fn: () => openSection(sec.key) }));
    opts.push({ label: 'Buscar', hint: 'Como el buscador de la web', icon: 'search', fn: () => openSearch() });
    actionSheet('Secciones', '', '', opts);
  }

  /* ───────────── buscador ───────────── */
  function openSearch(prefill) {
    closeSheets();
    srchEl.classList.add('on');
    const inp = $('.sq', srchEl);
    inp.value = typeof prefill === 'string' ? prefill : cur && cur.kind === 'search' ? cur.query : '';
    paintRecent();
    try { inp.focus(); inp.select(); } catch (e) {}
  }
  function closeSearch() {
    if (!srchEl || !srchEl.classList.contains('on')) return;
    srchEl.classList.remove('on');
    try { $('.sq', srchEl).blur(); } catch (e) {}
  }
  function paintRecent() {
    const body = $('.sbody', srchEl);
    const rec = LS.get('searches', []);
    body.textContent = '';
    if (!rec.length) {
      body.appendChild(el('<div class="note" style="padding:18px 4px">Busca por artista, título o sello. Los resultados salen como lista de tracks.</div>'));
      return;
    }
    body.appendChild(el('<div class="sec">Recientes</div>'));
    rec.forEach((q) => {
      const b = el(`<button class="opt">${i('search')}<span>${esc(q)}</span></button>`);
      b.addEventListener('click', () => doSearch(q));
      body.appendChild(b);
    });
    const clr = el('<button class="opt" style="color:var(--mut)"><span>Borrar recientes</span></button>');
    clr.addEventListener('click', () => { LS.set('searches', []); paintRecent(); });
    body.appendChild(clr);
  }
  function doSearch(q) {
    q = clean(q);
    if (q.length < 2) { toast('Escribe al menos 2 letras'); return; }
    const rec = LS.get('searches', []).filter((x) => x.toLowerCase() !== q.toLowerCase());
    rec.unshift(q);
    LS.set('searches', rec.slice(0, 12));
    closeSearch();
    openSource(searchDesc(q), { view: 'list', replace: !!(cur && cur.kind === 'search' && stack.length > 1) });
  }

  /* ───────────── ir a artista / sello / release / género ───────────── */
  function openArtist(t) {
    const go = (list) => {
      if (!list || !list.length) {
        // sin ficha de artista: buscar por nombre
        const name = clean(String(t.artist || '').split(/,| & | feat\.? | ft\.? | vs\.? /i)[0]);
        if (name) openSource(searchDesc(name), { view: 'list' });
        else toast('No encuentro el artista');
        return;
      }
      if (list.length === 1) { openSource(artistDesc(list[0][0], list[0][1]), { view: 'list' }); return; }
      actionSheet('Artistas', t.name, '', list.map((a) => ({ label: a[1], icon: 'user', fn: () => openSource(artistDesc(a[0], a[1]), { view: 'list' }) })));
    };
    const m = metaCache[t.id];
    if (m && m.ar) { go(m.ar); return; }
    const s0 = cur;
    toast('Buscando el artista…');
    getMeta(t, true, true).then((mm) => { if (cur === s0) go(mm && mm.ar); });
  }
  const openLabel = (t) => { if (t.labelId) openSource(labelDesc(t.labelId, t.label), { view: 'list' }); };
  const openRelease = (t) => { if (t.releaseUrl) openSource(releaseDesc(t.releaseUrl, t.release), { view: 'list' }); };
  const openGenre = (t) => { if (t.genreId) openSource(genreDesc(t.genreId, t.genre), { view: 'list' }); };
  // "Show what members also download" de la página del track
  const openSimilar = (t) => openSource({ kind: 'similar', title: t.name, xhr: true, web: t.trackUrl || '', url: location.origin + '/tracks/recommend/' + encodeURIComponent(t.id) }, { view: 'list' });
  // El bloque «members also download» es perezoso: la página del track trae <div id="relatedTracksContainer" data-url="/tracks/recommend/ID">
  // y la web lo pide al pulsar. No se sabe con qué tipo de petición: se prueba GET; si falla, se mira la página del track
  // (¿existe el bloque?, ¿con qué dirección?) y se prueba POST. Lo que pasa en cada intento queda para el diagnóstico.
  function fetchSimilar(s) {
    const tries = [];
    s.tries = tries;
    const has = (r) => parseTracks(r.doc, '', s.url).length > 0;
    const post = (url) => fetch(url, { method: 'POST', credentials: 'include', body: '', headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*; q=0.01', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text().then((html) => ({ doc: docFromText(html), finalUrl: r.url || url })); });
    const attempt = (label, fn) => fn().then((r) => { tries.push(label + ': ' + (has(r) ? 'ok' : 'sin tracks')); return has(r) ? r : null; }, (e) => { tries.push(label + ': ' + short(e && e.message, 40)); return null; });
    const none = () => { const e = new Error('none'); e.none = true; throw e; };
    return attempt('GET', () => fetchDoc(s.url, true)).then((r) => {
      if (r) return r;
      if (!s.web) return attempt('POST', () => post(s.url)).then((r2) => r2 || none());
      return fetch(s.web, { credentials: 'include' }).then((x) => x.text()).then((html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const box = $('#relatedTracksContainer[data-url], [data-url*="/tracks/recommend"]', doc);
        const inPage = box ? parseTracks(box, '', s.web) : [];
        tries.push('página: ' + (box ? 'bloque ' + short(box.getAttribute('data-url'), 60) : 'sin bloque'));
        if (inPage.length) return { doc: new DOMParser().parseFromString('<section class="content"><div class="left">' + box.innerHTML + '</div></section>', 'text/html'), finalUrl: s.web };
        if (!box) return none();
        const u = absUrl(box.getAttribute('data-url'), s.web);
        return attempt('POST', () => post(u)).then((r2) => r2 || (u !== s.url ? attempt('GET bloque', () => fetchDoc(u, true)) : null)).then((r3) => r3 || none());
      }, (e) => { tries.push('página: ' + short(e && e.message, 40)); return attempt('POST', () => post(s.url)).then((r2) => r2 || none()); });
    });
  }

  /* ───────────── seguir a un artista o sello ───────────── */
  function toggleFollow(s) {
    const f = s.follow;
    if (!f || f.busy) return;
    f.busy = true;
    const want = !f.on;
    const act = { type: 'follow', what: f.type, id: f.id, before: f.on };
    lastAction = act;
    startCapture('follow ' + f.type + ' ' + f.id);
    siteRequest('/' + f.type + 's/favor/' + encodeURIComponent(f.id), 'POST')
      .then(({ r }) => {
        act.response = trimResp(r);
        if (!r || r.success === false || r.error) throw new Error(r && (r.message || r.error) ? plainMsg(r.message || r.error).slice(0, 110) : 'Soundeo no lo ha aceptado');
        f.on = typeof r.result === 'string' ? /^(favor|follow)/i.test(r.result) : typeof r.favored === 'boolean' ? r.favored : want;
        act.after = f.on;
        applyHeader(r);
        toast(f.on ? 'Siguiendo a ' + s.title : 'Has dejado de seguir a ' + s.title);
      })
      .catch((e) => toast('No se ha podido: ' + short(e && e.message, 90), 'Diagnóstico', diagnostics))
      .then(() => { f.busy = false; if (s === cur) paintFollow(); });
  }
  function paintFollow() {
    const b = listEl && $('.fol', listEl);
    if (!b || !cur || !cur.follow) return;
    b.textContent = cur.follow.on ? 'Siguiendo' : 'Seguir';
    b.classList.toggle('pri', !cur.follow.on);
  }

  /* ───────────── mazo (feed) ───────────── */
  function indexTracks() {
    byId = new Map();
    days = [];
    dayStat = new Map();
    tracks.forEach((t, k) => {
      byId.set(t.id, t);
      let st = dayStat.get(t.day);
      if (!st) { st = { n: 0, pos: new Map() }; dayStat.set(t.day, st); days.push(t.day); }
      st.n++;
      st.pos.set(t.id, st.n);
      t._pos = k + 1;
    });
  }
  function buildDeck() {
    deck = tracks.filter((t) => !hiddenAtLoad.has(t.id) || forced.has(t.id));
    deckPos = new Map();
    deck.forEach((t, k) => deckPos.set(t.id, k));
  }
  // El feed tiene un hueco por canción, pero solo las cercanas a la activa tienen contenido.
  const HYDRATE = 2;
  const KEEP = 4;
  let filled = new Set();
  let playingCard = null;
  function phCard(t) {
    const c = document.createElement('section');
    c.className = 'card ph';
    c.dataset.id = t.id;
    return c;
  }
  function renderFeed() {
    if (!feedEl) return;
    const frag = document.createDocumentFragment();
    deck.forEach((t) => frag.appendChild(phCard(t)));
    frag.appendChild(endCard());
    feedEl.textContent = '';
    feedEl.appendChild(frag);
    filled = new Set();
    playingCard = null;
    hydrateAround(activeIdx);
    paintPlayer();
    // al rehacer el feed su scroll vuelve a 0: recolocarlo ya, antes de que nadie lea la posición
    if (view === 'feed') feedJump(activeIdx);
    requestAnimationFrame(layoutCards);
  }
  function hydrateAround(idx) {
    const a = Math.max(0, idx - HYDRATE);
    const z = Math.min(deck.length - 1, idx + HYDRATE);
    for (let k = a; k <= z; k++) {
      const c = feedEl.children[k];
      if (c && !filled.has(c)) { fillCard(c, deck[k]); filled.add(c); }
    }
    if (filled.size > 2 * KEEP + 2) {
      filled.forEach((c) => {
        const k = deckPos.get(c.dataset.id);
        if (k == null || Math.abs(k - idx) > KEEP) {
          c.textContent = '';
          c.className = 'card ph';
          filled.delete(c);
          if (playingCard === c) playingCard = null;
        }
      });
    }
  }
  // Posición de la canción dentro de su día (o de la lista) y el total.
  function counterText(t) {
    if (t.rank) return '#' + t.rank;
    if (cur.mode === 'day') {
      const st = dayStat.get(t.day);
      if (!st) return '';
      const k = days.indexOf(t.day);
      const complete = k < days.length - 1 || !pages.hasMore;
      // día sin terminar de cargar: "12/…" mientras llega; si es enorme y se deja de pedir, solo la posición
      return st.pos.get(t.id) + (complete ? '/' + st.n : pages.dayLoads >= 8 ? '' : '/…');
    }
    const total = cur.count || (!pages.hasMore ? tracks.length : 0);
    return (t._pos || '') + (total ? '/' + total : '');
  }
  function fillCard(c, t) {
    const meta = metaCache[t.id];
    const where = [parseDay(t.day) ? dayShort(t.day) : '', t.genre].filter(Boolean).map(esc).join(' · ');
    const small = t.cover ? ' style="background-image:url(&quot;' + esc(t.cover) + '&quot;)"' : '';
    c.className = 'card paused';
    c.innerHTML = `<canvas class="bg" width="32" height="56"></canvas>
      <div class="cin">
        <div class="mid">
          <div class="cvw"${small}><img alt="" decoding="async"><div class="pind">${i('play')}</div><div class="eq"><span></span><span></span><span></span><span></span></div></div>
          <div class="info">
            <div class="itext">
              <div class="eyebrow"><span class="ix">${esc(counterText(t))}</span>${where ? ' · <b>' + where + '</b>' : ''}</div>
              <div class="ttl">${esc(t.name)}</div>
              <div class="mix">${esc(t.mix)}</div>
              <div class="art">${esc(t.artist)}</div>
              <div class="rel">${t.release ? '<span class="relb">' + esc(t.release) + '</span>' : ''}${t.release && t.label ? ' · ' : ''}${t.label ? '<span class="lbl">' + esc(t.label) + '</span>' : ''}</div>
              <div class="chips"><span class="chip key">${metaChipKey(meta)}</span><span class="chip bpmc">${metaChipBpm(meta)}</span>${t.duration ? `<span class="chip mut">${esc(t.duration)}</span>` : ''}${t.explicit ? '<span class="chip e">E</span>' : ''}${t.date ? `<span class="chip mut">${esc(t.date)}</span>` : ''}</div>
            </div>
            <div class="rail">
              <button class="rbtn fav" aria-label="Guardar">${i('star')}</button>
              ${dlButtonHtml(t)}
              <button class="rbtn more" aria-label="Más">${i('more')}</button>
            </div>
          </div>
        </div>
      </div>`;
    const img = $('img', c);
    img.onerror = () => { if (t.cover && img.src !== t.cover) img.src = t.cover; };
    img.src = bigCover(t.cover);
    paintBg($('.bg', c), t.cover);
    $('.cvw', c).addEventListener('click', togglePlay);
    $('.fav', c).addEventListener('click', () => toggleFav(t));
    const dlb = $('.dl', c);
    if (dlb) dlb.addEventListener('click', () => askDownload(t));
    const vb = $('.vote', c);
    if (vb) vb.addEventListener('click', () => vote(t));
    $('.more', c).addEventListener('click', () => moreSheet(t));
    $('.art', c).addEventListener('click', () => openArtist(t));
    const rb = $('.relb', c);
    if (rb) rb.addEventListener('click', () => openRelease(t));
    const lbl = $('.lbl', c);
    if (lbl) lbl.addEventListener('click', () => (t.labelId ? openLabel(t) : moreSheet(t)));
    paintFav(c, t);
    if (current && current.id === t.id) paintPlayer();
  }
  // Fondo difuminado: la portada pequeña reducida a unos pocos píxeles y estirada (sin filtros de desenfoque).
  const bgTmp = document.createElement('canvas');
  bgTmp.width = 8;
  bgTmp.height = 14;
  function paintBg(cv, url) {
    if (!cv || !url) return;
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => {
      try {
        const w = im.naturalWidth;
        const h = im.naturalHeight;
        const side = Math.min(w, h * (8 / 14));
        const sw = side;
        const sh = side * (14 / 8);
        const a = bgTmp.getContext('2d');
        a.imageSmoothingEnabled = true;
        a.imageSmoothingQuality = 'high';
        a.clearRect(0, 0, 8, 14);
        a.drawImage(im, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, 8, 14);
        const x = cv.getContext('2d');
        x.imageSmoothingEnabled = true;
        x.imageSmoothingQuality = 'high';
        x.drawImage(bgTmp, 0, 0, 8, 14, 0, 0, cv.width, cv.height);
        cv.classList.add('on');
      } catch (e) {}
    };
    im.src = url;
  }
  function dlButtonHtml(t) {
    if (t.downloads.length) {
      const done = t.siteDownloaded || myDownloads.has(t.id);
      return `<button class="rbtn dl${done ? ' done' : ''}" aria-label="Descargar">${i(done ? 'check' : 'dl')}</button>`;
    }
    if (t.vote) return `<button class="rbtn vote${isVoted(t) ? ' on' : ''}" aria-label="Me gusta">${voteInner(t)}</button>`;
    return '';
  }
  function metaChipKey(m) {
    return m && m.k ? '<b>' + esc(camelot(m.k)) + '</b>' + esc(m.k) : '';
  }
  function metaChipBpm(m) {
    return m && m.b ? esc(m.b) + ' BPM' : '';
  }
  function layoutCards() {
    if (!feedEl || !feedEl.clientHeight || !root) return;
    const c = feedEl.querySelector('.card:not(.end):not(.ph)');
    if (!c) return;
    const mid = $('.mid', c);
    const info = $('.info', c);
    const ttl = $('.ttl', c);
    root.style.removeProperty('--ih');
    let land = false;
    try { land = matchMedia('(orientation:landscape) and (max-height:500px)').matches; } catch (e) {}
    if (land) {
      // en horizontal la portada va al lado del texto: tan alta como el hueco que queda
      root.style.setProperty('--cv', Math.floor(Math.max(64, Math.min(mid.clientHeight, 220))) + 'px');
      return;
    }
    // alto del bloque de texto con un título de 2 líneas, para que la portada no salte entre tarjetas
    info.style.height = 'auto';
    ttl.style.minHeight = '2.24em';
    const ih = info.offsetHeight;
    ttl.style.minHeight = '';
    info.style.height = '';
    root.style.setProperty('--ih', ih + 'px');
    const avail = mid.clientHeight - ih - 18;
    const cv = Math.max(110, Math.min(feedEl.clientWidth - 40, 440, avail));
    root.style.setProperty('--cv', Math.floor(cv) + 'px');
  }
  function siteMsg(s) {
    let m = s.msg || '';
    if (/not following any/i.test(m)) m = 'Todavía no sigues a ningún artista ni sello. Entra en un artista o un sello y pulsa «Seguir».';
    if (!m) m = s.kind === 'search' ? 'Sin resultados para ' + s.title + '.' : 'Soundeo no ha devuelto ningún track aquí.';
    if (s.cut) m += ' (' + s.cut + ' fuera de tus géneros)';
    return m;
  }
  function endCard() {
    const s = cur || {};
    const hiddenN = tracks.length - deck.length;
    const more = pages.hasMore;
    let h;
    let p;
    if (s.loading && !tracks.length) { h = 'Cargando…'; p = s.title || ''; }
    else if (s.error) { h = 'No se ha podido cargar'; p = s.error; }
    else if (!tracks.length) { h = 'Aquí no hay nada'; p = siteMsg(s); }
    else if (more) { h = 'Cargando más…'; p = 'Trayendo más tracks de Soundeo.'; }
    else if (deck.length) { h = 'Has llegado al final'; p = 'No hay más tracks en esta lista.'; }
    else { h = 'Nada nuevo aquí'; p = 'Ya has escuchado todo lo de esta lista.'; }
    const c = el(`<section class="card end"><div class="cin">
      <h3>${esc(h)}</h3>
      <p>${esc(p)}</p>
      ${more && tracks.length ? '<button class="btn pri bnp">Cargar más</button>' : ''}
      ${s.error ? '<button class="btn pri bretry">Reintentar</button>' : ''}
      ${hiddenN > 0 ? '<button class="btn bsh">Mostrar también las ' + hiddenN + ' escuchadas</button>' : ''}
      ${deck.length ? '<button class="btn btop">Volver al principio</button>' : ''}
      ${!tracks.length && !s.loading && s.url ? '<button class="btn bweb">Abrir en la web</button>' : ''}
      ${stack.length > 1 ? '<button class="btn bbk">Volver</button>' : ''}
    </div></section>`);
    const on = (sel, fn) => { const b = $(sel, c); if (b) b.addEventListener('click', fn); };
    on('.bnp', () => { pages.autoEmpty = 0; loadMore(); });
    on('.bretry', () => { ensureLoaded(s); adopt(s); });
    on('.bsh', () => { setHidden(new Set()); rebuild(deck[activeIdx - 1] || deck[0]); toast('Mostrando también las escuchadas'); });
    on('.btop', () => goTo(0, { instant: true }));
    on('.bweb', () => { closeApp(true); location.href = s.url; });
    on('.bbk', goBack);
    return c;
  }
  function updateCardCounters() {
    filled.forEach((c) => {
      const t = byId.get(c.dataset.id);
      const x = c.querySelector('.ix');
      if (t && x) x.textContent = counterText(t);
    });
  }

  /* ───────────── más páginas de Soundeo (sin recargar) ───────────── */
  function pageUrlFor(url, n) {
    const u = new URL(url, location.href);
    u.hash = '';
    if (n <= 1) u.searchParams.delete('page');
    else u.searchParams.set('page', String(n));
    return u.toString();
  }
  function prevPageUrl() {
    if (!cur || !cur.live || pages.first <= 1) return null;
    return pageUrlFor(location.href, pages.first - 1);
  }
  function loadMore() {
    const s = cur;
    const pg = s.pages;
    if (pg.loading) return pg.loading;
    if (!pg.hasMore) return Promise.resolve([]);
    const n = pg.last + 1;
    // manda el enlace "siguiente" de la propia página, salvo que no lleve a la página que toca
    let url = pg.next;
    if (url) { const pn = parseInt(paramOf(url, 'page') || '0', 10); if (pn && pn !== n) url = null; }
    if (!url) url = pageUrlFor(s.url, n);
    pg.loading = fetchDoc(url, s.xhr)
      .then(({ doc }) => {
        const list = s === cur ? tracks : s.tracks;
        const last = list[list.length - 1];
        const info = readDoc(doc, url, last && last.day);
        if (s.key === 'top100') info.tracks.forEach((t, k) => { t.rank = (pg.last - pg.first + 1) * 100 + k + 1; });
        pg.last = n;
        pg.next = info.next;
        pg.hasMore = !!info.next && info.tracks.length > 0;
        const known = new Set(list.map((t) => t.id));
        const fresh = localFilter(s, info.tracks).filter((t) => t.id && !known.has(t.id));
        if (s.hide) hiddenFor(fresh).forEach((id) => s.hidden.add(id));
        s.tracks = list.concat(fresh);
        if (s === cur) { tracks = s.tracks; onTracksAdded(fresh); }
        return fresh;
      })
      .catch((e) => { if (s === cur) toast('No se pudo cargar más: ' + short(e && e.message, 60)); return []; })
      .then((res) => {
        pg.loading = null;
        if (s === cur) {
          // seguir si hace falta: completar el día del contador o tener más tarjetas por delante
          const t = deck[activeIdx];
          if (t) wantDay(t);
          if (view === 'feed' && activeIdx >= deck.length - 4) maybeLoadMore();
          if (!pg.loading) refreshEnd();
        }
        return res;
      });
    return pg.loading;
  }
  function refreshEnd() {
    const end = feedEl && feedEl.lastElementChild;
    if (end && end.classList.contains('end')) end.replaceWith(endCard());
  }
  function onTracksAdded(fresh) {
    const before = deck.length;
    const daysBefore = days.length;
    indexTracks();
    buildDeck();
    const end = feedEl.lastElementChild;
    const frag = document.createDocumentFragment();
    deck.slice(before).forEach((t) => frag.appendChild(phCard(t)));
    feedEl.insertBefore(frag, end);
    end.replaceWith(endCard());
    hydrateAround(activeIdx);
    updateCardCounters();
    if (deck.length > before) pages.autoEmpty = 0;
    else pages.autoEmpty++;
    if (days.length > daysBefore) pages.dayLoads = 0;
    listTracksAdded(fresh);
  }
  function maybeLoadMore() {
    // carga automática cerca del final; si varias páginas seguidas no traen nada nuevo, espera a un toque
    if (pages.hasMore && !pages.loading && pages.autoEmpty < 3) loadMore();
  }
  // Para que el contador pueda decir "12/175", hace falta tener el día entero (puede seguir en más páginas).
  const bootAt = performance.now();
  let dayT = 0;
  function wantDay(t) {
    if (!cur || cur.mode !== 'day' || !pages.hasMore || pages.loading) return;
    if (days.indexOf(t.day) !== days.length - 1 || pages.dayLoads >= 8) return;
    const s = cur;
    clearTimeout(dayT);
    // al arrancar, primero la canción y la portada; el resto del día puede esperar un momento
    dayT = setTimeout(() => {
      if (s !== cur || pages.loading || !pages.hasMore) return;
      pages.dayLoads++;
      loadMore();
    }, Math.max(400, 1500 - (performance.now() - bootAt)));
  }
  function goPage(delta) {
    const u = delta < 0 ? prevPageUrl() : null;
    if (!u) return;
    SS.set('autoplay', wantPlay ? 1 : 0);
    location.href = u.split('#')[0] + '#sx=' + view;
  }
  function rebuild(keep) {
    buildDeck();
    let idx = keep ? deckPos.get(keep.id) : 0;
    if (idx == null) idx = 0;
    activeIdx = idx;
    renderFeed();
    listDirty = true;
    if (view === 'list') renderList(true);
    else requestAnimationFrame(() => { feedJump(activeIdx); onActive(activeIdx, true); });
  }
  const cardAt = (idx) => feedEl.children[idx] || null;
  function cardById(id) {
    const idx = deckPos.get(id);
    const c = idx != null ? cardAt(idx) : null;
    return c && filled.has(c) ? c : null;
  }
  // el feed es una fila de tarjetas a pantalla completa: la posición es scrollLeft / ancho
  function feedJump(idx, smooth) {
    const w = feedEl.clientWidth;
    if (w) feedW = w;
    const x = idx * w;
    if (smooth && feedEl.scrollTo) feedEl.scrollTo({ left: x, behavior: 'smooth' });
    else feedEl.scrollLeft = x;
  }

  let scrollRaf = 0;
  let settleT = 0;
  let scrollLock = null; // destino de un desplazamiento que ha lanzado la app (botones): hasta llegar, manda él
  // El scroll del feed solo cuenta como "el usuario ha cambiado de canción" si es un deslizamiento normal.
  // Girar la pantalla, volver de segundo plano o un recolocado de Safari también mueven el scroll: eso se deshace.
  const TOUCH = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
  let feedW = 0; // ancho del feed la última vez que se colocó
  let holdUntil = 0; // hasta entonces el scroll no cuenta (se está asentando un cambio de tamaño)
  let holdT = 0;
  function holdFeed(ms) {
    if (!feedEl) return;
    holdUntil = performance.now() + ms;
    scrollLock = null;
    clearTimeout(settleT);
    if (view === 'feed' && feedEl.clientWidth) feedJump(activeIdx);
    clearTimeout(holdT);
    // recolocar otra vez justo antes de soltar, por si Safari ha seguido moviendo cosas
    holdT = setTimeout(() => {
      if (view !== 'feed' || !feedEl.clientWidth) return;
      layoutCards();
      feedJump(activeIdx);
    }, Math.max(0, ms - 80));
  }
  // Un dedo toca el feed mientras se asentaba un giro: dejarlo ya colocado y que mande el dedo.
  function touchFeed() {
    if (performance.now() >= holdUntil && feedEl.clientWidth === feedW) return;
    clearTimeout(holdT);
    holdUntil = 0;
    if (feedEl.clientWidth) feedJump(activeIdx);
  }
  function onFeedScroll() {
    // con el feed oculto (lista) su scroll vuelve a 0 y avisa: eso no es el usuario cambiando de canción
    if (view !== 'feed' || performance.now() < holdUntil) return;
    if (!scrollRaf) {
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        const w = feedEl.clientWidth;
        const now = performance.now();
        if (view !== 'feed' || !w || now < holdUntil) return;
        if (feedW && w !== feedW) { holdFeed(600); return; } // ha cambiado el ancho: no es un deslizamiento
        const idx = Math.max(0, Math.min(deck.length, Math.round(feedEl.scrollLeft / w)));
        if (scrollLock) {
          if (idx === scrollLock.idx || now > scrollLock.until) scrollLock = null;
          else return;
        }
        if (idx === activeIdx) return;
        // un dedo pasa las tarjetas de una en una; un salto de varias de golpe no es un deslizamiento
        if (TOUCH && Math.abs(idx - activeIdx) >= 3) { feedJump(activeIdx); return; }
        onActive(idx, false);
      });
    }
    clearTimeout(settleT);
    settleT = setTimeout(onSettle, 120);
  }
  function onActive(idx, force) {
    if (idx === activeIdx && !force) return;
    activeIdx = idx;
    hydrateAround(idx);
    const t = deck[idx];
    if (t) {
      loadMeta(t);
      if (deck[idx + 1]) loadMeta(deck[idx + 1]);
      if (cur.live) SS.set('pos:' + location.pathname + location.search, t.id);
      wantDay(t);
    }
    if (idx >= deck.length - 4) maybeLoadMore();
    // si la canción a la que llegas ya está precargada, que suene sin esperar a que pare el deslizamiento
    if (t && !force && wantPlay && view === 'feed' && (!current || current.id !== t.id) &&
        players.some((a) => a !== audio && a._sxId === t.id && a.readyState >= 3 && !a.error)) load(t, true);
    syncHash();
  }
  function onSettle() {
    if (view !== 'feed') return;
    const t = deck[activeIdx];
    if (!t) { if (current && !audio.paused && deck.length) { audio.pause(); } return; }
    if (!current || current.id !== t.id) load(t, wantPlay);
    else if (wantPlay && audio.paused) audio.play().catch(() => {});
  }
  function goTo(idx, opts) {
    opts = opts || {};
    idx = Math.max(0, Math.min(deck.length, idx));
    const t = deck[idx];
    if (t && opts.play) load(t, true); // dentro del gesto del usuario (iOS)
    if (view === 'feed' && feedEl.clientWidth) {
      // la tarjeta de destino cuenta desde ya (así varios toques seguidos se suman); el scroll va detrás
      const near = !opts.instant && Math.abs(idx - feedEl.scrollLeft / feedEl.clientWidth) <= 1.25;
      onActive(idx, true);
      scrollLock = near ? { idx, until: performance.now() + 900 } : null;
      feedJump(idx, near);
      if (t && !opts.play && wantPlay) load(t, true);
    } else {
      onActive(idx, true);
      if (t && !opts.play) load(t, false);
      if (!t && current) audio.pause();
    }
  }
  function playListTrack(id, play) {
    const t = byId.get(id);
    if (!t) return false;
    if (!deckPos.has(id)) { forced.add(id); buildDeck(); renderFeed(); }
    activeIdx = deckPos.get(id);
    load(t, play);
    hydrateAround(activeIdx);
    loadMeta(t);
    syncHash();
    const r = listRowById(id);
    if (r && r.scrollIntoView) r.scrollIntoView({ block: 'nearest' });
    return true;
  }
  function step(d, userGesture) {
    if (queueOn()) { stepQueue(d, userGesture ? true : wantPlay); return; }
    if (view === 'list' && current && listOrder.includes(current.id)) {
      const k = listOrder.indexOf(current.id) + d;
      if (k >= 0 && k < listOrder.length) { playListTrack(listOrder[k], userGesture ? true : wantPlay); return; }
      toast(d > 0 ? 'Fin de la lista' : 'Es el primero de la lista');
      return;
    }
    const base = current && deckPos.has(current.id) ? deckPos.get(current.id) : -1;
    const from = view === 'feed' ? activeIdx : base >= 0 ? base : activeIdx - (d > 0 ? 1 : 0);
    const idx = from + d;
    if (idx < 0) {
      if (prevPageUrl()) toast('Es el primero de esta página', 'Página anterior', () => goPage(-1));
      else toast('Es el primero de la lista');
      return;
    }
    goTo(idx, { play: userGesture ? true : wantPlay });
  }

  function loadMeta(t) {
    if (metaCache[t.id]) return paintMeta(t);
    getMeta(t).then(() => paintMeta(t));
  }
  function paintMeta(t) {
    const m = metaCache[t.id];
    if (!m) return;
    const c = cardById(t.id);
    if (c) {
      const k = $('.chip.key', c);
      const b = $('.chip.bpmc', c);
      if (k) k.innerHTML = metaChipKey(m);
      if (b) b.innerHTML = metaChipBpm(m);
    }
    const r = listRowById(t.id);
    if (r) {
      const x = $('.rx', r);
      if (x && !x.dataset.meta && (m.b || m.k)) { x.dataset.meta = '1'; x.textContent = metaLine(t); }
    }
  }
  function refreshCovers() {
    if (!feedEl) return;
    filled.forEach((c) => {
      const t = byId.get(c.dataset.id);
      const img = t && $('img', c);
      if (img) img.src = bigCover(t.cover);
    });
  }

  /* ───────────── lista ───────────── */
  function metaLine(t) {
    const m = metaCache[t.id];
    const bits = [];
    if (t.rank) bits.push('#' + t.rank);
    if (m && m.b) bits.push(m.b + ' BPM');
    if (m && m.k) bits.push(camelot(m.k) + ' ' + m.k);
    bits.push(t.genre, t.label, t.duration);
    return bits.filter(Boolean).join(' · ');
  }
  let listDay = 0; // 0 = el día más reciente cargado (solo en listas "por días")
  let listOrder = []; // ids en el orden en que se ven en la lista
  let listDirty = true;
  const dayComplete = (k) => k < days.length - 1 || !pages.hasMore;
  async function goListDay(k) {
    if (k < 0) {
      if (prevPageUrl()) goPage(-1);
      return;
    }
    const s = cur;
    let guard = 0;
    // el día k tiene que existir y estar completo (puede seguir en la página siguiente de Soundeo)
    while ((days.length <= k || !dayComplete(k)) && pages.hasMore && guard++ < 8 && s === cur) {
      $$('.dold, .bnx', listEl).forEach((x) => { x.disabled = true; x.textContent = 'Cargando…'; });
      await loadMore();
    }
    if (s !== cur) return;
    if (k > days.length - 1) k = days.length - 1;
    listDay = Math.max(0, k);
    renderList();
    listEl.scrollTop = 0;
  }
  function rowHtml(t) {
    const done = t.siteDownloaded || myDownloads.has(t.id);
    const fav = isFav(t);
    const src = coverAt(t.cover, coverSize && +coverSize <= 150 ? coverSize : '110');
    return `<div class="row${isHeard(t) ? ' heard' : ''}${current && current.id === t.id ? ' cur' : ''}" data-id="${esc(t.id)}">` +
      `<img class="rc" alt="" loading="lazy" decoding="async" src="${esc(src)}" data-fb="${esc(t.cover)}">` +
      `<div class="rm"><div class="rt">${esc(t.name)}${t.mix ? ' <small>' + esc(t.mix) + '</small>' : ''}</div><div class="ra">${esc(t.artist)}</div><div class="rx">${esc(metaLine(t))}</div></div>` +
      `<button class="rb rfav${fav ? ' on' : ''}" aria-label="Guardar"><i>${fav ? ICON.starOn : ICON.star}</i></button>` +
      (t.downloads.length ? `<button class="rb rdl${done ? ' done' : ''}" aria-label="Descargar">${i(done ? 'check' : 'dl')}</button>` : t.vote ? `<button class="rb rvote${isVoted(t) ? ' on' : ''}" aria-label="Me gusta">${voteInner(t)}</button>` : '') +
      '</div>';
  }
  const sourceSub = (s) => {
    const n = s.count || tracks.length;
    if (s.kind === 'artist' || s.kind === 'label') return n + (n === 1 ? ' track' : ' tracks');
    if (s.kind === 'search') return (pages.hasMore ? 'Más de ' : '') + tracks.length + ' resultados';
    if (s.kind === 'release') {
      const rows = (s.release && s.release.rows) || [];
      const pick = (re) => { const r = rows.find((x) => re.test(x[0])); return r ? r[1] : ''; };
      return [pick(/^label/i), pick(/date|released/i), tracks.length + (tracks.length === 1 ? ' track' : ' tracks')].filter(Boolean).join(' · ');
    }
    const base = tracks.length ? (pages.hasMore ? 'Más de ' : '') + tracks.length + ' tracks' : '';
    if (s.key === 'followed' && base) return base + (s.filtersOn ? ' · Soundeo sigue filtrando aquí' : ' · sin filtros');
    return base;
  };
  // "98 tracks · 40 sin escuchar" (en artista, sello… el total ya está en la cabecera)
  const allCountText = () => {
    const total = cur.count && cur.count > tracks.length ? cur.count : 0;
    return (cur.canFilter ? tracks.length + ' tracks · ' : '') + countText(tracks) + (total ? ' · cargados ' + tracks.length + ' de ' + total : '');
  };
  function listHead() {
    const s = cur;
    const head = el('<div class="lhead"></div>');
    if (s.canFilter) {
      const b = el(`<button class="fsum">${i('sliders')}<span><b>${esc(s.title)}</b><small>${esc(describeFilters(s.filters))}${s.cut ? ' · género filtrado aquí' : ''}</small></span></button>`);
      b.addEventListener('click', () => openSettings());
      head.appendChild(b);
      return head;
    }
    const sub = sourceSub(s);
    const h = el(`<div class="shead">${s.release && s.release.cover ? '<img class="scov" alt="">' : ''}<div class="stx">${kindName(s) ? '<div class="skind">' + esc(kindName(s)) + '</div>' : ''}<div class="stitle">${esc(s.title)}</div>${sub ? '<div class="ssub">' + esc(sub) + '</div>' : ''}</div>${s.follow ? '<button class="btn fol"></button>' : ''}</div>`);
    const cov = $('.scov', h);
    if (cov) cov.src = s.release.cover;
    const fol = $('.fol', h);
    if (fol) fol.addEventListener('click', () => toggleFollow(s));
    head.appendChild(h);
    if (s.kind === 'release' && s.release) {
      const chips = el('<div class="schips"></div>');
      (s.release.artists || []).slice(0, 4).forEach((a) => {
        const b = el(`<button class="tag">${esc(a[1])}</button>`);
        b.addEventListener('click', () => openSource(artistDesc(a[0], a[1]), { view: 'list' }));
        chips.appendChild(b);
      });
      if (s.release.label) {
        const b = el(`<button class="tag">${esc(s.release.label[1])}</button>`);
        b.addEventListener('click', () => openSource(labelDesc(s.release.label[0], s.release.label[1]), { view: 'list' }));
        chips.appendChild(b);
      }
      if (chips.children.length) head.appendChild(chips);
    }
    if (s.kind === 'search') {
      const b = el(`<button class="fsum" style="margin-top:10px">${i('search')}<span><b>Cambiar la búsqueda</b></span></button>`);
      b.addEventListener('click', () => openSearch(s.query));
      head.appendChild(b);
    }
    return head;
  }
  function emptyBlock() {
    const s = cur;
    const e = el(`<div class="lempty">${s.loading ? 'Cargando…' : s.error ? 'No se ha podido cargar: ' + esc(s.error) : esc(siteMsg(s))}
      <div class="stack" style="align-items:center">${s.error ? '<button class="btn pri bretry">Reintentar</button>' : ''}${!s.loading && s.url ? '<button class="btn bweb">Abrir en la web</button>' : ''}${s.key === 'followed' && !s.loading ? '<button class="btn bfed">Editar seguidos en la web</button>' : ''}</div></div>`);
    const on = (sel, fn) => { const b = $(sel, e); if (b) b.addEventListener('click', fn); };
    on('.bretry', () => { ensureLoaded(s); adopt(s); });
    on('.bweb', () => { closeApp(true); location.href = s.web || s.url; });
    on('.bfed', () => { closeApp(true); location.href = location.origin + '/account/followed/edit'; });
    return e;
  }
  const countText = (all) => {
    const newN = all.filter((t) => !isHeard(t)).length;
    return newN + ' sin escuchar';
  };
  function renderList(keepScroll) {
    if (!listEl || !cur) return;
    listDirty = false;
    const st = listEl.scrollTop;
    const frag = document.createDocumentFragment();
    frag.appendChild(listHead());
    listOrder = [];
    if (!tracks.length) frag.appendChild(emptyBlock());
    else if (cur.mode === 'day') dayList(frag);
    else allList(frag);
    listEl.textContent = '';
    listEl.appendChild(frag);
    curRow = null;
    markCurrentRow();
    paintFollow();
    if (keepScroll) listEl.scrollTop = st;
    // si el día aún no está completo (sigue en la página siguiente de Soundeo), traerlo
    if (cur.mode === 'day' && tracks.length && !dayComplete(listDay) && isOpen && view === 'list' && !pages.loading) loadMore();
  }
  const filterSeg = (onlyNew) => `<div class="seg2 lf"><button data-f="all"${onlyNew ? '' : ' class="on"'}>Todas</button><button data-f="new"${onlyNew ? ' class="on"' : ''}>Sin escuchar</button></div>`;
  function wireFilter(scope) {
    $$('.lf button', scope).forEach((x) => x.addEventListener('click', () => { prefs.listFilter = x.dataset.f; savePrefs(); renderList(); }));
  }
  // Un día por página (listas con muchos tracks al día): fecha grande, géneros, día anterior / siguiente.
  function dayList(frag) {
    if (listDay > days.length - 1) listDay = Math.max(0, days.length - 1);
    const day = days[listDay];
    const all = tracks.filter((t) => t.day === day);
    const onlyNew = prefs.listFilter === 'new';
    const filtered = onlyNew ? all.filter((t) => !isHeard(t) || (current && current.id === t.id)) : all;
    const gOrder = [];
    filtered.forEach((t) => { if (!gOrder.includes(t.genre)) gOrder.push(t.genre); });
    const shown = [];
    gOrder.forEach((g) => filtered.forEach((t) => { if (t.genre === g) shown.push(t); }));
    listOrder = shown.map((t) => t.id);
    const complete = dayComplete(listDay);
    const dp = dayParts(day);
    const older = days[listDay + 1];
    const newer = days[listDay - 1];
    const canNewer = !!newer || !!prevPageUrl();
    const dh = el(`<div class="dhead">
      <div class="dnav">
        <button class="dn dnew"${canNewer ? '' : ' disabled'}>‹ ${newer ? esc(dayParts(newer).short) : 'Más reciente'}</button>
        <button class="dn dold"${older || pages.hasMore ? '' : ' disabled'}>${older ? esc(dayParts(older).short) : 'Día anterior'} ›</button>
      </div>
      <div class="dbig">${esc(dp.big)}</div>
      ${dp.sub ? `<div class="dsub">${esc(dp.sub)}</div>` : ''}
      <div class="dcount">${all.length}${complete ? '' : '…'} tracks · ${countText(all)}${complete ? '' : ' · cargando el resto'}</div>
      ${filterSeg(onlyNew)}
    </div>`);
    $('.dnew', dh).addEventListener('click', () => goListDay(listDay - 1));
    $('.dold', dh).addEventListener('click', () => goListDay(listDay + 1));
    wireFilter(dh);
    frag.appendChild(dh);
    if (!shown.length) {
      const e = el(`<div class="lempty">${all.length ? 'Ya has escuchado todo lo de este día.' : 'No hay tracks este día.'}${onlyNew && all.length ? '<br><button class="btn bshow" style="margin-top:14px">Ver las ' + all.length + '</button>' : ''}</div>`);
      const bs = $('.bshow', e);
      if (bs) bs.addEventListener('click', () => { prefs.listFilter = 'all'; savePrefs(); renderList(); });
      frag.appendChild(e);
    }
    let html = '';
    let lastGenre = null;
    shown.forEach((t) => {
      if (t.genre !== lastGenre) {
        lastGenre = t.genre;
        const n = shown.filter((x) => x.genre === t.genre).length;
        html += `<div class="gh">${esc(t.genre || 'Otros')} <span>${n}</span></div>`;
      }
      html += rowHtml(t);
    });
    const rows = el('<div class="rows"></div>');
    rows.innerHTML = html;
    frag.appendChild(rows);
    const pager = el(`<div class="pager">
      <button class="btn bpv"${canNewer ? '' : ' disabled'}>‹ Más reciente</button>
      <button class="btn bnx pri"${older || pages.hasMore ? '' : ' disabled'}>Día anterior ›</button>
    </div>`);
    $('.bpv', pager).addEventListener('click', () => goListDay(listDay - 1));
    $('.bnx', pager).addEventListener('click', () => goListDay(listDay + 1));
    frag.appendChild(pager);
  }
  // Lista seguida (artista, sello, release, búsqueda, top…): todo lo cargado, con la fecha como separador.
  let allLastDay = null;
  function allRowsHtml(list) {
    let html = '';
    list.forEach((t) => {
      if (parseDay(t.day) && t.day !== allLastDay) {
        allLastDay = t.day;
        html += `<div class="gh">${esc(dayParts(t.day).short)}</div>`;
      }
      html += rowHtml(t);
    });
    return html;
  }
  const allShown = (list) => (prefs.listFilter === 'new' ? list.filter((t) => !isHeard(t) || (current && current.id === t.id)) : list);
  function allList(frag) {
    const onlyNew = prefs.listFilter === 'new';
    const shown = allShown(tracks);
    listOrder = shown.map((t) => t.id);
    const dh = el(`<div class="dhead">
      <div class="dcount">${esc(allCountText())}</div>
      ${filterSeg(onlyNew)}
    </div>`);
    wireFilter(dh);
    frag.appendChild(dh);
    if (!shown.length) frag.appendChild(el('<div class="lempty">Ya has escuchado todo lo de esta lista.</div>'));
    allLastDay = null;
    const rows = el('<div class="rows"></div>');
    rows.innerHTML = allRowsHtml(shown);
    frag.appendChild(rows);
    if (pages.hasMore) {
      const pager = el('<div class="pager"><button class="btn pri bmore">Cargar más</button></div>');
      $('.bmore', pager).addEventListener('click', (e) => { e.currentTarget.textContent = 'Cargando…'; loadMore(); });
      frag.appendChild(pager);
    }
  }
  function listTracksAdded(fresh) {
    if (view !== 'list' || !isOpen) { listDirty = true; return; }
    if (cur.mode === 'day') { renderList(true); return; }
    // lista seguida: añadir al final sin repintar todo
    const rows = $('.rows', listEl);
    if (!rows) { renderList(true); return; }
    const shown = allShown(fresh);
    listOrder = listOrder.concat(shown.map((t) => t.id));
    rows.insertAdjacentHTML('beforeend', allRowsHtml(shown));
    const pager = $('.pager', listEl);
    if (pager && !pages.hasMore) pager.remove();
    else if (pager) $('.bmore', pager).textContent = 'Cargar más';
    markCurrentRow();
    updateListCount();
  }
  function updateListCount() {
    if (!listEl || view !== 'list' || !cur) return;
    const dc = $('.dcount', listEl);
    if (!dc) return;
    if (cur.mode === 'day') {
      const all = tracks.filter((t) => t.day === days[listDay]);
      const complete = dayComplete(listDay);
      dc.textContent = all.length + (complete ? '' : '…') + ' tracks · ' + countText(all) + (complete ? '' : ' · cargando el resto');
    } else {
      dc.textContent = allCountText();
      const ss = $('.ssub', listEl);
      if (ss) ss.textContent = sourceSub(cur);
    }
  }
  function listRowById(id) {
    return listEl && id != null ? listEl.querySelector('.row[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]') : null;
  }
  function playFromList(t) {
    if (current && current.id === t.id) { togglePlay(); return; }
    playListTrack(t.id, true);
  }
  let curRow = null;
  function markCurrentRow() {
    if (!listEl) return;
    if (curRow) curRow.classList.remove('cur');
    curRow = current ? listRowById(current.id) : null;
    if (curRow) curRow.classList.add('cur');
  }
  // Un solo juego de eventos para todas las filas (toque, botones y pulsación larga).
  function setupListEvents() {
    let lp = null;
    let lpFired = false; // la pulsación larga ya ha abierto el menú: el toque que queda no cuenta
    const rowOf = (e) => { const r = e.target.closest && e.target.closest('.row'); return r ? { r, t: byId.get(r.dataset.id) } : null; };
    listEl.addEventListener('click', (e) => {
      const x = rowOf(e);
      if (!x || !x.t) return;
      if (e.target.closest('.rfav')) toggleFav(x.t);
      else if (e.target.closest('.rdl')) askDownload(x.t);
      else if (e.target.closest('.rvote')) vote(x.t);
      else playFromList(x.t);
    });
    listEl.addEventListener('touchstart', (e) => {
      clearTimeout(lp && lp.timer);
      lp = null;
      lpFired = false;
      const x = e.touches.length === 1 ? rowOf(e) : null;
      if (!x || !x.t || e.target.closest('.rb')) return;
      const p = e.touches[0];
      lp = { x: p.clientX, y: p.clientY, timer: setTimeout(() => { lpFired = true; lp = null; moreSheet(x.t); }, 480) };
    }, { passive: true });
    const cancel = () => { if (lp) { clearTimeout(lp.timer); lp = null; } };
    listEl.addEventListener('touchmove', (e) => {
      if (!lp) return;
      const p = e.touches[0];
      if (Math.abs(p.clientX - lp.x) > 8 || Math.abs(p.clientY - lp.y) > 8) cancel();
    }, { passive: true });
    listEl.addEventListener('touchend', (e) => {
      cancel();
      if (lpFired) { lpFired = false; if (e.cancelable) e.preventDefault(); } // que al soltar no se cierre el menú recién abierto
    }, { passive: false });
    listEl.addEventListener('touchcancel', () => { cancel(); lpFired = false; }, { passive: true });
    // portadas que fallan: probar con la original
    listEl.addEventListener('error', (e) => {
      const im = e.target;
      if (im && im.tagName === 'IMG' && im.dataset.fb) { const fb = im.dataset.fb; delete im.dataset.fb; if (im.src !== fb) im.src = fb; }
    }, true);
    // listas seguidas: cargar más al acercarse al final
    listEl.addEventListener('scroll', () => {
      if (view !== 'list' || !listEl.clientHeight || !cur || cur.mode === 'day' || !pages.hasMore || pages.loading) return;
      if (listEl.scrollTop + listEl.clientHeight > listEl.scrollHeight - 900) loadMore();
    }, { passive: true });
  }

  /* ───────────── reproducción ───────────── */
  // Varios <audio>: uno suena y los demás van cargando las canciones siguientes. Al pasar de canción
  // se cambia de elemento, y la nueva empieza (y se puede saltar por ella) sin esperar a la red.
  const POOL = 4; // la que suena + las 2 siguientes + la anterior
  const mkAudio = () => {
    const a = new Audio();
    a.preload = 'auto';
    try { a.setAttribute('playsinline', ''); a.setAttribute('webkit-playsinline', ''); } catch (e) {}
    return a;
  };
  const players = Array.from({ length: POOL }, mkAudio);
  let audio = players[0]; // el que suena
  const pl = {
    broken: false, unlocked: false, swaps: 0, primes: 0, fails: 0, t0: 0, mode: '', info: null, last: null, prevId: null,
    stat: { pre: { n: 0, ms: 0 }, cold: { n: 0, ms: 0 } }, seek: { n: 0, ms: 0, inBuf: 0, t0: 0, last: null },
  };
  const bufSecs = (a) => {
    try { return a.buffered.length ? Math.round(a.buffered.end(a.buffered.length - 1) * 10) / 10 : 0; } catch (e) { return 0; }
  };
  const isBuffered = (a, sec) => {
    try { for (let k = 0; k < a.buffered.length; k++) if (sec >= a.buffered.start(k) - 0.2 && sec <= a.buffered.end(k)) return true; } catch (e) {}
    return false;
  };
  // Las n canciones que vienen después de la que suena, según dónde estés (lista o feed).
  function upcoming(n) {
    if (!current) return [];
    if (queueOn()) { const q = queue.list.findIndex((t) => t.id === current.id); return queue.list.slice(q + 1, q + 1 + n); }
    if (view === 'list') {
      const k = listOrder.indexOf(current.id);
      if (k >= 0) return listOrder.slice(k + 1, k + 1 + n).map((id) => byId.get(id)).filter(Boolean);
    }
    const k = deckPos.has(current.id) ? deckPos.get(current.id) : -1;
    return k >= 0 ? deck.slice(k + 1, k + 1 + n) : [];
  }
  let aheadT = 0;
  let aheadAt = 0;
  function preloadAhead() {
    clearTimeout(aheadT);
    aheadAt = performance.now();
    if (!prefs.preload || pl.broken || document.hidden || !current || !wantPlay) return;
    const want = upcoming(2).filter((t) => t.preview);
    const keep = new Set(want.map((t) => t.id));
    keep.add(current.id);
    if (pl.prevId) keep.add(pl.prevId);
    want.forEach((t) => {
      if (players.some((a) => a._sxId === t.id)) return; // ya está pedida (si dio error no se reintenta: load() hará la carga normal)
      let a = players.find((x) => x !== audio && !keep.has(x._sxId));
      if (!a) a = players.find((x) => x !== audio && x._sxId === pl.prevId); // sin hueco: soltar la anterior
      if (!a) return;
      a._sxId = t.id;
      a._sxAt = performance.now();
      try { a.src = t.preview; a.load(); pl.primes++; } catch (e) { a._sxId = null; }
    });
  }
  function unlockPlayers() {
    // iOS solo deja sonar un <audio> que se haya usado dentro de un toque: load() en el primer toque los desbloquea
    if (pl.unlocked) return;
    pl.unlocked = true;
    players.forEach((a) => { if (a !== audio) { try { a.load(); } catch (e) {} } });
  }
  function dropPreloads() {
    players.forEach((a) => {
      if (a === audio) return;
      a._sxId = null;
      try { a.removeAttribute('src'); a.load(); } catch (e) {}
    });
  }
  function load(t, play) {
    if (!t) return;
    let swapped = null;
    let changed = false;
    if (!current || current.id !== t.id) {
      changed = true;
      if (queue && !queue.list.includes(t)) queue = null; // se ha elegido una canción de la lista que se mira
      pl.prevId = current ? current.id : null;
      current = t;
      seekTarget = null;
      if (!t.preview && play) toast('Este track no tiene preview');
      const pre = prefs.preload && !pl.broken && !document.hidden && t.preview ? players.find((a) => a !== audio && a._sxId === t.id && !a.error) : null;
      if (pre) {
        // ya estaba cargada en otro elemento: pasar a ese
        swapped = audio;
        pl.mode = 'pre';
        pl.info = { ready: pre.readyState, buf: bufSecs(pre), lead: Math.round(performance.now() - (pre._sxAt || performance.now())) };
        try { swapped.pause(); } catch (e) {}
        audio = pre;
        try { if (audio.currentTime > 0) audio.currentTime = 0; } catch (e) {}
        pl.swaps++;
      } else {
        pl.mode = 'cold';
        pl.info = null;
        players.forEach((a) => { if (a !== audio && a._sxId === t.id) a._sxId = null; });
        audio._sxId = t.id;
        audio.src = t.preview || '';
        try { audio.load(); } catch (e) {}
      }
      if (app) app.classList.remove('spin');
      paintPlayer();
      paintProgress();
      setMediaSession(t);
      markCurrentRow();
      updateMini();
      loadMeta(t);
      // las siguientes: enseguida si esta ya estaba cargada; si no, cuando arranque (o al poco)
      clearTimeout(aheadT);
      aheadT = setTimeout(preloadAhead, swapped ? 80 : 1200);
    }
    if (play) {
      wantPlay = true;
      pl.t0 = changed ? performance.now() : 0;
      const a = audio;
      const p = a.play();
      if (p && p.catch) p.catch((err) => {
        if (!err || err.name !== 'NotAllowedError' || a !== audio) return;
        if (swapped && current && current.id === t.id) {
          // este iPhone no deja sonar el elemento precargado: volver al de siempre y dejar de precargar
          pl.broken = true;
          pl.fails++;
          pl.mode = 'cold';
          pl.info = null;
          audio = swapped;
          dropPreloads();
          audio._sxId = t.id;
          audio.src = t.preview || '';
          try { audio.load(); } catch (e) {}
          paintProgress();
          const p2 = audio.play();
          if (p2 && p2.catch) p2.catch((e2) => {
            if (e2 && e2.name === 'NotAllowedError') { wantPlay = false; paintPlayer(); toast('Toca ▶ para reproducir'); }
          });
          return;
        }
        wantPlay = false;
        paintPlayer();
        toast('Toca ▶ para reproducir');
      });
    } else if (changed) pl.t0 = 0;
  }
  function togglePlay() {
    const t = view === 'feed' ? deck[activeIdx] : current || deck[activeIdx];
    if (!t) return;
    if (!current || current.id !== t.id) { load(t, true); return; }
    if (audio.paused) { wantPlay = true; audio.play().catch(() => {}); }
    else { wantPlay = false; audio.pause(); }
  }
  // Saltos: la barra se mueve al instante y el audio va detrás.
  let seekTarget = null;
  let seekT = 0;
  function seekTo(sec, commit) {
    if (!current) return;
    const d = audio.duration;
    if (!isFinite(d) || d <= 0) return;
    sec = Math.max(0, Math.min(d - 0.3, sec));
    seekTarget = sec;
    paintProgress();
    if (commit === false) return;
    pl.seek.t0 = performance.now();
    pl.seek.wasBuf = isBuffered(audio, sec);
    try { audio.currentTime = sec; } catch (e) {}
    clearTimeout(seekT);
    seekT = setTimeout(() => { seekTarget = null; paintProgress(); }, 8000);
  }
  function seekBy(s) {
    if (!current) return;
    seekTo((seekTarget != null ? seekTarget : audio.currentTime) + s);
  }
  let lastPlaying = null;
  function paintPlayer() {
    const playing = !audio.paused && !audio.ended;
    if (root && lastPlaying !== playing) {
      lastPlaying = playing;
      const ic = i(playing ? 'pause' : 'play');
      $('.bplay', root).innerHTML = ic;
      $('.mplay', root).innerHTML = ic;
    }
    if (feedEl) {
      const c = current ? cardById(current.id) : null;
      if (playingCard && playingCard !== c) { playingCard.classList.remove('playing'); playingCard.classList.add('paused'); }
      playingCard = c;
      if (c) { c.classList.toggle('playing', playing); c.classList.toggle('paused', !playing); }
    }
    try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch (e) {}
  }
  function updateMini() {
    if (!app) return;
    app.classList.toggle('has-cur', !!current);
    if (!current) return;
    const img = $('img', miniEl);
    img.src = coverAt(current.cover, '110');
    $('.mt', miniEl).textContent = current.name + (current.mix ? ' (' + current.mix + ')' : '');
    $('.ma', miniEl).textContent = current.artist;
    paintFav(miniEl, current);
  }
  let lastProgPaint = 0;
  let progEls = null;
  function paintProgress() {
    if (!root) return;
    if (!progEls) progEls = { fill: $('.fill', ctrlEl), knob: $('.knob', ctrlEl), tc: $('.tc', ctrlEl), td: $('.td', ctrlEl), buf: $('.buf', ctrlEl), mp: $('.mprog', miniEl) };
    const d = audio.duration;
    const c = seekTarget != null ? seekTarget : audio.currentTime;
    const pct = isFinite(d) && d > 0 ? (c / d) * 100 : 0;
    if (view === 'feed') {
      progEls.fill.style.width = pct + '%';
      progEls.knob.style.left = pct + '%';
      progEls.tc.textContent = fmtTime(c);
      progEls.td.textContent = isFinite(d) ? fmtTime(d) : '0:00';
      progEls.buf.style.width = (isFinite(d) && d > 0 ? Math.min(100, (bufSecs(audio) / d) * 100) : 0) + '%';
    } else {
      progEls.mp.style.width = pct + '%';
    }
  }
  function setupBar(bar) {
    let dragging = false;
    const at = (x) => {
      const r = bar.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (x - r.left) / r.width));
      return isFinite(audio.duration) ? p * audio.duration : 0;
    };
    // mientras arrastras solo se mueve la barra; el salto de verdad se hace al soltar
    bar.addEventListener('pointerdown', (e) => { dragging = true; try { bar.setPointerCapture(e.pointerId); } catch (x) {} seekTo(at(e.clientX), false); });
    bar.addEventListener('pointermove', (e) => { if (dragging) seekTo(at(e.clientX), false); });
    bar.addEventListener('pointerup', (e) => { if (dragging) { dragging = false; seekTo(at(e.clientX)); } });
    bar.addEventListener('pointercancel', () => { dragging = false; seekTarget = null; paintProgress(); });
  }

  // los eventos solo cuentan si vienen del elemento que está sonando (los demás están precargando)
  const onAudio = (ev, fn) => players.forEach((a) => a.addEventListener(ev, (e) => { if (a === audio) fn(e); }));
  onAudio('play', paintPlayer);
  onAudio('playing', () => {
    app && app.classList.remove('spin');
    paintPlayer();
    if (pl.t0) {
      // cuánto ha tardado en empezar a sonar (para el diagnóstico: precargada vs. sin precargar)
      const ms = Math.round(performance.now() - pl.t0);
      pl.t0 = 0;
      const st = pl.stat[pl.mode];
      if (st) { st.n++; st.ms += ms; }
      pl.last = Object.assign({ mode: pl.mode, ms }, pl.info || {});
    }
    if (performance.now() - aheadAt > 1500) { clearTimeout(aheadT); aheadT = setTimeout(preloadAhead, 250); }
  });
  onAudio('waiting', () => app && app.classList.add('spin'));
  onAudio('canplay', () => app && app.classList.remove('spin'));
  onAudio('pause', paintPlayer);
  onAudio('loadedmetadata', paintProgress);
  onAudio('seeked', () => {
    if (pl.seek.t0) {
      const ms = Math.round(performance.now() - pl.seek.t0);
      pl.seek.t0 = 0;
      pl.seek.n++;
      pl.seek.ms += ms;
      if (pl.seek.wasBuf) pl.seek.inBuf++;
      pl.seek.last = { ms, buffered: !!pl.seek.wasBuf };
    }
    if (seekTarget != null && Math.abs(audio.currentTime - seekTarget) < 1.5) { seekTarget = null; clearTimeout(seekT); }
    paintProgress();
  });
  onAudio('timeupdate', () => {
    const now = performance.now();
    if (now - lastProgPaint > 240) { lastProgPaint = now; paintProgress(); }
    if (current && !audio.paused && audio.currentTime >= HEARD_AFTER && !heard.has(current.id)) markHeard(current.id);
    if (wantPlay && now - aheadAt > 2500) preloadAhead();
  });
  onAudio('ended', () => {
    paintPlayer();
    if (!prefs.autoNext) { wantPlay = false; return; }
    if (queueOn()) { if (!stepQueue(1, true, true)) wantPlay = false; return; }
    if (view === 'list' && current && listOrder.includes(current.id)) {
      const k = listOrder.indexOf(current.id) + 1;
      if (k < listOrder.length) playListTrack(listOrder[k], true);
      return;
    }
    const idx = current && deckPos.has(current.id) ? deckPos.get(current.id) : activeIdx;
    if (idx + 1 < deck.length) goTo(idx + 1, { play: true });
    else if (view === 'feed') goTo(deck.length);
  });
  onAudio('error', () => {
    if (!current || !audio.getAttribute('src')) return;
    const m = (current.preview || '').match(/[?&]t=(\d{9,})/);
    if (m && +m[1] * 1000 < Date.now()) {
      toast('Las previews han caducado', 'Recargar', () => { location.reload(); });
    } else {
      toast('No se pudo cargar la preview');
    }
    app && app.classList.remove('spin');
  });

  function setMediaSession(t) {
    if (!('mediaSession' in navigator)) return;
    try {
      const art = bigCover(t.cover);
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.name + (t.mix ? ' (' + t.mix + ')' : ''),
        artist: t.artist,
        album: [t.label, t.genre].filter(Boolean).join(' · '),
        artwork: art ? [{ src: art, sizes: (coverSize || '110') + 'x' + (coverSize || '110'), type: 'image/jpeg' }] : [],
      });
    } catch (e) {}
  }
  function setupMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const h = (a, f) => { try { ms.setActionHandler(a, f); } catch (e) {} };
    h('play', () => { wantPlay = true; audio.play().catch(() => {}); });
    h('pause', () => { wantPlay = false; audio.pause(); });
    h('nexttrack', () => step(1, false));
    h('previoustrack', () => step(-1, false));
    h('seekbackward', () => seekBy(-15));
    h('seekforward', () => seekBy(30));
    h('seekto', (d) => { if (d && d.seekTime != null) seekTo(d.seekTime); });
  }

  /* ───────────── favoritos / descargas / votos (mismas peticiones que hace la web de Soundeo) ───────────── */
  // botón de favorito de la página original (si el track está en ella), para que la web quede igual
  const myVotes = new Set(LS.get('voted', []));
  const votePending = new Map(); // id -> estado esperado mientras Soundeo responde
  const voteKnown = new Map(); // id -> { on, n } último estado confirmado
  const wasVoted = (t) => (voteKnown.has(t.id) ? voteKnown.get(t.id).on : !!(t.voted || (!voteDetect && myVotes.has(t.id))));
  const isVoted = (t) => (votePending.has(t.id) ? votePending.get(t.id) : wasVoted(t));
  function votesOf(t) {
    const k = voteKnown.get(t.id);
    const n = k && k.n != null ? k.n : t.votes;
    if (n == null) return null;
    if (!votePending.has(t.id)) return n;
    const will = votePending.get(t.id);
    return Math.max(0, n + (will === wasVoted(t) ? 0 : will ? 1 : -1));
  }
  function setVoteKnown(t, on, n) {
    voteKnown.set(t.id, { on: !!on, n: n == null ? null : n });
    if (on) myVotes.add(t.id); else myVotes.delete(t.id);
    LS.set('voted', Array.from(myVotes).slice(-2000));
  }
  const fmtCount = (n) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (Math.round(n / 100) / 10).toString().replace('.', ',') + 'k' : String(n));
  function voteInner(t) {
    const n = votesOf(t);
    return i(isVoted(t) ? 'heartOn' : 'heart') + (n != null ? '<em>' + fmtCount(n) + '</em>' : '');
  }
  function paintVote(scope, t) {
    const on = isVoted(t);
    scope.querySelectorAll('.vote, .rvote').forEach((b) => {
      b.classList.toggle('on', on);
      b.innerHTML = voteInner(t);
      b.setAttribute('aria-label', on ? 'Quitar me gusta' : 'Me gusta');
    });
  }
  function repaintVote(id) {
    const t = byId.get(id) || (current && current.id === id ? current : null);
    if (!t) return;
    const c = cardById(id);
    if (c) paintVote(c, t);
    const r = listRowById(id);
    if (r) paintVote(r, t);
  }
  const origFav = (t) => (/^\d+$/.test(t.id) ? $('button.favorites[data-track-id="' + t.id + '"]') : null);
  const favPending = new Map(); // id -> estado esperado mientras Soundeo responde
  const favKnown = new Map(); // id -> último estado confirmado (el mismo track puede estar en varias listas)
  const isFav = (t) => {
    if (favPending.has(t.id)) return favPending.get(t.id);
    if (favKnown.has(t.id)) return favKnown.get(t.id);
    return !!t.fav;
  };
  function setFavKnown(id, on, t) {
    favKnown.set(id, !!on);
    if (t) t.fav = !!on;
    const b = origFav({ id });
    if (b) b.classList.toggle('favored', !!on);
  }

  // Registro de peticiones de Soundeo (favoritos/descargas/votos) para confirmar acciones y para el diagnóstico.
  const netLog = [];
  const netListeners = new Set();
  const NET_RE = /fav|download|vote|playlist|like|star/i;
  const short = (v, n) => { try { return String(v == null ? '' : v).replace(/\s+/g, ' ').slice(0, n || 200); } catch (e) { return '?'; } };

  // Captura todo lo que pasa en los 8 s siguientes a una acción (para el diagnóstico).
  const cap = { on: false, t0: 0, items: [], mo: null, off: 0 };
  function logCap(kind, data) {
    if (!cap.on || cap.items.length >= 45) return;
    cap.items.push(Object.assign({ k: kind, ms: Date.now() - cap.t0 }, data));
  }
  function startCapture(label) {
    cap.on = true;
    cap.t0 = Date.now();
    cap.items = [{ k: 'start', what: label }];
    try { if (cap.mo) cap.mo.disconnect(); } catch (e) {}
    try {
      cap.mo = new MutationObserver((ms) => ms.forEach((m) => {
        const n = m.target;
        if (!n || n === host || n === document.documentElement || (n.closest && n.closest('#sx-host'))) return;
        const desc = (x) => x && x.tagName ? x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + (typeof x.className === 'string' && x.className ? '.' + x.className.trim().split(/\s+/).join('.') : '') : String(x && x.nodeName);
        if (m.type === 'attributes') logCap('dom-attr', { el: short(desc(n), 90), a: m.attributeName, v: short(n.getAttribute && n.getAttribute(m.attributeName), 80) });
        else m.addedNodes.forEach((a) => { if (a.nodeType === 1) logCap('dom-add', { el: short(desc(a), 90), in: short(desc(n), 60), html: short(a.outerHTML, 160) }); });
      }));
      cap.mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
    } catch (e) {}
    clearTimeout(cap.off);
    cap.off = setTimeout(() => { cap.on = false; try { cap.mo && cap.mo.disconnect(); } catch (e) {} }, 8000);
  }

  function hookNet() {
    if (hookNet.done) return;
    hookNet.done = true;
    try {
      const XO = XMLHttpRequest.prototype.open;
      const XS = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (m, u) {
        try { this.__sx = { m: String(m), u: String(u), t: Date.now() }; } catch (e) {}
        return XO.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function (body) {
        const info = this.__sx;
        if (info) {
          try { info.b = typeof body === 'string' ? body.slice(0, 200) : body ? '[datos]' : ''; } catch (e) {}
          logCap('xhr-send', { m: info.m, u: short(info.u, 160), b: info.b });
          this.addEventListener('loadend', () => {
            info.s = this.status;
            info.ms = Date.now() - info.t;
            try { info.r = (typeof this.responseText === 'string' ? this.responseText : '').slice(0, 300); } catch (e) { info.r = ''; }
            logCap('xhr-end', { u: short(info.u, 160), s: info.s, r: short(info.r, 200) });
            if (NET_RE.test(info.u) || cap.on) {
              netLog.push(info);
              if (netLog.length > 20) netLog.shift();
              netListeners.forEach((fn) => { try { fn(info); } catch (e) {} });
            }
          });
        }
        return XS.apply(this, arguments);
      };
    } catch (e) {}
    try {
      const F = window.fetch;
      if (F) window.fetch = function (input, init) {
        const u = typeof input === 'string' ? input : input && input.url;
        if (cap.on && !(String(u).indexOf('/track/') >= 0 && init && init.credentials === 'include' && !init.method)) logCap('fetch', { u: short(u, 160), m: (init && init.method) || 'GET' });
        return F.apply(this, arguments);
      };
    } catch (e) {}
    try {
      const WS = window.WebSocket && WebSocket.prototype.send;
      if (WS) WebSocket.prototype.send = function (d) {
        logCap('ws-send', { u: short(this.url, 100), state: this.readyState, d: short(d, 200) });
        return WS.apply(this, arguments);
      };
    } catch (e) {}
    try {
      const B = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
      if (B) navigator.sendBeacon = function (u, d) { logCap('beacon', { u: short(u, 160) }); return B(u, d); };
    } catch (e) {}
    window.addEventListener('error', (e) => logCap('js-error', { m: short(e.message, 200), f: short(e.filename, 80).slice(-60), l: e.lineno, c: e.colno }), true);
    window.addEventListener('unhandledrejection', (e) => logCap('promise-error', { m: short(e.reason && (e.reason.message || e.reason), 200) }));
  }
  const siteEvents = [];
  function hookSiteEvents() {
    try {
      const jq = window.jQuery;
      if (!jq) return;
      jq(document).on('favor favored download downloaded vote voted received notify success', (e, d) => {
        siteEvents.push(e.type + '@' + new Date().toISOString().slice(11, 19));
        if (siteEvents.length > 20) siteEvents.shift();
        let dd = '';
        try { dd = JSON.stringify(d); } catch (x) {}
        logCap('event', { t: e.type, d: short(dd, 160) });
        if (/favor/.test(e.type)) setTimeout(() => { filled.forEach((c) => repaintFav(c.dataset.id)); listDirty = true; }, 60);
      });
      jq(document).on('ajaxSend', (e, x, s) => logCap('jq-ajax', { m: s && s.type, u: short(s && s.url, 160), d: short(s && s.data, 160) }));
      jq(document).on('ajaxError', (e, x, s, err) => logCap('jq-ajax-error', { u: short(s && s.url, 160), s: x && x.status, err: short(err, 80) }));
    } catch (e) {}
  }
  let lastAction = null;
  const favCount = () => { const s = $('#span-favorites'); return s ? clean(s.textContent) : null; };
  function paintFav(scope, t) {
    const on = isFav(t);
    scope.querySelectorAll('.fav, .rfav, .mfav').forEach((b) => {
      b.classList.toggle('on', on);
      const ic = b.querySelector('i');
      if (ic) ic.innerHTML = on ? ICON.starOn : ICON.star;
      const s = b.querySelector('span');
      if (s) s.textContent = on ? 'Guardada' : 'Guardar';
    });
  }
  function repaintFav(id) {
    const t = byId.get(id) || (current && current.id === id ? current : null);
    if (!t) return;
    const c = cardById(id);
    if (c) paintFav(c, t);
    const r = listRowById(id);
    if (r) paintFav(r, t);
    if (current && current.id === id) paintFav(miniEl, t);
  }
  // Módulo "application" de Soundeo (si su web lo ha cargado bien; en iPhone suele fallar).
  function siteApp() {
    try {
      const c = window.requirejs && window.requirejs.s && window.requirejs.s.contexts && window.requirejs.s.contexts._;
      const a = c && c.defined && c.defined.application;
      return a && typeof a.ajax === 'function' ? a : null;
    } catch (e) { return null; }
  }
  // Petición a Soundeo igual que hace su propio código (application.ajax → jQuery.ajax → fetch).
  function siteRequest(url, method) {
    method = method || 'POST';
    const app = siteApp();
    const jq = window.jQuery;
    logCap('request', { u: url, m: method, via: app ? 'application.ajax' : jq ? 'jQuery.ajax' : 'fetch' });
    if (app || jq) {
      return new Promise((resolve, reject) => {
        const opts = {
          url, type: method, data: {}, dataType: 'json',
          success: (r) => resolve({ r, app }),
          error: (x, st, err) => reject(new Error('HTTP ' + (x && x.status) + ' ' + (st || '') + (err ? ' ' + err : ''))),
        };
        try { (app || jq).ajax(opts); } catch (e) { reject(e); }
      });
    }
    const init = {
      method,
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*; q=0.01' },
    };
    if (method === 'POST') { init.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'; init.body = ''; }
    return fetch(url, init).then((resp) => {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json().then((r) => ({ r, app: null }), () => { throw new Error('HTTP ' + resp.status + ' parsererror'); });
    });
  }
  // Soundeo devuelve la cabecera nueva (contadores de descargas/favoritos/votos) en cada respuesta.
  function applyHeader(r) {
    if (!r || typeof r.header !== 'string') return false;
    try {
      const doc = new DOMParser().parseFromString('<div>' + r.header + '</div>', 'text/html');
      let any = false;
      ['#span-downloads', '#span-favorites', '#span-votes'].forEach((sel) => {
        const n = $(sel, doc);
        const o = $(sel);
        if (n && o) { o.innerHTML = n.innerHTML; any = true; }
      });
      updateCounters();
      return any;
    } catch (e) { return false; }
  }
  const trimResp = (r) => {
    if (!r || typeof r !== 'object') return r;
    const o = {};
    Object.keys(r).forEach((k) => { o[k] = typeof r[k] === 'string' ? short(r[k], 400) : r[k]; });
    return o;
  };
  const plainMsg = (m) => clean(String(m || '').replace(/<[^>]+>/g, ' '));
  function toggleFav(t) {
    if (favPending.has(t.id)) return; // ya hay una petición en curso
    const before = isFav(t);
    const c0 = favCount();
    const t0 = Date.now();
    const act = { type: 'fav', id: t.id, before, countBefore: c0 };
    lastAction = act;
    favPending.set(t.id, !before);
    repaintFav(t.id);
    startCapture('fav ' + t.id);
    const done = (ok, state, msg) => {
      favPending.delete(t.id);
      act.ok = ok;
      act.after = state;
      act.countAfter = favCount();
      act.ms = Date.now() - t0;
      repaintFav(t.id);
      if (ok) toast(state ? 'Guardada en favoritos' : 'Quitada de favoritos');
      else toast(msg || 'No se ha podido guardar', 'Diagnóstico', diagnostics);
    };
    siteRequest('/tracks/favor/' + encodeURIComponent(t.id))
      .then(({ r, app }) => {
        act.response = trimResp(r);
        if (!r || !r.success) {
          try { app && app.processCookies && app.processCookies(r); } catch (e) {}
          return done(false, before, r && r.message ? 'Soundeo dice: ' + plainMsg(r.message).slice(0, 110) : 'Soundeo no lo ha aceptado');
        }
        const favored = r.result ? r.result === 'favored' : !before;
        if (app && app.processResponse) { try { app.processResponse(r, true, null, null); } catch (e) {} }
        else if (!applyHeader(r)) {
          const sp = $('#span-favorites');
          const n = sp ? parseInt(clean(sp.textContent), 10) : NaN;
          if (sp && isFinite(n) && favored !== before) sp.textContent = String(Math.max(0, n + (favored ? 1 : -1)));
        }
        setFavKnown(t.id, favored, t);
        // avisar a la web de Soundeo para que su reproductor y sus listas se actualicen
        try { window.jQuery && window.jQuery(document).trigger('favored.track', { favored, trackId: Number(t.id) }); } catch (e) {}
        done(true, favored);
      })
      .catch((e) => done(false, before, 'Error al guardar: ' + short(e && e.message, 80)));
  }
  function dlLeft() {
    const s = $('#span-downloads');
    if (!s) return null;
    const m = s.textContent.match(/\d+/);
    return m ? +m[0] : null;
  }
  function voteLeft() {
    const s = $('#span-votes');
    if (!s) return null;
    const m = s.textContent.match(/\d+/);
    return m ? +m[0] : null;
  }
  function dlLeftText() {
    const n = dlLeft();
    const v = voteLeft();
    if (n == null && v == null) return 'No veo los contadores de Soundeo';
    const parts = [];
    if (n != null) parts.push(n + ' descarga' + (n === 1 ? '' : 's'));
    if (v != null) parts.push(v + ' like' + (v === 1 ? '' : 's'));
    return 'Te quedan ' + parts.join(' y ') + ' hoy';
  }
  const URLISH = /^(https?:\/\/|\/)[^\s<>"]+$/i;
  function startFileDownload(url) {
    logCap('file', { u: short(url, 200) });
    // Navegación normal: Safari pregunta si quieres descargar y la página se queda donde estaba.
    setTimeout(() => { window.location.href = url; }, 250);
  }
  function markDownloadedUi(t, fmt) {
    markDownloaded(t.id);
    const c = cardById(t.id);
    if (c) { const d = $('.rbtn.dl', c); if (d) { d.classList.add('done'); d.innerHTML = i('check'); } }
    const r = listRowById(t.id);
    if (r) { const d = $('.rdl', r); if (d) { d.classList.add('done'); d.innerHTML = i('check'); } }
    try { window.jQuery && window.jQuery(document).trigger('downloaded.track', { trackId: Number(t.id), trackFormat: Number(fmt) }); } catch (e) {}
  }
  function siteModal(html, t, fmt) {
    const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    const text = clean(doc.body.textContent).slice(0, 400);
    const opts = $$('a[href]', doc)
      .map((a) => ({ label: clean(a.textContent) || 'Abrir', href: a.getAttribute('href') }))
      .filter((o) => o.href && !/^javascript:|^#/.test(o.href))
      .slice(0, 4)
      .map((o) => ({ label: o.label, icon: /download/i.test(o.href) ? 'dl' : 'ext', pri: /download/i.test(o.href), fn: () => {
        if (/\/download\//i.test(o.href)) markDownloadedUi(t, fmt);
        startFileDownload(o.href);
      } }));
    actionSheet('Soundeo', text, '', opts.length ? opts : [{ label: 'Vale', icon: 'check', fn: () => {} }]);
  }
  function directDownload(t, fmt) {
    const url = '/download/' + encodeURIComponent(t.id) + '/' + encodeURIComponent(fmt);
    const act = { type: 'download', id: t.id, fmt, left: dlLeft() };
    lastAction = act;
    startCapture('download ' + t.id + ' f' + fmt);
    toast('Pidiendo la descarga · ' + ((t.downloads.find((d) => d.fmt === String(fmt)) || {}).name || ''));
    siteRequest(url, 'GET')
      .then(({ r }) => {
        act.response = trimResp(r);
        applyHeader(r);
        const flash = r && r.flash && r.flash.message ? plainMsg(r.flash.message) : '';
        if (r && r.modal) { siteModal(r.modal, t, fmt); return; }
        if (!r || !r.success) {
          toast(r && r.message ? 'Soundeo dice: ' + plainMsg(r.message).slice(0, 110) : flash || 'Soundeo no ha permitido la descarga', 'Diagnóstico', diagnostics);
          return;
        }
        // ¿adónde ir a buscar el archivo? (como hace su web: url o jsActions)
        let target = typeof r.url === 'string' && r.url !== '#' && URLISH.test(r.url) ? r.url : null;
        if (!target && r.jsActions && typeof r.jsActions === 'object') {
          Object.keys(r.jsActions).forEach((k) => {
            const v = r.jsActions[k];
            if (!target && typeof v === 'string' && URLISH.test(v)) target = v;
          });
        }
        act.target = target;
        markDownloadedUi(t, fmt);
        if (target) {
          toast(flash || 'Descargando… Safari te preguntará dónde guardarla');
          startFileDownload(target);
        } else {
          toast(flash || 'Descarga aceptada, pero Soundeo no ha mandado el archivo', 'Diagnóstico', diagnostics);
        }
      })
      .catch((e) => {
        const m = String(e && e.message);
        act.error = m;
        // si la respuesta no era JSON, probablemente era ya el archivo: lo abrimos directamente
        if (/parsererror/i.test(m)) { markDownloadedUi(t, fmt); startFileDownload(url); return; }
        toast('Error al descargar: ' + short(m, 80), 'Diagnóstico', diagnostics);
      });
  }
  function askDownload(t) {
    if (!t.downloads.length) return;
    if (!prefs.confirmDownload) { directDownload(t, t.downloads[0].fmt); return; }
    const n = dlLeft();
    const already = t.siteDownloaded || myDownloads.has(t.id);
    const opts = t.downloads.map((d) => ({
      label: d.name, small: d.size, icon: 'dl', pri: d === t.downloads[0],
      disabled: n === 0 && !already,
      fn: () => directDownload(t, d.fmt),
    }));
    actionSheet('Descargar', (t.artist ? t.artist + ' – ' : '') + t.name + (t.mix ? ' (' + t.mix + ')' : ''),
      (already ? 'Ya la descargaste antes. ' : '') + (n == null ? '' : n === 0 ? 'No te quedan descargas hoy.' : 'Te quedan ' + n + ' hoy.') +
      ' En el iPhone se guarda en Archivos → Descargas.', opts);
  }
  const toInt = (x) => { const k = typeof x === 'number' ? x : typeof x === 'string' && /^\s*\d+\s*$/.test(x) ? parseInt(x, 10) : NaN; return isFinite(k) ? k : null; };
  // ¿Cómo ha quedado el voto según la respuesta de Soundeo? Por orden de fiabilidad: lo que dice con palabras,
  // si el contador de votos disponibles ha bajado o subido, un sí/no, y si no hay nada de eso se da por cambiado.
  function votedFrom(r, before, left0, left1) {
    const x = r.hasOwnProperty('voted') ? r.voted : r.result;
    const txt = (typeof x === 'string' ? x : '') + ' ' + (r.flash && r.flash.message ? r.flash.message : '');
    if (/unvot|remov|cancel|revok|withdr/i.test(txt)) return false;
    if (typeof x === 'string' && /vot/i.test(x)) return true;
    if (left0 != null && left1 != null && left0 !== left1) return left1 < left0;
    if (typeof x === 'boolean') return x;
    return !before;
  }
  const respError = (r) => {
    if (!r) return 'Soundeo no ha respondido';
    const bad = !r.success || (r.flash && /err|fail|warn|danger/i.test(String(r.flash.type || '')));
    if (!bad) return '';
    const m = plainMsg(r.message || (r.flash && r.flash.message) || '');
    return m ? 'Soundeo dice: ' + m.slice(0, 110) : 'Soundeo no lo ha aceptado';
  };
  // Me gusta (el voto de Soundeo para que un track aún no publicado esté disponible). Tocar otra vez lo quita.
  function vote(t) {
    if (votePending.has(t.id)) return;
    const before = isVoted(t);
    const n0 = votesOf(t);
    const act = { type: 'vote', id: t.id, before, votesBefore: n0, leftBefore: voteLeft() };
    lastAction = act;
    votePending.set(t.id, !before);
    repaintVote(t.id);
    startCapture('vote ' + t.id);
    const done = (ok, on, n, msg) => {
      votePending.delete(t.id);
      if (ok) setVoteKnown(t, on, n);
      act.ok = ok;
      act.after = on;
      act.votesAfter = n;
      act.leftAfter = voteLeft();
      repaintVote(t.id);
      if (ok) toast(on === before ? (on ? 'Ya tenía tu me gusta' : 'Soundeo no ha cambiado el voto') : on ? 'Me gusta enviado' : 'Me gusta quitado');
      else toast(msg || 'No se ha podido votar', 'Diagnóstico', diagnostics);
    };
    siteRequest('/tracks/vote/' + encodeURIComponent(t.id), 'POST')
      .then(({ r, app }) => {
        act.response = trimResp(r);
        const err = respError(r);
        if (err) {
          try { app && app.processCookies && app.processCookies(r); } catch (e) {}
          applyHeader(r);
          return done(false, before, n0, err);
        }
        applyHeader(r);
        const on = votedFrom(r, before, act.leftBefore, voteLeft());
        let n = [r.votes, r.count, r.number, r.votesCount, r.votes_count].map(toInt).find((x) => x != null);
        if (n == null && n0 != null) n = Math.max(0, n0 + (on === before ? 0 : on ? 1 : -1));
        // que la web de Soundeo quede igual (su contador en la fila y su reproductor)
        try {
          const num = /^\d+$/.test(t.id) ? $('.vote[data-track-id="' + t.id + '"] .number') : null;
          if (num && n != null) num.textContent = n + ' | ';
          window.jQuery && window.jQuery(document).trigger('voted.track', { voted: on, votes: n, trackId: Number(t.id) });
        } catch (e) {}
        done(true, on, n == null ? null : n);
      })
      .catch((e) => done(false, before, n0, 'Error al votar: ' + short(e && e.message, 80)));
  }

  /* ───────────── hojas ───────────── */
  function openSheet(cls) {
    closeSheets();
    shadeEl.classList.add('on');
    $('.' + cls, root).classList.add('on');
  }
  function closeSheets() {
    if (!root) return;
    shadeEl.classList.remove('on');
    $$('.sheet.on', root).forEach((s) => s.classList.remove('on'));
  }
  function actionSheet(title, sub, note, opts) {
    const s = $('.s-action', root);
    $('h2', s).textContent = title;
    const b = $('.sb', s);
    b.innerHTML = (sub ? `<div class="asub">${esc(sub)}</div>` : '') + (note ? `<div class="note" style="margin:0 0 6px">${esc(note)}</div>` : '');
    opts.forEach((o) => {
      const txt = o.hint ? `<span class="ol"><span>${esc(o.label)}</span><em>${esc(o.hint)}</em></span>` : `<span>${esc(o.label)}</span>`;
      const x = el(`<button class="opt${o.pri ? ' pri' : ''}"${o.disabled ? ' disabled' : ''}>${o.icon ? i(o.icon) : ''}${txt}${o.small ? '<small>' + esc(o.small) + '</small>' : ''}</button>`);
      if (!o.disabled) x.addEventListener('click', () => { closeSheets(); o.fn(); });
      b.appendChild(x);
    });
    b.scrollTop = 0;
    openSheet('s-action');
  }
  function moreSheet(t) {
    const opts = [];
    const m = metaCache[t.id];
    if (m && m.ar && m.ar.length) m.ar.slice(0, 4).forEach((a) => opts.push({ label: a[1], hint: 'Artista · ver sus tracks', icon: 'user', fn: () => openSource(artistDesc(a[0], a[1]), { view: 'list' }) }));
    else if (t.artist) opts.push({ label: t.artist, hint: 'Artista · ver sus tracks', icon: 'user', fn: () => openArtist(t) });
    if (t.releaseUrl) opts.push({ label: t.release || 'Release', hint: 'Release · ver todos sus tracks', icon: 'disc', fn: () => openRelease(t) });
    if (t.labelId) opts.push({ label: t.label, hint: 'Sello · ver sus tracks', icon: 'tag', fn: () => openLabel(t) });
    if (t.genreId) opts.push({ label: t.genre, hint: 'Género · lo último disponible', icon: 'feed', fn: () => openGenre(t) });
    if (/^\d+$/.test(t.id)) opts.push({ label: 'Parecidas', hint: 'Lo que también descargan quienes bajan esta', icon: 'disc', fn: () => openSimilar(t) });
    opts.push({ label: 'Copiar nombre', hint: (t.artist ? t.artist + ' – ' : '') + t.name, icon: 'check', fn: () => copyText(t.full) });
    if (t.trackUrl) opts.push({ label: 'Abrir en la web de Soundeo', icon: 'ext', fn: () => { closeApp(true); location.href = t.trackUrl; } });
    if (t.vote) opts.push(isVoted(t) ? { label: 'Quitar me gusta', icon: 'heartOn', fn: () => vote(t) } : { label: 'Me gusta', hint: 'Vota para que esté disponible', icon: 'heart', fn: () => vote(t) });
    actionSheet(t.name, [t.artist, t.mix].filter(Boolean).join(' · '), '', opts);
    // si aún no sabemos quiénes son los artistas, pedirlo ya para que el toque sea inmediato
    if (!(m && m.ar)) getMeta(t, true, true);
  }
  function copyText(s) {
    const done = () => toast('Copiado');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(s).then(done, () => fallbackCopy(s, done)); return; }
    } catch (e) {}
    fallbackCopy(s, done);
  }
  function fallbackCopy(s, done) {
    const ta = document.createElement('textarea');
    ta.value = s;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('No se pudo copiar'); }
    ta.remove();
  }

  /* ───────────── ajustes ───────────── */
  function goStart() {
    closeSheets();
    openSource(sectionDesc(prefs.startSection || 'avail'), { root: true, view: 'list' });
  }
  function openSettings(mode) {
    const isStart = mode === 'start';
    const canF = isStart || !!(cur && cur.canFilter);
    const loose = !isStart && !!(cur && cur.loose);
    const f = cleanFilters(isStart ? defFilters : (cur && cur.filters) || defFilters);
    if (isStart) f.search = '';
    const s = $('.s-settings', root);
    const b = $('.sb', s);
    $('h2', s).textContent = isStart ? 'Filtros al abrir' : 'Ajustes';
    const genres = genreOptions();
    const keys = keyOptions();
    const acc = clean($('#top-menu-account span') && $('#top-menu-account span').textContent);
    const atStart = !!cur && stack.length === 1 && cur.kind === 'section' && cur.key === (prefs.startSection || 'avail') && (!cur.filters || normFilters(cur.filters) === normFilters(sectionDesc(cur.key).filters));
    const filterBlock = !canF ? '' : `
      <div class="sec">${isStart ? 'Filtros de inicio' : 'Filtros de ' + esc(cur.title)}</div>
      ${loose ? '<div class="note" style="margin-top:0">En esta sección Soundeo puede no aplicar todos los filtros; el género se filtra en la app.</div>' : ''}
      <div class="lab">Géneros <small class="gcount"></small></div>
      <div class="tags tg-genres collapsed">${genres.map((g) => `<button class="tag" data-id="${esc(g.id)}">${esc(g.name)}</button>`).join('')}<button class="tag tmore" data-for="tg-genres">＋ Ver los ${genres.length}</button></div>
      <div class="lab">BPM <a href="#" class="bpmclear">Quitar</a></div>
      <div class="bpm"><input class="bmin" type="number" inputmode="numeric" placeholder="mín" min="0" max="260"><span>–</span><input class="bmax" type="number" inputmode="numeric" placeholder="máx" min="0" max="260"></div>
      <div class="presets">${[[120, 126], [124, 130], [127, 140], [130, 140], [135, 150]].map(([a, z]) => `<button class="tag bp" data-a="${a}" data-z="${z}">${a}–${z}</button>`).join('')}</div>
      <div${loose ? ' style="display:none"' : ''}><div class="lab">Fecha de lanzamiento</div>
      <div class="tags tg-time">${TIME_OPTS.map(([v, n]) => `<button class="tag" data-v="${v}">${n}</button>`).join('')}</div></div>
      <div class="lab">Tonalidad <small>opcional · Camelot</small></div>
      <div class="tags tg-keys collapsed">${keys.map((k) => `<button class="tag" data-id="${esc(k.id)}"><small>${esc(k.cam)}</small>${esc(k.id)}</button>`).join('')}<button class="tag tmore" data-for="tg-keys">＋ Elegir tonalidades</button></div>
      <div${isStart || loose ? ' style="display:none"' : ''}><div class="lab">Buscar por título</div>
      <input class="txt srch-t" type="search" placeholder="Mín. 3 letras" autocomplete="off" autocapitalize="off">
      <div class="tg"><div><b>Solo disponibles</b><small>Oculta los tracks que solo se pueden votar</small></div><button class="sw sw-av"></button></div></div>`;
    b.innerHTML = `
      ${isStart ? '<div class="note" style="margin-top:4px">Con estos filtros se abre la app, y son los que se usan en las secciones del menú.</div>' : `
      <div class="sec">Al abrir la app</div>
      <div class="lab">Sección</div>
      <div class="tags tg-sec">${SECTIONS.map((x) => `<button class="tag" data-k="${x.key}">${esc(x.name)}</button>`).join('')}</div>
      <button class="opt ostart" style="margin-top:6px">${i('sliders')}<span class="ol"><span>Filtros de inicio</span><em>${esc(describeFilters(defFilters))}</em></span><small>›</small></button>
      <div class="tg"><div><b>Empezar siempre con estos filtros</b><small>Aunque entres desde un marcador, un enlace o soundeo.com</small></div><button class="sw" data-p="forceStart"></button></div>
      <div class="tg"><div><b>Abrir la app automáticamente</b><small>Al entrar en Soundeo desde el móvil</small></div><button class="sw" data-p="autoOpen"></button></div>
      <div class="lab">Vista al abrir</div>
      <div class="seg2 sv"><button data-v="feed">Feed</button><button data-v="list">Lista</button></div>
      ${atStart ? '' : '<button class="opt pri bmine" style="margin-top:6px">' + i('feed') + '<span>Ir ahora a la sección y filtros de inicio</span></button>'}
      `}
      ${filterBlock}
      ${isStart ? '' : `
      <div class="sec">Pantalla</div>
      <div class="tg"><div><b>Esconder la barra de Safari</b><small>Desliza hacia arriba una vez y la barra se queda pequeña (en horizontal desaparece). Vuelve si la tocas</small></div><button class="sw" data-p="immersive"></button></div>
      <div class="sec">Reproducción</div>
      <div class="tg"><div><b>Pasar a la siguiente al acabar</b><small>Cuando termina la preview</small></div><button class="sw" data-p="autoNext"></button></div>
      <div class="tg"><div><b>Precargar las siguientes canciones</b><small>Empiezan a sonar al instante y se puede saltar por ellas sin esperar. Gasta más datos</small></div><button class="sw" data-p="preload"></button></div>
      <div class="tg"><div><b>Feed: solo lo que no he escuchado</b><small>En las secciones, oculta los tracks que ya han sonado</small></div><button class="sw" data-p="skipHeard"></button></div>
      <div class="tg"><div><b>Sincronizar escuchadas con la web</b><small>Lo que Soundeo marca como escuchado cuenta aquí, y lo que escuchas aquí se marca en Soundeo</small></div><button class="sw" data-p="siteHeard"></button></div>
      <div class="tg"><div><b>Confirmar antes de descargar</b><small>Para no gastar descargas sin querer</small></div><button class="sw" data-p="confirmDownload"></button></div>

      <div class="sec">Más</div>
      <button class="opt gomenu">${i('menu')}<span>Secciones de Soundeo</span></button>
      <button class="opt goweb">${i('ext')}<span>Ver la web original</span></button>
      <button class="opt rsheard">${i('back')}<span>Olvidar escuchadas</span><small>${heard.size}</small></button>
      ${loader() ? `<button class="opt oupd">${i('fwd')}<span>Buscar actualización</span><small>v${VERSION}</small></button>` : ''}
      <button class="opt diag">${i('more')}<span>Diagnóstico (para Claude)</span></button>
      <div class="note">Soundeo Feed ${VERSION}${loader() ? ' · se actualiza sola' : ''}${acc ? ' · Premium: ' + esc(acc) : ''}</div>`}
    `;
    const foot = $('.sf', s);
    foot.style.display = canF ? '' : 'none';
    if (canF) {
      const paintTags = () => {
        $$('.tg-genres .tag[data-id]', b).forEach((x) => x.classList.toggle('on', f.genres.includes(x.dataset.id)));
        $('.gcount', b).textContent = f.genres.length ? f.genres.length + ' seleccionados' : 'todos';
        $$('.tg-time .tag', b).forEach((x) => x.classList.toggle('on', x.dataset.v === String(f.time)));
        $$('.tg-keys .tag[data-id]', b).forEach((x) => x.classList.toggle('on', f.keys.includes(x.dataset.id)));
        $$('.presets .bp', b).forEach((x) => x.classList.toggle('on', +x.dataset.a === f.bpmMin && +x.dataset.z === f.bpmMax));
        $('.sw-av', b).classList.toggle('on', String(f.available) !== '0');
      };
      $('.bmin', b).value = f.bpmMin != null ? f.bpmMin : '';
      $('.bmax', b).value = f.bpmMax != null ? f.bpmMax : '';
      $('.srch-t', b).value = f.search || '';
      paintTags();
      $$('.tg-genres .tag[data-id]', b).forEach((x) => x.addEventListener('click', () => {
        const id = x.dataset.id;
        f.genres = f.genres.includes(id) ? f.genres.filter((g) => g !== id) : f.genres.concat(id);
        paintTags();
      }));
      $$('.tg-time .tag', b).forEach((x) => x.addEventListener('click', () => { f.time = x.dataset.v; paintTags(); }));
      $$('.tg-keys .tag[data-id]', b).forEach((x) => x.addEventListener('click', () => {
        const id = x.dataset.id;
        f.keys = f.keys.includes(id) ? f.keys.filter((k) => k !== id) : f.keys.concat(id);
        paintTags();
      }));
      $$('.presets .bp', b).forEach((x) => x.addEventListener('click', () => {
        f.bpmMin = +x.dataset.a; f.bpmMax = +x.dataset.z;
        $('.bmin', b).value = f.bpmMin; $('.bmax', b).value = f.bpmMax; paintTags();
      }));
      $('.bpmclear', b).addEventListener('click', (e) => { e.preventDefault(); f.bpmMin = f.bpmMax = null; $('.bmin', b).value = ''; $('.bmax', b).value = ''; paintTags(); });
      $$('.tmore', b).forEach((x) => x.addEventListener('click', () => {
        $('.' + x.dataset.for, b).classList.remove('collapsed');
        x.remove();
      }));
      const readBpm = () => {
        const a = parseInt($('.bmin', b).value, 10);
        const z = parseInt($('.bmax', b).value, 10);
        f.bpmMin = isFinite(a) ? a : null;
        f.bpmMax = isFinite(z) ? z : null;
        if (f.bpmMin != null && f.bpmMax != null && f.bpmMin > f.bpmMax) { const t = f.bpmMin; f.bpmMin = f.bpmMax; f.bpmMax = t; }
        paintTags();
      };
      $('.bmin', b).addEventListener('change', readBpm);
      $('.bmax', b).addEventListener('change', readBpm);
      $('.sw-av', b).addEventListener('click', () => { f.available = String(f.available) === '0' ? '1' : '0'; paintTags(); });
      const go = () => {
        readBpm();
        f.search = clean($('.srch-t', b).value);
        if (f.search && f.search.length < 3) { toast('La búsqueda por título necesita 3 letras o más'); return; }
        closeSheets();
        refilter(f);
      };
      const saveStart = () => {
        readBpm();
        defFilters = Object.assign({}, DEFAULT_FILTERS, { genres: f.genres.slice(), bpmMin: f.bpmMin, bpmMax: f.bpmMax, time: f.time, keys: f.keys.slice(), trackType: f.trackType, search: '' });
        LS.set('filters', defFilters);
      };
      if (isStart) {
        foot.innerHTML = '<button class="btn bback">Volver</button><button class="btn pri bsavestart">Guardar</button>';
        $('.bback', foot).addEventListener('click', () => openSettings());
        $('.bsavestart', foot).addEventListener('click', () => {
          saveStart();
          openSettings();
          toast('Guardado: la app se abrirá con estos filtros', 'Verlos ya', goStart);
        });
      } else {
        foot.innerHTML = '<button class="btn bsave">Guardar como inicio</button><button class="btn pri bapply">Aplicar filtros</button>';
        $('.bapply', foot).addEventListener('click', go);
        $('.bsave', foot).addEventListener('click', () => { saveStart(); toast('Guardados como filtros de inicio'); go(); });
      }
    }
    if (isStart) { $('.sb', s).scrollTop = 0; openSheet('s-settings'); return; }
    const paintSec = () => $$('.tg-sec .tag', b).forEach((x) => x.classList.toggle('on', x.dataset.k === (prefs.startSection || 'avail')));
    paintSec();
    $$('.tg-sec .tag', b).forEach((x) => x.addEventListener('click', () => { prefs.startSection = x.dataset.k; savePrefs(); paintSec(); }));
    const bm = $('.bmine', b);
    if (bm) bm.addEventListener('click', goStart);
    $('.ostart', b).addEventListener('click', () => openSettings('start'));
    $$('.sw[data-p]', b).forEach((x) => {
      const p = x.dataset.p;
      x.classList.toggle('on', !!prefs[p]);
      x.addEventListener('click', () => {
        prefs[p] = !prefs[p];
        savePrefs();
        x.classList.toggle('on', !!prefs[p]);
        if (p === 'skipHeard' || p === 'siteHeard') {
          setHidden(cur && cur.hide ? hiddenFor(tracks) : new Set());
          setForced(new Set());
          rebuild(current || deck[activeIdx]);
        }
        if (p === 'preload' && !prefs.preload) dropPreloads();
        if (p === 'immersive') { LS.set('immHint', 0); immApply(); }
      });
    });
    const paintSv = () => $$('.sv button', b).forEach((x) => x.classList.toggle('on', x.dataset.v === prefs.startView));
    paintSv();
    $$('.sv button', b).forEach((x) => x.addEventListener('click', () => { prefs.startView = x.dataset.v; savePrefs(); paintSv(); }));
    $('.gomenu', b).addEventListener('click', openMenu);
    $('.goweb', b).addEventListener('click', () => { closeSheets(); closeApp(); });
    $('.rsheard', b).addEventListener('click', () => {
      heard.clear();
      LS.set('heard', []);
      setHidden(cur && cur.hide ? hiddenFor(tracks) : new Set());
      setForced(new Set());
      rebuild(current || deck[activeIdx]);
      closeSheets();
      toast('Historial de escuchadas borrado');
    });
    $('.diag', b).addEventListener('click', diagnostics);
    const ou = $('.oupd', b);
    if (ou) ou.addEventListener('click', () => { closeSheets(); checkUpdate(); });
    openSheet('s-settings');
  }

  /* ───────────── diagnóstico ───────────── */
  // Resumen de cómo es una página de Soundeo (solo su estructura), para cuando no encuentro tracks en ella.
  function pageShape(doc) {
    try {
      const left = $('.content .left', doc) || $('.content', doc) || doc.body;
      const sig = (n) => n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') +
        (typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/).slice(0, 4).join('.') : '');
      const tally = (nodes) => {
        const m = {};
        nodes.forEach((n) => { const k = sig(n); m[k] = (m[k] || 0) + 1; });
        return Object.keys(m).slice(0, 20).map((k) => (m[k] > 1 ? k + ' ×' + m[k] : k));
      };
      const kids = Array.from(left.children);
      const first = kids.find((c) => !/^(h1|script|style)$/i.test(c.tagName) && clean(c.textContent).length > 3);
      return {
        title: short(doc.title, 80), root: sig(left),
        heads: $$('h1,h2,h3', left).slice(0, 6).map((h) => h.tagName + ': ' + short(h.textContent, 50)),
        children: tally(kids), inner: tally(kids.flatMap((c) => Array.from(c.children))),
        previews: $$('[data-track-url]', doc).length, trackLinks: $$('a[href*="/track/"]', left).length,
        sample: first ? short(first.outerHTML, 900) : null,
      };
    } catch (e) { return { err: String(e) }; }
  }
  async function diagnostics() {
    const t = deck[activeIdx] || tracks[0];
    const avg = (x) => (x.n ? Math.round(x.ms / x.n) : null);
    const out = {
      v: VERSION,
      url: location.href,
      ua: navigator.userAgent,
      view,
      tracks: tracks.length,
      deck: deck.length,
      cards: filled.size,
      coverSize,
      sampleMeta: t && metaCache[t.id],
      jq: typeof window.jQuery,
      loader: loader() ? { v: loader().version, running: loader().running, src: loader().source } : null,
      nav: stack.map((s) => ({
        kind: s.kind, key: s.key, title: s.title, url: short(String(s.url).replace(location.origin, ''), 200), tracks: (s === cur ? tracks : s.tracks).length,
        mode: s.mode, pages: s.pages.first + '-' + s.pages.last + (s.pages.hasMore ? '+' : ''), count: s.count, cut: s.cut || undefined,
        follow: s.follow || undefined, error: s.error || undefined, msg: s.msg || undefined, probe: s.probe || undefined,
        tries: s.tries || undefined, filtersOn: s.filtersOn || undefined,
      })),
      player: {
        preload: prefs.preload, broken: pl.broken, unlocked: pl.unlocked, primes: pl.primes, swaps: pl.swaps, fails: pl.fails,
        startMs: { pre: avg(pl.stat.pre), preN: pl.stat.pre.n, cold: avg(pl.stat.cold), coldN: pl.stat.cold.n }, last: pl.last,
        seek: { n: pl.seek.n, avgMs: avg(pl.seek), inBuffer: pl.seek.inBuf, last: pl.seek.last },
        pool: players.map((a) => ({ on: a === audio, id: a._sxId || null, ready: a.readyState, buf: bufSecs(a), err: a.error ? a.error.code : null })),
      },
      lastAction,
      capture: cap.items,
      counters: { downloads: dlLeft(), favorites: favCount(), votes: voteLeft() },
      screen: {
        imm: !!prefs.immersive, on: imm.on, armed: imm.armed, y: Math.round(window.scrollY), ih: window.innerHeight, iw: window.innerWidth,
        vv: window.visualViewport ? Math.round(window.visualViewport.height) : null, sh: screen.height, sw: screen.width, sab: immSab(),
        measured: imm.h ? { h: imm.h, w: imm.w, sab: imm.sab } : null, log: imm.log,
      },
      votes: { shapes: Array.from(voteShapes.values()), detect: voteDetect, mine: myVotes.size, votable: tracks.filter((x) => x.vote).length, voted: tracks.filter((x) => x.vote && isVoted(x)).length },
      siteListened: { tracks: tracks.length, siteHeard: tracks.filter((x) => x.siteHeard).length, mine: tracks.filter((x) => heard.has(x.id)).length, heardTotal: heard.size },
    };
    if (t) {
      const fb = origFav(t);
      out.favBtn = fb ? short(fb.outerHTML, 200) : null;
      if (!metaCache[t.id] && t.trackUrl) try {
        const r = await fetch(t.trackUrl, { credentials: 'include' });
        const html = await r.text();
        out.trackStatus = r.status;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const scope = stripChrome(doc);
        const src = scope ? scope.innerHTML.replace(/\s+/g, ' ') : '';
        const k = src.search(/bpm/i);
        out.trackBpmSnippet = k >= 0 ? src.slice(Math.max(0, k - 400), k + 400) : src.slice(0, 800);
      } catch (e) { out.trackErr = String(e); }
    }
    showDiag('Diagnóstico', JSON.stringify(out, null, 1));
  }
  function showDiag(title, txt) {
    const s = $('.s-action', root);
    $('h2', s).textContent = title;
    const b = $('.sb', s);
    b.innerHTML = '<div class="note" style="margin-top:0">Copia esto y pégamelo en el chat (no incluye contraseñas ni cookies).</div><textarea class="diag" readonly></textarea><div class="stack"><button class="btn pri full bcopy">Copiar</button></div>';
    $('textarea', b).value = txt;
    $('.bcopy', b).addEventListener('click', () => copyText(txt));
    openSheet('s-action');
  }

  /* ───────────── toasts y contadores ───────────── */
  function toast(msg, actionLabel, fn) {
    if (!toastsEl || !isOpen) return;
    const t = el(`<div class="toast"><span>${esc(msg)}</span>${actionLabel ? '<button>' + esc(actionLabel) + '</button>' : ''}</div>`);
    if (actionLabel) $('button', t).addEventListener('click', () => { t.remove(); fn && fn(); });
    toastsEl.appendChild(t);
    while (toastsEl.children.length > 3) toastsEl.firstElementChild.remove();
    setTimeout(() => t.remove(), actionLabel ? 6000 : 2600);
  }
  function updateCounters() {
    if (!root) return;
    const n = dlLeft();
    const p = $('.dlleft', root);
    $('.dlc', p).textContent = n == null ? '–' : String(n);
    p.classList.toggle('zero', n === 0);
    const v = voteLeft();
    p.classList.toggle('hasv', v != null);
    $('.vl b', p).textContent = v == null ? '–' : String(v);
    $('.vl', p).classList.toggle('zero', v === 0);
  }
  function watchSite() {
    const left = $('.content .left');
    if (left) {
      new MutationObserver((muts) => {
        const ids = new Set();
        muts.forEach((m) => {
          const tgt = m.target;
          if (tgt && tgt.classList && tgt.classList.contains('favorites')) {
            const id = tgt.getAttribute('data-track-id');
            if (id) { ids.add(id); if (!favPending.has(id)) favKnown.set(id, tgt.classList.contains('favored')); }
          }
        });
        ids.forEach((id) => id && repaintFav(id));
      }).observe(left, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    ['#span-downloads', '#span-favorites', '#span-votes'].forEach((sel) => {
      const n = $(sel);
      if (n) new MutationObserver(updateCounters).observe(n, { subtree: true, childList: true, characterData: true });
    });
    const seen = new Set();
    const relay = (node) => {
      if (!(node instanceof HTMLElement) || node.id === 'sx-host') return;
      const txt = clean(node.textContent);
      if (!txt || txt.length > 220 || seen.has(txt)) return;
      seen.add(txt);
      setTimeout(() => seen.delete(txt), 4000);
      toast(txt);
    };
    const alerts = $('#alerts');
    if (alerts) new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(relay))).observe(alerts, { childList: true, subtree: true });
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((nd) => {
      if (nd instanceof HTMLElement && /(alert|notif|flash|message|toast|growl|noty)/i.test(nd.className || '')) relay(nd);
    }))).observe(document.body, { childList: true });
  }

  /* ───────────── actualizaciones (cargador) ───────────── */
  const loader = () => window.__SX_LOADER__ || null;
  let updateReady = null;
  window.addEventListener('sxfeed:update', (e) => {
    updateReady = (e && e.detail) || {};
    toast('Nueva versión ' + (updateReady.version || '') + ' lista', 'Recargar', () => location.reload());
  });
  function checkUpdate() {
    const L = loader();
    if (!L || !L.check) { toast('Esta instalación no tiene cargador'); return; }
    toast('Buscando actualización…');
    L.check(true).then((res) => {
      if (res.updated) { updateReady = res; toast('Nueva versión ' + res.version + ' lista', 'Recargar', () => location.reload()); }
      else if (updateReady) toast('Versión ' + (updateReady.version || '') + ' ya descargada', 'Recargar', () => location.reload());
      else toast('Ya tienes la última versión (' + VERSION + ')');
    }).catch((e) => toast('No se pudo comprobar: ' + short(e && e.message, 60)));
  }

  /* ───────────── arranque ───────────── */
  function init() {
    const hs = parseHash();
    let navType = 'navigate';
    try { navType = (performance.getEntriesByType('navigation')[0] || {}).type || 'navigate'; } catch (e) {}
    const resume = navType === 'reload' || navType === 'back_forward';
    const fromOutside = navType === 'navigate' && !hs.view;
    // «Cerrada» solo vale mientras se navega por la web normal desde dentro. Si se entra otra vez desde fuera
    // (marcador, escribir la dirección, un enlace de otra app), la app vuelve a abrirse sola.
    let ref = '';
    try { ref = document.referrer || ''; } catch (e) {}
    if (navType === 'navigate' && ref.indexOf(location.origin + '/') !== 0) SS.del('closed');
    // Sin sesión iniciada la app no puede hacer nada útil: avisar en vez de quedarse callada, y abrirse al iniciarla.
    const logged = isLoggedIn();
    let justLogged = false;
    if (logged) { justLogged = !!SS.get('loggedOut', 0); SS.del('loggedOut'); }
    const loggedOut = !logged && looksLoggedOut();
    if (loggedOut) SS.set('loggedOut', 1);
    const tellLogin = () => { if (loggedOut && isMobile()) pageNotice('inicia sesión en Soundeo y la app se abrirá sola.', 7000); };
    if ((fromOutside || (justLogged && !hs.view)) && prefs.forceStart && prefs.autoOpen && isMobile() && logged && !SS.get('closed', 0) &&
        (location.pathname === '/' || (/^\/list\/tracks/.test(location.pathname) && !sameAsStart()) || (justLogged && !/^\/list\/tracks/.test(location.pathname)))) {
      location.replace(startUrl() + '#sx=' + prefs.startView);
      return;
    }
    const firstBoot = !SS.get('booted', 0);
    // la página con la que arranca Safari es la primera fuente (no hay que pedir nada)
    const info = readDoc(document, location.href);
    if (!info.tracks.length) {
      // página sin tracks (portada, cuenta…): solo el botón para abrir la app
      if (!logged) { tellLogin(); return; }
      buildShell();
      root.classList.add('fabon');
      return;
    }
    SS.set('booted', 1);
    const live = mkSrc(Object.assign(describeUrl(location.href) || { kind: 'page', title: 'Soundeo', url: location.href.split('#')[0] }, { live: true, loaded: true }));
    if (live.key === 'top100') info.tracks.forEach((t, k) => { t.rank = k + 1; });
    live.tracks = localFilter(live, info.tracks);
    live.pages = newPages(pageNumber());
    live.pages.next = info.next;
    live.pages.hasMore = !!info.next;
    live.count = info.count;
    live.follow = info.follow;
    live.release = info.release;
    live.msg = info.msg;
    if (info.title && /^(artist|label|release|page)$/.test(live.kind)) live.title = info.title;
    live.mode = listModeFor(live.tracks);
    live.hidden = live.hide ? hiddenFor(live.tracks) : new Set();
    liveSrc = live;
    buildShell();
    root.classList.add('fabon');
    // la posición guardada solo vale al recargar o volver atrás (no al abrir un marcador)
    const resumeId = resume ? hs.id || SS.get('pos:' + location.pathname + location.search, null) : null;
    if (resumeId) { live.forced.add(resumeId); live.at = resumeId; }
    stack = [live];
    // al recargar, volver a donde estabas (sección, artista, búsqueda…)
    const nav = resume ? SS.get('nav', null) : null;
    if (Array.isArray(nav) && nav.length && (nav.length > 1 || !nav[0].live) && (!nav[0].live || sameUrl(nav[0].url, live.url))) {
      stack = nav.map((x, k) => {
        if (k === 0 && x.live) { live.view = x.view; if (x.at && nav.length > 1) { live.at = x.at; live.forced.add(x.at); } return live; }
        return mkSrc(Object.assign({}, x, { live: false }));
      });
    }
    const top = stack[stack.length - 1];
    view = (hs.view || (resume && top.view) || SS.get('view', null) || prefs.startView) === 'list' ? 'list' : 'feed';
    if (!top.loaded) ensureLoaded(top);
    adopt(top);
    watchSite();
    hookNet();
    hookSiteEvents();
    setupMediaSessionHandlers();
    probeCoverSize(live.tracks[0] && live.tracks[0].cover);

    const isListPage = /^\/list\/tracks/.test(location.pathname);
    const shouldOpen = hs.view || (isListPage && prefs.autoOpen && isMobile() && !SS.get('closed', 0));
    if (shouldOpen) {
      if (deck[activeIdx]) load(deck[activeIdx], false);
      openApp(view);
      // sección de inicio que no es una lista normal (Top 100, próximos, seguidos…): abrirla ahora
      const sec = prefs.startSection || 'avail';
      if (!resume && (fromOutside || firstBoot) && stack.length === 1 && !/^(avail|all)$/.test(sec) && SECTIONS.some((x) => x.key === sec)) {
        openSource(sectionDesc(sec), { root: true });
      }
      // red de seguridad: si Soundeo marca TODA la página como escuchada, preguntar una vez
      if (prefs.siteHeard && live.tracks.length >= 20 && live.tracks.every((t) => t.siteHeard) && !LS.get('siteHeardAsked', false)) {
        LS.set('siteHeardAsked', true);
        setTimeout(() => toast('Soundeo marca toda esta página como escuchada', 'No usarlo', () => {
          prefs.siteHeard = false;
          savePrefs();
          setHidden(cur && cur.hide ? hiddenFor(tracks) : new Set());
          rebuild(deck[0]);
        }), 600);
      }
      if (!LS.get('hint12', false)) {
        LS.set('hint12', true);
        LS.set('hintSwipe', true);
        setTimeout(() => toast('Nuevo: ☰ secciones, 🔍 buscador, y toca el artista, el release o el sello para ver sus tracks', 'Vale', () => {}), 900);
      }
      if (!LS.get('hint13', false)) {
        LS.set('hint13', true);
        if (!prefs.immersive && TOUCH) setTimeout(() => toast('Nuevo: esconder la barra de Safari para ganar pantalla', 'Activar', () => {
          prefs.immersive = true;
          savePrefs();
          LS.set('immHint', 0);
          immApply();
        }), 2400);
      }
      if (SS.get('autoplay', 0)) {
        SS.del('autoplay');
        // iOS solo permite sonar tras un toque; si no deja, se queda en pausa
        if (deck[activeIdx]) load(deck[activeIdx], true);
      }
      if (loggedOut) setTimeout(() => toast('No has iniciado sesión en Soundeo: favoritos y descargas no funcionarán', 'Ir a la web', () => closeApp()), 1200);
    } else tellLogin();
  }

  // Si algo falla al arrancar, que la web de Soundeo siga usable y se vea qué ha pasado.
  function boot() {
    try {
      init();
    } catch (e) {
      try {
        document.documentElement.classList.remove('sx-open');
        if (host) host.remove();
        const st = document.getElementById('sx-page-style');
        if (st) st.remove();
        vpMeta.restore();
      } catch (x) {}
      pageNotice(VERSION + ' no ha podido arrancar: ' + (e && e.message), 15000, true);
      try { console.error(e); } catch (x) {}
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
