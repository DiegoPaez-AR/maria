#!/bin/bash
CF=/root/secretaria/config/instances/maria-paez.conf
sed -i 's|^MARIA_MCP_ACTIONS=.*|# MARIA_MCP_ACTIONS retirado 2026-07-03 — tools MCP es el único camino (killswitch eliminado del código)|' "$CF"
grep -n "MCP_ACTIONS" "$CF"
echo LISTO
