#!/bin/bash
echo "── contexto del FAILURE ──"
grep -n "FAILURE\|What went wrong\|> " /root/mariabridge-build.log | head -20
echo "── 25 líneas alrededor de 'FAILED' ──"
grep -n "FAILED" /root/mariabridge-build.log | head -3
awk '/What went wrong/{f=1} f{print} /BUILD FAILED/{exit}' /root/mariabridge-build.log | head -30
echo LISTO
