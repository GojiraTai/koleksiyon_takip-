import MCU from "./data/marvel/mcu.collection.js";

const OMDB_API_KEY = "a57784cc";
const STORAGE_KEY = "nova_koleksiyon_v2";

const $ = (id) => document.getElementById(id);

const screens = {
  home: $("screen-home"),
  marvel: $("screen-marvel"),
  list: $("screen-list"),
  season: $("screen-season"),
};

function showScreen(name){
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
}

function normalizeTitle(t){
  return (t || "").trim();
}

async function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return { watched: {}, epWatched: {} };
  try { return JSON.parse(raw); } catch { return { watched: {}, epWatched: {} }; }
}
async function saveState(state){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function makeId(prefix, title){
  return prefix + "_" + title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
}

/**
 * OMDb helpers
 */
const omdbCacheByTitle = new Map(); // title -> { imdbID, Type, Poster, totalSeasons }
const omdbCacheSeason = new Map();  // imdbID|season -> { Episodes: [...] }

async function omdbByTitle(title){
  const key = normalizeTitle(title);
  if(omdbCacheByTitle.has(key)) return omdbCacheByTitle.get(key);

  const url = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const json = await res.json();

  // Bazı One-Shot / özel içerikler OMDb'de bulunmayabilir.
  const data = (json && json.Response === "True") ? json : null;

  if(data){
    const out = {
      imdbID: data.imdbID,
      type: data.Type, // movie / series
      poster: data.Poster,
      totalSeasons: data.totalSeasons ? Number(data.totalSeasons) : null,
      year: data.Year || null
    };
    omdbCacheByTitle.set(key, out);
    return out;
  }

  omdbCacheByTitle.set(key, null);
  return null;
}

function omdbPosterUrl(imdbID){
  // IMDb hotlink değil, OMDb'nin image endpointi:
  return `https://img.omdbapi.com/?apikey=${OMDB_API_KEY}&i=${encodeURIComponent(imdbID)}&h=600`;
}

async function omdbSeasonEpisodes(imdbID, seasonNumber){
  const cacheKey = `${imdbID}|${seasonNumber}`;
  if(omdbCacheSeason.has(cacheKey)) return omdbCacheSeason.get(cacheKey);

  const url = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&i=${encodeURIComponent(imdbID)}&Season=${seasonNumber}`;
  const res = await fetch(url);
  const json = await res.json();
  if(json && json.Response === "True" && Array.isArray(json.Episodes)){
    omdbCacheSeason.set(cacheKey, json.Episodes);
    return json.Episodes;
  }
  omdbCacheSeason.set(cacheKey, []);
  return [];
}

/**
 * Rendering
 */
let currentList = [];
let currentListTitle = "MCU";
let prevScreen = "home";

function computeProgress(state, items){
  // Movie/short/special: 1 birim
  // Season: episode sayısı kadar (yoksa 1 kabul)
  let done = 0;
  let total = 0;

  for(const it of items){
    if(it.kind === "season"){
      // epWatched: key = itemId|epIndex
      const seasonKey = it.id;
      const eps = it._episodesCount || 0;
      const seasonTotal = eps > 0 ? eps : 1;
      total += seasonTotal;

      if(eps > 0){
        for(let i=0;i<eps;i++){
          const k = `${seasonKey}|${i}`;
          if(state.epWatched[k]) done += 1;
        }
      } else {
        if(state.watched[seasonKey]) done += 1;
      }
    } else {
      total += 1;
      if(state.watched[it.id]) done += 1;
    }
  }

  const pct = total ? Math.round((done/total)*100) : 0;
  return { done, total, pct };
}

async function ensurePostersAndSeasonCounts(items){
  // Liste kartları için poster ve sezon bölüm sayısı (dizi sezonu için) hazırlığı
  for(const it of items){
    if(it.kind === "season"){
      const info = await omdbByTitle(it.seriesTitle);
      if(info?.imdbID){
        it.imdbID = info.imdbID;
        it.posterUrl = omdbPosterUrl(info.imdbID);
      } else {
        it.posterUrl = ""; // fallback
      }

      // Sezon episode sayısını kabaca önden çekelim (liste progress doğru olsun)
      if(info?.imdbID){
        const eps = await omdbSeasonEpisodes(info.imdbID, it.seasonNumber);
        it._episodesCount = eps.length;
      } else {
        it._episodesCount = 0;
      }
    } else {
      const info = await omdbByTitle(it.title);
      if(info?.imdbID){
        it.imdbID = info.imdbID;
        it.posterUrl = omdbPosterUrl(info.imdbID);
      } else {
        it.posterUrl = "";
      }
    }
  }
}

function kindLabel(kind){
  switch(kind){
    case "movie": return "Film";
    case "short": return "Kısa";
    case "special": return "Özel";
    case "oneshot": return "One-Shot";
    case "season": return "Sezon";
    default: return kind;
  }
}

async function renderList(){
  const state = await loadState();
  const listEl = $("list");
  listEl.innerHTML = "";

  await ensurePostersAndSeasonCounts(currentList);

  const prog = computeProgress(state, currentList);
  $("progressFill").style.width = `${prog.pct}%`;
  $("progressText").textContent = `${prog.pct}%`;
  $("list-title").textContent = currentListTitle;

  for(const it of currentList){
    const card = document.createElement("div");
    card.className = "card";

    const img = document.createElement("img");
    img.className = "poster";
    img.alt = it.title;
    img.src = it.posterUrl || "";
    img.onerror = () => { img.style.display = "none"; };

    const main = document.createElement("div");
    main.className = "cardMain";

    const title = document.createElement("div");
    title.className = "cardTitle";
    title.textContent = it.kind === "season"
      ? `${it.seriesTitle} (Sezon ${it.seasonNumber})`
      : it.title;

    const meta = document.createElement("div");
    meta.className = "cardMeta";
    meta.textContent = `${kindLabel(it.kind)}`;

    main.appendChild(title);
    main.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "actions";

    // izledim/izlemedim
    const watched = !!state.watched[it.id];

    if(it.kind === "season"){
      // Sezonlarda izleme durumu episode üzerinden, ama yine de "hepsini izledim" pratik butonu olsun
      const badge = document.createElement("div");
      badge.className = "badge";

      const eps = it._episodesCount || 0;
      if(eps > 0){
        let done = 0;
        for(let i=0;i<eps;i++){
          if(state.epWatched[`${it.id}|${i}`]) done++;
        }
        badge.textContent = `${done}/${eps} bölüm`;
      } else {
        badge.textContent = watched ? "Tamamlandı" : "Başlamadın";
      }
      actions.appendChild(badge);

      const open = document.createElement("button");
      open.className = "btn primary";
      open.textContent = "Aç";
      open.onclick = async () => openSeason(it);
      actions.appendChild(open);

      const markAll = document.createElement("button");
      markAll.className = watched ? "btn" : "btn ok";
      markAll.textContent = watched ? "Sıfırla" : "Hepsi izlendi";
      markAll.onclick = async () => {
        const st = await loadState();
        const eps2 = it._episodesCount || 0;
        if(eps2 > 0){
          if(watched){
            for(let i=0;i<eps2;i++) delete st.epWatched[`${it.id}|${i}`];
            st.watched[it.id] = false;
          } else {
            for(let i=0;i<eps2;i++) st.epWatched[`${it.id}|${i}`] = true;
            st.watched[it.id] = true;
          }
        } else {
          st.watched[it.id] = !watched;
        }
        await saveState(st);
        await renderList();
      };
      actions.appendChild(markAll);

    } else {
      const badge = document.createElement("div");
      badge.className = "badge";
      badge.textContent = watched ? "İzlendi ✅" : "İzlenmedi";
      actions.appendChild(badge);

      const toggle = document.createElement("button");
      toggle.className = watched ? "btn" : "btn ok";
      toggle.textContent = watched ? "Geri al" : "İzledim";
      toggle.onclick = async () => {
        const st = await loadState();
        st.watched[it.id] = !watched;
        await saveState(st);
        await renderList();
      };
      actions.appendChild(toggle);

      const search = document.createElement("button");
      search.className = "btn";
      search.textContent = "İzle";
      search.onclick = () => {
        const q = encodeURIComponent(it.title);
        window.open(`https://www.google.com/search?q=${q}+izle`, "_blank");
      };
      actions.appendChild(search);
    }

    card.appendChild(img);
    card.appendChild(main);
    card.appendChild(actions);
    listEl.appendChild(card);
  }
}

async function openSeason(item){
  const st = await loadState();

  $("season-title").textContent = `${item.seriesTitle} • Sezon ${item.seasonNumber}`;
  $("season-meta").textContent = `Bölümler OMDb’den çekiliyor…`;
  $("episodes").innerHTML = "";

  showScreen("season");

  const eps = (item.imdbID)
    ? await omdbSeasonEpisodes(item.imdbID, item.seasonNumber)
    : [];

  const total = eps.length;

  $("season-meta").textContent = total
    ? `${total} bölüm`
    : `Bölüm listesi bulunamadı (OMDb’de yok olabilir).`;

  // episode list
  for(let i=0;i<eps.length;i++){
    const e = eps[i]; // { Title, Released, Episode, imdbRating, imdbID }
    const key = `${item.id}|${i}`;
    const watched = !!st.epWatched[key];

    const row = document.createElement("div");
    row.className = "ep";

    const main = document.createElement("div");
    main.className = "epMain";

    const t = document.createElement("div");
    t.className = "epTitle";
    t.textContent = `${e.Episode}. ${e.Title}`;

    const sub = document.createElement("div");
    sub.className = "epSub";
    sub.textContent = watched ? "İzlendi ✅" : "İzlenmedi";

    main.appendChild(t);
    main.appendChild(sub);

    const btn = document.createElement("button");
    btn.className = watched ? "btn" : "btn ok";
    btn.textContent = watched ? "Geri al" : "İzledim";
    btn.onclick = async () => {
      const st2 = await loadState();
      st2.epWatched[key] = !watched;

      // Sezon tamamlandı mı?
      const epsNow = await omdbSeasonEpisodes(item.imdbID, item.seasonNumber);
      let all = true;
      for(let j=0;j<epsNow.length;j++){
        if(!st2.epWatched[`${item.id}|${j}`]) { all = false; break; }
      }
      st2.watched[item.id] = all;

      await saveState(st2);
      await openSeason(item); // aynı ekranı yeniden çiz (kapatma yok)
    };

    row.appendChild(main);
    row.appendChild(btn);
    $("episodes").appendChild(row);
  }
}

/**
 * Navigation
 */
$("btn-marvel").onclick = () => { prevScreen = "home"; showScreen("marvel"); };
$("back-home").onclick = () => showScreen("home");

$("btn-mcu").onclick = async () => {
  prevScreen = "marvel";
  currentListTitle = "MCU";
  currentList = MCU;
  showScreen("list");
  await renderList();
};

$("back-prev").onclick = () => showScreen(prevScreen);
$("back-list").onclick = () => showScreen("list");

// initial
showScreen("home");
