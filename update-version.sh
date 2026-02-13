#!/bin/bash
# Script to update version numbers for cache busting
# Run this before each deploy: ./update-version.sh

# Generate version number based on current timestamp
VERSION=$(date +%Y%m%d%H%M%S)

echo "📦 Updating cache busting version to: $VERSION"

# Update version in index.html (CSS, JS - any ?v=N)
sed -i.bak "s/?v=[0-9][0-9]*/?v=$VERSION/g" index.html

# Remove backup file
rm -f index.html.bak

echo "✅ Version updated successfully!"
echo "🔧 Files updated: index.html"
echo ""
echo "Now you can commit and push:"
echo "  git add index.html"
echo "  git commit -m \"Update cache busting version to $VERSION\""
echo "  git push"
