#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK_ROOT="${NETLIFY_CACHE_DIR:-$HOME/.cache}/android-sdk"
JDK_ROOT="${NETLIFY_CACHE_DIR:-$HOME/.cache}/temurin-21"
TOOLS_ARCHIVE="${TMPDIR:-/tmp}/android-command-line-tools.zip"
JDK_ARCHIVE="${TMPDIR:-/tmp}/temurin-21.tar.gz"
TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip"
TOOLS_SHA256="4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583"
JDK_METADATA_URL="https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&heap_size=normal&image_type=jdk&jvm_impl=hotspot&os=linux&page_size=1"
ANDROID_NDK_VERSION="27.2.12479018"

export ANDROID_HOME="$SDK_ROOT"
export ANDROID_SDK_ROOT="$SDK_ROOT"
export ANDROID_USER_HOME="${NETLIFY_CACHE_DIR:-$HOME/.cache}/android-user"
mkdir -p "$ANDROID_HOME/cmdline-tools"

if [[ ! -x "$JDK_ROOT/bin/java" ]]; then
  JDK_METADATA="$(curl --fail --location --silent --show-error "$JDK_METADATA_URL")"
  JDK_URL="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())[0]["binary"]["package"]["link"])' <<< "$JDK_METADATA")"
  JDK_SHA256="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())[0]["binary"]["package"]["checksum"])' <<< "$JDK_METADATA")"
  curl --fail --location --silent --show-error "$JDK_URL" --output "$JDK_ARCHIVE"
  echo "$JDK_SHA256  $JDK_ARCHIVE" | sha256sum --check --status
  mkdir -p "$JDK_ROOT"
  tar -xzf "$JDK_ARCHIVE" --strip-components=1 -C "$JDK_ROOT"
  rm -f "$JDK_ARCHIVE"
fi
export JAVA_HOME="$JDK_ROOT"
export PATH="$JAVA_HOME/bin:$PATH"

if [[ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]]; then
  curl --fail --location --silent --show-error "$TOOLS_URL" --output "$TOOLS_ARCHIVE"
  echo "$TOOLS_SHA256  $TOOLS_ARCHIVE" | sha256sum --check --status
  TOOLS_TMP="$(mktemp -d)"
  unzip -q "$TOOLS_ARCHIVE" -d "$TOOLS_TMP"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  mv "$TOOLS_TMP/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf "$TOOLS_TMP" "$TOOLS_ARCHIVE"
fi

export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
export NDK_HOME="$ANDROID_HOME/ndk/$ANDROID_NDK_VERSION"
export ANDROID_NDK_HOME="$NDK_HOME"

if [[ "${ANDROID_SDK_LICENSES_ACCEPTED:-}" != "yes" ]]; then
  echo "Review the Android SDK license in Netlify, then set ANDROID_SDK_LICENSES_ACCEPTED=yes to enable the APK build." >&2
  exit 1
fi
yes | sdkmanager --licenses >/dev/null
sdkmanager \
  "platform-tools" \
  "platforms;android-35" \
  "platforms;android-36" \
  "build-tools;35.0.0" \
  "build-tools;36.0.0" \
  "ndk;$ANDROID_NDK_VERSION"

rustup toolchain install stable --profile minimal
rustup default stable
rustup target add aarch64-linux-android

cd "$ROOT"
npm ci --include=dev
npm run android:prepare
if [[ ! -d "$ROOT/src-tauri/gen/android" ]]; then
  npm run android:init
fi
npx tauri icon icons/miks-logo.svg
npx tauri android build --apk --debug --target aarch64 --ci

APK_PATH="$(find "$ROOT/src-tauri/gen/android/app/build/outputs/apk" -type f -name '*.apk' ! -name '*-unsigned.apk' -print -quit)"
if [[ -z "$APK_PATH" ]]; then
  echo "Android build finished without a signed APK." >&2
  exit 1
fi

mkdir -p "$ROOT/installer"
cp "$APK_PATH" "$ROOT/installer/miks.apk"
cat > "$ROOT/installer/index.html" <<'HTML'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#101311">
  <title>Install Miks for Android</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#101311;color:#f4f7f4;font:16px system-ui,sans-serif}.card{width:min(440px,100%);padding:32px;border:1px solid #ffffff30;border-radius:24px;background:#ffffff10;backdrop-filter:blur(18px);text-align:center}h1{margin:0 0 8px;font-size:32px}p{color:#c3cdc5;line-height:1.55}.download{display:block;margin:24px 0 12px;padding:15px;border-radius:14px;background:#80d890;color:#101311;text-decoration:none;font-weight:800}.note{font-size:13px;color:#9aa69c}
  </style>
</head>
<body>
  <main class="card">
    <h1>miks</h1>
    <p>Install the Miks Android app.</p>
    <a class="download" href="/miks.apk" download>Download Android APK</a>
    <p class="note">After downloading, open the APK and follow Android’s install prompts.</p>
  </main>
</body>
</html>
HTML
