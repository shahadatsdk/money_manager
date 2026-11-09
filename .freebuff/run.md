# Run doc — Money Manager / Mega Box

## Project type
Static frontend (plain HTML/JS in `frontend/`) packaged into an Android APK via Capacitor.
No bundler and no build step for the web app — the preview serves the files as-is.

## How to reproduce the artifacts
Nothing to build for the web preview:

- `node_modules/` is only needed for the Android build (`npx cap sync android`, `gradlew`), not for the preview. If missing: `npm install`.
- No `.env` files exist in this project; nothing to copy from the main checkout.
- Web assets for the Android APK are produced by `npx cap sync android` after any `frontend/` change (copies `frontend/` into `android/app/src/main/assets/public/`).

## How to run the server
A dependency-free Node static server (`preview-server.js`) serves the `frontend/` directory:

```bash
npm run dev          # equivalent to: node preview-server.js
```

- Default port: **5173** (override with the `PORT` env var; the server binds `127.0.0.1` only).
- Open http://localhost:5173 — the auth screen (Login / Register) renders; the app uses a localStorage fallback in the browser (real SQLite on Android).

On Windows, start it detached so it outlives the conversation:

```powershell
powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -RedirectStandardOutput '<log>.out' -RedirectStandardError '<log>.err' -WindowStyle Hidden -PassThru).Id"
```

Then confirm the pid is alive (`Get-Process -Id <pid>`) and the URL answers before registering the preview.

## Android release flow (not needed for preview)
1. Copy changed `frontend/` files to the build checkout on `E:\money_manager_build`.
2. `cd E:\money_manager_build && npx cap sync android`
3. `cd android && JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot' ANDROID_HOME='E:\Apps\Android\Sdk' GRADLE_USER_HOME=/e/gradle-home ./gradlew assembleDebug`
   (Android SDK moved from `E:\Android\Sdk` to `E:\Apps\Android\Sdk`; `android/local.properties` in the build checkout already points at the new path.)
4. APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`; copy to the project root as `MegaBox.apk`.
