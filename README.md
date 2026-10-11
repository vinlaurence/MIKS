# Miks app builds

## Installable web app

The Firebase-hosted Miks site is a Progressive Web App. In Chrome or Edge, open the site and use the install icon in the address bar (or the browser menu, **Install Miks**) to add it as an app.

## Windows installer

The `src-tauri` folder packages this same app as a Windows installer. On a Windows development computer with Rust installed, run:

```powershell
npm install
npm run desktop:build
```

The NSIS installer will be created under `src-tauri/target/release/bundle/nsis/`.

## Android APK installer on Netlify

Netlify can build and host a test APK without replacing Firebase Hosting or Firebase services. The Android build is configured in `netlify.toml`; it publishes a download page and `miks.apk`.

1. Import the Git repository into Netlify and set its base directory to the folder containing this `README.md` and `netlify.toml`.
2. Review and accept the Android SDK license terms for the build, then add the Netlify build environment variable `ANDROID_SDK_LICENSES_ACCEPTED=yes`.
3. Trigger a deploy. Netlify builds the Android arm64 debug APK and publishes it at the site's root as `/miks.apk`.

The generated APK is debug-signed for direct installation and testing. Publishing through an app store requires a release signing key and the store's release setup.

## Miks AI backend

Natural language mood mapping, playlist enhancement, and weekly listening reflections use an authenticated Firebase callable function. The OpenAI API key is stored in Firebase Secret Manager and is never included in the web app.

To enable the live AI features:

```powershell
firebase functions:secrets:set OPENAI_API_KEY
firebase deploy --only functions
npm run build
firebase deploy --only hosting
```

The secret command prompts for the OpenAI API key. Deploying Cloud Functions requires the Firebase project to use the Blaze plan; see the [Firebase Functions setup requirements](https://firebase.google.com/docs/functions/get-started). The callable function limits each signed-in account to 20 AI requests per day.
