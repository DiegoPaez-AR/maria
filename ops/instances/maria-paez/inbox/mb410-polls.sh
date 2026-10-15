#!/bin/bash
# Solo lectura: polls por bridge (secret truncado) y códigos HTTP desde el update
L=/var/log/nginx/intensa.io.access.log
grep "wa-hook/" $L | grep "15/Oct/2026:1[2-4]:" | awk '$4>="[15/Oct/2026:12:30"' | \
  sed -E 's/.*\[15\/Oct\/2026:([0-9:]+) [^]]*\] "[A-Z]+ [^ ]*wa-hook\/([^\/ ]{4})[^\/ ]*\/([a-z]+)[^"]*" ([0-9]{3}).*/\2 \3 \4 \1/' | \
  awk '{k=$1" "$2" "$3; n[k]++; last[k]=$4} END {for (k in n) print "  " k ": " n[k] "x, último " last[k]}' | sort
