#!/bin/bash
# pakai: shot.sh <nama> "<query>" W H wait "<js>"
curl -s -o /dev/null http://localhost:8765/ || { (cd /home/claude && nohup python3 -m http.server 8765 >/dev/null 2>&1 &); sleep 1; }
mkdir -p /home/claude/chk/g3
sed "s#/home/claude/chk/g3/\${out}.png#/home/claude/chk/g3/\${out}.png#" /home/claude/chk/shot3d.js > /home/claude/chk/g3/run.js
cd /home/claude/chk/g3 && timeout 560 node run.js "$2" "$1" "${3:-1536}" "${4:-1024}" "${5:-12000}" "$6" 2>&1 | grep -a -v "Mismatch\|vibrate" | cut -c1-400 | tail -6
