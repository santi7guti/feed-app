// Soundeo Feed — la app. La carga el cargador (soundeo-feed.user.js) desde GitHub.
// Para publicar una versión nueva: subir este archivo a main con VERSION actualizada.

(function () {
  'use strict';
  if (window.top !== window.self || window.__SX_FEED__) return;
  window.__SX_FEED__ = 'app';

  const VERSION = '1.1.2';

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
  };
  let defFilters = Object.assign({}, DEFAULT_FILTERS, LS.get('filters', {}));
  let prefs = Object.assign({}, DEFAULT_PREFS, LS.get('prefs', {}));
  const savePrefs = () => LS.set('prefs', prefs);

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
    const q = new URL(href || location.href).searchParams;
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
  function buildListUrl(f) {
    const p = new URLSearchParams();
    p.set('availableFilter', f.available == null ? '1' : String(f.available));
    p.set('artistFilter', f.artist || '');
    p.set('labelFilter', f.label || '');
    p.set('genreFilter', (f.genres || []).join(','));
    p.set('timeFilter', f.time || '0');
    const hasBpm = f.bpmMin != null || f.bpmMax != null;
    p.set('bpmFilter', hasBpm ? (f.bpmMin != null ? f.bpmMin : 0) + ',' + (f.bpmMax != null ? f.bpmMax : 260) : '');
    p.set('keyFilter', (f.keys || []).join(','));
    p.set('modeFilter', '1');
    p.set('trackTypeFilter', f.trackType || '0');
    p.set('searchFilter', f.search || '');
    return location.origin + '/list/tracks?' + p.toString();
  }
  function sameAsStart() {
    const norm = (x) => JSON.stringify({
      g: (x.genres || []).map(String).sort(), a: x.bpmMin == null ? null : +x.bpmMin, z: x.bpmMax == null ? null : +x.bpmMax,
      t: String(x.time || '0'), k: (x.keys || []).slice().sort(), av: String(x.available == null ? '1' : x.available),
      tt: String(x.trackType || '0'), s: x.search || '', l: x.label || '', ar: x.artist || '',
    });
    return norm(filtersFromUrl()) === norm(defFilters);
  }
  function describeFilters(f) {
    const parts = [];
    if (f.label) parts.push('Sello');
    if (f.artist) parts.push('Artista');
    if (f.genres && f.genres.length) parts.push(f.genres.length === 1 ? genreName(f.genres[0]) : f.genres.length + ' géneros');
    else parts.push('Todos los géneros');
    if (f.bpmMin != null || f.bpmMax != null) parts.push((f.bpmMin != null ? f.bpmMin : 0) + '–' + (f.bpmMax != null ? f.bpmMax : 260) + ' BPM');
    const t = TIME_OPTS.find((x) => x[0] === String(f.time));
    if (t && t[0] !== '0') parts.push(t[1]);
    if (f.keys && f.keys.length) parts.push(f.keys.length + (f.keys.length === 1 ? ' tono' : ' tonos'));
    if (f.search) parts.push('“' + f.search + '”');
    if (String(f.available) === '0') parts.push('incl. no disponibles');
    return parts.join(' · ');
  }
  function pageNumber() {
    const n = parseInt(new URL(location.href).searchParams.get('page') || '1', 10);
    return isFinite(n) && n > 0 ? n : 1;
  }
  function pageUrl(delta) {
    const act = $('.pagination li.active');
    const sib = act && (delta > 0 ? act.nextElementSibling : act.previousElementSibling);
    const a = sib && sib.querySelector('a[href]');
    if (a) return a.href;
    const target = pageNumber() + delta;
    if (target < 1) return null;
    if (delta > 0 && !$('.pagination')) return null;
    const u = new URL(location.href);
    u.hash = '';
    if (target === 1) u.searchParams.delete('page');
    else u.searchParams.set('page', String(target));
    return u.toString();
  }
  function parseHash() {
    const h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    return { view: h.get('sx'), id: h.get('id') };
  }
  const isMobile = () => {
    try { return matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 820; } catch (e) { return false; }
  };
  const isLoggedIn = () => !!$('#top-menu-logout, a[href*="/account/logout"]');

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
  function dayLabel(txt) {
    const m = clean(txt).match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (!m || MONTHS_EN[m[2].toLowerCase()] == null) return clean(txt);
    const d = new Date(+m[3], MONTHS_EN[m[2].toLowerCase()], +m[1]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - d) / 86400000);
    const short = d.getDate() + ' ' + MONTHS_ES[d.getMonth()];
    if (diff === 0) return 'Hoy · ' + short;
    if (diff === 1) return 'Ayer · ' + short;
    return short + (d.getFullYear() !== today.getFullYear() ? ' ' + d.getFullYear() : '');
  }
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
  const absHref = (a) => { if (!a) return ''; try { return new URL(a.getAttribute('href'), location.href).href; } catch (e) { return a.href || ''; } };
  const absSrc = (img) => { if (!img) return ''; const v = img.getAttribute('src') || ''; try { return new URL(v, location.href).href; } catch (e) { return v; } };
  function parseItem(node, day, folder) {
    const id = node.getAttribute('data-track-id');
    const titleA = $('.info strong a', node) || $('.info a', node);
    const full = clean(titleA && titleA.textContent);
    const parts = splitTitle(full);
    const img = $('img.cover', node) || $('img', node);
    const span = $('.info span', node);
    const links = span ? $$('a[href]', span) : [];
    const relA = links.find((a) => /\/release\//.test(a.getAttribute('href')));
    const labelA = links.find((a) => /[?&]labelFilter=\d/.test(a.getAttribute('href')));
    const genreA = links.find((a) => /[?&]genreFilter=\d/.test(a.getAttribute('href')));
    const dateM = span && span.textContent.match(/\d{4}-\d{2}-\d{2}/);
    const btn = $('button.action[data-track-url]', node) || $('[data-track-url]', node);
    const dlWrap = $('.download', node);
    const el = node;
    let labelId = '';
    if (labelA) { try { labelId = new URL(absHref(labelA)).searchParams.get('labelFilter') || ''; } catch (e) {} }
    return {
      id,
      el,
      full,
      artist: parts.artist,
      name: parts.name || full,
      mix: parts.mix,
      trackUrl: absHref(titleA),
      cover: absSrc(img),
      preview: btn ? btn.getAttribute('data-track-url') : '',
      duration: clean($('.info time', el) && $('.info time', el).textContent),
      release: clean(relA && relA.textContent),
      releaseUrl: absHref(relA),
      label: clean(labelA && labelA.textContent),
      labelId,
      genre: clean(genreA && genreA.textContent) || folder,
      date: dateM ? dateM[0] : '',
      day,
      dayLabel: dayLabel(day),
      explicit: !!$('.explicit', el),
      downloads: $$('a.track-download-lnk', el).map((a) => ({
        fmt: a.getAttribute('data-track-format'),
        name: clean(a.children[0] && a.children[0].textContent) || 'Archivo',
        size: clean(a.children[1] && a.children[1].textContent),
      })),
      siteDownloaded: !!(dlWrap && dlWrap.className.replace(/\bdownload\b/, '').trim()),
      siteHeard: !!$('.vis.listened', node),
      vote: $('.vote', el),
    };
  }
  function parseTracks(root, startDay) {
    const left = root ? $('.content .left', root) || root : $('.content .left') || document.body;
    let day = startDay || '';
    let folder = '';
    const out = [];
    $$('h1, .folder > h2, .trackitem[data-track-id]', left).forEach((n) => {
      if (n.tagName === 'H1') { day = clean(n.textContent); return; }
      if (n.tagName === 'H2') { folder = clean(n.textContent); return; }
      const t = parseItem(n, day, folder);
      if (t.id) out.push(t);
    });
    return out;
  }

  /* ───────────────────────── estado persistente ───────────────────────── */
  const heard = new Set(LS.get('heard', []));
  let heardSaveT = 0;
  const isHeard = (t) => !!t && (heard.has(t.id) || (prefs.siteHeard && t.siteHeard));
  function markHeard(id) {
    if (!id || heard.has(id)) return;
    heard.add(id);
    clearTimeout(heardSaveT);
    heardSaveT = setTimeout(() => LS.set('heard', Array.from(heard).slice(-6000)), 800);
    const row = listRowById(id);
    if (row) row.classList.add('heard');
    const t = tracks.find((x) => x.id === id);
    const vis = t && t.el && $('.vis', t.el);
    if (vis) vis.classList.add('listened');
    if (prefs.siteHeard) syncListenToSite(id);
  }
  // GET /tracks/status/<id>: lo que llama el reproductor de Soundeo al poner un track; lo marca como escuchado en la web
  function syncListenToSite(id) {
    try {
      siteRequest('/tracks/status/' + encodeURIComponent(id), 'GET').then(({ r }) => {
        const t = tracks.find((x) => x.id === id);
        if (!t) return;
        t.siteHeard = true;
        const tr = r && r.track;
        if (!tr) return;
        if (!metaCache[id]) {
          const m = { b: num(tr.bpm), k: keyFromText(String(tr.key || '').replace(/\s\(.*\)/, '')) };
          if (m.b || m.k) { metaCache[id] = m; saveMeta(); paintMeta(t); }
        }
        if (tr.hasOwnProperty('favored')) {
          const b = origFav(t);
          if (b && !favPending.has(id)) { b.classList.toggle('favored', !!tr.favored); repaintFav(id); }
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
    }, 600);
  }

  /* ───────────────────────── BPM / tono desde la página del track ───────────────────────── */
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
    $$('section.player, header, .right, #sidebarContainer, script, style, noscript', doc).forEach((n) => n.remove());
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
    return { b: bpm, k: key };
  }
  const metaPending = new Map();
  let metaActive = 0;
  const metaQueue = [];
  function pumpMeta() {
    while (metaActive < 2 && metaQueue.length) {
      const job = metaQueue.shift();
      metaActive++;
      job().finally(() => { metaActive--; pumpMeta(); });
    }
  }
  function getMeta(t) {
    if (!t || !t.trackUrl) return Promise.resolve(null);
    if (metaCache[t.id]) return Promise.resolve(metaCache[t.id]);
    if (metaPending.has(t.id)) return metaPending.get(t.id);
    const p = new Promise((resolve) => {
      metaQueue.push(() =>
        fetch(t.trackUrl, { credentials: 'include' })
          .then((r) => (r.ok ? r.text() : ''))
          .then((html) => {
            const m = html ? parseTrackPage(html, t) : null;
            if (m && (m.b || m.k)) { metaCache[t.id] = m; saveMeta(); }
            resolve(m);
          })
          .catch(() => resolve(null))
      );
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
    feed: '<svg viewBox="0 0 24 24"><rect x="6" y="3.5" width="12" height="17" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.5 9.6v4.8l4-2.4z" fill="currentColor"/></svg>',
  };

  /* ───────────────────────── estilos ───────────────────────── */
  const PAGE_CSS = `
    #sx-host{position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000;}
    html.sx-open,html.sx-open body{overflow:hidden!important;height:100%!important;width:100%!important;min-width:0!important;max-width:100%!important;margin:0!important;padding:0!important;overscroll-behavior:none!important;background:#0b0b0e!important;}
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
    --glass:rgba(255,255,255,.13);--glass2:rgba(255,255,255,.2);--acc:#2ea8ff;--gold:#ffc83d;--ok:#34d27b;
    --st:env(safe-area-inset-top,0px);--sb:env(safe-area-inset-bottom,0px);
    --top:calc(var(--st) + 54px);--ctrl:calc(var(--sb) + 118px);
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif;
    color:var(--fg);font-size:15px;line-height:1.3;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;}
  .app{position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;background:var(--bg);overflow:hidden;display:none;user-select:none;-webkit-user-select:none;}
  .root.open .app{display:block;}

  /* barra superior */
  .topbar{position:absolute;left:0;right:0;top:0;z-index:30;padding:calc(var(--st) + 8px) 12px 10px;display:flex;align-items:center;gap:10px;
    background:linear-gradient(to bottom,rgba(0,0,0,.62),rgba(0,0,0,0));pointer-events:none;}
  .app[data-view=list] .topbar{background:rgba(11,11,14,.94);-webkit-backdrop-filter:saturate(1.4) blur(14px);backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid var(--line);}
  .topbar>*{pointer-events:auto;}
  .seg{display:flex;background:var(--glass);border-radius:999px;padding:3px;}
  .seg button{padding:7px 15px;border-radius:999px;font-size:14px;font-weight:600;color:var(--mut);}
  .seg button.on{background:var(--fg);color:#000;}
  .tb-sp{flex:1;}
  .pill{display:flex;align-items:center;gap:5px;height:34px;padding:0 11px;border-radius:999px;background:var(--glass);font-size:13px;font-weight:600;}
  .pill i{width:16px;height:16px;display:block;}
  .pill.zero{color:#ff8a7a;}
  .ibtn{width:38px;height:38px;border-radius:50%;background:var(--glass);display:grid;place-items:center;}
  .ibtn i{width:21px;height:21px;display:block;}

  /* feed */
  .feed{position:absolute;inset:0;display:flex;overflow-x:scroll;overflow-y:hidden;scroll-snap-type:x mandatory;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:none;touch-action:pan-x;}
  .feed::-webkit-scrollbar{display:none;}
  .app[data-view=list] .feed,.app[data-view=list] .controls{display:none;}
  .card{position:relative;flex:0 0 100%;height:100%;width:100%;scroll-snap-align:start;scroll-snap-stop:always;overflow:hidden;}
  .bg{position:absolute;inset:-12%;background-size:cover;background-position:center;filter:blur(38px) saturate(1.5) brightness(.55);transform:translateZ(0);opacity:0;transition:opacity .35s;}
  .bg.on{opacity:1;}
  .card::after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.15) 0%,rgba(0,0,0,0) 30%,rgba(0,0,0,.45) 75%,rgba(0,0,0,.7) 100%);pointer-events:none;}
  .cin{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;padding:calc(var(--top) + 4px) 20px calc(var(--ctrl) + 10px);}
  .ctop{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;}
  .chip{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px;border-radius:999px;background:var(--glass);font-size:12.5px;font-weight:600;color:var(--fg);white-space:nowrap;}
  .chip.mut{color:var(--mut);}
  .chip.key b{color:var(--acc);font-weight:700;}
  .chip.e{background:rgba(255,255,255,.85);color:#000;}
  .idx{font-size:12.5px;color:var(--mut);font-variant-numeric:tabular-nums;font-weight:600;}
  .mid{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;}
  .cvw{position:relative;align-self:center;width:var(--cv,min(76vw,300px));height:var(--cv,min(76vw,300px));border-radius:14px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.55);background:#222;flex:none;}
  .cvw img{width:100%;height:100%;object-fit:cover;display:block;}
  .pind{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.28);opacity:0;transition:opacity .2s;pointer-events:none;}
  .pind i{width:64px;height:64px;display:block;padding:15px;border-radius:50%;background:rgba(0,0,0,.45);}
  .card.paused .pind{opacity:1;}
  .eq{position:absolute;right:10px;bottom:10px;display:flex;gap:3px;align-items:flex-end;height:18px;opacity:0;transition:opacity .2s;}
  .card.playing .eq{opacity:1;}
  .eq span{width:3px;background:#fff;border-radius:2px;animation:eq 1s ease-in-out infinite;}
  .eq span:nth-child(2){animation-delay:-.4s}.eq span:nth-child(3){animation-delay:-.7s}.eq span:nth-child(4){animation-delay:-.2s}
  @keyframes eq{0%,100%{height:30%}50%{height:100%}}
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
  .rbtn.vote{color:var(--acc);}
  .rbtn:active{transform:scale(.92);}
  .art{font-size:17px;font-weight:600;margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .rel{font-size:13.5px;color:var(--mut);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .rel .lbl{color:var(--fg);text-decoration:underline;text-decoration-color:rgba(255,255,255,.3);text-underline-offset:3px;}
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
  .controls{position:absolute;left:0;right:0;bottom:0;z-index:30;padding:0 16px calc(var(--sb) + 10px);pointer-events:none;
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
  .list{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:var(--top) 0 calc(var(--sb) + 96px);display:none;overscroll-behavior:contain;}
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
  .row{display:flex;align-items:center;gap:12px;padding:9px 10px 9px 16px;position:relative;}
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
  .pager{display:flex;gap:10px;padding:18px 16px 10px;}
  .pager .btn{flex:1;white-space:nowrap;padding:0 12px;}
  .pager .btn[disabled]{opacity:.35;}

  /* mini reproductor (lista) */
  .mini{position:absolute;left:8px;right:8px;bottom:calc(var(--sb) + 8px);z-index:30;display:none;align-items:center;gap:10px;padding:8px 8px 8px 8px;border-radius:16px;
    background:rgba(38,38,44,.92);-webkit-backdrop-filter:saturate(1.6) blur(20px);backdrop-filter:saturate(1.6) blur(20px);box-shadow:0 10px 30px rgba(0,0,0,.5);overflow:hidden;}
  .app[data-view=list].has-cur .mini{display:flex;}
  .mini img{width:46px;height:46px;border-radius:9px;object-fit:cover;background:#333;flex:none;}
  .mini .mm{flex:1;min-width:0;}
  .mini .mt{font-size:14.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .mini .ma{font-size:12.5px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .mini .mb{width:40px;height:40px;display:grid;place-items:center;flex:none;}
  .mini .mb i{width:24px;height:24px;display:block;}
  .mini .mb.on{color:var(--gold);}
  .mini .mprog{position:absolute;left:0;bottom:0;height:2.5px;background:var(--fg);width:0;}

  /* hojas */
  .shade{position:absolute;inset:0;z-index:50;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .25s;}
  .shade.on{opacity:1;pointer-events:auto;}
  .sheet{position:absolute;left:0;right:0;bottom:0;z-index:51;background:#17171c;border-radius:20px 20px 0 0;transform:translateY(105%);transition:transform .3s cubic-bezier(.2,.8,.2,1);
    max-height:calc(100% - var(--st) - 24px);display:flex;flex-direction:column;box-shadow:0 -10px 40px rgba(0,0,0,.5);}
  .sheet.on{transform:none;}
  .sh{display:flex;align-items:center;justify-content:space-between;padding:16px 16px 8px 20px;flex:none;}
  .sh h2{margin:0;font-size:20px;font-weight:800;}
  .sb{overflow-y:auto;-webkit-overflow-scrolling:touch;padding:4px 20px calc(var(--sb) + 20px);overscroll-behavior:contain;user-select:text;-webkit-user-select:text;}
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
  `;

  /* ───────────────────────── app ───────────────────────── */
  let tracks = [];
  let deck = [];
  let hiddenAtLoad = new Set();
  let forced = new Set();
  let activeIdx = 0;
  let current = null; // track cargado en el audio
  let wantPlay = false;
  let view = 'feed';
  let isOpen = false;
  let host, root, app, feedEl, listEl, ctrlEl, miniEl, toastsEl, shadeEl;
  // Dos elementos de audio: uno suena y el otro va cargando la siguiente canción (ver "reproducción").
  const mkAudio = () => {
    const a = new Audio();
    a.preload = 'auto';
    try { a.setAttribute('playsinline', ''); a.setAttribute('webkit-playsinline', ''); } catch (e) {}
    return a;
  };
  const players = [mkAudio(), mkAudio()];
  let audio = players[0]; // el que suena
  const spare = () => (audio === players[0] ? players[1] : players[0]);
  const pl = { broken: false, unlocked: false, swaps: 0, primes: 0, fails: 0, t0: 0, mode: '', info: null, last: null, stat: { pre: { n: 0, ms: 0 }, cold: { n: 0, ms: 0 } } };

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

    sr.innerHTML = `<style>${APP_CSS}</style>
      <div class="root">
        <div class="app" data-view="feed">
          <div class="feed"></div>
          <div class="list"></div>
          <div class="topbar">
            <div class="seg"><button data-v="feed">Feed</button><button data-v="list">Lista</button></div>
            <div class="tb-sp"></div>
            <button class="pill dlleft" title="Descargas restantes hoy">${i('dl')}<span>–</span></button>
            <button class="ibtn bset" aria-label="Ajustes">${i('sliders')}</button>
          </div>
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
          <div class="toasts"></div>
          <div class="shade"></div>
          <div class="sheet s-settings"><div class="sh"><h2>Ajustes</h2><button class="ibtn sclose">${i('close')}</button></div><div class="sb"></div><div class="sf"><button class="btn bsave">Guardar como míos</button><button class="btn pri bapply">Aplicar filtros</button></div></div>
          <div class="sheet s-action"><div class="sh"><h2></h2><button class="ibtn sclose">${i('close')}</button></div><div class="sb"></div></div>
        </div>
        <button class="fab">${i('feed')}<span>Feed</span></button>
      </div>`;
    root = $('.root', sr);
    app = $('.app', sr);
    feedEl = $('.feed', sr);
    listEl = $('.list', sr);
    ctrlEl = $('.controls', sr);
    miniEl = $('.mini', sr);
    toastsEl = $('.toasts', sr);
    shadeEl = $('.shade', sr);

    // eventos fijos
    $$('.seg button', sr).forEach((b) => b.addEventListener('click', () => setView(b.dataset.v)));
    $('.bset', sr).addEventListener('click', () => openSettings());
    $('.dlleft', sr).addEventListener('click', () => toast(dlLeftText()));
    $('.bplay', sr).addEventListener('click', togglePlay);
    $('.bnext', sr).addEventListener('click', () => step(1, true));
    $('.bprev', sr).addEventListener('click', () => step(-1, true));
    $('.b15', sr).addEventListener('click', () => seekBy(-15));
    $('.f30', sr).addEventListener('click', () => seekBy(30));
    $('.mplay', sr).addEventListener('click', togglePlay);
    $('.mnext', sr).addEventListener('click', () => step(1, true));
    $('.mexp', sr).addEventListener('click', () => setView('feed'));
    $('.mfav', sr).addEventListener('click', () => current && toggleFav(current));
    $('.mm', sr).addEventListener('click', () => setView('feed'));
    $('.fab', sr).addEventListener('click', () => {
      SS.del('closed');
      if (tracks.length) openApp(prefs.startView);
      else location.href = buildListUrl(defFilters) + '#sx=' + prefs.startView;
    });
    shadeEl.addEventListener('click', closeSheets);
    $$('.sclose', sr).forEach((b) => b.addEventListener('click', closeSheets));
    setupBar($('.bar', sr));
    feedEl.addEventListener('scroll', onFeedScroll, { passive: true });
    setupGestures();
    app.addEventListener('click', unlockSpare, true);
    let rzT = 0;
    const onResize = () => {
      clearTimeout(rzT);
      rzT = setTimeout(() => {
        if (!isOpen || view !== 'feed') return;
        layoutCards();
        feedJump(activeIdx);
      }, 120);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
  }

  /* ───────────── abrir / cerrar / vistas ───────────── */
  function openApp(v) {
    isOpen = true;
    vpMeta.apply();
    document.documentElement.classList.add('sx-open');
    root.classList.add('open');
    $$('audio, video').forEach((m) => { try { m.pause(); } catch (e) {} });
    window.scrollTo(0, 0);
    setView(v || view, true);
    updateCounters();
  }
  function closeApp() {
    isOpen = false;
    SS.set('closed', 1);
    root.classList.remove('open');
    document.documentElement.classList.remove('sx-open');
    vpMeta.restore();
    audio.pause();
    wantPlay = false;
  }
  // Deja la lista en el día de la canción actual y, si algo suena, centrada en ella.
  function prepList() {
    const k = current ? listDays().indexOf(current.day) : -1;
    if (k >= 0 && k !== listDay) listDay = k;
    renderList();
    const r = current && listRowById(current.id);
    const playing = current && (!audio.paused || audio.currentTime > 0);
    if (r && playing) listEl.scrollTop = Math.max(0, r.offsetTop - (listEl.clientHeight - r.offsetHeight) / 2);
    else listEl.scrollTop = 0;
  }
  function setView(v) {
    view = v === 'list' ? 'list' : 'feed';
    app.dataset.view = view;
    $$('.seg button', root).forEach((b) => b.classList.toggle('on', b.dataset.v === view));
    SS.set('view', view);
    if (view === 'feed') {
      feedJump(activeIdx);
      requestAnimationFrame(() => {
        layoutCards();
        feedJump(activeIdx);
        onActive(activeIdx, true);
      });
    } else {
      prepList();
    }
    syncHash();
  }

  /* ───────────── gestos ───────────── */
  // Izquierda/derecha = siguiente/anterior (scroll nativo del feed). Abajo = ir a la lista.
  function setupGestures() {
    const EDGE = 20;
    let g = null;
    const start = (e) => {
      g = null;
      if (e.touches.length !== 1 || view !== 'feed' || (e.target.closest && e.target.closest('.bar'))) return;
      const t = e.touches[0];
      const inFeed = e.currentTarget === feedEl;
      const edge = inFeed && (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE);
      g = { x: t.clientX, y: t.clientY, mode: '', dx: 0, dy: 0, manual: edge || !inFeed };
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
        if (ax < 10 && ay < 10) return;
        if (ay > ax * 1.3) g.mode = g.dy > 0 ? 'y' : 'n';
        else g.mode = g.manual ? 'x' : 'n'; // horizontal dentro del feed: lo hace el scroll nativo
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
        setView('feed');
      } else if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (e.cancelable) e.preventDefault();
        step(dx < 0 ? 1 : -1, true);
      }
    }, { passive: false });
  }
  function syncHash() {
    try {
      const h = 'sx=' + view + (deck[activeIdx] ? '&id=' + deck[activeIdx].id : '');
      history.replaceState(history.state, '', location.pathname + location.search + '#' + h);
    } catch (e) {}
  }

  /* ───────────── mazo (feed) ───────────── */
  function buildDeck() {
    deck = tracks.filter((t) => !hiddenAtLoad.has(t.id) || forced.has(t.id));
  }
  function renderFeed() {
    const frag = document.createDocumentFragment();
    deck.forEach((t, idx) => frag.appendChild(cardFor(t, idx)));
    frag.appendChild(endCard());
    feedEl.textContent = '';
    feedEl.appendChild(frag);
    updateCardCounters();
    requestAnimationFrame(layoutCards);
  }
  function cardFor(t, idx) {
    const meta = metaCache[t.id];
    const eyebrow = [String(t.dayLabel || '').split(' · ')[0], t.genre].filter(Boolean).map(esc).join(' · ');
    const c = el(`<section class="card paused" data-id="${esc(t.id)}">
      <div class="bg"></div>
      <div class="cin">
        <div class="mid">
          <div class="cvw"><img alt="" decoding="async"><div class="pind">${i('play')}</div><div class="eq"><span></span><span></span><span></span><span></span></div></div>
          <div class="info">
            <div class="itext">
              <div class="eyebrow"><span class="ix">${idx + 1}/${deck.length}</span>${eyebrow ? ' · <b>' + eyebrow + '</b>' : ''}</div>
              <div class="ttl">${esc(t.name)}</div>
              <div class="mix">${esc(t.mix)}</div>
              <div class="art">${esc(t.artist)}</div>
              <div class="rel">${esc(t.release)}${t.label ? ' · <span class="lbl">' + esc(t.label) + '</span>' : ''}</div>
              <div class="chips"><span class="chip key">${metaChipKey(meta)}</span><span class="chip bpmc">${metaChipBpm(meta)}</span>${t.duration ? `<span class="chip mut">${esc(t.duration)}</span>` : ''}${t.explicit ? '<span class="chip e">E</span>' : ''}${t.date ? `<span class="chip mut">${esc(t.date)}</span>` : ''}</div>
            </div>
            <div class="rail">
              <button class="rbtn fav" aria-label="Guardar">${i('star')}</button>
              ${dlButtonHtml(t)}
              <button class="rbtn more" aria-label="Más">${i('more')}</button>
            </div>
          </div>
        </div>
      </div>
    </section>`);
    const img = $('img', c);
    img.src = bigCover(t.cover);
    img.onerror = () => { if (img.src !== t.cover) img.src = t.cover; };
    $('.cvw', c).addEventListener('click', togglePlay);
    $('.fav', c).addEventListener('click', () => toggleFav(t));
    const dlb = $('.dl', c);
    if (dlb) dlb.addEventListener('click', () => askDownload(t));
    const vb = $('.vote', c);
    if (vb) vb.addEventListener('click', () => vote(t));
    $('.more', c).addEventListener('click', () => moreSheet(t));
    const lbl = $('.lbl', c);
    if (lbl) lbl.addEventListener('click', () => moreSheet(t));
    paintFav(c, t);
    return c;
  }
  function dlButtonHtml(t) {
    if (t.downloads.length) {
      const done = t.siteDownloaded || myDownloads.has(t.id);
      return `<button class="rbtn dl${done ? ' done' : ''}" aria-label="Descargar">${i(done ? 'check' : 'dl')}</button>`;
    }
    if (t.vote) return `<button class="rbtn vote" aria-label="Votar">${i('up')}</button>`;
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
    const c = feedEl.querySelector('.card:not(.end)');
    if (!c) return;
    const mid = $('.mid', c);
    const info = $('.info', c);
    const ttl = $('.ttl', c);
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
  function endCard() {
    const hiddenN = tracks.length - deck.length;
    const more = pages.hasMore;
    const c = el(`<section class="card end"><div class="cin">
      <h3>${more ? 'Cargando más…' : deck.length ? 'Has llegado al final' : 'Nada nuevo aquí'}</h3>
      <p>${more ? 'Trayendo más tracks de Soundeo.' : deck.length ? 'No hay más tracks con estos filtros.' : 'Ya has escuchado todo lo de estos filtros.'}</p>
      ${more ? '<button class="btn pri bnp">Cargar más</button>' : ''}
      ${hiddenN > 0 ? '<button class="btn bsh">Mostrar también las ' + hiddenN + ' escuchadas</button>' : ''}
      <button class="btn btop">Volver al principio</button>
    </div></section>`);
    const bnp = $('.bnp', c);
    if (bnp) bnp.addEventListener('click', () => { pages.autoEmpty = 0; loadMore(); });
    const bsh = $('.bsh', c);
    if (bsh) bsh.addEventListener('click', () => { prefs.skipHeard = false; savePrefs(); hiddenAtLoad = new Set(); rebuild(deck[activeIdx - 1] || deck[0]); toast('Mostrando todas'); });
    $('.btop', c).addEventListener('click', () => goTo(0, { instant: true }));
    return c;
  }
  function updateCardCounters() {
    if (!feedEl) return;
    const total = deck.length + (pages.hasMore ? '+' : '');
    $$('.card .ix', feedEl).forEach((x, k) => { x.textContent = (k + 1) + '/' + total; });
  }

  /* ───────────── más páginas de Soundeo (sin recargar) ───────────── */
  const pages = { first: 1, last: 1, hasMore: false, loading: null, autoEmpty: 0 };
  function nextPageHref(doc) {
    const act = $('.pagination li.active', doc);
    const sib = act && act.nextElementSibling;
    const a = sib && $('a[href]', sib);
    return a ? absHref(a) : null;
  }
  function urlForPage(n) {
    const u = new URL(location.href);
    u.hash = '';
    if (n <= 1) u.searchParams.delete('page');
    else u.searchParams.set('page', String(n));
    return u.toString();
  }
  function loadMore() {
    if (pages.loading) return pages.loading;
    if (!pages.hasMore) return Promise.resolve([]);
    const n = pages.last + 1;
    pages.loading = fetch(urlForPage(n), { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then((html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const last = tracks[tracks.length - 1];
        const got = parseTracks(doc, last && last.day);
        pages.last = n;
        pages.hasMore = !!nextPageHref(doc) && got.length > 0;
        const known = new Set(tracks.map((t) => t.id));
        const fresh = got.filter((t) => t.id && !known.has(t.id));
        hiddenFor(fresh).forEach((id) => hiddenAtLoad.add(id));
        tracks = tracks.concat(fresh);
        onTracksAdded();
        return fresh;
      })
      .catch((e) => { toast('No se pudo cargar más: ' + short(e && e.message, 60)); return []; })
      .finally(() => { pages.loading = null; });
    return pages.loading;
  }
  function onTracksAdded() {
    const before = deck.length;
    buildDeck();
    const end = feedEl.lastElementChild;
    deck.slice(before).forEach((t, k) => feedEl.insertBefore(cardFor(t, before + k), end));
    end.replaceWith(endCard());
    updateCardCounters();
    requestAnimationFrame(layoutCards);
    if (deck.length > before) pages.autoEmpty = 0;
    else pages.autoEmpty++;
    renderList(true);
    if (view === 'feed') onActive(activeIdx, true);
  }
  function maybeLoadMore() {
    // carga automática cerca del final; si varias páginas seguidas no traen nada nuevo, espera a un toque
    if (pages.hasMore && !pages.loading && pages.autoEmpty < 3) loadMore();
  }
  function goPage(delta) {
    const u = pageUrl(delta);
    if (!u) return;
    SS.set('autoplay', wantPlay ? 1 : 0);
    location.href = u.split('#')[0] + '#sx=' + view;
  }
  function rebuild(keep) {
    buildDeck();
    renderFeed();
    renderList(true);
    let idx = keep ? deck.findIndex((t) => t.id === keep.id) : 0;
    if (idx < 0) idx = 0;
    activeIdx = idx;
    if (view === 'feed') requestAnimationFrame(() => { feedJump(activeIdx); onActive(activeIdx, true); });
  }
  const cardAt = (idx) => feedEl.children[idx] || null;
  // el feed es una fila de tarjetas a pantalla completa: la posición es scrollLeft / ancho
  function feedJump(idx, smooth) {
    const x = idx * feedEl.clientWidth;
    if (smooth && feedEl.scrollTo) feedEl.scrollTo({ left: x, behavior: 'smooth' });
    else feedEl.scrollLeft = x;
  }
  function cardById(id) {
    const idx = deck.findIndex((t) => t.id === id);
    return idx >= 0 ? cardAt(idx) : null;
  }

  let scrollRaf = 0;
  let settleT = 0;
  function onFeedScroll() {
    if (!scrollRaf) {
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        const w = feedEl.clientWidth || 1;
        const idx = Math.max(0, Math.min(deck.length, Math.round(feedEl.scrollLeft / w)));
        if (idx !== activeIdx) onActive(idx, false);
      });
    }
    clearTimeout(settleT);
    settleT = setTimeout(onSettle, 140);
  }
  function onActive(idx, force) {
    if (idx === activeIdx && !force) return;
    activeIdx = idx;
    // fondos difuminados solo cerca de la tarjeta activa
    for (let k = 0; k < feedEl.children.length; k++) {
      const c = feedEl.children[k];
      const bg = c.querySelector('.bg');
      if (!bg) continue;
      const near = Math.abs(k - idx) <= 1;
      const t = deck[k];
      if (near && t && !bg.dataset.set) { bg.style.backgroundImage = 'url("' + bigCover(t.cover).replace(/"/g, '%22') + '")'; bg.dataset.set = '1'; }
      if (!near && bg.dataset.set) { bg.style.backgroundImage = ''; delete bg.dataset.set; bg.classList.remove('on'); }
      if (near && bg.dataset.set) bg.classList.add('on');
    }
    const t = deck[idx];
    if (t) {
      [t, deck[idx + 1], deck[idx + 2]].forEach((x) => x && loadMeta(x));
      SS.set('pos:' + location.pathname + location.search, t.id);
    }
    if (idx >= deck.length - 4) maybeLoadMore();
    syncHash();
  }
  function onSettle() {
    const t = deck[activeIdx];
    if (!t) { if (current && !audio.paused) { audio.pause(); } return; }
    if (!current || current.id !== t.id) load(t, wantPlay);
    else if (wantPlay && audio.paused) audio.play().catch(() => {});
  }
  function goTo(idx, opts) {
    opts = opts || {};
    idx = Math.max(0, Math.min(deck.length, idx));
    const t = deck[idx];
    if (t && opts.play) load(t, true); // dentro del gesto del usuario (iOS)
    if (view === 'feed' && feedEl.clientWidth) {
      feedJump(idx, !opts.instant);
      if (opts.instant) onActive(idx, true);
    } else {
      onActive(idx, true);
      if (t && !opts.play) load(t, false);
      if (!t && current) audio.pause();
    }
  }
  function playListTrack(id, play) {
    const t = tracks.find((x) => x.id === id);
    if (!t) return false;
    if (!deck.some((x) => x.id === id)) { forced.add(id); buildDeck(); renderFeed(); }
    activeIdx = deck.findIndex((x) => x.id === id);
    load(t, play);
    onActive(activeIdx, true);
    const r = listRowById(id);
    if (r) r.scrollIntoView({ block: 'nearest' });
    return true;
  }
  function step(d, userGesture) {
    if (view === 'list' && current && listOrder.includes(current.id)) {
      const k = listOrder.indexOf(current.id) + d;
      if (k >= 0 && k < listOrder.length) { playListTrack(listOrder[k], userGesture ? true : wantPlay); return; }
      toast(d > 0 ? 'Fin de este día' : 'Es el primero de este día');
      return;
    }
    const base = current ? deck.findIndex((t) => t.id === current.id) : -1;
    const from = view === 'feed' ? activeIdx : base >= 0 ? base : activeIdx;
    const idx = from + d;
    if (idx < 0) {
      if (pageUrl(-1)) toast('Es el primero de esta página', 'Página anterior', () => goPage(-1));
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
    const c = cardById(t.id);
    if (!c || !m) return;
    const k = $('.chip.key', c);
    const b = $('.chip.bpmc', c);
    if (k) k.innerHTML = metaChipKey(m);
    if (b) b.innerHTML = metaChipBpm(m);
    const r = listRowById(t.id);
    if (r) {
      const x = $('.rx', r);
      if (x && !x.dataset.meta) { x.dataset.meta = '1'; x.textContent = metaLine(t); }
    }
  }
  function refreshCovers() {
    if (!feedEl) return;
    deck.forEach((t, k) => {
      const c = cardAt(k);
      if (!c) return;
      const img = $('img', c);
      if (img) img.src = bigCover(t.cover);
      const bg = $('.bg', c);
      if (bg && bg.dataset.set) bg.style.backgroundImage = 'url("' + bigCover(t.cover).replace(/"/g, '%22') + '")';
    });
  }

  /* ───────────── lista ───────────── */
  function metaLine(t) {
    const m = metaCache[t.id];
    const bits = [];
    if (m && m.b) bits.push(m.b + ' BPM');
    if (m && m.k) bits.push(camelot(m.k) + ' ' + m.k);
    bits.push(t.genre, t.label, t.duration);
    return bits.filter(Boolean).join(' · ');
  }
  let listDay = 0; // 0 = el día más reciente cargado
  let listOrder = []; // ids en el orden en que se ven en la lista
  function listDays() {
    const out = [];
    tracks.forEach((t) => { if (!out.includes(t.day)) out.push(t.day); });
    return out;
  }
  const dayComplete = (k) => k < listDays().length - 1 || !pages.hasMore;
  function dayParts(dayTxt) {
    const m = clean(dayTxt).match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (!m || MONTHS_EN[m[2].toLowerCase()] == null) return { big: clean(dayTxt) || 'Tracks', sub: '', short: clean(dayTxt) };
    const d = new Date(+m[3], MONTHS_EN[m[2].toLowerCase()], +m[1]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - d) / 86400000);
    const short = d.getDate() + ' ' + MONTHS_ES[d.getMonth()];
    let sub = '';
    try { sub = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { sub = short; }
    sub = sub.charAt(0).toUpperCase() + sub.slice(1);
    return { big: diff === 0 ? 'Hoy' : diff === 1 ? 'Ayer' : short, sub, short };
  }
  async function goListDay(k) {
    if (k < 0) {
      if (pageNumber() > 1) goPage(-1);
      return;
    }
    let guard = 0;
    // el día k tiene que existir y estar completo (puede seguir en la página siguiente de Soundeo)
    while ((listDays().length <= k || !dayComplete(k)) && pages.hasMore && guard++ < 8) {
      $$('.dold, .bnx', listEl).forEach((x) => { x.disabled = true; x.textContent = 'Cargando…'; });
      await loadMore();
    }
    const days = listDays();
    if (k > days.length - 1) k = days.length - 1;
    listDay = Math.max(0, k);
    renderList();
    listEl.scrollTop = 0;
  }
  function renderList(keepScroll) {
    if (!listEl) return;
    const st = listEl.scrollTop;
    const isListPage = /^\/list\/tracks/.test(location.pathname);
    const title = isListPage ? describeFilters(filtersFromUrl()) : clean(document.title.replace(/»?\s*Soundeo\s*$/i, '')) || 'Soundeo';
    const days = listDays();
    if (listDay > days.length - 1) listDay = Math.max(0, days.length - 1);
    const day = days[listDay];
    const all = tracks.filter((t) => t.day === day);
    const newN = all.filter((t) => !isHeard(t)).length;
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
    const frag = document.createDocumentFragment();
    const head = el(`<div class="lhead"><button class="fsum">${i('sliders')}<span><b>${esc(title)}</b><small>Toca para cambiar los filtros</small></span></button></div>`);
    $('.fsum', head).addEventListener('click', () => openSettings());
    frag.appendChild(head);
    const dh = el(`<div class="dhead">
      <div class="dnav">
        <button class="dn dnew"${newer || pageNumber() > 1 ? '' : ' disabled'}>‹ ${newer ? esc(dayParts(newer).short) : 'Más reciente'}</button>
        <button class="dn dold"${older || pages.hasMore ? '' : ' disabled'}>${older ? esc(dayParts(older).short) : 'Día anterior'} ›</button>
      </div>
      <div class="dbig">${esc(dp.big)}</div>
      ${dp.sub ? `<div class="dsub">${esc(dp.sub)}</div>` : ''}
      <div class="dcount">${all.length}${complete ? '' : '+'} tracks · ${newN} sin escuchar${complete ? '' : ' · cargando el resto…'}</div>
      <div class="seg2 lf"><button data-f="all">Todas</button><button data-f="new">Sin escuchar</button></div>
    </div>`);
    $('.dnew', dh).addEventListener('click', () => goListDay(listDay - 1));
    $('.dold', dh).addEventListener('click', () => goListDay(listDay + 1));
    $$('.lf button', dh).forEach((x) => {
      x.classList.toggle('on', x.dataset.f === (onlyNew ? 'new' : 'all'));
      x.addEventListener('click', () => { prefs.listFilter = x.dataset.f; savePrefs(); renderList(); });
    });
    frag.appendChild(dh);
    if (!shown.length) {
      const e = el(`<div class="lempty">${all.length ? 'Ya has escuchado todo lo de este día.' : 'No hay tracks este día.'}${onlyNew && all.length ? '<br><button class="btn bshow" style="margin-top:14px">Ver las ' + all.length + '</button>' : ''}</div>`);
      const bs = $('.bshow', e);
      if (bs) bs.addEventListener('click', () => { prefs.listFilter = 'all'; savePrefs(); renderList(); });
      frag.appendChild(e);
    }
    let lastGenre = null;
    shown.forEach((t) => {
      if (t.genre !== lastGenre) {
        lastGenre = t.genre;
        const n = shown.filter((x) => x.genre === t.genre).length;
        frag.appendChild(el(`<div class="gh">${esc(t.genre || 'Otros')} <span>${n}</span></div>`));
      }
      const done = t.siteDownloaded || myDownloads.has(t.id);
      const r = el(`<div class="row${isHeard(t) ? ' heard' : ''}" data-id="${esc(t.id)}">
        <img class="rc" alt="" loading="lazy" decoding="async">
        <div class="rm"><div class="rt">${esc(t.name)}${t.mix ? ' <small>' + esc(t.mix) + '</small>' : ''}</div><div class="ra">${esc(t.artist)}</div><div class="rx">${esc(metaLine(t))}</div></div>
        <button class="rb rfav" aria-label="Guardar">${i('star')}</button>
        ${t.downloads.length ? `<button class="rb rdl${done ? ' done' : ''}" aria-label="Descargar">${i(done ? 'check' : 'dl')}</button>` : ''}
      </div>`);
      const img = $('img', r);
      img.src = coverAt(t.cover, coverSize && +coverSize <= 150 ? coverSize : '110');
      img.onerror = () => { if (img.src !== t.cover) img.src = t.cover; };
      r.addEventListener('click', (e) => {
        if (e.target.closest('.rb')) return;
        playFromList(t);
      });
      $('.rfav', r).addEventListener('click', () => toggleFav(t));
      const d = $('.rdl', r);
      if (d) d.addEventListener('click', () => askDownload(t));
      paintFav(r, t);
      frag.appendChild(r);
    });
    const pager = el(`<div class="pager">
      <button class="btn bpv"${newer || pageNumber() > 1 ? '' : ' disabled'}>‹ Más reciente</button>
      <button class="btn bnx pri"${older || pages.hasMore ? '' : ' disabled'}>Día anterior ›</button>
    </div>`);
    $('.bpv', pager).addEventListener('click', () => goListDay(listDay - 1));
    $('.bnx', pager).addEventListener('click', () => goListDay(listDay + 1));
    frag.appendChild(pager);
    listEl.textContent = '';
    listEl.appendChild(frag);
    if (keepScroll) listEl.scrollTop = st;
    markCurrentRow();
    // si el día aún no está completo (sigue en la página siguiente de Soundeo), traerlo
    if (!complete && isOpen && view === 'list' && !pages.loading) loadMore();
  }
  function listRowById(id) {
    return listEl ? listEl.querySelector('.row[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]') : null;
  }
  function playFromList(t) {
    if (current && current.id === t.id) { togglePlay(); return; }
    if (!deck.some((x) => x.id === t.id)) {
      forced.add(t.id);
      buildDeck();
      renderFeed();
    }
    const idx = deck.findIndex((x) => x.id === t.id);
    activeIdx = idx;
    load(t, true);
    onActive(idx, true);
  }
  function markCurrentRow() {
    if (!listEl) return;
    $$('.row.cur', listEl).forEach((r) => r.classList.remove('cur'));
    if (current) {
      const r = listRowById(current.id);
      if (r) r.classList.add('cur');
    }
  }

  /* ───────────── reproducción ───────────── */
  // Precarga: mientras suena una canción, el otro <audio> va cargando la siguiente. Al pasar de
  // canción se intercambian los dos y la nueva empieza sin esperar a la red.
  const bufSecs = (a) => {
    try { return a.buffered.length ? Math.round(a.buffered.end(a.buffered.length - 1) * 10) / 10 : 0; } catch (e) { return 0; }
  };
  function nextUp() {
    if (!current) return null;
    if (view === 'list' && listOrder.includes(current.id)) {
      const id = listOrder[listOrder.indexOf(current.id) + 1];
      return (id && tracks.find((t) => t.id === id)) || null;
    }
    const k = deck.findIndex((t) => t.id === current.id);
    return k >= 0 ? deck[k + 1] || null : null;
  }
  function preloadNext() {
    if (!prefs.preload || pl.broken || document.hidden) return;
    const n = nextUp();
    if (!n || !n.preview) return;
    const sp = spare();
    if (sp._sxId === n.id) return; // ya está pedida (si dio error no se reintenta: load() hará la carga normal)
    sp._sxId = n.id;
    sp._sxAt = performance.now();
    try { sp.src = n.preview; sp.load(); pl.primes++; } catch (e) { sp._sxId = null; }
  }
  function unlockSpare() {
    // iOS solo deja sonar un <audio> que se haya usado dentro de un toque: load() en el primer toque lo desbloquea
    if (pl.unlocked) return;
    pl.unlocked = true;
    try { spare().load(); } catch (e) {}
  }
  function load(t, play) {
    if (!t) return;
    let swapped = null;
    let changed = false;
    if (!current || current.id !== t.id) {
      changed = true;
      current = t;
      if (!t.preview) { toast('Este track no tiene preview'); }
      const sp = spare();
      if (prefs.preload && !pl.broken && !document.hidden && t.preview && sp._sxId === t.id && !sp.error) {
        // ya estaba cargada en el otro elemento: intercambiar
        swapped = audio;
        pl.mode = 'pre';
        pl.info = { ready: sp.readyState, buf: bufSecs(sp), lead: Math.round(performance.now() - (sp._sxAt || performance.now())) };
        try { swapped.pause(); } catch (e) {}
        audio = sp; // el anterior se queda con su canción: si vuelves atrás enseguida, también es instantáneo
        try { if (audio.currentTime > 0) audio.currentTime = 0; } catch (e) {}
        pl.swaps++;
      } else {
        pl.mode = 'cold';
        pl.info = null;
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
          a._sxId = null;
          try { a.removeAttribute('src'); a.load(); } catch (e) {}
          audio = swapped;
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
  function seekBy(s) {
    if (!current || !isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration - 0.5, audio.currentTime + s));
  }
  function paintPlayer() {
    const playing = !audio.paused && !audio.ended;
    const bp = root && $('.bplay', root);
    if (bp) bp.innerHTML = i(playing ? 'pause' : 'play');
    const mp = root && $('.mplay', root);
    if (mp) mp.innerHTML = i(playing ? 'pause' : 'play');
    if (feedEl) {
      $$('.card.playing', feedEl).forEach((c) => c.classList.remove('playing'));
      $$('.card:not(.end)', feedEl).forEach((c) => c.classList.add('paused'));
      if (current) {
        const c = cardById(current.id);
        if (c) { c.classList.toggle('playing', playing); c.classList.toggle('paused', !playing); }
      }
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
  function paintProgress() {
    const d = audio.duration;
    const c = audio.currentTime;
    const pct = isFinite(d) && d > 0 ? (c / d) * 100 : 0;
    if (!root) return;
    $('.fill', ctrlEl).style.width = pct + '%';
    $('.knob', ctrlEl).style.left = pct + '%';
    $('.tc', ctrlEl).textContent = fmtTime(c);
    $('.td', ctrlEl).textContent = isFinite(d) ? fmtTime(d) : '0:00';
    $('.mprog', miniEl).style.width = pct + '%';
    try {
      if (audio.buffered.length && isFinite(d) && d > 0) $('.buf', ctrlEl).style.width = (audio.buffered.end(audio.buffered.length - 1) / d) * 100 + '%';
    } catch (e) {}
  }
  function setupBar(bar) {
    let dragging = false;
    const seekTo = (x) => {
      const r = bar.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (x - r.left) / r.width));
      if (isFinite(audio.duration)) audio.currentTime = p * audio.duration;
      paintProgress();
    };
    bar.addEventListener('pointerdown', (e) => { dragging = true; try { bar.setPointerCapture(e.pointerId); } catch (x) {} seekTo(e.clientX); });
    bar.addEventListener('pointermove', (e) => { if (dragging) seekTo(e.clientX); });
    const end = () => { dragging = false; };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  }

  // los eventos solo cuentan si vienen del elemento que está sonando (el otro está precargando)
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
  });
  onAudio('waiting', () => app && app.classList.add('spin'));
  onAudio('pause', paintPlayer);
  onAudio('loadedmetadata', paintProgress);
  onAudio('timeupdate', () => {
    const now = performance.now();
    if (now - lastProgPaint > 200) { lastProgPaint = now; paintProgress(); }
    if (current && audio.currentTime >= 0.5) markHeard(current.id);
    if (wantPlay && audio.currentTime >= 1) preloadNext();
  });
  onAudio('ended', () => {
    paintPlayer();
    if (!prefs.autoNext) { wantPlay = false; return; }
    const idx = current ? deck.findIndex((t) => t.id === current.id) : activeIdx;
    if (view === 'list' && current && listOrder.includes(current.id)) {
      const k = listOrder.indexOf(current.id) + 1;
      if (k < listOrder.length) playListTrack(listOrder[k], true);
      return;
    }
    if (idx >= 0 && idx + 1 < deck.length) goTo(idx + 1, { play: true });
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
    h('seekto', (d) => { if (d && d.seekTime != null) audio.currentTime = d.seekTime; });
  }

  /* ───────────── favoritos / descargas / votos (usa los botones originales de Soundeo) ───────────── */
  const origFav = (t) => (t.el && $('button.favorites', t.el)) || $('button.favorites[data-track-id="' + t.id + '"]');
  const favPending = new Map(); // id -> estado esperado mientras Soundeo responde
  const isFav = (t) => {
    if (favPending.has(t.id)) return favPending.get(t.id);
    const b = origFav(t);
    return !!(b && b.classList.contains('favored'));
  };

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
        if (/favor/.test(e.type)) setTimeout(() => tracks.forEach((t) => repaintFav(t.id)), 60);
      });
      jq(document).on('ajaxSend', (e, x, s) => logCap('jq-ajax', { m: s && s.type, u: short(s && s.url, 160), d: short(s && s.data, 160) }));
      jq(document).on('ajaxError', (e, x, s, err) => logCap('jq-ajax-error', { u: short(s && s.url, 160), s: x && x.status, err: short(err, 80) }));
    } catch (e) {}
  }
  // Soundeo escucha los clics en document (delegados). Por si su código comprueba que el botón es visible,
  // se muestra la página original solo durante el clic (síncrono: no llega a pintarse).
  function clickOriginal(node, label) {
    startCapture(label || 'click');
    const html = document.documentElement;
    const wasOpen = html.classList.contains('sx-open');
    if (wasOpen) html.classList.remove('sx-open');
    try { node.click(); } catch (e) { logCap('click-error', { m: short(e && e.message, 200) }); }
    finally { if (wasOpen) html.classList.add('sx-open'); }
  }
  let lastAction = null;
  const favCount = () => { const s = $('#span-favorites'); return s ? clean(s.textContent) : null; };
  const looksLikeError = (txt) => /error|fail|denied|forbidden|not\s*logged|login|premium|limit|exceed/i.test(txt || '') && !/"?success"?\s*:\s*(true|1)/i.test(txt || '');
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
    const t = tracks.find((x) => x.id === id);
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
    const b = origFav(t);
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
        if (b) b.classList.toggle('favored', favored);
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
  function dlLeftText() {
    const n = dlLeft();
    return n == null ? 'No veo el contador de descargas' : 'Te quedan ' + n + ' descarga' + (n === 1 ? '' : 's') + ' hoy';
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
  function vote(t) {
    startCapture('vote ' + t.id);
    siteRequest('/tracks/vote/' + encodeURIComponent(t.id), 'POST')
      .then(({ r }) => {
        lastAction = { type: 'vote', id: t.id, response: trimResp(r) };
        applyHeader(r);
        if (!r || !r.success) { toast(r && r.message ? 'Soundeo dice: ' + plainMsg(r.message).slice(0, 110) : 'Soundeo no ha aceptado el voto'); return; }
        try { window.jQuery && r.hasOwnProperty('result') && window.jQuery(document).trigger('voted.track', { voted: r.result, votes: r.votes, trackId: Number(t.id) }); } catch (e) {}
        toast(r.result === false ? 'Voto quitado' : 'Voto enviado' + (r.votes != null ? ' · ' + r.votes + ' votos' : ''));
      })
      .catch((e) => toast('Error al votar: ' + short(e && e.message, 80)));
  }

  /* ───────────── hojas ───────────── */
  function openSheet(cls) {
    closeSheets();
    shadeEl.classList.add('on');
    $('.' + cls, root).classList.add('on');
  }
  function closeSheets() {
    shadeEl.classList.remove('on');
    $$('.sheet.on', root).forEach((s) => s.classList.remove('on'));
  }
  function actionSheet(title, sub, note, opts) {
    const s = $('.s-action', root);
    $('h2', s).textContent = title;
    const b = $('.sb', s);
    b.innerHTML = (sub ? `<div class="asub">${esc(sub)}</div>` : '') + (note ? `<div class="note" style="margin:0 0 6px">${esc(note)}</div>` : '');
    opts.forEach((o) => {
      const x = el(`<button class="opt${o.pri ? ' pri' : ''}"${o.disabled ? ' disabled' : ''}>${o.icon ? i(o.icon) : ''}<span>${esc(o.label)}</span>${o.small ? '<small>' + esc(o.small) + '</small>' : ''}</button>`);
      if (!o.disabled) x.addEventListener('click', () => { closeSheets(); o.fn(); });
      b.appendChild(x);
    });
    openSheet('s-action');
  }
  function moreSheet(t) {
    const opts = [];
    if (t.labelId) {
      opts.push({ label: 'Más de ' + t.label, icon: 'feed', fn: () => {
        location.href = buildListUrl({ available: '1', label: t.labelId, genres: [], time: '0' }) + '#sx=feed';
      } });
    }
    opts.push({ label: 'Copiar «' + (t.artist ? t.artist + ' – ' : '') + t.name + '»', icon: 'check', fn: () => copyText(t.full) });
    if (t.trackUrl) opts.push({ label: 'Abrir track en Soundeo', icon: 'ext', fn: () => { closeApp(); location.href = t.trackUrl; } });
    if (t.releaseUrl) opts.push({ label: 'Abrir release en Soundeo', icon: 'ext', fn: () => { closeApp(); location.href = t.releaseUrl; } });
    if (t.vote) opts.push({ label: 'Votar para que esté disponible', icon: 'up', fn: () => vote(t) });
    actionSheet(t.name, [t.artist, t.release, t.label].filter(Boolean).join(' · '), '', opts);
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
  function openSettings(mode) {
    const isStart = mode === 'start';
    const cur = isStart ? defFilters : filtersFromUrl();
    const f = {
      genres: (cur.genres || []).slice(), bpmMin: cur.bpmMin, bpmMax: cur.bpmMax, time: cur.time || '0', keys: (cur.keys || []).slice(),
      available: cur.available == null ? '1' : cur.available, trackType: cur.trackType || '0', search: isStart ? '' : cur.search || '',
      artist: isStart ? '' : cur.artist || '', label: isStart ? '' : cur.label || '',
    };
    const s = $('.s-settings', root);
    const b = $('.sb', s);
    $('h2', s).textContent = isStart ? 'Filtros al abrir' : 'Ajustes';
    const genres = genreOptions();
    const keys = keyOptions();
    const favN = clean($('#span-favorites') && $('#span-favorites').textContent);
    const acc = clean($('#top-menu-account span') && $('#top-menu-account span').textContent);
    b.innerHTML = `
      ${isStart ? '<div class="note" style="margin-top:4px">Con estos filtros se abrirá la app cada vez que entres en Soundeo.</div>' : ''}
      ${isStart ? '' : `
      <div class="sec">Al abrir la app</div>
      <button class="opt ostart">${i('sliders')}<span class="ol"><span>Filtros de inicio</span><em>${esc(describeFilters(defFilters))}</em></span><small>›</small></button>
      <div class="tg"><div><b>Empezar siempre con estos filtros</b><small>Aunque entres desde un marcador, un enlace o soundeo.com</small></div><button class="sw" data-p="forceStart"></button></div>
      <div class="tg"><div><b>Abrir la app automáticamente</b><small>Al entrar en Soundeo desde el móvil</small></div><button class="sw" data-p="autoOpen"></button></div>
      <div class="lab">Vista al abrir</div>
      <div class="seg2 sv"><button data-v="feed">Feed</button><button data-v="list">Lista</button></div>
      ${sameAsStart() ? '' : '<button class="opt pri bmine" style="margin-top:6px">' + i('feed') + '<span>Ir ahora a los filtros de inicio</span></button>'}
      `}
      <div class="sec">${isStart ? 'Filtros de inicio' : 'Filtros de esta vista'}</div>
      ${f.label || f.artist ? `<div class="note" style="margin-top:0">Estás viendo un ${f.label ? 'sello' : 'artista'} concreto. «Aplicar» lo mantiene; «Mis filtros» vuelve a tu selección.</div>` : ''}
      <div class="lab">Géneros <small class="gcount"></small></div>
      <div class="tags tg-genres collapsed">${genres.map((g) => `<button class="tag" data-id="${esc(g.id)}">${esc(g.name)}</button>`).join('')}<button class="tag tmore" data-for="tg-genres">＋ Ver los ${genres.length}</button></div>
      <div class="lab">BPM <a href="#" class="bpmclear">Quitar</a></div>
      <div class="bpm"><input class="bmin" type="number" inputmode="numeric" placeholder="mín" min="0" max="260"><span>–</span><input class="bmax" type="number" inputmode="numeric" placeholder="máx" min="0" max="260"></div>
      <div class="presets">${[[120, 126], [124, 130], [127, 140], [130, 140], [135, 150]].map(([a, z]) => `<button class="tag bp" data-a="${a}" data-z="${z}">${a}–${z}</button>`).join('')}</div>
      <div class="lab">Fecha de lanzamiento</div>
      <div class="tags tg-time">${TIME_OPTS.map(([v, n]) => `<button class="tag" data-v="${v}">${n}</button>`).join('')}</div>
      <div class="lab">Tonalidad <small>opcional · Camelot</small></div>
      <div class="tags tg-keys collapsed">${keys.map((k) => `<button class="tag" data-id="${esc(k.id)}"><small>${esc(k.cam)}</small>${esc(k.id)}</button>`).join('')}<button class="tag tmore" data-for="tg-keys">＋ Elegir tonalidades</button></div>
      <div${isStart ? ' style="display:none"' : ''}><div class="lab">Buscar por título</div>
      <input class="txt srch" type="search" placeholder="Mín. 3 letras" autocomplete="off" autocapitalize="off"></div>
      <div class="tg"><div><b>Solo disponibles</b><small>Oculta los tracks que solo se pueden votar</small></div><button class="sw sw-av"></button></div>
      ${isStart ? '' : `

      <div class="sec">Reproducción</div>
      <div class="tg"><div><b>Pasar a la siguiente al acabar</b><small>Cuando termina la preview</small></div><button class="sw" data-p="autoNext"></button></div>
      <div class="tg"><div><b>Precargar la siguiente canción</b><small>Al pasar de canción empieza a sonar antes. Gasta algo más de datos</small></div><button class="sw" data-p="preload"></button></div>
      <div class="tg"><div><b>Feed: solo lo que no he escuchado</b><small>Oculta los tracks que ya han sonado</small></div><button class="sw" data-p="skipHeard"></button></div>
      <div class="tg"><div><b>Sincronizar escuchadas con la web</b><small>Lo que Soundeo marca como escuchado cuenta aquí, y lo que escuchas aquí se marca en Soundeo</small></div><button class="sw" data-p="siteHeard"></button></div>
      <div class="tg"><div><b>Confirmar antes de descargar</b><small>Para no gastar descargas sin querer</small></div><button class="sw" data-p="confirmDownload"></button></div>

      <div class="sec">Atajos</div>
      <button class="opt gofav">${i('star')}<span>Mis favoritos</span><small>${esc(favN)}</small></button>
      <button class="opt godl">${i('dl')}<span>Mis descargas</span><small>${dlLeft() == null ? '' : 'quedan ' + dlLeft() + ' hoy'}</small></button>
      <button class="opt goweb">${i('ext')}<span>Ver la web original</span></button>
      <button class="opt rsheard">${i('back')}<span>Olvidar escuchadas</span><small>${heard.size}</small></button>
      ${loader() ? `<button class="opt oupd">${i('fwd')}<span>Buscar actualización</span><small>v${VERSION}</small></button>` : ''}
      <button class="opt diag">${i('more')}<span>Diagnóstico (para Claude)</span></button>
      <button class="opt diagnav">${i('more')}<span>Diagnóstico de navegación</span><small>para la 1.2</small></button>
      <div class="note">Soundeo Feed ${VERSION}${loader() ? ' · se actualiza sola' : ''}${acc ? ' · Premium: ' + esc(acc) : ''}</div>`}
    `;
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
    $('.srch', b).value = f.search || '';
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
      const box = $('.' + x.dataset.for, b);
      box.classList.remove('collapsed');
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
    const go = (ff) => {
      readBpm();
      ff.search = clean($('.srch', b).value);
      if (ff.search && ff.search.length < 3) { toast('La búsqueda necesita 3 letras o más'); return; }
      location.href = buildListUrl(ff) + '#sx=' + view;
    };
    const saveStart = () => {
      readBpm();
      const keep = { genres: f.genres, bpmMin: f.bpmMin, bpmMax: f.bpmMax, time: f.time, keys: f.keys, available: f.available, trackType: f.trackType, search: '' };
      defFilters = Object.assign({}, DEFAULT_FILTERS, keep);
      LS.set('filters', defFilters);
    };
    const foot = $('.sf', s);
    if (isStart) {
      foot.innerHTML = '<button class="btn bback">Volver</button><button class="btn pri bsavestart">Guardar</button>';
      $('.bback', foot).addEventListener('click', () => openSettings());
      $('.bsavestart', foot).addEventListener('click', () => {
        saveStart();
        openSettings();
        toast('Guardado: Soundeo se abrirá con estos filtros', sameAsStart() ? '' : 'Verlos ya', () => { location.href = buildListUrl(defFilters) + '#sx=' + view; });
      });
    } else {
      foot.innerHTML = '<button class="btn bsave">Guardar como inicio</button><button class="btn pri bapply">Aplicar filtros</button>';
      $('.bapply', foot).addEventListener('click', () => go(f));
      $('.bsave', foot).addEventListener('click', () => {
        saveStart();
        toast('Guardados como filtros de inicio');
        go(Object.assign({}, f, { artist: '', label: '' }));
      });
    }
    const bm = $('.bmine', b);
    if (bm) bm.addEventListener('click', (e) => { e.preventDefault(); location.href = buildListUrl(defFilters) + '#sx=' + view; });
    const os = $('.ostart', b);
    if (os) os.addEventListener('click', () => { openSettings('start'); $('.sb', s).scrollTop = 0; });
    $$('.sw[data-p]', b).forEach((x) => {
      const p = x.dataset.p;
      x.classList.toggle('on', !!prefs[p]);
      x.addEventListener('click', () => {
        prefs[p] = !prefs[p];
        savePrefs();
        x.classList.toggle('on', !!prefs[p]);
        if (p === 'skipHeard' || p === 'siteHeard') {
          hiddenAtLoad = hiddenFor(tracks);
          forced = new Set();
          rebuild(current || deck[activeIdx]);
        }
        if (p === 'preload' && !prefs.preload) {
          // dejar de descargar lo que estuviera precargando
          const sp = spare();
          sp._sxId = null;
          try { sp.removeAttribute('src'); sp.load(); } catch (e) {}
        }
      });
    });
    const paintSv = () => $$('.sv button', b).forEach((x) => x.classList.toggle('on', x.dataset.v === prefs.startView));
    paintSv();
    $$('.sv button', b).forEach((x) => x.addEventListener('click', () => { prefs.startView = x.dataset.v; savePrefs(); paintSv(); }));
    if (isStart) { openSheet('s-settings'); return; }
    $('.gofav', b).addEventListener('click', () => { location.href = location.origin + '/account/favorites#sx=list'; });
    $('.godl', b).addEventListener('click', () => { location.href = location.origin + '/account/downloads#sx=list'; });
    $('.goweb', b).addEventListener('click', () => { closeSheets(); closeApp(); });
    $('.rsheard', b).addEventListener('click', () => {
      heard.clear();
      LS.set('heard', []);
      hiddenAtLoad = new Set();
      forced = new Set();
      rebuild(current || deck[activeIdx]);
      closeSheets();
      toast('Historial de escuchadas borrado');
    });
    $('.diag', b).addEventListener('click', diagnostics);
    $('.diagnav', b).addEventListener('click', () => { closeSheets(); navProbe(); });
    const ou = $('.oupd', b);
    if (ou) ou.addEventListener('click', () => { closeSheets(); checkUpdate(); });
    openSheet('s-settings');
  }

  /* ───────────── diagnóstico ───────────── */
  async function diagnostics() {
    const t = deck[activeIdx] || tracks[0];
    const out = {
      v: VERSION,
      url: location.href,
      ua: navigator.userAgent,
      tracks: tracks.length,
      deck: deck.length,
      coverSize,
      sampleCover: t && t.cover,
      sampleMeta: t && metaCache[t.id],
      jq: typeof window.jQuery,
    };
    out.loader = loader() ? { v: loader().version, running: loader().running, src: loader().source } : null;
    const avg = (x) => (x.n ? Math.round(x.ms / x.n) : null);
    out.player = {
      preload: prefs.preload, broken: pl.broken, unlocked: pl.unlocked, primes: pl.primes, swaps: pl.swaps, fails: pl.fails,
      startMs: { pre: avg(pl.stat.pre), preN: pl.stat.pre.n, cold: avg(pl.stat.cold), coldN: pl.stat.cold.n }, last: pl.last,
      spare: { id: spare()._sxId || null, ready: spare().readyState, buf: bufSecs(spare()), err: spare().error ? spare().error.code : null },
    };
    out.lastAction = lastAction;
    out.capture = cap.items;
    out.counters = { downloads: dlLeft(), favorites: favCount() };
    out.mainScript = ($('#mainScript') || {}).src || null;
    out.notification = typeof window.Notification;
    out.siteListened = { listened: $$('.content .left .vis.listened').length, vis: $$('.content .left .vis').length, tracks: tracks.length, siteHeard: tracks.filter((t) => t.siteHeard).length, mine: tracks.filter((t) => heard.has(t.id)).length, pagesLoaded: pages.first + '-' + pages.last };
    if (t) {
      const fb = origFav(t);
      out.favBtn = fb ? fb.outerHTML : null;
      if (!metaCache[t.id]) try {
        const r = await fetch(t.trackUrl, { credentials: 'include' });
        const html = await r.text();
        out.trackStatus = r.status;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const og = $('meta[property="og:image"]', doc);
        out.ogImage = og && og.getAttribute('content');
        const scope = stripChrome(doc);
        const src = scope ? scope.innerHTML.replace(/\s+/g, ' ') : '';
        const k = src.search(/bpm/i);
        out.trackBpmSnippet = k >= 0 ? src.slice(Math.max(0, k - 500), k + 500) : src.slice(0, 1000);
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

  // Sonda de navegación: mira cómo son las páginas de búsqueda, artista, sello, release y seguidos
  // de Soundeo (solo su estructura) para poder construir esas vistas dentro de la app.
  async function navProbe() {
    const t = current || deck[activeIdx] || tracks[0];
    if (!t) { toast('Abre primero una lista con tracks'); return; }
    toast('Analizando páginas de Soundeo…');
    const out = { v: VERSION, probe: 'nav', track: { id: t.id, artist: t.artist, label: t.label, labelId: t.labelId || null } };
    const sig = (n) => n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') +
      (typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/).slice(0, 4).join('.') : '');
    const tally = (nodes) => {
      const m = {};
      nodes.forEach((n) => { const k = sig(n); m[k] = (m[k] || 0) + 1; });
      return Object.keys(m).slice(0, 24).map((k) => (m[k] > 1 ? k + ' ×' + m[k] : k));
    };
    const look = async (name, url, extra) => {
      const o = { url: url.replace(location.origin, '') };
      out[name] = o;
      try {
        const r = await fetch(url, { credentials: 'include' });
        o.status = r.status;
        if (r.url && r.url !== url) o.final = r.url.replace(location.origin, '');
        const html = await r.text();
        o.len = html.length;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        o.title = short(doc.title, 90);
        const left = $('.content .left', doc) || $('.content', doc) || doc.body;
        o.root = sig(left);
        o.heads = $$('h1,h2,h3', left).slice(0, 8).map((h) => h.tagName + ': ' + short(h.textContent, 60));
        o.tracks = $$('.trackitem[data-track-id]', left).length;
        o.pagination = !!$('.pagination', left);
        const kids = Array.from(left.children);
        o.children = tally(kids);
        o.inner = tally(kids.filter((c) => !c.classList.contains('trackitem')).flatMap((c) => Array.from(c.children)).filter((n) => !n.classList.contains('trackitem')));
        // enlaces que no son de un track, agrupados por forma
        const links = {};
        $$('a[href]', left).forEach((a) => {
          if (a.closest('.trackitem') || a.closest('.pagination')) return;
          const h = a.getAttribute('href') || '';
          const k = h.replace(/^https?:\/\/[^/]+/, '').replace(/=[^&]*/g, '=…').replace(/\/[^/?]+\.html.*$/, '/….html').replace(/\d+/g, 'N').slice(0, 70);
          (links[k] = links[k] || []).push(short(a.textContent, 40) + ' → ' + short(h, 110));
        });
        o.links = Object.keys(links).slice(0, 16).map((k) => ({ k, n: links[k].length, ej: links[k].slice(0, 2) }));
        // botones de seguir / favorito que no son de un track
        o.follow = $$('[class*="follow"],[class*="favor"],[class*="subscr"],[data-artist-id],[data-label-id]', doc)
          .filter((n) => !n.closest('.trackitem') && !/^(html|body|i)$/i.test(n.tagName)).slice(0, 8).map((n) => short(n.outerHTML, 420));
        // primer bloque que no es un track (cabecera de artista/sello/release, resultado de búsqueda…)
        const first = kids.find((c) => !c.classList.contains('trackitem') && !/^(h1|script|style)$/i.test(c.tagName) && !c.querySelector('.trackitem') && clean(c.textContent).length > 3);
        o.sample = first ? short(first.outerHTML, 900) : null;
        if (extra) extra(doc, left, o);
      } catch (e) { o.err = String(e); }
      return o;
    };
    // menús de la web (fuera del contenido)
    const seen = new Set();
    out.menu = $$('a[href]').filter((a) => !a.closest('.content') && !a.closest('#sx-host')).map((a) => {
      const h = (a.getAttribute('href') || '').replace(location.origin, '');
      return short(a.textContent, 28) + ' → ' + short(h, 70);
    }).filter((x) => !/→ (#|javascript:)?$/.test(x) && !seen.has(x) && seen.add(x)).slice(0, 45);
    out.forms = $$('form').filter((f) => !f.closest('#sx-host')).slice(0, 4).map((f) => ({
      action: f.getAttribute('action'), method: f.getAttribute('method'), fields: $$('input,select', f).slice(0, 8).map((x) => (x.name || x.id || '?') + ':' + (x.type || x.tagName.toLowerCase())),
    }));
    const artist1 = clean(String(t.artist || '').split(/,|&| feat| vs /i)[0]) || t.name;
    let artistHref = '';
    if (t.trackUrl) await look('trackPage', t.trackUrl, (doc, left, o) => {
      o.artists = $$('a[href*="artistFilter="]', left).slice(0, 6).map((a) => short(a.textContent, 40) + ' → ' + short(a.getAttribute('href'), 110));
      const a = $$('a[href*="artistFilter="]', left).find((x) => /artistFilter=\d/.test(x.getAttribute('href')));
      if (a) artistHref = absHref(a);
      o.artistBox = short(($('.full-artist-link', left) || {}).outerHTML || '', 600) || null;
    });
    if (artistHref) await look('artist', artistHref);
    if (t.labelId) await look('label', buildListUrl({ available: '1', label: t.labelId, genres: [], time: '0' }));
    if (t.releaseUrl) await look('release', t.releaseUrl, (doc, left, o) => {
      const ti = $('.trackitem[data-track-id]', left);
      o.item = ti ? short(ti.outerHTML, 1100) : null;
    });
    await look('search', location.origin + '/search?q=' + encodeURIComponent(artist1));
    await look('followed', location.origin + '/account/followed');
    showDiag('Diagnóstico de navegación', JSON.stringify(out, null, 1));
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
    $('span', p).textContent = n == null ? '–' : String(n);
    p.classList.toggle('zero', n === 0);
  }
  function watchSite() {
    const left = $('.content .left');
    if (left) {
      new MutationObserver((muts) => {
        const ids = new Set();
        muts.forEach((m) => {
          const tgt = m.target;
          if (tgt && tgt.classList && tgt.classList.contains('favorites')) ids.add(tgt.getAttribute('data-track-id'));
        });
        ids.forEach((id) => id && repaintFav(id));
      }).observe(left, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    ['#span-downloads', '#span-favorites'].forEach((sel) => {
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
    let navType0 = 'navigate';
    try { navType0 = (performance.getEntriesByType('navigation')[0] || {}).type || 'navigate'; } catch (e) {}
    const fromOutside = navType0 === 'navigate' && !hs.view;
    if (fromOutside && prefs.forceStart && prefs.autoOpen && isMobile() && isLoggedIn() && !SS.get('closed', 0) &&
        (location.pathname === '/' || (/^\/list\/tracks/.test(location.pathname) && !sameAsStart()))) {
      location.replace(buildListUrl(defFilters) + '#sx=' + prefs.startView);
      return;
    }
    const hasTracks = !!$('.trackitem[data-track-id]');
    if (!hasTracks) {
      if (!isLoggedIn()) return;
      buildShell();
      root.classList.add('fabon');
      return;
    }
    tracks = parseTracks();
    if (!tracks.length) return;
    pages.first = pages.last = pageNumber();
    pages.hasMore = !!nextPageHref(document);
    buildShell();
    root.classList.add('fabon');
    // la posición del hash solo vale al recargar o volver atrás (no al abrir un marcador)
    let navType = 'navigate';
    try { navType = (performance.getEntriesByType('navigation')[0] || {}).type || 'navigate'; } catch (e) {}
    const resumeId = navType === 'reload' || navType === 'back_forward'
      ? hs.id || SS.get('pos:' + location.pathname + location.search, null)
      : null;
    hiddenAtLoad = hiddenFor(tracks);
    if (resumeId) forced.add(resumeId);
    buildDeck();
    renderFeed();
    renderList();
    watchSite();
    hookNet();
    hookSiteEvents();
    setupMediaSessionHandlers();

    const at = resumeId ? deck.findIndex((t) => t.id === resumeId) : -1;
    activeIdx = at >= 0 ? at : 0;
    probeCoverSize(tracks[0] && tracks[0].cover);

    const isListPage = /^\/list\/tracks/.test(location.pathname);
    const shouldOpen = hs.view || (isListPage && prefs.autoOpen && isMobile() && !SS.get('closed', 0));
    if (shouldOpen) {
      if (deck[activeIdx]) load(deck[activeIdx], false);
      openApp(hs.view || SS.get('view', null) || prefs.startView);
      // red de seguridad: si Soundeo marca TODA la página como escuchada, preguntar una vez
      if (prefs.siteHeard && tracks.length >= 20 && tracks.every((t) => t.siteHeard) && !LS.get('siteHeardAsked', false)) {
        LS.set('siteHeardAsked', true);
        setTimeout(() => toast('Soundeo marca toda esta página como escuchada', 'No usarlo', () => {
          prefs.siteHeard = false;
          savePrefs();
          hiddenAtLoad = hiddenFor(tracks);
          rebuild(deck[0]);
        }), 600);
      }
      if (!LS.get('hintSwipe', false)) {
        LS.set('hintSwipe', true);
        setTimeout(() => toast('Nuevo: desliza ← → para cambiar de canción y ↓ para ir a la lista', 'Vale', () => {}), 900);
      }
      if (SS.get('autoplay', 0)) {
        SS.del('autoplay');
        // iOS solo permite sonar tras un toque; si no deja, se queda en pausa
        if (deck[activeIdx]) load(deck[activeIdx], true);
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
