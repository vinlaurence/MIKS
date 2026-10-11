import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";
export async function sendPasswordReset(email) {
    if (!isFirebaseConfigured)
        return { ok: false, error: "Firebase isn't configured yet." };
    try {
        // @ts-ignore Firebase CDN modules are loaded by the browser at runtime.
        const appModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
        // @ts-ignore Firebase CDN modules are loaded by the browser at runtime.
        const authModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
        const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(firebaseConfig);
        await authModule.sendPasswordResetEmail(authModule.getAuth(app), email);
        return { ok: true };
    }
    catch (error) {
        const code = String(error?.code || "");
        if (code.includes("invalid-email"))
            return { ok: false, error: "That email address doesn't look right." };
        return { ok: false, error: "Couldn't send a reset email. Check the address and try again." };
    }
}
