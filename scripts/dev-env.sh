#!/bin/bash
NODE_BIN=$(/usr/local/bin/claude_code/node -e "console.log(require('path').dirname(process.execPath))" 2>/dev/null)
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN/node" ]; then
  echo "ERROR: claude_code node not available" >&2
  return 1 2>/dev/null || exit 1
fi
export PATH="$NODE_BIN:$PATH"
