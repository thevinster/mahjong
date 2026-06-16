#!/bin/bash
# Resolve Claude Code's bundled Node 24. If the dotslash extraction has gone
# stale (empty bin/), purge it once and let claude_code/node re-extract.
NODE_BIN=$(/usr/local/bin/claude_code/node -e "console.log(require('path').dirname(process.execPath))" 2>/dev/null)
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN/node" ]; then
  rm -rf "/tmp/dotslash-user-${USER:-leevince}/obj/manifold/3b" 2>/dev/null
  NODE_BIN=$(/usr/local/bin/claude_code/node -e "console.log(require('path').dirname(process.execPath))" 2>/dev/null)
fi
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN/node" ]; then
  echo "ERROR: claude_code node not available even after cache purge" >&2
  return 1 2>/dev/null || exit 1
fi
export PATH="$NODE_BIN:$PATH"
