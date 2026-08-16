#!/bin/bash
grep -E "\.kt:|\.xml:|error:|e: |FAILURE|What went wrong|> Task.*FAILED|Execution failed" /root/mariabridge-build.log | head -30
echo LISTO
