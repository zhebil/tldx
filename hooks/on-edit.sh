#!/bin/sh
# PostToolUse hook: after an Edit/Write on a *.tldsl.jsx file, shells out to
# `tldsl check` (and `tldsl render` if clean) - no logic of its own.
set -eu

input=$(cat)
f=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

case "$f" in
  *.tldsl.jsx) ;;
  *) exit 0 ;;
esac

[ -f "$f" ] || exit 0

if [ -n "${TLDSL_BIN:-}" ]; then
  set -- $TLDSL_BIN
elif [ -f "${CLAUDE_PLUGIN_ROOT:-}/dist/cli/main.js" ]; then
  set -- node "${CLAUDE_PLUGIN_ROOT:-}/dist/cli/main.js"
elif command -v tldsl >/dev/null 2>&1; then
  set -- tldsl
else
  exit 0
fi

emit() {
  jq -n --arg ctx "$1" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$ctx}}'
}

checkStatus=0
checkOut=$("$@" check "$f" 2>&1) || checkStatus=$?

if [ "$checkStatus" -ne 0 ]; then
  body="tldsl check failed for $f:

$checkOut

Fix the diagram before continuing."
  emit "$body"
  exit 0
fi

tmp="${TMPDIR:-/tmp}"
out="${tmp%/}/tldsl-render/$(basename "$f" .tldsl.jsx).png"
mkdir -p "$(dirname "$out")"

renderStatus=0
"$@" render --reuse-only "$f" "$out" >/dev/null 2>&1 || renderStatus=$?

if [ "$renderStatus" -eq 0 ]; then
  body="tldsl check $f: clean.
Rendered to $out - Read that file to look at the diagram."
else
  body="tldsl check $f: clean.
No \`tldsl serve\` is running for this file, so nothing was rendered. Run \`tldsl serve $f\` to iterate live, or \`tldsl render $f <out.png>\` to look at it once."
fi

emit "$body"
exit 0
