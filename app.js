// app.js (TEK TEMİZ SÜRÜM) - /data/... üzerinden yükler, import yok
// Marvel & Star Wars koleksiyon takip
// Dizi: sezon + bölüm işaretleme (OMDb)
// Film: izledim işaretleme
// LocalStorage ile kalıcı takip

const OMDB_API_KEY = "a57784cc";
const STORE_KEY = "koleksiyon_takip_v3";

const state = loadState();

// ---- DOM helpers
const $ = (q, root = document) => root.querySelector(q);
function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

// ---- Storage
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

// ---- Routes
const route = {
  tab: "marvel",         // marvel | starwars
  view: "home",          // home | list | seasons | episodes
  categoryKey: null,     // e.g. "mcu"
  itemId: null,          // stable id
  season: null,
};

// ---- Data loading (NO import!)
async function loadJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} yüklenemedi (${res.status})`);
  return await res.json(); // NOTE: data dosyaları JSON değilse alt fonk. kullanacağız.
}
async function loadJsDefault(path) {
  // JS dosyası "export default ..." ise bunu doğrudan fetch+eval ile okuyamayız.
  // O yüzden data dosyalarını "window.__DATA__" gibi bir şeye bağlamadık.
  // Çözüm: data dosyalarını ESM export default yerine "JSON" yapmalıyız... DEĞİL.
  // Senin dosyaların zaten JS export default. O yüzden en temiz yol:
  // - index.html'de module kullanmak ve import etmek
  // Ama senin projende loglar fetch üzerinden gidiyor. O yüzden:
  // Bu sürüm, data dosyalarını "JSON" bekleyecek şekilde tasarlanmıştır.
  // Eğer senin dosyaların export default ise, aşağıdaki 2 satırlık dönüşümü yap:
  // (A) Her collection dosyasını .json yapıp export default kaldır.
  // (B) veya index.html module + import yoluna dön.
  //
  // Şu an senin projen çalışıyor ve GET atıyor, demek ki sen data dosyalarını JSON gibi servis ediyorsun
  // ya da index.js içinde fetch ediyorsun.
  //
  // O yüzden burada doğrudan fetch + text parse yapacağım:
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} yüklenemedi (${res.status})`);
  const text = await res.text();

  // export default [...] formatını güvenli şekilde parse et
  const cleaned = text
    .replace(/^\s*export\s+default\s+/m, "")
    .replace(/;\s*$/m, "");

  // eslint-disable-next-line no-new-func
  const data = new Function(`return (${cleaned});`)();
  return data;
}

function keyForItem(item) {
  return String(item.id || item.title);
}

// ---- OMDb helpers + cache
function normalizeTitle(t) {
  if (!t) return "";
  let s = String(t).trim();
  s = s.replace(/\([^)]*\)/g, "").trim();                 // parantez içlerini at
  s = s.replace(/\s*-\s*(Film|Dizi|Animasyon.*|Kısa.*|Özel.*).*$/i, "").trim();
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

async function omdb(params) {
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", OMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  return await r.json();
}

async function getOmdbMeta(item, typeHint) {
  const k = keyForItem(item);
  if (state.omdbCache[k]) return state.omdbCache[k];

  let meta = null;

  if (item.imdbID) {
    const j = await omdb({ i: item.imdbID });
    if (j.Response === "True") meta = j;
  }
  if (!meta) {
    const t = normalizeTitle(item.omdbTitle || item.title);
    const j = await omdb({ t, type: typeHint || "" });
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
    poster: meta.imdbID
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

// ---- Data map (dosya adların senin görüntüne göre)
const DATA = {
  marvel: {
    index: "/data/marvel/marvel.index.js",
    collections: {
      mcu: "/data/marvel/mcu.collection.js",
      lego: "/data/marvel/lego.collection.js",
      mutant: "/data/marvel/mutant.collection.js",
      classics: "/data/marvel/classics.collection.js",
      void: "/data/marvel/void.collection.js",
      sony: "/data/marvel/sony.collection.js",
      animated: "/data/marvel/animated.collection.js",
      anime: "/data/marvel/anime.collection.js",
    },
    title: "Marvel",
  },
  starwars: {
    index: "/data/starwars/starwars.index.js",
    collections: {
      canon: "/data/starwars/canon.collection.js",
      noncanon: "/data/starwars/noncanon.collection.js",
      vintage: "/data/starwars/vintage.collection.js",
      lego: "/data/starwars/lego.collection.js",
    },
    title: "Star Wars",
  },
};

// ---- Render
function ensureRoot() {
  let root = $("#app");
  if (!root) {
    root = document.createElement("div");
    root.id = "app";
    document.body.appendChild(root);
  }
  return root;
}

function header() {
  return h("header", { class: "app-header" }, [
    h("div", { class: "app-title" }, [
      h("h1", { text: "Koleksiyon" }),
      h("p", { class: "subtitle", text: "Marvel & Star Wars İzleme Takibi" }),
    ]),
    h("div", { class: "tabs" }, [
      h("button", {
        class: `tab ${route.tab === "marvel" ? "active" : ""}`,
        type: "button",
        onclick: () => { route.tab = "marvel"; route.view = "home"; route.categoryKey = null; render(); }
      }, ["Marvel"]),
      h("button", {
        class: `tab ${route.tab === "starwars" ? "active" : ""}`,
        type: "button",
        onclick: () => { route.tab = "starwars"; route.view = "home"; route.categoryKey = null; render(); }
      }, ["Star Wars"]),
    ]),
  ]);
}

function topbar(leftText, leftFn, title) {
  return h("div", { class: "topbar" }, [
    h("button", { class: "btn", type: "button", onclick: leftFn }, [leftText]),
    h("div", { class: "topbar-title" }, [title]),
  ]);
}

async function renderHome(main) {
  const tabData = DATA[route.tab];
  const cats = await loadJsDefault(tabData.index); // [{key,title,subtitle?}...]

  const grid = h("div", { class: "grid" }, cats.map(c =>
    h("button", {
      class: "card",
      type: "button",
      onclick: () => {
        route.view = "list";
        route.categoryKey = c.key;
        render();
      }
    }, [
      h("div", { class: "card-title", text: c.title || c.key }),
      c.subtitle ? h("div", { class: "card-subtitle", text: c.subtitle }) : null,
    ])
  ));

  main.appendChild(h("section", { class: "section" }, [
    h("h2", { text: tabData.title }),
    grid,
  ]));
}

function progressForCollection(items) {
  const total = items.length;
  if (!total) return { total: 0, done: 0, pct: 0 };
  let done = 0;
  for (const it of items) {
    if (state.watched[keyForItem(it)]?.watched) done++;
  }
  const pct = Math.round((done / total) * 100);
  return { total, done, pct };
}

async function renderList(main) {
  const tabData = DATA[route.tab];
  const cats = await loadJsDefault(tabData.index);
  const cat = cats.find(x => x.key === route.categoryKey);
  const catTitle = cat?.title || route.categoryKey;

  const path = tabData.collections[route.categoryKey];
  if (!path) {
    main.appendChild(h("p", { class: "muted", text: "Bu kategori için collection dosyası bulunamadı." }));
    return;
  }

  const items = await loadJsDefault(path);

  const p = progressForCollection(items);

  main.appendChild(topbar("← Anasayfa", () => { route.view = "home"; render(); }, catTitle));

  main.appendChild(
    h("div", { class: "progress" }, [
      h("div", { class: "muted", text: `İlerleme: ${p.done}/${p.total} (%${p.pct})` }),
    ])
  );

  const list = h("div", { class: "list" }, []);

  for (const it of items) {
    const k = keyForItem(it);
    const watched = !!state.watched[k]?.watched;

    list.appendChild(
      h("div", { class: "row" }, [
        h("button", {
          class: `watch ${watched ? "on" : ""}`,
          type: "button",
          onclick: () => {
            const cur = !!state.watched[k]?.watched;
            state.watched[k] = { watched: !cur };
            saveState();
            render();
          }
        }, [watched ? "✓" : "—"]),

        h("div", { class: "row-main" }, [
          h("div", { class: "row-title", text: it.title }),
          h("div", { class: "row-meta", text: it.kindLabel || it.kind || "" }),
        ]),

        h("button", {
          class: "btn small",
          type: "button",
          onclick: async () => {
            // Dizi ise sezon ekranına, film ise sadece detay (google)
            const meta = await getOmdbMeta(it, "series");
            if (meta.ok && meta.type === "series") {
              route.view = "seasons";
              route.itemId = k;
              render();
            } else {
              window.open(`https://www.google.com/search?q=${encodeURIComponent(normalizeTitle(it.title))}`, "_blank");
            }
          }
        }, ["Aç"]),
      ])
    );
  }

  main.appendChild(list);
}

async function renderSeasons(main) {
  const tabData = DATA[route.tab];
  const items = await loadJsDefault(tabData.collections[route.categoryKey]);
  const it = items.find(x => keyForItem(x) === route.itemId);

  main.appendChild(topbar("← Liste", () => { route.view = "list"; render(); }, it?.title || "Dizi"));

  if (!it) {
    main.appendChild(h("p", { class: "muted", text: "Dizi bulunamadı." }));
    return;
  }

  const meta = await getOmdbMeta(it, "series");
  if (!meta.ok || meta.type !== "series") {
    main.appendChild(h("p", { class: "muted", text: "Dizi OMDb'de bulunamadı. (Query eşleşmedi.)" }));
    return;
  }

  const box = h("div", { class: "section" }, [
    h("div", { class: "hero" }, [
      meta.poster ? h("img", { class: "poster", src: meta.poster, alt: meta.title }) : null,
      h("div", { class: "hero-text" }, [
        h("h2", { text: it.title }),
        h("div", { class: "muted", text: "Sezon ve bölüm işaretleme" }),
      ]),
    ]),
  ]);

  if (!meta.totalSeasons) {
    box.appendChild(h("p", { class: "muted", text: "Sezon bilgisi bulunamadı (OMDb'de olmayabilir)." }));
    main.appendChild(box);
    return;
  }

  const list = h("div", { class: "list" }, []);
  for (let s = 1; s <= meta.totalSeasons; s++) {
    const sk = `${meta.imdbID}|S${s}`;
    const done = !!state.seasons[sk]?.watched;

    list.appendChild(
      h("div", { class: "row" }, [
        h("button", {
          class: `watch ${done ? "on" : ""}`,
          type: "button",
          onclick: () => {
            const cur = !!state.seasons[sk]?.watched;
            state.seasons[sk] = { watched: !cur };
            saveState();
            render();
          }
        }, [done ? "✓" : "—"]),
        h("div", { class: "row-main" }, [
          h("div", { class: "row-title", text: `Sezon ${s}` }),
          h("div", { class: "row-meta", text: "Bölüm listesi için aç" }),
        ]),
        h("button", {
          class: "btn small",
          type: "button",
          onclick: () => {
            route.view = "episodes";
            route.season = s;
            render();
          }
        }, ["Aç"]),
      ])
    );
  }

  box.appendChild(list);
  main.appendChild(box);
}

async function renderEpisodes(main) {
  const tabData = DATA[route.tab];
  const items = await loadJsDefault(tabData.collections[route.categoryKey]);
  const it = items.find(x => keyForItem(x) === route.itemId);

  main.appendChild(topbar("← Sezonlar", () => { route.view = "seasons"; render(); }, `${it?.title || "Dizi"} • ${route.season}. Sezon`));

  if (!it) {
    main.appendChild(h("p", { class: "muted", text: "Dizi bulunamadı." }));
    return;
  }

  const meta = await getOmdbMeta(it, "series");
  if (!meta.ok || meta.type !== "series" || !meta.imdbID) {
    main.appendChild(h("p", { class: "muted", text: "Bölüm listesi bulunamadı (OMDb'de yok olabilir)." }));
    return;
  }

  const sdata = await getSeasonEpisodes(meta.imdbID, route.season);
  if (!sdata.ok) {
    main.appendChild(h("p", { class: "muted", text: "Bölüm listesi bulunamadı (OMDb'de yok olabilir)." }));
    return;
  }

  const box = h("div", { class: "section" }, [
    h("div", { class: "hero" }, [
      meta.poster ? h("img", { class: "poster", src: meta.poster, alt: meta.title }) : null,
      h("div", { class: "hero-text" }, [
        h("h2", { text: it.title }),
        h("div", { class: "muted", text: `${route.season}. Sezon • Bölümler tek tek işaretlenir` }),
      ]),
    ]),
  ]);

  const list = h("div", { class: "list" }, []);
  for (const ep of sdata.episodes) {
    const ek = `${meta.imdbID}|S${route.season}|E${ep.episode}`;
    const done = !!state.episodes[ek]?.watched;

    list.appendChild(
      h("div", { class: "row" }, [
        h("button", {
          class: `watch ${done ? "on" : ""}`,
          type: "button",
          onclick: () => {
            const cur = !!state.episodes[ek]?.watched;
            state.episodes[ek] = { watched: !cur };
            saveState();
            render();
          }
        }, [done ? "✓" : "—"]),
        h("div", { class: "row-main" }, [
          h("div", { class: "row-title", text: `${ep.episode}. ${ep.title}` }),
          h("div", { class: "row-meta", text: (ep.released && ep.released !== "N/A") ? `Yayın: ${ep.released}` : "" }),
        ]),
      ])
    );
  }

  box.appendChild(list);
  main.appendChild(box);
}

async function render() {
  const root = ensureRoot();
  root.innerHTML = "";

  root.appendChild(header());

  const main = h("main", { class: "main" }, []);
  root.appendChild(main);

  try {
    if (route.view === "home") await renderHome(main);
    else if (route.view === "list") await renderList(main);
    else if (route.view === "seasons") await renderSeasons(main);
    else if (route.view === "episodes") await renderEpisodes(main);
  } catch (err) {
    main.appendChild(h("p", { class: "muted", text: `Hata: ${err.message}` }));
  }
}

// boot
render();
