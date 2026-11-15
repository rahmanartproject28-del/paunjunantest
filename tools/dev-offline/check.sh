#!/bin/bash
cd /home/claude/chk && bash gen.sh && /home/claude/.npm-global/lib/node_modules/typescript/bin/tsc -p . 2>&1 | grep -v "tackle.ts(.*TS2709\|authority.ts(1[0-9][0-9]"
echo "tsc selesai"
