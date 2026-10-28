#!/bin/sh
set -eu

version="v$(node -p "require('./package.json').version")"
[ "$(git branch --show-current)" = main ] || { echo "Releases come from main."; exit 1; }
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "main is not up to date with origin."; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Commit or stash your changes first."; exit 1; }

previous=$(gh release list --exclude-pre-releases --limit 1 --json tagName --jq '.[0].tagName // empty')

if [ $# -gt 0 ]; then
	gh release create "$version-$1" --target main --generate-notes --prerelease --title "$version-$1"
elif [ -n "$previous" ]; then
	gh release create "$version" --target main --generate-notes --notes-start-tag "$previous" --title "$version"
else
	gh release create "$version" --target main --generate-notes --title "$version"
fi
