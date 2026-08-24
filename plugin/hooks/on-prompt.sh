#!/bin/sh
# UserPromptSubmit hook: shells out to jq/find over tldx overlay files to
# warn about unabsorbed canvas changes - no logic of its own.
set -eu

input=$(cat)
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
[ -n "$cwd" ] || cwd="$PWD"

body=""

for o in $(find "$cwd" -name '*.tldx.overlay.json' -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' 2>/dev/null); do
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
