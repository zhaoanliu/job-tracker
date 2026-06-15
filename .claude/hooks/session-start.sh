#!/bin/bash
set -e
# Pull latest main
git pull --ff-only

REPO=$(git rev-parse --show-toplevel)

# Remove worktrees whose PR has been merged or closed
git worktree list --porcelain | awk -v main="$REPO" '
  BEGIN { p=""; b="" }
  /^worktree/ { p=$2; b="" }
  /^branch/   { b=$2 }
  /^$/         { if (p != "" && p != main && b != "") print p "|" b }
' | while IFS="|" read -r wt branch_ref; do
  branch="${branch_ref#refs/heads/}"
  state=$(gh pr view "$branch" --json state -q ".state" 2>/dev/null)
  if [ "$state" = "MERGED" ] || [ "$state" = "CLOSED" ]; then
    git -C "$REPO" worktree remove "$wt" --force 2>/dev/null || true
  fi
done

git worktree prune 2>/dev/null || true
