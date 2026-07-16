#!/bin/bash
DB="${MARIA_DB:?falta MARIA_DB}"
sqlite3 "$DB" "SELECT date(timestamp), canal, direccion, COUNT(*) FROM eventos WHERE timestamp > datetime('now','-6 days') AND canal IN ('telegram','whatsapp','gmail') GROUP BY 1,2,3 ORDER BY 1 DESC, 2;"
