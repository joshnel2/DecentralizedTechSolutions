#!/bin/bash

# Build Apex Drive Desktop App
# This script builds installers for all platforms

set -e

echo "🚀 Building Apex Drive Desktop App..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build for all platforms
echo "🔨 Building installers..."

# Build for current platform first
npm run build

# For cross-platform builds, uncomment as needed:
# npm run build:win
# npm run build:mac
# npm run build:linux

echo "✅ Build complete!"
echo ""
echo "Installers are in the ./dist folder:"
ls -la dist/

echo ""
echo "📤 To deploy:"
echo "1. Upload installers to your web server's /downloads folder"
echo "2. Or upload to Azure Blob Storage for CDN delivery"
echo ""
echo "Example paths:"
echo "  Windows: /downloads/apex-drive-setup.exe"
echo "  Mac: /downloads/apex-drive.dmg"
