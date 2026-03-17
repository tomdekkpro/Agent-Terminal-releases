#!/bin/bash
# Usage: ./scripts/release.sh [patch|minor|major]
# Bumps version, creates git tag, pushes to trigger CI/CD release

set -e

BUMP_TYPE=${1:-patch}

if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" ]]; then
  echo "Usage: $0 [patch|minor|major]"
  exit 1
fi

# Ensure clean working tree
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working tree is not clean. Commit or stash changes first."
  exit 1
fi

# Read current version
CURRENT=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT"

# Bump version (npm version creates commit + tag)
NEW_VERSION=$(npm version "$BUMP_TYPE" --no-git-tag-version)
echo "New version: $NEW_VERSION"

# Update version in UI files (NEW_VERSION has v prefix, e.g. v1.0.3)
NEW_VER=${NEW_VERSION#v}

# Update centralized version constant
sed -i "s/APP_VERSION = '${CURRENT}'/APP_VERSION = '${NEW_VER}'/" src/renderer/lib/version.ts 2>/dev/null || \
  sed -i '' "s/APP_VERSION = '${CURRENT}'/APP_VERSION = '${NEW_VER}'/" src/renderer/lib/version.ts

# Commit and tag
git add package.json package-lock.json src/renderer/lib/version.ts
git commit -m "Release ${NEW_VERSION}"
git tag "${NEW_VERSION}"

echo ""
echo "Created tag ${NEW_VERSION}"
echo ""
echo "To publish the release, push the tag:"
echo "  git push origin Develop --tags"
echo ""
echo "This will trigger GitHub Actions to build for Windows, macOS, and Linux."
echo "Releases are published to: https://github.com/tomdekkpro/Agent-Terminal-releases"
