#!/bin/sh
# UserPromptSubmit hook: shells out to jq/find over tldx overlay files to
# warn about unabsorbed canvas changes - no logic of its own.
set -eu

input=$(cat)
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
[ -n "$cwd" ] || cwd="$PWD"

body=""

# -prune, not -not -path: a path filter still descends into node_modules and
# stats every entry, which costs ~30s in a big monorepo and blows the hook's
# timeout. Pruning skips those trees outright.
for o in $(find "$cwd" \( -name node_modules -o -name .git -o -name dist \) -prune -o -name '*.tldx.overlay.json' -print 2>/dev/null); do
  n=$(jq '.entries | length' "$o" 2>/dev/null) || n=0
  case "$n" in
    ''|*[!0-9]*) continue ;;
  esac
  [ "$n" -gt 0 ] || continue
  src="${o%.overlay.json}.jsx"
  body="${body}- $n unabsorbed canvas change(s) in $src - run /tldx:sync
"
done

if [ -n "$body" ]; then
  printf 'tldx: the canvas and the source disagree.\n%s' "$body"
fi

exit 0
