#!/bin/bash
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
const cols=db.prepare('PRAGMA table_info(contactos)').all().map(c=>c.name);
console.log('contactos.telegram:', cols.includes('telegram') ? 'MIGRADO ✓' : 'FALTA ✗');
db.close();"
grep "migración" ~/.pm2/logs/maria-paez-out.log | tail -3
echo LISTO
