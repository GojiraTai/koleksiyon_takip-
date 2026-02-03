/* app.js - Koleksiyon Takip (vanilla JS)
   - ES module dosyalarını (import/export default) fetch + eval ile çalıştırmak için mini loader içerir
*/

const $ = (sel, root = document) => root.querySelector(sel);

const screenList = $("#screen-list");
const screenDetail = $("#screen-detail");

const btnTabMarvel = $("#tab-marvel");
const btnTabStarwars = $("#tab-starwars");

const STORAGE_KEY = "koleksiyon_takip_v1";

const state = {
  tab: "marvel",          // "marvel" | "starwars"
  view: "home",           // "home" | "category" | "detail"
  categoryKey: null,
  itemKey: null,
};

const cache = new Map(); // path -> exported default

/* -----------------------------
   Mini ESM Loader (import/export default)
   ----------------------------- */

// Basit path birleştirme
function joinPath(base, rel) {
  if (rel.startsWith("http")) return rel;
  if (rel.startsWith("/")) return rel;

  const baseParts = base.split("/").slice(0, -1); // dosya adını at
  const relParts = rel.split("/");

  for (const part of relParts) {
    if (part === "." || part === "") continue;
    if (part === "..") baseParts.pop();
    else baseParts.push(part);
  }
  return baseParts.join("/");
}

// "import xxx from './a.js';" satırlarını yakala
function parseImports(code) {
  // sadece default import destekliyoruz: import name from "./file.js";
  const re = /^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+["'](.+?)["']\s*;\s*$/gm;
  const imports = [];
  let m;
  while ((m = re.exec(code)) !== null) {
    imports.push({ name: m[1], from: m[2], full: m[0] });
  }
  return imports;
}

function stripImports(code) {
  // import satırlarını tamamen sil
  return code.replace(/^\s*import\s+[A-Za-z_$][\w$]*\s+from\s+["'](.+?)["']\s*;\s*$/gm, "");
}

function transformExportDefaultToReturn(code) {
  // export default ....;  -> return ....;
  // Bu projede default export tek ve en altta varsayımıyla çalışır.
  return code.replace(/\bexport\s+default\b/g, "return");
}

async function loadExportDefaultJS(path) {
  if (cache.has(path)) return cache.get(path);

  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Dosya yüklenemedi: ${path} (${res.status})`);
  let code = await res.text();

  // import’ları çöz
  const imports = parseImports(code);
  const values = {};

  for (const imp of imports) {
    const childPath = joinPath(path, imp.from);
    values[imp.name] = await loadExportDefaultJS(childPath);
  }

  // import satırlarını sil, export default'u return'e çevir
  code = stripImports(code);
  code = transformExportDefaultToReturn(code);

  // Çalıştırılacak fonksiyon gövdesi:
  // const mcu = __deps.mcu; ...
  // return {...};
  const depLines = Object.keys(values)
    .map((k) => `const ${k} = __deps[${JSON.stringify(k)}];`)
    .join("\n");

  const wrapped = `${depLines}\n${code}`;

  let exported;
  try {
    // new Function ile çalıştır
    exported = new Function("__deps", wrapped)(values);
  } catch (e) {
    // Hata olursa daha anlaşılır göster
    console.error("loadExportDefaultJS eval error:", path, e);
    throw new Error(`JS parse/çalıştırma hatası: ${path}\n${e.message}`);
  }

  cache.set(path, exported);
  return exported;
}

/* -----------------------------
   Storage (izlendi işaretleri)
   ----------------------------- */

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveStore(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function makeItemId(tab, categoryKey, idx) {
  return `${tab}::${categoryKey}::${idx}`;
}

/* -----------------------------
   UI helpers
   ----------------------------- */

function setActiveTab(tab) {
  state.tab = tab;
  btnTabMarvel.classList.toggle("active", tab === "marvel");
  btnTabStarwars.classList.toggle("active", tab === "starwars");
}

function showScreen(which) {
  // which: "list" | "detail"
  if (which === "list") {
    screenList.classList.remove("hidden");
    screenDetail.classList.add("hidden");
  } else {
    screenList.classList.add("hidden");
    screenDetail.classList.remove("hidden");
  }
}

function renderError(targetEl, title, err) {
  targetEl.innerHTML = `
    <div class="card" style="margin-top:16px;">
      <h2 style="margin:0 0 8px 0;">${escapeHtml(title)}</h2>
      <div style="opacity:.9; white-space:pre-wrap; font-size:14px;">
        ${escapeHtml(String(err?.message || err))}
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* -----------------------------
   Data loading
   ----------------------------- */

async function loadTabIndex(tab) {
  // tab: "marvel" | "starwars"
  // dosyalar: /data/marvel/marvel.index.js gibi
  const path = `/data/${tab}/${tab}.index.js`;
  return await loadExportDefaultJS(path);
}

async function getCategoryItems(tabIndex, categoryKey, tab) {
  // tabIndex.libs[categoryKey] array ya da path olabilir
  const lib = tabIndex.libs?.[categoryKey];
  if (!lib) return [];

  if (Array.isArray(lib)) return lib;

  // string path gelirse
  if (typeof lib === "string") {
    const path = lib.startsWith("/") ? lib : `/data/${tab}/${lib}`;
    const data = await loadExportDefaultJS(path);
    return Array.isArray(data) ? data : [];
  }

  return [];
}

/* -----------------------------
   Render: HOME / CATEGORY / DETAIL
   ----------------------------- */

async function renderHome(tab) {
  showScreen("list");

  screenList.innerHTML = `
    <div class="card">
      <h1 style="margin:0 0 6px 0;">Koleksiyon</h1>
      <div style="opacity:.8;">${tab === "marvel" ? "Marvel" : "Star Wars"} İzleme Takibi</div>
      <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn" id="btn-home-tab">${tab === "marvel" ? "Marvel" : "Star Wars"} Kategorileri</button>
      </div>
      <div id="home-stats" style="margin-top:14px; opacity:.9;"></div>
    </div>

    <div id="home-categories" style="margin-top:14px;"></div>
  `;

  try {
    const idx = await loadTabIndex(tab);
    const store = loadStore();

    // toplam / izlenen hesapla
    let total = 0;
    let watched = 0;

    for (const c of idx.categories || []) {
      const items = await getCategoryItems(idx, c.key, tab);
      total += items.length;
      items.forEach((it, i) => {
        const id = makeItemId(tab, c.key, i);
        if (store[id]) watched += 1;
      });
    }

    const pct = total ? Math.round((watched / total) * 100) : 0;
    $("#home-stats").innerHTML = `
      <div style="margin-top:4px;">Genel ilerleme</div>
      <div style="font-size:20px; font-weight:700;">%${pct}</div>
      <div style="opacity:.8;">${watched} işaretli / ${total} toplam</div>
    `;

    const catWrap = $("#home-categories");
    catWrap.innerHTML = (idx.categories || [])
      .map((c) => {
        return `
          <button class="card" data-cat="${escapeHtml(c.key)}" style="text-align:left; width:100%; cursor:pointer;">
            <div style="font-size:18px; font-weight:700;">${escapeHtml(c.title)}</div>
            <div style="opacity:.75; margin-top:4px;">Listeyi aç</div>
          </button>
        `;
      })
      .join("");

    catWrap.querySelectorAll("[data-cat]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const key = btn.getAttribute("data-cat");
        state.view = "category";
        state.categoryKey = key;
        await renderCategory(tab, key);
      });
    });
  } catch (e) {
    renderError($("#home-categories"), "Anasayfa yüklenirken hata oluştu.", e);
  }
}

async function renderCategory(tab, categoryKey) {
  showScreen("list");

  screenList.innerHTML = `
    <div class="card">
      <button class="btn" id="btn-back-home">← Liste</button>
      <h2 id="cat-title" style="margin:12px 0 6px 0;"></h2>
      <div id="cat-sub" style="opacity:.8;"></div>
    </div>

    <div id="items" style="margin-top:14px;"></div>
  `;

  $("#btn-back-home").addEventListener("click", async () => {
    state.view = "home";
    state.categoryKey = null;
    await renderHome(tab);
  });

  try {
    const idx = await loadTabIndex(tab);
    const cat = (idx.categories || []).find((c) => c.key === categoryKey);
    $("#cat-title").textContent = cat?.title || categoryKey;

    const items = await getCategoryItems(idx, categoryKey, tab);
    $("#cat-sub").textContent = `${items.length} öğe`;

    const store = loadStore();
    const wrap = $("#items");

    wrap.innerHTML = items
      .map((it, i) => {
        const id = makeItemId(tab, categoryKey, i);
        const checked = !!store[id];

        const title = it.title || it.name || `Öğe ${i + 1}`;
        const type = it.type || it.kind || ""; // Film / Dizi vs
        const year = it.year ? ` • ${it.year}` : "";

        return `
          <div class="card item" data-idx="${i}" style="display:flex; align-items:center; gap:12px; cursor:pointer;">
            <input type="checkbox" data-check="${i}" ${checked ? "checked" : ""} style="transform:scale(1.2); cursor:pointer;" />
            <div style="flex:1;">
              <div style="font-weight:800; font-size:18px;">${escapeHtml(title)}</div>
              <div style="opacity:.75; margin-top:2px;">${escapeHtml(type)}${escapeHtml(year)}</div>
            </div>
          </div>
        `;
      })
      .join("");

    // checkbox click (kartı açmadan)
    wrap.querySelectorAll("[data-check]").forEach((cb) => {
      cb.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const i = Number(cb.getAttribute("data-check"));
        const id = makeItemId(tab, categoryKey, i);
        const s = loadStore();
        s[id] = cb.checked;
        saveStore(s);
      });
    });

    // kart click -> detail
    wrap.querySelectorAll(".item").forEach((row) => {
      row.addEventListener("click", async () => {
        const i = Number(row.getAttribute("data-idx"));
        state.view = "detail";
        state.itemKey = i;
        await renderDetail(tab, categoryKey, i);
      });
    });
  } catch (e) {
    renderError($("#items"), "Liste yüklenirken hata oluştu.", e);
  }
}

async function renderDetail(tab, categoryKey, idxInCat) {
  showScreen("detail");

  screenDetail.innerHTML = `
    <div class="card">
      <button class="btn" id="btn-back-cat">← Liste</button>
      <div id="detail-content" style="margin-top:12px;"></div>
    </div>
  `;

  $("#btn-back-cat").addEventListener("click", async () => {
    state.view = "category";
    await renderCategory(tab, categoryKey);
  });

  try {
    const tabIndex = await loadTabIndex(tab);
    const items = await getCategoryItems(tabIndex, categoryKey, tab);
    const it = items[idxInCat];

    if (!it) throw new Error("Öğe bulunamadı.");

    const store = loadStore();
    const id = makeItemId(tab, categoryKey, idxInCat);
    const checked = !!store[id];

    const title = it.title || it.name || "Başlık yok";
    const type = it.type || it.kind || "";
    const year = it.year ? `${it.year}` : "";

    $("#detail-content").innerHTML = `
      <h2 style="margin:0 0 8px 0;">${escapeHtml(title)}</h2>
      <div style="opacity:.8; margin-bottom:12px;">${escapeHtml(type)} ${year ? "• " + escapeHtml(year) : ""}</div>

      <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
        <input type="checkbox" id="detail-check" ${checked ? "checked" : ""} style="transform:scale(1.2);" />
        <span>İzlendi olarak işaretle</span>
      </label>

      ${it.note ? `<div style="margin-top:12px; opacity:.85;">${escapeHtml(it.note)}</div>` : ""}
    `;

    $("#detail-check").addEventListener("change", (e) => {
      const s = loadStore();
      s[id] = e.target.checked;
      saveStore(s);
    });
  } catch (e) {
    renderError($("#detail-content"), "Detay yüklenirken hata oluştu.", e);
  }
}

/* -----------------------------
   Init
   ----------------------------- */

function bindTabs() {
  btnTabMarvel?.addEventListener("click", async () => {
    setActiveTab("marvel");
    state.view = "home";
    await renderHome("marvel");
  });

  btnTabStarwars?.addEventListener("click", async () => {
    setActiveTab("starwars");
    state.view = "home";
    await renderHome("starwars");
  });
}

async function boot() {
  bindTabs();
  setActiveTab("marvel");
  await renderHome("marvel");
}

boot();
