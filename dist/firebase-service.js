import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";
// Firebase is loaded only when it has been configured. Keeping this dynamic is
// important: guests can still use the app when offline or when Firebase's CDN
// is blocked by a browser/network.
let auth = null;
let db = null;
let appInstance = null;
let firebase = null;
let firebaseLoad = null;
async function loadFirebase() {
    if (!isFirebaseConfigured || auth)
        return;
    if (!firebaseLoad) {
        firebaseLoad = Promise.all([
            // @ts-ignore Firebase CDN modules are loaded by the browser at runtime.
            import("https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js"),
            // @ts-ignore Firebase CDN modules are loaded by the browser at runtime.
            import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js"),
            // @ts-ignore Firebase CDN modules are loaded by the browser at runtime.
            import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js"),
        ]).then(async ([appModule, authModule, firestoreModule]) => {
            firebase = { ...authModule, ...firestoreModule };
            appInstance = appModule.initializeApp(firebaseConfig);
            auth = authModule.getAuth(appInstance);
            db = firestoreModule.getFirestore(appInstance);
            // Persist Firestore's document cache and queue writes while offline.
            // Unsupported browsers / already-initialized persistence should keep
            // Firebase usable with its default in-memory cache.
            if (typeof indexedDB !== "undefined" && firestoreModule.enableIndexedDbPersistence) {
                try {
                    await firestoreModule.enableIndexedDbPersistence(db);
                }
                catch { /* Best-effort offline persistence. */ }
            }
        });
    }
    return firebaseLoad ?? Promise.resolve();
}
export const firebaseReady = isFirebaseConfigured;
export function getCurrentUser() {
    return auth?.currentUser || null;
}
export async function analyzeMusicWithAI(payload) {
    await loadFirebase();
    if (!auth?.currentUser || !appInstance)
        throw new Error("Sign in to use Miks AI.");
    // @ts-ignore Firebase callable Functions SDK is loaded from the same CDN as Auth and Firestore.
    const functionsModule = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js");
    const functions = functionsModule.getFunctions(appInstance, "us-central1");
    const analyze = functionsModule.httpsCallable(functions, "analyzeMusic");
    const result = await analyze(payload);
    return result.data;
}
export async function searchMusicCatalog(query) {
    await loadFirebase();
    if (!appInstance)
        throw new Error("Music catalog search is unavailable because Firebase isn't configured.");
    // @ts-ignore Firebase callable Functions SDK is loaded from the same CDN as Auth and Firestore.
    const functionsModule = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js");
    const functions = functionsModule.getFunctions(appInstance, "us-central1");
    const search = functionsModule.httpsCallable(functions, "searchMusicCatalog");
    const result = await search({ query });
    return Array.isArray(result.data?.recordings) ? result.data.recordings : [];
}
export function onAuthChange(cb) {
    if (!isFirebaseConfigured) {
        cb(null);
        return;
    }
    void loadFirebase()
        .then(() => firebase.onAuthStateChanged(auth, cb))
        .catch(() => cb(null));
}
export async function signUp(email, password) {
    if (!isFirebaseConfigured)
        return { ok: false, error: "Firebase isn't configured yet." };
    try {
        await loadFirebase();
        await firebase.createUserWithEmailAndPassword(auth, email, password);
        return { ok: true };
    }
    catch (e) {
        return { ok: false, error: friendlyAuthError(e) };
    }
}
export async function signIn(email, password) {
    if (!isFirebaseConfigured)
        return { ok: false, error: "Firebase isn't configured yet." };
    try {
        await loadFirebase();
        await firebase.signInWithEmailAndPassword(auth, email, password);
        return { ok: true };
    }
    catch (e) {
        return { ok: false, error: friendlyAuthError(e) };
    }
}
export async function signInWithGoogle() {
    if (!isFirebaseConfigured)
        return { ok: false, error: "Firebase isn't configured yet." };
    try {
        await loadFirebase();
        const provider = new firebase.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        await firebase.signInWithPopup(auth, provider);
        return { ok: true };
    }
    catch (e) {
        const code = String(e?.code || "");
        if (code.includes("popup-closed-by-user"))
            return { ok: false, error: "Google sign-in was cancelled." };
        if (code.includes("popup-blocked"))
            return { ok: false, error: "Your browser blocked the Google sign-in window. Allow pop-ups and try again." };
        if (code.includes("operation-not-allowed"))
            return { ok: false, error: "Google sign-in is disabled in Firebase. Enable the Google provider in Firebase Console → Authentication → Sign-in method." };
        if (code.includes("unauthorized-domain"))
            return { ok: false, error: `This app domain (${location.hostname}) isn’t authorized for Google sign-in. Add it in Firebase Console → Authentication → Settings → Authorized domains.` };
        if (code.includes("network-request-failed"))
            return { ok: false, error: "Google sign-in couldn’t reach Firebase. Check your connection, then try again." };
        if (code.includes("web-storage-unsupported"))
            return { ok: false, error: "Google sign-in needs browser storage. Enable cookies and site data, then try again." };
        if (code.includes("internal-error"))
            return { ok: false, error: "Firebase could not complete Google sign-in. Check that Google is enabled in Firebase Authentication and that the app's domain is authorized, then try again." };
        return { ok: false, error: e?.message || "Google sign-in failed. Please try again." };
    }
}
export async function signOutUser() {
    await loadFirebase();
    if (!auth)
        return;
    await firebase.signOut(auth);
}
function friendlyAuthError(e) {
    const code = e?.code || "";
    if (code.includes("email-already-in-use"))
        return "That email already has an account — try logging in.";
    if (code.includes("invalid-credential") || code.includes("wrong-password"))
        return "Wrong email or password.";
    if (code.includes("user-not-found"))
        return "No account with that email yet — try signing up.";
    if (code.includes("weak-password"))
        return "Password should be at least 6 characters.";
    if (code.includes("invalid-email"))
        return "That email doesn't look right.";
    return e?.message || "Something went wrong.";
}
// ---------- Favorites ----------
export async function toggleFavorite(uid, track) {
    await loadFirebase();
    if (!db)
        return false;
    const ref = firebase.doc(db, "users", uid, "favorites", String(track.id));
    const snap = await firebase.getDoc(ref);
    if (snap.exists()) {
        await firebase.deleteDoc(ref);
        return false;
    }
    await firebase.setDoc(ref, {
        id: String(track.id),
        name: track.name,
        artist_name: track.artist_name,
        image: track.image || track.album_image,
        album_image: track.album_image || track.image,
        audio: track.audio,
        duration: track.duration,
        savedAt: firebase.serverTimestamp(),
    });
    return true;
}
export async function getFavorites(uid) {
    await loadFirebase();
    if (!db)
        return [];
    const snap = await firebase.getDocs(firebase.collection(db, "users", uid, "favorites"));
    return snap.docs.map((d) => d.data());
}
// ---------- Playlists ----------
export async function getPlaylists(uid) {
    await loadFirebase();
    if (!db)
        return [];
    const snap = await firebase.getDocs(firebase.collection(db, "users", uid, "playlists"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function savePlaylist(uid, playlist) {
    await loadFirebase();
    if (!db)
        return;
    const id = String(playlist.id || playlist.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || Date.now());
    await firebase.setDoc(firebase.doc(db, "users", uid, "playlists", id), {
        id, name: playlist.name, tracks: playlist.tracks || [], updatedAt: firebase.serverTimestamp(),
    });
}
// ---------- Mood sessions / streak ----------
export async function logMoodSession(uid, moodLabel) {
    await loadFirebase();
    if (!db)
        return;
    const dateKey = new Date().toISOString().slice(0, 10);
    await firebase.setDoc(firebase.doc(db, "users", uid, "moodSessions", dateKey), { date: dateKey, mood: moodLabel, loggedAt: firebase.serverTimestamp() }, { merge: true });
    await firebase.addDoc(firebase.collection(db, "users", uid, "moodEvents"), {
        date: dateKey, mood: moodLabel, loggedAt: firebase.serverTimestamp(),
    });
}
export async function getSessionDates(uid) {
    await loadFirebase();
    if (!db)
        return [];
    const snap = await firebase.getDocs(firebase.collection(db, "users", uid, "moodSessions"));
    return snap.docs.map((d) => d.id);
}
export async function getMoodHistory(uid) {
    await loadFirebase();
    if (!db)
        return [];
    const snap = await firebase.getDocs(firebase.query(firebase.collection(db, "users", uid, "moodEvents"), firebase.orderBy("loggedAt", "desc"), firebase.limit(100)));
    return snap.docs.map((doc) => doc.data());
}
// ---------- Listening history ----------
function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export async function saveListeningEvent(uid, track, playedAt = new Date()) {
    await loadFirebase();
    if (!db)
        return;
    const trackData = {
        id: String(track.id), name: track.name, artist_name: track.artist_name,
        image: track.image || track.album_image, album_image: track.album_image || track.image,
        audio: track.audio, duration: track.duration,
    };
    const dateKey = localDateKey(playedAt);
    const dailyEventId = `${dateKey}_${encodeURIComponent(String(track.id))}`;
    await Promise.all([
        firebase.setDoc(firebase.doc(db, "users", uid, "history", String(track.id)), {
            ...trackData, playedAt: firebase.serverTimestamp(),
        }),
        firebase.setDoc(firebase.doc(db, "users", uid, "playEvents", dailyEventId), {
            ...trackData, playedAt: firebase.Timestamp.fromDate(playedAt),
        }, { merge: true }),
    ]);
}
export async function saveListeningInteraction(uid, track, type, details = {}) {
    await loadFirebase();
    if (!db)
        return;
    const finiteSeconds = (value) => {
        const seconds = Number(value);
        return Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    };
    await firebase.addDoc(firebase.collection(db, "users", uid, "listeningInteractions"), {
        trackId: String(track.id),
        trackName: String(track.name || ""),
        artistName: String(track.artist_name || ""),
        type,
        listenedSeconds: finiteSeconds(details.listenedSeconds),
        durationSeconds: finiteSeconds(details.durationSeconds || track.duration),
        createdAt: firebase.serverTimestamp(),
    });
}
export async function getListeningInteractions(uid) {
    await loadFirebase();
    if (!db)
        return [];
    const snap = await firebase.getDocs(firebase.query(firebase.collection(db, "users", uid, "listeningInteractions"), firebase.orderBy("createdAt", "desc"), firebase.limit(300)));
    return snap.docs.map((doc) => doc.data());
}
export async function getListeningHistory(uid) {
    await loadFirebase();
    if (!db)
        return [];
    const snap = await firebase.getDocs(firebase.query(firebase.collection(db, "users", uid, "history"), firebase.orderBy("playedAt", "desc"), firebase.limit(30)));
    return snap.docs.map((d) => d.data());
}
export async function getListeningEvents(uid, start, end) {
    await loadFirebase();
    if (!db)
        return [];
    const snap = await firebase.getDocs(firebase.query(firebase.collection(db, "users", uid, "playEvents"), firebase.where("playedAt", ">=", firebase.Timestamp.fromDate(start)), firebase.where("playedAt", "<", firebase.Timestamp.fromDate(end)), firebase.orderBy("playedAt", "asc"), firebase.limit(500)));
    return snap.docs.map((doc) => {
        const data = doc.data();
        return {
            track: { ...data, id: String(data.id) },
            playedAt: data.playedAt.toDate().toISOString(),
        };
    });
}
export async function clearListeningHistory(uid) {
    await loadFirebase();
    if (!db)
        return;
    const [history, events] = await Promise.all([
        firebase.getDocs(firebase.collection(db, "users", uid, "history")),
        firebase.getDocs(firebase.collection(db, "users", uid, "playEvents")),
    ]);
    await Promise.all([...history.docs, ...events.docs].map((doc) => firebase.deleteDoc(doc.ref)));
}
// ---------- Admin activity ----------
export async function recordAppOpen(user) {
    await loadFirebase();
    // Read the current auth state after Firebase is ready. This avoids logging
    // a previous account when sign-in/sign-out events occur close together.
    const currentUser = auth?.currentUser;
    if (!db || !currentUser?.uid)
        return;
    const uid = String(currentUser.uid);
    const email = String(currentUser.email || "Unknown user");
    // One user document per account. Do not write a visit row on refresh.
    await firebase.setDoc(firebase.doc(db, "users", uid), {
        uid, email, signedUpAt: currentUser.metadata?.creationTime || new Date().toISOString(),
    }, { merge: true });
}
export async function getAdminDashboard() {
    await loadFirebase();
    if (!db)
        return { users: [] };
    const users = await firebase.getDocs(firebase.collection(db, "users"));
    return { users: users.docs.map((d) => d.data()) };
}
