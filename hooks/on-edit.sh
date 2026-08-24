#!/bin/sh
# PostToolUse hook: after an Edit/Write on a *.tldx.jsx file, shells out to
# `tldx check` (and `tldx render` if clean) - no logic of its own.
set -eu

input=$(cat)
f=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

case "$f" in
  *.tldx.jsx) ;;
  *) exit 0 ;;
esac

[ -f "$f" ] || exit 0

if [ -n "${TLDX_BIN:-}" ]; then
  set -- $TLDX_BIN
elif [ -f "${CLAUDE_PLUGIN_ROOT:-}/dist/cli/main.js" ]; then
  set -- node "${CLAUDE_PLUGIN_ROOT:-}/dist/cli/main.js"
elif command -v tldx >/dev/null 2>&1; then
  set -- tldx
else
  exit 0
fi

emit() {
  jq -n --arg ctx "$1" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$ctx}}'
}

checkStatus=0
checkOut=$("$@" check "$f" 2>&1) || checkStatus=$?

if [ "$checkStatus" -ne 0 ]; then
  body="tldx check failed for $f:

$checkOut

Fix the diagram before continuing."
  emit "$body"
  exit 0
fi

tmp="${TMPDIR:-/tmp}"
out="${tmp%/}/tldx-render/$(basename "$f" .tldx.jsx).png"
mkdir -p "$(dirname "$out")"

renderStatus=0
"$@" render --reuse-only "$f" "$out" >/dev/null 2>&1 || renderStatus=$?

if [ "$renderStatus" -eq 0 ]; then
  body="tldx check $f: clean.
Rendered to $out - Read that file to look at the diagram."
else
  body="tldx check $f: clean.
No \`tldx serve\` is running for this file, so nothing was rendered. Run \`tldx serve $f\` to iterate live, or \`tldx render $f <out.png>\` to look at it once."
fi

emit "$body"
exit 0
