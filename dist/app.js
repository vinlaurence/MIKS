// ============================================================
// miks — mood-based music. MusicBrainz provides broad recording metadata;
// Jamendo provides playable audio when an exact catalog match is available.
// ============================================================
import { firebaseReady, getCurrentUser, onAuthChange, signUp, signIn, signInWithGoogle, signOutUser, toggleFavorite as fbToggleFavorite, getFavorites, getPlaylists, savePlaylist, logMoodSession, getMoodHistory, analyzeMusicWithAI, searchMusicCatalog, recordAppOpen, getAdminDashboard, saveListeningEvent, getListeningHistory, getListeningEvents, getListeningInteractions, saveListeningInteraction, clearListeningHistory, } from "./firebase-service.js";
import { sendPasswordReset } from "./firebase-password-reset.js";
const PRIVACY_ACK_KEY = "miks.privacyAccepted.v2026-10-12.2";
const MOOD_CHIPS = [
    { label: "Happy", icon: "☼", tag: "happy" },
    { label: "Chill", icon: "≋", tag: "chillout" },
    { label: "Sad", icon: "▽", tag: "sad" },
    { label: "Focus", icon: "◉", tag: "instrumental" },
    { label: "Energetic", icon: "↑", tag: "electronic" },
    { label: "Sleep", icon: "☾", tag: "ambient" },
];
// Admin access is assigned to these signed-in email addresses.
const ADMIN_EMAILS = new Set([
    "vinlaurence1@gmail.com",
    "vinlaurenceadmin@gmail.com",
]);
let activityRecordedForUid = null;
let adminUsersCache = [];
let librarySearchTerm = "";
let librarySortOrder = "recent";
const DEFAULT_JAMENDO_CLIENT_ID = "cf7f4dac";
const PALETTES = [
    { id: "forest", name: "Forest", colors: ["#101311", "#202823", "#76bd85", "#80d890"], lightBg: "#f2f8f3", lightSurface: "#e2eee4", darkBg: "#101311", darkSurface: "#202823" },
    { id: "ocean", name: "Ocean", colors: ["#0c141b", "#172833", "#43b6c8", "#8de4ed"], lightBg: "#eff8fa", lightSurface: "#dceff2", darkBg: "#0c141b", darkSurface: "#172833" },
    { id: "lavender", name: "Lavender", colors: ["#15111b", "#262033", "#ac83e6", "#d1b4ff"], lightBg: "#f7f3fc", lightSurface: "#ebe2f7", darkBg: "#15111b", darkSurface: "#262033" },
    { id: "sunset", name: "Sunset", colors: ["#1b110e", "#30201b", "#e28b59", "#ffc18e"], lightBg: "#fff5ef", lightSurface: "#f5e3d8", darkBg: "#1b110e", darkSurface: "#30201b" },
    { id: "rose", name: "Rose", colors: ["#1a1015", "#2d1c25", "#df779e", "#ffb4cd"], lightBg: "#fff3f7", lightSurface: "#f4e0e8", darkBg: "#1a1015", darkSurface: "#2d1c25" },
    { id: "black-gold", name: "Black & Gold", colors: ["#050505", "#211800", "#e6a900", "#ffe27a"], lightBg: "#fbf0c5", lightSurface: "#f1dfa0", darkBg: "#050505", darkSurface: "#1c1604" },
];
const storedThemeMode = localStorage.getItem("miks.themeMode");
let themeMode = storedThemeMode === "light" ? "light" : "dark";
if (storedThemeMode !== "light" && storedThemeMode !== "dark")
    localStorage.setItem("miks.themeMode", "dark");
let selectedPaletteId = localStorage.getItem("miks.colorPalette") || "forest";
let installPrompt = null;
function isInstalledApp() {
    return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}
function refreshInstallButton() {
    const label = $("install-app-label");
    const note = $("install-app-note");
    if (isInstalledApp()) {
        label.textContent = "Miks app installed";
        note.textContent = "You are using the installed app.";
    }
    else if (installPrompt) {
        label.textContent = "Install Android app";
        note.textContent = "Use your browser prompt to install Miks on this device.";
    }
}
async function handleInstallApp() {
    if (isInstalledApp()) {
        showToast("Miks is already installed on this device");
        return;
    }
    if (installPrompt) {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        installPrompt = null;
        refreshInstallButton();
        showToast(choice.outcome === "accepted" ? "Installing Miks…" : "Install cancelled");
        return;
    }
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    showToast(isIos ? "Safari: tap Share, then Add to Home Screen" : "Chrome: open ⋮ menu, then tap Install app");
}
function isAdmin(user) {
    return user?.emailVerified === true
        && !!user?.email
        && ADMIN_EMAILS.has(String(user.email).toLowerCase());
}
function updateBrandLogos(tileColor, markColor) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="1" y="1" width="62" height="62" rx="14" fill="${tileColor}"/><path d="M15 14c4 2 8 2 12-2 4 3 8 3 12 0 4 4 8 4 12 2l4 8v17c-3 6-8 10-15 13l-8-2-8 2c-7-3-12-7-15-13V22z" fill="${markColor}"/><path d="M7 22c-3 2-4 5-4 9s1 7 4 9l4 2V20zm50 0c3 2 4 5 4 9s-1 7-4 9l-4 2V20z" fill="${markColor}"/><ellipse cx="32" cy="31" rx="16" ry="9" fill="${tileColor}"/><path d="m32 24 8 7-8 7-8-7z" fill="${markColor}"/><path d="m43 49 6-5-1 7-7 3z" fill="${markColor}"/></svg>`;
    const source = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    document.querySelectorAll(".mark img, .brand img, .sidebar-brand img").forEach((image) => {
        if (image.dataset.logoSource === source)
            return;
        image.classList.remove("logo-ready");
        image.dataset.logoSource = source;
        image.addEventListener("load", () => image.classList.add("logo-ready"), { once: true });
        image.src = source;
        if (image.complete && image.naturalWidth > 0)
            image.classList.add("logo-ready");
    });
}
function applyAppearance() {
    const palette = PALETTES.find((item) => item.id === selectedPaletteId) || PALETTES[0];
    const effectiveMode = themeMode;
    const root = document.documentElement;
    root.dataset.palette = palette.id;
    root.dataset.themeMode = themeMode;
    root.dataset.effectiveMode = effectiveMode;
    root.style.colorScheme = effectiveMode;
    root.style.setProperty("--theme-accent", palette.colors[2]);
    root.style.setProperty("--theme-highlight", palette.colors[3]);
    const logoTile = effectiveMode === "light" ? palette.lightSurface : palette.darkSurface;
    const logoMark = effectiveMode === "light" ? palette.darkBg : "#f7f7ef";
    root.style.setProperty("--logo-tile", logoTile);
    root.style.setProperty("--logo-mark-color", logoMark);
    updateBrandLogos(logoTile, logoMark);
    root.style.setProperty("--gold", effectiveMode === "dark" ? palette.colors[3] : palette.colors[2]);
    root.style.setProperty("--terracotta", palette.colors[2]);
    root.style.setProperty("--wine-950", effectiveMode === "dark" ? palette.darkBg : palette.lightBg);
    root.style.setProperty("--wine-900", effectiveMode === "dark" ? palette.darkSurface : palette.lightSurface);
    root.style.setProperty("--wine-800", effectiveMode === "dark" ? palette.darkSurface : palette.lightSurface);
    root.style.setProperty("--wine-700", effectiveMode === "dark" ? palette.darkSurface : palette.lightSurface);
    root.style.setProperty("--cream", effectiveMode === "dark" ? "#f4f7f4" : "#1a211c");
    root.style.setProperty("--cream-dim", effectiveMode === "dark" ? "#a5afa7" : "#59645c");
    root.style.setProperty("--glass", effectiveMode === "dark" ? "rgba(244,247,244,0.055)" : "rgba(20,35,24,0.045)");
    root.style.setProperty("--glass-strong", effectiveMode === "dark" ? "rgba(244,247,244,0.10)" : "rgba(20,35,24,0.085)");
    root.style.setProperty("--glass-border", effectiveMode === "dark" ? "rgba(244,247,244,0.12)" : "rgba(20,35,24,0.13)");
    const loginThemeToggle = document.getElementById("login-theme-toggle");
    const loginThemeIcon = document.getElementById("login-theme-icon");
    if (loginThemeToggle && loginThemeIcon) {
        const nextMode = effectiveMode === "dark" ? "light" : "dark";
        loginThemeIcon.textContent = effectiveMode === "dark" ? "☀" : "☾";
        loginThemeToggle.setAttribute("aria-label", `Switch to ${nextMode} mode`);
        loginThemeToggle.setAttribute("title", `Switch to ${nextMode} mode`);
    }
    renderAppearanceControls();
}
function updateAppearanceWithRipple(update, trigger) {
    const rect = trigger?.getBoundingClientRect();
    const originX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const originY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    document.querySelector(".theme-water-ripple")?.remove();
    const ripple = document.createElement("div");
    ripple.className = "theme-water-ripple";
    ripple.style.setProperty("--ripple-x", `${originX}px`);
    ripple.style.setProperty("--ripple-y", `${originY}px`);
    document.body.append(ripple);
    update();
    window.setTimeout(() => ripple.remove(), 1100);
}
function renderAppearanceControls() {
    const modeButtons = document.querySelectorAll("[data-theme-mode]");
    modeButtons.forEach((button) => {
        const selected = button.dataset.themeMode === themeMode;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-pressed", String(selected));
    });
    const holder = document.getElementById("palette-options");
    if (!holder)
        return;
    holder.innerHTML = PALETTES.map((palette) => `<button type="button" class="palette-option ${palette.id === selectedPaletteId ? "active" : ""}" data-palette-id="${palette.id}" aria-pressed="${palette.id === selectedPaletteId}" aria-label="${palette.name} color combination"><span class="palette-swatches">${palette.colors.map((color) => `<i style="--swatch:${color}"></i>`).join("")}</span><span>${palette.name}</span></button>`).join("");
    holder.querySelectorAll("[data-palette-id]").forEach((button) => button.addEventListener("click", () => {
        updateAppearanceWithRipple(() => {
            selectedPaletteId = button.dataset.paletteId || "forest";
            localStorage.setItem("miks.colorPalette", selectedPaletteId);
            applyAppearance();
        }, button);
    }));
}
const state = {
    route: "home",
    apiKey: localStorage.getItem("miks.jamendoClientId") || DEFAULT_JAMENDO_CLIENT_ID,
    queue: [],
    queueLabel: "",
    currentIndex: -1,
    isPlaying: false,
    activeChipTag: MOOD_CHIPS[1].tag,
    moodResults: [],
    moodAnalysis: null,
    trending: [],
    currentUser: null,
    authMode: "login",
    favoriteIds: new Set(),
    favoritesList: [],
    listeningEvents: [],
    listeningInteractions: [],
    selectedListeningDate: null,
    likedIds: new Set(JSON.parse(localStorage.getItem("miks.likedTrackIds") || "[]")),
    savedPlaylists: [],
    history: [],
    moodHistory: [],
    aiSuggestions: [],
    shuffle: false,
    repeat: false,
};
// ---------- DOM refs ----------
const $ = (id) => document.getElementById(id);
const audioEl = $("audio-el");
let activeAudioTrack = null;
let lyricsTrackId = null;
let lyricsRecord = null;
let lyricsLines = [];
let lyricsLoadingTrackId = null;
let lyricsRequestToken = 0;
let lyricsLastActiveLine = -1;
let lyricsLastRequestAt = 0;
let lyricsRequestChain = Promise.resolve();
let lyricsRetryAfter = 0;
let allMusicPage = 1;
let allMusicPageSize = 50;
let allMusicRequestId = 0;
const screens = {
    home: $("screen-home"),
    discover: $("screen-discover"),
    "all-music": $("screen-all-music"),
    mood: $("screen-mood"),
    playlist: $("screen-playlist"),
    "now-playing": $("screen-now-playing"),
    favorites: $("screen-favorites"),
    profile: $("screen-profile"),
    settings: $("screen-settings"),
    admin: $("screen-admin"),
};
// ---------- Router ----------
function navigate(route) {
    state.route = route;
    $("mini-player").classList.toggle("hidden-in-now-playing", route === "now-playing");
    Object.keys(screens).forEach((r) => {
        screens[r].classList.toggle("visible", r === route);
    });
    $("screen-login").classList.remove("visible");
    document.querySelectorAll(".nav-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.route === route);
    });
    $("bottom-nav").style.display = "flex";
    if (route === "mood")
        renderMood();
    if (route === "playlist")
        renderPlaylist();
    if (route === "now-playing")
        renderNowPlaying();
    if (route === "favorites")
        renderFavorites();
    if (route === "discover")
        renderDiscover();
    if (route === "all-music")
        void loadAllMusicPage();
    if (route === "profile")
        renderProfile();
    if (route === "admin")
        void renderAdminDashboard();
    if (route === "home")
        renderHomeSections();
}
function showLogin() {
    Object.keys(screens).forEach((route) => screens[route].classList.remove("visible"));
    $("screen-login").classList.add("visible");
    $("bottom-nav").style.display = "none";
}
function openNowPlaying() {
    navigate("now-playing");
    const screen = $("screen-now-playing");
    screen.classList.remove("player-expand-enter");
    void screen.offsetWidth;
    screen.classList.add("player-expand-enter");
    window.setTimeout(() => screen.classList.remove("player-expand-enter"), 620);
}
function showToast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    window.setTimeout(() => t.classList.remove("show"), 2200);
}
function todayKey() {
    return localDateKey(new Date());
}
function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
// ---------- Jamendo Christian music catalog ----------
const PLAYLIST_STORAGE = "miks.savedPlaylists";
const LIKES_STORAGE = "miks.likedTrackIds";
const JAMENDO_BASE = "https://api.jamendo.com/v3.0/tracks/";
const MOOD_MIX_CANDIDATE_LIMIT = 200;
const previousMoodMixIds = new Map();
async function jamendoRequest(params) {
    try {
        const query = new URLSearchParams({
            client_id: state.apiKey,
            format: "json",
            limit: "12",
            audioformat: "mp32",
            include: "musicinfo",
            // Keep every discovery surface within the Christian-tagged catalog.
            tags: "christian",
            ...params,
        });
        const response = await fetch(`${JAMENDO_BASE}?${query.toString()}`);
        const data = await response.json();
        if (data.headers.status !== "success") {
            showToast(data.headers.error_message || "Jamendo request failed.");
            return { ...data, results: [] };
        }
        return data;
    }
    catch {
        showToast("Couldn't reach Jamendo. Check your connection.");
        return { headers: { status: "error", code: 0, error_message: "Network request failed" }, results: [] };
    }
}
async function jamendoSearch(params) {
    return (await jamendoRequest(params)).results;
}
function searchByTag(tag) {
    return jamendoSearch({ tags: `christian+${tag}`, order: "popularity_total" });
}
async function searchRandomMoodMix(params, key) {
    const tracks = await jamendoSearch({ ...params, limit: String(MOOD_MIX_CANDIDATE_LIMIT) });
    if (tracks.length < 2)
        return tracks;
    // Avoid showing the same set again when someone leaves a mood and picks it again.
    const previousIds = previousMoodMixIds.get(key) || new Set();
    const unseen = tracks.filter((track) => !previousIds.has(String(track.id)));
    const candidates = unseen.length >= Math.min(12, tracks.length) ? unseen : tracks;
    // Jamendo returns a stable popularity order, so shuffle its larger result pool locally.
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const mix = candidates.slice(0, 12);
    previousMoodMixIds.set(key, new Set(mix.map((track) => String(track.id))));
    return mix;
}
function normalizedCredit(value) {
    return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}
async function searchFullMusicCatalog(query) {
    const title = `Results for “${query}”`;
    const holder = $("search-results");
    const [catalogResult, jamendoResult] = await Promise.allSettled([
        searchMusicCatalog(query),
        jamendoSearch({ search: query, order: "relevance" }),
    ]);
    const jamendoTracks = jamendoResult.status === "fulfilled" ? jamendoResult.value : [];
    if (catalogResult.status === "rejected") {
        showToast("Global catalog unavailable; showing Jamendo matches.");
        renderSearchResults(jamendoTracks, title);
        return;
    }
    try {
        const recordings = catalogResult.value;
        const exactTracks = new Map();
        for (const track of jamendoTracks)
            exactTracks.set(`${normalizedCredit(track.name)}::${normalizedCredit(track.artist_name)}`, track);
        const catalogResults = recordings.map((recording) => ({
            ...recording,
            playableTrack: exactTracks.get(`${normalizedCredit(recording.title)}::${normalizedCredit(recording.artist)}`),
        }));
        const playables = catalogResults.filter((recording) => recording.playableTrack);
        $("search-results-title").textContent = title;
        holder.innerHTML = `<div class="catalog-summary">${catalogResults.length} MusicBrainz recordings · ${playables.length} exact Jamendo playback matches</div>${catalogResults.length ? catalogResults.map((recording) => {
            const cover = recording.playableTrack?.album_image || recording.playableTrack?.image;
            const date = recording.firstReleaseDate ? ` · ${escapeHtml(recording.firstReleaseDate)}` : "";
            const seconds = Math.floor(recording.duration / 1000);
            const duration = seconds > 0 ? ` · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "";
            return `<article class="catalog-result">${cover ? `<img class="catalog-cover" src="${escapeHtml(cover)}" alt="" loading="lazy">` : `<div class="catalog-cover catalog-cover-empty">♪</div>`}<div class="catalog-details"><strong class="catalog-title">${escapeHtml(recording.title)}</strong><span class="catalog-artist">${escapeHtml(recording.artist)}</span><span class="catalog-meta">MusicBrainz${date}${duration}${recording.disambiguation ? ` · ${escapeHtml(recording.disambiguation)}` : ""}</span></div><div class="catalog-actions">${recording.playableTrack ? `<button class="catalog-play" type="button" data-catalog-play="${escapeHtml(recording.id)}">Play</button>` : `<span class="catalog-unavailable">Metadata only</span>`}<a class="catalog-link" href="${escapeHtml(recording.url)}" target="_blank" rel="noopener noreferrer">Details</a></div></article>`;
        }).join("") : `<div class="empty-note">No recordings found. Try another artist or title.</div>`}`;
        const byId = new Map(catalogResults.map((recording) => [recording.id, recording]));
        holder.querySelectorAll("[data-catalog-play]").forEach((button) => {
            button.addEventListener("click", () => {
                const recording = byId.get(button.dataset.catalogPlay || "");
                if (!recording?.playableTrack)
                    return;
                const playableQueue = playables.map((item) => item.playableTrack);
                const index = playableQueue.findIndex((track) => track.id === recording.playableTrack.id);
                setQueue(playableQueue, title);
                playIndex(index);
                navigate("playlist");
            });
        });
    }
    catch (error) {
        $("search-results-title").textContent = title;
        holder.innerHTML = `<div class="empty-note">${escapeHtml(error?.message || "The music catalog is unavailable. Check your connection and try again.")}</div>`;
    }
}
async function loadAllMusicPage() {
    const requestId = ++allMusicRequestId;
    const holder = $("all-music-results");
    const prev = $("all-music-prev");
    const next = $("all-music-next");
    const label = $("all-music-page-label");
    prev.disabled = allMusicPage <= 1;
    next.disabled = true;
    label.textContent = `Page ${allMusicPage} · loading`;
    holder.innerHTML = `<div class="loading-spinner"></div>`;
    const response = await jamendoRequest({ limit: String(allMusicPageSize), offset: String((allMusicPage - 1) * allMusicPageSize), order: "popularity_total", fullcount: "true" });
    if (requestId !== allMusicRequestId)
        return;
    const tracks = response.results;
    const total = Number(response.headers.results_fullcount);
    label.textContent = Number.isFinite(total) && total >= 0
        ? `Page ${allMusicPage} of ${Math.ceil(total / allMusicPageSize)} · ${tracks.length} tracks`
        : `Page ${allMusicPage} · ${tracks.length} tracks`;
    next.disabled = Number.isFinite(total) && total >= 0
        ? allMusicPage * allMusicPageSize >= total
        : tracks.length < allMusicPageSize;
    if (!tracks.length && allMusicPage > 1) {
        allMusicPage = Math.max(1, allMusicPage - 1);
        void loadAllMusicPage();
        return;
    }
    holder.innerHTML = tracks.length ? tracks.map((track, i) => trackRow(track, i, false)).join("") : `<div class="empty-note">No tracks found on this page.</div>`;
    wireTrackRows(holder, tracks, (i) => { setQueue(tracks, `All Music · Page ${allMusicPage}`); playIndex(i); navigate("playlist"); });
}
const SAFE_MUSIC_TAGS = new Set(["acoustic", "ambient", "chillout", "classical", "country", "electronic", "folk", "gospel", "hiphop", "indie", "instrumental", "jazz", "metal", "piano", "pop", "relax", "rock", "soul", "soundtrack", "world"]);
function fallbackMoodMapping(prompt) {
    const text = prompt.toLowerCase();
    if (/stress|anxious|overwhelm|calm|quiet|peace/.test(text))
        return { primary_mood: "calm", tempo: "slow", energy: "low", acoustic_profile: "soft, spacious and gentle", recommended_tags: ["ambient", "acoustic", "piano"] };
    if (/sad|grief|heartbreak|lonely|down/.test(text))
        return { primary_mood: "reflective", tempo: "slow", energy: "low", acoustic_profile: "warm and unhurried", recommended_tags: ["acoustic", "piano", "folk"] };
    if (/focus|study|school|work|concentrat/.test(text))
        return { primary_mood: "focused", tempo: "moderate", energy: "medium", acoustic_profile: "steady with few distractions", recommended_tags: ["instrumental", "ambient", "piano"] };
    if (/happy|joy|excited|celebrat|uplift/.test(text))
        return { primary_mood: "uplifting", tempo: "fast", energy: "high", acoustic_profile: "bright and energetic", recommended_tags: ["pop", "gospel", "rock"] };
    return { primary_mood: "hopeful", tempo: "moderate", energy: "medium", acoustic_profile: "warm and balanced", recommended_tags: ["acoustic", "folk", "pop"] };
}
async function mapMoodToMusic(prompt) {
    if (!state.currentUser) {
        showToast("Sign in for semantic AI matching; using quick mood matching.");
        return fallbackMoodMapping(prompt);
    }
    try {
        const result = await analyzeMusicWithAI({ mode: "mood", prompt });
        const recommended_tags = Array.isArray(result.recommended_tags)
            ? result.recommended_tags.map((tag) => String(tag).toLowerCase()).filter((tag) => SAFE_MUSIC_TAGS.has(tag)).slice(0, 4)
            : [];
        return { ...fallbackMoodMapping(prompt), ...result, recommended_tags: recommended_tags.length ? recommended_tags : fallbackMoodMapping(prompt).recommended_tags };
    }
    catch (error) {
        showToast(error?.message || "AI mapping unavailable; using mood matching.");
        return fallbackMoodMapping(prompt);
    }
}
async function createSemanticMoodMix(prompt, autoplay = false) {
    const cleanPrompt = prompt.trim().slice(0, 600);
    if (!cleanPrompt)
        return;
    state.activeChipTag = null;
    state.moodAnalysis = null;
    state.queueLabel = "Creating your Christian music mix…";
    $("mood-status").innerHTML = `<div class="loading-spinner"></div>`;
    const analysis = await mapMoodToMusic(cleanPrompt);
    state.moodAnalysis = analysis;
    const tags = analysis.recommended_tags.join("+");
    const tracks = await searchRandomMoodMix({ tags: "christian", fuzzytags: tags || "acoustic", order: "relevance" }, `semantic:${tags || "acoustic"}`);
    const label = `${analysis.primary_mood || "Your mood"} Christian mix`;
    state.queueLabel = label;
    state.moodResults = tracks;
    if (tracks.length) {
        await recordMoodSession(label);
        if (autoplay) {
            setQueue(tracks, label);
            playIndex(0);
            navigate("mood");
            return;
        }
    }
    renderMood();
}
// ---------- Player ----------
function setQueue(tracks, label) {
    state.queue = tracks;
    state.queueLabel = label;
    state.aiSuggestions = [];
    state.currentIndex = tracks.length ? 0 : -1;
    if (!tracks.length) {
        audioEl.pause();
        audioEl.removeAttribute("src");
        audioEl.load();
        activeAudioTrack = null;
        state.isPlaying = false;
    }
}
function getSavedPlaylists() {
    if (state.currentUser)
        return state.savedPlaylists;
    try {
        return JSON.parse(localStorage.getItem(PLAYLIST_STORAGE) || "[]");
    }
    catch {
        return [];
    }
}
async function loadPlaylists() {
    if (!state.currentUser)
        return;
    const cacheKey = `miks.account.${state.currentUser.uid}.playlists`;
    let cached = [];
    try {
        cached = JSON.parse(localStorage.getItem(cacheKey) || "[]");
    }
    catch {
        cached = [];
    }
    try {
        const remote = await getPlaylists(state.currentUser.uid);
        const merged = new Map();
        [...cached, ...remote].forEach((playlist) => merged.set(String(playlist.id || playlist.name), playlist));
        state.savedPlaylists = [...merged.values()];
        localStorage.setItem(cacheKey, JSON.stringify(state.savedPlaylists));
    }
    catch {
        state.savedPlaylists = cached;
    }
    renderSavedPlaylists();
}
function persistPlaylists(playlists) {
    if (state.currentUser) {
        state.savedPlaylists = playlists;
        localStorage.setItem(`miks.account.${state.currentUser.uid}.playlists`, JSON.stringify(playlists));
        void Promise.all(playlists.map((playlist) => savePlaylist(state.currentUser.uid, playlist)));
    }
    else {
        localStorage.setItem(PLAYLIST_STORAGE, JSON.stringify(playlists));
    }
}
function renderSavedPlaylists() {
    const holder = $("saved-playlists");
    const allPlaylists = getSavedPlaylists();
    if (!allPlaylists.length) {
        holder.innerHTML = `<div class="empty-playlists">Create a playlist, then add songs you love.</div>`;
        return;
    }
    const query = librarySearchTerm.trim().toLocaleLowerCase();
    const playlists = allPlaylists
        .map((playlist, index) => ({ playlist, index }))
        .filter(({ playlist }) => playlist.name.toLocaleLowerCase().includes(query))
        .sort((a, b) => librarySortOrder === "name"
        ? a.playlist.name.localeCompare(b.playlist.name)
        : librarySortOrder === "tracks"
            ? b.playlist.tracks.length - a.playlist.tracks.length
            : b.index - a.index);
    if (!playlists.length) {
        holder.innerHTML = `<div class="empty-playlists">No playlists match “${escapeHtml(librarySearchTerm)}”.</div>`;
        return;
    }
    holder.innerHTML = playlists.map(({ playlist, index }) => `<button class="saved-playlist" data-playlist-index="${index}" aria-label="Play ${escapeHtml(playlist.name)}, ${playlist.tracks.length} songs">
      <span class="saved-playlist-icon" style="${playlist.tracks[0] ? `background-image:url('${escapeHtml(playlist.tracks[0].image || playlist.tracks[0].album_image)}')` : ""}">♫</span>
      <span class="saved-playlist-meta"><strong>${escapeHtml(playlist.name)}</strong><small>${playlist.tracks.length} ${playlist.tracks.length === 1 ? "song" : "songs"}</small></span>
      <span class="saved-playlist-open">›</span>
    </button>`).join("");
    holder.querySelectorAll(".saved-playlist").forEach((button) => {
        button.addEventListener("click", () => {
            const playlist = allPlaylists[Number(button.dataset.playlistIndex)];
            if (!playlist)
                return;
            state.aiSuggestions = [];
            setQueue(playlist.tracks, playlist.name);
            playIndex(0);
            navigate("playlist");
            renderPlaylist();
        });
    });
}
function createPlaylist() {
    if (!state.queue.length) {
        showToast("Play music first, then save its playlist");
        return;
    }
    const name = window.prompt("Playlist name", state.queueLabel || "My playlist")?.trim();
    if (!name)
        return;
    const playlists = getSavedPlaylists();
    if (playlists.some((playlist) => playlist.name.toLowerCase() === name.toLowerCase())) {
        showToast("That playlist already exists");
        return;
    }
    playlists.push({ id: String(Date.now()), name, tracks: [...state.queue] });
    persistPlaylists(playlists);
    renderSavedPlaylists();
    showToast(`Saved “${name}”`);
}
function createEmptyPlaylist() {
    const name = window.prompt("Playlist name", "My playlist")?.trim();
    if (!name)
        return;
    const playlists = getSavedPlaylists();
    if (playlists.some((playlist) => playlist.name.toLowerCase() === name.toLowerCase())) {
        showToast("That playlist already exists");
        return;
    }
    playlists.push({ id: String(Date.now()), name, tracks: [] });
    persistPlaylists(playlists);
    setQueue([], name);
    navigate("playlist");
    showToast(`Created “${name}”`);
}
function addCurrentTrackToPlaylist() {
    const track = state.queue[state.currentIndex];
    if (!track) {
        showToast("Play a song first");
        return;
    }
    addTrackToPlaylist(track);
}
function addTrackToPlaylist(track) {
    const playlists = getSavedPlaylists();
    if (!playlists.length) {
        const name = window.prompt("Name your new playlist", "My playlist")?.trim();
        if (!name)
            return;
        if (playlists.some((playlist) => playlist.name.toLowerCase() === name.toLowerCase())) {
            showToast("That playlist already exists");
            return;
        }
        playlists.push({ id: String(Date.now()), name, tracks: [track] });
        persistPlaylists(playlists);
        renderSavedPlaylists();
        showToast(`Created “${name}” and added this song`);
        return;
    }
    const choices = playlists.map((playlist, i) => `${i + 1}. ${playlist.name}`).join("\n");
    const answer = window.prompt(`Add “${track.name}” to which playlist?\n${choices}`, "1");
    const selected = playlists[Number.parseInt(answer || "", 10) - 1];
    if (!selected) {
        showToast("Choose a playlist number from the list");
        return;
    }
    if (selected.tracks.some((saved) => String(saved.id) === String(track.id))) {
        showToast("Song is already in that playlist");
        return;
    }
    selected.tracks.push(track);
    persistPlaylists(playlists);
    renderSavedPlaylists();
    showToast(`Added to “${selected.name}”`);
}
function playIndex(i) {
    if (i < 0 || i >= state.queue.length)
        return;
    const previousTrack = activeAudioTrack;
    if (previousTrack && audioEl.currentSrc && !audioEl.ended) {
        const listenedSeconds = audioEl.currentTime || 0;
        const durationSeconds = audioEl.duration || previousTrack.duration || 0;
        if (String(previousTrack.id) === String(state.queue[i].id)) {
            recordListeningInteraction(previousTrack, "repeat", listenedSeconds, durationSeconds);
        }
        else if (listenedSeconds > 2 && (!durationSeconds || listenedSeconds / durationSeconds < 0.8)) {
            recordListeningInteraction(previousTrack, "skip", listenedSeconds, durationSeconds);
        }
    }
    state.currentIndex = i;
    const track = state.queue[i];
    if (!track.audio) {
        showToast("This saved track is from Spotify and cannot play here. Find it again in Jamendo.");
        refreshPlayerViews();
        return;
    }
    activeAudioTrack = track;
    audioEl.src = track.audio;
    updateMediaSession(track);
    void rememberTrack(track);
    recordListeningInteraction(track, "play");
    audioEl.play().catch(() => {
        state.isPlaying = false;
        refreshPlayerViews();
        showToast("Could not play this preview. Try another song.");
    });
}
function togglePlayPause() {
    if (state.currentIndex === -1) {
        if (state.queue.length)
            playIndex(0);
        return;
    }
    if (state.isPlaying)
        audioEl.pause();
    else
        audioEl.play().catch(() => {
            state.isPlaying = false;
            refreshPlayerViews();
            showToast("Could not resume this preview. Try another song.");
        });
}
function refreshPlayerViews() {
    updateMiniPlayer();
    if (state.route === "playlist")
        renderPlaylist();
    if (state.route === "mood")
        renderMood();
    if (state.route === "now-playing")
        renderNowPlaying();
}
function playNext() {
    if (!state.queue.length)
        return;
    if (state.shuffle && state.queue.length > 1) {
        let next = state.currentIndex;
        while (next === state.currentIndex)
            next = Math.floor(Math.random() * state.queue.length);
        playIndex(next);
        return;
    }
    if (!state.repeat && state.currentIndex === state.queue.length - 1) {
        audioEl.pause();
        state.isPlaying = false;
        refreshPlayerViews();
        return;
    }
    playIndex((state.currentIndex + 1) % state.queue.length);
}
function playPrev() {
    if (!state.queue.length)
        return;
    playIndex((state.currentIndex - 1 + state.queue.length) % state.queue.length);
}
function updateMiniPlayer() {
    const mini = $("mini-player");
    const track = activeAudioTrack;
    if (!track) {
        mini.classList.remove("visible");
        return;
    }
    mini.classList.add("visible");
    $("mini-title").textContent = track.name;
    $("mini-sub").textContent = track.artist_name;
    $("mini-art").style.backgroundImage = `url(${track.image || track.album_image})`;
    $("btn-play-pause").textContent = state.isPlaying ? "❚❚" : "▶";
    $("btn-play-pause").setAttribute("aria-label", state.isPlaying ? "Pause" : "Play");
    $("mini-fav").textContent = state.favoriteIds.has(String(track.id)) ? "♥" : "♡";
    $("mini-fav").setAttribute("aria-label", state.favoriteIds.has(String(track.id)) ? "Remove current track from favorites" : "Add current track to favorites");
    $("btn-shuffle").classList.toggle("active", state.shuffle);
    $("btn-repeat").classList.toggle("active", state.repeat);
}
function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0)
        return "0:00";
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
function lyricsCacheKey(track) {
    return `miks.lyrics.v1.${encodeURIComponent(String(track.id))}`;
}
function saveLyricsCache(track, record) {
    try {
        localStorage.setItem(lyricsCacheKey(track), JSON.stringify({ savedAt: Date.now(), record }));
    }
    catch { /* Lyrics remain available for the current session if local storage is full. */ }
}
function parseSyncedLyrics(value) {
    const lines = [];
    for (const rawLine of value.split(/\r?\n/)) {
        const timestamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{2,3}))?\]/g)];
        const text = rawLine.replace(/\[\d{1,3}:\d{2}(?:[.:]\d{2,3})?\]/g, "").trim();
        if (!text)
            continue;
        for (const stamp of timestamps) {
            const fraction = stamp[3] ? Number(`0.${stamp[3]}`) : 0;
            lines.push({ time: Number(stamp[1]) * 60 + Number(stamp[2]) + fraction, text });
        }
    }
    return lines.sort((a, b) => a.time - b.time);
}
function setLyricsStatus(message) {
    $("lyrics-status").textContent = message;
}
function retryDelaySeconds(value) {
    if (!value)
        return 2;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds > 0)
        return seconds;
    const retryTime = Date.parse(value);
    return Number.isFinite(retryTime) ? Math.max(1, Math.ceil((retryTime - Date.now()) / 1000)) : 2;
}
function renderLyrics(record) {
    const holder = $("lyrics-lines");
    holder.replaceChildren();
    lyricsLines = record?.syncedLyrics ? parseSyncedLyrics(record.syncedLyrics) : [];
    lyricsLastActiveLine = -1;
    if (record?.instrumental) {
        setLyricsStatus("This track is instrumental.");
        return;
    }
    if (lyricsLines.length) {
        setLyricsStatus("Synced lyrics · tap a line to jump");
        lyricsLines.forEach((line, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "lyric-line";
            button.textContent = line.text;
            button.dataset.lyricIndex = String(index);
            button.addEventListener("click", () => { audioEl.currentTime = line.time; });
            holder.append(button);
        });
        updateActiveLyricLine();
        return;
    }
    const plainLyrics = record?.plainLyrics?.trim();
    if (plainLyrics) {
        setLyricsStatus("Plain lyrics");
        plainLyrics.split(/\r?\n/).forEach((text) => {
            const line = document.createElement("p");
            line.className = "lyric-line lyric-line-plain";
            line.textContent = text || " ";
            holder.append(line);
        });
        return;
    }
    setLyricsStatus("Lyrics aren’t available for this track yet.");
}
function updateActiveLyricLine() {
    if (!lyricsLines.length || $("lyrics-panel").hidden)
        return;
    let activeIndex = -1;
    for (let i = 0; i < lyricsLines.length && lyricsLines[i].time <= audioEl.currentTime; i++)
        activeIndex = i;
    if (activeIndex === lyricsLastActiveLine)
        return;
    const previous = $("lyrics-lines").querySelector(".lyric-line.active");
    previous?.classList.remove("active");
    lyricsLastActiveLine = activeIndex;
    if (activeIndex < 0)
        return;
    const current = $("lyrics-lines").querySelector(`[data-lyric-index="${activeIndex}"]`);
    current?.classList.add("active");
    current?.scrollIntoView({ block: "center", behavior: "smooth" });
}
async function getLyricsResponse(url) {
    const pending = lyricsRequestChain.then(async () => {
        const waitMs = Math.max(0, 350 - (Date.now() - lyricsLastRequestAt));
        if (waitMs)
            await new Promise((resolve) => setTimeout(resolve, waitMs));
        lyricsLastRequestAt = Date.now();
        return fetch(url, { headers: { "X-User-Agent": "Miks/1.0.5 (https://github.com/vinlaurence/MIKS)" } });
    });
    lyricsRequestChain = pending.then(() => undefined, () => undefined);
    return pending;
}
async function searchLyrics(track) {
    const url = new URL("https://lrclib.net/api/search");
    url.searchParams.set("track_name", track.name);
    url.searchParams.set("artist_name", track.artist_name);
    const response = await getLyricsResponse(url);
    if (!response.ok)
        return null;
    const results = await response.json();
    return results.find((item) => item.syncedLyrics || item.plainLyrics) || null;
}
async function loadLyrics(track) {
    const trackId = String(track.id);
    if (lyricsLoadingTrackId === trackId)
        return;
    lyricsLoadingTrackId = trackId;
    const requestToken = ++lyricsRequestToken;
    setLyricsStatus("Looking for lyrics…");
    $("lyrics-lines").replaceChildren();
    try {
        const cached = localStorage.getItem(lyricsCacheKey(track));
        if (cached) {
            const entry = JSON.parse(cached);
            if (Date.now() - Number(entry.savedAt || 0) < 180 * 24 * 60 * 60 * 1000) {
                lyricsRecord = entry.record || null;
                renderLyrics(lyricsRecord);
                lyricsLoadingTrackId = null;
                return;
            }
        }
    }
    catch { /* Ignore invalid or unavailable local cache. */ }
    if (!navigator.onLine) {
        setLyricsStatus("You’re offline. Lyrics you’ve opened before are saved on this device.");
        lyricsLoadingTrackId = null;
        return;
    }
    if (lyricsRetryAfter > Date.now()) {
        setLyricsStatus("Lyrics service is busy. Try again in a moment.");
        lyricsLoadingTrackId = null;
        return;
    }
    const url = new URL("https://lrclib.net/api/get");
    url.searchParams.set("track_name", track.name);
    url.searchParams.set("artist_name", track.artist_name);
    if (track.album_name)
        url.searchParams.set("album_name", track.album_name);
    const duration = Math.round(Number(track.duration));
    if (duration > 0 && duration <= 3600)
        url.searchParams.set("duration", String(duration));
    try {
        const response = await getLyricsResponse(url);
        if (requestToken !== lyricsRequestToken || lyricsTrackId !== trackId)
            return;
        if (response.status === 404) {
            const found = await searchLyrics(track);
            if (requestToken !== lyricsRequestToken || lyricsTrackId !== trackId)
                return;
            lyricsRecord = found;
            saveLyricsCache(track, found);
            renderLyrics(found);
            return;
        }
        if (response.status === 429 || response.status === 503) {
            const retry = retryDelaySeconds(response.headers.get("Retry-After"));
            lyricsRetryAfter = Date.now() + retry * 1000;
            setLyricsStatus("Lyrics service is busy. Try again in a moment.");
            return;
        }
        if (!response.ok)
            throw new Error("Lyrics could not be loaded.");
        const record = await response.json();
        if (requestToken !== lyricsRequestToken || lyricsTrackId !== trackId)
            return;
        lyricsRecord = record;
        saveLyricsCache(track, lyricsRecord);
        renderLyrics(lyricsRecord);
    }
    catch {
        if (requestToken === lyricsRequestToken)
            setLyricsStatus("Couldn’t load lyrics. Check your connection and try again.");
    }
    finally {
        if (lyricsLoadingTrackId === trackId)
            lyricsLoadingTrackId = null;
    }
}
function setLyricsTrack(track) {
    const nextTrackId = track ? String(track.id) : null;
    if (nextTrackId === lyricsTrackId)
        return;
    lyricsTrackId = nextTrackId;
    lyricsRecord = null;
    lyricsLines = [];
    lyricsLoadingTrackId = null;
    lyricsRequestToken++;
    lyricsLastActiveLine = -1;
    $("lyrics-lines").replaceChildren();
    $("btn-lyrics-toggle").disabled = !track;
    setLyricsStatus(track ? "Tap to load lyrics." : "Play a song to see its lyrics.");
    if (track && !$("lyrics-panel").hidden)
        void loadLyrics(track);
}
function renderNowPlaying() {
    const track = state.queue[state.currentIndex];
    setLyricsTrack(track || null);
    if (!track) {
        $("now-playing-title").textContent = "Nothing playing";
        $("now-playing-artist").textContent = "Choose a song to get started";
        $("now-playing-cover").style.backgroundImage = "";
        return;
    }
    $("now-playing-title").textContent = track.name;
    $("now-playing-artist").textContent = track.artist_name;
    $("now-playing-cover").style.backgroundImage = `url('${track.image || track.album_image}')`;
    $("now-playing-context").textContent = state.queueLabel || "miks mix";
    $("btn-now-playing-fav").textContent = state.favoriteIds.has(String(track.id)) ? "♥" : "♡";
    $("btn-now-playing-play").textContent = state.isPlaying ? "❚❚" : "▶";
    $("btn-now-playing-shuffle").classList.toggle("active", state.shuffle);
    $("btn-now-playing-repeat").classList.toggle("active", state.repeat);
    const duration = audioEl.duration || track.duration || 0;
    const seek = $("now-playing-seek");
    seek.value = duration ? String(audioEl.currentTime / duration * 100) : "0";
    $("now-playing-current-time").textContent = formatTime(audioEl.currentTime || 0);
    $("now-playing-duration").textContent = formatTime(duration);
}
function playNowPlayingMix() {
    if (!state.moodResults.length)
        return;
    setQueue(state.moodResults, currentMoodLabel());
    playIndex(0);
    navigate("now-playing");
}
audioEl.addEventListener("timeupdate", () => {
    if (audioEl.duration)
        $("progress-fill").style.width = `${(audioEl.currentTime / audioEl.duration) * 100}%`;
    if (state.route === "now-playing")
        renderNowPlaying();
    updateActiveLyricLine();
});
audioEl.addEventListener("play", () => {
    state.isPlaying = true;
    refreshPlayerViews();
});
audioEl.addEventListener("pause", () => {
    state.isPlaying = false;
    refreshPlayerViews();
});
audioEl.addEventListener("ended", () => {
    const track = activeAudioTrack;
    if (track) {
        const duration = audioEl.duration || track.duration;
        recordListeningInteraction(track, "complete", duration, duration);
        if (state.repeat)
            recordListeningInteraction(track, "repeat", duration, duration);
    }
    playNext();
});
$("progress-track").addEventListener("click", (e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    if (audioEl.duration)
        audioEl.currentTime = pct * audioEl.duration;
});
// ---------- Favorites ----------
async function handleToggleFavorite(track) {
    if (!state.currentUser) {
        showToast("Log in to save favorites");
        return;
    }
    const id = String(track.id);
    const cacheKey = `miks.account.${state.currentUser.uid}.favorites`;
    const nowFav = !state.favoriteIds.has(id);
    if (nowFav) {
        state.favoriteIds.add(id);
        state.favoritesList = [track, ...state.favoritesList.filter((item) => String(item.id) !== id)];
        recordListeningInteraction(track, "like");
    }
    else {
        state.favoriteIds.delete(id);
        state.favoritesList = state.favoritesList.filter((t) => String(t.id) !== id);
    }
    localStorage.setItem(cacheKey, JSON.stringify(state.favoritesList));
    refreshCurrentTrackViews();
    try {
        await fbToggleFavorite(state.currentUser.uid, track);
    }
    catch { /* Firestore retries queued writes when connectivity returns. */ }
}
function recordListeningInteraction(track, type, listenedSeconds = 0, durationSeconds = track.duration || 0) {
    if (!state.currentUser)
        return;
    state.listeningInteractions.unshift({
        trackId: String(track.id),
        trackName: track.name,
        artistName: track.artist_name,
        type,
        createdAt: new Date().toISOString(),
    });
    state.listeningInteractions = state.listeningInteractions.slice(0, 300);
    renderHomeSections();
    void saveListeningInteraction(state.currentUser.uid, track, type, { listenedSeconds, durationSeconds })
        .catch(() => { });
}
async function rememberTrack(track) {
    const playedAt = new Date();
    const recentTrack = { ...track, playedAt: playedAt.toISOString() };
    const eventKey = `${todayKey()}|${String(track.id)}`;
    state.history = [recentTrack, ...state.history.filter((item) => String(item.id) !== String(track.id))].slice(0, 30);
    state.listeningEvents = [
        { track, playedAt: playedAt.toISOString() },
        ...state.listeningEvents.filter((event) => `${localDateKey(new Date(event.playedAt))}|${String(event.track.id)}` !== eventKey),
    ].slice(0, 500);
    if (!state.currentUser) {
        localStorage.setItem("miks.guestHistory", JSON.stringify(state.history));
        localStorage.setItem("miks.guestListeningEvents", JSON.stringify(state.listeningEvents.slice(0, 100)));
    }
    renderWeekStrip();
    renderHomeSections();
    if (state.route === "profile")
        renderProfile();
    if (state.currentUser)
        try {
            await saveListeningEvent(state.currentUser.uid, track, playedAt);
        }
        catch { /* Offline playback still works. */ }
}
function updateMediaSession(track) {
    if (!("mediaSession" in navigator))
        return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.name, artist: track.artist_name, album: state.queueLabel, artwork: track.image || track.album_image ? [{ src: track.image || track.album_image }] : [] });
}
function refreshCurrentTrackViews() {
    if (state.route === "mood")
        renderMood();
    if (state.route === "playlist")
        renderPlaylist();
    if (state.route === "favorites")
        renderFavorites();
    renderHomeSections();
    if (state.route === "now-playing")
        renderNowPlaying();
    updateMiniPlayer();
}
async function loadFavorites() {
    if (!state.currentUser)
        return;
    const cacheKey = `miks.account.${state.currentUser.uid}.favorites`;
    let cached = [];
    try {
        cached = JSON.parse(localStorage.getItem(cacheKey) || "[]");
    }
    catch {
        cached = [];
    }
    try {
        const remote = await getFavorites(state.currentUser.uid);
        const merged = new Map();
        [...cached, ...remote].forEach((track) => merged.set(String(track.id), track));
        state.favoritesList = [...merged.values()];
        localStorage.setItem(cacheKey, JSON.stringify(state.favoritesList));
    }
    catch {
        state.favoritesList = cached;
    }
    state.favoriteIds = new Set(state.favoritesList.map((track) => String(track.id)));
}
async function loadHistory() {
    if (!state.currentUser)
        return;
    const weekDates = weekDatesMonToSun();
    const start = new Date(`${weekDates[0]}T00:00:00`);
    const end = new Date(`${weekDates[6]}T00:00:00`);
    end.setDate(end.getDate() + 1);
    const [historyResult, eventsResult, interactionsResult] = await Promise.allSettled([
        getListeningHistory(state.currentUser.uid),
        getListeningEvents(state.currentUser.uid, start, end),
        getListeningInteractions(state.currentUser.uid),
    ]);
    const history = historyResult.status === "fulfilled" ? historyResult.value : [];
    const events = eventsResult.status === "fulfilled" ? eventsResult.value : [];
    state.listeningInteractions = interactionsResult.status === "fulfilled" ? interactionsResult.value : [];
    state.history = history;
    const eventKeys = new Set(events.map((event) => `${localDateKey(new Date(event.playedAt))}|${String(event.track.id)}`));
    const legacyEvents = [];
    for (const track of history) {
        const rawPlayedAt = track.playedAt;
        const playedAt = rawPlayedAt?.toDate ? rawPlayedAt.toDate() : new Date(rawPlayedAt);
        if (!Number.isFinite(playedAt.getTime()))
            continue;
        const dateKey = localDateKey(playedAt);
        const key = `${dateKey}|${String(track.id)}`;
        if (!weekDates.includes(dateKey) || eventKeys.has(key))
            continue;
        eventKeys.add(key);
        legacyEvents.push({ track: track, playedAt: playedAt.toISOString() });
    }
    state.listeningEvents = [...events, ...legacyEvents].sort((a, b) => a.playedAt.localeCompare(b.playedAt)).slice(-500);
    renderWeekStrip();
}
function loadGuestListeningEvents() {
    const weekDates = weekDatesMonToSun();
    state.listeningEvents = [];
    try {
        const events = JSON.parse(localStorage.getItem("miks.guestListeningEvents") || "[]");
        if (Array.isArray(events)) {
            state.listeningEvents = events.filter((event) => !!event?.track && typeof event.playedAt === "string" && Number.isFinite(new Date(event.playedAt).getTime())).slice(0, 100);
        }
    }
    catch {
        state.listeningEvents = [];
    }
    const eventKeys = new Set(state.listeningEvents.map((event) => `${localDateKey(new Date(event.playedAt))}|${String(event.track.id)}`));
    const legacyEvents = state.history.flatMap((track) => {
        if (!track.playedAt)
            return [];
        const dateKey = localDateKey(new Date(track.playedAt));
        const key = `${dateKey}|${String(track.id)}`;
        if (!weekDates.includes(dateKey) || eventKeys.has(key))
            return [];
        eventKeys.add(key);
        return [{ track, playedAt: track.playedAt }];
    });
    state.listeningEvents = [...state.listeningEvents, ...legacyEvents];
}
async function loadMoodHistory() {
    if (!state.currentUser)
        return;
    try {
        state.moodHistory = await getMoodHistory(state.currentUser.uid);
    }
    catch {
        state.moodHistory = [];
    }
}
// ---------- Week streak ----------
function weekDatesMonToSun() {
    const now = new Date();
    const dayIdx = (now.getDay() + 6) % 7; // Mon=0..Sun=6
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayIdx);
    const out = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        out.push(localDateKey(d));
    }
    return out;
}
// ---------- Renderers ----------
function renderWeekStrip() {
    const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    const weekDates = weekDatesMonToSun();
    const today = localDateKey(new Date());
    const listenedDates = new Set(state.listeningEvents.map((event) => localDateKey(new Date(event.playedAt))));
    const el = $("week-strip");
    el.innerHTML = days
        .map((d, i) => {
        const dateKey = weekDates[i];
        const hasListened = listenedDates.has(dateKey);
        const isToday = dateKey === today;
        const isSelected = state.selectedListeningDate === dateKey;
        const classes = ["day", hasListened ? "has-listened" : "", isToday ? "today" : "", isSelected ? "selected" : ""].filter(Boolean).join(" ");
        const ariaLabel = `${d}${isToday ? ", today" : ""}${hasListened ? ", music played" : ", no music played"}`;
        return `<button type="button" class="${classes}" data-listening-date="${dateKey}" aria-pressed="${isSelected}" aria-label="${ariaLabel}"><span>${d}</span><span class="day-dot">${hasListened ? "✓" : ""}</span></button>`;
    })
        .join("");
    el.querySelectorAll("[data-listening-date]").forEach((button) => button.addEventListener("click", () => {
        const dateKey = button.dataset.listeningDate;
        state.selectedListeningDate = state.selectedListeningDate === dateKey ? null : dateKey;
        renderWeekStrip();
    }));
    $("btn-close-day-list").onclick = () => {
        state.selectedListeningDate = null;
        renderWeekStrip();
    };
    renderListeningDayDetails();
}
function renderListeningDayDetails() {
    const panel = $("day-listening");
    if (!state.selectedListeningDate) {
        panel.hidden = true;
        return;
    }
    panel.hidden = false;
    const date = new Date(`${state.selectedListeningDate}T12:00:00`);
    const title = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(date);
    $("day-listening-title").textContent = title;
    const dayEvents = state.listeningEvents
        .filter((event) => localDateKey(new Date(event.playedAt)) === state.selectedListeningDate)
        .sort((a, b) => a.playedAt.localeCompare(b.playedAt));
    const tracks = [...new Map(dayEvents.map((event) => [String(event.track.id), event.track])).values()];
    $("day-listening-count").textContent = `${tracks.length} ${tracks.length === 1 ? "song" : "songs"}`;
    const list = $("day-listening-tracks");
    list.innerHTML = tracks.length
        ? tracks.map((track, index) => trackRow(track, index, false)).join("")
        : `<div class="empty-note">No music played on this day.</div>`;
    if (tracks.length)
        wireTrackRows(list, tracks, (index) => {
            setQueue(tracks, title);
            playIndex(index);
            navigate("playlist");
        });
}
function trackCard(t) {
    const img = t.image || t.album_image;
    const seconds = Number(t.duration) || 0;
    const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    const fav = state.favoriteIds.has(String(t.id));
    return `<article class="art-card" data-track-id="${escapeHtml(String(t.id))}">
    <div class="art-thumb-wrap"><img class="art-thumb" src="${escapeHtml(img)}" alt="" loading="lazy" decoding="async"><button type="button" class="art-play" aria-label="Play ${escapeHtml(t.name)}">▶</button></div>
    <div class="art-card-meta"><div class="art-cap">${escapeHtml(t.name)}</div><div class="art-artist">${escapeHtml(t.artist_name)}</div><div class="art-card-actions"><span>${duration}</span><button type="button" class="art-fav ${fav ? "liked" : ""}" data-art-fav="${escapeHtml(String(t.id))}" aria-label="${fav ? "Remove favorite" : "Add favorite"}">${fav ? "♥" : "♡"}</button><button type="button" class="art-more" data-art-more="${escapeHtml(String(t.id))}" aria-label="More options">⋮</button></div></div>
  </article>`;
}
function wireTrackCards(container, tracks, label) {
    container.querySelectorAll(".art-card").forEach((card, i) => {
        card.addEventListener("click", (event) => {
            if (event.target.closest("button"))
                return;
            setQueue(tracks, label);
            playIndex(i);
        });
        card.querySelector(".art-play")?.addEventListener("click", (event) => {
            event.stopPropagation();
            setQueue(tracks, label);
            playIndex(i);
        });
    });
    container.querySelectorAll("[data-art-fav]").forEach((button) => button.addEventListener("click", (event) => {
        event.stopPropagation();
        const track = tracks.find((item) => String(item.id) === button.dataset.artFav);
        if (track)
            void handleToggleFavorite(track);
    }));
    container.querySelectorAll("[data-art-more]").forEach((button) => button.addEventListener("click", (event) => {
        event.stopPropagation();
        const track = tracks.find((item) => String(item.id) === button.dataset.artMore);
        if (track)
            addTrackToPlaylist(track);
    }));
}
function trackRow(t, i, playing, showRemove = false, showQueueActions = false) {
    const isFav = state.favoriteIds.has(String(t.id));
    const isLiked = state.likedIds.has(String(t.id));
    return `<div class="mood-track ${playing ? "playing" : ""}" data-i="${i}">
    <img class="mood-track-cover" src="${escapeHtml(t.image || t.album_image)}" alt="" loading="lazy" decoding="async">
    <div class="mood-track-meta">
      <div class="mood-track-name">${escapeHtml(t.name)}</div>
      <div class="mood-track-artist">${escapeHtml(t.artist_name)}</div>
    </div>
    <button type="button" class="track-fav" data-fav-id="${t.id}" aria-label="Favorite track">${isFav ? "♥" : "♡"}</button>
    ${showRemove ? `<button type="button" class="favorite-remove" data-remove-fav-id="${t.id}" aria-label="Remove ${escapeHtml(t.name)} from favorites" title="Remove from favorites">×</button>` : ""}
    <span class="track-duration">${formatTime(Number(t.duration) || 0)}</span>
    <button type="button" class="track-like ${isLiked ? "liked" : ""}" data-like-id="${t.id}" aria-label="Like track">+</button>
    <button type="button" class="track-more" data-more-id="${t.id}" aria-label="More options">⋮</button>
    ${showQueueActions ? `<span class="queue-actions"><button type="button" data-queue-move="${i}" data-direction="-1" aria-label="Move ${escapeHtml(t.name)} up" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" data-queue-move="${i}" data-direction="1" aria-label="Move ${escapeHtml(t.name)} down" ${i === state.queue.length - 1 ? "disabled" : ""}>↓</button><button type="button" data-queue-remove="${i}" aria-label="Remove ${escapeHtml(t.name)} from queue">×</button></span>` : ""}
    <div class="mood-track-play">▶</div>
  </div>`;
}
function wireTrackRows(container, tracks, onPlay) {
    container.querySelectorAll(".mood-track").forEach((row) => {
        const i = Number(row.dataset.i);
        row.addEventListener("click", (e) => {
            if (e.target.closest(".track-fav, .track-like, .favorite-remove, .track-more, .queue-actions"))
                return;
            onPlay(i);
        });
    });
    container.querySelectorAll(".track-fav").forEach((el) => {
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = el.dataset.favId;
            const track = tracks.find((t) => String(t.id) === id);
            if (track)
                handleToggleFavorite(track);
        });
    });
    container.querySelectorAll(".track-like").forEach((button) => {
        button.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = button.dataset.likeId;
            if (state.likedIds.has(id))
                state.likedIds.delete(id);
            else {
                state.likedIds.add(id);
                const track = tracks.find((item) => String(item.id) === id);
                if (track)
                    recordListeningInteraction(track, "like");
            }
            localStorage.setItem(LIKES_STORAGE, JSON.stringify([...state.likedIds]));
            refreshCurrentTrackViews();
            showToast(state.likedIds.has(id) ? "Liked" : "Like removed");
        });
    });
    container.querySelectorAll(".track-more").forEach((button) => button.addEventListener("click", (e) => {
        e.stopPropagation();
        const track = tracks.find((item) => String(item.id) === button.dataset.moreId);
        if (track)
            addTrackToPlaylist(track);
    }));
}
function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
}
async function loadTrending() {
    if (!state.apiKey) {
        $("key-notice").style.display = "block";
        $("key-notice").textContent = "Music is temporarily unavailable. Try again later.";
        $("trending-row").innerHTML = "";
        return;
    }
    $("key-notice").style.display = "none";
    $("trending-row").innerHTML = `<div class="loading-spinner"></div>`;
    const tracks = await jamendoSearch({ tags: "christian", order: "popularity_total" });
    state.trending = tracks;
    $("trending-row").innerHTML = tracks.map(trackCard).join("");
    wireTrackCards($("trending-row"), tracks, "Trending Christian Music");
}
function renderHomeSections() {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const name = String(state.currentUser?.displayName || state.currentUser?.email?.split("@")[0] || "").trim();
    $("home-greeting").textContent = `${greeting}${name ? `, ${name}` : ""}`;
    const favorites = state.favoritesList.slice(0, 8);
    const recent = state.history.slice(0, 8);
    const recommendations = buildPersonalizedQueue();
    const recommendationRow = $("home-for-you-row");
    const recommendationNote = $("home-for-you-note");
    const learnedFromHistory = state.history.length > 0 || state.favoriteIds.size > 0 || state.likedIds.size > 0;
    recommendationNote.textContent = learnedFromHistory
        ? "Picked from your listening, likes, favorites, and artists you return to."
        : "Play or favorite a few tracks and this mix will start to learn what you like.";
    recommendationRow.innerHTML = recommendations.length
        ? recommendations.map(trackCard).join("")
        : `<div class="home-row-empty">Play a few tracks to start your mix.</div>`;
    wireTrackCards(recommendationRow, recommendations, "For You");
    const playForYou = $("btn-play-for-you");
    playForYou.disabled = recommendations.length === 0;
    playForYou.onclick = () => {
        if (!recommendations.length)
            return;
        setQueue(recommendations, "For You");
        playIndex(0);
        openNowPlaying();
    };
    for (const [id, tracks, label, empty] of [
        ["home-favorites-row", favorites, "Based on your favorites", "Sign in and favorite songs to personalize this row."],
        ["home-recent-row", recent, "Recently played", "Songs you play will show up here."],
    ]) {
        const holder = $(id);
        holder.innerHTML = tracks.length ? tracks.map(trackCard).join("") : `<div class="home-row-empty">${empty}</div>`;
        wireTrackCards(holder, tracks, label);
    }
}
function buildPersonalizedQueue() {
    const candidates = new Map();
    [...state.trending, ...state.favoritesList, ...state.history].forEach((track, order) => {
        if (track?.id && track.audio && !candidates.has(String(track.id))) {
            candidates.set(String(track.id), { track, order });
        }
    });
    const artistScores = new Map();
    const trackScores = new Map();
    for (const interaction of state.listeningInteractions) {
        const artist = String(interaction.artistName || "").toLowerCase();
        const trackId = String(interaction.trackId || "");
        const weight = interaction.type === "like" ? 4
            : interaction.type === "complete" ? 2
                : interaction.type === "repeat" ? 2.5
                    : interaction.type === "skip" ? -1.5 : 0;
        if (artist && weight > 0)
            artistScores.set(artist, (artistScores.get(artist) || 0) + weight);
        if (trackId)
            trackScores.set(trackId, (trackScores.get(trackId) || 0) + weight);
    }
    const favoriteArtists = new Set(state.favoritesList.map((track) => String(track.artist_name || "").toLowerCase()));
    return [...candidates.values()]
        .map(({ track, order }) => {
        const id = String(track.id);
        const artist = String(track.artist_name || "").toLowerCase();
        const score = (state.favoriteIds.has(id) ? 5 : 0)
            + (state.likedIds.has(id) ? 4 : 0)
            + (favoriteArtists.has(artist) ? 3 : 0)
            + (artistScores.get(artist) || 0)
            + (trackScores.get(id) || 0)
            - (state.history.some((item) => String(item.id) === id) ? 1.5 : 0)
            - order * 0.001;
        return { track, score };
    })
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map(({ track }) => track);
}
function renderMood() {
    $("chip-row").innerHTML = MOOD_CHIPS.map((c) => `<div class="chip ${c.tag === state.activeChipTag ? "active" : ""}" data-tag="${c.tag}" data-label="${c.label}">
        <span class="icon">${c.icon}</span>${c.label}
      </div>`).join("");
    $("chip-row")
        .querySelectorAll(".chip")
        .forEach((chip) => {
        chip.addEventListener("click", () => void createMoodMix(chip.dataset.tag, chip.dataset.label || "Your mood", false));
    });
    const statusEl = $("mood-status");
    if (!state.moodResults.length) {
        statusEl.innerHTML = state.moodAnalysis
            ? `<div class="mood-status-label">No tracks found for this mix</div><div class="mood-vector">Try describing it another way. Jamendo only returns tracks tagged Christian for this search.</div>`
            : `<div class="mood-status-label">Pick a mood or describe it above</div>`;
        return;
    }
    const label = state.queueLabel || currentMoodLabel();
    const moodRead = state.moodAnalysis
        ? `Mood read: ${state.moodAnalysis.primary_mood} · ${state.moodAnalysis.tempo} tempo · ${state.moodAnalysis.energy} energy · ${state.moodAnalysis.acoustic_profile}`
        : moodExplanation(label);
    statusEl.innerHTML =
        `<div class="mood-result-head"><div><div class="mood-status-label">Your mood · ${escapeHtml(state.moodAnalysis?.primary_mood || label)}</div><div class="mood-vector">${escapeHtml(moodRead)}</div><strong>Recommended mix · ${state.moodResults.length} tracks</strong></div><div class="mood-result-actions"><button type="button" id="btn-play-mood-mix">Play Mix</button><button type="button" id="btn-save-mood-mix">＋ Save Playlist</button></div></div>` +
            state.moodResults
                .map((t, i) => trackRow(t, i, state.queue === state.moodResults && state.currentIndex === i))
                .join("");
    wireTrackRows(statusEl, state.moodResults, (i) => {
        setQueue(state.moodResults, currentMoodLabel());
        playIndex(i);
        openNowPlaying();
    });
    $("btn-play-mood-mix").addEventListener("click", () => { setQueue(state.moodResults, currentMoodLabel()); playIndex(0); openNowPlaying(); });
    $("btn-save-mood-mix").addEventListener("click", () => { setQueue(state.moodResults, currentMoodLabel()); createPlaylist(); });
}
async function createMoodMix(tag, label, autoplay = true) {
    state.activeChipTag = tag;
    state.moodAnalysis = null;
    state.queueLabel = `${label.trim()} mix`;
    if (state.route === "mood")
        $("mood-status").innerHTML = `<div class="loading-spinner"></div>`;
    const tracks = await searchRandomMoodMix({ tags: `christian+${tag}`, order: "popularity_total" }, `chip:${tag}`);
    state.moodResults = tracks;
    if (tracks.length) {
        await recordMoodSession(state.queueLabel);
        setQueue(tracks, state.queueLabel);
        if (autoplay) {
            playIndex(0);
            navigate("playlist");
            return;
        }
    }
    renderMood();
}
function renderHomeQuickMoods() {
    const holder = $("home-quick-moods");
    holder.innerHTML = MOOD_CHIPS.map((mood) => `<button class="home-quick-mood" type="button" data-home-tag="${mood.tag}" data-home-label="${escapeHtml(mood.label)}">${mood.icon} ${escapeHtml(mood.label)}</button>`).join("");
    holder.querySelectorAll("[data-home-tag]").forEach((button) => {
        button.addEventListener("click", () => { navigate("mood"); void createMoodMix(button.dataset.homeTag, button.dataset.homeLabel, false); });
    });
}
function moodExplanation(label) {
    const value = label.toLowerCase();
    if (/sad|heartbreak|melanch|rain/.test(value))
        return "Mood read: reflective · low energy · gentle pace";
    if (/hype|energy|workout|party|momentum/.test(value))
        return "Mood read: bright · high energy · strong momentum";
    if (/focus|study|work/.test(value))
        return "Mood read: clear · steady energy · minimal distraction";
    if (/sleep|calm|chill|ambient/.test(value))
        return "Mood read: calm · low energy · spacious sound";
    return "Mood read: balanced · open to discovery · made for your moment";
}
function renderDiscover() {
    const tags = ["Chill", "Focus", "Happy", "Electronic", "Rock", "Ambient", "Jazz", "Acoustic"];
    $("discover-tags").innerHTML = tags.map((tag) => `<button type="button" class="discover-tag" data-discover-tag="${tag.toLowerCase()}">${tag}</button>`).join("");
    $("discover-tags").querySelectorAll("[data-discover-tag]").forEach((button) => {
        button.addEventListener("click", async () => {
            const tag = button.dataset.discoverTag;
            $("search-results-title").textContent = `${button.textContent} picks`;
            $("search-results").innerHTML = `<div class="loading-spinner"></div>`;
            const tracks = await searchByTag(tag);
            renderSearchResults(tracks, `${button.textContent} picks`);
        });
    });
}
function renderSearchResults(tracks, title) {
    $("search-results-title").textContent = title;
    const holder = $("search-results");
    holder.innerHTML = tracks.length ? tracks.map((track, i) => trackRow(track, i, false)).join("") : `<div class="empty-note">No matches found. Try a different search.</div>`;
    wireTrackRows(holder, tracks, (i) => { setQueue(tracks, title); playIndex(i); navigate("playlist"); });
}
function renderProfile() {
    const title = $("profile-title");
    const summary = $("profile-summary");
    const list = $("history-list");
    renderTasteDashboard();
    if (!state.currentUser) {
        title.textContent = "Profile";
        summary.textContent = "Sign in to save your music and build your taste profile.";
        list.innerHTML = `<div class="empty-note">Your recently played music will appear here after you log in.</div>`;
        return;
    }
    title.textContent = state.currentUser.email?.split("@")[0] || "Your profile";
    summary.textContent = `${state.favoriteIds.size} favorites · ${state.savedPlaylists.length} playlists · ${state.history.length} recently played`;
    list.innerHTML = state.history.length ? state.history.map((track, i) => trackRow(track, i, false)).join("") : `<div class="empty-note">Play a track to start your listening history.</div>`;
    wireTrackRows(list, state.history, (i) => { setQueue(state.history, "Recently played"); playIndex(i); navigate("playlist"); });
}
function renderTasteDashboard() {
    const charts = $("taste-charts");
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(today);
        date.setDate(today.getDate() - (6 - index));
        const key = date.toISOString().slice(0, 10);
        const count = state.moodHistory.filter((event) => event.date === key).length;
        return { label: date.toLocaleDateString(undefined, { weekday: "short" }), count };
    });
    const maxCount = Math.max(1, ...days.map((day) => day.count));
    const moodCounts = new Map();
    state.moodHistory.slice(0, 30).forEach((event) => {
        const mood = String(event.mood || "Other").replace(/\s+Christian mix$/i, "").replace(/\s+mix$/i, "");
        moodCounts.set(mood, (moodCounts.get(mood) || 0) + 1);
    });
    const moodTotal = [...moodCounts.values()].reduce((sum, count) => sum + count, 0);
    const moodBars = [...moodCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    charts.innerHTML = `<div class="taste-chart-card"><strong>Mood mixes this week</strong><div class="taste-week-chart" role="img" aria-label="Mood mixes selected during the last seven days">${days.map((day) => `<div class="taste-week-day" title="${day.count} mixes"><div class="taste-week-bar" style="height:${Math.max(6, Math.round(day.count / maxCount * 100))}%"></div><small>${day.label}</small></div>`).join("")}</div><small>${days.reduce((sum, day) => sum + day.count, 0)} mood mixes in the last 7 days</small></div><div class="taste-chart-card"><strong>Recent mood mix</strong>${moodBars.length ? moodBars.map(([mood, count]) => `<div class="taste-mood-row"><span>${escapeHtml(mood)}</span><div><i style="width:${Math.round(count / moodTotal * 100)}%"></i></div><small>${Math.round(count / moodTotal * 100)}%</small></div>`).join("") : `<div class="taste-empty">Create a mood mix to start building your profile.</div>`}</div>`;
}
function timestampDate(value) {
    if (value?.toDate)
        return value.toDate();
    if (value?.seconds)
        return new Date(value.seconds * 1000);
    if (typeof value === "string" || typeof value === "number") {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
}
async function generateWeeklyReport() {
    if (!state.currentUser) {
        showToast("Sign in to generate your listening reflection");
        return;
    }
    const report = $("weekly-report");
    const button = $("btn-weekly-report");
    button.disabled = true;
    button.textContent = "Thinking…";
    report.innerHTML = `<div class="loading-spinner"></div>`;
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const moods = state.moodHistory.filter((event) => {
        const date = timestampDate(event.loggedAt) || timestampDate(event.date);
        return date && date.getTime() >= since;
    }).map((event) => ({ mood: event.mood, date: event.date }));
    const tracks = state.history.filter((track) => {
        const date = timestampDate(track.playedAt);
        return date && date.getTime() >= since;
    }).map((track) => ({ title: track.name, artist: track.artist_name }));
    try {
        const result = await analyzeMusicWithAI({ mode: "weekly", moods, tracks });
        report.innerHTML = `<p>${escapeHtml(String(result.summary || "Your listening has a varied, personal feel this week."))}</p><small>${escapeHtml(String(result.mood_highlight || "Your recent mix"))}${result.suggestion ? ` · ${escapeHtml(String(result.suggestion))}` : ""}</small>`;
    }
    catch (error) {
        report.innerHTML = `<div class="empty-note">${escapeHtml(error?.message || "Could not generate a report right now.")}</div>`;
    }
    finally {
        button.disabled = false;
        button.textContent = "Generate";
    }
}
function currentMoodLabel() {
    const chip = MOOD_CHIPS.find((c) => c.tag === state.activeChipTag);
    return chip ? chip.label + " mix" : "Your mood, mixed";
}
async function recordMoodSession(label) {
    state.moodHistory.unshift({ date: todayKey(), mood: label, loggedAt: new Date() });
    if (!state.currentUser)
        return;
    await logMoodSession(state.currentUser.uid, label);
}
function renderPlaylist() {
    renderSavedPlaylists();
    const firstTrack = state.queue[0];
    const totalSeconds = state.queue.reduce((total, track) => total + (track.duration || 0), 0);
    const durationLabel = totalSeconds ? `${Math.floor(totalSeconds / 3600)} hr ${Math.round((totalSeconds % 3600) / 60)} min` : "";
    $("playlist-library-label").textContent = "YOUR LIBRARY";
    $("playlist-library-title").textContent = state.queue.length ? "Playlist" : "Playlists";
    $("queue-count").textContent = state.queue.length ? `${state.queue.length} songs${durationLabel ? ` · ${durationLabel}` : ""}` : "";
    if (!firstTrack) {
        $("hero-cover").style.backgroundImage = "";
        $("hero-title").textContent = "Choose a playlist";
        $("hero-sub").textContent = "Select one below, or create a mix with Mood AI";
        $("queue-list").innerHTML = `<div class="queue-empty">Choose music from Home or Mood AI, then it will appear here.</div>`;
        $("queue-heading-title").textContent = "Tracks";
        $("btn-ai-enhance").disabled = true;
        renderAISuggestions();
        return;
    }
    $("hero-cover").style.backgroundImage = `url(${firstTrack.image || firstTrack.album_image})`;
    $("hero-title").textContent = state.queueLabel || "Your playlist";
    $("hero-sub").textContent = `${state.queue.length} ${state.queue.length === 1 ? "song" : "songs"}${durationLabel ? ` · ${durationLabel}` : ""}`;
    $("btn-hero-play").textContent = state.isPlaying ? "❚❚" : "▶";
    $("queue-heading-title").textContent = state.queueLabel || "Tracks";
    $("btn-ai-enhance").toggleAttribute("disabled", !state.queue.length);
    renderAISuggestions();
    const listEl = $("queue-list");
    listEl.innerHTML = state.queue.map((t, i) => trackRow(t, i, i === state.currentIndex, false, true)).join("");
    wireTrackRows(listEl, state.queue, (i) => playIndex(i));
    listEl.querySelectorAll("[data-queue-remove]").forEach((button) => button.addEventListener("click", (event) => {
        event.stopPropagation();
        removeQueueTrack(Number(button.dataset.queueRemove));
    }));
    listEl.querySelectorAll("[data-queue-move]").forEach((button) => button.addEventListener("click", (event) => {
        event.stopPropagation();
        moveQueueTrack(Number(button.dataset.queueMove), Number(button.dataset.direction));
    }));
}
function removeQueueTrack(index) {
    if (index < 0 || index >= state.queue.length)
        return;
    const removedCurrent = index === state.currentIndex;
    state.queue.splice(index, 1);
    if (!state.queue.length) {
        audioEl.pause();
        audioEl.removeAttribute("src");
        audioEl.load();
        activeAudioTrack = null;
        state.currentIndex = -1;
        state.isPlaying = false;
    }
    else if (removedCurrent) {
        state.currentIndex = -1;
        activeAudioTrack = null;
        playIndex(Math.min(index, state.queue.length - 1));
    }
    else if (index < state.currentIndex) {
        state.currentIndex -= 1;
    }
    refreshPlayerViews();
}
function moveQueueTrack(index, direction) {
    const target = index + direction;
    if (index < 0 || target < 0 || index >= state.queue.length || target >= state.queue.length)
        return;
    [state.queue[index], state.queue[target]] = [state.queue[target], state.queue[index]];
    if (state.currentIndex === index)
        state.currentIndex = target;
    else if (state.currentIndex === target)
        state.currentIndex = index;
    renderPlaylist();
}
function renderAISuggestions() {
    const holder = $("ai-suggestions");
    if (!state.aiSuggestions.length) {
        holder.hidden = true;
        holder.innerHTML = "";
        return;
    }
    holder.hidden = false;
    const rationale = (holder.dataset.rationale || "Chosen to match the broad mood and style of this playlist.");
    holder.innerHTML = `<div class="ai-suggestion-heading"><strong>AI picks for this playlist</strong><span>${escapeHtml(rationale)}</span></div>` + state.aiSuggestions.map(({ track }, index) => `<div class="ai-suggestion-row"><div class="ai-suggestion-art" style="background-image:url('${escapeHtml(track.image || track.album_image)}')"></div><div class="ai-suggestion-meta"><strong>${escapeHtml(track.name)}</strong><small>${escapeHtml(track.artist_name)}</small></div><button type="button" data-ai-add="${index}">＋ Add</button></div>`).join("");
    holder.querySelectorAll("[data-ai-add]").forEach((button) => button.addEventListener("click", () => addAISuggestion(Number(button.dataset.aiAdd))));
}
async function enhanceCurrentPlaylist() {
    if (!state.queue.length) {
        showToast("Open a playlist first");
        return;
    }
    if (!state.currentUser) {
        showToast("Sign in to use AI Enhance");
        return;
    }
    const button = $("btn-ai-enhance");
    const suggestions = $("ai-suggestions");
    button.disabled = true;
    button.textContent = "Analyzing…";
    suggestions.hidden = false;
    suggestions.innerHTML = `<div class="loading-spinner"></div>`;
    try {
        const analysis = await analyzeMusicWithAI({
            mode: "playlist",
            tracks: state.queue.slice(0, 15).map((track) => ({ title: track.name, artist: track.artist_name })),
        });
        const tags = Array.isArray(analysis.recommended_tags)
            ? analysis.recommended_tags.map((tag) => String(tag).toLowerCase()).filter((tag) => SAFE_MUSIC_TAGS.has(tag)).slice(0, 4)
            : [];
        const candidates = await jamendoSearch({ tags: "christian", fuzzytags: tags.join("+") || "acoustic", order: "relevance" });
        const currentIds = new Set(state.queue.map((track) => String(track.id)));
        state.aiSuggestions = candidates.filter((track) => !currentIds.has(String(track.id))).slice(0, 3).map((track) => ({ track, rationale: String(analysis.rationale || "Chosen to match the broad mood and style of this playlist.") }));
        suggestions.dataset.rationale = String(analysis.rationale || "Chosen to match the broad mood and style of this playlist.");
        if (!state.aiSuggestions.length)
            showToast("No new Christian tracks matched this playlist yet");
        renderAISuggestions();
    }
    catch (error) {
        suggestions.hidden = false;
        suggestions.innerHTML = `<div class="empty-note">${escapeHtml(error?.message || "AI Enhance is unavailable right now.")}</div>`;
    }
    finally {
        button.disabled = !state.queue.length;
        button.textContent = "✦ AI Enhance";
    }
}
function addAISuggestion(index) {
    const suggestion = state.aiSuggestions[index];
    if (!suggestion)
        return;
    const playlists = getSavedPlaylists();
    let playlist = playlists.find((item) => item.name === state.queueLabel);
    if (!playlist) {
        playlist = { id: String(Date.now()), name: state.queueLabel || "My playlist", tracks: [...state.queue] };
        playlists.push(playlist);
    }
    if (playlist.tracks.some((track) => String(track.id) === String(suggestion.track.id))) {
        showToast("That track is already in this playlist");
        return;
    }
    playlist.tracks.push(suggestion.track);
    state.queue = playlist.tracks;
    state.aiSuggestions.splice(index, 1);
    persistPlaylists(playlists);
    renderPlaylist();
    showToast(`Added “${suggestion.track.name}” to ${playlist.name}`);
}
function renderFavorites() {
    const listEl = $("favorites-list");
    if (!state.currentUser) {
        listEl.innerHTML = `<div class="empty-note">Log in to save and see your favorite tracks.</div>`;
        return;
    }
    if (!state.favoritesList.length) {
        listEl.innerHTML = `<div class="empty-note">No favorites yet — tap the heart on any track.</div>`;
        return;
    }
    listEl.innerHTML = state.favoritesList
        .map((t, i) => trackRow(t, i, state.queue === state.favoritesList && state.currentIndex === i, true))
        .join("");
    wireTrackRows(listEl, state.favoritesList, (i) => {
        setQueue(state.favoritesList, "Favorites");
        playIndex(i);
        navigate("playlist");
    });
    listEl.querySelectorAll(".favorite-remove").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            const track = state.favoritesList.find((item) => String(item.id) === button.dataset.removeFavId);
            if (track)
                void handleToggleFavorite(track);
        });
    });
}
// ---------- Auth UI ----------
function setAuthMode(mode) {
    state.authMode = mode;
    $("btn-login").textContent = mode === "login" ? "Log in" : "Sign up";
    $("auth-card-heading").textContent = mode === "login" ? "Welcome back" : "Create your account";
    $("auth-card-subtitle").textContent = mode === "login"
        ? "Log in to save your music and return to your mixes."
        : "Join miks and save your favorite music.";
    $("login-email").setAttribute("placeholder", mode === "login" ? "you@email.com" : "Your email address");
    $("login-password").setAttribute("placeholder", mode === "login" ? "••••••••" : "At least 6 characters");
    document.querySelector(".login-card")?.classList.toggle("signup-mode", mode === "signup");
    $("policy-consent").hidden = false;
    $("policy-consent-check").required = mode === "signup";
    $("auth-mode-toggle").textContent =
        mode === "login" ? "New here? Create an account" : "Already have an account? Log in";
    $("auth-error").textContent = "";
}
function applyFirebaseHint() {
    $("firebase-hint").textContent = firebaseReady
        ? ""
        : "Firebase isn't configured yet — add the project keys in src/firebase-config.ts before users can sign in.";
}
async function handleAuthSubmit() {
    const email = $("login-email").value.trim();
    const password = $("login-password").value;
    $("auth-error").textContent = "";
    if (!email || !password) {
        $("auth-error").textContent = "Enter both email and password.";
        return;
    }
    if (state.authMode === "signup" && !$("policy-consent-check").checked) {
        $("auth-error").textContent = "Please read and acknowledge the Privacy Policy before creating your account.";
        return;
    }
    const result = state.authMode === "login" ? await signIn(email, password) : await signUp(email, password);
    if (!result.ok) {
        $("auth-error").textContent = result.error || "Something went wrong.";
        return;
    }
    // Navigate immediately; the background auth listener remains a fallback.
    const user = getCurrentUser();
    if (user)
        await onUserSignedIn(user);
}
async function handleGoogleSignIn() {
    if (!$("policy-consent-check").checked) {
        $("auth-error").textContent = "Please read and acknowledge the Privacy Policy before continuing with Google.";
        return;
    }
    const button = $("btn-google-signin");
    const label = button.querySelector("span");
    button.disabled = true;
    if (label)
        label.textContent = "Connecting to Google…";
    $("auth-error").textContent = "";
    const result = await signInWithGoogle();
    if (!result.ok) {
        $("auth-error").textContent = result.error || "Google sign-in failed. Please try again.";
        button.disabled = false;
        if (label)
            label.textContent = "Continue with Google";
        return;
    }
    const user = getCurrentUser();
    if (user)
        await onUserSignedIn(user);
}
async function handlePasswordReset() {
    const email = ($("login-email")).value.trim();
    $("auth-error").textContent = "";
    if (!email) {
        $("auth-error").textContent = "Enter your account email first.";
        $("login-email").focus();
        return;
    }
    const result = await sendPasswordReset(email);
    if (!result.ok) {
        $("auth-error").textContent = result.error || "Could not send the reset email. Try again.";
        return;
    }
    showToast("If an account exists for that email, a password reset link has been sent.");
}
async function onUserSignedIn(user) {
    state.currentUser = user;
    state.listeningEvents = [];
    state.selectedListeningDate = null;
    renderWeekStrip();
    updateAccountStatus();
    navigate("home");
    // Account data is optional for the first screen, so load it after navigation.
    void Promise.all([loadFavorites(), loadPlaylists(), loadHistory(), loadMoodHistory()]).then(() => { refreshCurrentTrackViews(); renderProfile(); renderHomeSections(); });
    if (activityRecordedForUid !== user.uid) {
        activityRecordedForUid = user.uid;
        void recordAppOpen(user);
    }
}
function onUserSignedOut() {
    audioEl.pause();
    state.queue = [];
    state.queueLabel = "";
    state.currentIndex = -1;
    state.isPlaying = false;
    $("progress-fill").style.width = "0%";
    updateMiniPlayer();
    activityRecordedForUid = null;
    state.currentUser = null;
    state.listeningInteractions = [];
    activeAudioTrack = null;
    state.favoriteIds = new Set();
    state.favoritesList = [];
    state.savedPlaylists = [];
    try {
        state.history = JSON.parse(localStorage.getItem("miks.guestHistory") || "[]");
    }
    catch {
        state.history = [];
    }
    state.selectedListeningDate = null;
    loadGuestListeningEvents();
    state.moodHistory = [];
    updateAccountStatus();
    renderWeekStrip();
    renderHomeSections();
}
async function renderAdminDashboard() {
    if (!isAdmin(state.currentUser)) {
        navigate("home");
        return;
    }
    const activityEl = $("admin-activity");
    activityEl.innerHTML = `<div class="empty-note">Loading users…</div>`;
    try {
        const data = await getAdminDashboard();
        adminUsersCache = [...data.users].sort((a, b) => String(b.signedUpAt || "").localeCompare(String(a.signedUpAt || "")));
        $("admin-user-count").textContent = String(adminUsersCache.length);
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        $("admin-visit-count").textContent = String(adminUsersCache.filter((user) => new Date(user.signedUpAt || 0).getTime() >= thirtyDaysAgo).length);
        renderAdminUsers();
    }
    catch {
        activityEl.innerHTML = `<div class="empty-note">Dashboard data is blocked. Deploy the Firestore rules, then refresh.</div>`;
    }
}
function renderAdminUsers() {
    const query = $("admin-user-search").value.trim().toLowerCase();
    const users = adminUsersCache.filter((user) => String(user.email || "").toLowerCase().includes(query)).slice(0, 50);
    $("admin-activity").innerHTML = users.length ? users.map((item) => {
        const time = item.signedUpAt ? new Date(item.signedUpAt).toLocaleString() : "Unknown date";
        return `<div class="activity-row"><div class="activity-email">${escapeHtml(item.email || "Unknown user")}</div><div class="activity-time">Registered · ${escapeHtml(time)}</div></div>`;
    }).join("") : `<div class="empty-note">${adminUsersCache.length ? "No users match that search." : "No sign-ups recorded yet."}</div>`;
}
function updateAccountStatus() {
    const text = $("account-status-text");
    const logoutRow = $("logout-row");
    const logoutButton = $("btn-logout");
    const adminButton = $("btn-admin");
    if (state.currentUser) {
        text.textContent = isAdmin(state.currentUser)
            ? `${state.currentUser.email} · Admin`
            : state.currentUser.email || "Signed in";
        logoutRow.style.display = "flex";
        logoutButton.style.display = "flex";
        adminButton.style.display = isAdmin(state.currentUser) ? "flex" : "none";
    }
    else {
        text.textContent = "Not signed in";
        logoutRow.style.display = "none";
        logoutButton.style.display = "none";
        adminButton.style.display = "none";
    }
    $("firebase-status").textContent = firebaseReady
        ? "Connected to Firebase."
        : "Firebase not configured — edit src/firebase-config.ts to enable real accounts, favorites, and streaks.";
}
async function handleLogout() {
    // Stop immediately so music cannot continue while Firebase signs out.
    onUserSignedOut();
    await signOutUser();
    showLogin();
    showToast("Logged out");
}
// ---------- Wiring ----------
function wireStatic() {
    const privacyConsent = $("policy-consent-check");
    try {
        privacyConsent.checked = localStorage.getItem(PRIVACY_ACK_KEY) === "accepted";
    }
    catch { /* Consent can still be checked for this session. */ }
    privacyConsent.addEventListener("change", () => {
        try {
            if (privacyConsent.checked)
                localStorage.setItem(PRIVACY_ACK_KEY, "accepted");
            else
                localStorage.removeItem(PRIVACY_ACK_KEY);
        }
        catch { /* Keep the current checkbox state if device storage is unavailable. */ }
    });
    $("btn-login").addEventListener("click", handleAuthSubmit);
    $("btn-google-signin").addEventListener("click", () => void handleGoogleSignIn());
    $("btn-password-reset").addEventListener("click", () => void handlePasswordReset());
    $("btn-continue-guest").addEventListener("click", () => {
        navigate("home");
        showToast("Choose a mood to create your first mix");
    });
    $("auth-mode-toggle").addEventListener("click", () => setAuthMode(state.authMode === "login" ? "signup" : "login"));
    $("btn-toggle-password").addEventListener("click", () => {
        const password = $("login-password");
        const reveal = password.type === "password";
        password.type = reveal ? "text" : "password";
        $("btn-toggle-password").textContent = reveal ? "Hide" : "Show";
    });
    document.querySelectorAll(".nav-btn").forEach((btn) => {
        btn.addEventListener("click", () => navigate(btn.dataset.route));
    });
    $("btn-sidebar-collapse").addEventListener("click", () => {
        const collapsed = document.documentElement.classList.toggle("sidebar-collapsed");
        localStorage.setItem("miks.sidebarCollapsed", String(collapsed));
        const button = $("btn-sidebar-collapse");
        button.textContent = collapsed ? ">>" : "<<";
        button.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
        button.setAttribute("aria-label", button.title);
    });
    $("btn-go-mood").addEventListener("click", () => navigate("mood"));
    $("btn-home-mood").addEventListener("click", async () => {
        const text = $("home-mood-text").value.trim();
        if (!text) {
            navigate("mood");
            return;
        }
        ($("mood-text")).value = text;
        navigate("mood");
        await createSemanticMoodMix(text, false);
    });
    $("btn-go-settings").addEventListener("click", () => navigate("settings"));
    $("btn-admin").addEventListener("click", () => navigate("admin"));
    $("btn-admin-back").addEventListener("click", () => navigate("home"));
    $("btn-admin-refresh").addEventListener("click", () => void renderAdminDashboard());
    $("btn-logout").addEventListener("click", handleLogout);
    $("pill-mood").addEventListener("click", () => navigate("mood"));
    $("pill-favorites").addEventListener("click", () => navigate("favorites"));
    $("pill-create-playlist").addEventListener("click", createEmptyPlaylist);
    $("btn-settings-back").addEventListener("click", () => navigate("home"));
    $("btn-refresh-trending").addEventListener("click", () => loadTrending());
    $("all-music-page-size").addEventListener("change", (event) => {
        allMusicPageSize = Number(event.currentTarget.value) === 100 ? 100 : 50;
        allMusicPage = 1;
        void loadAllMusicPage();
    });
    $("all-music-prev").addEventListener("click", () => {
        if (allMusicPage <= 1)
            return;
        allMusicPage -= 1;
        void loadAllMusicPage();
    });
    $("all-music-next").addEventListener("click", () => {
        if ($("all-music-next").disabled)
            return;
        allMusicPage += 1;
        void loadAllMusicPage();
    });
    $("btn-mood-go").addEventListener("click", async () => {
        const text = $("mood-text").value;
        if (!text.trim())
            return;
        await createSemanticMoodMix(text, false);
    });
    $("mood-text").addEventListener("keydown", (e) => {
        if (e.key === "Enter")
            $("btn-mood-go").click();
    });
    $("btn-hero-play").addEventListener("click", togglePlayPause);
    $("btn-new-playlist").addEventListener("click", createEmptyPlaylist);
    $("btn-ai-enhance").addEventListener("click", () => void enhanceCurrentPlaylist());
    $("btn-create-playlist").addEventListener("click", createPlaylist);
    $("btn-add-current-track").addEventListener("click", addCurrentTrackToPlaylist);
    $("btn-play-pause").addEventListener("click", togglePlayPause);
    $("btn-next").addEventListener("click", playNext);
    $("btn-prev").addEventListener("click", playPrev);
    $("btn-open-queue").addEventListener("click", () => navigate("playlist"));
    $("btn-clear-queue").addEventListener("click", () => {
        if (!state.queue.length)
            return;
        audioEl.pause();
        audioEl.removeAttribute("src");
        audioEl.load();
        activeAudioTrack = null;
        state.queue = [];
        state.currentIndex = -1;
        state.isPlaying = false;
        refreshPlayerViews();
        showToast("Queue cleared");
    });
    $("library-search").addEventListener("input", (event) => {
        librarySearchTerm = event.currentTarget.value;
        renderSavedPlaylists();
    });
    $("library-sort").addEventListener("change", (event) => {
        librarySortOrder = event.currentTarget.value;
        renderSavedPlaylists();
    });
    $("btn-shuffle").addEventListener("click", () => { state.shuffle = !state.shuffle; updateMiniPlayer(); showToast(state.shuffle ? "Shuffle on" : "Shuffle off"); });
    $("btn-repeat").addEventListener("click", () => { state.repeat = !state.repeat; updateMiniPlayer(); showToast(state.repeat ? "Repeat on" : "Repeat off"); });
    $("volume-control").addEventListener("input", (e) => {
        const volume = Number(e.currentTarget.value);
        audioEl.volume = volume;
    });
    $("mini-player").addEventListener("click", (event) => {
        if (event.target.closest(".transport, .volume-control, .progress"))
            return;
        openNowPlaying();
    });
    $("btn-now-playing-back").addEventListener("click", () => navigate("home"));
    $("btn-now-playing-play").addEventListener("click", togglePlayPause);
    $("btn-now-playing-prev").addEventListener("click", playPrev);
    $("btn-now-playing-next").addEventListener("click", playNext);
    $("btn-now-playing-shuffle").addEventListener("click", () => { state.shuffle = !state.shuffle; renderNowPlaying(); updateMiniPlayer(); });
    $("btn-now-playing-repeat").addEventListener("click", () => { state.repeat = !state.repeat; renderNowPlaying(); updateMiniPlayer(); });
    $("btn-now-playing-fav").addEventListener("click", () => { const track = state.queue[state.currentIndex]; if (track)
        void handleToggleFavorite(track); });
    $("btn-lyrics-toggle").addEventListener("click", () => {
        const button = $("btn-lyrics-toggle");
        const panel = $("lyrics-panel");
        const opening = panel.hidden !== false;
        panel.hidden = !opening;
        $("now-playing-body").classList.toggle("lyrics-open", opening);
        button.setAttribute("aria-expanded", String(opening));
        button.innerHTML = `<span>♪</span> ${opening ? "Hide lyrics" : "Show lyrics"}`;
        const track = state.queue[state.currentIndex];
        if (opening && track)
            void loadLyrics(track);
        if (opening)
            updateActiveLyricLine();
    });
    $("now-playing-seek").addEventListener("input", (e) => { if (audioEl.duration)
        audioEl.currentTime = Number(e.currentTarget.value) / 100 * audioEl.duration; });
    $("now-playing-volume").addEventListener("input", (e) => { audioEl.volume = Number(e.currentTarget.value); $("volume-control").value = String(audioEl.volume); });
    $("admin-user-search").addEventListener("input", renderAdminUsers);
    document.querySelectorAll("[data-route]:not(.nav-btn)").forEach((button) => button.addEventListener("click", () => {
        const route = button.dataset.route;
        if (route in screens)
            navigate(route);
    }));
    $("mini-fav").addEventListener("click", () => {
        const track = state.queue[state.currentIndex];
        if (track)
            handleToggleFavorite(track);
    });
    $("btn-remove-current").addEventListener("click", () => {
        activeAudioTrack = null;
        state.currentIndex = -1;
        state.isPlaying = false;
        audioEl.pause();
        audioEl.removeAttribute("src");
        audioEl.load();
        refreshPlayerViews();
        showToast("Player closed");
    });
    $("search-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = $("search-input");
        const term = input.value.trim();
        if (!term)
            return;
        $("search-results-title").textContent = `Results for “${term}”`;
        $("search-results").innerHTML = `<div class="loading-spinner"></div>`;
        await searchFullMusicCatalog(term);
    });
    $("btn-clear-history").addEventListener("click", async () => {
        if (!state.history.length && !state.listeningEvents.length)
            return;
        if (state.currentUser)
            await clearListeningHistory(state.currentUser.uid);
        else {
            localStorage.removeItem("miks.guestHistory");
            localStorage.removeItem("miks.guestListeningEvents");
        }
        state.history = [];
        state.listeningEvents = [];
        state.selectedListeningDate = null;
        renderWeekStrip();
        renderProfile();
        showToast("Listening history cleared");
    });
    $("btn-weekly-report").addEventListener("click", () => void generateWeeklyReport());
    // Settings
    $("toggle-quality").addEventListener("click", (e) => e.currentTarget.classList.toggle("on"));
    $("toggle-notif").addEventListener("click", (e) => e.currentTarget.classList.toggle("on"));
    $("logout-row").addEventListener("click", handleLogout);
    $("btn-install-app").addEventListener("click", () => void handleInstallApp());
    document.querySelectorAll("[data-theme-mode]").forEach((button) => button.addEventListener("click", () => {
        const selected = button.dataset.themeMode;
        if (selected !== "light" && selected !== "dark")
            return;
        themeMode = selected;
        localStorage.setItem("miks.themeMode", themeMode);
        applyAppearance();
    }));
    $("login-theme-toggle").addEventListener("click", () => {
        const icon = $("login-theme-icon");
        const nextMode = document.documentElement.dataset.effectiveMode === "dark" ? "light" : "dark";
        icon.classList.remove("theme-icon-spin");
        void icon.getBoundingClientRect();
        icon.classList.add("theme-icon-spin");
        themeMode = nextMode;
        localStorage.setItem("miks.themeMode", themeMode);
        applyAppearance();
        icon.addEventListener("animationend", () => icon.classList.remove("theme-icon-spin"), { once: true });
    });
}
// ---------- Init ----------
// Windows display scaling can make a wide Tauri window report a narrow CSS
// viewport. Mark the native desktop shell explicitly so its layout never
// falls back to the phone presentation.
const isDesktopShell = "__TAURI_INTERNALS__" in window;
document.documentElement.classList.toggle("desktop-shell", isDesktopShell);
function init() {
    applyAppearance();
    const connectionBadge = document.createElement("div");
    connectionBadge.id = "connection-status";
    connectionBadge.setAttribute("role", "status");
    connectionBadge.setAttribute("aria-live", "polite");
    document.body.append(connectionBadge);
    const updateConnectionStatus = () => {
        connectionBadge.textContent = navigator.onLine ? "Online · syncing changes" : "Offline · saved on this device";
        connectionBadge.classList.toggle("is-online", navigator.onLine);
        connectionBadge.classList.toggle("is-offline", !navigator.onLine);
    };
    window.addEventListener("online", updateConnectionStatus);
    window.addEventListener("offline", updateConnectionStatus);
    updateConnectionStatus();
    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        installPrompt = event;
        refreshInstallButton();
    });
    window.addEventListener("appinstalled", () => {
        installPrompt = null;
        refreshInstallButton();
        showToast("Miks app installed");
    });
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => void navigator.serviceWorker.register("/service-worker.js"));
    }
    wireStatic();
    const sidebarCollapsed = localStorage.getItem("miks.sidebarCollapsed") === "true";
    document.documentElement.classList.toggle("sidebar-collapsed", sidebarCollapsed);
    const sidebarToggle = $("btn-sidebar-collapse");
    sidebarToggle.textContent = sidebarCollapsed ? ">>" : "<<";
    sidebarToggle.title = sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
    sidebarToggle.setAttribute("aria-label", sidebarToggle.title);
    setAuthMode("login");
    applyFirebaseHint();
    renderHomeQuickMoods();
    try {
        state.history = JSON.parse(localStorage.getItem("miks.guestHistory") || "[]");
    }
    catch {
        state.history = [];
    }
    loadGuestListeningEvents();
    renderWeekStrip();
    renderHomeSections();
    if (state.apiKey)
        void loadTrending();
    updateAccountStatus();
    refreshInstallButton();
    $("bottom-nav").style.display = "none";
    onAuthChange((user) => {
        const googleButton = $("btn-google-signin");
        googleButton.disabled = false;
        const googleLabel = googleButton.querySelector("span");
        if (googleLabel && !user)
            googleLabel.textContent = "Continue with Google";
        if (user)
            onUserSignedIn(user);
        else
            onUserSignedOut();
    });
    if ("mediaSession" in navigator) {
        navigator.mediaSession.setActionHandler("play", togglePlayPause);
        navigator.mediaSession.setActionHandler("pause", togglePlayPause);
        navigator.mediaSession.setActionHandler("nexttrack", playNext);
        navigator.mediaSession.setActionHandler("previoustrack", playPrev);
    }
}
init();
