#!/bin/bash
# Solo lectura: polls por bridge (secret truncado a 4) y códigos HTTP desde 12:30
L=/var/log/nginx/intensa.io.access.log
grep "pendiente.txt" $L | tail -2 | sed -E 's/wa-hook\/(....)[^\/]*/wa-hook\/\1…/; s/^[0-9.]+/IP/'
echo "──"
grep "wa-hook/" $L | grep "15/Oct/2026:1[2-4]:" | awk '{
  t=substr($4,14,8); if (t < "12:30:00") next;
  n=split($7,p,"/"); for(i=1;i<=n;i++) if(p[i]=="wa-hook"){s=substr(p[i+1],1,4); r=p[i+2]}
  sub(/\?.*/,"",r); k=s" "r" "$9; c[k]++; last[k]=t }
  END { for (k in c) print "  " k ": " c[k] "x, último " last[k] }' | sort
