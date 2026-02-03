/* app.js - Static (no Node), ES Module
   - Marvel & Star Wars sekmeleri
   - Koleksiyonlar data klasöründen import edilir
   - OMDb üzerinden poster + dizi sezon/bölüm listesi (tek tek işaretlenebilir)
   - LocalStorage ile izleme takibi

   OMDb Key: a57784cc
*/

const OMDB_API_KEY = "a57784cc";
const STORAGE_KEY = "nova_watchlist_v2";

/* =========================
   Imports (data paths)
   ========================= */
// Bu dosyaların hepsi "export default ..." olmalı.
import MARVEL_CATEGORIES from "./data/marvel/marvel.index.js";
import MCU_COLLECTION from "./data/marvel/mcu.collection.js";

import STARWARS_CATEGORIES from "./data/starwars/starwars.index.js";
import STARWARS_CANON_COLLECTION from "./data/starwars/canon.collection.js";

/* =========================
   Helpers
   ========================= */
function $(sel, root = document) {
  return root.querySelector(sel);
}
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

/* =========================
   Storage
   ========================= */
function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const base = { items: {}, seasons: {}, episodes: {}, posterCache: {}, metaCache: {} };
  if (!raw) return base;
  const parsed = safeJsonParse(raw, base);
  return { ...base, ...parsed };
}
function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function itemKey(item) {
  // stable key: prefer explicit id, else title
  return (item && item.id) ? String(item.id) : String(item.title || "");
}

/* =========================
   OMDb fetch with caching
   ========================= */
function normalizeTitleForOmdb(title) {
  if (!title) return "";
  let t = String(title).trim();

  // "1. Sezon" / "Sezon 1" gibi ekleri temizle
  t = t.replace(/\b(\d+)\.\s*Sezon\b/gi, "").trim();
  t = t.replace(/\bSezon\s*(\d+)\b/gi, "").trim();

  // "(Disney+)" vb parantez içlerini temizle
  t = t.replace(/\([^)]*\)/g, "").trim();

  // "- Film", "- Dizi", "- Animasyon" vb tür yazılarını temizle
  t = t.replace(/\s*-\s*(Film|Dizi|Animasyon.*|Kısa.*|Özel.*|Tek Atış|One[- ]?Shot|Antoloji|TV Filmi|Mini Dizi).*$/gi, "").trim();

  // Fazla boşlukları düzelt
  t = t.replace(/\s{2,}/g, " ").trim();

  return t;
}

async function omdbFetch(params) {
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", OMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  const json = await res.json();
  return json;
}

async function omdbFindBestMatchTitle(title, typeHint) {
  // Önce direct title dene
  const direct = await omdbFetch({ t: title });
  if (direct && direct.Response === "True") return direct;

  // Search ile ilk sonucu bul
  const s = await omdbFetch({ s: title, type: typeHint || "" });
  if (!s || s.Response !== "True" || !Array.isArray(s.Search) || !s.Search.length) return direct;

  // İlkini çek (imdbID ile)
  const best = s.Search[0];
  if (!best || !best.imdbID) return direct;

  const full = await omdbFetch({ i: best.imdbID, plot: "short" });
  return full;
}

async function ensureOmdbMeta(state, item, typeHint) {
  const k = itemKey(item);
  if (!k) return null;

  // Cache
  if (state.metaCache && state.metaCache[k]) return state.metaCache[k];

  // Eğer data içinde imdbID/omdbTitle varsa onları kullan
  const fallbackTitle = normalizeTitleForOmdb(item.omdbTitle || item.title || "");
  let meta = null;

  if (item.imdbID) {
    const full = await omdbFetch({ i: item.imdbID, plot: "short" });
    if (full && full.Response === "True") meta = full;
  }

  if (!meta) {
    meta = await omdbFindBestMatchTitle(fallbackTitle, typeHint);
    if (!meta || meta.Response !== "True") {
      state.metaCache[k] = { ok: false, error: meta?.Error || "Not found", titleTried: fallbackTitle };
      saveState(state);
      return state.metaCache[k];
    }
  }

  const out = {
    ok: true,
    imdbID: meta.imdbID,
    title: meta.Title,
    type: meta.Type, // movie, series
    year: meta.Year,
    totalSeasons: meta.totalSeasons ? Number(meta.totalSeasons) : null,
  };

  // Poster: IMDb link bazen sorun çıkarır. OMDb image endpoint daha stabil.
  // h=450 genelde "w300" hissiyatı verir.
  if (out.imdbID) {
    out.poster = `https://img.omdbapi.com/?i=${encodeURIComponent(out.imdbID)}&h=450&apikey=${encodeURIComponent(OMDB_API_KEY)}`;
  } else {
    out.poster = meta.Poster && meta.Poster !== "N/A" ? meta.Poster : null;
  }

  state.metaCache[k] = out;
  saveState(state);
  return out;
}

async function fetchSeasonEpisodes(imdbID, seasonNumber) {
  const json = await omdbFetch({ i: imdbID, Season: String(seasonNumber) });
  if (!json || json.Response !== "True") return { ok: false, error: json?.Error || "Season not found" };
  const episodes = Array.isArray(json.Episodes) ? json.Episodes : [];
  return {
    ok: true,
    season: seasonNumber,
    title: json.Title,
    episodes: episodes.map(e => ({
      imdbID: e.imdbID,
      episode: Number(e.Episode),
      title: e.Title,
      released: e.Released,
      imdbRating: e.imdbRating,
    })),
  };
}

/* =========================
   Data: categories -> collections
   ========================= */
const COLLECTIONS = {
  // Marvel
  "mcu": MCU_COLLECTION,

  // Star Wars
  "sw_canon": STARWARS_CANON_COLLECTION,
  // İstersen sonra:
  // "sw_noncanon": ...,
  // "sw_vintage": ...,
  // "sw_lego": ...
};

// Kategori tanımlarını index dosyalarından birleştireceğiz
// Beklenen format örnek:
// export default [
//   { key:"mcu", title:"MCU" },
//   { key:"lego", title:"LEGO" },
// ]
function buildLibrary() {
  return {
    marvel: {
      title: "Marvel",
      categories: MARVEL_CATEGORIES,
    },
    starwars: {
      title: "Star Wars",
      categories: STARWARS_CATEGORIES,
    },
  };
}

/* =========================
   UI State + Router
   ========================= */
const appState = {
  lib: buildLibrary(),
  activeTab: "marvel", // marvel | starwars
  view: "home",        // home | list | seasons | episodes
  activeCategoryKey: null,
  activeItemKey: null,
  activeSeasonNumber: null,
};

function getCollectionForCategory(categoryKey) {
  // Index dosyalarındaki key’ler COLLECTIONS ile eşleşmeli.
  return COLLECTIONS[categoryKey] || [];
}

function kindLabel(type) {
  if (type === "movie") return "Film";
  if (type === "series") return "Dizi";
  return "İçerik";
}

/* =========================
   Render
   ========================= */
function render() {
  const root = $("#app");
  if (!root) return;

  root.innerHTML = "";

  const header = el("header", { class: "app-header" }, [
    el("div", { class: "app-title" }, [
      el("h1", {}, ["Koleksiyon"]),
      el("p", { class: "subtitle" }, ["Marvel & Star Wars İzleme Takibi"]),
    ]),
  ]);

  const tabs = el("div", { class: "tabs" }, [
    el("button", {
      class: `tab ${appState.activeTab === "marvel" ? "active" : ""}`,
      onclick: () => { appState.activeTab = "marvel"; goHome(); },
      type: "button"
    }, ["Marvel"]),
    el("button", {
      class: `tab ${appState.activeTab === "starwars" ? "active" : ""}`,
      onclick: () => { appState.activeTab = "starwars"; goHome(); },
      type: "button"
    }, ["Star Wars"]),
  ]);

  const main = el("main", { class: "main" }, []);

  root.appendChild(header);
  root.appendChild(tabs);
  root.appendChild(main);

  if (appState.view === "home") renderHome(main);
  if (appState.view === "list") renderList(main);
  if (appState.view === "seasons") renderSeasons(main);
  if (appState.view === "episodes") renderEpisodes(main);
}

function goHome() {
  appState.view = "home";
  appState.activeCategoryKey = null;
  appState.activeItemKey = null;
  appState.activeSeasonNumber = null;
  render();
}

function goList(categoryKey) {
  appState.view = "list";
  appState.activeCategoryKey = categoryKey;
  appState.activeItemKey = null;
  appState.activeSeasonNumber = null;
  render();
}

function goSeasons(itemK) {
  appState.view = "seasons";
  appState.activeItemKey = itemK;
  appState.activeSeasonNumber = null;
  render();
}

function goEpisodes(itemK, seasonNumber) {
  appState.view = "episodes";
  appState.activeItemKey = itemK;
  appState.activeSeasonNumber = seasonNumber;
  render();
}

function renderHome(main) {
  const lib = appState.lib[appState.activeTab];
  const cats = Array.isArray(lib.categories) ? lib.categories : [];

  main.appendChild(
    el("section", { class: "section" }, [
      el("h2", {}, [lib.title]),
      el("div", { class: "grid" }, cats.map(c =>
        el("button", {
          class: "card",
          type: "button",
          onclick: () => goList(c.key)
        }, [
          el("div", { class: "card-title" }, [c.title || c.key]),
          c.subtitle ? el("div", { class: "card-subtitle" }, [c.subtitle]) : null,
        ])
      ))
    ])
  );
}

function renderList(main) {
  const state = loadState();
  const lib = appState.lib[appState.activeTab];

  const categoryKey = appState.activeCategoryKey;
  const category = (lib.categories || []).find(c => c.key === categoryKey);
  const title = category?.title || categoryKey || "Liste";

  const items = getCollectionForCategory(categoryKey);

  const topBar = el("div", { class: "topbar" }, [
    el("button", { class: "btn", type: "button", onclick: goHome }, ["← Liste"]),
    el("div", { class: "topbar-title" }, [title]),
  ]);

  const list = el("div", { class: "list" }, []);

  // Render each item row
  items.forEach((it) => {
    const k = itemKey(it);
    const watched = !!state.items[k]?.watched;

    const row = el("div", { class: "row" }, [
      el("button", {
        class: `watch ${watched ? "on" : ""}`,
        type: "button",
        onclick: () => {
          const st = loadState();
          const cur = !!st.items[k]?.watched;
          st.items[k] = { watched: !cur };
          saveState(st);
          render();
        }
      }, [watched ? "✓" : "—"]),

      el("div", { class: "row-main" }, [
        el("div", { class: "row-title" }, [it.title || "Başlıksız"]),
        el("div", { class: "row-meta" }, [it.kindLabel || it.kind || ""]),
      ]),

      el("button", {
        class: "btn small",
        type: "button",
        onclick: async () => {
          // Diziyse sezon ekranına; filmse poster/metadata popup (basitçe yeni sekme google)
          const st = loadState();
          const meta = await ensureOmdbMeta(st, it, it.typeHint);
          if (meta?.ok && meta.type === "series") goSeasons(k);
          else {
            window.open(`https://www.google.com/search?q=${encodeURIComponent(normalizeTitleForOmdb(it.title))}`, "_blank");
          }
        }
      }, ["Aç"])
    ]);

    list.appendChild(row);
  });

  main.appendChild(topBar);
  main.appendChild(list);
}

function renderSeasons(main) {
  const state = loadState();
  const categoryKey = appState.activeCategoryKey;
  const items = getCollectionForCategory(categoryKey);
  const current = items.find(x => itemKey(x) === appState.activeItemKey);

  const topBar = el("div", { class: "topbar" }, [
    el("button", { class: "btn", type: "button", onclick: () => { appState.view = "list"; render(); } }, ["← Liste"]),
    el("div", { class: "topbar-title" }, [current?.title || "Dizi"]),
  ]);

  const box = el("div", { class: "section" }, []);
  main.appendChild(topBar);
  main.appendChild(box);

  if (!current) {
    box.appendChild(el("p", { class: "muted" }, ["Dizi bulunamadı."]));
    return;
  }

  // OMDb: sezon sayısı + poster
  (async () => {
    const st = loadState();
    const meta = await ensureOmdbMeta(st, current, "series");

    box.innerHTML = "";

    if (!meta?.ok) {
      box.appendChild(el("p", { class: "muted" }, [
        `Dizi OMDb'de bulunamadı. (${meta?.error || "Query eşleşmedi"})`
      ]));
      return;
    }

    // Poster + başlık
    const hero = el("div", { class: "hero" }, [
      meta.poster ? el("img", { class: "poster", src: meta.poster, alt: meta.title }) : null,
      el("div", { class: "hero-text" }, [
        el("h2", {}, [current.title]),
        el("div", { class: "muted" }, ["Sezon ve bölüm işaretleme"]),
      ])
    ]);
    box.appendChild(hero);

    const seasonsTotal = meta.totalSeasons ? Number(meta.totalSeasons) : null;
    if (!seasonsTotal) {
      box.appendChild(el("p", { class: "muted" }, ["Sezon bilgisi bulunamadı (OMDb'de olmayabilir)."]));
      return;
    }

    const seasonsList = el("div", { class: "list" }, []);
    for (let s = 1; s <= seasonsTotal; s++) {
      const seasonKey = `${meta.imdbID}|S${s}`;
      const done = !!state.seasons[seasonKey]?.watched;

      seasonsList.appendChild(
        el("div", { class: "row" }, [
          el("button", {
            class: `watch ${done ? "on" : ""}`,
            type: "button",
            onclick: () => {
              const st2 = loadState();
              const cur = !!st2.seasons[seasonKey]?.watched;
              st2.seasons[seasonKey] = { watched: !cur };
              saveState(st2);
              render();
            }
          }, [done ? "✓" : "—"]),
          el("div", { class: "row-main" }, [
            el("div", { class: "row-title" }, [`Sezon ${s}`]),
            el("div", { class: "row-meta" }, ["Bölüm listesi için aç"]),
          ]),
          el("button", { class: "btn small", type: "button", onclick: () => goEpisodes(itemKey(current), s) }, ["Aç"])
        ])
      );
    }

    box.appendChild(seasonsList);
  })();
}

function renderEpisodes(main) {
  const state = loadState();
  const categoryKey = appState.activeCategoryKey;
  const items = getCollectionForCategory(categoryKey);
  const current = items.find(x => itemKey(x) === appState.activeItemKey);
  const seasonNumber = appState.activeSeasonNumber;

  const topBar = el("div", { class: "topbar" }, [
    el("button", { class: "btn", type: "button", onclick: () => { appState.view = "seasons"; render(); } }, ["← Sezonlar"]),
    el("div", { class: "topbar-title" }, [
      `${current?.title || "Dizi"} • ${seasonNumber}. Sezon`
    ]),
  ]);

  const box = el("div", { class: "section" }, []);
  main.appendChild(topBar);
  main.appendChild(box);

  if (!current) {
    box.appendChild(el("p", { class: "muted" }, ["Dizi bulunamadı."]));
    return;
  }

  (async () => {
    const st = loadState();
    const meta = await ensureOmdbMeta(st, current, "series");

    box.innerHTML = "";

    if (!meta?.ok || meta.type !== "series" || !meta.imdbID) {
      box.appendChild(el("p", { class: "muted" }, [`Bölüm listesi bulunamadı (OMDb'de yok olabilir).`] ));
      return;
    }

    const seasonData = await fetchSeasonEpisodes(meta.imdbID, seasonNumber);
    if (!seasonData.ok) {
      box.appendChild(el("p", { class: "muted" }, [`Bölüm listesi bulunamadı (OMDb'de yok olabilir).`] ));
      return;
    }

    // Üst info + poster
    box.appendChild(
      el("div", { class: "hero" }, [
        meta.poster ? el("img", { class: "poster", src: meta.poster, alt: meta.title }) : null,
        el("div", { class: "hero-text" }, [
          el("h2", {}, [`${current.title}`]),
          el("div", { class: "muted" }, [`${seasonNumber}. Sezon • Bölümler tek tek işaretlenir`]),
        ])
      ])
    );

    const list = el("div", { class: "list" }, []);
    seasonData.episodes.forEach(ep => {
      const epKey = `${meta.imdbID}|S${seasonNumber}|E${ep.episode}`;
      const done = !!state.episodes[epKey]?.watched;

      list.appendChild(
        el("div", { class: "row" }, [
          el("button", {
            class: `watch ${done ? "on" : ""}`,
            type: "button",
            onclick: () => {
              const st2 = loadState();
              const cur = !!st2.episodes[epKey]?.watched;
              st2.episodes[epKey] = { watched: !cur };
              saveState(st2);
              render();
            }
          }, [done ? "✓" : "—"]),
          el("div", { class: "row-main" }, [
            el("div", { class: "row-title" }, [`${ep.episode}. ${ep.title}`]),
            el("div", { class: "row-meta" }, [
              ep.released && ep.released !== "N/A" ? `Yayın: ${ep.released}` : "",
              ep.imdbRating && ep.imdbRating !== "N/A" ? ` • IMDb: ${ep.imdbRating}` : ""
            ].filter(Boolean).join(""))
          ]),
        ])
      );
    });

    box.appendChild(list);
  })();
}

/* =========================
   Boot
   ========================= */
function ensureBaseDOM() {
  // index.html içinde <div id="app"></div> yoksa oluştur.
  let root = document.getElementById("app");
  if (!root) {
    root = document.createElement("div");
    root.id = "app";
    document.body.appendChild(root);
  }
}

ensureBaseDOM();
render();
