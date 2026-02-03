// app.js - index.html içindeki #screen-list ve #screen-detail ile çalışır
// Data yolu: /data/marvel/... ve /data/starwars/...

const OMDB_API_KEY = "a57784cc";
const STORE_KEY = "koleksiyon_takip_v3";

const elList = document.getElementById("screen-list");
const elDetail = document.getElementById("screen-detail");

const tabMarvelBtn = document.getElementById("tab-marvel");
const tabStarwarsBtn = document.getElementById("tab-starwars");

const state = loadState();

let currentTab = "marvel";       // marvel | starwars
let currentCategory = null;      // category object
let currentItems = [];           // items in category
let currentSeriesMeta = null;    // omdb meta for series
let currentSeason = null;        // season number

// ---------- helpers ----------
function showListScreen() {
  elList.classList.remove("hidden");
  elDetail.classList.add("hidden");
}
function showDetailScreen() {
  elList.classList.add("hidden");
  elDetail.classList.remove("hidden");
}

function setActiveTab(tab) {
  currentTab = tab;
  if (tabMarvelBtn && tabStarwarsBtn) {
    tabMarvelBtn.classList.toggle("active", tab === "marvel");
    tabStarwarsBtn.classList.toggle("active", tab === "starwars");
  }
}

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function keyForItem(item) {
  return String(item.id || item.title || item.name);
}

function normalizeTitle(t) {
  if (!t) return "";
  let s = String(t).trim();
  s = s.replace(/\([^)]*\)/g, "").trim(); // parantez içlerini at
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { watched: {}, seasons: {}, episodes: {}, omdbCache: {} };
    const j = JSON.parse(raw);
    return {
      watched: j.watched || {},
      seasons: j.seasons || {},
      episodes: j.episodes || {},
      omdbCache: j.omdbCache || {},
    };
  } catch {
    return { watched: {}, seasons: {}, episodes: {}, omdbCache: {} };
  }
}
function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

async function fetchText(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} yüklenemedi (${res.status})`);
  return await res.text();
}

async function loadExportDefaultJS(path) {
  // Dosya: export default [...]
  const text = await fetchText(path);

  // export default dışındaki şeyleri temizle
  const cleaned = text
    .replace(/^\s*export\s+default\s+/m, "")
    .replace(/;\s*$/m, "");

  // Güvenli parse: Function ile obje/array döndür
  // eslint-disable-next-line no-new-func
  return new Function(`return (${cleaned});`)();
}

// index dosyası bazen array, bazen object olabilir. Her ikisini de kaldırıyoruz.
function extractCategories(indexData) {
  if (Array.isArray(indexData)) return indexData;
  if (indexData && Array.isArray(indexData.categories)) return indexData.categories;
  if (indexData && Array.isArray(indexData.items)) return indexData.items;
  // son çare: object içindeki ilk array
  if (indexData && typeof indexData === "object") {
    for (const v of Object.values(indexData)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function folderForTab(tab) {
  return tab === "starwars" ? "starwars" : "marvel";
}

// kategori dosya yolunu bul
function collectionPath(tab, cat) {
  const folder = folderForTab(tab);

  // index içinde file/path verilmişse onu kullan
  if (cat && cat.file) return `/data/${folder}/${cat.file}`;
  if (cat && cat.path) return cat.path.startsWith("/") ? cat.path : `/data/${folder}/${cat.path}`;

  // değilse key üzerinden tahmin et:
  // marvel: mcu -> mcu.collection.js
  // starwars: canon -> canon.collection.js
  const key = (cat && (cat.key || cat.id || cat.slug)) ? (cat.key || cat.id || cat.slug) : "";
  if (!key) return null;

  // bazı indexlerde key "mcu" ama dosya "mcu.collection.js" zaten.
  return `/data/${folder}/${key}.collection.js`;
}

// OMDb
async function omdb(params) {
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", OMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  return await r.json();
}

async function getOmdbMeta(item) {
  const k = keyForItem(item);
  if (state.omdbCache[k]) return state.omdbCache[k];

  let meta = null;

  if (item.imdbID) {
    const j = await omdb({ i: item.imdbID });
    if (j.Response === "True") meta = j;
  }
  if (!meta) {
    const t = normalizeTitle(item.omdbTitle || item.title || item.name);
    const j = await omdb({ t });
    if (j.Response === "True") meta = j;
  }

  if (!meta) {
    state.omdbCache[k] = { ok: false };
    saveState();
    return state.omdbCache[k];
  }

  const out = {
    ok: true,
    imdbID: meta.imdbID,
    type: meta.Type, // movie|series
    title: meta.Title,
    totalSeasons: meta.totalSeasons ? Number(meta.totalSeasons) : null,
    poster:
      meta.imdbID
        ? `https://img.omdbapi.com/?i=${encodeURIComponent(meta.imdbID)}&h=450&apikey=${encodeURIComponent(OMDB_API_KEY)}`
        : (meta.Poster && meta.Poster !== "N/A" ? meta.Poster : null),
  };

  state.omdbCache[k] = out;
  saveState();
  return out;
}

async function getSeasonEpisodes(imdbID, season) {
  const j = await omdb({ i: imdbID, Season: String(season) });
  if (!j || j.Response !== "True") return { ok: false };
  return {
    ok: true,
    title: j.Title,
    season,
    episodes: (j.Episodes || []).map(e => ({
      imdbID: e.imdbID,
      episode: Number(e.Episode),
      title: e.Title,
      released: e.Released,
    })),
  };
}

// ---------- UI Render ----------
function clear(el) {
  el.innerHTML = "";
}

function renderError(target, msg, err) {
  console.error(msg, err);
  clear(target);
  target.appendChild(h("div", "error", msg));
  if (err && err.message) target.appendChild(h("div", "muted", err.message));
}

function renderHome(categories) {
  clear(elList);

  const title = h("h2", "section-title", currentTab === "marvel" ? "Marvel" : "Star Wars");
  elList.appendChild(title);

  const grid = h("div", "grid");
  elList.appendChild(grid);

  categories.forEach(cat => {
    const btn = h("button", "card");
    const t = h("div", "card-title", cat.title || cat.name || cat.key || "Kategori");
    btn.appendChild(t);
    if (cat.subtitle) btn.appendChild(h("div", "card-subtitle", cat.subtitle));

    btn.addEventListener("click", () => openCategory(cat));
    grid.appendChild(btn);
  });

  showListScreen();
}

function progressFor(items) {
  const total = items.length;
  let done = 0;
  for (const it of items) {
    const k = keyForItem(it);
    if (state.watched[k]?.watched) done++;
  }
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, pct };
}

function renderCategoryList(cat, items) {
  clear(elList);

  const top = h("div", "topbar");
  const back = h("button", "btn", "← Anasayfa");
  back.addEventListener("click", () => loadTabHome(currentTab));
  top.appendChild(back);

  top.appendChild(h("div", "topbar-title", cat.title || cat.name || "Liste"));
  elList.appendChild(top);

  const p = progressFor(items);
  elList.appendChild(h("div", "muted", `İlerleme: ${p.done}/${p.total} (%${p.pct})`));

  const list = h("div", "list");
  elList.appendChild(list);

  items.forEach(it => {
    const row = h("div", "row");

    const k = keyForItem(it);
    const watched = !!state.watched[k]?.watched;

    const toggle = h("button", `watch ${watched ? "on" : ""}`, watched ? "✓" : "—");
    toggle.addEventListener("click", () => {
      state.watched[k] = { watched: !watched };
      saveState();
      renderCategoryList(cat, items);
    });

    const main = h("div", "row-main");
    main.appendChild(h("div", "row-title", it.title || it.name));
    main.appendChild(h("div", "row-meta", it.kindLabel || it.kind || it.type || ""));

    const open = h("button", "btn small", "Aç");
    open.addEventListener("click", async () => {
      await openItem(it);
    });

    row.appendChild(toggle);
    row.appendChild(main);
    row.appendChild(open);
    list.appendChild(row);
  });

  showListScreen();
}

async function renderSeasonsScreen(item, meta) {
  clear(elDetail);

  const top = h("div", "topbar");
  const back = h("button", "btn", "← Liste");
  back.addEventListener("click", () => renderCategoryList(currentCategory, currentItems));
  top.appendChild(back);
  top.appendChild(h("div", "topbar-title", item.title || item.name || meta.title || "Dizi"));
  elDetail.appendChild(top);

  const hero = h("div", "hero");
  if (meta.poster) {
    const img = document.createElement("img");
    img.className = "poster";
    img.src = meta.poster;
    img.alt = meta.title;
    hero.appendChild(img);
  }
  const ht = h("div", "hero-text");
  ht.appendChild(h("h2", "", item.title || meta.title));
  ht.appendChild(h("div", "muted", "Sezon ve bölüm işaretleme"));
  hero.appendChild(ht);
  elDetail.appendChild(hero);

  if (!meta.totalSeasons) {
    elDetail.appendChild(h("div", "muted", "Sezon bilgisi bulunamadı (OMDb'de olmayabilir)."));
    showDetailScreen();
    return;
  }

  const list = h("div", "list");
  elDetail.appendChild(list);

  for (let s = 1; s <= meta.totalSeasons; s++) {
    const sk = `${meta.imdbID}|S${s}`;
    const done = !!state.seasons[sk]?.watched;

    const row = h("div", "row");

    const toggle = h("button", `watch ${done ? "on" : ""}`, done ? "✓" : "—");
    toggle.addEventListener("click", () => {
      state.seasons[sk] = { watched: !done };
      saveState();
      renderSeasonsScreen(item, meta);
    });

    const main = h("div", "row-main");
    main.appendChild(h("div", "row-title", `Sezon ${s}`));
    main.appendChild(h("div", "row-meta", "Bölüm listesi için aç"));

    const open = h("button", "btn small", "Aç");
    open.addEventListener("click", async () => {
      currentSeason = s;
      await renderEpisodesScreen(item, meta, s);
    });

    row.appendChild(toggle);
    row.appendChild(main);
    row.appendChild(open);
    list.appendChild(row);
  }

  showDetailScreen();
}

async function renderEpisodesScreen(item, meta, season) {
  clear(elDetail);

  const top = h("div", "topbar");
  const back = h("button", "btn", "← Sezonlar");
  back.addEventListener("click", () => renderSeasonsScreen(item, meta));
  top.appendChild(back);
  top.appendChild(h("div", "topbar-title", `${item.title || meta.title} • ${season}. Sezon`));
  elDetail.appendChild(top);

  const sdata = await getSeasonEpisodes(meta.imdbID, season);
  if (!sdata.ok) {
    elDetail.appendChild(h("div", "muted", "Bölüm listesi bulunamadı (OMDb'de yok olabilir)."));
    showDetailScreen();
    return;
  }

  const list = h("div", "list");
  elDetail.appendChild(list);

  sdata.episodes.forEach(ep => {
    const ek = `${meta.imdbID}|S${season}|E${ep.episode}`;
    const done = !!state.episodes[ek]?.watched;

    const row = h("div", "row");

    const toggle = h("button", `watch ${done ? "on" : ""}`, done ? "✓" : "—");
    toggle.addEventListener("click", () => {
      state.episodes[ek] = { watched: !done };
      saveState();
      renderEpisodesScreen(item, meta, season);
    });

    const main = h("div", "row-main");
    main.appendChild(h("div", "row-title", `${ep.episode}. ${ep.title}`));
    main.appendChild(h("div", "row-meta", ep.released && ep.released !== "N/A" ? `Yayın: ${ep.released}` : ""));

    row.appendChild(toggle);
    row.appendChild(main);
    list.appendChild(row);
  });

  showDetailScreen();
}

// ---------- navigation ----------
async function loadTabHome(tab) {
  try {
    setActiveTab(tab);
    currentCategory = null;
    currentItems = [];
    currentSeriesMeta = null;
    currentSeason = null;

    const folder = folderForTab(tab);
    const indexPath = `/data/${folder}/${tab === "starwars" ? "starwars.index.js" : "marvel.index.js"}`;

    const idx = await loadExportDefaultJS(indexPath);
    const cats = extractCategories(idx);

    if (!cats.length) {
      renderError(elList, "Index dosyası okundu ama kategori listesi boş. (index formatı farklı olabilir)", null);
      showListScreen();
      return;
    }

    renderHome(cats);
  } catch (err) {
    renderError(elList, "Anasayfa yüklenirken hata oluştu.", err);
    showListScreen();
  }
}

async function openCategory(cat) {
  try {
    currentCategory = cat;

    const path = collectionPath(currentTab, cat);
    if (!path) throw new Error("Kategori için collection yolu bulunamadı.");

    const items = await loadExportDefaultJS(path);
    if (!Array.isArray(items)) throw new Error("Collection dosyası array dönmedi. (format farklı olabilir)");

    currentItems = items;
    renderCategoryList(cat, items);
  } catch (err) {
    renderError(elList, "Kategori listesi yüklenirken hata oluştu.", err);
    showListScreen();
  }
}

async function openItem(item) {
  try {
    const meta = await getOmdbMeta(item);

    // Dizi ise sezon ekranı
    if (meta.ok && meta.type === "series") {
      currentSeriesMeta = meta;
      await renderSeasonsScreen(item, meta);
      return;
    }

    // Film ise Google araması (OMDb bulunamadıysa da)
    const q = normalizeTitle(item.title || item.name);
    window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, "_blank");
  } catch (err) {
    renderError(elDetail, "Detay açılırken hata oluştu.", err);
    showDetailScreen();
  }
}

// ---------- events ----------
if (tabMarvelBtn) tabMarvelBtn.addEventListener("click", () => loadTabHome("marvel"));
if (tabStarwarsBtn) tabStarwarsBtn.addEventListener("click", () => loadTabHome("starwars"));

// boot
loadTabHome("marvel");
