// app.js (ESM - Module)

// -----------------------------
// Ayarlar
// -----------------------------
const STORAGE_KEY = "koleksiyon_takip_v1";

// Bu projede data dosyaları default export ile geliyor.
// Örn: export default [ ... ]
// Bu yüzden dynamic import ile okuyacağız.
const PATHS = {
  marvelIndex: "./data/marvel/marvel.index.js",
  starwarsIndex: "./data/starwars/starwars.index.js",
};

// -----------------------------
// DOM
// -----------------------------
const elTabMarvel = document.getElementById("tab-marvel");
const elTabStarwars = document.getElementById("tab-starwars");

const elScreenList = document.getElementById("screen-list");
const elScreenDetail = document.getElementById("screen-detail");

// -----------------------------
// State
// -----------------------------
const state = {
  activeTab: "marvel", // "marvel" | "starwars"
  homeIndex: null,     // index array
  list: null,          // active category list (items)
  breadcrumb: [],      // navigation
  progress: loadProgress(),
};

// -----------------------------
// Storage helpers
// -----------------------------
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function ensureProgressNode(key) {
  if (!state.progress[key]) state.progress[key] = { done: {}, episodes: {} };
  if (!state.progress[key].done) state.progress[key].done = {};
  if (!state.progress[key].episodes) state.progress[key].episodes = {};
  return state.progress[key];
}

// -----------------------------
// Util
// -----------------------------
function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setActiveTabUI(tab) {
  if (tab === "marvel") {
    elTabMarvel.classList.add("active");
    elTabStarwars.classList.remove("active");
  } else {
    elTabStarwars.classList.add("active");
    elTabMarvel.classList.remove("active");
  }
}

function showScreen(which) {
  if (which === "list") {
    elScreenList.classList.remove("hidden");
    elScreenDetail.classList.add("hidden");
  } else {
    elScreenDetail.classList.remove("hidden");
    elScreenList.classList.add("hidden");
  }
}

function normalizeItem(raw, i) {
  // raw: { title, type, ... } bekliyoruz
  // id yoksa deterministik üretelim:
  const id = raw.id ?? `${slug(raw.title)}_${i}`;
  return { ...raw, id };
}

function slug(s) {
  return String(s || "")
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function percent(doneCount, total) {
  if (!total) return 0;
  return Math.round((doneCount / total) * 100);
}

// -----------------------------
// Module loader (kritik düzeltme)
// -----------------------------
async function importDefault(path) {
  // Cache bust yok: GitHub Pages / Codespace sabit kalsın diye.
  // (Gerekirse ?v=... ekleyebilirsin)
  const mod = await import(path);
  return mod.default;
}

// -----------------------------
// Data loading
// -----------------------------
async function loadHomeIndex(tab) {
  if (tab === "marvel") return await importDefault(PATHS.marvelIndex);
  return await importDefault(PATHS.starwarsIndex);
}

async function loadCategoryItems(category) {
  // category örn:
  // { id:"mcu", title:"MCU", file:"./data/marvel/mcu.collection.js" }
  if (!category?.file) throw new Error("Kategori dosyası (file) yok.");
  const arr = await importDefault(category.file);
  return Array.isArray(arr) ? arr : [];
}

// -----------------------------
// Render: HOME
// -----------------------------
function renderHome(indexArr) {
  showScreen("list");

  const tabTitle = state.activeTab === "marvel" ? "Marvel" : "Star Wars";

  // HOME total/progress: tüm kategorilerdeki işaretlenenleri saymak için
  // (Performans: burada sadece mevcut progress üzerinden sayıyoruz. Data dosyalarını tek tek yüklemiyoruz.)
  const summary = buildHomeSummary(indexArr);

  elScreenList.innerHTML = `
    <header class="header">
      <h1>Koleksiyon</h1>
      <p>${tabTitle} İzleme Takibi</p>
      <div class="progressbar">
        <div class="progressbar__row">
          <div class="progressbar__label">Genel ilerleme</div>
          <div class="progressbar__value">%${summary.percent}</div>
        </div>
        <div class="progressbar__track">
          <div class="progressbar__fill" style="width:${summary.percent}%"></div>
        </div>
        <div class="progressbar__meta">${summary.done} işaretli</div>
      </div>
    </header>

    <div class="list">
      ${indexArr
        .map((c) => renderCategoryCard(c))
        .join("")}
    </div>
  `;

  // click handlers
  elScreenList.querySelectorAll("[data-cat]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const catId = btn.getAttribute("data-cat");
      const cat = indexArr.find((x) => String(x.id) === String(catId));
      if (!cat) return;
      await openCategory(cat);
    });
  });
}

function buildHomeSummary(indexArr) {
  // Tüm kategoriler için toplam done sayısını progress objesinden sayıyoruz.
  // Total'ı gerçek data yüklemeden bilemeyiz; burada "işaretli adet" ve
  // "yüzde"yi basit tutuyoruz: yüzde = işaretli / (işaretli + işaretsiz bilinmiyor) olmaz.
  // Bu yüzden: yüzdeyi kategori toplamları üzerinden hesaplamak istersen, her kategori dosyasını
  // yükleyip saymak gerekir. Aşağıdaki "light" çözüm: yüzdeyi kategori başına ortalama gibi verir.
  // İstersen sonra "gerçek yüzde"yi de yaparız.

  let done = 0;
  for (const cat of indexArr) {
    const key = storageKeyFor(cat);
    const node = state.progress[key];
    if (node?.done) done += Object.keys(node.done).filter((k) => node.done[k]).length;
  }
  // Light yüzde: sadece “işaretli adet”i göstereceğiz, yüzdeyi de 0 yerine daha mantıklı diye
  // 100'e sabitlemiyoruz. Burada 0-100 arası bir şey isteniyor; basitçe done üzerinden:
  const p = done === 0 ? 0 : Math.min(99, 10 + Math.floor(Math.log10(done + 1) * 25));
  return { done, percent: p };
}

function renderCategoryCard(cat) {
  const key = storageKeyFor(cat);
  const node = state.progress[key];
  const done = node?.done ? Object.keys(node.done).filter((k) => node.done[k]).length : 0;

  return `
    <button class="card" data-cat="${esc(cat.id)}">
      <div class="card__title">${esc(cat.title)}</div>
      <div class="card__meta">${done} işaretli</div>
    </button>
  `;
}

function storageKeyFor(cat) {
  // tab + category id benzersiz olsun
  return `${state.activeTab}:${cat.id}`;
}

// -----------------------------
// Render: CATEGORY LIST
// -----------------------------
function renderCategoryList(cat, items) {
  showScreen("list");

  const key = storageKeyFor(cat);
  const node = ensureProgressNode(key);

  // gerçek yüzde: kategori items üzerinden net hesap
  const total = items.length;
  const doneCount = items.filter((it) => node.done[it.id]).length;
  const p = percent(doneCount, total);

  elScreenList.innerHTML = `
    <header class="header">
      <button class="back" id="btn-back-home">← Liste</button>
      <h2>${esc(cat.title)}</h2>

      <div class="progressbar">
        <div class="progressbar__row">
          <div class="progressbar__label">İlerleme</div>
          <div class="progressbar__value">%${p}</div>
        </div>
        <div class="progressbar__track">
          <div class="progressbar__fill" style="width:${p}%"></div>
        </div>
        <div class="progressbar__meta">${doneCount}/${total}</div>
      </div>
    </header>

    <div class="list">
      ${items.map((it) => renderItemRow(cat, it, node)).join("")}
    </div>
  `;

  document.getElementById("btn-back-home").addEventListener("click", () => {
    renderHome(state.homeIndex);
  });

  // done toggle
  elScreenList.querySelectorAll("[data-item]").forEach((row) => {
    row.addEventListener("click", (e) => {
      // detail butonuna tıklayınca checkbox tetikleme karışmasın
      const target = e.target;
      if (target.closest("[data-open-detail]")) return;

      const itemId = row.getAttribute("data-item");
      node.done[itemId] = !node.done[itemId];
      saveProgress();
      // yeniden çiz
      renderCategoryList(cat, items);
    });
  });

  // detail open
  elScreenList.querySelectorAll("[data-open-detail]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const itemId = btn.getAttribute("data-open-detail");
      const item = items.find((x) => String(x.id) === String(itemId));
      if (!item) return;
      openDetail(cat, item);
    });
  });
}

function renderItemRow(cat, item, node) {
  const isDone = !!node.done[item.id];
  const typeLabel = item.type ? item.type : "";

  return `
    <div class="row ${isDone ? "row--done" : ""}" data-item="${esc(item.id)}">
      <div class="row__check">${isDone ? "✓" : "—"}</div>
      <div class="row__main">
        <div class="row__title">${esc(item.title)}</div>
        <div class="row__meta">${esc(typeLabel)}</div>
      </div>
      <button class="row__btn" data-open-detail="${esc(item.id)}">İzle</button>
    </div>
  `;
}

// -----------------------------
// Render: DETAIL (Sezon/Bölüm)
// -----------------------------
function renderDetail(cat, item) {
  showScreen("detail");

  const key = storageKeyFor(cat);
  const node = ensureProgressNode(key);

  // Episodes tracking: item.seasons bekliyoruz:
  // seasons: [{ season:1, episodes:["Ep 1","Ep 2"] }]
  const seasons = Array.isArray(item.seasons) ? item.seasons : null;

  elScreenDetail.innerHTML = `
    <header class="header">
      <button class="back" id="btn-back-list">← Liste</button>
      <h2>${esc(item.title)}</h2>
      <p>${esc(item.type || "")}</p>
    </header>

    <section class="detail">
      ${
        seasons
          ? renderSeasons(cat, item, seasons, node)
          : `<div class="empty">Bölüm listesi bulunamadı. (Bu içerik için data dosyasında <code>seasons</code> yok.)</div>`
      }
    </section>
  `;

  document.getElementById("btn-back-list").addEventListener("click", () => {
    renderCategoryList(cat, state.list);
  });

  if (seasons) {
    elScreenDetail.querySelectorAll("[data-ep]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const k = cb.getAttribute("data-ep"); // season|epIndex
        if (!node.episodes[item.id]) node.episodes[item.id] = {};
        node.episodes[item.id][k] = cb.checked;
        saveProgress();
        // küçük güncelleme: başlığı yeniden hesaplayabiliriz ama şart değil
      });
    });
  }
}

function renderSeasons(cat, item, seasons, node) {
  const doneMap = node.episodes[item.id] || {};
  return seasons
    .map((s) => {
      const eps = Array.isArray(s.episodes) ? s.episodes : [];
      const seasonNo = s.season ?? "?";
      return `
        <div class="season">
          <div class="season__title">${esc(item.title)} • ${seasonNo}. Sezon</div>
          <div class="season__list">
            ${eps
              .map((name, idx) => {
                const key = `${seasonNo}|${idx}`;
                const checked = !!doneMap[key];
                return `
                  <label class="ep">
                    <input type="checkbox" data-ep="${esc(key)}" ${checked ? "checked" : ""}/>
                    <span>${esc(name)}</span>
                  </label>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    })
    .join("");
}

// -----------------------------
// Navigation
// -----------------------------
async function openCategory(cat) {
  try {
    const rawItems = await loadCategoryItems(cat);
    const items = rawItems.map(normalizeItem);
    state.list = items;
    renderCategoryList(cat, items);
  } catch (err) {
    renderError("Liste yüklenemedi: " + (err?.message || err));
  }
}

function openDetail(cat, item) {
  try {
    renderDetail(cat, item);
  } catch (err) {
    renderError("Detay açılamadı: " + (err?.message || err));
  }
}

// -----------------------------
// Error
// -----------------------------
function renderError(msg) {
  showScreen("detail");
  elScreenDetail.innerHTML = `
    <header class="header">
      <h2>Hata</h2>
    </header>
    <div class="detail">
      <div class="empty">${esc(msg)}</div>
    </div>
  `;
  console.error(msg);
}

// -----------------------------
// Boot
// -----------------------------
async function boot() {
  try {
    setActiveTabUI(state.activeTab);

    // Tab events
    elTabMarvel.addEventListener("click", async () => {
      state.activeTab = "marvel";
      setActiveTabUI("marvel");
      await loadAndRenderHome();
    });

    elTabStarwars.addEventListener("click", async () => {
      state.activeTab = "starwars";
      setActiveTabUI("starwars");
      await loadAndRenderHome();
    });

    await loadAndRenderHome();
  } catch (err) {
    renderError("Anasayfa yüklenirken hata oluştu. " + (err?.message || err));
  }
}

async function loadAndRenderHome() {
  state.homeIndex = await loadHomeIndex(state.activeTab);
  // index dizisi bekliyoruz: [{id,title,file}, ...]
  if (!Array.isArray(state.homeIndex)) state.homeIndex = [];
  renderHome(state.homeIndex);
}

boot();
