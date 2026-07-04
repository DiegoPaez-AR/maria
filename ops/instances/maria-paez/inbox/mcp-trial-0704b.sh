#!/bin/bash
set -u
sqlite3 "$MARIA_DB" "SELECT datetime(timestamp,'localtime')||' | de='||COALESCE(de,'NULL')||' | '||COALESCE(substr(cuerpo,1,300),'(cuerpo NULL)')||' | meta='||COALESCE(substr(metadata_json,1,300),'NULL') FROM eventos WHERE (tipo='mcp_fallback' OR json_extract(metadata_json,'\$.tipo')='mcp_fallback') AND timestamp >= datetime('now','-25 hours');"
