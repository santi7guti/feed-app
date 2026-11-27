// Soundeo Feed — la app. La carga el cargador (soundeo-feed.user.js) desde GitHub.
// Para publicar una versión nueva: subir este archivo a main con VERSION actualizada.

(function () {
  'use strict';
  if (window.top !== window.self || window.__SX_FEED__) return;
  window.__SX_FEED__ = 'app';

  const VERSION = '2.2.0';

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
    ui2: false, // diseño nuevo (2.0): pestañas abajo; apagado hasta que se pruebe en el iPhone
    // 2.1 (se cambian en las pantallas de Ajustes del diseño nuevo; los valores de siempre son los de aquí)
    skipBack: 15, // segundos del botón de salto atrás
    skipFwd: 30, // y del de salto adelante
    keyFmt: 'both', // tono: 'both' («8A Amin»), 'cam' («8A») o 'mus' («Amin»)
    dense: false, // lista compacta
    bigText: false, // letra grande
    // 2.2 · «Diseño 2» (el pulido): escondido hasta que se desbloquea tocando 5 veces la versión en Ajustes
    ui3: false,
    ui3Unlocked: false,
    tabLayout: 'settings', // quinta pestaña del Diseño 2: 'settings' (Ajustes) o 'list' (Lista; Ajustes, desde Home)
  };
  let defFilters = Object.assign({}, DEFAULT_FILTERS, LS.get('filters', {}));
  let prefs = Object.assign({}, DEFAULT_PREFS, LS.get('prefs', {}));
  const savePrefs = () => LS.set('prefs', prefs);
  const clampInt = (v, lo, hi, def) => { const n = parseInt(v, 10); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
  // Los ajustes de la 2.1 solo cuentan con el diseño nuevo, que es donde se cambian: al apagarlo, todo vuelve a como era.
  const pref2 = (k) => (prefs.ui2 ? prefs[k] : DEFAULT_PREFS[k]);
  // 2.2 · Diseño 2: va siempre encima del diseño nuevo (usa sus pestañas y sus pantallas por capas)
  if (prefs.ui3 && !prefs.ui2) prefs.ui3 = false;
  const ui3 = () => !!(prefs.ui3 && prefs.ui2);
  const tabsB = () => ui3() && prefs.tabLayout === 'list'; // pestañas Home, Feed, Lista, Buscar, Chat
  const skipBack = () => clampInt(pref2('skipBack'), 1, 99, 15);
  const skipFwd = () => clampInt(pref2('skipFwd'), 1, 99, 30);
  // 2.1: combinaciones de filtros guardadas (máximo 5). Cada una lleva solo lo que es «filtro» (géneros, BPM, fecha,
  // tono y tipo de track): ni la sección ni la búsqueda por título.
  const MAX_SAVED = 5;
  const comboOf = (f) => ({
    genres: ((f && f.genres) || []).map(String), bpmMin: !f || f.bpmMin == null ? null : +f.bpmMin, bpmMax: !f || f.bpmMax == null ? null : +f.bpmMax,
    time: String((f && f.time) || '0'), keys: ((f && f.keys) || []).slice(), trackType: String((f && f.trackType) || '0'),
  });
  const comboKey = (f) => { const c = comboOf(f); c.genres.sort(); c.keys.sort(); return JSON.stringify(c); };
  let savedFilters = (() => {
    const v = LS.get('savedFilters', []);
    return (Array.isArray(v) ? v : []).filter((x) => x && typeof x.name === 'string' && x.f).slice(0, MAX_SAVED).map((x, k) => ({ id: String(x.id || k), name: x.name, f: comboOf(x.f) }));
  })();
  const saveSaved = () => LS.set('savedFilters', savedFilters);
  // BPM mínimo y máximo en su orden (se pueden escribir al revés); dice si los ha cambiado.
  const orderBpm = (f) => {
    if (!f || f.bpmMin == null || f.bpmMax == null || +f.bpmMin <= +f.bpmMax) return false;
    const t = f.bpmMin; f.bpmMin = f.bpmMax; f.bpmMax = t;
    return true;
  };
  function setStartFilters(f) {
    const c = comboOf(f);
    orderBpm(c);
    defFilters = Object.assign({}, DEFAULT_FILTERS, c, { search: '' });
    LS.set('filters', defFilters);
  }
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
  // Tipo de track: los tres valores del filtro de la web de Soundeo (All tracks / Exclude Stems / Stems)
  const TYPE_OPTS = [['0', 'Todos'], ['2', 'Sin stems'], ['1', 'Solo stems']];
  const typeName = (v) => { const t = TYPE_OPTS.find((x) => x[0] === String(v || '0')); return t ? t[1] : 'Todos'; };

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
  // 2.1: cómo se enseña el tono (ajuste «keyFmt»): los dos («8A Amin», lo de siempre), solo Camelot o solo musical.
  function keyText(k) {
    const c = camelot(k);
    const kf = pref2('keyFmt');
    if (kf === 'cam') return c || k;
    if (kf === 'mus') return k;
    return (c ? c + ' ' : '') + k;
  }

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
    if (f.trackType && String(f.trackType) !== '0') parts.push(typeName(f.trackType));
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
  // (En el Soundeo real la cabecera sin sesión no trae ningún enlace de «login» reconocible: se da por «sin sesión»
  // cuando es una página de Soundeo —tiene su logo— y faltan a la vez el botón de salir, la cuenta y los contadores.)
  const looksLoggedOut = () => !isLoggedIn() && (!!$('#top-menu-login, a[href*="/account/logon"], a[href*="/account/login"], a[href*="/login"], a[href*="/account/register"], form[action*="logon"], form[action*="login"], input[type="password"]') ||
    (!!$('header a.logo, a.logo') && !$('#top-menu-account, #span-downloads, #span-favorites')));
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
    if (ui3()) countHeardToday();
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
        lastStatus = { id, bpm: short(tr.bpm, 20), key: short(tr.key, 30) };
        // BPM y tono vienen aquí como datos sueltos (no hay que buscarlos en una página): si llegan, mandan
        const old = metaCache[id] || {};
        const nb = bpmOf(tr.bpm == null ? '' : String(tr.bpm)) || old.b || null;
        const nk = keyFromText(tr.key) || old.k || null;
        if (nb !== (old.b || null) || nk !== (old.k || null)) {
          const m = { b: nb, k: nk };
          if (old.ar) m.ar = old.ar;
          metaCache[id] = m;
          saveMeta();
          if (t) paintMeta(t);
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
  // 2.1.9: lo que suena durante una visita a una lista se queda en su feed aunque se recargue la pestaña (Safari la recarga
  // al volver tras cerrar la app). Por lista (`keepHeard`, en localStorage): {t, ids}. Abrir la lista de nuevo lo borra.
  let keepMap = LS.get('keepHeard', {}) || {};
  if (typeof keepMap !== 'object' || Array.isArray(keepMap)) keepMap = {};
  let keepLast = '';
  const keepKey = (s) => (s && s.hide && s.url ? String(s.url).split('#')[0] : '');
  const keepIds = (s) => { const e = keepMap[keepKey(s)]; return e && Array.isArray(e.ids) && e.ids.length ? new Set(e.ids) : null; };
  function keepSave() {
    const old = Date.now() - 7 * 864e5;
    const ks = Object.keys(keepMap).filter((k) => keepMap[k] && keepMap[k].t > old).sort((a, b) => keepMap[b].t - keepMap[a].t).slice(0, 12);
    const m = {};
    ks.forEach((k) => { m[k] = keepMap[k]; });
    keepMap = m;
    LS.set('keepHeard', keepMap);
  }
  function keepReset(s) {
    const k = keepKey(s);
    if (!k || !keepMap[k]) return;
    // 2.2 · Diseño 2: la visita anterior se aparta (no se tira): «Sigue escuchando» la recupera con lo escuchado detrás
    if (prefs.ui3 && prefs.ui2) {
      const p = LS.get('keepPrev', {}) || {};
      p[k] = keepMap[k];
      const ks = Object.keys(p).filter((x) => p[x] && p[x].t > Date.now() - 7 * 864e5).sort((a, b) => p[b].t - p[a].t).slice(0, 6);
      const m = {};
      ks.forEach((x) => { m[x] = p[x]; });
      LS.set('keepPrev', m);
    }
    delete keepMap[k];
    keepSave();
  }
  // 2.2: vuelve a juntar con la visita de ahora lo escuchado en la anterior a esa lista. true si había algo.
  function keepRestore(k) {
    const p = LS.get('keepPrev', {}) || {};
    const e = p[k];
    if (!k || !e || !Array.isArray(e.ids) || !e.ids.length) return false;
    const now = keepMap[k] && Array.isArray(keepMap[k].ids) ? keepMap[k].ids : [];
    keepMap[k] = { t: Date.now(), ids: e.ids.filter((id) => now.indexOf(id) < 0).concat(now).slice(-600) };
    delete p[k];
    LS.set('keepPrev', p);
    keepSave();
    return true;
  }
  // Apunta `id` en cada lista abierta (la de la pantalla, las de debajo y la de la cola) en cuyo feed está.
  function keepNote(id) {
    const tag = id + ' ' + (cur && cur.url);
    if (!id || tag === keepLast) return;
    keepLast = tag;
    let ch = false;
    stack.concat(queue ? [queue.src] : []).forEach((s) => {
      const k = keepKey(s);
      if (!k) return;
      const list = s === cur ? tracks : s.tracks;
      const hid = s === cur ? hiddenAtLoad : s.hidden;
      const frc = s === cur ? forced : s.forced;
      if (!list || !list.some((t) => t.id === id) || (hid && hid.has(id) && !(frc && frc.has(id)))) return;
      const e = keepMap[k] && Array.isArray(keepMap[k].ids) ? keepMap[k] : (keepMap[k] = { t: 0, ids: [] });
      e.t = Date.now();
      if (e.ids.indexOf(id) < 0) { e.ids.push(id); if (e.ids.length > 600) e.ids.splice(0, e.ids.length - 600); }
      ch = true;
    });
    if (ch) keepSave();
  }
  const hiddenFor = (list, s) => {
    const keep = keepIds(s);
    return new Set(prefs.skipHeard ? list.filter((t) => isHeard(t) && !(current && current.id === t.id) && !(keep && keep.has(t.id))).map((t) => t.id) : []);
  };
  const myDownloads = new Set(LS.get('downloaded', []));
  function markDownloaded(id) {
    myDownloads.add(id);
    LS.set('downloaded', Array.from(myDownloads).slice(-3000));
  }
  // Lo guardado por versiones anteriores podía traer BPM mal leídos (1.5.1) o venir sin tono (1.7.0): se vacía una vez.
  if (LS.get('metaV', 0) < 3) { LS.del('meta'); LS.set('metaV', 3); }
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
  // Un BPM solo vale si el texto ES el número («128», «128.5», «128 BPM»), no si lo lleva dentro («Room 104»).
  const bpmOf = (s) => {
    const m = clean(s).match(/^(?:bpm\s*:?\s*)?(\d{2,3}(?:[.,]\d+)?)(?:\s*bpm)?$/i);
    return m ? num(m[1]) : null;
  };
  // Soundeo escribe el tono como «3A (B♭min)» en la ficha y «2B (G&#9837;maj)» en su reproductor; también vale «Amin».
  function keyFromText(s) {
    let x = String(s == null ? '' : s).replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&(flat|sharp);/g, (m, w) => (w === 'flat' ? '♭' : '♯'));
    const par = x.match(/\(([^)]+)\)/);
    if (par && parseKey(clean(par[1]).slice(0, 10))) x = par[1];
    else x = x.replace(/\([^)]*\)/g, ' ').replace(/^\s*\d{1,2}[AB]\b/i, ' ');
    const k = parseKey(clean(x).slice(0, 10));
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
    let via = '';
    // La ficha del track es una tabla: «BPM | 128», «Key | Amin». Los enlaces de artista, sello y género llevan
    // también «bpmFilter=» y «keyFilter=» en su dirección (vacíos), así que no vale cualquier enlace: con el sello
    // «Room 104» salían 104 BPM. Solo cuentan la fila con ese nombre o un enlace que filtre de verdad por BPM / tono.
    const cell = (a, re) => {
      // (una fila puede traer dos parejas: «Label | … | BPM | 127»)
      for (const tr of $$('tr', a)) {
        const c = tr.children;
        for (let j = 0; j + 1 < c.length; j++) if (re.test(clean(c[j].textContent))) return clean(c[j + 1].textContent);
      }
      return '';
    };
    const filterLinks = (a, name) => $$('a[href*="' + name + '="]', a).filter((x) => !!paramOf(x.getAttribute('href'), name));
    for (const a of areas) {
      if (!bpm) { bpm = bpmOf(cell(a, /^bpm:?$/i)); if (bpm) via = 'fila'; }
      if (!bpm) { const e = $('a.bpm, .bpm, [title="BPM"]', a); if (e) bpm = bpmOf(e.textContent); if (bpm) via = 'clase'; }
      if (!bpm) for (const x of filterLinks(a, 'bpmFilter')) { const n = bpmOf(x.textContent); if (n) { bpm = n; via = 'enlace'; break; } }
      if (!key) key = keyFromText(cell(a, /^key:?$/i));
      if (!key) { const e = $('a.key, .key, [title="Key"]', a); if (e) key = keyFromText(e.textContent); }
      if (!key) for (const x of filterLinks(a, 'keyFilter')) { const k = keyFromText(x.textContent) || keyFromText(paramOf(x.getAttribute('href'), 'keyFilter')); if (k) { key = k; break; } }
    }
    const text = clean(scope.textContent);
    if (!bpm) { const m = text.match(/\bBPM\b\s*:?\s*(\d{2,3}(?:\.\d+)?)\b/i); if (m) { bpm = num(m[1]); if (bpm) via = 'texto'; } }
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
    return { b: bpm, k: key, ar: ar.slice(0, 6), via };
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
    go: '<svg viewBox="0 0 24 24"><path d="M7.5 16.5l9-9M9 7.5h7.5V15" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.46-5.78" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6.5 2.5v4.1h4.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fwd: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.46-5.78" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M17.5 2.5v4.1h-4.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M6 14.5l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ext: '<svg viewBox="0 0 24 24"><path d="M14 4.5h5.5V10M19.5 4.5l-8.5 8.5M17.5 14v4.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1H10" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    rows: '<svg viewBox="0 0 24 24"><path d="M9 7h11M9 12h11M9 17h11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="4.6" cy="7" r="1.3" fill="currentColor"/><circle cx="4.6" cy="12" r="1.3" fill="currentColor"/><circle cx="4.6" cy="17" r="1.3" fill="currentColor"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
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
    eye: '<svg viewBox="0 0 24 24"><path d="M2.8 12c2.3-4 5.5-6 9.2-6s6.9 2 9.2 6c-2.3 4-5.5 6-9.2 6s-6.9-2-9.2-6z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5.5v13M5.5 12h13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',

    // 2.2 · iconos del Diseño 2 (trazo fino y redondeado)
    home: '<svg viewBox="0 0 24 24"><path d="M4 10.2 12 4l8 6.2V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    feed2: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.2 9.2v5.6l4.6-2.8z" fill="currentColor"/></svg>',
    list2: '<svg viewBox="0 0 24 24"><path d="M9 6.5h11M9 12h11M9 17.5h11" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="4.6" cy="6.5" r="1.2" fill="currentColor"/><circle cx="4.6" cy="12" r="1.2" fill="currentColor"/><circle cx="4.6" cy="17.5" r="1.2" fill="currentColor"/></svg>',
    search2: '<svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="m15.6 15.6 4.4 4.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chat2: '<svg viewBox="0 0 24 24"><path d="M5.5 4.5h13a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H11l-4.5 3.5V17h-1a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 9.5h7M8.5 12.5h4.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    set2: '<svg viewBox="0 0 24 24"><path d="M4 7.5h8.5M17.5 7.5H20M4 16.5h2.5M11.5 16.5H20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="15" cy="7.5" r="2.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="16.5" r="2.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 19.5a6 6 0 0 1 12 0M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.2a6 6 0 0 1 3.5 5.3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    spark: '<svg viewBox="0 0 24 24"><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.5 16v4M16.5 18h4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bolt: '<svg viewBox="0 0 24 24"><path d="M13 3.5 5.5 13.5H12l-1 7 7.5-10H12z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    wheel: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 3.8v4.6M12 15.6v4.6M3.8 12h4.6M15.6 12h4.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    tempo: '<svg viewBox="0 0 24 24"><path d="M9.2 4h5.6l3.2 16H6z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 16.5l4.2-8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    palette: '<svg viewBox="0 0 24 24"><path d="M12 3.8a8.2 8.2 0 1 0 0 16.4c1 0 1.4-.7 1.4-1.4 0-.9-.7-1.3-.7-2.1 0-.9.7-1.5 1.6-1.5h1.9a3.6 3.6 0 0 0 3.6-3.6c0-4.3-3.6-7.8-7.8-7.8z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="11" r="1.1" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.1" fill="currentColor"/><circle cx="14.5" cy="7.8" r="1.1" fill="currentColor"/></svg>',
    door: '<svg viewBox="0 0 24 24"><path d="M13.5 4.5h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-4M9.5 16l4-4-4-4M13.5 12H4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bug: '<svg viewBox="0 0 24 24"><path d="M9 7.5a3 3 0 0 1 6 0" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><rect x="7" y="8.5" width="10" height="11" rx="5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 11v8.5M4 13h3M17 13h3M5 8.5l2 1.5M19 8.5l-2 1.5M5 18.5l2-1.5M19 18.5l-2-1.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    layers: '<svg viewBox="0 0 24 24"><path d="m12 4 8.5 4.5L12 13 3.5 8.5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M19.5 11.5a7.5 7.5 0 1 1-2.2-5.3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 4.5v4.5H15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    trophy: '<svg viewBox="0 0 24 24"><path d="M8 4.5h8V9a4 4 0 0 1-8 0z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 6.5H5.5a2.8 2.8 0 0 0 2.9 3.6M16 6.5h2.5a2.8 2.8 0 0 1-2.9 3.6M12 13v3.5M8.5 20h7M9.8 16.5h4.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    note: '<svg viewBox="0 0 24 24"><path d="M9 17.5V6l10-2v11" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="17.5" r="2.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16.5" cy="15" r="2.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    funnel: '<svg viewBox="0 0 24 24"><path d="M4.5 5.5h15l-5.8 6.8v5.4l-3.4 1.8v-7.2z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    xs: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="m9.5 6.5 5.5 5.5-5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
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
    --st:env(safe-area-inset-top,0px);--sb0:env(safe-area-inset-bottom,0px);--tb:0px;--sb:calc(var(--sb0) + var(--tb));--sl:env(safe-area-inset-left,0px);--sr:env(safe-area-inset-right,0px);
    --top:calc(var(--st) + 54px);--ctrl:calc(var(--sb) + 118px);
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif;
    color:var(--fg);font-size:15px;line-height:1.3;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;}
  .app{position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;background:var(--bg);overflow:hidden;display:none;user-select:none;-webkit-user-select:none;}
  .root.open .app{display:block;}
  /* 2.1.8: con el teclado abierto en pantalla completa, la app conserva su alto (ver immPin) */
  .root.kbpin .app{height:var(--apph);}

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
  /* 2.1.2 (diseño nuevo): con la barra escondida, desde los mandos y las barras de la app no se puede arrastrar la página */
  .root.ui2.imm:not(.imm-armed) .topbar,.root.ui2.imm:not(.imm-armed) .topbar *,.root.ui2.imm:not(.imm-armed) .ctx,.root.ui2.imm:not(.imm-armed) .ctx *,
  .root.ui2.imm:not(.imm-armed) .controls,.root.ui2.imm:not(.imm-armed) .controls *,.root.ui2.imm:not(.imm-armed) .mini,.root.ui2.imm:not(.imm-armed) .mini *,
  .root.ui2.imm:not(.imm-armed) .tabs,.root.ui2.imm:not(.imm-armed) .tabs *{touch-action:none;}
  /* 2.1.2 (diseño nuevo + barra de Safari): la portada y el texto no se mueven cuando la barra se esconde; el hueco que se gana queda debajo */
  .root.cvfix .mid{justify-content:flex-start;padding-top:var(--mpt,0px);}
  /* 2.1.6 (diseño nuevo + barra de Safari): la tarjeta se maqueta siempre con la barra escondida (portada grande) y, con la
     barra a la vista, la portada, el texto y los enlaces se encogen y suben con una transformación (.cvsm). Pasar de un
     tamaño a otro ya no re-maqueta nada: es una transición de transform, que hace la tarjeta gráfica */
  .root.cvfix .cvw{transform-origin:0 0;will-change:transform;transition:transform .32s cubic-bezier(.2,.8,.2,1);}
  .root.cvfix .info{will-change:transform;transition:transform .32s cubic-bezier(.2,.8,.2,1);}
  .root.cvfix .opens{transform:translate(0px,0px) translateY(-50%);transition:transform .32s cubic-bezier(.2,.8,.2,1);}
  .root.cvfix.cvsm .cvw{transform:translate(var(--kx,0px),var(--ky,0px)) scale(var(--ks,1));}
  .root.cvfix.cvsm .info{transform:translateY(var(--iy,0px));}
  .root.cvfix.cvsm .opens{transform:translate(0px,var(--oy,0px)) translateY(-50%);}
  .root.cvfix.notr .cvw,.root.cvfix.notr .info,.root.cvfix.notr .opens{transition:none;}
  @media (prefers-reduced-motion:reduce){.root.cvfix .cvw,.root.cvfix .info,.root.cvfix .opens{transition:none;}}
  .psv,.plv{position:absolute;left:0;top:0;width:1px;visibility:hidden;pointer-events:none;}
  .psv{height:100svh;}
  .plv{height:100lvh;}
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
  /* enlaces a Spotify / Apple Music: columna a la derecha de la portada, alineada con la de estrella / descarga / ⋯ */
  .top{position:relative;flex:none;align-self:stretch;display:flex;justify-content:center;}
  .opens{position:absolute;right:0;top:50%;transform:translateY(-50%);width:50px;display:flex;flex-direction:column;align-items:center;gap:14px;}
  .mlink{position:relative;width:46px;height:46px;border-radius:50%;display:grid;place-items:center;text-decoration:none;color:#fff;background:rgba(0,0,0,.36);box-shadow:inset 0 0 0 2px var(--mc);-webkit-touch-callout:none;-webkit-user-drag:none;}
  .mlink.sp{--mc:var(--ok);}
  .mlink.am{--mc:var(--like);}
  .mlink .mn{font-size:9.5px;font-weight:800;line-height:1.1;letter-spacing:.01em;text-align:center;}
  .mlink .mgo{position:absolute;right:-5px;top:-5px;width:18px;height:18px;border-radius:50%;background:var(--mc);color:#0b0b0e;display:grid;place-items:center;box-shadow:0 0 0 2px rgba(11,11,14,.55);}
  .mlink .mgo svg{width:11px;height:11px;}
  .mlink:active{transform:scale(.93);}
  .mid{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;}
  .cvw{position:relative;left:var(--cvs,0px);align-self:center;width:var(--cv,min(76vw,300px));height:var(--cv,min(76vw,300px));border-radius:14px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.55);background:#222 center/cover no-repeat;flex:none;}
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
  /* 2.1.3 (diseño nuevo): la barra de avance del feed responde en una franja más alta (48 px en vez de 30) */
  .root.ui2 .controls .bar::after{content:"";position:absolute;left:-4px;right:-4px;top:-9px;bottom:-9px;}
  .btns{display:flex;align-items:center;justify-content:space-between;padding:2px 2px 0;}
  .cb{width:52px;height:52px;display:grid;place-items:center;border-radius:50%;}
  .cb i{width:30px;height:30px;display:block;}
  .cb.sm i{width:32px;height:32px;position:relative;}
  .cb.sm{position:relative;}
  .cb.sm em{position:absolute;font-style:normal;font-size:10px;line-height:1;font-weight:800;letter-spacing:-.2px;font-variant-numeric:tabular-nums;top:50%;left:50%;transform:translate(-50%,-50%);}
  .cb.big{width:68px;height:68px;background:var(--fg);color:#000;}
  .cb.big i{width:32px;height:32px;}
  .cb:active{transform:scale(.94);}
  .spin .cb.big{animation:pulse 1s ease-in-out infinite;}
  @keyframes pulse{50%{opacity:.6}}

  /* lista */
  .list{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:var(--top) var(--sr) calc(var(--sb) + 124px) var(--sl);display:none;overscroll-behavior:contain;}
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
  .mini{position:absolute;left:calc(var(--sl) + 8px);right:calc(var(--sr) + 8px);bottom:calc(var(--sb) + 8px);z-index:30;display:none;flex-wrap:wrap;align-items:center;gap:0 10px;padding:2px 8px 8px 8px;border-radius:16px;
    background:rgba(40,40,46,.98);box-shadow:0 10px 30px rgba(0,0,0,.5);overflow:hidden;}
  .app[data-view=list].has-cur .mini{display:flex;}
  .mini img{width:46px;height:46px;border-radius:9px;object-fit:cover;background:#333;flex:none;}
  .mini .mm{flex:1;min-width:0;}
  .mini .mt{font-size:14.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .mini .ma{font-size:12.5px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .mini .mb{width:40px;height:40px;display:grid;place-items:center;flex:none;}
  .mini .mb i{width:24px;height:24px;display:block;}
  .mini .mb.on{color:var(--gold);}
  /* 2.1.6 (diseño nuevo): en el mini, «anterior» en lugar de la estrella (lo pidió Tiger) */
  .mini .mb.mprev{display:none;}
  .root.ui2 .mini .mb.mprev{display:grid;}
  .root.ui2 .mini .mb.mfav{display:none;}
  /* barra para avanzar por la canción desde la lista (misma barra que la del feed, más baja) */
  .mseek{flex:0 0 100%;display:flex;align-items:center;gap:8px;height:28px;font-size:10.5px;font-weight:600;color:var(--mut);font-variant-numeric:tabular-nums;}
  .mseek span{width:30px;flex:none;}
  .mseek span:last-child{text-align:right;}
  .mseek .bar{height:28px;}
  .mseek .bar::before,.mseek .bar .fill,.mseek .bar .buf{top:12px;}
  .mseek .bar .knob{top:7px;}
  /* 2.1.5 (diseño nuevo): la barra de avance del mini reproductor coge también una franja por encima del mini, sobre la
     lista: quien apuntaba a la barra y caía un poco más arriba tocaba la canción de esa fila */
  .root.ui2 .mini{overflow:visible;}
  .root.ui2 .mseek .bar::after{content:"";position:absolute;left:-6px;right:-6px;top:-18px;bottom:-4px;}
  a.btn{text-decoration:none;color:inherit;}

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
  a.opt{text-decoration:none;color:inherit;}
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
  /* diseño nuevo (2.0, ajuste «ui2»): barra de pestañas abajo y la lista se elige arriba. Solo en vertical:
     en horizontal no hay alto para la barra y se queda la de siempre. Todo lo que va pegado abajo usa --sb,
     así que basta con sumarle el alto de la barra (--tb). */
  .tabs{position:absolute;left:0;right:0;bottom:0;z-index:46;display:none;height:calc(var(--sb0) + 56px);padding:3px calc(var(--sr) + 6px) var(--sb0) calc(var(--sl) + 6px);background:rgba(16,16,20,.97);border-top:1px solid var(--line);}
  .tabs button{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:var(--mut);font-size:10.5px;font-weight:600;}
  .tabs button i{width:23px;height:23px;display:block;}
  .tabs button.on{color:var(--fg);font-weight:800;}
  .srcp{display:none;align-items:center;gap:5px;height:38px;min-width:0;flex:0 1 auto;padding:0 11px 0 14px;border-radius:999px;background:var(--glass);font-size:14px;font-weight:700;}
  .srcp span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .srcp i{width:15px;height:15px;display:block;flex:none;transform:rotate(-90deg);}
  /* 2.1 · con el diseño nuevo, Ajustes es una pantalla por capas (.pg) y los resultados de Buscar llevan arriba el
     campo con lo buscado (.sqb). El mini reproductor se sigue viendo encima de las dos. */
  .pg{position:absolute;inset:0;z-index:45;background:var(--bg);display:none;flex-direction:column;padding-bottom:var(--sb);}
  .pg.on{display:flex;}
  .pgh{flex:none;display:flex;align-items:center;gap:8px;min-height:calc(var(--st) + 56px);padding:calc(var(--st) + 8px) calc(var(--sr) + 12px) 8px calc(var(--sl) + 16px);}
  .pgh h2{flex:1;min-width:0;margin:0;font-size:24px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .pg.sub .pgh{padding-left:calc(var(--sl) + 12px);}
  .pg.sub .pgh h2{font-size:19px;}
  .pgback{display:none;flex:none;}
  .pg.sub .pgback{display:grid;}
  .pgx{flex:none;}
  .pgb{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:0 calc(var(--sr) + 16px) 22px calc(var(--sl) + 16px);}
  .pgb>.sec:first-child{margin-top:6px;}
  .pgf{flex:none;display:flex;gap:9px;padding:10px calc(var(--sr) + 16px) 10px calc(var(--sl) + 16px);border-top:1px solid var(--line);}
  .pgf:empty{display:none;}
  .pgf .btn{flex:1;}
  .prow .ol>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .prow .ol em{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3;}
  .opt.prow small{flex:none;margin-left:0;}
  .pch{display:block;width:16px;height:16px;flex:none;color:var(--dim);transform:rotate(180deg);}
  .svrow{display:flex;align-items:center;border-bottom:1px solid var(--line);}
  .svrow .opt{border-bottom:0;flex:1;min-width:0;}
  .svrow .opt small{color:var(--acc);flex:none;}
  .svrow .rb{width:44px;height:48px;}
  .svn{float:right;letter-spacing:0;text-transform:none;font-weight:600;}
  .skr{flex-wrap:wrap;}
  .skr input{width:76px;}
  .skr .presets{margin-top:0;}
  .sqb{display:none;flex:1 1 auto;min-width:0;height:38px;align-items:center;gap:8px;padding:0 12px;border-radius:12px;background:var(--glass);font-size:15px;font-weight:600;text-align:left;}
  .sqb i{width:18px;height:18px;display:block;flex:none;color:var(--mut);}
  .sqb span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .srt{display:none;margin:0 0 8px 4px;height:40px;line-height:40px;font-size:24px;font-weight:800;letter-spacing:-.01em;}
  /* 2.1 · lista compacta y letra grande (Ajustes → Apariencia) */
  .root.dense .row{padding:5px 8px 5px 14px;gap:10px;}
  .root.dense .row .rc{width:40px;height:40px;border-radius:6px;}
  .root.dense .rt{font-size:14.5px;line-height:1.22;}
  .root.dense .rt small{font-size:12.5px;}
  .root.dense .ra{font-size:13px;line-height:1.22;margin-top:0;}
  .root.dense .rx{font-size:11.5px;line-height:1.22;margin-top:1px;}
  .root.dense .rb{width:36px;height:40px;}
  .root.dense .gh{padding:7px 14px 5px;}
  .root.bigtx .rt{font-size:17.5px;}
  .root.bigtx .rt small{font-size:15px;}
  .root.bigtx .ra{font-size:16px;}
  .root.bigtx .rx{font-size:14px;}
  .root.bigtx .mini .mt{font-size:16px;}
  .root.bigtx .mini .ma{font-size:14px;}
  .root.bigtx.dense .rt{font-size:16px;}
  .root.bigtx.dense .rt small{font-size:14px;}
  .root.bigtx.dense .ra{font-size:14.5px;}
  .root.bigtx.dense .rx{font-size:13px;}
  @media (orientation:portrait),(min-height:501px){
    /* en el feed la letra grande crece un 10 % como mucho (en horizontal no: no hay alto) */
    .root.bigtx .ttl{font-size:27.5px;}
    .root.bigtx .mix{font-size:16.5px;}
    .root.bigtx .art{font-size:18.5px;}
    .root.bigtx .rel{font-size:14.5px;}
    .root.bigtx .eyebrow{font-size:12.5px;}
    .root.bigtx .chips .chip{font-size:13.5px;}
    .root.ui2 .pgx{display:none;}
    .root.ui2 .srt{display:block;}
    .root.ui2 .app:not(.is-search) .sback{display:none;}
    .root.ui2 .app.is-search[data-view=list] .sqb{display:flex;}
    .root.ui2 .app.is-search[data-view=list] .srcp,.root.ui2 .app.is-search[data-view=list] .bnav,.root.ui2 .app.is-search[data-view=list] .tb-sp{display:none;}
    .root.ui2 .app.is-search .fsq,.root.ui2 .app.is-search .list .skind,.root.ui2 .app.is-search .list .stitle{display:none;}
    .root.ui2 .app.over.has-cur .mini{display:flex;z-index:47;}
    .root.ui2 .app.has-cur .pg{padding-bottom:calc(var(--sb) + 112px);}
    .root.ui2 .app.has-cur .srch{padding-bottom:calc(var(--sb0) + 56px + 104px);}
    .root.ui2{--tb:56px;}
    .root.ui2 .tabs{display:flex;}
    .root.ui2 .seg,.root.ui2 .bsearch,.root.ui2 .bset{display:none;}
    .root.ui2 .srcp{display:flex;}
    .root.ui2 .app:not(.deep) .bnav{display:none;}
    .root.ui2 .app.has-ctx[data-view=feed] .ctx{display:none;}
    .root.ui2 .app.has-ctx .cin{padding-top:calc(var(--top) + 4px);}
    .root.ui2 .sheet{--sb:var(--sb0);}
    .root.ui2 .srch{padding-bottom:calc(var(--sb0) + 56px);}
  }
  @media (orientation:landscape) and (max-height:500px){
    .root{--top:calc(var(--st) + 46px);--ctrl:calc(var(--sb) + 80px);}
    .topbar{padding-top:calc(var(--st) + 4px);padding-bottom:4px;}
    .ctx{top:calc(var(--st) + 9px);max-width:32%;}
    .cin,.app.has-ctx .cin{padding-top:calc(var(--top) + 2px);padding-bottom:calc(var(--ctrl) + 4px);}
    .mid{display:grid;grid-template-columns:fit-content(44%) auto auto;grid-template-rows:1fr 1fr;justify-content:center;align-items:center;column-gap:20px;row-gap:22px;}
    .top,.info{display:contents;}
    .itext{grid-column:1;grid-row:1 / 3;min-width:0;max-height:100%;overflow:hidden;}
    .cvw{grid-column:2;grid-row:1 / 3;left:0;}
    .rail{grid-column:3;grid-row:1;flex-direction:row;align-self:end;}
    .opens{grid-column:3;grid-row:2;position:static;transform:none;width:auto;flex-direction:row;justify-content:center;align-self:start;gap:16px;}
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
    .list{padding-bottom:calc(var(--sb) + 96px);}
    .mini{flex-wrap:nowrap;gap:10px;padding:8px;}
    .mini img{order:-2;}
    .mini .mm{order:-1;}
    .mseek{flex:1.3 1 0;min-width:0;}
  }
  /* y si además Safari enseña sus barras (muy poca altura), fuera las etiquetas de tono/BPM */
  @media (orientation:landscape) and (max-height:300px){
    .chips{display:none;}
  }
  `;
  const APP_CSS3_LAND = `
  @media (orientation:landscape) and (max-height:500px){
    /* 2.2 · Diseño 2 en horizontal: el selector de lista arriba (como en vertical), Feed / Lista en coral y Home con su ✕ */
    .root.ui3 .srcp{display:grid;flex:0 1 auto;max-width:min(46%,380px);height:44px;border-radius:14px;}
    .root.ui3 .srcp .sic{width:32px;height:32px;border-radius:10px;}
    .root.ui3 .srcp span{font-size:14.5px;}
    .root.ui3 .app:not(.deep) .bnav{display:none;}
    .root.ui3 .seg{background:rgba(27,27,34,.94);border-radius:14px;padding:3px;}
    .root.ui3 .seg button{border-radius:11px;}
    .root.ui3 .seg button.on{background:var(--acc);color:var(--accInk);}
    .root.ui3 .pill,.root.ui3 .ibtn{background:rgba(27,27,34,.94);}
    .root.ui3 .pgh{min-height:calc(var(--st) + 50px);padding-top:calc(var(--st) + 6px);}
    .root.ui3 .pg:not(.sub) .pgh h2{font-size:26px;}
    .root.ui3 .hmh{display:none;}
    .root.ui3 .hmh+.hmcard{margin-top:4px;}
    .root.ui3 .hmtiles{grid-template-columns:repeat(4,minmax(0,1fr));}
    .root.ui3 .sgen{grid-template-columns:repeat(4,minmax(0,1fr));}
    .root.ui3 .cht{padding-top:6px;}
  }
  `;
  const APP_CSS3 = `
  /* ───────── 2.2 · «Diseño 2» (el pulido). Todo bajo .root.ui3, salvo esconder sus piezas nuevas en los otros diseños ───────── */
  .vseg,.srcp .sic,.srcp .srs,.srcp .sdot{display:none;}
  .root.ui3{--bg:#0a0a0d;--fg:#f4f4f7;--s1:#131318;--s2:#1b1b22;--s3:#25252e;--line:rgba(255,255,255,.07);--mut:rgba(244,244,247,.64);--dim:rgba(244,244,247,.42);
    --acc:#ff7a50;--accInk:#0b0b0e;--accSoft:rgba(255,122,80,.16);--accLine:rgba(255,122,80,.42);}
  /* tarjeta del feed */
  .root.ui3 .cvw{border-radius:18px;}
  .root.ui3 .eyebrow .ix{color:var(--acc);}
  .root.ui3 .ttl{font-size:27px;letter-spacing:-.025em;}
  .root.ui3 .art{font-size:18px;}
  .root.ui3 .chip{height:27px;padding:0 10px;background:rgba(255,255,255,.1);}
  .root.ui3 .chip.key{gap:6px;background:hsla(var(--kh,220),70%,55%,.2);color:hsl(var(--kh,220),85%,74%);}
  .root.ui3 .chip.key::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor;}
  .root.ui3 .chip.key b{color:inherit;}
  .root.ui3 .rbtn{width:48px;height:48px;background:rgba(255,255,255,.1);}
  .root.ui3 .cb.big{background:var(--acc);color:var(--accInk);}
  .root.ui3 .bar .fill{background:var(--acc);}
  .root.ui3 .controls{background:linear-gradient(to top,rgba(10,10,13,.9),rgba(10,10,13,0));}
  /* lista */
  .root.ui3 .row .rc{border-radius:10px;}
  .root.ui3 .row.cur{background:var(--accSoft);}
  .root.ui3 .rk{display:inline-block;vertical-align:top;margin-right:6px;height:19px;line-height:19px;padding:0 7px;border-radius:999px;font-size:11px;font-weight:750;background:hsla(var(--kh,220),70%,55%,.18);color:hsl(var(--kh,220),85%,74%);}
  .root.ui3 .rnew{display:inline-block;vertical-align:top;margin:2px 7px 0 0;height:16px;line-height:16px;padding:0 6px;border-radius:6px;background:var(--acc);color:var(--accInk);font-size:10px;font-weight:850;letter-spacing:.04em;font-style:normal;}
  /* filas de alto fijo (cada línea con su alto, sea cual sea la letra del sistema) y, fuera de la pantalla, sin pintar:
     así cambiar a la lista cuesta la mitad. El alto de reserva es el de verdad, para que nada salte al desplazarse. */
  .root.ui3 .rt{line-height:20px;height:20px;}
  .root.ui3 .ra{line-height:18px;height:18px;}
  .root.ui3 .rx{line-height:19px;height:19px;}
  .root.ui3 .rows .row{content-visibility:auto;contain-intrinsic-size:auto 78px;}
  .root.ui3.dense .rt{line-height:18px;height:18px;}
  .root.ui3.dense .ra{line-height:16px;height:16px;}
  .root.ui3.dense .rx{line-height:16px;height:16px;}
  .root.ui3.dense .rk{height:16px;line-height:16px;font-size:10px;padding:0 6px;}
  .root.ui3.dense .rnew{margin-top:1px;}
  .root.ui3.dense .rows .row{contain-intrinsic-size:auto 61px;}
  .root.ui3.bigtx .rt{line-height:22px;height:22px;}
  .root.ui3.bigtx .ra{line-height:20px;height:20px;}
  .root.ui3.bigtx .rx{line-height:20px;height:20px;}
  .root.ui3.bigtx .rk{height:20px;line-height:20px;}
  .root.ui3.bigtx .rnew{margin-top:3px;}
  .root.ui3.bigtx .rows .row{contain-intrinsic-size:auto 83px;}
  .root.ui3.bigtx.dense .rt{line-height:20px;height:20px;}
  .root.ui3.bigtx.dense .ra{line-height:18px;height:18px;}
  .root.ui3.bigtx.dense .rx{line-height:17px;height:17px;}
  .root.ui3.bigtx.dense .rk{height:17px;line-height:17px;font-size:10.5px;}
  .root.ui3.bigtx.dense .rnew{margin-top:2px;}
  .root.ui3.bigtx.dense .rows .row{contain-intrinsic-size:auto 66px;}
  .root.ui3 .gh{background:var(--bg);border-bottom:0;padding:14px 16px 6px;}
  .root.ui3 .dn{background:var(--s2);}
  .root.ui3 .seg2{background:var(--s2);border-radius:14px;padding:4px;}
  .root.ui3 .seg2 button{height:36px;border-radius:11px;}
  .root.ui3 .seg2 button.on{background:var(--s3);}
  .root.ui3 .fsum{background:var(--s1);border-radius:16px;}
  .root.ui3 .fnew{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px;}
  .root.ui3 .fnb{display:inline-flex;align-items:center;height:28px;padding:0 12px;border-radius:14px;background:var(--acc);color:var(--accInk);font-size:13px;font-weight:850;}
  .root.ui3 .fnew .btn{height:40px;padding:0 14px;font-size:14px;}
  .root.ui3 .fnew .btn i{width:18px;height:18px;}
  .root.ui3 .fnz{font-size:13.5px;color:var(--mut);}
  /* mini reproductor */
  .root.ui3 .mini{background:#1d1d25;border-radius:18px;}
  .root.ui3 .mini img{border-radius:10px;}
  .root.ui3 .mini .mplay{border-radius:50%;background:var(--acc);color:var(--accInk);}
  .root.ui3 .mini .mplay i{width:22px;height:22px;}
  /* botones, interruptores, etiquetas */
  .root.ui3 .btn{background:var(--s2);}
  .root.ui3 .btn.pri,.root.ui3 .btn.acc{background:var(--acc);color:var(--accInk);}
  .root.ui3 .btn[disabled]{opacity:.4;}
  .root.ui3 .sw.on{background:var(--acc);}
  .root.ui3 .tag{background:var(--s1);box-shadow:inset 0 0 0 1px var(--line);color:var(--fg);}
  .root.ui3 .tag.on{background:var(--acc);box-shadow:none;color:var(--accInk);}
  .root.ui3 .tag small{opacity:.75;}
  .root.ui3 .bpm input,.root.ui3 .txt,.root.ui3 .sq{background:var(--s2);}
  .root.ui3 .opt.pri,.root.ui3 .opt.pri i,.root.ui3 .lab a{color:var(--acc);}
  .root.ui3 .sheet,.root.ui3 .sf{background:var(--s1);}
  .root.ui3 .sheet{border-radius:24px 24px 0 0;}
  /* un solo aviso, abajo: encima de los mandos en el feed, encima del mini en la lista y en las pantallas */
  .root.ui3 .toasts{top:auto;bottom:calc(var(--ctrl) + 4px);}
  .root.ui3 .app[data-view=list] .toasts,.root.ui3 .app.over .toasts{bottom:calc(var(--sb) + 14px);}
  .root.ui3 .app[data-view=list].has-cur .toasts,.root.ui3 .app.over.has-cur .toasts{bottom:calc(var(--sb) + 116px);}
  .root.ui3 .toast{background:#2a2a33;color:var(--fg);border-radius:16px;padding:12px 14px;font-size:14.5px;box-shadow:0 10px 28px rgba(0,0,0,.5);}
  .root.ui3 .toast button{color:var(--acc);}
  /* el selector de lista (arriba): icono, nombre, filtros debajo y un punto si no son los predeterminados */
  .root.ui3 .srcp{position:relative;grid-template-columns:36px minmax(0,auto) 14px;grid-template-rows:auto auto;justify-content:start;align-items:center;column-gap:10px;min-width:0;height:50px;padding:0 14px 0 7px;border-radius:16px;background:rgba(27,27,34,.94);text-align:left;}
  .root.ui3 .srcp .sic{display:grid;place-items:center;grid-column:1;grid-row:1 / 3;width:36px;height:36px;border-radius:11px;background:var(--accSoft);color:var(--acc);}
  .root.ui3 .srcp .sic svg{width:20px;height:20px;}
  .root.ui3 .srcp span{grid-column:2;grid-row:1;align-self:end;font-size:15.5px;font-weight:750;letter-spacing:-.01em;line-height:1.25;}
  .root.ui3 .srcp>i{grid-column:3;grid-row:1;align-self:end;width:14px;height:14px;margin-bottom:3px;color:var(--mut);}
  .root.ui3 .srcp .srs{display:block;grid-column:2 / 4;grid-row:2;align-self:start;font-size:12px;font-weight:500;line-height:1.35;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .root.ui3 .srcp .srs:empty{display:none;}
  .root.ui3 .srcp:has(.srs:empty) span,.root.ui3 .srcp:has(.srs:empty)>i{grid-row:1 / 3;align-self:center;margin-bottom:0;}
  .root.ui3 .srcp.chg .sdot{display:block;position:absolute;left:35px;top:6px;width:9px;height:9px;border-radius:50%;background:var(--acc);box-shadow:0 0 0 2px #1b1b22;}
  /* siluetas mientras carga (sin animación: no gastan) */
  .root.ui3 .sk{display:block;border-radius:8px;background:linear-gradient(90deg,var(--s2),var(--s3) 50%,var(--s2));}
  .root.ui3 .sk-l{height:26px;width:85%;margin:4px 0;}
  .root.ui3 .sk-m{height:16px;width:62%;margin:4px 0;}
  .root.ui3 .sk-s{height:13px;width:46%;margin:3px 0;}
  .root.ui3 .sk-xs{height:11px;width:34%;margin:3px 0;}
  .root.ui3 .skel .cin{justify-content:flex-start;align-items:stretch;text-align:left;gap:0;}
  .root.ui3 .skel .cvw.sk{box-shadow:none;border-radius:18px;}
  .root.ui3 .skel .sk-r{width:48px;height:48px;border-radius:50%;}
  .root.ui3 .sk-chips{display:flex;gap:6px;margin-top:10px;}
  .root.ui3 .sk-chips .sk{width:64px;height:27px;border-radius:14px;}
  .root.ui3 .skrows{padding:4px 0;}
  .root.ui3 .skrow{display:flex;align-items:center;gap:12px;padding:9px 16px;}
  .root.ui3 .sk-cv{width:52px;height:52px;border-radius:10px;flex:none;}
  .root.ui3 .skt{flex:1;display:flex;flex-direction:column;}
  /* pantallas por capas: títulos grandes y bloques con iconos de color */
  .root.ui3 .pg{background:var(--bg);}
  .root.ui3 .pg .ibtn{background:var(--s2);}
  .root.ui3 .pgh{min-height:calc(var(--st) + 60px);padding-top:calc(var(--st) + 12px);}
  .root.ui3 .pg:not(.sub) .pgh h2{font-size:34px;font-weight:850;letter-spacing:-.025em;}
  .root.ui3 .pg.sub .pgh h2{font-size:22px;font-weight:800;letter-spacing:-.015em;}
  .root.ui3 .pg .sec,.root.ui3 .srch .sec{margin:22px 4px 9px;font-size:19px;font-weight:750;letter-spacing:-.01em;text-transform:none;color:var(--fg);display:flex;align-items:baseline;justify-content:space-between;gap:10px;}
  .root.ui3 .pg .sec .svn,.root.ui3 .pg .sec a,.root.ui3 .srch .sec a{float:none;font-size:13px;font-weight:600;color:var(--mut);text-decoration:none;}
  .root.ui3 .pg .sec a,.root.ui3 .srch .sec a{color:var(--acc);}
  .root.ui3 .pgb>.sec:first-child{margin-top:8px;}
  .root.ui3 .grp{background:var(--s1);border-radius:18px;overflow:hidden;}
  .root.ui3 .grp .opt{padding:12px 14px;border-bottom:1px solid var(--line);font-size:16px;}
  .root.ui3 .grp .opt:last-child{border-bottom:0;}
  .root.ui3 .grp .opt>i{width:32px;height:32px;padding:6px;border-radius:9px;background:hsl(var(--ih,220),56%,48%);color:#fff;}
  .root.ui3 .grp .opt.prow small{display:grid;place-items:center;min-width:24px;height:24px;padding:0 7px;border-radius:12px;background:var(--acc);color:var(--accInk);font-size:12px;font-weight:800;}
  .root.ui3 .grp .opt[disabled]{opacity:.45;}
  .root.ui3 .grpx{margin-top:14px;}
  .root.ui3 .grpx .opt>i{background:rgba(255,110,110,.16);color:#ff9090;}
  .root.ui3 .grpf{padding:4px 14px 8px;}
  .root.ui3 .grpf .lab:first-child{margin-top:10px;}
  .root.ui3 .grpf .tg{border-bottom:0;}
  .root.ui3 .note.pgsub{margin:0 4px;font-size:13.5px;}
  .root.ui3 .note.okn{display:flex;align-items:center;gap:8px;margin-top:16px;padding:12px 14px;border-radius:14px;background:var(--s1);font-size:13.5px;}
  .root.ui3 .note.okn i{width:18px;height:18px;flex:none;color:var(--acc);}
  .root.ui3 .note.vnote{text-align:center;margin-top:18px;}
  .root.ui3 .pgf{background:var(--bg);}
  .root.ui3 .pgf .btn{height:50px;border-radius:16px;}
  .root.ui3 .pgf .bpin{font-size:14px;line-height:1.15;white-space:normal;}
  /* guardados: tarjetas en una fila que se desliza */
  .root.ui3 .svcards{display:flex;gap:10px;overflow-x:auto;margin:0 -16px;padding:0 16px 4px;scrollbar-width:none;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;}
  .root.ui3 .svcards::-webkit-scrollbar{display:none;}
  .root.ui3 .svc{position:relative;flex:none;width:156px;border-radius:16px;background:var(--s1);box-shadow:inset 0 0 0 1.5px var(--line);}
  .root.ui3 .svc.on{background:var(--accSoft);box-shadow:inset 0 0 0 1.5px var(--acc);}
  .root.ui3 .svgo{display:flex;flex-direction:column;align-items:flex-start;gap:5px;width:100%;padding:12px;text-align:left;}
  .root.ui3 .svi{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--s3);color:var(--mut);}
  .root.ui3 .svi i{width:16px;height:16px;}
  .root.ui3 .svc.on .svi{background:var(--acc);color:var(--accInk);}
  .root.ui3 .svgo b{max-width:100%;font-size:15px;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .root.ui3 .svgo small{font-size:12px;line-height:1.3;color:var(--mut);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
  .root.ui3 .svmore{position:absolute;right:2px;top:2px;width:40px;height:40px;display:grid;place-items:center;color:var(--dim);}
  .root.ui3 .svmore i{width:18px;height:18px;}
  .root.ui3 .svadd{width:118px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:12px;background:transparent;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.2);color:var(--mut);font-size:13px;font-weight:650;text-align:center;}
  .root.ui3 .svadd i{width:22px;height:22px;}
  /* BPM y tono */
  .root.ui3 .bkv{gap:10px;padding:12px 0 2px;}
  .root.ui3 .bkv input{width:100px;height:54px;font-size:23px;font-weight:800;}
  .root.ui3 .bkv small{font-size:14px;color:var(--mut);}
  .root.ui3 .bkb .presets{margin:10px 0 6px;}
  .root.ui3 .kcn{margin:0 4px;}
  .root.ui3 .kgrid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin-top:8px;}
  .root.ui3 .kc{height:50px;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;background:hsla(var(--kh,220),70%,55%,.14);color:hsl(var(--kh,220),85%,72%);}
  .root.ui3 .kc b{font-size:14.5px;font-weight:850;}
  .root.ui3 .kc small{font-size:9.5px;font-weight:600;opacity:.85;white-space:nowrap;}
  .root.ui3 .kc.on{background:hsl(var(--kh,220),72%,62%);color:#0b0b0e;}
  /* Home */
  .root.ui3 .hmh{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;padding:calc(var(--st) + 16px) 4px 0;}
  .root.ui3 .hmd{font-size:12.5px;font-weight:750;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);}
  .root.ui3 .hmh h1{margin:2px 0 0;font-size:36px;font-weight:850;letter-spacing:-.03em;line-height:1.05;}
  .root.ui3 .hmset{width:44px;height:44px;flex:none;}
  .root.ui3 .hmcard{display:flex;width:100%;margin-top:14px;border-radius:20px;text-align:left;}
  .root.ui3 .hmcont{align-items:center;gap:12px;padding:12px;background:linear-gradient(120deg,rgba(255,122,80,.17),var(--s1) 72%);}
  .root.ui3 .hmcc{width:64px;height:64px;border-radius:12px;object-fit:cover;flex:none;background:var(--s3);}
  .root.ui3 .hmct{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
  .root.ui3 .hmk{font-size:11px;font-weight:800;letter-spacing:.08em;color:var(--mut);}
  .root.ui3 .hmct b{font-size:17px;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .root.ui3 .hmct small{font-size:13px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .root.ui3 .hmbar{position:relative;height:3px;margin-top:6px;border-radius:2px;background:rgba(255,255,255,.14);overflow:hidden;}
  .root.ui3 .hmbar span{position:absolute;left:0;top:0;bottom:0;border-radius:2px;background:var(--acc);}
  .root.ui3 .hmplay{flex:none;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:var(--acc);color:var(--accInk);}
  .root.ui3 .hmplay i{width:24px;height:24px;}
  .root.ui3 .hmfol{flex-direction:column;align-items:stretch;gap:12px;padding:16px;cursor:pointer;background:linear-gradient(140deg,rgba(255,122,80,.2),rgba(255,122,80,.05));box-shadow:inset 0 0 0 1px var(--accLine);}
  .root.ui3 .hmfol.none{background:var(--s1);box-shadow:none;}
  .root.ui3 .hmtag{align-self:flex-start;display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 10px;border-radius:12px;background:var(--acc);color:var(--accInk);font-size:11px;font-weight:850;letter-spacing:.06em;}
  .root.ui3 .hmfol.none .hmtag{background:var(--s3);color:var(--mut);}
  .root.ui3 .hmtag i{width:14px;height:14px;}
  .root.ui3 .hmbig{display:flex;align-items:center;gap:14px;}
  .root.ui3 .hmbig>b{font-size:46px;font-weight:850;letter-spacing:-.04em;line-height:1;font-variant-numeric:tabular-nums;}
  .root.ui3 .hmbig>span{display:flex;flex-direction:column;gap:2px;min-width:0;}
  .root.ui3 .hmbig strong{font-size:17px;font-weight:750;}
  .root.ui3 .hmbig small{font-size:13px;color:var(--mut);}
  .root.ui3 .hmrow{display:flex;align-items:center;justify-content:space-between;gap:10px;}
  .root.ui3 .hmcovs{display:flex;min-height:44px;}
  .root.ui3 .hmsc{display:block;width:44px;height:44px;border-radius:11px;object-fit:cover;background:var(--s3);box-shadow:0 0 0 3px #1c1513;}
  .root.ui3 .hmfol.none .hmsc{box-shadow:0 0 0 3px var(--s1);}
  .root.ui3 .hmsc+.hmsc{margin-left:-12px;}
  .root.ui3 .hmgo{flex:none;display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 14px;border-radius:19px;background:rgba(255,255,255,.1);font-size:14px;font-weight:750;}
  .root.ui3 .hmgo i{width:16px;height:16px;}
  .root.ui3 .hmerr{font-size:14px;color:var(--mut);}
  .root.ui3 .hmfol .sk-l{width:40%;height:40px;}
  .root.ui3 .hmtiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
  .root.ui3 .hmtile{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:2px 8px;min-height:106px;padding:14px;border-radius:18px;background:var(--s1);text-align:left;}
  .root.ui3 .hmti{grid-column:1;grid-row:1;width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:hsla(var(--ih),70%,55%,.18);color:hsl(var(--ih),85%,70%);}
  .root.ui3 .hmti i{width:20px;height:20px;}
  .root.ui3 .hmtile>b{grid-column:2;grid-row:1;justify-self:end;font-size:25px;font-weight:850;letter-spacing:-.03em;font-variant-numeric:tabular-nums;}
  .root.ui3 .hmtt{grid-column:1 / 3;grid-row:2;margin-top:8px;font-size:16px;font-weight:700;}
  .root.ui3 .hmtile small{grid-column:1 / 3;grid-row:3;font-size:12.5px;color:var(--mut);}
  .root.ui3 .hmcombos{display:flex;flex-wrap:wrap;gap:8px;}
  .root.ui3 .hmcombo{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 15px;border-radius:20px;background:var(--s1);box-shadow:inset 0 0 0 1px var(--line);font-size:14px;font-weight:650;}
  .root.ui3 .hmcombo span{width:8px;height:8px;border-radius:50%;background:hsl(var(--ih,200),75%,62%);}
  .root.ui3 .hmc0{color:var(--mut);}
  .root.ui3 .hmc0 i{width:18px;height:18px;}
  .root.ui3 .hmsims{display:flex;gap:12px;overflow-x:auto;margin:0 -16px;padding:0 16px 2px;scrollbar-width:none;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;}
  .root.ui3 .hmsims::-webkit-scrollbar{display:none;}
  .root.ui3 .hmsim{flex:none;width:122px;display:flex;flex-direction:column;gap:5px;text-align:left;}
  .root.ui3 .hmsimc,.root.ui3 .hmsim .sk-c{display:block;width:122px;height:122px;border-radius:14px;object-fit:cover;background:var(--s2);}
  .root.ui3 .hmsim b{font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .root.ui3 .hmsim small{font-size:12.5px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .root.ui3 .hmnote{padding:2px 4px;font-size:14px;color:var(--mut);}
  .root.ui3 .hmstats{display:flex;gap:10px;padding:14px 16px;border-radius:18px;background:var(--s1);}
  .root.ui3 .hmstats span{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
  .root.ui3 .hmstats b{font-size:24px;font-weight:850;font-variant-numeric:tabular-nums;}
  .root.ui3 .hmstats small{font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .root.ui3 .hmnc{display:block;}
  .root.ui3 .ghd{flex:none;width:8px;height:8px;margin-right:8px;border-radius:50%;background:hsl(var(--gh,220),70%,60%);}
  .root.ui3 .gh{justify-content:flex-start;align-items:center;}
  .root.ui3 .gh span{margin-left:auto;}
  .root.ui3 .lhead:empty{display:none;}
  /* «Listas» (el menú del selector) */
  .root.ui3 .s-action[data-k=lists] .opt{background:var(--s2);padding:11px 14px;gap:12px;font-size:16px;}
  .root.ui3 .s-action[data-k=lists] .opt:first-of-type{border-radius:16px 16px 0 0;}
  .root.ui3 .s-action[data-k=lists] .opt:last-of-type{border-radius:0 0 16px 16px;border-bottom:0;}
  .root.ui3 .s-action[data-k=lists] .opt.ofil{border-radius:16px;border-bottom:0;margin-bottom:14px;}
  .root.ui3 .s-action[data-k=lists] .opt.ofil+.opt{border-radius:16px 16px 0 0;}
  .root.ui3 .s-action[data-k=lists] .opt>i{width:34px;height:34px;padding:7px;border-radius:10px;background:hsl(var(--ih,220),56%,48%);color:#fff;}
  .root.ui3 .s-action[data-k=lists] .opt.on .ol>span{color:var(--acc);}
  .root.ui3 .obadge{flex:none;display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:12px;background:var(--acc);color:var(--accInk);font-size:12px;font-weight:800;}
  .root.ui3 .ochk{flex:none;display:grid;place-items:center;}
  .root.ui3 .opt .ochk i{width:22px;height:22px;color:var(--acc);}
  .root.ui3 .sec .sect{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .root.ui3 .sec .hmall{flex:none;}
  .root.ui3 .hmplaynew{background:var(--acc);color:var(--accInk);}
  /* Chat (muy pronto) */
  .root.ui3 .cht{display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px 18px 0;text-align:center;}
  .root.ui3 .chb{position:relative;width:116px;height:100px;margin-bottom:4px;}
  .root.ui3 .chb1{position:absolute;left:0;top:6px;width:80px;height:62px;border-radius:22px 22px 22px 6px;background:var(--s2);}
  .root.ui3 .chb2{position:absolute;right:0;bottom:0;width:80px;height:62px;border-radius:22px 22px 6px 22px;background:var(--acc);color:var(--accInk);display:grid;place-items:center;}
  .root.ui3 .chb2 i{width:30px;height:30px;}
  .root.ui3 .chs{display:inline-flex;align-items:center;height:26px;padding:0 12px;border-radius:13px;background:var(--accSoft);color:var(--acc);font-size:12px;font-weight:850;letter-spacing:.07em;}
  .root.ui3 .cht h3{margin:4px 0 0;font-size:23px;font-weight:800;letter-spacing:-.02em;}
  .root.ui3 .cht p{margin:0 0 10px;max-width:310px;font-size:15px;line-height:1.45;color:var(--mut);}
  .root.ui3 .cht .btn{max-width:340px;}
  .root.ui3 .cht .chline{background:transparent;box-shadow:inset 0 0 0 1px var(--line);}
  /* buscador: recientes y explorar géneros */
  .root.ui3 .srch{background:var(--bg);}
  .root.ui3 .sq{height:50px;border-radius:16px;padding:0 14px;}
  .root.ui3 .sq:focus{border-color:var(--acc);}
  .root.ui3 .sgo{height:50px;border-radius:16px;}
  .root.ui3 .srec{display:flex;align-items:center;border-bottom:1px solid var(--line);}
  .root.ui3 .srec .opt{flex:1;min-width:0;border-bottom:0;padding:12px 4px;font-weight:550;}
  .root.ui3 .srec .opt span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .root.ui3 .srec .opt i{color:var(--dim);}
  .root.ui3 .srx{width:40px;height:44px;color:var(--dim);}
  .root.ui3 .srx i{width:18px;height:18px;}
  .root.ui3 .snote{padding:12px 4px 0;}
  .root.ui3 .sgen{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
  .root.ui3 .sgt{display:flex;align-items:flex-end;height:68px;padding:12px;border-radius:16px;text-align:left;font-size:15.5px;font-weight:800;line-height:1.15;color:#fff;
    background:linear-gradient(135deg,hsl(var(--ih),56%,40%),hsl(calc(var(--ih) + 35),62%,21%));}
  @media (orientation:portrait),(min-height:501px){
    /* arriba: el selector de lista, grande, con sus filtros debajo; y Feed / Lista (barra «Ajustes») o los contadores (barra «Lista») */
    .root.ui3{--top:calc(var(--st) + 72px);}
    .root.ui3 .topbar{padding:calc(var(--st) + 12px) calc(var(--sr) + 14px) 10px calc(var(--sl) + 14px);}
    .root.ui3 .app[data-view=list] .topbar{background:var(--bg);border-bottom:1px solid var(--line);}
    .root.ui3 .tb-sp{display:none;}
    .root.ui3 .srcp{display:grid;flex:1 1 auto;}
    .root.ui3 .app.is-search .vseg{order:1;}
    .root.ui3 .pg[data-id=home] .pgh{display:none;}
    .root.ui3 .ibtn{width:44px;height:44px;background:rgba(27,27,34,.94);}
    .root.ui3:not(.tabsb) .vseg{display:flex;flex:none;gap:2px;padding:4px;border-radius:16px;background:rgba(27,27,34,.94);}
    .root.ui3 .vseg button{display:grid;place-items:center;width:40px;height:42px;border-radius:12px;color:var(--mut);}
    .root.ui3 .vseg button i{width:21px;height:21px;}
    .root.ui3 .vseg button.on{background:var(--acc);color:var(--accInk);}
    .root.ui3:not(.tabsb) .dlleft{display:none;}
    .root.ui3 .pill{height:44px;padding:0 13px;border-radius:16px;background:rgba(27,27,34,.94);font-size:14px;}
    .root.ui3 .sqb{height:46px;border-radius:14px;background:var(--s2);}
    .root.ui3 .srt{height:auto;margin:6px 0 12px 4px;font-size:34px;font-weight:850;letter-spacing:-.025em;line-height:1.1;}
    /* en Home no va el mini: ya está «Sigue escuchando» */
    .root.ui3 .app.over.hm .mini{display:none;}
    .root.ui3 .app.hm.has-cur .pg{padding-bottom:var(--sb);}
    .root.ui3 .app.hm .toasts,.root.ui3 .app.hm.has-cur .toasts{bottom:calc(var(--sb) + 14px);}
    /* barra de pestañas */
    .root.ui3 .tabs{background:#0d0d11;}
    .root.ui3 .tabs button{gap:3px;font-size:10.5px;font-weight:600;color:rgba(244,244,247,.5);}
    .root.ui3 .tabs button .tpi{display:grid;place-items:center;width:52px;height:29px;border-radius:15px;transition:background-color .2s;}
    .root.ui3 .tabs button .tpi i{width:22px;height:22px;}
    .root.ui3 .tabs button.on{color:var(--acc);font-weight:750;}
    .root.ui3 .tabs button.on .tpi{background:var(--accSoft);}
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
  let host, root, app, feedEl, listEl, ctrlEl, miniEl, toastsEl, shadeEl, ctxEl, srchEl, pgEl;
  // 2.1 (diseño nuevo): capas de la pantalla de Ajustes, la última búsqueda y el paso atrás pedido con ‹
  let pgStack = []; // [{ id, arg }]; la primera capa no ocupa historial (es una pestaña), las demás sí
  let fdraft = null; // filtros que se están tocando en Ajustes: { mode: 'start' | 'cur', f, src }
  let searchKeep = null; // la última búsqueda hecha: la pestaña Buscar vuelve a ella sin pedirla otra vez
  let backWant = null; // hasta qué profundidad tiene que bajar el paso atrás que ha pedido el botón ‹
  let navJump = false; // 2.1.3: el paso del historial lo ha pedido la propia app (mini reproductor → otra lista)
  // 2.1.2
  let shadow = null; // la raíz de sombra de la app
  let srWas = null; // cómo tenía la página lo de recolocarse al ir atrás (se devuelve al cerrar la app)
  // ¿se está escribiendo? (campo con el foco = teclado abierto)
  const typing = () => { const a = shadow && shadow.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
  // registro corto de las pantallas de Ajustes, para el diagnóstico
  const pgLog = [];
  const pgNote = (ev) => {
    pgLog.push([Math.round(performance.now() / 100) / 10, ev, pgStack.map((x) => x.id).join('>')]);
    if (pgLog.length > 14) pgLog.shift();
  };
  const pgOn = () => pgStack.length > 0;
  const overOn = () => pgOn() || !!(srchEl && srchEl.classList.contains('on'));
  const paintOver = () => {
    if (!app) return;
    app.classList.toggle('over', overOn());
    // 2.2 · Diseño 2: en Home no va el mini (ya está «Sigue escuchando»)
    app.classList.toggle('hm', ui3() && pgOn() && pgStack[pgStack.length - 1].id === 'home');
    if (ui3()) folCommit(); // Seguidos que estaba debajo de una pantalla ya se ve
  };

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
    shadow = sr;
    // aislar teclas para que no disparen los atajos de Soundeo
    ['keydown', 'keypress', 'keyup'].forEach((ev) => host.addEventListener(ev, (e) => e.stopPropagation()));
    // al cerrar el teclado Safari puede dejar la página desplazada: devolverla a su sitio
    host.addEventListener('focusout', () => setTimeout(() => { if (isOpen && (!imm.on || imm.paused)) window.scrollTo(0, 0); }, 60));
    // mientras se escribe (teclado abierto) la página vuelve a estar fija, como sin el modo inmersivo
    host.addEventListener('focusin', () => { if (typing()) immPause(true); });
    host.addEventListener('focusout', () => setTimeout(() => { if (!typing()) immPause(false); }, 120));
    // 2.1.2: Safari no manda «focusout» cuando el campo en el que se escribía desaparece de la pantalla, y entonces
    // nadie devolvía la página a su sitio ni reanudaba el modo de la barra. Se comprueba también en cada toque.
    host.addEventListener('touchstart', kbSync, { capture: true, passive: true });

    sr.innerHTML = `<style>${APP_CSS}${APP_CSS3}${APP_CSS3_LAND}</style>
      <div class="root">
        <div class="app" data-view="feed">
          <div class="feed"></div>
          <div class="list"></div>
          <div class="topbar">
            <button class="ibtn bnav" aria-label="Secciones">${i('menu')}</button>
            <button class="srcp" aria-label="Elegir lista"><em class="sic"></em><span></span>${i('chev')}<small class="srs"></small><b class="sdot"></b></button>
            <div class="vseg" role="group" aria-label="Vista"><button data-v="feed" aria-label="Vista Feed">${i('feed2')}</button><button data-v="list" aria-label="Vista Lista">${i('list2')}</button></div>
            <button class="sqb" aria-label="Cambiar la búsqueda">${i('search')}<span></span></button>
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
              <button class="cb sm b15" aria-label="Atrás ${skipBack()} s">${i('back')}<em>${skipBack()}</em></button>
              <button class="cb bprev" aria-label="Anterior">${i('prev')}</button>
              <button class="cb big bplay" aria-label="Reproducir">${i('play')}</button>
              <button class="cb bnext" aria-label="Siguiente">${i('next')}</button>
              <button class="cb sm f30" aria-label="Adelante ${skipFwd()} s">${i('fwd')}<em>${skipFwd()}</em></button>
            </div>
          </div>
          <div class="mini">
            <div class="mseek"><span class="mtc">0:00</span><div class="bar"><div class="buf"></div><div class="fill"></div><div class="knob"></div></div><span class="mtd">0:00</span></div>
            <img alt="">
            <div class="mm"><div class="mt"></div><div class="ma"></div></div>
            <button class="mb mfav" aria-label="Guardar">${i('star')}</button>
            <button class="mb mprev" aria-label="Anterior">${i('prev')}</button>
            <button class="mb mplay" aria-label="Reproducir">${i('play')}</button>
            <button class="mb mnext" aria-label="Siguiente">${i('next')}</button>
            <button class="mb mexp" aria-label="Abrir en feed">${i('up')}</button>
          </div>
          <div class="tabs">
            <button data-t="feed">${i('feed')}<span>Feed</span></button>
            <button data-t="list">${i('rows')}<span>Lista</span></button>
            <button data-t="search">${i('search')}<span>Buscar</span></button>
            <button data-t="chat">${i('chat')}<span>Chat</span></button>
            <button data-t="settings">${i('sliders')}<span>Ajustes</span></button>
          </div>
          <div class="srch">
            <h2 class="srt">Buscar</h2>
            <form class="srow" action="#">
              <button type="button" class="ibtn sback" aria-label="Cerrar">${i('chev')}</button>
              <input class="sq" type="search" enterkeyhint="search" placeholder="Artista, título o sello" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
              <button type="submit" class="btn pri sgo">Buscar</button>
            </form>
            <div class="sbody"></div>
          </div>
          <div class="pg">
            <div class="pgh"><button class="ibtn pgback" aria-label="Atrás">${i('chev')}</button><h2></h2><button class="ibtn pgx" aria-label="Cerrar">${i('close')}</button></div>
            <div class="pgb"></div>
            <div class="pgf"></div>
          </div>
          <div class="toasts"></div>
          <div class="sap"></div>
          <div class="psv"></div><div class="plv"></div>
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
    pgEl = $('.pg', sr);

    // eventos fijos
    $$('.seg button', sr).forEach((b) => b.addEventListener('click', () => setView(b.dataset.v)));
    $('.bnav', sr).addEventListener('click', () => {
      // 2.1.3 (diseño nuevo): desde el feed de una lista a la que se ha entrado (artista, sello, búsqueda…), ‹ vuelve
      // primero a esa lista, sin cambiar de canción. Antes volvía a la lista anterior y abría su feed: cambiaba la canción.
      if (stack.length > 1 && prefs.ui2 && view === 'feed') { setView('list'); return; }
      if (stack.length > 1) goBack();
      else openMenu();
    });
    $('.bsearch', sr).addEventListener('click', () => openSearch());
    $('.bset', sr).addEventListener('click', () => settingsGo());
    $('.srcp', sr).addEventListener('click', () => openMenu());
    // (la barra de búsqueda de los resultados es el propio campo: ahí sí sale el teclado)
    $('.sqb', sr).addEventListener('click', () => openSearch(cur && cur.kind === 'search' ? cur.query : '', true));
    $('.pgback', sr).addEventListener('click', pgBack);
    $('.pgx', sr).addEventListener('click', pgClose);
    root.classList.toggle('dense', !!pref2('dense'));
    root.classList.toggle('bigtx', !!pref2('bigText'));
    // (2.2: un solo oyente para toda la barra, porque el Diseño 2 cambia sus botones)
    $('.tabs', sr).addEventListener('click', (e) => { const b = e.target.closest('button[data-t]'); if (b) tabGo(b.dataset.t); });
    $$('.vseg button', sr).forEach((b) => b.addEventListener('click', () => { if (view !== b.dataset.v) setView(b.dataset.v); }));
    root.classList.toggle('ui2', !!prefs.ui2);
    applyUi3();
    $('.dlleft', sr).addEventListener('click', () => toast(dlLeftText()));
    ctxEl.addEventListener('click', () => setView('list'));
    $('.bplay', sr).addEventListener('click', togglePlay);
    $('.bnext', sr).addEventListener('click', () => step(1, true));
    $('.bprev', sr).addEventListener('click', () => step(-1, true));
    $('.b15', sr).addEventListener('click', () => seekBy(-skipBack()));
    $('.f30', sr).addEventListener('click', () => seekBy(skipFwd()));
    $('.mplay', sr).addEventListener('click', togglePlay);
    $('.mnext', sr).addEventListener('click', () => step(1, true));
    $('.mprev', sr).addEventListener('click', () => step(-1, true));
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
    setupBar($('.controls .bar', sr));
    setupBar($('.mseek .bar', sr));
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
      // (2.1.6: cambiar la portada de tamaño ya no re-maqueta nada, así que medir aquí no la mueve a mitad de su animación)
      rzT = setTimeout(() => { if (isOpen && view === 'feed' && performance.now() > holdUntil) layoutCards(); }, 150);
    });
    try {
      new ResizeObserver(() => { if (isOpen && view === 'feed' && widthChanged()) holdFeed(700); }).observe(feedEl);
    } catch (e) {}
    // al volver a Safari (o desbloquear), el feed se recoloca en la que está sonando
    const resync = () => { if (!document.hidden && isOpen && view === 'feed') holdFeed(350); };
    document.addEventListener('visibilitychange', resync);
    // 2.2 · Diseño 2: la hora sin usarla se cuenta desde que se va; al volver tras más de una hora, Home
    document.addEventListener('visibilitychange', () => { if (!ui3()) return; if (document.hidden) { if (isOpen) noteActive(true); } else { homeIfIdle(); folCommit(); } });
    window.addEventListener('pagehide', () => { if (ui3() && isOpen) noteActive(true); });
    window.addEventListener('pageshow', resync);
    setupImmersive();
    let retryAt = 0;
    const retryStale = () => {
      if (document.hidden || !isOpen || !cur || !(cur.needLogin || cur.bounced) || performance.now() - retryAt < 4000) return;
      retryAt = performance.now();
      reloadSource(cur);
    };
    window.addEventListener('pageshow', (e) => {
      if (e.persisted && !isOpen && reopenOnReturn && cur) {
        reopenOnReturn = false;
        SS.del('closed');
        openApp(view);
      }
      // la página vuelve tal como se dejó: lo que pedía sesión se pide otra vez (puede que ya la haya)
      retryStale();
    });
    document.addEventListener('visibilitychange', retryStale);
    window.addEventListener('popstate', (e) => {
      if (!isOpen) return;
      try { history.scrollRestoration = 'manual'; } catch (err) {}
      if (pgStack.length) pgNote('atrás');
      const want = backWant;
      backWant = null;
      // capas de Ajustes: un paso atrás (‹ o el gesto de Safari) quita al menos una capa
      if (pgStack.length > 1) {
        const p = e.state && typeof e.state.pg === 'number' ? e.state.pg : 0;
        pgPop(Math.max(0, Math.min(pgStack.length - 2, p)));
        return;
      }
      const jump = navJump;
      navJump = false;
      let d = e.state && typeof e.state.sx === 'number' ? e.state.sx : 0;
      // con ‹ siempre se baja un nivel, aunque el paso del historial caiga en una entrada de la misma profundidad
      if (want != null) d = Math.min(d, want);
      // 2.1.3 (diseño nuevo): el gesto atrás de Safari hace lo mismo que ‹ en el feed de una lista a la que se ha
      // entrado: va a su lista. El paso del historial se repone, para que el siguiente gesto vuelva a la lista anterior.
      if (d < stack.length - 1 && prefs.ui2 && view === 'feed' && want == null && !jump && !overOn()) {
        setView('list');
        try { history.pushState({ sx: stack.length - 1 }, '', location.href); } catch (err) {}
        return;
      }
      if (d < stack.length - 1) popTo(d);
    });
  }

  /* ───────────── abrir / cerrar / vistas ───────────── */
  function openApp(v) {
    isOpen = true;
    // 2.1.2: con la app abierta, el navegador no recoloca la página al ir atrás/adelante (con la barra de Safari
    // activada la página de debajo mide 60 000 px: el salto se tomaba por «barra escondida»)
    try { if (srWas == null) srWas = history.scrollRestoration; history.scrollRestoration = 'manual'; } catch (e) {}
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
    try { if (srWas != null) { history.scrollRestoration = srWas; srWas = null; } } catch (e) {}
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
  const imm = { on: false, paused: false, armed: false, y0: 0, h: 0, w: 0, sab: 0, t0: 0, lockT: 0, log: [], touch: 0, touchT: 0, moved: false, mvT: 0, ih0: 0, setT: 0, rec: null, part: null,
    scT: 0, lockY: 0, lockAt: 0, guard: 0, nc: 0, qT: 0, qLog: false,
    brN: 0, brT: 0, brY: 0, brWait: false, brTm: 0, brakes: 0, tlog: 0, holdBig: false, holdT: 0, holdTm: 0, geoHi: -1,
    kbFull: false, pinH: 0, pinW: 0, pinT: 0 };
  const immSab = () => { const p = root && $('.sap', root); return p ? p.offsetHeight : 0; };
  function immLog(ev, more) {
    let vv = null;
    try { vv = window.visualViewport ? Math.round(window.visualViewport.height) : null; } catch (e) {}
    imm.log.push(Object.assign({ t: Math.round((performance.now() - imm.t0) / 100) / 10, ev, y: Math.round(window.scrollY), ih: window.innerHeight, vv, sab: immSab() }, more || {}));
    if (imm.log.length > 40) imm.log.shift();
  }
  // 2.1.6 — Diagnóstico del 26 nov (2.1.5, modo A): en los 10 bloqueos que se soltaron, la página no llegó a pararse entre el
  // bloqueo y la vuelta de la barra (bajó otros 200–900 px por inercia), y el freno del dedo al tocar no saltó ni una vez
  // (Safari no entrega a la página el toque que para una inercia). Así que ahora se para la inercia misma: en cuanto la
  // barra está escondida y no hay dedo en la pantalla, un window.scrollTo (WebKit para cualquier desplazamiento en curso
  // antes de moverse) un poco más abajo, que como mucho encoge más la barra. Si la página sigue moviéndose, se repite.
  function immBrake(why) {
    if (!imm.on || imm.armed || imm.paused || !immNew() || imm.touch) return false;
    // solo si la página se está moviendo (si no, no hay inercia que parar)
    if (!immCoast()) return false;
    const r = immRec();
    // con la barra aún acabando de encogerse se espera a que termine (lo hace immCheck), con un tope de tiempo
    if (r.hi && window.innerHeight < r.hi - 2 && why !== 'tiempo') {
      imm.brWait = true;
      clearTimeout(imm.brTm);
      imm.brTm = setTimeout(() => { if (imm.brWait) { imm.brWait = false; immBrake('tiempo'); } }, 250);
      return false;
    }
    imm.brWait = false;
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const y = Math.min(max, Math.round(window.scrollY) + 60);
    imm.brN++;
    imm.brakes++;
    imm.brT = performance.now();
    imm.brY = y;
    try { window.scrollTo(0, y); } catch (e) {}
    immLog('frenar', { w: why, n: imm.brN });
    clearTimeout(imm.brTm);
    // ¿sigue moviéndose sola? (algún scroll después del nuestro y lejos de donde la dejamos): otra vez, hasta 3
    if (imm.brN < 3) imm.brTm = setTimeout(() => { if (!imm.armed && !imm.touch && imm.scT > imm.brT + 30 && Math.abs(window.scrollY - imm.brY) > 2) immBrake('sigue'); }, 110);
    return true;
  }
  // 2.1.6 — Cambiar la portada entre sus dos tamaños es poner o quitar .cvsm (ver layoutCards). Con la barra volviendo
  // (rearmado por 'barra'), la portada espera a que la barra haya vuelto de verdad (30 px) o 220 ms: si la barra se vuelve
  // a esconder antes, la portada no se ha movido (antes encogía y crecía en cada intento).
  function immPaint() {
    if (!root) return;
    let small = !!(imm.on && (imm.armed || imm.paused));
    if (small && imm.pinH) small = false; // 2.1.8: con el alto de pantalla completa fijado (teclado), la portada sigue grande
    if (small && imm.holdBig) {
      const r = immRec();
      const far = !r.hi || window.innerHeight <= r.hi - 30;
      if (!far && performance.now() - imm.holdT < 220) small = false;
      else imm.holdBig = false;
    }
    root.classList.toggle('cvsm', small);
  }
  // 2.1.8 — Teclado con la barra escondida. En el diagnóstico de Tiger (2.1.7), al cerrar el teclado el alto visible pasó
  // un instante a 645 (barra grande) y a los 0,1 s volvió a 739: el mini reproductor y las pestañas, pegados abajo, subían
  // 94 px y bajaban otra vez (el trompicón que veía). Ahora, si el teclado se abre con la barra escondida, la app conserva
  // ese alto (--apph, .kbpin) mientras esté el teclado y hasta que el alto vuelva a él; si la barra ha vuelto de verdad,
  // se suelta a los 700 ms.
  function immPin(on) {
    if (!root) return;
    clearTimeout(imm.pinT);
    if (on) {
      imm.pinH = window.innerHeight;
      imm.pinW = window.innerWidth;
      root.style.setProperty('--apph', imm.pinH + 'px');
      root.classList.add('kbpin');
      immLog('fijar alto', { h: imm.pinH });
      return;
    }
    if (!imm.pinH) return;
    imm.pinH = 0;
    root.classList.remove('kbpin');
    immLog('soltar alto');
    requestAnimationFrame(immPaint); // (si a la vez se bloquea, la portada ni se mueve)
  }
  function immPinCheck() {
    if (!imm.pinH || imm.paused) return;
    if (window.innerWidth !== imm.pinW || window.innerHeight >= imm.pinH - 8) immPin(false);
  }
  // cambia algo sin que las transiciones de la portada se animen (al entrar o salir del modo, al recalcular de golpe)
  function noTr(fn) {
    root.classList.add('notr');
    try { fn(); } finally {
      void root.offsetWidth;
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('notr')));
    }
  }
  // 2.1.5 — En el diagnóstico del 26 nov (2.1.4), tras cada bloqueo la página siguió deslizándose sola 50–350 px
  // (inercia del gesto que esconde la barra) y, si Tiger deslizaba otra vez en ese rato, la barra volvía (3 veces).
  // Lo más probable: mientras la página aún se mueve, Safari no deja cortar un gesto (ni touch-action ni preventDefault
  // en touchmove). 2.1.5–2.1.6 se probaron en el iPhone tres formas (selector «Sujetar la pantalla completa»); Tiger se quedó
  // con la A de la 2.1.6 (parar la inercia, immBrake) y la 2.1.7 la deja como la única, sin selector.
  const immCoast = () => performance.now() - imm.scT < 120; // ¿la página se ha movido hace nada?
  // 2.1.2 (solo con el diseño nuevo) — En el iPhone de Tiger (Safari 26.5) el alto visible SÍ cambia con la barra
  // (645 con la barra grande, 739 encogida), así que la app puede ver lo que ha pasado en vez de suponerlo:
  //   · mientras el dedo está en la pantalla no se toca nada; se decide al levantarlo y cuando el alto deja de moverse;
  //   · se bloquea si la página ha subido Y el alto ha crecido (la barra se ha encogido de verdad); si el gesto se
  //     queda corto y la barra no se mueve, sigue armado y el siguiente gesto vale;
  //   · se apunta, por ancho de pantalla, el alto con la barra encogida (`hi`). Con la barra así, ningún gesto rearma:
  //     solo se sale tocando la barra de Safari (el alto baja y se rearma solo);
  //   · `u0` es el alto útil más pequeño que se ha visto (barra grande): con él la portada no cambia de tamaño
  //     ni de sitio cuando la barra se mueve (ver layoutCards).
  // Mientras no se haya visto crecer el alto en ese teléfono (`hi` = 0) se sigue a ciegas, como antes. Lo apuntado
  // se borra al apagar y encender el ajuste.
  const immNew = () => !!prefs.ui2;
  function immRec() {
    const w = window.innerWidth;
    if (!imm.rec || imm.rec.w !== w) {
      const s = (LS.get('immH', {}) || {})[w] || {};
      imm.rec = { w, hi: +s.hi || 0, u0: +s.u0 || 0, dirty: false };
    }
    return imm.rec;
  }
  function immSave() {
    const r = imm.rec;
    if (!r || !r.dirty) return;
    r.dirty = false;
    const all = LS.get('immH', {}) || {};
    all[r.w] = { hi: r.hi, u0: r.u0 };
    LS.set('immH', all);
  }
  // ¿la barra está encogida del todo? (solo se sabe si ya se ha visto encogerse en este teléfono)
  const immFull = () => { const r = immRec(); return !!r.hi && window.innerHeight >= r.hi - 8; };
  function immSettleSoon() {
    clearTimeout(imm.setT);
    imm.setT = setTimeout(immSettle, 260);
  }
  // Con el alto quieto: ¿se ha escondido la barra?
  // 2.1.3: si ya se sabe el alto con la barra escondida y se ha llegado a él, se bloquea al momento, con el dedo en la
  // pantalla o no (en la 2.1.2 se esperaba a levantarlo, y si Safari no avisaba no se bloqueaba hasta el siguiente toque).
  // Lo demás (primera vez, barra a medias, gesto corto) se sigue decidiendo con el dedo levantado.
  function immSettle() {
    if (!imm.on || imm.paused || !imm.armed || !immNew()) return;
    const r = immRec();
    const ih = window.innerHeight;
    if (r.hi && ih >= r.hi - 8) {
      if (ih > r.hi) { r.hi = ih; r.dirty = true; immSave(); }
      imm.part = null;
      immLock();
      return;
    }
    if (imm.touch && performance.now() - imm.touchT < 6000) return; // a medio camino con el dedo puesto: se espera
    const grew = ih - (imm.ih0 || ih);
    // (la barra puede terminar de encogerse un poco después de que el gesto se diera por corto: vale durante 3 s)
    if (grew >= 24 && (imm.moved || performance.now() - imm.mvT < 3000)) {
      // la página ha subido y el alto ha crecido: la barra se ha encogido
      if (r.hi && ih < r.hi - 8) {
        // …pero menos que otras veces. Si se queda dos veces seguidas en el mismo alto, ese es el bueno
        // (Safari ha cambiado de barra); si no, sigue armado para que el siguiente gesto termine de esconderla.
        const same = imm.part && Math.abs(imm.part.h - ih) <= 4;
        imm.part = { h: ih, n: same ? imm.part.n + 1 : 1 };
        if (imm.part.n < 2) { imm.moved = false; imm.y0 = window.scrollY; imm.ih0 = ih; immLog('a medias'); return; }
        r.hi = ih; r.dirty = true;
      } else if (ih > r.hi) { r.hi = ih; r.dirty = true; }
      imm.part = null;
      immSave();
      immLock();
    } else if (immFull()) {
      immLock(); // ya estaba escondida (al volver a Safari, al girar…)
    } else if (imm.moved) {
      if (!r.hi) immLock(); // a ciegas, como antes: la página ha subido
      else { imm.moved = false; imm.y0 = window.scrollY; immLog('sigue'); } // gesto corto: la barra no se ha movido
    }
  }
  function immArm(why) {
    if (!imm.on || imm.paused) return;
    clearTimeout(imm.lockT);
    // de paso, volver al principio del recorrido si se está acabando (la barra está grande: no molesta)
    if (window.scrollY > 36000) window.scrollTo(0, 0);
    imm.y0 = window.scrollY;
    imm.h = 0;
    imm.moved = false;
    imm.ih0 = window.innerHeight;
    if (immNew()) immSettleSoon(); // por si la barra ya está escondida
    if (imm.armed) return;
    imm.armed = true;
    root.classList.add('imm-armed');
    clearTimeout(imm.brTm);
    imm.brWait = false;
    // 2.1.5: cuánto se ha movido la página desde el bloqueo (negativo = ha subido, que es lo que trae la barra)
    // y cuántos dedos se pararon por la inercia; 2.1.6: y cuántas veces se frenó
    const was = imm.qLog || imm.lockY ? { dy: Math.round(window.scrollY - imm.lockY), g: imm.guard, b: imm.brN, ms: Math.round(performance.now() - imm.lockAt) } : null;
    imm.qLog = false;
    clearTimeout(imm.qT);
    immLog('armar:' + why, immNew() ? was : null);
    if (immNew()) {
      // 2.1.6: la portada vuelve a su tamaño con la barra (si la barra vuelve, cuando haya vuelto de verdad)
      imm.holdBig = why === 'barra' && !!was;
      imm.holdT = performance.now();
      clearTimeout(imm.holdTm);
      immPaint();
      if (imm.holdBig) imm.holdTm = setTimeout(immPaint, 230);
    }
  }
  function immLock() {
    imm.h = 0; // la medida anterior ya no vale hasta volver a medir
    imm.armed = false;
    imm.moved = false;
    root.classList.remove('imm-armed');
    immLog('bloquear', immNew() ? { mv: immCoast(), f: imm.touch } : null);
    clearTimeout(imm.lockT);
    clearTimeout(imm.setT);
    // diseño nuevo: se bloquea con el alto ya quieto, así que la medida es la de ahora
    if (immNew()) {
      imm.h = window.innerHeight; imm.w = window.innerWidth; imm.sab = immSab();
      // 2.1.5: para el diagnóstico, hasta dónde sigue la página por su cuenta («quieta»)
      imm.lockY = window.scrollY; imm.lockAt = performance.now(); imm.guard = 0; imm.qLog = true; imm.brN = 0; imm.tlog = 0;
      imm.holdBig = false;
      clearTimeout(imm.holdTm);
      // 2.1.6: la portada crece sin re-maquetar (si ya se conocía el alto con la barra escondida al medirla)
      if (imm.geoHi !== immRec().hi) immGeoRefresh();
      else immPaint();
      // 2.1.6: parar la inercia ya; con el dedo aún en la pantalla, al levantarlo (immEnd)
      immBrake('bloqueo');
      return;
    }
    // cuando la barra termina de encogerse, apuntar cómo queda la pantalla para notar si vuelve a crecer
    imm.lockT = setTimeout(() => { imm.h = window.innerHeight; imm.w = window.innerWidth; imm.sab = immSab(); immLog('medido'); }, 700);
  }
  // ¿Ha vuelto a salir la barra? (la pantalla útil se encoge o crece el margen inferior)
  function immCheck() {
    if (imm.pinH) immPinCheck();
    if (imm.on && imm.armed && !imm.paused && immNew()) {
      // armado: apuntar el alto más pequeño desde que se armó y volver a mirar cuando deje de moverse
      if (window.innerHeight < imm.ih0) imm.ih0 = window.innerHeight;
      // 2.1.5 (A y B): con el alto de la barra escondida ya conocido, se bloquea en el mismo instante en que se llega
      // a él, sin esperar a que el alto se quede quieto (en la 2.1.3/2.1.4, 260 ms después: en ese rato el gesto pasaba)
      const r = immRec();
      if (r.hi && window.innerHeight >= r.hi - 8) { immSettle(); return; }
      immSettleSoon();
      if (imm.holdBig) immPaint(); // la barra vuelve: ¿ya del todo?
    }
    if (!imm.on || imm.armed || !imm.h) return;
    if (window.innerWidth !== imm.w) { immArm('giro'); return; }
    // 2.1.6: bloqueado unos px antes de que la barra termine: la medida es la más alta que se vea; y al terminar, el freno
    if (immNew() && window.innerHeight > imm.h) imm.h = window.innerHeight;
    if (imm.brWait && immNew()) { const r = immRec(); if (!r.hi || window.innerHeight >= r.hi - 2) immBrake('barra fuera'); }
    // (diseño nuevo: se nota antes, para que la portada grande no llegue a pisar los mandos mientras sube la barra)
    if (window.innerHeight < imm.h - (immNew() ? 10 : 24) || immSab() > imm.sab + 8) immArm('barra');
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
    imm.touch = e.touches.length;
    imm.touchT = performance.now();
    if (!imm.on || e.touches.length !== 1) return;
    const t = e.touches[0];
    const own = !!(e.target.closest && (e.target.closest('.feed') || e.target.closest('.controls')));
    immT = { x: t.clientX, y: t.clientY, own, sc: own ? null : immScroller(e), block: false, dec: false };
    // 2.1.6 (diagnóstico): los dedos de justo después de bloquear: ¿con la página aún moviéndose?
    if (immNew() && !imm.armed && imm.tlog < 3 && performance.now() - imm.lockAt < 3000) { imm.tlog++; immLog('dedo', { c: immCoast() ? 1 : 0, ms: Math.round(performance.now() - imm.lockAt) }); }
  };
  // 2.1.5 (A y B): recién bloqueado, la página todavía se desliza sola un instante. Un dedo que empieza en ese rato se
  // para ya al tocar (touchstart): después, Safari ya no deja cortar el gesto y lo que hace es arrastrar la página,
  // que es lo que devuelve la barra. Cuesta, como mucho, un toque perdido justo después de esconder la barra.
  const immGuard = (e) => {
    if (!imm.on || imm.armed || imm.paused || !immNew() || e.touches.length !== 1 || !immCoast()) return;
    imm.guard++;
    if (e.cancelable) e.preventDefault();
    if (imm.guard <= 3) immLog('inercia', { n: imm.guard, c: e.cancelable });
  };
  const immMove = (e) => {
    const q = immT;
    // 2.1.5: ¿llegan movimientos de dedo que ya no se pueden cortar con la barra escondida? (diagnóstico; 2.1.6: solo en el
    // feed y los mandos y en los 3 s de después de bloquear, que las listas y Ajustes se desplazan solos y ensuciaban la cuenta)
    if (imm.on && !imm.armed && !e.cancelable && immNew() && q && q.own && performance.now() - imm.lockAt < 3000) imm.nc++;
    if (!q || q.own || !imm.on) return; // feed y controles: lo decide setupGestures
    if (q.block) { if (e.cancelable) e.preventDefault(); return; }
    if (q.dec) return;
    const t = e.touches[0];
    const dx = t.clientX - q.x;
    const dy = t.clientY - q.y;
    if (!dx && !dy) return;
    q.dec = true;
    const vert = Math.abs(dy) >= Math.abs(dx);
    // 2.1.3 (diseño nuevo): con la barra escondida del todo, nada vertical llega a la página, ni hacia arriba
    if (!q.sc && vert && (dy > 0 || (immNew() && !imm.armed && immFull()))) { q.block = true; if (e.cancelable) e.preventDefault(); }
  };
  const immEnd = (e) => {
    imm.touch = e.touches.length;
    if (!imm.touch && imm.on && imm.armed && immNew()) immSettleSoon();
    // 2.1.6: bloqueado con el dedo puesto: al levantarlo empieza la inercia, y se para
    if (!imm.touch && imm.on && !imm.armed && immNew() && performance.now() - imm.lockAt < 3000) {
      if (imm.tlog < 4) { imm.tlog++; immLog('suelta', { c: immCoast() ? 1 : 0, ms: Math.round(performance.now() - imm.lockAt) }); }
      imm.brN = 0;
      immBrake('soltar');
    }
  };
  // Con el teclado abierto Safari mueve la página a su aire: se deja fija hasta que se cierra.
  function immPause(p) {
    if (!imm.on || imm.paused === p) return;
    // 2.1.8: ¿se abre el teclado con la barra escondida? (se mira antes de cambiar nada)
    if (p) imm.kbFull = immNew() && !imm.armed && immFull();
    imm.paused = p;
    document.documentElement.classList.toggle('sx-imm', !p);
    immLog(p ? 'teclado' : 'sin teclado', p && imm.kbFull ? { full: 1 } : null);
    if (p) {
      clearTimeout(imm.lockT); clearTimeout(imm.setT); clearTimeout(imm.brTm); imm.brWait = false; imm.armed = false; root.classList.remove('imm-armed'); imm.h = 0;
      if (imm.kbFull) immPin(true);
      immPaint();
      return;
    }
    immArm('teclado');
    // con el alto fijado: se suelta en cuanto vuelva a ser el de antes, o a los 700 ms si la barra ha vuelto de verdad
    if (imm.pinH) {
      immPinCheck();
      if (imm.pinH) imm.pinT = setTimeout(() => immPin(false), 700);
    }
  }
  // 2.1.2 — El teclado ya no está, pero puede que nadie se haya enterado (ver buildShell): la página a su sitio y el
  // modo de la barra otra vez en marcha. Se llama al tocar, al cambiar el alto visible y al cambiar de pantalla.
  function kbSync() {
    if (!isOpen || typing()) return;
    if ((!imm.on || imm.paused) && (window.scrollY || window.scrollX)) window.scrollTo(0, 0);
    if (imm.paused) immPause(false);
  }
  function immApply() {
    if (!root) return;
    const want = isOpen && !!prefs.immersive && TOUCH;
    document.documentElement.classList.toggle('sx-imm', want && !imm.paused);
    root.classList.toggle('imm', want);
    if (want === imm.on) return;
    imm.paused = false;
    imm.on = want;
    requestAnimationFrame(layoutCards); // la portada se mide distinto con este modo (diseño nuevo)
    if (want) {
      imm.t0 = performance.now();
      imm.log = [];
      imm.armed = false;
      imm.h = 0;
      imm.touch = 0;
      imm.part = null;
      imm.guard = 0;
      imm.nc = 0;
      imm.lockY = 0;
      imm.lockAt = 0;
      imm.brakes = 0;
      imm.holdBig = false;
      app.addEventListener('touchstart', immGuard, { capture: true, passive: false });
      app.addEventListener('touchstart', immStart, { capture: true, passive: true });
      app.addEventListener('touchmove', immMove, { capture: true, passive: false });
      app.addEventListener('touchend', immEnd, { capture: true, passive: true });
      app.addEventListener('touchcancel', immEnd, { capture: true, passive: true });
      immArm('abrir');
      const k = LS.get('immHint', 0);
      if (k < 3) { LS.set('immHint', k + 1); setTimeout(() => { if (imm.on && imm.armed) toast('Desliza hacia arriba para esconder la barra de Safari'); }, 1500); }
    } else {
      clearTimeout(imm.lockT);
      clearTimeout(imm.setT);
      clearTimeout(imm.brTm);
      clearTimeout(imm.holdTm);
      imm.brWait = false;
      imm.holdBig = false;
      imm.armed = false;
      root.classList.remove('imm-armed');
      immPin(false);
      noTr(() => immPaint());
      app.removeEventListener('touchstart', immGuard, { capture: true });
      app.removeEventListener('touchstart', immStart, { capture: true });
      app.removeEventListener('touchmove', immMove, { capture: true });
      app.removeEventListener('touchend', immEnd, { capture: true });
      app.removeEventListener('touchcancel', immEnd, { capture: true });
      window.scrollTo(0, 0);
    }
  }
  function setupImmersive() {
    window.addEventListener('scroll', () => {
      if (!imm.on || imm.paused) return;
      imm.scT = performance.now();
      const y = window.scrollY;
      // 2.1.6: bloqueado, sin dedo en la pantalla y la página moviéndose sola = inercia: se para (ver immBrake)
      if (!imm.armed && !imm.touch && immNew() && imm.brN < 3 && imm.scT - imm.lockAt < 4000 && imm.scT - imm.brT > 200) immBrake('inercia');
      // 2.1.5 (diagnóstico): tras bloquear, cuándo y dónde deja de moverse la página por su cuenta
      if (!imm.armed && imm.qLog) { clearTimeout(imm.qT); imm.qT = setTimeout(() => { if (imm.qLog && !imm.armed) { imm.qLog = false; immLog('quieta', { ms: Math.round(imm.scT - imm.lockAt), b: imm.brN }); } }, 160); }
      if (y < imm.y0) imm.y0 = y;
      else if (imm.armed && y - imm.y0 >= 24) {
        if (!immNew()) immLock();
        // diseño nuevo: aquí solo se apunta que la página ha subido; se decide con el dedo levantado (immSettle)
        else if (!imm.moved) { imm.moved = true; imm.mvT = performance.now(); immSettleSoon(); }
      }
    }, { passive: true });
    window.addEventListener('resize', immCheck);
    window.addEventListener('orientationchange', () => immArm('giro'));
    // 2.1.6: si al volver la barra sigue escondida, se queda bloqueado (antes se rearmaba y se volvía a bloquear: la
    // portada encogía y crecía cada vez que se volvía a Safari, p. ej. al hacer una captura)
    const back = () => {
      if (document.hidden) return;
      if (imm.on && immNew() && !imm.armed && !imm.paused && immFull() && window.innerWidth === imm.w) { imm.h = Math.max(imm.h, window.innerHeight); immLog('volver', { sigue: 1 }); return; }
      immArm('volver');
    };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('pageshow', back);
    try { if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { immCheck(); kbSync(); }); } catch (e) {}
    try {
      const ro = new ResizeObserver(immCheck);
      ro.observe(app);
      ro.observe($('.sap', root));
    } catch (e) {}
  }
  function switchView(v) {
    listProg();
    view = v === 'list' ? 'list' : 'feed';
    app.dataset.view = view;
    $$('.seg button', root).forEach((b) => b.classList.toggle('on', b.dataset.v === view));
    SS.set('view', view);
    paintTabs();
  }
  // Diseño nuevo: la barra de pestañas. Desde la 2.1, Buscar y Ajustes son pantallas propias.
  function tabGo(t) {
    if (t === 'feed' || t === 'list') {
      const was = overOn() || !!$('.sheet.on', root);
      closeSheets();
      closeSearch();
      pgClose();
      // «Lista» nunca enseña una búsqueda (eso es la pestaña Buscar): se vuelve a la lista de debajo
      if (t === 'list' && cur && cur.kind === 'search') leaveSearch();
      // Diseño 2 con la barra «Ajustes»: Feed es la pestaña de la música (feed o lista). Si venías de otra pantalla,
      // vuelves a la vista en la que estabas; si ya estabas en ella, te lleva al feed.
      else if (ui3() && !tabsB() && t === 'feed') { if (!was && view !== 'feed') setView('feed'); }
      else if (view !== t) setView(t);
    } else if (t === 'search') {
      closeSheets();
      pgClose();
      searchTab();
    } else if (t === 'settings') {
      settingsGo();
    } else if (t === 'home') {
      homeGo();
    } else if (t === 'chat') {
      if (ui3()) { closeSheets(); closeSearch(); pgOpen('chat', null, { root: true }); } else toast('El chat llega en una próxima versión');
    }
    paintTabs();
  }
  function paintTabs() {
    if (!root) return;
    const st = $('.s-settings', root);
    let on;
    if (ui3()) {
      // Diseño 2: Home y Chat son pantallas propias; Ajustes es su pestaña (o una capa de Home, con la barra «Lista»).
      // Con la barra «Ajustes», Feed y Lista son la misma pestaña (Feed) y se cambia de vista arriba a la derecha.
      const p0 = pgStack[0] && pgStack[0].id;
      on = p0 === 'home' || p0 === 'chat' ? p0 : p0 ? (tabsB() ? 'home' : 'settings')
        : srchEl && srchEl.classList.contains('on') ? 'search'
          : cur && cur.kind === 'search' && view === 'list' ? 'search' : tabsB() ? view : 'feed';
      $$('.vseg button', root).forEach((b) => b.classList.toggle('on', b.dataset.v === view));
    } else {
      on = pgOn() || (st && st.classList.contains('on')) ? 'settings'
        : srchEl && srchEl.classList.contains('on') ? 'search'
          : cur && cur.kind === 'search' && view === 'list' ? 'search' : view;
    }
    $$('.tabs button', root).forEach((b) => b.classList.toggle('on', b.dataset.t === on));
    saveLastNav();
  }
  // 2.2 · Diseño 2: botones de la barra de pestañas según el ajuste «Barra de pestañas»
  const TABS_UI2 = [['feed', 'feed', 'Feed'], ['list', 'rows', 'Lista'], ['search', 'search', 'Buscar'], ['chat', 'chat', 'Chat'], ['settings', 'sliders', 'Ajustes']];
  const tabSet = () => (!ui3() ? TABS_UI2
    : tabsB() ? [['home', 'home', 'Home'], ['feed', 'feed2', 'Feed'], ['list', 'list2', 'Lista'], ['search', 'search2', 'Buscar'], ['chat', 'chat2', 'Chat']]
      : [['home', 'home', 'Home'], ['feed', 'feed2', 'Feed'], ['search', 'search2', 'Buscar'], ['chat', 'chat2', 'Chat'], ['settings', 'set2', 'Ajustes']]);
  let tabsKey = 'feed,list,search,chat,settings'; // la barra que pinta buildShell (la del diseño nuevo)
  function renderTabs() {
    const box = root && $('.tabs', root);
    if (!box) return;
    const set = tabSet();
    const k = set.map((x) => x[0]).join() + (ui3() ? '·3' : '');
    if (k === tabsKey) return;
    tabsKey = k;
    box.innerHTML = set.map(([t, ic, n]) => `<button data-t="${t}">${ui3() ? '<span class="tpi">' + i(ic) + '</span>' : i(ic)}<span>${n}</span></button>`).join('');
  }
  let ui3Was = false;
  function applyUi3(full) {
    if (!root) return;
    const on = ui3();
    const changed = on !== ui3Was;
    ui3Was = on;
    root.classList.toggle('ui3', on);
    root.classList.toggle('tabsb', tabsB());
    renderTabs();
    paintOver();
    if (!full) return;
    // sin Diseño 2 no hay Home ni Chat: lo que hubiera encima (Ajustes…) se queda; si no, se cierra
    if (!on && pgStack.length && /^(home|chat)$/.test(pgStack[0].id)) { if (pgStack.length > 1) pgStack.shift(); else pgClose(); }
    paintChrome();
    paintTabs();
    // filas y tarjetas llevan piezas propias del Diseño 2 (tono de color, NUEVA…): repintarlas al ponerlo o quitarlo
    if (cur && changed) {
      listDirty = true;
      if (view === 'list' && isOpen) renderList(true);
      filled.forEach((c) => { const t = byId.get(c.dataset.id); if (t) fillCard(c, t); });
      requestAnimationFrame(() => { layoutCards(); if (view === 'feed') feedJump(activeIdx); });
    }
  }
  function homeGo() {
    closeSheets();
    closeSearch();
    pgOpen('home', null, { root: true });
  }
  function applyUi() {
    if (!root) return;
    root.classList.toggle('ui2', !!prefs.ui2);
    if (!prefs.ui2 && prefs.ui3) { prefs.ui3 = false; savePrefs(); }
    applyUi3(true);
    if (!prefs.ui2) pgClose();
    paintChrome();
    paintTabs();
    // saltos, tono, lista compacta y letra grande van con el diseño nuevo: se ponen o se quitan con él
    paintSkips();
    applyLook();
  }
  // Ajustes: con el diseño nuevo, la pantalla por capas; con el de siempre, la hoja de siempre.
  function settingsGo() {
    closeSearch();
    closeSheets();
    if (prefs.ui2) pgOpen('settings', null, { root: true });
    else openSettings();
  }
  // Filtros de la lista que se ve (el resumen de arriba de la lista): segunda capa de Ajustes, para que ‹ vuelva a Ajustes.
  function filtersGo() {
    if (!prefs.ui2) { openSettings(); return; }
    pgOpen('settings', null, { root: true });
    pgOpen('filters', 'cur');
  }
  // Pestaña Buscar: sin búsqueda hecha, el buscador; con ella, sus resultados (se conservan al pasar por otras pestañas).
  function searchTab() {
    if (srchEl.classList.contains('on')) return; // (2.1.8: ya no saca el teclado; se toca el campo)
    if (cur && cur.kind === 'search') {
      if (view !== 'list') setView('list');
      else openSearch(cur.query);
      return;
    }
    const s = searchKeep;
    if (!s || s.error) { openSearch(); return; }
    s.view = 'list';
    const d = stack.indexOf(s);
    if (d >= 0) popTo(d); // sigue en el camino de vuelta (se entró en un artista desde los resultados)
    else openSource(s, { view: 'list', src: s });
  }
  // Salir de la búsqueda a la lista que hay debajo (o, si la página arrancó en una búsqueda, a la de inicio).
  function leaveSearch() {
    let d = stack.length - 1;
    while (d >= 0 && stack[d].kind === 'search') d--;
    if (d < 0) { openSource(sectionDesc(prefs.startSection || 'avail'), { root: true, view: 'list' }); return; }
    stack[d].view = 'list';
    popTo(d);
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
    listProg();
    if (listDirty) renderList();
    const r = current && listRowById(current.id);
    const playing = current && (!audio.paused || audio.currentTime > 0);
    if (r && playing) listEl.scrollTop = Math.max(0, r.offsetTop - (listEl.clientHeight - r.offsetHeight) / 2);
    else if (fresh) listEl.scrollTop = 0;
  }
  // Desde el mini reproductor: enseñar en el feed lo que está sonando.
  function showCurrentInFeed() {
    // desde el mini reproductor que se ve encima de Ajustes o del buscador (diseño nuevo): se sale de ahí
    pgClose();
    closeSearch();
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
        if (history.state && history.state.sx === stack.length - 1) { navJump = true; history.go(d - (stack.length - 1)); return; }
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
      saveLastNav();
    }, 350);
  }

  /* ───────────── gestos ───────────── */
  // Izquierda/derecha = siguiente/anterior (scroll nativo del feed). Abajo = ir a la lista.
  function setupGestures() {
    const EDGE = 20;
    let g = null;
    // 2.1.1: con el diseño nuevo, deslizar hacia abajo en el feed ya no lleva a la lista (para eso está su pestaña):
    // se confundía con el gesto de la barra de Safari. Con el diseño de siempre sigue como estaba.
    const downToList = () => !prefs.ui2;
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
      if (g && g.stopY && e.cancelable) e.preventDefault();
      if (!g || g.mode === 'n') return;
      const t = e.touches[0];
      g.dx = t.clientX - g.x;
      g.dy = t.clientY - g.y;
      if (!g.mode) {
        const ax = Math.abs(g.dx);
        const ay = Math.abs(g.dy);
        // modo inmersivo: un dedo que baja movería la página hacia abajo y Safari volvería a sacar su barra
        if (imm.on && (imm.armed || !g.inFeed) && g.dy > 0 && ay >= ax) { g.manual = true; if (e.cancelable) e.preventDefault(); }
        // 2.1.3 (diseño nuevo): con el feed bloqueado, un deslizamiento vertical no llega a la página desde los primeros
        // píxeles (antes se cortaba a los 10 y solo hacia abajo; con la barra escondida del todo, también hacia arriba).
        // A los lados sigue siendo el scroll del feed.
        if (immNew() && imm.on && !imm.armed && ay >= 3 && ay > ax && (g.dy > 0 || immFull())) { g.stopY = true; if (e.cancelable) e.preventDefault(); }
        if (ax < 10 && ay < 10) return;
        if (ay > ax * 1.3) g.mode = g.dy > 0 ? 'y' : 'n';
        else g.mode = g.manual ? 'x' : 'n'; // horizontal dentro del feed: lo hace el scroll nativo
        // hacia arriba con el feed bloqueado: por si la barra ha vuelto sin que se note, el siguiente gesto ya la esconde
        // (2.1.2, diseño nuevo: si se sabe que la barra está escondida del todo, no: ese era el fallo del bloqueo)
        if (g.mode === 'n' && ay > ax * 1.3 && imm.on && !imm.armed && g.inFeed && !(immNew() && immFull())) immArm('gesto');
        if (g.mode === 'n') return;
      }
      if (e.cancelable) e.preventDefault();
      // hacia abajo: en cuanto el dedo baja lo suficiente, a la lista (sin animaciones)
      if (g.mode === 'y' && g.dy > 64 && downToList()) { g.mode = 'done'; setView('list'); }
    };
    const end = (e) => {
      const q = g;
      g = null;
      if (!q || !q.mode || q.mode === 'n') return;
      if (e.cancelable) e.preventDefault(); // que no cuente como toque en un botón
      if (q.mode === 'y') { if (e.type === 'touchend' && q.dy > 36 && downToList()) setView('list'); }
      // a los lados: en el borde del feed pasa de canción. En los mandos, con el diseño nuevo, ya no: quien intentaba
      // mover la barra de avance y empezaba un poco fuera de ella cambiaba de canción sin querer (2.1.3)
      else if (q.mode === 'x' && e.type === 'touchend' && Math.abs(q.dx) > 45 && (q.inFeed || !prefs.ui2)) step(q.dx < 0 ? 1 : -1, false);
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
      // en la barra de avance el dedo arrastra por la canción: ahí no cuenta como gesto de siguiente / anterior
      if (e.target.closest && e.target.closest('.mseek')) { m = null; return; }
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
      web: '', tries: null, filtersOn: '', bounced: false, needLogin: false,
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
    if (s.kind === 'search') searchKeep = s;
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
      listProg();
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
    if (ui3()) folCommit();
  }
  function paintChrome() {
    if (!root) return;
    const deep = stack.length > 1;
    const nav = $('.bnav', root);
    nav.innerHTML = i(deep ? 'chev' : 'menu');
    nav.setAttribute('aria-label', deep ? 'Atrás' : 'Secciones');
    app.classList.toggle('deep', deep);
    // diseño nuevo: en los resultados de una búsqueda, arriba va el campo con lo buscado (pestaña Buscar)
    app.classList.toggle('is-search', !!cur && cur.kind === 'search');
    $('.sqb span', root).textContent = cur && cur.kind === 'search' ? cur.query || cur.title : '';
    $('.srcp span', root).textContent = cur ? (kindName(cur) && !ui3() ? kindName(cur) + ' · ' : '') + cur.title : 'Soundeo';
    if (ui3()) {
      const SIC = { avail: 'dl', all: 'feed2', upcoming: 'calendar', top100: 'trophy', followed: 'users', favs: 'star', downloads: 'check', votes: 'heart' };
      const KIC = { artist: 'user', label: 'tag', release: 'disc', search: 'search2', genre: 'note', similar: 'spark' };
      const k = cur ? (cur.kind === 'section' || cur.key === 'votes' ? SIC[cur.key] : KIC[cur.kind]) : null;
      $('.srcp .sic', root).innerHTML = ICON[k || 'list2'];
      $('.srcp .srs', root).textContent = !cur ? '' : cur.canFilter ? describeFilters(cur.filters) : cur.key === 'followed' ? 'Sin filtros' : kindName(cur) || (cur.key === 'votes' ? 'Tus votos' : '');
      $('.srcp', root).classList.toggle('chg', !!(cur && cur.canFilter && cur.filters && comboKey(cur.filters) !== comboKey(defFilters)));
    }
    // en el feed, una etiqueta con dónde estás (salvo en la sección de siempre)
    const show = !!cur && (deep || cur.key !== startListKey() || cur.kind !== 'section');
    app.classList.toggle('has-ctx', show);
    $('.ct', ctxEl).textContent = cur ? (kindName(cur) ? kindName(cur) + ' · ' : '') + cur.title : '';
    $('.cs', ctxEl).textContent = '';
    paintTabs(); // la pestaña marcada depende de si lo que se ve es una búsqueda
  }
  const kindName = (s) => ({ artist: 'Artista', label: 'Sello', release: 'Release', search: 'Búsqueda', genre: 'Género', similar: 'También descargan' }[s.kind] || '');
  const sameUrl = (a, b) => { try { const x = new URL(a, location.href); const y = new URL(b, location.href); return x.pathname === y.pathname && normFilters(filtersFromUrl(x.href)) === normFilters(filtersFromUrl(y.href)) && (x.searchParams.get('q') || '') === (y.searchParams.get('q') || '') && (x.searchParams.get('page') || '1') === (y.searchParams.get('page') || '1'); } catch (e) { return false; } };
  function openSource(d, opts) {
    opts = opts || {};
    closeSheets();
    closeSearch();
    pgClose();
    if (cur && !opts.root && !opts.replace && cur.url && sameUrl(cur.url, d.url)) {
      if (opts.view && opts.view !== view) setView(opts.view);
      return cur;
    }
    keepQueue();
    stash();
    // la lista con la que arrancó la página (o la de lo que está sonando) ya está cargada: no hace falta pedirla otra vez
    const known = opts.root ? [liveSrc, queue && queue.stack.length === 1 ? queue.src : null].find((x) => x && x.loaded && !x.error && x.kind === d.kind && sameUrl(x.url, d.url)) : null;
    // `opts.src`: una fuente que ya se tenía (la última búsqueda), tal como se dejó
    let s = opts.src || known || mkSrc(d);
    if (s !== opts.src && s !== known && !opts.resume) keepReset(s); // lista abierta de nuevo: visita nueva (2.1.9)
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
      if (history.state && history.state.sx === stack.length - 1) {
        const want = stack.length - 2;
        backWant = want;
        setTimeout(() => { if (backWant === want) backWant = null; }, 1500);
        history.back();
        return;
      }
    } catch (e) {}
    popTo(stack.length - 2);
  }
  function popTo(depth) {
    if (depth < 0 || depth >= stack.length - 1) return;
    closeSheets();
    closeSearch();
    pgClose();
    keepQueue();
    stash();
    stack.length = depth + 1;
    const s = stack[depth];
    let v = s.view;
    // 2.1.3 (diseño nuevo): volver a una lista no cambia lo que suena. Si en su feed se vería otra canción (en el feed
    // suena lo que se ve), se abre en vista lista.
    if (prefs.ui2 && v === 'feed' && current && s.at !== current.id) v = 'list';
    if (v) switchView(v);
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
    const again = (r) => fetchDoc(plain).then((r2) => { s.url = plain; return r2; }, (e) => { if (r) return r; throw e; });
    return first.then((r) => (parseTracks(r.doc, '', s.url).length ? r : again(r)), () => again(null));
  }
  function ensureLoaded(s) {
    if (s.loaded) return Promise.resolve(s);
    if (s.loading) return s.loading;
    s.error = '';
    s.loading = (s.kind === 'similar' ? fetchSimilar(s) : fetchSource(s))
      .then(({ doc, finalUrl }) => { applyDoc(s, doc, finalUrl); s.loaded = true; sessionCheck(doc); })
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
    // ¿Soundeo ha contestado con otra página? En las de la cuenta (seguidos, favoritos, descargas) eso es que no hay sesión.
    let rp = '';
    let fp = '';
    try { rp = new URL(s.url, location.href).pathname; fp = new URL(finalUrl, location.href).pathname; } catch (e) {}
    const account = /^\/account\//.test(rp);
    s.bounced = !!(rp && fp && fp !== rp && (account || !info.tracks.length));
    s.needLogin = s.bounced && (account || /log(on|in)|sign/i.test(fp) || !$('#top-menu-logout, a[href*="/account/logout"]', doc));
    if (s.bounced && account) info.tracks = [];
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
    if (info.title && s.key !== 'votes' && /^(artist|label|release|page)$/.test(s.kind)) s.title = info.title;
    s.mode = listModeFor(s.tracks);
    s.hidden = s.hide ? hiddenFor(s.tracks, s) : new Set();
    s.forced = new Set();
    if (s.at) s.forced.add(s.at);
    if (ui3() && s.key === 'followed' && s.tracks.length) folOpened(s); // 2.2: lo nuevo desde la última vez
    s.probe = null;
    if (!info.tracks.length) {
      // sin tracks: guardar cómo es la página (para el diagnóstico) y avisar si Soundeo ha mandado a otro sitio
      s.probe = pageShape(doc);
      if (s.needLogin) s.msg = 'En esta pestaña no hay sesión de Soundeo iniciada.';
      else if (s.bounced) s.msg = s.msg || 'Soundeo ha redirigido a ' + fp;
    }
  }
  // Volver a pedir una fuente (tras iniciar sesión, al reintentar…).
  function reloadSource(s) {
    if (!s || s.loading || s.live) return;
    s.loaded = false;
    s.error = '';
    s.msg = '';
    s.bounced = false;
    s.needLogin = false;
    ensureLoaded(s);
    if (s === cur) adopt(s);
  }
  // La página que cargó Safari no tenía sesión, pero Soundeo ya contesta con ella (se ha iniciado después: en otra
  // pestaña, o se ha vuelto atrás a esta página). Se recarga una vez para que todo salga con la sesión: cabecera,
  // favoritos, escuchadas. Al recargar se vuelve a la misma lista.
  function sessionCheck(doc) {
    try {
      if (!doc || isLoggedIn() || !$('#top-menu-logout, a[href*="/account/logout"]', doc)) return;
      if (Date.now() - SS.get('relog', 0) < 60000) return;
      SS.set('relog', Date.now());
      saveNav();
      location.reload();
    } catch (e) {}
  }
  // Ir a iniciar sesión en la web. Al terminar, la app vuelve sola a donde se estaba.
  function goLogin() {
    SS.set('wantLogin', Date.now());
    SS.set('navOnce', Date.now());
    saveNav();
    const a = $('#top-menu-login a, a[href*="/account/logon"], a[href*="/account/login"], a[href*="/login"]');
    let to = location.origin + '/';
    try { if (a && a.getAttribute('href') && new URL(a.href).origin === location.origin) to = a.href; } catch (e) {}
    location.href = to;
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
    if (stack.length === 1 && cur && cur.key === key && cur.kind === 'section' && !cur.error) {
      if (cur.bounced || cur.needLogin) { closeSheets(); reloadSource(cur); return; }
      toast('Ya estás en ' + sectionByKey(key).name);
      return;
    }
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
    if (ui3()) { openMenu3(); return; }
    const here = stack.length === 1 && cur && cur.kind === 'section' ? cur.key : '';
    const opts = SECTIONS.map((sec) => ({ label: sec.name, hint: sec.hint, icon: sec.icon, small: here === sec.key ? '●' : '', fn: () => openSection(sec.key) }));
    opts.push({ label: 'Buscar', hint: 'Como el buscador de la web', icon: 'search', fn: () => openSearch() });
    actionSheet('Secciones', '', '', opts);
  }

  // 2.2 · Diseño 2: «Listas», con su color cada una, la marca en la que estás, lo nuevo de Seguidos y los filtros arriba
  function openMenu3() {
    const here = stack.length === 1 && cur ? (cur.kind === 'section' || cur.key === 'votes' ? cur.key : '') : '';
    const IC = { avail: ['dl', 200], all: ['feed2', 230], upcoming: ['calendar', 160], top100: ['trophy', 45], followed: ['users', 280], favs: ['star', 30], downloads: ['check', 340] };
    const fc = folCache || LS.get('folCache', null);
    const nf = fc && Array.isArray(fc.tracks) ? folNewOf(fc.tracks, folSeen()).length : 0;
    const opts = [];
    if (cur && cur.canFilter) opts.push({ label: 'Filtros de esta lista', hint: describeFilters(cur.filters), icon: 'funnel', hue: 20, cls: 'ofil', fn: () => filtersGo() });
    SECTIONS.forEach((sec) => {
      const ic = IC[sec.key] || [sec.icon, 220];
      opts.push({ label: sec.name, hint: sec.hint, icon: ic[0], hue: ic[1], on: here === sec.key, badge: sec.key === 'followed' && nf ? nf + (nf === 1 ? ' nueva' : ' nuevas') : '', fn: () => openSection(sec.key) });
    });
    opts.push({ label: 'Mis me gusta', hint: 'Los tracks que has votado', icon: 'heart', hue: 345, on: here === 'votes', fn: openVotes });
    actionSheet('Listas', '', '', opts, 'lists');
  }
  function openVotes() {
    if (stack.length === 1 && cur && cur.key === 'votes' && !cur.error && !cur.needLogin) { toast('Ya estás en Mis me gusta'); return; }
    openSource({ kind: 'page', key: 'votes', title: 'Mis me gusta', url: location.origin + '/account/votes' }, { root: true, view: 'list' });
  }

  /* ───────────── buscador ───────────── */
  function openSearch(prefill, focus) {
    closeSheets();
    pgClose();
    srchEl.classList.add('on');
    paintOver();
    paintTabs();
    const inp = $('.sq', srchEl);
    inp.value = typeof prefill === 'string' ? prefill : cur && cur.kind === 'search' ? cur.query : '';
    paintRecent();
    // 2.1.8 (diseño nuevo): el teclado sale al tocar el campo, no al entrar en el buscador desde la pestaña o un menú
    // (lo pidió Tiger). Al tocar la barra de búsqueda de unos resultados (.sqb), que es el propio campo, sí.
    if (focus || !prefs.ui2) { try { inp.focus(); inp.select(); } catch (e) {} }
  }
  function closeSearch() {
    if (!srchEl || !srchEl.classList.contains('on')) return;
    srchEl.classList.remove('on');
    paintOver();
    paintTabs();
    paintProgress();
    try { $('.sq', srchEl).blur(); } catch (e) {}
  }
  function paintRecent() {
    const body = $('.sbody', srchEl);
    const rec = LS.get('searches', []);
    body.textContent = '';
    if (ui3()) { paintRecent3(body, rec); return; }
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
  // 2.2 · Diseño 2: recientes (cada una se puede quitar) y «Explorar géneros», con los tuyos primero
  function paintRecent3(body, rec) {
    if (rec.length) {
      body.appendChild(el('<div class="sec">Recientes <a href="#" class="rclr">Borrar</a></div>'));
      rec.slice(0, 8).forEach((q) => {
        const r = el(`<div class="srec"><button class="opt srq">${i('clock')}<span>${esc(q)}</span></button><button class="rb srx" aria-label="Quitar ${esc(q)}">${i('xs')}</button></div>`);
        $('.srq', r).addEventListener('click', () => doSearch(q));
        $('.srx', r).addEventListener('click', () => { LS.set('searches', LS.get('searches', []).filter((x) => x !== q)); paintRecent(); });
        body.appendChild(r);
      });
      $('.rclr', body).addEventListener('click', (e) => { e.preventDefault(); LS.set('searches', []); paintRecent(); });
    } else body.appendChild(el('<div class="note snote">Busca por artista, título o sello. Los resultados salen como lista de tracks.</div>'));
    const names = new Map(genreOptions().map((x) => [x.id, x.name]));
    const mine = (defFilters.genres || []).map(String);
    const pick = mine.concat(['12', '5', '11', '14', '81', '86', '15', '1', '2', '7', '6', '90'])
      .filter((id, k, a) => a.indexOf(id) === k && names.has(id)).slice(0, 10);
    if (!pick.length) return;
    body.appendChild(el('<div class="sec">Explorar géneros</div>'));
    const g = el('<div class="sgen"></div>');
    pick.forEach((id) => {
      const nm = names.get(id);
      const b = el(`<button class="sgt" style="--ih:${genreHue(nm)}">${esc(nm)}</button>`);
      b.addEventListener('click', () => { closeSearch(); openSource(genreDesc(id), { view: 'list' }); });
      g.appendChild(b);
    });
    body.appendChild(g);
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
          <div class="top"><div class="cvw"${small}><img alt="" decoding="async"><div class="pind">${i('play')}</div><div class="eq"><span></span><span></span><span></span><span></span></div></div><div class="opens">${musicLinksHtml(t)}</div></div>
          <div class="info">
            <div class="itext">
              <div class="eyebrow"><span class="ix">${esc(counterText(t))}</span>${where ? ' · <b>' + where + '</b>' : ''}</div>
              <div class="ttl">${esc(t.name)}</div>
              <div class="mix">${esc(t.mix)}</div>
              <div class="art">${esc(t.artist)}</div>
              <div class="rel">${t.release ? '<span class="relb">' + esc(t.release) + '</span>' : ''}${t.release && t.label ? ' · ' : ''}${t.label ? '<span class="lbl">' + esc(t.label) + '</span>' : ''}</div>
              <div class="chips"><span class="chip key"${ui3() && meta && meta.k && keyHue(meta.k) != null ? ` style="--kh:${keyHue(meta.k)}"` : ''}>${metaChipKey(meta)}</span><span class="chip bpmc">${metaChipBpm(meta)}</span>${t.duration ? `<span class="chip mut">${esc(t.duration)}</span>` : ''}${t.explicit ? '<span class="chip e">E</span>' : ''}${t.date ? `<span class="chip mut">${esc(t.date)}</span>` : ''}</div>
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
    if (!m || !m.k) return '';
    const c = camelot(m.k);
    const kf = pref2('keyFmt');
    if (kf === 'cam' && c) return '<b>' + esc(c) + '</b>';
    if (kf === 'mus') return esc(m.k);
    return '<b>' + esc(c) + '</b>' + esc(m.k);
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
    // Diseño nuevo + barra de Safari: la portada tiene dos tamaños. Con la barra a la vista (o moviéndose: armado) se mide
    // con la barra grande y no se mueve (2.1.2); con la barra escondida (bloqueado), con todo el alto: llena el hueco (2.1.3).
    // 2.1.6: la tarjeta se maqueta SIEMPRE con el tamaño grande (B) y el pequeño (S) es una transformación (.cvsm, ver CSS):
    // cambiar de uno a otro no re-maqueta nada. `upS` = lo que ha crecido ahora el alto útil respecto al más pequeño visto
    // (barra a la vista); `upB` = lo que le falta para el de la barra escondida (si ya se conoce en este teléfono).
    const fix = immNew() && imm.on && !land;
    if (root.classList.contains('cvfix') !== fix) noTr(() => { root.classList.toggle('cvfix', fix); immPaint(); });
    let upS = 0;
    let upB = 0;
    if (fix) {
      const U = app.clientHeight - immSab();
      const r = immRec();
      if (U > 0 && !imm.paused && !typing() && (!r.u0 || U < r.u0)) { r.u0 = U; r.dirty = true; immSave(); }
      upS = Math.max(0, U - (r.u0 || U));
      upB = r.hi ? Math.max(0, r.hi - immSab() - U) : 0; // (2.1.8: con el alto de la app, que el teclado puede dejar fijado)
      imm.geoHi = r.hi;
    }
    if (land) {
      // en horizontal la portada va al lado del texto: tan alta como el hueco que queda
      root.style.setProperty('--cv', Math.floor(Math.max(64, Math.min(mid.clientHeight, 220))) + 'px');
      root.style.setProperty('--cvs', '0px');
      return;
    }
    // alto del bloque de texto con un título de 2 líneas, para que la portada no salte entre tarjetas
    info.style.height = 'auto';
    ttl.style.minHeight = '2.24em';
    const ih = info.offsetHeight;
    ttl.style.minHeight = '';
    info.style.height = '';
    root.style.setProperty('--ih', ih + 'px');
    // A la derecha de la portada va la columna de enlaces (50 px + separación). La portada sigue centrada mientras
    // quepa; si no, se corre a la izquierda lo justo, y como mucho llega a tocar el margen izquierdo.
    const W = feedEl.clientWidth - 40;
    const COL = 56;
    const geo = (midH) => {
      const cv = Math.floor(Math.max(110, Math.min(W - COL, 440, midH - ih - 18)));
      const free = (W - cv) / 2;
      const cvs = free < COL ? -Math.round(COL - free) : 0;
      return { cv, cvs, x: free + cvs, mpt: fix ? Math.max(0, Math.floor((midH - cv - 18 - ih) / 2)) : 0 };
    };
    const midH = mid.clientHeight;
    const B = geo(midH + upB);
    root.style.setProperty('--cv', B.cv + 'px');
    root.style.setProperty('--cvs', B.cvs + 'px');
    root.style.setProperty('--mpt', B.mpt + 'px');
    if (!fix) return;
    // lo que hay que mover y encoger para ver el tamaño pequeño sobre la maqueta grande
    const S = geo(midH - upS);
    const px = (v) => Math.round(v * 10) / 10 + 'px';
    root.style.setProperty('--kx', px(S.x - B.x));
    root.style.setProperty('--ky', px(S.mpt - B.mpt));
    root.style.setProperty('--ks', String(Math.round((S.cv / B.cv) * 10000) / 10000));
    root.style.setProperty('--oy', px(S.mpt + S.cv / 2 - (B.mpt + B.cv / 2)));
    root.style.setProperty('--iy', px(S.mpt + S.cv - (B.mpt + B.cv)));
  }
  // 2.1.6 — Al bloquear la primera vez en un teléfono (aún no se sabía el alto con la barra escondida), la maqueta grande hay
  // que calcularla ahora: se calcula viéndose todavía la pequeña (sin animar) y en el fotograma siguiente se pasa a la grande.
  function immGeoRefresh() {
    noTr(() => { root.classList.add('cvsm'); layoutCards(); });
    requestAnimationFrame(() => requestAnimationFrame(() => immPaint()));
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
    if (ui3() && s.loading && !tracks.length) return el(skelCard());
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
        if (s.hide) hiddenFor(fresh, s).forEach((id) => s.hidden.add(id));
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
      if (k) { k.innerHTML = metaChipKey(m); if (ui3() && m.k && keyHue(m.k) != null) k.style.setProperty('--kh', keyHue(m.k)); }
      if (b) b.innerHTML = metaChipBpm(m);
    }
    const r = listRowById(t.id);
    if (r) {
      const x = $('.rx', r);
      if (x && (m.b || m.k)) {
        if (ui3()) { const hh = rowMeta3(t); if (x.innerHTML !== hh) x.innerHTML = hh; }
        else { const tx = metaLine(t); if (x.textContent !== tx) x.textContent = tx; }
      }
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
    if (m && m.k) bits.push(keyText(m.k));
    bits.push(t.genre, t.label, t.duration);
    return bits.filter(Boolean).join(' · ');
  }
  // 2.2 · Diseño 2: el tono de cada fila va en una etiqueta con su color de la rueda Camelot (un color por número)
  // 2.2 · Diseño 2: cada género con su color (siempre el mismo)
  const genreHue = (name) => { let h = 7; String(name || '').split('').forEach((c) => { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return (h % 24) * 15; };
  function keyHue(k) {
    const c = camelot(k);
    const n = c ? parseInt(c, 10) : 0;
    return n >= 1 && n <= 12 ? ((n - 1) * 30 + 150) % 360 : null;
  }
  function rowMeta3(t) {
    const m = metaCache[t.id];
    const bits = [];
    if (t.rank) bits.push('#' + t.rank);
    if (m && m.b) bits.push(m.b + ' BPM');
    bits.push(t.genre, t.label, t.duration);
    const h = m && m.k ? keyHue(m.k) : null;
    const kc = m && m.k ? `<span class="rk"${h != null ? ` style="--kh:${h}"` : ''}>${esc(keyText(m.k))}</span>` : '';
    return kc + esc(bits.filter(Boolean).join(' · '));
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
    listProg();
    listEl.scrollTop = 0;
  }
  function rowHtml(t) {
    const done = t.siteDownloaded || myDownloads.has(t.id);
    const fav = isFav(t);
    const src = coverAt(t.cover, coverSize && +coverSize <= 150 ? coverSize : '110');
    return `<div class="row${isHeard(t) ? ' heard' : ''}${current && current.id === t.id ? ' cur' : ''}" data-id="${esc(t.id)}">` +
      `<img class="rc" alt="" loading="lazy" decoding="async" src="${esc(src)}" data-fb="${esc(t.cover)}">` +
      `<div class="rm"><div class="rt">${isNewFol(t) ? '<em class="rnew">NUEVA</em>' : ''}${esc(t.name)}${t.mix ? ' <small>' + esc(t.mix) + '</small>' : ''}</div><div class="ra">${esc(t.artist)}</div><div class="rx">${ui3() ? rowMeta3(t) : esc(metaLine(t))}</div></div>` +
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
    if (s.canFilter && ui3()) return head;
    if (s.canFilter) {
      const b = el(`<button class="fsum">${i('sliders')}<span><b>${esc(s.title)}</b><small>${esc(describeFilters(s.filters))}${s.cut ? ' · género filtrado aquí' : ''}</small></span></button>`);
      b.addEventListener('click', () => filtersGo());
      head.appendChild(b);
      return head;
    }
    const sub = sourceSub(s);
    let fnewEl = null;
    const h = el(`<div class="shead">${s.release && s.release.cover ? '<img class="scov" alt="">' : ''}<div class="stx">${kindName(s) ? '<div class="skind">' + esc(kindName(s)) + '</div>' : ''}<div class="stitle">${esc(s.title)}</div>${sub ? '<div class="ssub">' + esc(sub) + '</div>' : ''}</div>${s.follow ? '<button class="btn fol"></button>' : ''}</div>`);
    const cov = $('.scov', h);
    if (cov) cov.src = s.release.cover;
    if (ui3() && s.key === 'followed') {
      const n = tracks.filter((t) => folNew.has(t.id)).length;
      const nb = el(`<div class="fnew">${n ? `<span class="fnb">${n} ${n === 1 ? 'nueva' : 'nuevas'}</span><button class="btn pri fplay">${i('play')}Escuchar las nuevas</button>` : '<span class="fnz">Nada nuevo desde la última vez</span>'}</div>`);
      const fp = $('.fplay', nb);
      if (fp) fp.addEventListener('click', playNewFol);
      fnewEl = nb;
    }
    const fol = $('.fol', h);
    if (fol) fol.addEventListener('click', () => toggleFollow(s));
    head.appendChild(h);
    if (fnewEl) head.appendChild(fnewEl);
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
      const b = el(`<button class="fsum fsq" style="margin-top:10px">${i('search')}<span><b>Cambiar la búsqueda</b></span></button>`);
      b.addEventListener('click', () => openSearch(s.query));
      head.appendChild(b);
    }
    return head;
  }
  // 2.2 · Diseño 2: siluetas mientras carga, con la forma de lo que va a salir
  const skelCard = () => `<section class="card end skel"><div class="cin"><div class="mid"><div class="top"><div class="cvw sk"></div></div>
    <div class="info"><div class="itext"><span class="sk sk-xs"></span><span class="sk sk-l"></span><span class="sk sk-m"></span><span class="sk sk-s"></span><span class="sk-chips"><span class="sk"></span><span class="sk"></span><span class="sk"></span></span></div>
    <div class="rail"><span class="sk sk-r"></span><span class="sk sk-r"></span><span class="sk sk-r"></span></div></div></div></div></section>`;
  const skelRows = () => '<div class="skrows">' + '<div class="skrow"><span class="sk sk-cv"></span><span class="skt"><span class="sk sk-m"></span><span class="sk sk-s"></span><span class="sk sk-xs"></span></span></div>'.repeat(7) + '</div>';
  function emptyBlock() {
    const s = cur;
    if (ui3() && s.loading) return el(skelRows());
    const login = !s.loading && s.needLogin;
    const e = el(`<div class="lempty">${s.loading ? 'Cargando…' : s.error ? 'No se ha podido cargar: ' + esc(s.error) : esc(siteMsg(s))}
      <div class="stack" style="align-items:center">${login ? '<button class="btn pri blogin">Iniciar sesión</button>' : ''}${s.error || (!s.loading && s.bounced) ? '<button class="btn' + (login ? '' : ' pri') + ' bretry">Reintentar</button>' : ''}${!s.loading && s.url && !login ? '<button class="btn bweb">Abrir en la web</button>' : ''}${s.key === 'followed' && !s.loading && !login ? '<button class="btn bfed">Editar seguidos en la web</button>' : ''}</div>${login ? '<div class="note" style="margin-top:16px">¿Es una pestaña privada (incógnito)? Ahí Safari no guarda tu sesión: abre Soundeo en una pestaña normal y no tendrás que iniciarla.</div>' : ''}</div>`);
    const on = (sel, fn) => { const b = $(sel, e); if (b) b.addEventListener('click', fn); };
    on('.blogin', goLogin);
    on('.bretry', () => reloadSource(s));
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
    listProg();
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
        html += `<div class="gh">${ui3() ? '<b class="ghd" style="--gh:' + genreHue(t.genre || 'Otros') + '"></b>' : ''}${esc(t.genre || 'Otros')} <span>${n}</span></div>`;
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
  // 2.1.6 — La lista saltaba arriba del todo al volver a Safari tras hacer una captura (Tiger, 26 nov; en el diagnóstico,
  // un «armar:volver» en ese momento). No se ha visto la causa (el código de la app no lo hace); por si es Safari, la app
  // apunta dónde estaba y, si la lista pasa de golpe al principio sin que nadie la toque ni la app la mueva, la devuelve.
  const lsg = { keep: 0, user: 0, prog: 0, jumps: 0, last: null };
  function listProg() {
    lsg.prog = performance.now();
    requestAnimationFrame(() => { if (listEl) lsg.keep = listEl.scrollTop; });
  }
  function listRestore(why) {
    const y = lsg.keep;
    const src = cur;
    const at = performance.now();
    lsg.jumps++;
    lsg.last = { why, from: Math.round(y), t: Math.round((at - bootAt) / 100) / 10 };
    const put = () => {
      if (cur !== src || view !== 'list' || !isOpen || lsg.user > at || lsg.prog > at || listEl.scrollTop === y) return;
      listEl.scrollTop = y;
    };
    put();
    [120, 400, 1000].forEach((ms) => setTimeout(put, ms));
  }
  function setupListEvents() {
    // 2.1.6: guardia del salto arriba (ver listRestore)
    const mark = () => { lsg.user = performance.now(); };
    ['touchstart', 'touchmove', 'wheel'].forEach((ev) => listEl.addEventListener(ev, mark, { passive: true }));
    listEl.addEventListener('scroll', () => {
      const y = listEl.scrollTop;
      const now = performance.now();
      if (view === 'list' && isOpen && y < 2 && lsg.keep > 150 && now - lsg.user > 1500 && now - lsg.prog > 600) { listRestore('salto'); return; }
      lsg.keep = y;
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || view !== 'list' || !isOpen) return;
      const now = performance.now();
      if (listEl.scrollTop < 2 && lsg.keep > 150 && now - lsg.user > 1500 && now - lsg.prog > 600) listRestore('volver');
    });
    let lp = null;
    let lpFired = false; // la pulsación larga ya ha abierto el menú: el toque que queda no cuenta
    const rowOf = (e) => { const r = e.target.closest && e.target.closest('.row'); return r ? { r, t: byId.get(r.dataset.id) } : null; };
    // 2.1.5 (diseño nuevo): un dedo que se ha arrastrado más de 6 px no es un toque (Safari lo da por toque hasta unos 10)
    let tq = null;
    listEl.addEventListener('touchstart', (e) => { const p = e.touches[0]; tq = e.touches.length === 1 ? { x: p.clientX, y: p.clientY, mv: false, t: performance.now() } : null; }, { passive: true });
    listEl.addEventListener('touchmove', (e) => { const p = e.touches[0]; if (tq && p && (Math.abs(p.clientX - tq.x) > 6 || Math.abs(p.clientY - tq.y) > 6)) tq.mv = true; }, { passive: true });
    listEl.addEventListener('click', (e) => {
      const dragged = tq && tq.mv && performance.now() - tq.t < 2000;
      tq = null;
      if (dragged && prefs.ui2) return;
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
      if (play) saveLastPlay(t);
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
    if (!progEls) {
      const of = (box) => ({ fill: $('.fill', box), knob: $('.knob', box), buf: $('.buf', box) });
      progEls = { feed: Object.assign(of(ctrlEl), { tc: $('.tc', ctrlEl), td: $('.td', ctrlEl) }), mini: Object.assign(of(miniEl), { tc: $('.mtc', miniEl), td: $('.mtd', miniEl) }) };
    }
    const d = audio.duration;
    const c = seekTarget != null ? seekTarget : audio.currentTime;
    const pct = isFinite(d) && d > 0 ? (c / d) * 100 : 0;
    // en el feed, la barra de los controles; en la lista, la del mini reproductor (que también se ve encima de
    // Ajustes y del buscador con el diseño nuevo, aunque debajo esté el feed)
    const paint = (p) => {
      p.fill.style.width = pct + '%';
      p.knob.style.left = pct + '%';
      p.tc.textContent = fmtTime(c);
      p.td.textContent = isFinite(d) ? fmtTime(d) : '0:00';
      p.buf.style.width = (isFinite(d) && d > 0 ? Math.min(100, (bufSecs(audio) / d) * 100) : 0) + '%';
    };
    paint(view === 'feed' ? progEls.feed : progEls.mini);
    if (view === 'feed' && overOn()) paint(progEls.mini);
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
    if (current && !audio.paused && audio.currentTime >= HEARD_AFTER) { if (!heard.has(current.id)) markHeard(current.id); keepNote(current.id); if (ui3()) noteActive(); }
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
    h('seekbackward', () => seekBy(-skipBack()));
    h('seekforward', () => seekBy(skipFwd()));
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
  let lastStatus = null; // lo último que dijo el reproductor de Soundeo sobre BPM y tono (para el diagnóstico)
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
    if (/unvot|remov|cancel|revok|withdr|took\b[^.]*\bback/i.test(txt)) return false; // «You took your vote back» (real, 27 nov)
    if (typeof x === 'string' && /vot/i.test(x)) return true;
    if (left0 != null && left1 != null && left0 !== left1) return left1 < left0;
    if (typeof x === 'boolean') return x;
    return !before;
  }
  // ¿Dice la respuesta algo de cómo queda el voto? (para no dar por cambiado un aviso que no lo dice)
  function voteSaid(r, left0, left1) {
    const x = r.hasOwnProperty('voted') ? r.voted : r.result;
    const txt = (typeof x === 'string' ? x : '') + ' ' + (r.flash && r.flash.message ? r.flash.message : '');
    return typeof x === 'boolean' || (typeof x === 'string' && /vot/i.test(x)) || /unvot|remov|cancel|revok|withdr|took\b[^.]*\bback/i.test(txt) || (left0 != null && left1 != null && left0 !== left1);
  }
  const respError = (r) => {
    if (!r) return 'Soundeo no ha respondido';
    // 2.1.9: un «warning» con success: true no es un error (así contesta Soundeo al quitar el voto: «You took your vote back»)
    const bad = !r.success || (r.flash && /err|fail|danger/i.test(String(r.flash.type || '')));
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
        const left1 = voteLeft();
        if (r.flash && /warn/i.test(String(r.flash.type || '')) && !voteSaid(r, act.leftBefore, left1)) {
          const m = plainMsg(r.message || r.flash.message || '');
          return done(false, before, n0, m ? 'Soundeo dice: ' + m.slice(0, 110) : 'Soundeo no lo ha aceptado');
        }
        const on = votedFrom(r, before, act.leftBefore, left1);
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
    paintTabs();
  }
  function closeSheets() {
    if (!root) return;
    shadeEl.classList.remove('on');
    $$('.sheet.on', root).forEach((s) => s.classList.remove('on'));
    paintTabs();
  }
  function actionSheet(title, sub, note, opts, kind) {
    const s = $('.s-action', root);
    s.dataset.k = kind || ''; // 2.2 · Diseño 2: «lists» = el menú del selector
    $('h2', s).textContent = title;
    const b = $('.sb', s);
    b.innerHTML = (sub ? `<div class="asub">${esc(sub)}</div>` : '') + (note ? `<div class="note" style="margin:0 0 6px">${esc(note)}</div>` : '');
    opts.forEach((o) => {
      const txt = o.hint ? `<span class="ol"><span>${esc(o.label)}</span><em>${esc(o.hint)}</em></span>` : `<span>${esc(o.label)}</span>`;
      const inner = `${o.icon ? i(o.icon) : ''}${txt}${o.small ? '<small>' + esc(o.small) + '</small>' : ''}${o.badge ? '<b class="obadge">' + esc(o.badge) + '</b>' : ''}${o.on ? '<span class="ochk">' + i('check') + '</span>' : ''}`;
      // con `href` es un enlace de verdad (para que el iPhone abra la app de destino); si no, un botón
      const x = o.href ? el(`<a class="opt" target="_blank" rel="noopener" href="${esc(o.href)}">${inner}</a>`) : el(`<button class="opt${o.pri ? ' pri' : ''}${o.cls ? ' ' + o.cls : ''}${o.on ? ' on' : ''}"${o.disabled ? ' disabled' : ''}>${inner}</button>`);
      if (o.hue != null) x.style.setProperty('--ih', String(o.hue));
      if (o.href) x.addEventListener('click', () => setTimeout(closeSheets, 400));
      else if (!o.disabled) x.addEventListener('click', () => { closeSheets(); o.fn(); });
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
    MUSIC.forEach((m) => opts.push({ label: 'Buscar en ' + m.name, hint: songQuery(t), icon: 'ext', href: m.url(songQuery(t)) }));
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

  /* ───────────── buscar la canción en Spotify / Apple Music ───────────── */
  // Dos enlaces al buscador de cada app con «artista + título» ya escrito: sin peticiones a nadie y sin conectar nada.
  // Son <a> de verdad, que es lo que hace que el iPhone abra la app (comprobado por Tiger). Los botones son un diseño
  // propio (nombre + color de acento de la app), no los logotipos de esas marcas. SoundCloud se dejó fuera: ninguno
  // de sus enlaces abre su app con el texto puesto.
  const MUSIC = [
    { key: 'sp', name: 'Spotify', lines: ['Spotify'], url: (q) => 'https://open.spotify.com/search/' + encodeURIComponent(q) },
    { key: 'am', name: 'Apple Music', lines: ['Apple', 'Music'], url: (q) => 'https://music.apple.com/search?term=' + encodeURIComponent(q) },
  ];
  const songQuery = (t) => clean((t.artist || '') + ' ' + t.name);
  const musicLinksHtml = (t) => MUSIC.map((m) => `<a class="mlink ${m.key}" target="_blank" rel="noopener" draggable="false" href="${esc(m.url(songQuery(t)))}" aria-label="Buscar en ${m.name}"><span class="mn">${m.lines.map(esc).join('<br>')}</span><i class="mgo">${ICON.go}</i></a>`).join('');

  /* ───────────── Ajustes por capas (2.1, solo con el diseño nuevo) ───────────── */
  // Con el diseño nuevo, Ajustes es una pantalla propia: cada fila entra en la suya y enseña el valor actual sin
  // entrar; ‹ (o el gesto «atrás» de Safari) vuelve una capa. El diseño de siempre sigue con su hoja (openSettings).
  function pgOpen(id, arg, opts) {
    if (!pgEl) return;
    closeSheets();
    closeSearch();
    if (opts && opts.root) pgStack = [{ id, arg, scroll: 0 }];
    else {
      if (pgStack.length) pgStack[pgStack.length - 1].scroll = $('.pgb', pgEl).scrollTop;
      pgStack.push({ id, arg, scroll: 0 });
      try { history.pushState({ sx: stack.length - 1, pg: pgStack.length - 1 }, '', location.href); } catch (e) {}
    }
    pgNote('abrir');
    pgRender();
  }
  function pgPop(to) {
    if (to < 0) { pgClose(); return; }
    if (to >= pgStack.length - 1) return;
    pgStack.length = to + 1;
    pgRender();
  }
  function pgBack() {
    if (pgStack.length <= 1) { pgClose(); return; }
    try {
      if (history.state && history.state.pg === pgStack.length - 1) { history.back(); return; }
    } catch (e) {}
    pgPop(pgStack.length - 2);
  }
  function pgClose() {
    const had = pgStack.length > 0;
    pgStack = [];
    fdraft = null;
    if (!pgEl) return;
    // 2.1.2: aunque no hubiera capas apuntadas, que la pantalla no se quede puesta (y vacía) encima de todo
    if (!had && !pgEl.classList.contains('on')) return;
    pgNote('cerrar');
    try { const a = pgEl.getRootNode().activeElement; if (a && pgEl.contains(a)) a.blur(); } catch (e) {}
    pgEl.classList.remove('on');
    paintOver();
    paintTabs();
    paintProgress();
    kbSync();
  }
  // `keep`: se repinta la misma pantalla tras un cambio (no se mueve el scroll); si no, se entra o se vuelve a ella.
  function pgRender(keep) {
    const top = pgStack[pgStack.length - 1];
    if (!top || !pgEl) return;
    const body = $('.pgb', pgEl);
    const foot = $('.pgf', pgEl);
    const y = keep ? body.scrollTop : top.scroll || 0;
    // 2.1.2: al cambiar de pantalla, soltar el campo en el que se escribía ANTES de quitarlo. Si se quita con el foco
    // puesto, Safari no avisa de que el teclado se ha ido: la página se quedaba desplazada (pantalla en negro) y el
    // modo de la barra en pausa hasta el siguiente teclado.
    if (!keep) { try { const a = shadow && shadow.activeElement; if (a && pgEl.contains(a)) a.blur(); } catch (e) {} }
    body.textContent = '';
    foot.textContent = '';
    pgEl.dataset.id = top.id;
    pgEl.classList.toggle('sub', pgStack.length > 1);
    pgEl.classList.add('on');
    let title = '';
    try {
      title = PAGES[top.id](body, foot, top.arg);
    } catch (e) {
      // que un fallo al pintar no deje la pantalla vacía: se dice, se apunta para el diagnóstico y el error sigue su camino
      pgNote('error: ' + short(String((e && e.message) || e), 70));
      body.innerHTML = '<div class="note">No se ha podido abrir esta pantalla. Vuelve atrás y prueba otra vez; si se repite, manda el diagnóstico.</div>';
      title = 'Ajustes';
      setTimeout(() => { throw e; }, 0);
    }
    if (pgStack[pgStack.length - 1] !== top) return; // la pantalla ha decidido irse (no había nada que enseñar)
    $('h2', pgEl).textContent = title || '';
    paintOver();
    paintTabs();
    paintProgress();
    body.scrollTop = y;
    kbSync();
  }
  // Fila que entra en otra pantalla (o hace algo): título, valor actual debajo y › a la derecha.
  const pgRow = (o) => {
    const b = el(`<button class="opt prow"${o.disabled ? ' disabled' : ''}>${o.icon ? i(o.icon) : ''}<span class="ol"><span>${esc(o.label)}</span>${o.val ? '<em>' + esc(o.val) + '</em>' : ''}</span>${o.small ? '<small>' + esc(o.small) + '</small>' : ''}${o.go === false ? '' : '<b class="pch">' + ICON.chev + '</b>'}</button>`);
    if (o.cls) b.classList.add(o.cls);
    if (!o.disabled && o.fn) b.addEventListener('click', o.fn);
    return b;
  };
  const pgSeg = (cls, opts, val) => `<div class="seg2 ${cls}">${opts.map(([v, n]) => `<button data-v="${esc(v)}"${String(val) === String(v) ? ' class="on"' : ''}>${esc(n)}</button>`).join('')}</div>`;
  const wireSeg = (b, cls, fn) => $$('.' + cls + ' button', b).forEach((x) => x.addEventListener('click', () => {
    $$('.' + cls + ' button', b).forEach((y) => y.classList.toggle('on', y === x));
    fn(x.dataset.v);
  }));
  const tgHtml = (p, title, sub) => `<div class="tg"><div><b>${esc(title)}</b><small>${esc(sub)}</small></div><button class="sw" data-p="${p}" aria-label="${esc(title)}"></button></div>`;
  const keyFmtName = () => (prefs.keyFmt === 'cam' ? 'Camelot' : prefs.keyFmt === 'mus' ? 'musical' : 'Camelot y musical');
  const shortList = (n) => (n.length > 3 ? n.slice(0, 3).join(', ') + '…' : n.join(', '));
  const bpmText = (f) => (f.bpmMin != null || f.bpmMax != null ? (f.bpmMin != null ? f.bpmMin : 0) + ' – ' + (f.bpmMax != null ? f.bpmMax : 260) : 'Cualquiera');
  const timeName = (v) => { const t = TIME_OPTS.find((x) => x[0] === String(v)); return t ? t[1] : 'Todo'; };
  // Tono, lista compacta y tamaño de letra: se aplican al momento, sin recargar.
  function applyLook() {
    if (!root) return;
    root.classList.toggle('dense', !!pref2('dense'));
    root.classList.toggle('bigtx', !!pref2('bigText'));
    // el tono se escribe al rellenar cada tarjeta y cada fila: repintar lo que hay
    tracks.forEach((t) => { if (metaCache[t.id]) paintMeta(t); });
    requestAnimationFrame(() => { layoutCards(); if (view === 'feed') feedJump(activeIdx); });
  }
  function paintSkips() {
    if (!root) return;
    [['.b15', 'Atrás', skipBack()], ['.f30', 'Adelante', skipFwd()]].forEach(([sel, name, n]) => {
      const b = $(sel, root);
      $('em', b).textContent = String(n);
      b.setAttribute('aria-label', name + ' ' + n + ' s');
    });
  }

  /* filtros en las pantallas: `fdraft.f` es lo que se está tocando. Los predeterminados se guardan a cada cambio;
     los de la lista que se ve se aplican con «Aplicar filtros» (hay que pedir la lista otra vez). */
  function fTouched() {
    if (!fdraft) return;
    fdraft.dirty = true;
    if (fdraft.mode === 'start') setStartFilters(fdraft.f);
  }
  function applyDraft(msg) {
    const d = fdraft;
    if (!d || d.mode !== 'cur' || d.src !== cur) { pgClose(); return; }
    const f = d.f;
    orderBpm(f);
    if (f.search && f.search.length < 3) { toast('La búsqueda por título necesita 3 letras o más'); return; }
    refilter(f);
    if (typeof msg === 'string') toast(msg);
  }
  function useSaved(sv) {
    if (!fdraft) return;
    Object.assign(fdraft.f, comboOf(sv.f));
    if (fdraft.mode === 'start') {
      fTouched();
      toast('«' + sv.name + '»: ahora son los filtros predeterminados');
      pgRender(true);
      return;
    }
    applyDraft('Filtros «' + sv.name + '» aplicados');
  }
  function savedMenu(sv) {
    const now = fdraft ? fdraft.f : null;
    actionSheet(sv.name, describeFilters(sv.f), '', [
      { label: 'Renombrar', icon: 'tag', fn: () => pgOpen('f-name', { id: sv.id }) },
      {
        label: 'Actualizar con los filtros de ahora', hint: now ? describeFilters(now) : '', icon: 'check', disabled: !now || comboKey(now) === comboKey(sv.f),
        fn: () => { sv.f = comboOf(fdraft.f); saveSaved(); toast('«' + sv.name + '» actualizado'); pgRender(true); },
      },
      { label: 'Borrar', icon: 'close', fn: () => { savedFilters = savedFilters.filter((x) => x !== sv); saveSaved(); toast('«' + sv.name + '» borrado'); pgRender(true); } },
    ]);
  }
  function saveComboGo() {
    if (!fdraft) return;
    const dup = savedFilters.find((x) => comboKey(x.f) === comboKey(fdraft.f));
    if (dup) { toast('Esta combinación ya está guardada como «' + dup.name + '»'); return; }
    if (savedFilters.length >= MAX_SAVED) { toast('Ya hay ' + MAX_SAVED + ' guardados: borra uno para guardar otro'); return; }
    pgOpen('f-name', { id: null });
  }
  /* ───────────── 2.2 · Diseño 2: Home, lo nuevo de Seguidos, «Sigue escuchando» y la regla de la hora ───────────── */
  const HOUR = 3600000;
  const folUrl = () => sectionUrl(sectionByKey('followed'), {});
  // lo marcado como NUEVA en Seguidos durante esta pestaña (se suma si se vuelve a entrar)
  let folNew = new Set(SS.get('folNew', []));
  let folCache = null; // { t, tracks } — la página 1 de Seguidos, para Home (vale 10 minutos)
  let folBusy = null;
  const isNewFol = (t) => ui3() && !!cur && cur.key === 'followed' && folNew.has(t.id);
  const folSeen = () => LS.get('folSeen', null); // { t, ids, day }: lo que había la última vez que se abrió Seguidos
  const folMini = (list) => list.slice(0, 100).map((t) => ({ id: t.id, name: t.name, artist: t.artist, mix: t.mix, cover: t.cover }));
  // Nuevo = no estaba la última vez y es más reciente que lo más antiguo de entonces (los ids de Soundeo crecen con el
  // tiempo). Así, si algo antiguo entra en la página 1 porque otra cosa sale (dejar de seguir a alguien), no cuenta.
  // (La fecha que enseña Soundeo es la de lanzamiento, no la de subida: no sirve para esto.)
  const numId = (id) => (/^\d+$/.test(String(id)) ? +id : NaN);
  function folNewOf(list, seen) {
    if (!seen || !Array.isArray(seen.ids)) return [];
    const ids = new Set(seen.ids);
    const nums = seen.ids.map(numId).filter(isFinite);
    const min = nums.length ? Math.min.apply(null, nums) : NaN;
    return list.filter((t) => t.id && !ids.has(t.id) && !(numId(t.id) < min));
  }
  function folMark(list) {
    LS.set('folSeen', { t: Date.now(), ids: list.slice(0, 100).map((t) => t.id) });
  }
  // Al cargar Seguidos: se marca lo nuevo desde la última vez; lo de ahora pasa a ser «lo visto» cuando se ve de verdad
  // (folCommit), no si se carga debajo de Home (al volver tras más de una hora, Safari puede recargarla ahí)
  function folOpened(s) {
    const seen = folSeen();
    folNewOf(s.tracks, seen).forEach((t) => folNew.add(t.id));
    SS.set('folNew', Array.from(folNew));
    folCache = { t: Date.now(), tracks: folMini(s.tracks) };
    LS.set('folCache', folCache);
    s.folPending = true;
    folCommit();
  }
  function folCommit() {
    if (!cur || !cur.folPending || cur.key !== 'followed' || !cur.tracks.length || !isOpen || overOn() || document.hidden || !ui3()) return;
    cur.folPending = false;
    folMark(cur.tracks);
  }
  function folFetch(force) {
    const c = folCache || LS.get('folCache', null);
    if (!force && c && Array.isArray(c.tracks) && Date.now() - c.t < 10 * 60000) { folCache = c; return Promise.resolve(c); }
    if (folBusy) return folBusy;
    // como al abrir Seguidos: sin filtros y, si Soundeo no contesta bien así, como siempre
    const tmp = { key: 'followed', url: folUrl(), xhr: false };
    folBusy = fetchSource(tmp).then(({ doc }) => {
      const info = readDoc(doc, tmp.url);
      if (!info.tracks.length && !$('#top-menu-logout, a[href*="/account/logout"]', doc)) throw new Error('sin sesión');
      folCache = { t: Date.now(), tracks: folMini(info.tracks) };
      LS.set('folCache', folCache);
      if (!folSeen() && info.tracks.length) { folMark(info.tracks); folCache.first = true; }
      return folCache;
    }).finally(() => { folBusy = null; });
    return folBusy;
  }
  // «Sigue escuchando»: la última canción que sonó y la lista de la que venía
  const navDesc = (s) => (s ? { kind: s.kind, key: s.key, title: s.title, url: s.url, filters: s.filters, canFilter: s.canFilter, hide: s.hide, loose: s.loose, xhr: s.xhr, refId: s.refId, query: s.query, web: s.web } : null);
  function saveLastPlay(t) {
    if (!ui3() || !t) return;
    const s = cur && byId.has(t.id) ? cur : queue && queue.src && queue.src.tracks.includes(t) ? queue.src : cur;
    LS.set('lastPlay', { t: Date.now(), id: t.id, name: t.name, artist: t.artist, mix: t.mix, cover: t.cover, trackUrl: t.trackUrl, src: s && s.kind !== 'similar' ? navDesc(s) : null, srcTitle: s ? s.title : '' });
  }
  // Escuchadas hoy (para «Hoy» en Home)
  const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  function countHeardToday() {
    const c = LS.get('heardToday', null);
    const k = todayKey();
    LS.set('heardToday', { d: k, n: c && c.d === k ? (c.n || 0) + 1 : 1 });
  }
  const heardTodayN = () => { const c = LS.get('heardToday', null); return c && c.d === todayKey() ? c.n || 0 : 0; };
  // Actividad: con la app abierta y a la vista, o con música sonando
  let actT = 0;
  function noteActive(force) {
    const now = Date.now();
    if (!force && now - actT < 30000) return;
    actT = now;
    LS.set('lastActive', now);
  }
  // Dónde estaba (pestaña, lista, canción), para volver ahí si se abre antes de una hora
  const tabNow = () => (pgStack[0] ? pgStack[0].id : srchEl && srchEl.classList.contains('on') ? 'search' : null);
  let lastNavT = 0;
  function saveLastNav() {
    if (!ui3()) return;
    clearTimeout(lastNavT);
    lastNavT = setTimeout(() => {
      if (!cur || !isOpen) return;
      const t = deck[activeIdx];
      LS.set('lastNav', { t: Date.now(), src: cur.kind === 'similar' ? null : navDesc(cur), at: view === 'feed' ? (t ? t.id : null) : current ? current.id : null, view, tab: tabNow() });
    }, 400);
  }
  // Más de una hora sin usarla: al volver se abre en Home, como recién arrancada
  function homeIfIdle() {
    if (!ui3() || !isOpen || document.hidden) return;
    const last = LS.get('lastActive', 0);
    if (audio && !audio.paused) { noteActive(true); return; }
    if (last && Date.now() - last > HOUR) { closeSheets(); homeGo(); }
    noteActive(true);
  }
  // Arranque con el Diseño 2: Home si hace más de una hora; si no, la pestaña donde se estaba.
  function ui3Boot(cont) {
    if (!ui3() || !isOpen) return;
    const last = LS.get('lastActive', 0);
    noteActive(true);
    if (!last || Date.now() - last > HOUR) { homeGo(); return; }
    const ln = cont || LS.get('lastNav', null);
    if (!ln || !ln.tab) return;
    if (ln.tab === 'home') homeGo();
    else if (ln.tab === 'chat') pgOpen('chat', null, { root: true });
    else if (ln.tab === 'settings') { if (tabsB()) { homeGo(); pgOpen('settings'); } else settingsGo(); }
    else if (ln.tab === 'search') searchTab();
  }
  // Home: Parecidas a lo que suena (o a lo último que sonó), pedidas al enseñarse y guardadas mientras no cambie
  let homeSim = null; // { id, src, list }
  function similarFor(t) {
    if (homeSim && homeSim.id === t.id) return Promise.resolve(homeSim);
    const src = mkSrc({ kind: 'similar', title: t.name, xhr: true, web: t.trackUrl || '', url: location.origin + '/tracks/recommend/' + encodeURIComponent(t.id) });
    return fetchSimilar(src).then(({ doc, finalUrl }) => {
      applyDoc(src, doc, finalUrl);
      src.loaded = true;
      homeSim = { id: t.id, src, list: src.tracks.slice() };
      return homeSim;
    }, (e) => {
      // Soundeo no tiene ese bloque para esta canción: es «no hay», no un fallo
      if (!(e && e.none)) throw e;
      homeSim = { id: t.id, src, list: [] };
      return homeSim;
    });
  }
  const homeDate = () => {
    try { return new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', ''); } catch (e) { return ''; }
  };
  const fmtN = (n) => (n == null ? '–' : String(n));
  // Ir a lo que se estaba escuchando (desde «Sigue escuchando»): su lista, en esa canción y con lo ya escuchado detrás
  function resumeLast(lp) {
    pgClose();
    if (!lp || !lp.id) { setView('feed'); return; }
    if (current && current.id === lp.id) {
      showCurrentInFeed();
      if (audio.paused) togglePlay();
      return;
    }
    const k = lp.src ? keepKey(lp.src) : '';
    const back = keepRestore(k);
    const here = cur && byId.has(lp.id) && (!lp.src || !lp.src.url || sameUrl(lp.src.url, cur.url));
    if (here) {
      // en la lista que se ve: suena ya (dentro del toque, como pide el iPhone)
      const t = byId.get(lp.id);
      if (back && cur.hide) setHidden(hiddenFor(tracks, cur));
      forced.add(t.id);
      buildDeck();
      renderFeed();
      activeIdx = deckPos.get(t.id) || 0;
      setView('feed');
      load(t, true);
      return;
    }
    if (!lp.src) { setView('feed'); return; }
    wantPlay = true;
    const s = openSource(Object.assign({}, lp.src, { at: lp.id }), { root: true, view: 'feed', resume: true });
    if (!s) return;
    const has = () => s.tracks.some((x) => x.id === lp.id);
    const focus = () => { s.at = lp.id; s.forced.add(lp.id); adopt(s); };
    const deep = () => {
      // más abajo en la lista (en otra página de Soundeo): se piden hasta 3 más; mientras, no suena otra cosa
      wantPlay = false;
      findDeep(s, lp.id, 3).then((ok) => {
        if (cur !== s) return;
        if (ok) { wantPlay = true; focus(); } else toast('«' + (lp.name || 'Esa canción') + '» ya no está en ' + s.title);
      });
    };
    if (s.loaded) {
      // ya estaba cargada (la del arranque): rehacer lo que se esconde con lo escuchado en la visita anterior
      if (back && s.hide) s.hidden = hiddenFor(s.tracks, s);
      if (has()) focus();
      else deep();
    } else ensureLoaded(s).then(() => { if (cur === s && !s.error && s.tracks.length && !has()) deep(); });
  }
  function findDeep(s, id, n) {
    const ok = () => s.tracks.some((x) => x.id === id);
    if (cur !== s || ok() || !s.pages.hasMore || n <= 0) return Promise.resolve(cur === s && ok());
    return loadMore().then(() => findDeep(s, id, n - 1));
  }
  function playNewFol() {
    const t = tracks.find((x) => folNew.has(x.id));
    if (!t) { toast('En esta lista ya no hay canciones nuevas'); return; }
    if (!deckPos.has(t.id)) { forced.add(t.id); buildDeck(); renderFeed(); }
    activeIdx = deckPos.get(t.id) || 0;
    setView('feed');
    load(t, true);
  }
  function homeCover(url, cls) {
    return url ? `<img class="${cls}" alt="" decoding="async" loading="lazy" src="${esc(coverAt(url, '110'))}">` : `<span class="${cls} hmnc"></span>`;
  }
  function homeSeguidos(box, first) {
    const paint = (c) => {
      if (!box.isConnected) return;
      const nw = folNewOf(c.tracks, folSeen());
      const n = nw.length;
      const arts = [];
      nw.forEach((t) => (t.artist || '').split(/,\s*|\s+&\s+/).forEach((a) => { a = clean(a); if (a && !arts.includes(a)) arts.push(a); }));
      const who = arts.length ? arts.slice(0, 3).join(', ') + (arts.length > 3 ? ' y ' + (arts.length - 3) + ' más' : '') : '';
      const covers = (n ? nw : c.tracks).slice(0, 4).map((t) => homeCover(t.cover, 'hmsc')).join('');
      box.classList.toggle('none', !n);
      box.innerHTML = `<span class="hmtag">${i('bolt')}NUEVO EN SEGUIDOS</span>
        <span class="hmbig"><b>${n}</b><span><strong>${n === 1 ? 'canción nueva' : 'canciones nuevas'}</strong><small>${esc(n ? who : !c.tracks.length ? 'Aún no sigues a ningún artista o sello' : c.first ? 'A partir de ahora te aviso de lo nuevo' : 'Nada nuevo desde la última vez')}</small></span></span>
        <span class="hmrow"><span class="hmcovs">${covers}</span>${n ? '<span class="hmgo hmplaynew">' + i('play') + 'Escuchar</span>' : '<span class="hmgo">Ver Seguidos' + i('right') + '</span>'}</span>`;
      const tile = $('.hm-fol b', box.parentNode);
      if (tile) tile.textContent = String(n);
    };
    box.innerHTML = '<span class="hmtag">' + i('bolt') + 'NUEVO EN SEGUIDOS</span><span class="sk sk-l"></span><span class="sk sk-s"></span>';
    folFetch(false).then(paint, (e) => {
      if (!box.isConnected) return;
      box.innerHTML = `<span class="hmtag">${i('bolt')}NUEVO EN SEGUIDOS</span><span class="hmerr">No se ha podido mirar Seguidos${e && /sesi/.test(e.message) ? ': no hay sesión de Soundeo en esta pestaña' : ''}.</span><span class="hmgo hmretry">Reintentar${i('refresh')}</span>`;
      const r = $('.hmretry', box);
      if (r) r.addEventListener('click', (ev) => { ev.stopPropagation(); folCache = null; homeSeguidos(box); });
    });
  }
  function homeSimilar(box, t) {
    const card = (x, k) => `<button class="hmsim" data-k="${k}">${homeCover(x.cover, 'hmsimc')}<b>${esc(x.name)}</b><small>${esc(x.artist)}</small></button>`;
    box.innerHTML = '<div class="hmsims">' + '<span class="hmsim sk-card"><span class="sk sk-c"></span><span class="sk sk-s"></span><span class="sk sk-xs"></span></span>'.repeat(3) + '</div>';
    similarFor(t).then((r) => {
      if (!box.isConnected) return;
      if (!r.list.length) { box.innerHTML = '<div class="hmnote">Soundeo no tiene parecidas para esta canción.</div>'; return; }
      box.innerHTML = '<div class="hmsims">' + r.list.slice(0, 10).map(card).join('') + '</div>';
      $$('.hmsim', box).forEach((b) => b.addEventListener('click', () => {
        const x = r.list[+b.dataset.k];
        // una fuente nueva con lo ya traído (no se pide otra vez), abierta en el feed en la canción tocada
        const s2 = mkSrc({ kind: 'similar', title: r.src.title, xhr: true, web: r.src.web, url: r.src.url, loaded: true, at: x.id, view: 'feed' });
        s2.tracks = r.list.slice();
        s2.mode = r.src.mode;
        s2.forced.add(x.id);
        pgClose();
        wantPlay = true;
        openSource({ kind: 'similar', title: s2.title, url: s2.url }, { src: s2, view: 'feed' });
        if (cur === s2 && deckPos.has(x.id)) { activeIdx = deckPos.get(x.id); load(byId.get(x.id) || x, true); }
      }));
    }, () => { if (box.isConnected) box.innerHTML = '<div class="hmnote">No se han podido traer las parecidas.</div>'; });
  }

  /* ───────────── 2.2 · Diseño 2: pantallas de Ajustes (en bloques, con iconos de color) ───────────── */
  // Bloque de filas con un título encima. `hue`: color del cuadrado del icono.
  function grp3(b, title, rows) {
    if (title) b.appendChild(el(`<div class="sec">${esc(title)}</div>`));
    const g = el('<div class="grp"></div>');
    rows.filter(Boolean).forEach(([o, hue]) => { const r = pgRow(o); r.style.setProperty('--ih', String(hue)); g.appendChild(r); });
    b.appendChild(g);
    return g;
  }
  // La versión, abajo de Ajustes: tocarla 5 veces seguidas desbloquea el «Diseño 2» (escondido hasta que esté listo)
  function versionTaps(node) {
    let n = 0;
    let t0 = 0;
    node.addEventListener('click', () => {
      const now = Date.now();
      n = now - t0 < 1500 ? n + 1 : 1;
      t0 = now;
      if (n < 5) return;
      n = 0;
      const where = prefs.ui2 ? 'Ajustes → Apariencia' : 'Ajustes → Pantalla';
      if (prefs.ui3Unlocked) { toast('El Diseño 2 ya está desbloqueado: ' + where); return; }
      prefs.ui3Unlocked = true;
      savePrefs();
      if (root && $('.s-settings.on', root)) openSettings();
      toast('Diseño 2 desbloqueado: está en ' + where, null, null, 4000);
    });
  }
  function settings3(b) {
    fdraft = null;
    const canF = !!(cur && cur.canFilter);
    const curVal = canF
      ? cur.title + ' · ' + (comboKey(cur.filters) === comboKey(defFilters) && !cur.filters.search ? 'sin cambios' : describeFilters(cur.filters))
      : (cur ? cur.title + ' · ' : '') + 'esta lista no tiene filtros';
    const acc = clean($('#top-menu-account span') && $('#top-menu-account span').textContent);
    grp3(b, 'Listas', [
      [{ cls: 'r-fstart', icon: 'set2', label: 'Filtros predeterminados', val: describeFilters(defFilters), fn: () => pgOpen('filters', 'start') }, 265],
      [{ cls: 'r-fcur', icon: 'funnel', label: 'Filtros actuales', val: curVal, disabled: !canF, fn: () => pgOpen('filters', 'cur') }, 210],
      [{ cls: 'r-start', icon: 'door', label: 'Al abrir', val: sectionByKey(prefs.startSection || 'avail').name + ' · vista ' + (prefs.startView === 'list' ? 'Lista' : 'Feed'), fn: () => pgOpen('start') }, 160],
    ]);
    grp3(b, 'Escuchar', [
      [{ cls: 'r-play', icon: 'play', label: 'Reproducción', val: 'Saltos −' + skipBack() + ' / +' + skipFwd() + ' s · precarga ' + (prefs.preload ? 'activada' : 'apagada'), fn: () => pgOpen('play') }, 140],
      [{ cls: 'r-look', icon: 'palette', label: 'Apariencia', val: 'Pestañas: ' + (tabsB() ? 'Lista' : 'Ajustes') + ' · tono ' + keyFmtName() + ' · lista ' + (prefs.dense ? 'compacta' : 'cómoda'), fn: () => pgOpen('look') }, 25],
    ]);
    grp3(b, 'App', [
      [{ cls: 'r-diag', icon: 'bug', label: 'Diagnóstico', val: 'Para Claude', go: false, fn: diagnostics }, 330],
      loader() ? [{ cls: 'r-upd', icon: 'refresh', label: 'Buscar actualización', val: 'Versión ' + VERSION, go: false, fn: checkUpdate }, 190] : null,
      [{ cls: 'r-web', icon: 'ext', label: 'Ver la web original', go: false, fn: () => { pgClose(); closeApp(); } }, 230],
    ]);
    versionTaps(b.appendChild(el(`<div class="note vnote">Soundeo Feed ${VERSION}${loader() ? ' · se actualiza sola' : ''}${acc ? ' · Premium: ' + esc(acc) : ''}</div>`)));
    return 'Ajustes';
  }
  function filters3(b, foot, mode) {
    const isStart = mode === 'start';
    if (!isStart && !(cur && cur.canFilter)) {
      b.appendChild(el('<div class="note" style="margin-top:10px">Esta lista no tiene filtros.</div>'));
      return 'Filtros actuales';
    }
    if (!fdraft || fdraft.mode !== mode || (!isStart && fdraft.src !== cur)) {
      const f0 = cleanFilters(isStart ? defFilters : cur.filters);
      if (isStart) f0.search = '';
      fdraft = { mode, f: f0, src: isStart ? null : cur, dirty: false };
    }
    const f = fdraft.f;
    if (orderBpm(f) && isStart) setStartFilters(f);
    const loose = !isStart && !!cur.loose;
    const add = (x) => { const n = typeof x === 'string' ? el(x) : x; b.appendChild(n); return n; };
    add(`<div class="note pgsub">${isStart ? 'Con qué se abren la app y las secciones del menú. Seguidos va siempre sin filtros.' : 'Se aplican a ' + esc(cur.title) + '.' + (loose ? ' En esta sección Soundeo puede no aplicar todos; el género se filtra en la app.' : '')}</div>`);
    // Guardados: tarjetas, con la que coincide marcada
    add(`<div class="sec">Guardados <span class="svn">${savedFilters.length} de ${MAX_SAVED}</span></div>`);
    const strip = add('<div class="svcards"></div>');
    const here = comboKey(f);
    savedFilters.forEach((sv) => {
      const on = comboKey(sv.f) === here;
      const c = el(`<div class="svc${on ? ' on' : ''}"><button class="svgo"><span class="svi">${i(on ? 'check' : 'layers')}</span><b>${esc(sv.name)}</b><small>${esc(describeFilters(sv.f))}</small></button><button class="svmore" aria-label="Opciones de ${esc(sv.name)}">${i('more')}</button></div>`);
      $('.svgo', c).addEventListener('click', () => useSaved(sv));
      $('.svmore', c).addEventListener('click', () => savedMenu(sv));
      strip.appendChild(c);
    });
    const plus = el(`<button class="svc svadd r-save">${i('plus')}<span>Guardar los de ahora</span></button>`);
    plus.addEventListener('click', saveComboGo);
    strip.appendChild(plus);
    grp3(b, 'Filtros', [
      [{ cls: 'r-gen', icon: 'note', label: 'Géneros', val: f.genres.length ? shortList(f.genres.map(genreName)) : 'Todos', small: f.genres.length ? String(f.genres.length) : '', fn: () => pgOpen('f-genres') }, 265],
      [{ cls: 'r-bpm', icon: 'tempo', label: 'BPM', val: bpmText(f), fn: () => pgOpen('f-bpmkey') }, 20],
      [{ cls: 'r-key', icon: 'wheel', label: 'Tono', val: f.keys.length ? shortList(keyCams(f.keys)) : 'Cualquiera', small: f.keys.length ? String(keyCams(f.keys).length) : '', fn: () => pgOpen('f-bpmkey') }, 160],
      loose ? null : [{
        cls: 'r-time', icon: 'calendar', label: 'Fecha de lanzamiento', val: timeName(f.time), go: false,
        fn: () => actionSheet('Fecha de lanzamiento', '', '', TIME_OPTS.map(([v, n]) => ({ label: n, small: String(f.time) === v ? '●' : '', fn: () => { f.time = v; fTouched(); pgRender(true); } }))),
      }, 210],
      loose ? null : [{
        cls: 'r-type', icon: 'layers', label: 'Tipo de track', val: typeName(f.trackType), go: false,
        fn: () => actionSheet('Tipo de track', '', '', TYPE_OPTS.map(([v, n]) => ({ label: n, small: String(f.trackType || '0') === v ? '●' : '', fn: () => { f.trackType = v; fTouched(); pgRender(true); } }))),
      }, 320],
    ]);
    if (!isStart && !loose) {
      add('<div class="sec">Más</div>');
      const g = add('<div class="grp grpf"></div>');
      g.appendChild(el('<div class="lab">Buscar por título</div>'));
      const inp = g.appendChild(el('<input class="txt srch-t" type="search" placeholder="Mín. 3 letras" autocomplete="off" autocapitalize="off">'));
      inp.value = f.search || '';
      inp.addEventListener('input', () => { f.search = clean(inp.value); fdraft.dirty = true; });
      const tg = g.appendChild(el('<div class="tg"><div><b>Solo disponibles</b><small>Oculta los tracks que solo se pueden votar</small></div><button class="sw sw-av" aria-label="Solo disponibles"></button></div>'));
      const sw = $('.sw-av', tg);
      sw.classList.toggle('on', String(f.available) !== '0');
      sw.addEventListener('click', () => { f.available = String(f.available) === '0' ? '1' : '0'; sw.classList.toggle('on', String(f.available) !== '0'); fdraft.dirty = true; });
    }
    const same = comboKey(f) === comboKey(defFilters);
    if (isStart) {
      grp3(b, '', [[{ cls: 'r-clear', icon: 'xs', label: 'Quitar todos los filtros', go: false, disabled: comboKey(f) === comboKey({}), fn: () => { Object.assign(f, comboOf({})); fTouched(); pgRender(true); } }, 0]]).classList.add('grpx');
      add(`<div class="note okn">${i('check')}Se guardan solos al cambiarlos</div>`);
    } else {
      grp3(b, '', [[{ cls: 'r-reset', icon: 'refresh', label: 'Volver a los predeterminados', val: same ? 'Ya son estos' : describeFilters(defFilters), go: false, disabled: same, fn: () => { Object.assign(f, comboOf(defFilters)); fTouched(); pgRender(true); } }, 0]]).classList.add('grpx');
      const ap = el('<button class="btn pri bapply">Aplicar filtros</button>');
      ap.addEventListener('click', applyDraft);
      const pin = el(`<button class="btn bpin r-pin"${same ? ' disabled' : ''}>Fijar como predeterminados</button>`);
      pin.addEventListener('click', () => { if (comboKey(f) === comboKey(defFilters)) return; orderBpm(f); setStartFilters(f); toast('Fijados: la app se abrirá con estos filtros'); pgRender(true); });
      foot.appendChild(ap);
      foot.appendChild(pin);
    }
    return isStart ? 'Filtros predeterminados' : 'Filtros actuales';
  }
  // Tonos elegidos por número de la rueda (los nombres que valen lo mismo, juntos)
  const keyCams = (keys) => { const out = []; keys.forEach((k) => { const c = camelot(k) || k; if (!out.includes(c)) out.push(c); }); return out.sort((a, z) => camSort(a) - camSort(z)); };
  function bpmkey3(b) {
    if (!fdraft) { pgPop(0); return ''; }
    const f = fdraft.f;
    const opts = keyOptions();
    const cams = [];
    opts.forEach((k) => { if (k.cam && !cams.some((c) => c.cam === k.cam)) cams.push({ cam: k.cam, ids: opts.filter((x) => x.cam === k.cam).map((x) => x.id), name: k.id }); });
    const row = (letter) => cams.filter((c) => new RegExp(letter + '$').test(c.cam)).sort((a, z) => camSort(a.cam) - camSort(z.cam));
    const chip = (c) => `<button class="kc" data-c="${esc(c.cam)}" style="--kh:${keyHue(c.name)}"><b>${esc(c.cam)}</b><small>${esc(c.name)}</small></button>`;
    b.innerHTML = `
      <div class="sec">BPM <a href="#" class="bpmclear">Quitar</a></div>
      <div class="grp grpf bkb">
        <div class="bpm bkv"><input class="bmin" type="number" inputmode="numeric" placeholder="mín" min="0" max="260" aria-label="BPM mínimo"><span>–</span><input class="bmax" type="number" inputmode="numeric" placeholder="máx" min="0" max="260" aria-label="BPM máximo"><small>BPM</small></div>
        <div class="presets">${[[120, 126], [124, 130], [127, 140], [128, 132], [130, 140], [135, 150]].map(([a, z]) => `<button class="tag bp" data-a="${a}" data-z="${z}">${a}–${z}</button>`).join('')}</div>
      </div>
      <div class="sec">Tono <a href="#" class="gclear">Quitar</a></div>
      <div class="note kcn"></div>
      <div class="kgrid">${row('A').map(chip).join('')}</div>
      <div class="kgrid">${row('B').map(chip).join('')}</div>
      <div class="note">Cada número de la rueda Camelot tiene su color: los vecinos (7A · 8A · 9A) mezclan bien.</div>`;
    const mn = $('.bmin', b);
    const mx = $('.bmax', b);
    const paint = (fields) => {
      if (fields) { mn.value = f.bpmMin != null ? f.bpmMin : ''; mx.value = f.bpmMax != null ? f.bpmMax : ''; }
      $$('.bp', b).forEach((x) => x.classList.toggle('on', +x.dataset.a === f.bpmMin && +x.dataset.z === f.bpmMax));
      const on = keyCams(f.keys);
      $$('.kc', b).forEach((x) => x.classList.toggle('on', on.includes(x.dataset.c)));
      $('.kcn', b).textContent = on.length ? on.join(' · ') : 'Cualquier tono';
    };
    const read = () => {
      const a = parseInt(mn.value, 10);
      const z = parseInt(mx.value, 10);
      f.bpmMin = isFinite(a) ? Math.max(0, Math.min(260, a)) : null;
      f.bpmMax = isFinite(z) ? Math.max(0, Math.min(260, z)) : null;
      fTouched();
      paint(false);
    };
    mn.addEventListener('input', read);
    mx.addEventListener('input', read);
    const tidy = () => { if (orderBpm(f)) fTouched(); paint(true); };
    mn.addEventListener('change', tidy);
    mx.addEventListener('change', tidy);
    $$('.bp', b).forEach((x) => x.addEventListener('click', () => { f.bpmMin = +x.dataset.a; f.bpmMax = +x.dataset.z; fTouched(); paint(true); }));
    $('.bpmclear', b).addEventListener('click', (e) => { e.preventDefault(); f.bpmMin = f.bpmMax = null; fTouched(); paint(true); });
    $$('.kc', b).forEach((x) => x.addEventListener('click', () => {
      const c = cams.find((y) => y.cam === x.dataset.c);
      if (!c) return;
      const has = f.keys.some((k) => c.ids.includes(k));
      f.keys = has ? f.keys.filter((k) => !c.ids.includes(k)) : f.keys.concat(c.ids[0]);
      fTouched();
      paint(false);
    }));
    $('.gclear', b).addEventListener('click', (e) => { e.preventDefault(); f.keys = []; fTouched(); paint(false); });
    paint(true);
    return 'BPM y tono';
  }
  function home3(b) {
    fdraft = null;
    const lp = LS.get('lastPlay', null);
    const sameAsCur = !!(current && lp && lp.id === current.id);
    const played = !!(current && (sameAsCur || !audio.paused || audio.currentTime > 0));
    const t = played ? current : lp && lp.id ? lp : null;
    const srcTitle = played ? (sameAsCur && lp.srcTitle) || (cur ? cur.title : '') : lp ? lp.srcTitle : '';
    const hdr = el(`<div class="hmh"><div><div class="hmd">${esc(homeDate())}</div><h1>Home</h1></div>${tabsB() ? `<button class="ibtn hmset" aria-label="Ajustes">${i('set2')}</button>` : ''}</div>`);
    const hs = $('.hmset', hdr);
    if (hs) hs.addEventListener('click', () => pgOpen('settings'));
    b.appendChild(hdr);
    if (t) {
      const d = audio.duration;
      const pct = current && t === current && isFinite(d) && d > 0 ? Math.min(100, (audio.currentTime / d) * 100) : 0;
      const card = el(`<button class="hmcard hmcont">${homeCover(t.cover, 'hmcc')}<span class="hmct"><span class="hmk">SIGUE ESCUCHANDO</span><b>${esc(t.name)}</b><small>${esc([t.artist, srcTitle].filter(Boolean).join(' · '))}</small>${pct ? `<span class="hmbar"><span style="width:${pct.toFixed(1)}%"></span></span>` : ''}</span><span class="hmplay">${i(current && t === current && !audio.paused ? 'pause' : 'play')}</span></button>`);
      card.addEventListener('click', () => resumeLast(played ? Object.assign({}, sameAsCur ? lp : null, { id: current.id }) : lp));
      b.appendChild(card);
    }
    // desde Home, ir a una sección cierra Home (aunque ya fuera la lista de debajo)
    const goSec = (k) => {
      pgClose();
      if (stack.length === 1 && cur && cur.kind === 'section' && cur.key === k && !cur.error && !cur.needLogin) { setView('list'); return; }
      openSection(k);
    };
    const fol = el('<div class="hmcard hmfol" role="button" tabindex="0"></div>');
    fol.addEventListener('click', (e) => {
      const play = !!(e.target.closest && e.target.closest('.hmgo.hmplaynew'));
      goSec('followed');
      if (!play || !cur || cur.key !== 'followed') return;
      // ya cargada: suena dentro del toque (el iPhone lo pide); si hay que traerla, en cuanto llegue
      if (cur.loaded) { playNewFol(); return; }
      const s0 = cur;
      ensureLoaded(s0).then(() => { if (cur === s0) playNewFol(); });
    });
    b.appendChild(fol);
    b.appendChild(el('<div class="sec">Tu música</div>'));
    const tiles = el('<div class="hmtiles"></div>');
    const tile = (cls, icon, hue, title, big, sub, fn) => {
      const x = el(`<button class="hmtile ${cls}" style="--ih:${hue}"><span class="hmti">${i(icon)}</span><b>${esc(big)}</b><span class="hmtt">${esc(title)}</span><small>${esc(sub)}</small></button>`);
      x.addEventListener('click', fn);
      tiles.appendChild(x);
    };
    const fv = favCount();
    const dl = dlLeft();
    const vl = voteLeft();
    tile('hm-fav', 'star', 45, 'Favoritos', fmtN(fv), 'en Soundeo', () => goSec('favs'));
    tile('hm-dl', 'dl', 200, 'Mis descargas', fmtN(dl), dl == null ? 'lo que has bajado' : dl === 1 ? 'queda hoy' : 'quedan hoy', () => goSec('downloads'));
    tile('hm-fol', 'users', 280, 'Seguidos', '…', 'nuevas', () => goSec('followed'));
    tile('hm-vote', 'heart', 345, 'Me gusta', fmtN(vl), vl === 1 ? 'libre hoy' : 'libres hoy', () => {
      if (stack.length === 1 && cur && cur.key === 'votes' && !cur.error && !cur.needLogin) { pgClose(); setView('list'); } else openVotes();
    });
    b.appendChild(tiles);
    homeSeguidos(fol);
    b.appendChild(el(`<div class="sec">Tus combinaciones <span class="svn">un toque y al Feed</span></div>`));
    const combos = el('<div class="hmcombos"></div>');
    if (savedFilters.length) {
      savedFilters.forEach((sv, k) => {
        const x = el(`<button class="hmcombo" style="--ih:${[200, 280, 30, 140, 330][k % 5]}"><span></span>${esc(sv.name)}</button>`);
        x.addEventListener('click', () => {
          // como al aplicar unos filtros: sobre los predeterminados, en Descargas disponibles (o Todos, si así están)
          const f = Object.assign(cleanFilters(defFilters), comboOf(sv.f), { search: '' });
          openSource(sectionDesc(String(f.available) === '0' ? 'all' : 'avail', f), { root: true, view: 'feed' });
        });
        combos.appendChild(x);
      });
    } else {
      const x = el(`<button class="hmcombo hmc0">${i('plus')}Guarda tus combinaciones de filtros</button>`);
      x.addEventListener('click', () => { if (tabsB()) pgOpen('settings'); else settingsGo(); pgOpen('filters', cur && cur.canFilter ? 'cur' : 'start'); });
      combos.appendChild(x);
    }
    b.appendChild(combos);
    // Parecidas a lo que suena o sonó (Soundeo solo las tiene para tracks publicados: id numérico)
    const simT = t && /^\d+$/.test(String(t.id)) ? t : null;
    if (simT) {
      const sh = b.appendChild(el(`<div class="sec"><span class="sect">Parecidas a «${esc(simT.name)}»</span><a href="#" class="hmall">Ver todas</a></div>`));
      const all = $('.hmall', sh);
      if (all) all.addEventListener('click', (e) => { e.preventDefault(); pgClose(); openSimilar(simT); });
      const sim = el('<div class="hmsimbox"></div>');
      b.appendChild(sim);
      homeSimilar(sim, simT);
    }
    b.appendChild(el('<div class="sec">Hoy</div>'));
    const unheard = cur && tracks.length ? tracks.filter((x) => !isHeard(x)).length : null;
    b.appendChild(el(`<div class="hmstats"><span><b>${heardTodayN()}</b><small>escuchadas hoy</small></span><span><b>${fmtN(unheard)}</b><small>sin escuchar${cur ? ' en ' + esc(cur.title) : ''}</small></span></div>`));
    return 'Home';
  }
  function chat3(b) {
    b.innerHTML = `<div class="cht">
      <div class="chb"><span class="chb1"></span><span class="chb2">${i('note')}</span></div>
      <span class="chs">MUY PRONTO</span>
      <h3>Pásate canciones con tus amigos</h3>
      <p>Conversaciones con clave, canciones como tarjeta y un toque para escucharlas en el Feed.</p>
      <button class="btn full" disabled>Nueva conversación</button>
      <button class="btn full chline" disabled>Unirme con una clave</button>
    </div>`;
    return 'Chat';
  }

  const PAGES = {
    // primera capa: lo que hay y cómo está, sin entrar
    settings(b) {
      if (ui3()) return settings3(b);
      fdraft = null;
      const add = (x) => { const n = typeof x === 'string' ? el(x) : x; b.appendChild(n); return n; };
      const canF = !!(cur && cur.canFilter);
      const curVal = canF
        ? cur.title + ' · ' + (comboKey(cur.filters) === comboKey(defFilters) && !cur.filters.search ? 'sin cambios' : describeFilters(cur.filters))
        : (cur ? cur.title + ' · ' : '') + 'esta lista no tiene filtros';
      const acc = clean($('#top-menu-account span') && $('#top-menu-account span').textContent);
      add('<div class="sec">Listas</div>');
      add(pgRow({ cls: 'r-fstart', icon: 'sliders', label: 'Filtros predeterminados', val: describeFilters(defFilters), fn: () => pgOpen('filters', 'start') }));
      add(pgRow({ cls: 'r-fcur', icon: 'rows', label: 'Filtros actuales', val: curVal, disabled: !canF, fn: () => pgOpen('filters', 'cur') }));
      add(pgRow({ cls: 'r-start', icon: 'feed', label: 'Al abrir', val: sectionByKey(prefs.startSection || 'avail').name + ' · vista ' + (prefs.startView === 'list' ? 'Lista' : 'Feed'), fn: () => pgOpen('start') }));
      add('<div class="sec">Escuchar</div>');
      add(pgRow({ cls: 'r-play', icon: 'play', label: 'Reproducción', val: 'Saltos −' + skipBack() + ' / +' + skipFwd() + ' s · precarga ' + (prefs.preload ? 'activada' : 'apagada'), fn: () => pgOpen('play') }));
      add(pgRow({ cls: 'r-look', icon: 'eye', label: 'Apariencia', val: 'Tono ' + keyFmtName() + ' · lista ' + (prefs.dense ? 'compacta' : 'cómoda') + ' · letra ' + (prefs.bigText ? 'grande' : 'normal'), fn: () => pgOpen('look') }));
      add('<div class="sec">App</div>');
      add(pgRow({ cls: 'r-diag', icon: 'more', label: 'Diagnóstico', val: 'Para Claude', go: false, fn: diagnostics }));
      if (loader()) add(pgRow({ cls: 'r-upd', icon: 'fwd', label: 'Buscar actualización', val: 'Versión ' + VERSION, go: false, fn: checkUpdate }));
      add(pgRow({ cls: 'r-web', icon: 'ext', label: 'Ver la web original', go: false, fn: () => { pgClose(); closeApp(); } }));
      versionTaps(add(`<div class="note vnote">Soundeo Feed ${VERSION}${loader() ? ' · se actualiza sola' : ''}${acc ? ' · Premium: ' + esc(acc) : ''}</div>`));
      return 'Ajustes';
    },
    // con qué arranca la app
    start(b) {
      b.innerHTML = `
        <div class="lab" style="margin-top:10px">Sección</div>
        <div class="tags tg-sec">${SECTIONS.map((x) => `<button class="tag" data-k="${x.key}">${esc(x.name)}</button>`).join('')}</div>
        <div class="lab">Vista al abrir</div>
        ${pgSeg('sv', [['feed', 'Feed'], ['list', 'Lista']], prefs.startView === 'list' ? 'list' : 'feed')}
        <div style="height:6px"></div>
        ${tgHtml('forceStart', 'Empezar siempre con los filtros predeterminados', 'Aunque entres desde un marcador, un enlace o soundeo.com')}
        ${tgHtml('autoOpen', 'Abrir la app automáticamente', 'Al entrar en Soundeo desde el móvil')}
        <button class="opt pri bmine" style="margin-top:6px">${i('feed')}<span>Ir ahora a la sección y filtros de inicio</span></button>`;
      const paintSec = () => $$('.tg-sec .tag', b).forEach((x) => x.classList.toggle('on', x.dataset.k === (prefs.startSection || 'avail')));
      paintSec();
      $$('.tg-sec .tag', b).forEach((x) => x.addEventListener('click', () => { prefs.startSection = x.dataset.k; savePrefs(); paintSec(); }));
      wireSeg(b, 'sv', (v) => { prefs.startView = v; savePrefs(); });
      wireSwitches(b);
      $('.bmine', b).addEventListener('click', goStart);
      return 'Al abrir';
    },
    play(b) {
      const sk = (k, title, vals) => `<div class="lab">${title} <small>segundos</small></div>
        <div class="bpm skr"><input class="skin" data-k="${k}" type="number" inputmode="numeric" min="1" max="99" aria-label="${title}, segundos"><div class="presets">${vals.map((v) => `<button class="tag skp" data-k="${k}" data-v="${v}">${v}</button>`).join('')}</div></div>`;
      b.innerHTML = `
        <div class="sec">Botones de salto</div>
        ${sk('skipBack', 'Atrás', [5, 10, 15, 30])}
        ${sk('skipFwd', 'Adelante', [10, 15, 30, 60])}
        <div class="note">Son los dos botones de los lados del reproductor. De 1 a 99 segundos.</div>
        <div class="sec">Al escuchar</div>
        ${tgHtml('autoNext', 'Pasar a la siguiente al acabar', 'Cuando termina la preview')}
        ${tgHtml('preload', 'Precargar las siguientes canciones', 'Empiezan a sonar al instante y se puede saltar por ellas sin esperar. Gasta más datos')}
        ${tgHtml('skipHeard', 'Feed: solo lo que no he escuchado', 'En las secciones, oculta los tracks que ya han sonado')}
        ${tgHtml('siteHeard', 'Sincronizar escuchadas con la web', 'Lo que Soundeo marca como escuchado cuenta aquí, y lo que escuchas aquí se marca en Soundeo')}
        ${tgHtml('confirmDownload', 'Confirmar antes de descargar', 'Para no gastar descargas sin querer')}`;
      const val = (k) => (k === 'skipBack' ? skipBack() : skipFwd());
      const paint = (fields) => {
        if (fields) $$('.skin', b).forEach((x) => { x.value = val(x.dataset.k); });
        $$('.skp', b).forEach((x) => x.classList.toggle('on', +x.dataset.v === val(x.dataset.k)));
      };
      const set = (k, v) => { prefs[k] = clampInt(v, 1, 99, DEFAULT_PREFS[k]); savePrefs(); paintSkips(); };
      $$('.skp', b).forEach((x) => x.addEventListener('click', () => { set(x.dataset.k, x.dataset.v); paint(true); }));
      $$('.skin', b).forEach((x) => {
        // se guarda mientras se escribe: en el iPhone, tocar ‹ no le quita el foco al campo
        x.addEventListener('input', () => { if (isFinite(parseInt(x.value, 10))) { set(x.dataset.k, x.value); paint(false); } });
        x.addEventListener('change', () => paint(true));
      });
      paint(true);
      wireSwitches(b);
      return 'Reproducción';
    },
    look(b) {
      b.innerHTML = `
        <div class="lab" style="margin-top:10px">Tono <small class="kfx"></small></div>
        ${pgSeg('kf', [['both', 'Los dos'], ['cam', 'Camelot'], ['mus', 'Musical']], prefs.keyFmt === 'cam' || prefs.keyFmt === 'mus' ? prefs.keyFmt : 'both')}
        <div class="lab">Lista</div>
        ${pgSeg('ldn', [['0', 'Cómoda'], ['1', 'Compacta']], prefs.dense ? '1' : '0')}
        <div class="lab">Tamaño de letra</div>
        ${pgSeg('ltx', [['0', 'Normal'], ['1', 'Grande']], prefs.bigText ? '1' : '0')}
        <div class="note">La letra grande se nota sobre todo en la lista; en el feed crece poco, para que todo siga cabiendo.</div>
        ${ui3() ? `<div class="lab">Barra de pestañas</div>
        ${pgSeg('tbl', [['settings', 'Ajustes'], ['list', 'Lista']], tabsB() ? 'list' : 'settings')}
        <div class="note tbn"></div>` : ''}
        <div class="sec">Pantalla</div>
        ${ui3() ? '' : tgHtml('ui2', 'Diseño nuevo (en pruebas)', 'Pestañas abajo (Feed, Lista, Buscar, Chat, Ajustes) y la lista se elige arriba. Solo en vertical')}
        ${prefs.ui3Unlocked ? tgHtml('ui3', 'Diseño 2 (en pruebas)', 'Home, color coral, iconos nuevos y Ajustes en bloques. Solo lo ves tú hasta que lo saques para todos') : ''}
        ${tgHtml('immersive', 'Esconder la barra de Safari', 'Desliza hacia arriba una vez y la barra se queda pequeña (en horizontal desaparece). Vuelve si la tocas')}
`;
      const ex = () => { $('.kfx', b).textContent = 'se verá «' + keyText('Amin') + '»'; };
      ex();
      wireSeg(b, 'kf', (v) => { prefs.keyFmt = v; savePrefs(); ex(); applyLook(); });
      wireSeg(b, 'ldn', (v) => { prefs.dense = v === '1'; savePrefs(); applyLook(); });
      wireSeg(b, 'ltx', (v) => { prefs.bigText = v === '1'; savePrefs(); applyLook(); });
      const tbn = $('.tbn', b);
      const tbText = () => { if (tbn) tbn.textContent = tabsB() ? 'Home, Feed, Lista, Buscar y Chat. Ajustes está en Home (arriba a la derecha).' : 'Home, Feed, Buscar, Chat y Ajustes. Feed y Lista se cambian arriba a la derecha.'; };
      tbText();
      if (tbn) wireSeg(b, 'tbl', (v) => { prefs.tabLayout = v === 'list' ? 'list' : 'settings'; savePrefs(); applyUi3(true); tbText(); });
      wireSwitches(b);
      // al apagar el diseño nuevo esta pantalla deja de existir: decir dónde quedan los ajustes
      const s2 = $('.sw[data-p="ui2"]', b);
      if (s2) s2.addEventListener('click', () => { if (!prefs.ui2) toast('Diseño de siempre: los ajustes vuelven a su botón de arriba'); });
      return 'Apariencia';
    },
    // segunda capa: filtros predeterminados ('start') o los de la lista que se ve ('cur')
    filters(b, foot, mode) {
      if (ui3()) return filters3(b, foot, mode);
      const isStart = mode === 'start';
      if (!isStart && !(cur && cur.canFilter)) {
        b.appendChild(el('<div class="note" style="margin-top:10px">Esta lista no tiene filtros.</div>'));
        return 'Filtros actuales';
      }
      if (!fdraft || fdraft.mode !== mode || (!isStart && fdraft.src !== cur)) {
        const f0 = cleanFilters(isStart ? defFilters : cur.filters);
        if (isStart) f0.search = '';
        fdraft = { mode, f: f0, src: isStart ? null : cur, dirty: false };
      }
      const f = fdraft.f;
      if (orderBpm(f) && isStart) setStartFilters(f);
      const loose = !isStart && !!cur.loose;
      const add = (x) => { const n = typeof x === 'string' ? el(x) : x; b.appendChild(n); return n; };
      add(`<div class="note" style="margin-top:6px">${isStart ? 'Con qué se abren la app y las secciones del menú. Seguidos va siempre sin filtros.' : 'Filtros de ' + esc(cur.title) + '.' + (loose ? ' En esta sección Soundeo puede no aplicar todos; el género se filtra en la app.' : '')}</div>`);
      add(pgRow({ cls: 'r-gen', label: 'Géneros', val: f.genres.length ? shortList(f.genres.map(genreName)) : 'Todos', small: f.genres.length ? String(f.genres.length) : '', fn: () => pgOpen('f-genres') }));
      add(pgRow({ cls: 'r-bpm', label: 'BPM', val: bpmText(f), fn: () => pgOpen('f-bpm') }));
      add(pgRow({ cls: 'r-key', label: 'Tono', val: f.keys.length ? shortList(f.keys.map((k) => (camelot(k) ? camelot(k) + ' ' : '') + k)) : 'Cualquiera', small: f.keys.length ? String(f.keys.length) : '', fn: () => pgOpen('f-keys') }));
      if (!loose) {
        add(pgRow({
          cls: 'r-time', label: 'Fecha de lanzamiento', val: timeName(f.time), go: false,
          fn: () => actionSheet('Fecha de lanzamiento', '', '', TIME_OPTS.map(([v, n]) => ({ label: n, small: String(f.time) === v ? '●' : '', fn: () => { f.time = v; fTouched(); pgRender(true); } }))),
        }));
        add(pgRow({
          cls: 'r-type', label: 'Tipo de track', val: typeName(f.trackType), go: false,
          fn: () => actionSheet('Tipo de track', '', '', TYPE_OPTS.map(([v, n]) => ({ label: n, small: String(f.trackType || '0') === v ? '●' : '', fn: () => { f.trackType = v; fTouched(); pgRender(true); } }))),
        }));
      }
      if (!isStart && !loose) {
        add('<div class="lab">Buscar por título</div>');
        const inp = add('<input class="txt srch-t" type="search" placeholder="Mín. 3 letras" autocomplete="off" autocapitalize="off">');
        inp.value = f.search || '';
        inp.addEventListener('input', () => { f.search = clean(inp.value); fdraft.dirty = true; });
        const tg = add('<div class="tg"><div><b>Solo disponibles</b><small>Oculta los tracks que solo se pueden votar</small></div><button class="sw sw-av" aria-label="Solo disponibles"></button></div>');
        const sw = $('.sw-av', tg);
        sw.classList.toggle('on', String(f.available) !== '0');
        sw.addEventListener('click', () => { f.available = String(f.available) === '0' ? '1' : '0'; sw.classList.toggle('on', String(f.available) !== '0'); fdraft.dirty = true; });
      }
      const same = comboKey(f) === comboKey(defFilters);
      if (isStart) {
        add(pgRow({ cls: 'r-clear', icon: 'close', label: 'Quitar todos los filtros', go: false, disabled: comboKey(f) === comboKey({}), fn: () => { Object.assign(f, comboOf({})); fTouched(); pgRender(true); } }));
      } else {
        add(pgRow({ cls: 'r-reset', icon: 'back', label: 'Volver a los predeterminados', val: same ? 'Ya son estos' : describeFilters(defFilters), go: false, disabled: same, fn: () => { Object.assign(f, comboOf(defFilters)); fTouched(); pgRender(true); } }));
      }
      add(`<div class="sec">Guardados <span class="svn">${savedFilters.length} de ${MAX_SAVED}</span></div>`);
      const here = comboKey(f);
      savedFilters.forEach((sv) => {
        const on = comboKey(sv.f) === here;
        const r = add(`<div class="svrow${on ? ' on' : ''}"><button class="opt svgo"><span class="ol"><span>${esc(sv.name)}</span><em>${esc(describeFilters(sv.f))}</em></span>${on ? '<small>●</small>' : ''}</button><button class="rb svmore" aria-label="Opciones de ${esc(sv.name)}">${i('more')}</button></div>`);
        $('.svgo', r).addEventListener('click', () => useSaved(sv));
        $('.svmore', r).addEventListener('click', () => savedMenu(sv));
      });
      if (!savedFilters.length) add(`<div class="note" style="margin-top:0">Guarda hasta ${MAX_SAVED} combinaciones de filtros para cambiar de una a otra con un toque.</div>`);
      add(pgRow({ cls: 'r-save', icon: 'plus', label: 'Guardar combinación', val: 'Los filtros de esta pantalla', go: false, fn: saveComboGo }));
      if (!isStart) {
        add(pgRow({
          cls: 'r-pin', icon: 'check', label: 'Fijar como predeterminados', val: same ? 'Ya son los predeterminados' : 'La app se abrirá con estos filtros', go: false, disabled: same,
          fn: () => { orderBpm(f); setStartFilters(f); toast('Fijados: la app se abrirá con estos filtros'); pgRender(true); },
        }));
        const ap = el('<button class="btn pri bapply">Aplicar filtros</button>');
        ap.addEventListener('click', applyDraft);
        foot.appendChild(ap);
      }
      return isStart ? 'Filtros predeterminados' : 'Filtros actuales';
    },
    // tercera capa
    'f-genres'(b) {
      if (!fdraft) { pgPop(0); return ''; }
      const f = fdraft.f;
      b.innerHTML = `<div class="lab" style="margin-top:10px"><span class="gcount"></span><a href="#" class="gclear">Quitar todos</a></div>
        <div class="tags tg-genres">${genreOptions().map((g) => `<button class="tag" data-id="${esc(g.id)}">${esc(g.name)}</button>`).join('')}</div>`;
      const paint = () => {
        $$('.tag', b).forEach((x) => x.classList.toggle('on', f.genres.includes(x.dataset.id)));
        $('.gcount', b).textContent = f.genres.length ? f.genres.length + (f.genres.length === 1 ? ' seleccionado' : ' seleccionados') : 'Todos los géneros';
      };
      $$('.tag', b).forEach((x) => x.addEventListener('click', () => {
        const id = x.dataset.id;
        f.genres = f.genres.includes(id) ? f.genres.filter((g) => g !== id) : f.genres.concat(id);
        fTouched();
        paint();
      }));
      $('.gclear', b).addEventListener('click', (e) => { e.preventDefault(); f.genres = []; fTouched(); paint(); });
      paint();
      return 'Géneros';
    },
    'f-bpm'(b) {
      if (!fdraft) { pgPop(0); return ''; }
      const f = fdraft.f;
      b.innerHTML = `<div class="lab" style="margin-top:10px">De cuánto a cuánto <a href="#" class="bpmclear">Quitar</a></div>
        <div class="bpm"><input class="bmin" type="number" inputmode="numeric" placeholder="mín" min="0" max="260" aria-label="BPM mínimo"><span>–</span><input class="bmax" type="number" inputmode="numeric" placeholder="máx" min="0" max="260" aria-label="BPM máximo"></div>
        <div class="presets">${[[120, 126], [124, 130], [127, 140], [130, 140], [135, 150]].map(([a, z]) => `<button class="tag bp" data-a="${a}" data-z="${z}">${a}–${z}</button>`).join('')}</div>`;
      const mn = $('.bmin', b);
      const mx = $('.bmax', b);
      const paint = (fields) => {
        if (fields) { mn.value = f.bpmMin != null ? f.bpmMin : ''; mx.value = f.bpmMax != null ? f.bpmMax : ''; }
        $$('.bp', b).forEach((x) => x.classList.toggle('on', +x.dataset.a === f.bpmMin && +x.dataset.z === f.bpmMax));
      };
      // se guarda mientras se escribe: en el iPhone, tocar ‹ no le quita el foco al campo
      const read = () => {
        const a = parseInt(mn.value, 10);
        const z = parseInt(mx.value, 10);
        f.bpmMin = isFinite(a) ? Math.max(0, Math.min(260, a)) : null;
        f.bpmMax = isFinite(z) ? Math.max(0, Math.min(260, z)) : null;
        fTouched();
        paint(false);
      };
      mn.addEventListener('input', read);
      mx.addEventListener('input', read);
      const tidy = () => { if (orderBpm(f)) fTouched(); paint(true); };
      mn.addEventListener('change', tidy);
      mx.addEventListener('change', tidy);
      $$('.bp', b).forEach((x) => x.addEventListener('click', () => { f.bpmMin = +x.dataset.a; f.bpmMax = +x.dataset.z; fTouched(); paint(true); }));
      $('.bpmclear', b).addEventListener('click', (e) => { e.preventDefault(); f.bpmMin = f.bpmMax = null; fTouched(); paint(true); });
      paint(true);
      return 'BPM';
    },
    'f-keys'(b) {
      if (!fdraft) { pgPop(0); return ''; }
      const f = fdraft.f;
      b.innerHTML = `<div class="lab" style="margin-top:10px"><span class="gcount"></span><a href="#" class="gclear">Quitar todos</a></div>
        <div class="tags tg-keys">${keyOptions().map((k) => `<button class="tag" data-id="${esc(k.id)}"><small>${esc(k.cam)}</small>${esc(k.id)}</button>`).join('')}</div>`;
      const paint = () => {
        $$('.tag', b).forEach((x) => x.classList.toggle('on', f.keys.includes(x.dataset.id)));
        $('.gcount', b).textContent = f.keys.length ? f.keys.length + (f.keys.length === 1 ? ' tono' : ' tonos') : 'Cualquier tono';
      };
      $$('.tag', b).forEach((x) => x.addEventListener('click', () => {
        const id = x.dataset.id;
        f.keys = f.keys.includes(id) ? f.keys.filter((k) => k !== id) : f.keys.concat(id);
        fTouched();
        paint();
      }));
      $('.gclear', b).addEventListener('click', (e) => { e.preventDefault(); f.keys = []; fTouched(); paint(); });
      paint();
      return 'Tono';
    },
    // nombre de una combinación guardada (nueva o ya existente)
    'f-name'(b, foot, arg) {
      if (!fdraft) { pgPop(0); return ''; }
      const sv = arg && arg.id != null ? savedFilters.find((x) => x.id === arg.id) : null;
      const f = sv ? sv.f : fdraft.f;
      const frm = el(`<form class="svform" action="#"><div class="note" style="margin-top:6px">${esc(describeFilters(f))}</div><div class="lab">Nombre</div><input class="txt svname" type="text" enterkeyhint="done" maxlength="28" placeholder="Por ejemplo: House rápido" autocomplete="off" autocorrect="off" spellcheck="false"></form>`);
      const inp = $('.svname', frm);
      inp.value = sv ? sv.name : '';
      const save = (e) => {
        if (e) e.preventDefault();
        const name = clean(inp.value).slice(0, 28) || (sv ? sv.name : describeFilters(f).slice(0, 28));
        if (sv) { sv.name = name; toast('Renombrado: «' + name + '»'); }
        else {
          if (savedFilters.length >= MAX_SAVED) { toast('Ya hay ' + MAX_SAVED + ' guardados: borra uno para guardar otro'); return; }
          savedFilters.push({ id: 'f' + Date.now().toString(36), name, f: comboOf(f) });
          toast('Guardado: «' + name + '»');
        }
        saveSaved();
        pgBack();
      };
      frm.addEventListener('submit', save);
      b.appendChild(frm);
      const ok = el('<button class="btn pri bsvok">Guardar</button>');
      ok.addEventListener('click', () => save());
      foot.appendChild(ok);
      try { inp.focus(); } catch (e) {}
      return sv ? 'Renombrar' : 'Guardar combinación';
    },
    // 2.2 · Diseño 2
    'f-bpmkey'(b) { return bpmkey3(b); },
    home(b) { return home3(b); },
    chat(b) { return chat3(b); },
  };

  /* ───────────── ajustes ───────────── */
  // Interruptores de un ajuste sí / no (`data-p`): los usan la hoja de siempre y las pantallas del diseño nuevo.
  function wireSwitches(b) {
    $$('.sw[data-p]', b).forEach((x) => {
      const p = x.dataset.p;
      x.classList.toggle('on', !!prefs[p]);
      x.addEventListener('click', () => {
        prefs[p] = !prefs[p];
        savePrefs();
        x.classList.toggle('on', !!prefs[p]);
        if (p === 'skipHeard' || p === 'siteHeard') {
          setHidden(cur && cur.hide ? hiddenFor(tracks, cur) : new Set());
          setForced(new Set());
          rebuild(current || deck[activeIdx]);
        }
        if (p === 'preload' && !prefs.preload) dropPreloads();
        if (p === 'immersive') { LS.set('immHint', 0); LS.set('immH', {}); imm.rec = null; immApply(); }
        if (p === 'ui2') applyUi();
        if (p === 'ui3') {
          // el Diseño 2 va encima del diseño nuevo
          if (prefs.ui3 && !prefs.ui2) prefs.ui2 = true;
          savePrefs();
          closeSheets();
          applyUi();
          if (pgOn()) pgRender(true);
          toast(prefs.ui3 ? 'Diseño 2 activado' : 'Vuelves al diseño nuevo');
        }
      });
    });
  }
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
      <div class="tg"><div><b>Diseño nuevo (en pruebas)</b><small>Pestañas abajo (Feed, Lista, Buscar, Chat, Ajustes) y la lista se elige arriba. Solo en vertical</small></div><button class="sw" data-p="ui2"></button></div>
      ${prefs.ui3Unlocked ? '<div class="tg"><div><b>Diseño 2 (en pruebas)</b><small>Home, color coral, iconos nuevos y Ajustes en bloques. Solo lo ves tú hasta que lo saques para todos</small></div><button class="sw" data-p="ui3"></button></div>' : ''}
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
      ${loader() ? `<button class="opt oupd">${i('fwd')}<span>Buscar actualización</span><small>v${VERSION}</small></button>` : ''}
      <button class="opt diag">${i('more')}<span>Diagnóstico (para Claude)</span></button>
      <div class="note vnote">Soundeo Feed ${VERSION}${loader() ? ' · se actualiza sola' : ''}${acc ? ' · Premium: ' + esc(acc) : ''}</div>`}
    `;
    const vn = $('.vnote', b);
    if (vn) versionTaps(vn);
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
    wireSwitches(b);
    const paintSv = () => $$('.sv button', b).forEach((x) => x.classList.toggle('on', x.dataset.v === prefs.startView));
    paintSv();
    $$('.sv button', b).forEach((x) => x.addEventListener('click', () => { prefs.startView = x.dataset.v; savePrefs(); paintSv(); }));
    $('.gomenu', b).addEventListener('click', openMenu);
    $('.goweb', b).addEventListener('click', () => { closeSheets(); closeApp(); });
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
  let diagBusy = false;
  async function diagnostics() {
    if (diagBusy) return;
    diagBusy = true;
    try { await diagnosticsRun(); } finally { diagBusy = false; }
  }
  async function diagnosticsRun() {
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
        tries: s.tries || undefined, filtersOn: s.filtersOn || undefined, bounced: s.bounced || undefined, needLogin: s.needLogin || undefined,
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
      entry: LS.get('entry', null), // 2.1.4: la última vez que se abrió la portada (cómo se llegó y si se pasó a la lista)
      session: (() => {
        // sin datos de la cuenta ni cookies: solo si la página trae sesión y si lo guardado en el móvil dura
        let keys = 0;
        try { for (let k = 0; k < localStorage.length; k++) if (/^sxfeed:/.test(localStorage.key(k))) keys++; } catch (e) { keys = -1; }
        const born = LS.get('born', 0);
        const age = (t) => (t ? Math.round((Date.now() - t) / 60000) : null);
        return { logged: isLoggedIn(), looksOut: looksLoggedOut(), host: location.hostname, cookiesOn: navigator.cookieEnabled, storedKeys: keys, storedMin: age(born), reloadedMin: age(SS.get('relog', 0)), wantLogin: !!SS.get('wantLogin', 0) };
      })(),
      screen: {
        imm: !!prefs.immersive, ui2: !!prefs.ui2, pg: pgStack.map((x) => x.id), on: imm.on, armed: imm.armed, y: Math.round(window.scrollY), ih: window.innerHeight, iw: window.innerWidth,
        vv: window.visualViewport ? Math.round(window.visualViewport.height) : null, sh: screen.height, sw: screen.width, sab: immSab(),
        measured: imm.h ? { h: imm.h, w: imm.w, sab: imm.sab } : null, log: imm.log,
        // 2.1.2: lo apuntado de la barra, el teclado y el paso por las pantallas de Ajustes
        rec: (() => { const r = immRec(); return { w: r.w, hi: r.hi, u0: r.u0 }; })(), full: immFull(), moved: imm.moved, ih0: imm.ih0, touch: imm.touch, paused: imm.paused, typing: typing(),
        svh: (() => { const p = $('.psv', root); return p ? p.offsetHeight : null; })(), lvh: (() => { const p = $('.plv', root); return p ? p.offsetHeight : null; })(),
        cv: root.style.getPropertyValue('--cv'), cvfix: root.classList.contains('cvfix'), sr: (() => { try { return history.scrollRestoration; } catch (e) { return null; } })(), nav: pgLog,
        // 2.1.5: cómo se sujeta la pantalla completa (m), dedos parados por la inercia (guard), movimientos que Safari ya no
        // dejaba cortar con la barra escondida (nc) y si la página está quieta a la fuerza (hold, modo B)
        pin: imm.pinH, kbFull: imm.kbFull,
        list: { y: listEl ? Math.round(listEl.scrollTop) : null, keep: Math.round(lsg.keep), jumps: lsg.jumps, last: lsg.last },
        lk: { guard: imm.guard, nc: imm.nc, brakes: imm.brakes, small: !!(root && root.classList.contains('cvsm')), geoHi: imm.geoHi },
      },
      // 2.1: ajustes nuevos, y qué valores de «tipo de track» ofrece la web de verdad (el filtro usa los de una página guardada)
      look: { skipBack: skipBack(), skipFwd: skipFwd(), keyFmt: prefs.keyFmt || 'both', dense: !!prefs.dense, big: !!prefs.bigText, saved: savedFilters.length },
      trackTypes: (() => {
        try {
          const seen = new Map();
          $$('a[href*="trackTypeFilter="]').slice(0, 600).forEach((a) => {
            const m = /trackTypeFilter=([^&#]+)/.exec(a.getAttribute('href') || '');
            if (m && m[1] !== '0' && !seen.has(m[1]) && seen.size < 8) seen.set(m[1], short(clean(a.textContent), 30));
          });
          const ctl = $$('[name="trackTypeFilter"]').slice(0, 6).map((n) => ({ tag: n.tagName, type: n.type || '', value: short(String(n.value), 20), text: short(clean((n.parentNode || n).textContent), 40), opts: n.options ? Array.from(n.options).slice(0, 10).map((o) => o.value + '=' + short(clean(o.textContent), 20)) : undefined }));
          return { links: Array.from(seen.entries()), controls: ctl };
        } catch (e) { return { err: String(e && e.message) }; }
      })(),
      votes: { shapes: Array.from(voteShapes.values()), detect: voteDetect, mine: myVotes.size, votable: tracks.filter((x) => x.vote).length, voted: tracks.filter((x) => x.vote && isVoted(x)).length },
      siteListened: { tracks: tracks.length, siteHeard: tracks.filter((x) => x.siteHeard).length, mine: tracks.filter((x) => heard.has(x.id)).length, heardTotal: heard.size },
      keep: { lists: Object.keys(keepMap).length, cur: (keepIds(cur) || new Set()).size }, // 2.1.9: escuchadas que se conservan al recargar
      // 2.2 · Diseño 2: si está puesto, la barra, hace cuánto se usó, dónde estaba y lo de Seguidos (sin datos de la cuenta)
      d2: (() => {
        const la = LS.get('lastActive', 0);
        const ln = LS.get('lastNav', null);
        const fs = folSeen();
        const fc = folCache || LS.get('folCache', null);
        return { on: ui3(), unlocked: !!prefs.ui3Unlocked, tabs: prefs.tabLayout, idleMin: la ? Math.round((Date.now() - la) / 60000) : null, nav: ln ? { min: Math.round((Date.now() - ln.t) / 60000), kind: ln.src && ln.src.kind, key: ln.src && ln.src.key, view: ln.view, tab: ln.tab } : null,
          folSeen: fs && Array.isArray(fs.ids) ? { n: fs.ids.length, min: Math.round((Date.now() - fs.t) / 60000) } : null, folCache: fc && Array.isArray(fc.tracks) ? { n: fc.tracks.length, min: Math.round((Date.now() - fc.t) / 60000), nuevas: folNewOf(fc.tracks, fs).length } : null, folNew: folNew.size, today: heardTodayN() };
      })(),
    };
    if (t) {
      const fb = origFav(t);
      out.favBtn = fb ? short(fb.outerHTML, 200) : null;
      if (t.trackUrl) try {
        // la ficha tal como la da Soundeo (filas de su tabla) y lo que la app lee de ella
        const r = await fetch(t.trackUrl, { credentials: 'include' });
        const html = await r.text();
        out.trackStatus = r.status;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const scope = stripChrome(doc);
        out.trackRows = scope ? $$('tr', scope).slice(0, 14).map((tr) => Array.from(tr.children).slice(0, 2).map((c) => short(c.textContent, 50))) : null;
        const pm = parseTrackPage(html, t);
        out.trackParsed = pm ? { b: pm.b, k: pm.k, via: pm.via } : null;
        // el trozo de la página donde están de verdad el BPM y el tono (enlaces que filtran por ellos)
        const src = scope ? scope.innerHTML.replace(/\s+/g, ' ') : '';
        const around = (re, n) => { const k = src.search(re); return k >= 0 ? src.slice(Math.max(0, k - n), k + n) : null; };
        out.trackBpmSnippet = around(/bpmFilter=[^&"']/, 260) || around(/>\s*BPM\b/i, 260);
        out.trackKeySnippet = around(/keyFilter=[^&"']/, 200) || around(/>\s*Key\b/i, 200);
      } catch (e) { out.trackErr = String(e); }
    }
    // ¿algún BPM de los que se enseñan se sale del filtro de la lista? (Soundeo ya la filtra: no debería)
    const bf = cur && !cur.loose && cur.filters;
    if (bf && (bf.bpmMin != null || bf.bpmMax != null)) {
      const lo = bf.bpmMin != null ? bf.bpmMin : 0;
      const hi = bf.bpmMax != null ? bf.bpmMax : 999;
      const known = tracks.filter((x) => metaCache[x.id] && metaCache[x.id].b);
      const bad = known.filter((x) => metaCache[x.id].b < lo - 1 || metaCache[x.id].b > hi + 1);
      out.bpmCheck = { filter: lo + '-' + hi, known: known.length, out: bad.length, samples: bad.slice(0, 5).map((x) => ({ id: x.id, b: metaCache[x.id].b, label: short(x.label, 30), artist: short(x.artist, 30) })) };
    }
    out.lastStatus = lastStatus;
    showDiag('Diagnóstico', JSON.stringify(out, null, 1));
  }
  function showDiag(title, txt, extra) {
    const s = $('.s-action', root);
    $('h2', s).textContent = title;
    const b = $('.sb', s);
    b.innerHTML = '<div class="note" style="margin-top:0">Copia esto y pégamelo en el chat (no incluye contraseñas ni cookies).</div><textarea class="diag" readonly></textarea><div class="stack"><button class="btn pri full bcopy">Copiar</button></div>' + (extra || '');
    $('textarea', b).value = txt;
    $('.bcopy', b).addEventListener('click', () => copyText(txt));
    openSheet('s-action');
  }

  /* ───────────── toasts y contadores ───────────── */
  function toast(msg, actionLabel, fn, ms) {
    if (!toastsEl || !isOpen) return null;
    const t = el(`<div class="toast"><span>${esc(msg)}</span>${actionLabel ? '<button>' + esc(actionLabel) + '</button>' : ''}</div>`);
    if (actionLabel) $('button', t).addEventListener('click', () => { t.remove(); fn && fn(); });
    // 2.2 · Diseño 2: un solo aviso a la vez (el nuevo sustituye al anterior)
    if (ui3()) toastsEl.textContent = '';
    toastsEl.appendChild(t);
    while (toastsEl.children.length > 3) toastsEl.firstElementChild.remove();
    setTimeout(() => t.remove(), ms || (actionLabel ? 6000 : 2600));
    return t;
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
    // «Iniciar sesión» pulsado desde la app hace menos de 20 min: al terminar, volver a donde se estaba
    const recent = (k) => { const t = SS.get(k, 0); return !!t && Date.now() - t < 20 * 60000; };
    const wantLogin = recent('wantLogin');
    if (logged) {
      justLogged = !!SS.get('loggedOut', 0) || wantLogin;
      SS.del('loggedOut');
      SS.del('wantLogin');
      if (wantLogin) SS.del('closed');
    }
    const loggedOut = !logged && looksLoggedOut();
    if (loggedOut) SS.set('loggedOut', 1);
    const tellLogin = () => { if ((loggedOut || (wantLogin && !logged)) && isMobile()) pageNotice('inicia sesión en Soundeo y la app se abrirá sola.', 7000); };
    if (wantLogin && logged && !hs.view && !/^\/list\/tracks/.test(location.pathname)) {
      location.replace(startUrl() + '#sx=list');
      return;
    }
    // 2.1.4 — La portada (soundeo.com) no es una lista: desde ella se va siempre a la lista de inicio, también al
    // recargar. Hasta la 2.1.3 solo se iba al entrar desde fuera (marcador, escribir la dirección); al recargar se
    // quedaba en la portada con solo el botón «Abrir Feed». Y una instalación nueva casi siempre llega recargando
    // (el paso «vuelve a soundeo.com y recarga», o Safari al dar permiso a Userscripts): por eso a los amigos de Tiger
    // solo les funcionaba con el enlace de la lista. Solo se queda si se cerró la app a propósito o si se ve que no hay
    // sesión (entonces avisa).
    if (location.pathname === '/' && !hs.view) {
      const go = prefs.autoOpen && isMobile() && !loggedOut && !SS.get('closed', 0);
      LS.set('entry', { t: Date.now(), nav: navType, logged, loggedOut, closed: !!SS.get('closed', 0), go });
      if (go) {
        location.replace(startUrl() + '#sx=' + prefs.startView);
        return;
      }
    }
    if ((fromOutside || (justLogged && !hs.view)) && prefs.forceStart && prefs.autoOpen && isMobile() && logged && !SS.get('closed', 0) &&
        (location.pathname === '/' || (/^\/list\/tracks/.test(location.pathname) && !sameAsStart()) || (justLogged && !/^\/list\/tracks/.test(location.pathname)))) {
      location.replace(startUrl() + '#sx=' + prefs.startView);
      return;
    }
    if (!LS.get('born', 0)) LS.set('born', Date.now());
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
    // 2.2 · Diseño 2: si se abre antes de una hora, se vuelve exactamente a donde se estaba (también al abrir desde el
    // icono, que no es «recargar»): la lista, la canción y la vista; y es la misma visita (las escuchadas siguen detrás)
    const ln3 = ui3() ? LS.get('lastNav', null) : null;
    const cont3 = !!(ln3 && ln3.src && ln3.src.url && !resume && !(recent('navOnce') && logged) &&
      Date.now() - LS.get('lastActive', 0) < HOUR && Date.now() - (ln3.t || 0) < HOUR);
    const contLive = cont3 && sameUrl(ln3.src.url, live.url);
    if (!resume && !contLive) keepReset(live); // abrir la lista desde fuera es una visita nueva; recargar, la misma (2.1.9)
    live.hidden = live.hide ? hiddenFor(live.tracks, live) : new Set();
    liveSrc = live;
    buildShell();
    root.classList.add('fabon');
    // la posición guardada solo vale al recargar o volver atrás (no al abrir un marcador)
    const resumeId = resume ? hs.id || SS.get('pos:' + location.pathname + location.search, null) : null;
    if (resumeId) { live.forced.add(resumeId); live.at = resumeId; }
    if (contLive && ln3.at) { live.forced.add(ln3.at); live.at = ln3.at; }
    stack = [live];
    // al recargar, volver a donde estabas (sección, artista, búsqueda…)
    const navOnce = recent('navOnce') && logged;
    if (logged) SS.del('navOnce');
    const nav = resume || navOnce ? SS.get('nav', null) : null;
    if (Array.isArray(nav) && nav.length && (nav.length > 1 || !nav[0].live) && (!nav[0].live || sameUrl(nav[0].url, live.url))) {
      stack = nav.map((x, k) => {
        if (k === 0 && x.live) { live.view = x.view; if (x.at && nav.length > 1) { live.at = x.at; live.forced.add(x.at); } return live; }
        return mkSrc(Object.assign({}, x, { live: false }));
      });
    }
    const top = stack[stack.length - 1];
    view = (hs.view || ((resume || navOnce) && top.view) || SS.get('view', null) || prefs.startView) === 'list' ? 'list' : 'feed';
    if (cont3) view = ln3.view === 'list' ? 'list' : 'feed';
    if (!top.loaded) ensureLoaded(top);
    adopt(top);
    watchSite();
    hookNet();
    hookSiteEvents();
    setupMediaSessionHandlers();
    probeCoverSize(live.tracks[0] && live.tracks[0].cover);

    const isListPage = /^\/list\/tracks/.test(location.pathname);
    const shouldOpen = hs.view || navOnce || (isListPage && prefs.autoOpen && isMobile() && !SS.get('closed', 0));
    if (shouldOpen) {
      if (deck[activeIdx]) load(deck[activeIdx], false);
      openApp(view);
      // sección de inicio que no es una lista normal (Top 100, próximos, seguidos…): abrirla ahora
      const sec = prefs.startSection || 'avail';
      if (cont3 && !contLive) openSource(Object.assign({}, ln3.src, { at: ln3.at }), { root: true, view, resume: true });
      else if (!cont3 && !resume && (fromOutside || firstBoot) && stack.length === 1 && !/^(avail|all)$/.test(sec) && SECTIONS.some((x) => x.key === sec)) {
        openSource(sectionDesc(sec), { root: true });
      }
      ui3Boot(cont3 ? ln3 : null);
      // red de seguridad: si Soundeo marca TODA la página como escuchada, preguntar una vez
      if (prefs.siteHeard && live.tracks.length >= 20 && live.tracks.every((t) => t.siteHeard) && !LS.get('siteHeardAsked', false)) {
        LS.set('siteHeardAsked', true);
        setTimeout(() => toast('Soundeo marca toda esta página como escuchada', 'No usarlo', () => {
          prefs.siteHeard = false;
          savePrefs();
          setHidden(cur && cur.hide ? hiddenFor(tracks, cur) : new Set());
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
      if (!LS.get('hint17', false)) {
        LS.set('hint17', true);
        setTimeout(() => toast('Nuevo: los botones Spotify y Apple Music, junto a la portada, buscan la canción en su app', 'Vale', () => {}), 4200);
      }
      if (loggedOut) setTimeout(() => toast('Sin sesión de Soundeo en esta pestaña. ¿Es una pestaña privada?', 'Iniciar sesión', goLogin), 1200);
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
