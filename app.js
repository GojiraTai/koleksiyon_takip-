import { COLLECTIONS } from "./data/index.js";
import { OMDB_API_KEY } from "./data/config.js";

const app = document.getElementById("app");
const crumbsEl = document.getElementById("crumbs");

const STORAGE_KEY = "nova_koleksiyon_v2";

/** state shape:
{
  watchedItems: { [itemId]: boolean },
  watchedEpisodes: { [episodeImdbId]: boolean },
  posterCache: { [key]: string }, // key = imdbID or title
  showCache: { [baseTitleLower]: { imdbID, totalSeasons, poster, type } },
  seasonCache: { [imdbID + "_S" + season]: { episodes:[{Title,Episode,imdbID}], season } }
}
*/
let state = loadState();
let route = { page: "home", universe: null, category: null };
let expanded = new Set(); // UI only

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return freshState();
    const s = JSON.parse(raw);
    return {
      watchedItems: s.watchedItems || {},
      watchedEpisodes: s.watchedEpisodes || {},
      posterCache: s.posterCache || {},
      showCache: s.showCache || {},
      seasonCache: s.seasonCache || {},
    };
  }catch{
    return freshState();
  }
}
function freshState(){
  return { watchedItems:{}, watchedEpisodes:{}, posterCache:{}, showCache:{}, seasonCache:{} };
}
function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setRoute(next){
  route = next;
  expanded = new Set();
  render();
}

function crumb(label, onClick){
  const b = document.createElement("div");
  b.className = "crumb";
  b.textContent = label;
  b.addEventListener("click", onClick);
  crumbsEl.appendChild(b);
}

function renderCrumbs(){
  crumbsEl.innerHTML = "";
  crumb("Ana Ekran", () => setRoute({ page:"home", universe:null, category:null }));
  if(route.page !== "home"){
    const u = COLLECTIONS[route.universe];
    crumb(u.title, () => setRoute({ page:"universe", universe:route.universe, category:null }));
  }
  if(route.page === "list"){
    const u = COLLECTIONS[route.universe];
    const c = u.categories.find(x => x.key === route.category);
    crumb(c?.title || "Liste", () => {});
  }
}

function kindLabel(kind){
  switch(kind){
    case "movie": return "Film";
    case "series": return "Dizi";
    case "series_season": return "Dizi (Sezon)";
    case "special": return "Özel";
    case "short": return "Short";
    case "tv_movie": return "TV Filmi";
    case "serial": return "Serial";
    default: return kind || "";
  }
}

function createToolbar(progressText, pct){
  const bar = document.createElement("div");
  bar.className = "toolbar";

  const left = document.createElement("div");
  left.className = "progress";
  const t = document.createElement("div");
  t.className = "progress__text";
  t.textContent = progressText;
  const pb = document.createElement("div");
  pb.className = "progress__bar";
  const fill = document.createElement("div");
  fill.style.width = `${pct}%`;
  pb.appendChild(fill);
  left.appendChild(t);
  left.appendChild(pb);

  const right = document.createElement("div");
  right.className = "smallMuted";
  right.textContent = "Poster + Bölüm listesi OMDb’den çekilir";

  bar.appendChild(left);
  bar.appendChild(right);
  return bar;
}

function renderHome(){
  app.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "grid";

  const m = document.createElement("div");
  m.className = "tile";
  m.innerHTML = `<div class="tile__title">Marvel</div><div class="tile__sub">MCU • Mutant • Sony • Void • LEGO • Klasiks • Animated • Anime</div>`;
  m.addEventListener("click", () => setRoute({ page:"universe", universe:"marvel", category:null }));

  const s = document.createElement("div");
  s.className = "tile";
  s.innerHTML = `<div class="tile__title">Star Wars</div><div class="tile__sub">Canon • Non-Canon • Vintage • LEGO</div>`;
  s.addEventListener("click", () => setRoute({ page:"universe", universe:"starwars", category:null }));

  grid.appendChild(m);
  grid.appendChild(s);
  app.appendChild(grid);
}

function renderUniverse(){
  app.innerHTML = "";
  const u = COLLECTIONS[route.universe];

  const grid = document.createElement("div");
  grid.className = "grid";

  for(const c of u.categories){
    const t = document.createElement("div");
    t.className = "tile";
    t.innerHTML = `<div class="tile__title">${c.title}</div><div class="tile__sub">Listeyi aç</div>`;
    t.addEventListener("click", () => setRoute({ page:"list", universe:route.universe, category:c.key }));
    grid.appendChild(t);
  }

  app.appendChild(grid);
}

function toggleWatchedItem(itemId){
  state.watchedItems[itemId] = !state.watchedItems[itemId];
  saveState();
  render();
}

function toggleEpisode(epImdbId){
  state.watchedEpisodes[epImdbId] = !state.watchedEpisodes[epImdbId];
  saveState();
  render(); // re-evaluate completion
}

function watchSearch(title){
  const q = encodeURIComponent(title + " izle");
  window.open("https://www.google.com/search?q=" + q, "_blank");
}

/** OMDb helpers */
async function omdbGet(params){
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", OMDB_API_KEY);
  for(const [k,v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  return await res.json();
}

function keyTitle(t){ return (t || "").trim().toLowerCase(); }

async function ensureShow(baseTitle){
  const k = keyTitle(baseTitle);
  if(state.showCache[k]) return state.showCache[k];

  // First try exact title
  let j = await omdbGet({ t: baseTitle, type: "series" });
  if(j && j.Response === "True"){
    state.showCache[k] = { imdbID: j.imdbID, totalSeasons: Number(j.totalSeasons || 0), poster: j.Poster, type: j.Type };
    if(j.Poster && j.Poster !== "N/A") state.posterCache[j.imdbID] = j.Poster;
    saveState();
    return state.showCache[k];
  }

  // fallback: search
  j = await omdbGet({ s: baseTitle, type:"series" });
  if(j && j.Response === "True" && j.Search?.length){
    const first = j.Search[0];
    const full = await omdbGet({ i: first.imdbID });
    state.showCache[k] = { imdbID: full.imdbID, totalSeasons: Number(full.totalSeasons || 0), poster: full.Poster, type: full.Type };
    if(full.Poster && full.Poster !== "N/A") state.posterCache[full.imdbID] = full.Poster;
    saveState();
    return state.showCache[k];
  }

  state.showCache[k] = { imdbID: null, totalSeasons: 0, poster: null, type: "series" };
  saveState();
  return state.showCache[k];
}

async function ensurePosterForTitle(title){
  const k = keyTitle(title);
  if(state.posterCache[k]) return state.posterCache[k];

  // try movie/series/special
  let j = await omdbGet({ t: title });
  if(j && j.Response === "True" && j.Poster && j.Poster !== "N/A"){
    state.posterCache[k] = j.Poster;
    state.posterCache[j.imdbID] = j.Poster;
    saveState();
    return j.Poster;
  }

  // fallback search
  j = await omdbGet({ s: title });
  if(j && j.Response === "True" && j.Search?.length){
    const first = j.Search[0];
    if(first.Poster && first.Poster !== "N/A"){
      state.posterCache[k] = first.Poster;
      state.posterCache[first.imdbID] = first.Poster;
      saveState();
      return first.Poster;
    }
  }

  state.posterCache[k] = "";
  saveState();
  return "";
}

async function ensureSeasonEpisodes(imdbID, seasonNumber){
  const cacheKey = `${imdbID}_S${seasonNumber}`;
  if(state.seasonCache[cacheKey]) return state.seasonCache[cacheKey];

  const j = await omdbGet({ i: imdbID, Season: String(seasonNumber) });
  if(j && j.Response === "True" && Array.isArray(j.Episodes)){
    state.seasonCache[cacheKey] = { season: seasonNumber, episodes: j.Episodes };
    saveState();
    return state.seasonCache[cacheKey];
  }

  state.seasonCache[cacheKey] = { season: seasonNumber, episodes: [] };
  saveState();
  return state.seasonCache[cacheKey];
}

function seasonCompleted(episodes){
  if(!episodes?.length) return false;
  return episodes.every(ep => !!state.watchedEpisodes[ep.imdbID]);
}

function computeSimpleProgress(items){
  // counts item-level completion only; episodes are included once loaded/expanded
  const total = items.length;
  const done = items.filter(it => isItemDone(it)).length;
  const pct = total ? Math.round(done/total*100) : 0;
  return { total, done, pct };
}

function isItemDone(it){
  if(it.kind === "series_season"){
    // if episodes loaded, completion is episode-based; if not loaded, fallback to watchedItems
    const showKey = keyTitle(it.baseTitle);
    const show = state.showCache[showKey];
    if(show?.imdbID){
      const ck = `${show.imdbID}_S${it.season}`;
      const sc = state.seasonCache[ck];
      if(sc?.episodes?.length) return seasonCompleted(sc.episodes);
    }
    return !!state.watchedItems[it.id];
  }
  if(it.kind === "series"){
    // If episodes known for all seasons (after load), compute; otherwise watchedItems fallback
    return !!state.watchedItems[it.id];
  }
  return !!state.watchedItems[it.id];
}

async function renderList(){
  app.innerHTML = "";

  const u = COLLECTIONS[route.universe];
  const items = u.libs[route.category] || [];

  const p = computeSimpleProgress(items);
  app.appendChild(createToolbar(`${p.done}/${p.total} tamamlandı (%${p.pct})`, p.pct));

  const list = document.createElement("div");
  list.className = "list";

  for(const it of items){
    const card = document.createElement("div");
    card.className = "item";

    const main = document.createElement("div");
    main.className = "item__main";

    // poster
    const posterBox = document.createElement("div");
    posterBox.className = "poster";
    const img = document.createElement("img");
    img.alt = it.title;
    img.loading = "lazy";
    img.src = ""; // set after fetch
    posterBox.appendChild(img);

    // meta
    const meta = document.createElement("div");
    meta.className = "item__meta";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = it.title;
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = kindLabel(it.kind);
    meta.appendChild(title);
    meta.appendChild(sub);

    // actions
    const actions = document.createElement("div");
    actions.className = "actions";

    const done = isItemDone(it);
    const btnW = document.createElement("button");
    btnW.className = "btn " + (done ? "green" : "ghost");
    btnW.textContent = done ? "Tamamlandı ✅" : "İzlenmedi ⬜";
    btnW.addEventListener("click", () => toggleWatchedItem(it.id));

    const btnPlay = document.createElement("button");
    btnPlay.className = "btn blue";
    btnPlay.textContent = "İzle ▶";
    btnPlay.addEventListener("click", () => watchSearch(it.baseTitle || it.title));

    actions.appendChild(btnW);
    actions.appendChild(btnPlay);

    // expand for series/season
    const canExpand = (it.kind === "series" || it.kind === "series_season");
    if(canExpand){
      const btnE = document.createElement("button");
      btnE.className = "btn";
      btnE.textContent = expanded.has(it.id) ? "Bölümleri Kapat" : "Bölümleri Aç";
      btnE.addEventListener("click", async () => {
        if(expanded.has(it.id)) expanded.delete(it.id);
        else expanded.add(it.id);
        render(); // re-render will fetch episodes if needed
      });
      actions.appendChild(btnE);
    }

    main.appendChild(posterBox);
    main.appendChild(meta);
    main.appendChild(actions);
    card.appendChild(main);

    // poster fetch (non-blocking)
    (async () => {
      const poster = await ensurePosterForTitle(it.baseTitle || it.title);
      if(poster) img.src = poster;
    })();

    // episodes section
    if(canExpand && expanded.has(it.id)){
      const eps = document.createElement("div");
      eps.className = "episodes";
      eps.innerHTML = `<div class="smallMuted">Bölümler yükleniyor...</div>`;
      card.appendChild(eps);

      (async () => {
        eps.innerHTML = "";

        if(it.kind === "series_season"){
          const show = await ensureShow(it.baseTitle);
          if(!show?.imdbID){
            eps.innerHTML = `<div class="smallMuted">Bu dizi OMDb’de bulunamadı: ${it.baseTitle}</div>`;
            return;
          }
          const seasonData = await ensureSeasonEpisodes(show.imdbID, it.season);

          if(!seasonData.episodes.length){
            eps.innerHTML = `<div class="smallMuted">Sezon bölümleri bulunamadı (OMDb).</div>`;
            return;
          }

          for(const ep of seasonData.episodes){
            const row = document.createElement("div");
            row.className = "epRow";

            const left = document.createElement("div");
            const code = document.createElement("div");
            code.className = "epCode";
            code.textContent = `S${String(it.season).padStart(2,"0")}E${String(ep.Episode).padStart(2,"0")}`;
            const nm = document.createElement("div");
            nm.className = "epTitle";
            nm.textContent = ep.Title;
            left.appendChild(code);
            left.appendChild(nm);

            const b = document.createElement("button");
            const w = !!state.watchedEpisodes[ep.imdbID];
            b.className = "btn " + (w ? "green" : "ghost");
            b.textContent = w ? "İzlendi ✅" : "İzlenmedi ⬜";
            b.addEventListener("click", () => toggleEpisode(ep.imdbID));

            row.appendChild(left);
            row.appendChild(b);
            eps.appendChild(row);
          }

          // auto collapse if season done
          if(seasonCompleted(seasonData.episodes)){
            expanded.delete(it.id);
          }
          return;
        }

        // kind === "series" (all seasons)
        const show = await ensureShow(it.title);
        if(!show?.imdbID){
          eps.innerHTML = `<div class="smallMuted">Bu dizi OMDb’de bulunamadı: ${it.title}</div>`;
          return;
        }

        const total = show.totalSeasons || 0;
        if(!total){
          eps.innerHTML = `<div class="smallMuted">Sezon bilgisi bulunamadı (OMDb).</div>`;
          return;
        }

        for(let s=1; s<=total; s++){
          const seasonData = await ensureSeasonEpisodes(show.imdbID, s);

          const sec = document.createElement("div");
          sec.style.margin = "8px 0 12px";
          sec.innerHTML = `<div class="smallMuted">Season ${s}</div>`;
          eps.appendChild(sec);

          for(const ep of seasonData.episodes){
            const row = document.createElement("div");
            row.className = "epRow";

            const left = document.createElement("div");
            const code = document.createElement("div");
            code.className = "epCode";
            code.textContent = `S${String(s).padStart(2,"0")}E${String(ep.Episode).padStart(2,"0")}`;
            const nm = document.createElement("div");
            nm.className = "epTitle";
            nm.textContent = ep.Title;
            left.appendChild(code);
            left.appendChild(nm);

            const b = document.createElement("button");
            const w = !!state.watchedEpisodes[ep.imdbID];
            b.className = "btn " + (w ? "green" : "ghost");
            b.textContent = w ? "İzlendi ✅" : "İzlenmedi ⬜";
            b.addEventListener("click", () => toggleEpisode(ep.imdbID));

            row.appendChild(left);
            row.appendChild(b);
            eps.appendChild(row);
          }
        }
      })();
    }

    list.appendChild(card);
  }

  app.appendChild(list);
}

function render(){
  renderCrumbs();

  if(route.page === "home") return renderHome();
  if(route.page === "universe") return renderUniverse();
  if(route.page === "list") return renderList();
  renderHome();
}

render();
