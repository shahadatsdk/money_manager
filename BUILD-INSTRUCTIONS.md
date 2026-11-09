# Money Manager - Android Build Guide

## Prerequisites

### 1. Install Node.js
Download and install from: https://nodejs.org/
- Version 18 or higher recommended

### 2. Install Java JDK 17
Download from: https://adoptium.net/
- Required for Android build

### 3. Install Android Studio
Download from: https://developer.android.com/studio
- During installation, make sure to install:
  - Android SDK
  - Android SDK Platform-Tools
  - Android SDK Build-Tools

### 4. Set Environment Variables

**Windows:**
```batch
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot
set PATH=%PATH%;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools
```

**macOS/Linux:**
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export JAVA_HOME=/path/to/jdk-17
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools
```

---

## Build the APK

### Option A: One-Click Build (Recommended)

**Windows:**
```
Double-click build-android.bat
```

**macOS/Linux:**
```bash
chmod +x build-android.sh
./build-android.sh
```

### Option B: Manual Build

```bash
# 1. Install dependencies
npm install

# 2. Initialize Capacitor (first time only)
npx cap init "Money Manager" "com.freemoney.manager" --web-dir frontend
npx cap add android

# 3. Sync web assets
npx cap sync android

# 4. Open in Android Studio
npx cap open android

# 5. Build from Android Studio:
#    Build → Build Bundle(s) / APK(s) → Build APK(s)
```

---

## Install on Your Phone

### Method 1: USB Install (Developer Mode)
1. Enable Developer Options on your phone:
   - Go to Settings → About Phone
   - Tap "Build Number" 7 times
2. Enable USB Debugging:
   - Go to Settings → Developer Options
   - Enable "USB Debugging"
3. Connect phone via USB
4. Run:
   ```bash
   adb install android/app/build/outputs/apk/debug/app-debug.apk
   ```

### Method 2: Transfer APK File
1. Find the APK at:
   ```
   android/app/build/outputs/apk/debug/app-debug.apk
   ```
2. Transfer to your phone (USB, email, cloud storage, etc.)
3. Open the APK file on your phone
4. Tap "Install"
5. If prompted, allow installation from unknown sources

---

## Build Release APK (Signed)

For production use, you need to sign the APK:

### 1. Generate a Keystore
```bash
keytool -genkey -v -keystore money-manager.keystore -alias money-manager -keyalg RSA -keysize 2048 -validity 10000
```

### 2. Configure Signing
Edit `android/app/build.gradle`:
```gradle
android {
    signingConfigs {
        release {
            storeFile file("path/to/money-manager.keystore")
            storePassword "your-store-password"
            keyAlias "money-manager"
            keyPassword "your-key-password"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

### 3. Build Release APK
```bash
cd android
./gradlew assembleRelease
```

---

## Activity Log & MySQL Sync (optional)

Every user action (login, logout, add/edit/delete transaction, budget and category
changes, backup export/import, view changes) is recorded. There is nothing to
enable for the first two places; MySQL is optional:

| Sink | Where | Requires |
|------|-------|----------|
| Local database | SQLite `activity_log` table on Android, `localStorage` (`mm_activity_log`) on the web | nothing |
| JSON file | `data/activity-log.jsonl` (append-only) + `data/snapshot.json` (full data mirror) | `npm run dev` |
| MySQL | `activity_log`, `users`, `categories`, `transactions`, `budgets` tables | `npm run dev` + `MYSQL_*` in `.env` |

Open **Account → Activity Log** in the app to see recent actions, sync them, or
download the log as JSON.

### Enabling MySQL

```bash
npm install          # installs mysql2 (already in package.json)
cp .env.example .env # then edit MYSQL_HOST / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE
npm run dev          # starts the app + /api on http://localhost:5174
```

The database must exist (e.g. `CREATE DATABASE money_manager;`); tables are
created automatically on first write. `GET /api/health` reports whether MySQL is
connected. Password hashes are **never** mirrored — they stay in the local database.

### API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | JSON/MySQL status, row counts |
| `POST` | `/api/activity` | `{ records: [...] }` → JSONL + MySQL (idempotent by record id) |
| `GET` | `/api/activity?user_id=1&limit=100` | Read the trail (MySQL when available, else JSON) |
| `POST` | `/api/sync` | `{ user, categories, transactions, budgets }` → JSON snapshot + MySQL mirror |
| `GET` | `/api/snapshot` | Last written snapshot |

### Android notes

The APK runs offline, so records are kept in SQLite and queued in
`localStorage` (`mm_audit_queue`). They are flushed automatically on the next
successful connection. To point the app at a server on your LAN, set the sync
base URL in the WebView once:

```js
localStorage.setItem("mm_api_base", "http://192.168.1.10:5174");
```

---

## Troubleshooting

### "SDK not found"
Make sure ANDROID_HOME is set correctly.

### "Java not found"
Make sure JAVA_HOME points to JDK 17.

### "Gradle build failed"
Try:
```bash
cd android
./gradlew clean
./gradlew assembleDebug
```

### App crashes on start
Check the logs:
```bash
adb logcat | grep -i "money"
```

### Activity log stays "offline — queued"
The app cannot reach the sync server. Start it with `npm run dev`, or set
`localStorage.mm_api_base` to the correct URL (see above). Nothing is lost —
records are kept locally until they send.

---

## App Details

- **App Name:** Money Manager
- **Package:** com.freemoney.manager
- **Min SDK:** Android 7.0 (API 24)
- **Target SDK:** Android 14 (API 34)
