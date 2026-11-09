@echo off
setlocal enabledelayedexpansion

echo ======================================
echo   Money Manager - Android APK Builder
echo ======================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed!
    echo    Install it from: https://nodejs.org/
    exit /b 1
)

echo ✅ Node.js found
echo.

REM Step 1: Install dependencies
echo 📦 Step 1: Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ❌ npm install failed
    exit /b 1
)
echo.

REM Step 2: Initialize Capacitor (if not already done)
if not exist "android" (
    echo 🔧 Step 2: Initializing Capacitor...
    call npx cap init "Money Manager" "com.freemoney.manager" --web-dir frontend
    call npx cap add android
    echo.
) else (
    echo ✅ Step 2: Android project already exists
    echo.
)

REM Step 3: Copy custom resources
echo 🎨 Step 3: Copying custom resources...
if exist "android-resources\values\strings.xml" (
    copy /Y "android-resources\values\strings.xml" "android\app\src\main\res\values\strings.xml" >nul
    echo    ✅ Copied strings.xml
)
if exist "android-resources\values\colors.xml" (
    copy /Y "android-resources\values\colors.xml" "android\app\src\main\res\values\colors.xml" >nul
    echo    ✅ Copied colors.xml
)
echo.

REM Step 4: Sync web assets
echo 🔄 Step 4: Syncing web assets to Android...
call npx cap sync android
if %errorlevel% neq 0 (
    echo ❌ cap sync failed
    exit /b 1
)
echo.

REM Step 5: Build APK
echo 🏗️  Step 5: Building debug APK...
cd android
call gradlew.bat assembleDebug
cd ..

set APK_PATH=android\app\build\outputs\apk\debug\app-debug.apk

if exist "%APK_PATH%" (
    echo.
    echo ======================================
    echo   ✅ BUILD SUCCESSFUL!
    echo ======================================
    echo.
    echo 📱 APK location: %APK_PATH%
    echo.
    echo To install on your Android device:
    echo   1. Connect your phone via USB (enable USB debugging^)
    echo   2. Run: adb install %APK_PATH%
    echo.
    echo   OR
    echo.
    echo   1. Copy the APK to your phone
    echo   2. Open the file and tap Install
    echo   3. Allow 'Install from unknown sources' if prompted
    echo.
) else (
    echo ❌ Build failed. Check the errors above.
    exit /b 1
)

pause
