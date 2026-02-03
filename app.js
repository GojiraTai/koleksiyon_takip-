import MCU from "./data/marvel/mcu.collection.js";

const OMDB_KEY = "a57784cc";
const POSTER_W = 300; // w300
const STORAGE_KEY = "koleksiyon_takip_v3";

const elList = document.getElementById("screen-list");
const elDetail = document.getElementById("screen-detail");
const tabMarvel = document.getElementById("tab-marvel");
const tabStarWars = document.getElementById("tab-starwars");

let state = loadState();

tabMarvel.onclick = () => renderMarvel();
tabStarWars.onclick = () => {
  tabMarvel.classList.remove("active");
  tabStarWars.classList.add("active");
  elDetail.classList.add("hidden");
  elList.classList.remove("hidden");
  elList.innerHTML = `
    <div class="hRow"><h2>Star Wars</h2><div class="small">Önce MCU’yu sağlamlaştırıyoruz 🙂</div></div>
    <div class="small">Star Wars sekmesini bir sonraki adımda aynı motorla ekleyeceğiz.</div>
  `;
};

renderMarvel();

function renderMarvel(){
  tabStarWars.classList.remove("active");
  tabMarvel.classList.add("active");
  elDetail.classList.add("hidden");
  elList.classList.remove("hidden");

  elList.innerHTML = `
    <div class="hRow">
      <h2>Marvel (MCU)</h2>
      <div class="small">Poster: OMDb • Dizi bölümleri: OMDb Seasons</div>
    </div>
    <div id="mcuList" class="list"></div>
  `;

  const box = document.getElementById("mcuList");
  box.innerHTML = "";

  MCU.forEach((it, idx) => {
    const key = makeItemKey("mcu", it.query);

    const watched = !!state.items[key]?.watched;
    const badge = watched ? `<span class="badge ok">İzlendi</span>` : `<span class="badge">İzlenmedi</span>`;

    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="poster" id="p_${idx}"></div>
      <div>
        <div class="title">${escapeHtml(it.titleTR)}</div>
        <div class="meta">${kindLabel(it.kind)}</div>
      </div>
      <div class="actions">
        ${badge}
        <button class="btn" data-tog="${idx}">İzlendi</button>
        ${it.kind === "series" ? `<button class="btn primary" data-open="${idx}">Sezonlar</button>` : ``}
      </div>
    `;

    box.appendChild(row);

    // poster async
    ensurePoster(`p_${idx}`, it.query, it.kind);

    row.querySelector(`[data-tog="${idx}"]`).onclick = () => {
      toggleWatched(key);
      renderMarvel();
    };

    const openBtn = row.querySelector(`[data-open="${idx}"]`);
    if(openBtn){
      openBtn.onclick = () => openSeries(it, key);
    }
  });
}

async function openSeries(item, itemKey){
  elList.classList.add("hidden");
  elDetail.classList.remove("hidden");

  elDetail.innerHTML = `
    <div class="backRow">
      <button class="btn" id="backBtn">← Liste</button>
      <div>
        <div class="title">${escapeHtml(item.titleTR)}</div>
        <div class="small">Sezon ve bölüm işaretleme</div>
      </div>
    </div>
    <div id="seriesMeta" class="small">Yükleniyor…</div>
    <div id="seasonGrid" class="seasonGrid"></div>
  `;
  document.getElementById("backBtn").onclick = () => renderMarvel();

  // 1) imdbID bul (doğru eşleşme için query İngilizce)
  const base = await omdb({ t: item.query, type: "series" });
  if(!base || base.Response === "False" || !base.imdbID){
    document.getElementById("seriesMeta").textContent =
      "Dizi OMDb’de bulunamadı. (Query eşleşmedi.)";
    return;
  }

  const imdbID = base.imdbID;
  const totalSeasons = parseInt(base.totalSeasons || "0", 10);

  document.getElementById("seriesMeta").textContent =
    `OMDb: ${base.Title} • Toplam sezon: ${totalSeasons || "?"}`;

  // 2) sezon kartları
  const grid = document.getElementById("seasonGrid");
  grid.innerHTML = "";

  const seasons = totalSeasons || 1; // en az 1 dener
  for(let s=1; s<=seasons; s++){
    const card = document.createElement("div");
    card.className = "seasonCard";
    card.innerHTML = `
      <div class="seasonHead">
        <h3>${escapeHtml(item.titleTR)} • ${s}. Sezon</h3>
        <button class="btn" data-load="${s}">Bölümleri Getir</button>
      </div>
      <div id="eps_${s}" class="small">Henüz yüklenmedi.</div>
    `;
    grid.appendChild(card);

    card.querySelector(`[data-load="${s}"]`).onclick = async () => {
      await loadSeasonEpisodes(imdbID, itemKey, item.titleTR, s);
    };
  }
}

async function loadSeasonEpisodes(imdbID, itemKey, titleTR, seasonNum){
  const target = document.getElementById(`eps_${seasonNum}`);
  target.innerHTML = "Yükleniyor…";

  const season = await omdb({ i: imdbID, Season: String(seasonNum) });
  if(!season || season.Response === "False" || !Array.isArray(season.Episodes)){
    target.innerHTML = "Bölüm listesi bulunamadı (OMDb'de yok olabilir).";
    return;
  }

  // storage alanı
  state.episodes[itemKey] ??= {};
  state.episodes[itemKey][seasonNum] ??= {}; // episodeNo -> bool
  saveState();

  const wrap = document.createElement("div");
  wrap.className = "epList";

  season.Episodes.forEach(ep => {
    const epNo = parseInt(ep.Episode, 10);
    const checked = !!state.episodes[itemKey][seasonNum][epNo];

    const row = document.createElement("div");
    row.className = "ep";
    row.innerHTML = `
      <label>
        <input type="checkbox" ${checked ? "checked":""} />
        <span class="epTitle">${seasonNum}.${epNo} • ${escapeHtml(ep.Title || "Bölüm")}</span>
      </label>
      <span class="small">${ep.Released && ep.Released !== "N/A" ? escapeHtml(ep.Released) : ""}</span>
    `;

    row.querySelector("input").onchange = (e) => {
      state.episodes[itemKey][seasonNum][epNo] = e.target.checked;
      saveState();
    };

    wrap.appendChild(row);
  });

  target.innerHTML = "";
  target.appendChild(wrap);
}

function toggleWatched(itemKey){
  state.items[itemKey] ??= {};
  state.items[itemKey].watched = !state.items[itemKey].watched;
  saveState();
}

async function ensurePoster(containerId, queryTitle, kind){
  const box = document.getElementById(containerId);
  if(!box) return;

  // cache
  state.posterCache ??= {};
  const cacheKey = `${kind}:${queryTitle}`;
  if(state.posterCache[cacheKey]){
    box.innerHTML = `<img alt="" src="${state.posterCache[cacheKey]}">`;
    return;
  }

  const type = kind === "series" ? "series" : "movie";
  const data = await omdb({ t: queryTitle, type });
  let poster = data?.Poster && data.Poster !== "N/A" ? data.Poster : "";

  // OMDb posterı bazen zaten full URL; w300 istiyorsun:
  poster = normalizePosterToW300(poster);

  if(poster){
    state.posterCache[cacheKey] = poster;
    saveState();
    box.innerHTML = `<img alt="" src="${poster}">`;
  } else {
    box.innerHTML = `<span class="small">—</span>`;
  }
}

function normalizePosterToW300(url){
  if(!url) return "";
  // OMDb bazen: https://m.media-amazon.com/images/M/....jpg
  // w300 istiyorsak:
  return url.replace(/_V1_.*?\.jpg$/i, "_V1_UX300_.jpg");
}

async function omdb(params){
  const u = new URL("https://www.omdbapi.com/");
  u.searchParams.set("apikey", OMDB_KEY);
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k, v));

  try{
    const res = await fetch(u.toString());
    return await res.json();
  }catch{
    return null;
  }
}

function kindLabel(kind){
  switch(kind){
    case "movie": return "Film";
    case "series": return "Dizi";
    case "short": return "Tek Atış";
    case "special": return "Özel Sunum";
    default: return kind || "";
  }
}

function makeItemKey(lib, query){
  return `${lib}::${query}`.toLowerCase();
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return { items:{}, episodes:{}, posterCache:{} };
    const parsed = JSON.parse(raw);
    return {
      items: parsed.items || {},
      episodes: parsed.episodes || {},
      posterCache: parsed.posterCache || {}
    };
  }catch{
    return { items:{}, episodes:{}, posterCache:{} };
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
