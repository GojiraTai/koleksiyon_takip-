/* app.js - Koleksiyon Takip (stabil, import yok, sadece local data okur) */
(() => {
  "use strict";

  // ---------- DOM helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // ---------- Paths ----------
  // data klasörü yapın:
  // /data/marvel/marvel.index.js
  // /data/marvel/mcu.collection.js, ...
  // /data/starwars/starwars.index.js (varsa)
  const PATHS = {
    marvelIndex: "data/marvel/marvel.index.js",
    starwarsIndex: "data/starwars/starwars.index.js",
  };

  // ---------- State ----------
  const state = {
    activeTab: "marvel",   // marvel | starwars
    activeCategory: null,  // category key
    index: { marvel: null, starwars: null },
    items: [],             // current list items
    checked: new Set(),    // localStorage
  };

  // ---------- Storage ----------
  const STORAGE_KEY = "koleksiyon_takip_checked_v1";
  function loadChecked() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) state.checked = new Set(arr);
    } catch {}
  }
  function saveChecked() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.checked]));
    } catch {}
  }

  // ---------- Safe parse "export default ..." WITHOUT import/module ----------
  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Dosya yüklenemedi: ${url} (${r.status})`);
    return await r.text();
  }

  function evalExportDefault(code, urlLabel) {
    // "export default ..." kısmını "return (...)"e çevirip çalıştırır.
    // Bu sayede import statement yoksa sorunsuz.
    const cleaned = code
      .replace(/^\uFEFF/, "")
      .replace(/export\s+default\s+/g, "return ");

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(cleaned);
      return fn();
    } catch (e) {
      throw new Error(`JS parse edilemedi: ${urlLabel}. ${e.message}`);
    }
  }

  async function loadExportDefaultJS(url) {
    const txt = await fetchText(url);
    return evalExportDefault(txt, url);
  }

  // ---------- Normalizers ----------
  function normalizeIndex(obj) {
    // beklenen index formatı:
    // export default { title:"Marvel", categories:[{key,title}], libs:{ mcu:"./mcu.collection.js" } }
    // Ama libs: {mcu, ...} olarak direkt diziyi veren yapılar da olabilir.
    if (!obj || typeof obj !== "object") {
      return { title: "Koleksiyon", categories: [], libs: {} };
    }
    const title = obj.title || obj.name || "Koleksiyon";
    const categories = Array.isArray(obj.categories) ? obj.categories : [];
    const libs = obj.libs && typeof obj.libs === "object" ? obj.libs : {};
    return { title, categories, libs };
  }

  function normalizeCollection(raw) {
    // collection dosyaları iki şekilde olabilir:
    // 1) export default [ ...items ]
    // 2) export default { items:[...], ... }
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object") {
      if (Array.isArray(raw.items)) return raw.items;
      if (Array.isArray(raw.list)) return raw.list;
      if (Array.isArray(raw.data)) return raw.data;
    }
    return [];
  }

  function getItemId(item, idx, scope) {
    // mümkünse stabil id üret
    const base =
      item.id ||
      item.imdbID ||
      item.imdbId ||
      item.tmdbId ||
      item.slug ||
      item.key ||
      null;

    if (base) return `${scope}:${base}`;

    const name = getItemTitle(item, idx);
    const year = item.year || item.releaseYear || "";
    return `${scope}:${name}:${year}:${idx}`;
  }

  function getItemTitle(item, idx) {
    return (
      item.title ||
      item.name ||
      item.label ||
      item.originalTitle ||
      item.trTitle ||
      item.display ||
      `Öğe ${idx + 1}`
    );
  }

  function getItemType(item) {
    // movie / series / short vs
    const t = (item.type || item.kind || item.mediaType || item.format || "").toString().toLowerCase();
    if (t) return t;
    // bazı listelerde "isSeries" gibi boolean olabilir:
    if (item.isSeries === true) return "series";
    if (item.isMovie === true) return "movie";
    return "movie";
  }

  function getPoster(item) {
    // senin "sadece resim eklemek" dediğin yer tam burası.
    // collection dosyanda poster linki varsa gösterecek.
    const p =
      item.poster ||
      item.posterUrl ||
      item.posterURL ||
      item.img ||
      item.image ||
      item.cover ||
      item.thumb ||
      "";
    return (p && typeof p === "string") ? p : "";
  }

  // Eğer posterler relative ise (ör: "posters/ironman.jpg") düzgün bağla:
  function resolvePoster(poster, baseDir) {
    if (!poster) return "";
    if (/^https?:\/\//i.test(poster)) return poster;
    if (poster.startsWith("/")) return poster; // kökten verildiyse
    // baseDir: "data/marvel/"
    return baseDir + poster.replace(/^\.\//, "");
  }

  function safeJoin(baseDir, maybePath) {
    // baseDir "data/marvel/"
    // maybePath "./mcu.collection.js" veya "mcu.collection.js" veya zaten "data/..." olabilir
    if (!maybePath) return "";
    if (typeof maybePath !== "string") return "";
    if (maybePath.startsWith("data/")) return maybePath;
    if (maybePath.startsWith("/data/")) return maybePath.slice(1);
    const clean = maybePath.replace(/^\.\//, "");
    return baseDir + clean;
  }

  // ---------- UI ----------
  function renderError(whereTitle, err) {
    const screenList = $("#screen-list");
    const screenDetail = $("#screen-detail");
    if (screenDetail) screenDetail.classList.add("hidden");
    if (!screenList) return;

    screenList.classList.remove("hidden");
    screenList.innerHTML = "";

    screenList.appendChild(el("h2", "h2", "Anasayfa yüklenirken hata oluştu."));
    const msg = el("div", "muted", err?.message || String(err));
    screenList.appendChild(msg);
  }

  function setActiveTab(tab) {
    state.activeTab = tab;

    const btnMarvel = $("#tab-marvel");
    const btnStar = $("#tab-starwars");
    if (btnMarvel && btnStar) {
      btnMarvel.classList.toggle("active", tab === "marvel");
      btnStar.classList.toggle("active", tab === "starwars");
    }
  }

  function renderHome(indexObj, scopeTitle) {
    const screenList = $("#screen-list");
    const screenDetail = $("#screen-detail");
    if (!screenList) return;

    if (screenDetail) screenDetail.classList.add("hidden");
    screenList.classList.remove("hidden");
    screenList.innerHTML = "";

    const h = el("h2", "h2", "Koleksiyon");
    screenList.appendChild(h);

    const sub = el("div", "muted", `${scopeTitle} İzleme Takibi`);
    screenList.appendChild(sub);

    // Progress (çok basit)
    const total = countTotalItemsForScope(state.activeTab);
    const done = countCheckedForScope(state.activeTab);
    const pct = total ? Math.round((done / total) * 100) : 0;

    const box = el("div", "homebox");
    box.appendChild(el("div", "muted", "Genel ilerleme"));
    box.appendChild(el("div", "big", `%${pct}`));
    box.appendChild(el("div", "muted", `${done} işaretli`));
    screenList.appendChild(box);

    // Kategori listesi
    if (indexObj.categories.length) {
      screenList.appendChild(el("h3", "h3", `${scopeTitle} Kategorileri`));
      const list = el("div", "list");
      indexObj.categories.forEach((cat) => {
        const row = el("button", "row");
        row.type = "button";
        row.addEventListener("click", () => openCategory(cat.key));
        const left = el("div", "row-left");
        left.appendChild(el("div", "row-title", cat.title || cat.key));
        left.appendChild(el("div", "row-sub", "Film / Dizi ayrımı"));
        row.appendChild(left);

        const right = el("div", "row-right");
        const cnt = countItemsInCategory(state.activeTab, cat.key);
        right.textContent = cnt ? `${cnt} öğe` : "";
        row.appendChild(right);

        list.appendChild(row);
      });
      screenList.appendChild(list);
    }
  }

  function renderCategoryList(title, baseDir) {
    const screenList = $("#screen-list");
    const screenDetail = $("#screen-detail");
    if (!screenList) return;

    if (screenDetail) screenDetail.classList.add("hidden");
    screenList.classList.remove("hidden");
    screenList.innerHTML = "";

    const back = el("button", "back", "← Liste");
    back.type = "button";
    back.addEventListener("click", () => loadTabHome());
    screenList.appendChild(back);

    screenList.appendChild(el("h2", "h2", title));
    screenList.appendChild(el("div", "muted", `${state.items.length} öğe`));

    const list = el("div", "list");
    state.items.forEach((it, idx) => {
      const id = getItemId(it, idx, `${state.activeTab}:${state.activeCategory}`);
      const checked = state.checked.has(id);

      const row = el("div", "card");
      const checkbox = el("input", "chk");
      checkbox.type = "checkbox";
      checkbox.checked = checked;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.checked.add(id);
        else state.checked.delete(id);
        saveChecked();
      });

      const posterRaw = getPoster(it);
      const poster = resolvePoster(posterRaw, baseDir);

      const posterEl = el("div", "poster");
      if (poster) {
        const img = document.createElement("img");
        img.src = poster;
        img.alt = getItemTitle(it, idx);
        img.loading = "lazy";
        posterEl.appendChild(img);
      } else {
        posterEl.textContent = "—";
      }

      const info = el("div", "info");
      info.appendChild(el("div", "title", getItemTitle(it, idx)));
      info.appendChild(el("div", "sub", getItemType(it)));

      row.appendChild(checkbox);
      row.appendChild(posterEl);
      row.appendChild(info);

      list.appendChild(row);
    });

    screenList.appendChild(list);
  }

  // ---------- Counting helpers (for progress) ----------
  const cacheCounts = { marvel: {}, starwars: {} };

  function countTotalItemsForScope(scope) {
    const idx = state.index[scope];
    if (!idx) return 0;
    let sum = 0;
    idx.categories.forEach((c) => {
      sum += countItemsInCategory(scope, c.key);
    });
    return sum;
  }

  function countCheckedForScope(scope) {
    let n = 0;
    for (const id of state.checked) {
      if (id.startsWith(scope + ":")) n++;
    }
    return n;
  }

  function countItemsInCategory(scope, catKey) {
    const key = `${scope}:${catKey}`;
    if (cacheCounts[scope][key] != null) return cacheCounts[scope][key];

    // Eğer daha önce yüklenmediyse hızlıca yüklemeye çalışır (UI bloklamadan).
    // Home ekranında sayı göstermek için.
    const idxObj = state.index[scope];
    if (!idxObj) return 0;

    const baseDir = scope === "marvel" ? "data/marvel/" : "data/starwars/";
    const lib = idxObj.libs?.[catKey];
    if (!lib) return 0;

    // lib string olabilir veya zaten data array olabilir
    if (Array.isArray(lib)) {
      const cnt = normalizeCollection(lib).length;
      cacheCounts[scope][key] = cnt;
      return cnt;
    }

    // string path ise: sayım için async yükleme, ama burada sync dönmek gerekiyor.
    // Bu yüzden ilk geçişte 0 döner, sonraki home render’da güncellenir.
    cacheCounts[scope][key] = 0;
    (async () => {
      try {
        const url = safeJoin(baseDir, lib);
        const raw = await loadExportDefaultJS(url);
        const items = normalizeCollection(raw);
        cacheCounts[scope][key] = items.length;
        // Home tekrar render
        if ((scope === "marvel" && state.activeTab === "marvel") || (scope === "starwars" && state.activeTab === "starwars")) {
          renderHome(state.index[scope], scope === "marvel" ? "Marvel" : "Star Wars");
        }
      } catch {
        cacheCounts[scope][key] = 0;
      }
    })();

    return 0;
  }

  // ---------- Main flows ----------
  async function loadTabHome() {
    try {
      const scope = state.activeTab;
      const idxUrl = scope === "marvel" ? PATHS.marvelIndex : PATHS.starwarsIndex;
      const scopeTitle = scope === "marvel" ? "Marvel" : "Star Wars";
      const idxRaw = await loadExportDefaultJS(idxUrl);
      state.index[scope] = normalizeIndex(idxRaw);
      renderHome(state.index[scope], scopeTitle);
    } catch (err) {
      renderError("Home", err);
    }
  }

  async function openCategory(catKey) {
    const scope = state.activeTab;
    const idxObj = state.index[scope];
    if (!idxObj) return;

    const baseDir = scope === "marvel" ? "data/marvel/" : "data/starwars/";
    state.activeCategory = catKey;

    try {
      const lib = idxObj.libs?.[catKey];
      if (!lib) throw new Error(`Kategori bulunamadı: ${catKey}`);

      // lib doğrudan array verilmişse
      if (Array.isArray(lib)) {
        state.items = normalizeCollection(lib);
        renderCategoryList((idxObj.categories.find(c => c.key === catKey)?.title) || catKey, baseDir);
        return;
      }

      // lib string yol ise
      const url = safeJoin(baseDir, lib);
      const raw = await loadExportDefaultJS(url);
      state.items = normalizeCollection(raw);

      const catTitle = (idxObj.categories.find(c => c.key === catKey)?.title) || catKey;
      renderCategoryList(catTitle, baseDir);
    } catch (err) {
      renderError("Category", err);
    }
  }

  function bindUI() {
    const btnMarvel = $("#tab-marvel");
    const btnStar = $("#tab-starwars");
    if (btnMarvel) btnMarvel.addEventListener("click", () => { setActiveTab("marvel"); loadTabHome(); });
    if (btnStar) btnStar.addEventListener("click", () => { setActiveTab("starwars"); loadTabHome(); });
  }

  // ---------- Boot ----------
  function boot() {
    loadChecked();
    bindUI();
    setActiveTab("marvel");
    loadTabHome();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
