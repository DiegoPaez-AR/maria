#!/bin/bash
# Sonda: version instalada de whatsapp-web.js y si expone getContactLidAndPhone.
cd /root/secretaria || exit 1
node -e '
  try {
    const pkg = require("whatsapp-web.js/package.json");
    console.log("whatsapp-web.js instalada:", pkg.version);
  } catch (e) { console.log("no se pudo leer package.json:", e.message); }
  try {
    const wweb = require("whatsapp-web.js");
    const proto = wweb.Client && wweb.Client.prototype;
    console.log("getContactLidAndPhone:", proto && typeof proto.getContactLidAndPhone === "function" ? "SI existe" : "NO existe");
    console.log("getContactById:", proto && typeof proto.getContactById === "function" ? "SI existe" : "NO existe");
    console.log("getNumberId:", proto && typeof proto.getNumberId === "function" ? "SI existe" : "NO existe");
  } catch (e) { console.log("error require whatsapp-web.js:", e.message); }
'
