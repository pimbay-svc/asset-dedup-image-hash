#!/usr/bin/env bash
# Cuts release branch: bumps package.json/package-lock.json (major|minor|patch), moves docs/CHANGELOG.md's [Unreleased]
# section into a new dated version section, commits both as a single "release:vX.Y.Z" commit on a fresh release_X.Y.Z
# branch, and pushes it — nothing more.
# Opening the PR into contrib, review, and merge stay manual/normal: this script only prepares the branch, it never
# touches contrib, main, or any tag directly (tagging happens on Codeberg, after merge into main).
#
# Usage: scripts/release/release-tag.sh <patch|minor|major>

set -euo pipefail

CHANGELOG="docs/CHANGELOG.md"
UNRELEASED_HEADING="## [Unreleased]"

move_unreleased_changelog() {
  local version="$1"
  local new_heading="## [${version}] - $(date -u +%Y-%m-%d)"
  local rc

  awk -v new_heading="$new_heading" -v unreleased="$UNRELEASED_HEADING" '
    BEGIN { state = 0 } # 0 = before Unreleased, 1 = inside its body, 2 = done
    state == 0 {
      print
      if ($0 == unreleased) { state = 1 }
      next
    }
    state == 1 {
      if ($0 ~ /^## \[/) {
        gsub(/^\n+/, "", body)
        gsub(/\n+$/, "", body)
        if (body == "") {
          print "EMPTY_UNRELEASED" > "/dev/stderr"
          exit 3
        }
        if (has_internal && !has_other) {
          print "WARNING: [Unreleased] only contains \"### Internal\" entries — this release does not change the service, double-check whether it is actually needed." > "/dev/stderr"
        }
        print ""
        print new_heading
        print ""
        printf "%s", body
        print ""
        print ""
        print
        state = 2
        next
      }
      if ($0 ~ /^### /) {
        if ($0 == "### Internal") { has_internal = 1 } else { has_other = 1 }
      }
      body = body $0 "\n"
      next
    }
    { print }
    END {
      if (state == 0) {
        print "NO_UNRELEASED_HEADING" > "/dev/stderr"
        exit 1
      }
      if (state == 1) {
        print "NO_HEADING_AFTER_UNRELEASED" > "/dev/stderr"
        exit 2
      }
    }
  ' "$CHANGELOG" > "${CHANGELOG}.tmp"
  rc=$?

  if [[ $rc -ne 0 ]]; then
    rm -f "${CHANGELOG}.tmp"
    return "$rc"
  fi

  mv "${CHANGELOG}.tmp" "$CHANGELOG"
}

BUMP="${1:-}"
if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "usage: $(basename "$0") <patch|minor|major>" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is not clean — commit or stash first" >&2
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "contrib" ]]; then
  echo "error: release must be cut from 'contrib' (currently on '${CURRENT_BRANCH}')" >&2
  exit 1
fi

git fetch origin contrib
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/contrib)" ]]; then
  echo "error: local 'contrib' is not up to date with 'origin/contrib' — pull first" >&2
  exit 1
fi

npm version "$BUMP" --no-git-tag-version --ignore-scripts
VERSION="$(node -p "require('./package.json').version")"

if ! move_unreleased_changelog "$VERSION"; then
  echo "error: could not move ${UNRELEASED_HEADING} in ${CHANGELOG} — see reason above." >&2
  echo "rolling back the version bump in package.json/package-lock.json." >&2
  git checkout -- package.json package-lock.json
  exit 1
fi

BRANCH="release_${VERSION}"
git checkout -b "$BRANCH"
git add -A
git commit -m "release:v${VERSION}"
git push -u origin "$BRANCH"

echo
echo "Pushed '${BRANCH}'. Open a PR into 'contrib' to continue the normal release flow:"
echo "  contrib CI -> approve -> squash merge -> sync to Codeberg -> merge into main -> tag on Codeberg -> mirror to GitHub"

if command -v gh >/dev/null 2>&1; then
  echo
  read -r -p "Open the PR now with 'gh pr create'? [y/N] " REPLY
  if [[ "$REPLY" =~ ^[Yy]$ ]]; then
    gh pr create --base contrib --head "$BRANCH" --title "release:v${VERSION}" --fill
  fi
fi
