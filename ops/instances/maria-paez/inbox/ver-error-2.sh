#!/bin/bash
grep -E "^e: |^w: |Unresolved|expecting|cannot|mismatch" /root/mariabridge-build.log | head -25
echo "---kotlin compile task context---"
grep -B1 -A2 "compileDebugKotlin" /root/mariabridge-build.log | head -20
echo LISTO
