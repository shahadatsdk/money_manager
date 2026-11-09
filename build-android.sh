#!/bin/bash
set -e

echo "======================================"
echo "  Money Manager - Android APK Builder"
echo "======================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "   Install it from: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node -v)"
echo "✅ npm found: $(npm -v)"
echo ""

# Step 1: Install dependencies
echo "📦 Step 1: Installing dependencies..."
npm install
echo ""

# Step 2: Initialize Capacitor (if not already done)
if [ ! -d "android" ]; then
    echo "🔧 Step 2: Initializing Capacitor..."
    npx cap init "Money Manager" "com.freemoney.manager" --web-dir frontend
    npx cap add android
    echo ""
else
    echo "✅ Step 2: Android project already exists"
    echo ""
fi

# Step 3: Copy custom resources
echo "🎨 Step 3: Copying custom resources..."
if [ -d "android-resources" ]; then
    # Copy strings
    if [ -f "android-resources/values/strings.xml" ]; then
        cp android-resources/values/strings.xml android/app/src/main/res/values/strings.xml
        echo "   ✅ Copied strings.xml"
    fi
    # Copy colors
    if [ -f "android-resources/values/colors.xml" ]; then
        cp android-resources/values/colors.xml android/app/src/main/res/values/colors.xml
        echo "   ✅ Copied colors.xml"
    fi
fi
echo ""

# Step 4: Sync web assets
echo "🔄 Step 4: Syncing web assets to Android..."
npx cap sync android
echo ""

# Step 5: Build APK
echo "🏗️  Step 5: Building debug APK..."
cd android
./gradlew assembleDebug
cd ..

APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"

if [ -f "$APK_PATH" ]; then
    echo ""
    echo "======================================"
    echo "  ✅ BUILD SUCCESSFUL!"
    echo "======================================"
    echo ""
    echo "📱 APK location: $APK_PATH"
    echo ""
    echo "To install on your Android device:"
    echo "  1. Connect your phone via USB (enable USB debugging)"
    echo "  2. Run: adb install $APK_PATH"
    echo ""
    echo "  OR"
    echo ""
    echo "  1. Copy the APK to your phone"
    echo "  2. Open the file and tap Install"
    echo "  3. Allow 'Install from unknown sources' if prompted"
    echo ""
else
    echo "❌ Build failed. Check the errors above."
    exit 1
fi
