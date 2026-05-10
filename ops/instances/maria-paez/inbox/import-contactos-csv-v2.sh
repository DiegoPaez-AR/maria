#!/bin/bash
set +e
cd /root/secretaria

# Cargar env del .conf de la instancia: ECOSYSTEM seteado por pm2 al arrancar
# el proceso, pero el cron corre fuera de pm2. Lo leemos del .conf directo.
set -a
source <(grep -E '^[A-Z_]+=' /root/secretaria/config/instances/maria-paez.conf)
set +a
echo "MARIA_DB=$MARIA_DB"
echo "ASISTENTE_SLUG=$ASISTENTE_SLUG"

# Limpiar el destrozo del intento anterior en la DB huérfana, si quedó.
ORF=/root/secretaria/db/maria.sqlite
if [ -f "$ORF" ]; then
  echo "DB huérfana existe: $ORF"
  python3 -c "
import sqlite3
db = sqlite3.connect('$ORF')
try:
  n = db.execute(\"SELECT COUNT(*) FROM contactos\").fetchone()[0]
  print(f'  contactos en huérfana: {n}')
  if n > 0:
    db.execute(\"DELETE FROM contactos\"); db.commit()
    print(f'  borrados todos los {n} contactos huérfanos')
except Exception as e:
  print(f'  error: {e}')
"
fi

cat > /tmp/import-contactos.json <<'JSON_EOF'
[
  {
    "nombre": "Carlos Canosa",
    "whatsapp": "5491148618188@c.us",
    "email": "carlosalbertocanosa@yahoo.com",
    "cumple": "1944-03-15",
    "notas": null
  },
  {
    "nombre": "Jose Milei",
    "whatsapp": "5491145083836@c.us",
    "email": "drjosemilei@cardiopsis.com.ar",
    "cumple": "1945-12-18",
    "notas": "tel adicional: 1145083880"
  },
  {
    "nombre": "Juan Ignacio Paez Maña",
    "whatsapp": "5491163850580@c.us",
    "email": "ignacio@paez.net",
    "cumple": "1948-12-02",
    "notas": null
  },
  {
    "nombre": "Laura Noboa",
    "whatsapp": "5491143420892@c.us",
    "email": null,
    "cumple": "1949-07-11",
    "notas": null
  },
  {
    "nombre": "Isabel Imperiale",
    "whatsapp": "5491142409609@c.us",
    "email": "isabelimperiale@gmail.com",
    "cumple": "1953-03-28",
    "notas": null
  },
  {
    "nombre": "Fabiana Teubal",
    "whatsapp": "5491144171387@c.us",
    "email": "arqsam@gmail.com",
    "cumple": "1963-11-12",
    "notas": null
  },
  {
    "nombre": "Leo Ferran",
    "whatsapp": "5491145412933@c.us",
    "email": "leo.ferran@babelq.com",
    "cumple": "1965-06-23",
    "notas": null
  },
  {
    "nombre": "Gabriel Isola",
    "whatsapp": "5491143321212@c.us",
    "email": "Isola.gabriel@gmail.com",
    "cumple": "1967-06-12",
    "notas": null
  },
  {
    "nombre": "Brigida Pacheco",
    "whatsapp": "5492972431525@c.us",
    "email": "brigidapacheco@hotmail.com",
    "cumple": "1968-04-01",
    "notas": null
  },
  {
    "nombre": "Gabriel Pacheco",
    "whatsapp": "5491140402319@c.us",
    "email": "gap2612@hotmail.com",
    "cumple": "1969-12-26",
    "notas": "tel adicional: 1151610211"
  },
  {
    "nombre": "Ariana Fleitas",
    "whatsapp": "5491150502080@c.us",
    "email": "arianafleitas@yahoo.com.ar",
    "cumple": "1970-05-28",
    "notas": null
  },
  {
    "nombre": "Veronica Lascaray",
    "whatsapp": "5491140051640@c.us",
    "email": "verolascaray@hotmail.com",
    "cumple": "1970-12-25",
    "notas": null
  },
  {
    "nombre": "Oliver Erlich",
    "whatsapp": "5491147550315@c.us",
    "email": "olivererlich@yahoo.com.ar",
    "cumple": "1970-12-30",
    "notas": "tel adicional: +5491147550797"
  },
  {
    "nombre": "Santiago Lopez Alfaro",
    "whatsapp": "5491131790509@c.us",
    "email": "slopeza@delphosinv.com",
    "cumple": "1972-01-12",
    "notas": null
  },
  {
    "nombre": "Pablo Mariani",
    "whatsapp": "54959899911905@c.us",
    "email": "pmariani@gmail.com",
    "cumple": "1972-05-14",
    "notas": null
  },
  {
    "nombre": "Javier Guevara",
    "whatsapp": "5491165572001@c.us",
    "email": "javier.guevara@vrainz.com",
    "cumple": "1972-06-08",
    "notas": null
  },
  {
    "nombre": "Mariano Herrera",
    "whatsapp": "5491168540602@c.us",
    "email": "mariano.a.herrera@gmail.com",
    "cumple": "1972-11-30",
    "notas": null
  },
  {
    "nombre": "Ana Gianini",
    "whatsapp": "5491168579234@c.us",
    "email": "anagianini@hotmail.com",
    "cumple": "1973-01-17",
    "notas": null
  },
  {
    "nombre": "Mario Miccelli",
    "whatsapp": "5491154072788@c.us",
    "email": "mario.miccelli@gmail.com",
    "cumple": "1973-01-24",
    "notas": null
  },
  {
    "nombre": "Fernanda Lascaray",
    "whatsapp": "5491150147276@c.us",
    "email": "Fl@sensmedical.com",
    "cumple": "1973-02-07",
    "notas": null
  },
  {
    "nombre": "Pablo Casal",
    "whatsapp": "5491154025172@c.us",
    "email": "Pjcasal@gmail.com",
    "cumple": "1973-06-01",
    "notas": null
  },
  {
    "nombre": "Pilar Spangenberg",
    "whatsapp": "5491157319611@c.us",
    "email": "pspangenberg@gmail.com",
    "cumple": "1973-06-07",
    "notas": null
  },
  {
    "nombre": "Veronica Ciccarelli",
    "whatsapp": "5491162729795@c.us",
    "email": "veronica.ciccarelli@ericsson.com",
    "cumple": "1973-10-17",
    "notas": null
  },
  {
    "nombre": "Georgina Milei",
    "whatsapp": "5491156449434@c.us",
    "email": "georgina.milei@gmail.com",
    "cumple": "1974-12-17",
    "notas": null
  },
  {
    "nombre": "Alfonso Amat",
    "whatsapp": "5491148133819@c.us",
    "email": "alfonso.amat@gmail.com",
    "cumple": "1974-12-27",
    "notas": null
  },
  {
    "nombre": "Celeste Maneiro",
    "whatsapp": "5491130394534@c.us",
    "email": "celestemaneiro@hotmail.com",
    "cumple": "1975-01-19",
    "notas": null
  },
  {
    "nombre": "Gastón Ruggerio",
    "whatsapp": "5492972422720@c.us",
    "email": "gastonruggerio@hotmail.com",
    "cumple": "1975-02-20",
    "notas": null
  },
  {
    "nombre": "Rubén Ward",
    "whatsapp": "54934656462949@c.us",
    "email": "ruben.ward@sondeos.com.ar",
    "cumple": "1975-03-08",
    "notas": null
  },
  {
    "nombre": "Juan de la Cruz",
    "whatsapp": "5491150602323@c.us",
    "email": "juan.ramirezsilva@fravega.com.ar",
    "cumple": "1975-04-03",
    "notas": null
  },
  {
    "nombre": "Julieta Picasso",
    "whatsapp": "5491141703872@c.us",
    "email": "lietita@yahoo.com.ar",
    "cumple": "1975-05-31",
    "notas": null
  },
  {
    "nombre": "Diego Paez",
    "whatsapp": "5491132317896@c.us",
    "email": "diego@paez.is",
    "cumple": "1975-06-19",
    "notas": "tel adicional: +1 (917) 310-3655, +1 (646) 425-6178"
  },
  {
    "nombre": "Carlos Maidana",
    "whatsapp": "54913109069206@c.us",
    "email": "carlosmaidana01@gmail.com",
    "cumple": "1975-07-29",
    "notas": null
  },
  {
    "nombre": "Carolina Modai",
    "whatsapp": "5491146320075@c.us",
    "email": "carolinamodai@hotmail.com",
    "cumple": "1975-09-10",
    "notas": null
  },
  {
    "nombre": "Damian Lanatta",
    "whatsapp": "5491142991023@c.us",
    "email": "damian.lanatta@gmail.com",
    "cumple": "1976-01-16",
    "notas": "tel adicional: +5491146324750"
  },
  {
    "nombre": "Malena Ansalone",
    "whatsapp": "5491146356905@c.us",
    "email": "malenaansalone@hotmail.com",
    "cumple": "1976-01-23",
    "notas": "tel adicional: 2972410777"
  },
  {
    "nombre": "Maira Yahia",
    "whatsapp": "5491168712334@c.us",
    "email": "mairayahia@hotmail.com",
    "cumple": "1976-04-18",
    "notas": null
  },
  {
    "nombre": "Eduaedo Canicoba",
    "whatsapp": "54917023214030@c.us",
    "email": "ecanicoba@gmail.com",
    "cumple": "1977-01-25",
    "notas": null
  },
  {
    "nombre": "Gustavo Sorotski",
    "whatsapp": "5491145895065@c.us",
    "email": "gustavo.sorotski@disney.com",
    "cumple": "1977-02-14",
    "notas": null
  },
  {
    "nombre": "Dolores Spangenberg",
    "whatsapp": "5491123214306@c.us",
    "email": "doloresspangen@gmail.com",
    "cumple": "1977-02-19",
    "notas": null
  },
  {
    "nombre": "Rodrigo Canosa",
    "whatsapp": "5491143623828@c.us",
    "email": "rpc@sondeos.com.ar",
    "cumple": "1977-03-23",
    "notas": null
  },
  {
    "nombre": "Lorena Gerattano",
    "whatsapp": "5491145529239@c.us",
    "email": "lorenagerattano@Gmail.com",
    "cumple": "1977-04-18",
    "notas": "tel adicional: 1142575751"
  },
  {
    "nombre": "Juliana Laurini",
    "whatsapp": "5491151252288@c.us",
    "email": "juliana.laurini@gmail.com",
    "cumple": "1977-04-22",
    "notas": null
  },
  {
    "nombre": "Nicolás Sgroi",
    "whatsapp": "5491159367403@c.us",
    "email": "nsgroi@enpiric.com",
    "cumple": "1977-05-29",
    "notas": null
  },
  {
    "nombre": "Matias Israel",
    "whatsapp": "5491145529237@c.us",
    "email": "matias.israel@gmail.com",
    "cumple": "1977-09-02",
    "notas": null
  },
  {
    "nombre": "Brunatti Carolina",
    "whatsapp": "5491141885339@c.us",
    "email": "carolina.brunatti@telefonica.com",
    "cumple": "1977-12-06",
    "notas": null
  },
  {
    "nombre": "Nicolas Jordan",
    "whatsapp": "5491148111464@c.us",
    "email": "nicolas.jordan@enpiric.com",
    "cumple": "1978-06-24",
    "notas": null
  },
  {
    "nombre": "Javier Corraro",
    "whatsapp": "54934628025170@c.us",
    "email": "Javier.Corraro@telefonica.com",
    "cumple": "1978-07-09",
    "notas": null
  },
  {
    "nombre": "Pablo Bisceglia",
    "whatsapp": "5491149823388@c.us",
    "email": "pablo.bisceglia@sondeos.com.ar",
    "cumple": "1978-11-13",
    "notas": null
  },
  {
    "nombre": "Maxigkunz Gonzalez Kunz",
    "whatsapp": "54913057812143@c.us",
    "email": "maximiliano@gruponucleo.com.ar",
    "cumple": "1979-03-12",
    "notas": null
  },
  {
    "nombre": "Ana Vainman",
    "whatsapp": "5491140759467@c.us",
    "email": "ana@vainman.com.ar",
    "cumple": "1979-04-21",
    "notas": null
  },
  {
    "nombre": "Santiago Capurro",
    "whatsapp": "5491166010010@c.us",
    "email": "santiago@capurro.com.ar",
    "cumple": "1979-05-06",
    "notas": null
  },
  {
    "nombre": "Daniela Ciavone",
    "whatsapp": "5491135699615@c.us",
    "email": "dc@sensmedical.com",
    "cumple": "1979-07-26",
    "notas": null
  },
  {
    "nombre": "Pablo Capurro",
    "whatsapp": "5491152570020@c.us",
    "email": "pablo@capurro.com.ar",
    "cumple": "1979-12-18",
    "notas": null
  },
  {
    "nombre": "Andrea Kozameh",
    "whatsapp": "5491168626963@c.us",
    "email": "andreak@opticomsa.com.ar",
    "cumple": "1980-03-04",
    "notas": null
  },
  {
    "nombre": "Marino Bracamonte",
    "whatsapp": "54934689333302@c.us",
    "email": "marino.bracamonte@telefonica.com",
    "cumple": "1980-04-26",
    "notas": null
  },
  {
    "nombre": "Mónica Matto",
    "whatsapp": "5491135628106@c.us",
    "email": "monica.matto@sondeos.com.ar",
    "cumple": "1980-07-01",
    "notas": null
  },
  {
    "nombre": "Barbara Grane",
    "whatsapp": "5491169222312@c.us",
    "email": null,
    "cumple": "1981-05-04",
    "notas": null
  },
  {
    "nombre": "Lucas Capurro",
    "whatsapp": "5491157494555@c.us",
    "email": "lucas@capurro.com.ar",
    "cumple": "1981-07-15",
    "notas": "tel adicional: +13059858123"
  },
  {
    "nombre": "Diego Perez",
    "whatsapp": "5491154968178@c.us",
    "email": "diegohpp@hotmail.com",
    "cumple": "1982-04-04",
    "notas": null
  },
  {
    "nombre": "Natali Funez",
    "whatsapp": "5491150105262@c.us",
    "email": "nfunez@iplan.com.ar",
    "cumple": "1983-02-23",
    "notas": null
  },
  {
    "nombre": "Bryan Tafel",
    "whatsapp": "5491130471497@c.us",
    "email": "Btafel@gmail.com",
    "cumple": "1983-08-10",
    "notas": "tel adicional: +1 (929) 444‑6775"
  },
  {
    "nombre": "Martín Souza",
    "whatsapp": null,
    "email": null,
    "cumple": "1984-06-21",
    "notas": null
  },
  {
    "nombre": "Cristian Huichaqueo",
    "whatsapp": "5491135800037@c.us",
    "email": "cristian.huichaqueo@mviajes.com.ar",
    "cumple": "1984-06-30",
    "notas": null
  },
  {
    "nombre": "Andres Neumann",
    "whatsapp": "5491164719969@c.us",
    "email": "andres@nomada.com",
    "cumple": "1986-07-22",
    "notas": null
  },
  {
    "nombre": "Hernan Mantovani",
    "whatsapp": "5491132878054@c.us",
    "email": "hernan_mantovani@hotmail.com",
    "cumple": "1986-10-02",
    "notas": null
  },
  {
    "nombre": "Victoria Frene",
    "whatsapp": "5491166780009@c.us",
    "email": null,
    "cumple": "1999-01-25",
    "notas": null
  },
  {
    "nombre": "Ivan Erlich",
    "whatsapp": "5491149804416@c.us",
    "email": null,
    "cumple": "2001-02-03",
    "notas": null
  },
  {
    "nombre": "Franco Ruggerio",
    "whatsapp": null,
    "email": null,
    "cumple": "2001-07-04",
    "notas": null
  },
  {
    "nombre": "Franco Israel",
    "whatsapp": null,
    "email": null,
    "cumple": "2003-03-07",
    "notas": null
  },
  {
    "nombre": "Nicolas Erlich",
    "whatsapp": null,
    "email": null,
    "cumple": "2005-10-30",
    "notas": null
  },
  {
    "nombre": "Paloma Paez",
    "whatsapp": "5491132339295@c.us",
    "email": "paloma.paez@gmail.com",
    "cumple": "2006-03-28",
    "notas": null
  },
  {
    "nombre": "Venecia Cezar",
    "whatsapp": null,
    "email": null,
    "cumple": "2008-02-06",
    "notas": null
  },
  {
    "nombre": "Fausto Ansalone",
    "whatsapp": null,
    "email": null,
    "cumple": "2008-02-18",
    "notas": null
  },
  {
    "nombre": "Carmen Paez",
    "whatsapp": "5491121748405@c.us",
    "email": "carpaespa@gmail.com",
    "cumple": "2008-09-25",
    "notas": null
  },
  {
    "nombre": "Manuel Paez",
    "whatsapp": "5491168295181@c.us",
    "email": "manuel.paezmilei@icloud.com",
    "cumple": "2009-12-08",
    "notas": null
  },
  {
    "nombre": "Jorge Ravlich",
    "whatsapp": "5491138113050@c.us",
    "email": "jorge.e.ravlich@ypf.com",
    "cumple": "2012-10-06",
    "notas": "tel adicional: +5491157282137"
  },
  {
    "nombre": "Adrián Duek",
    "whatsapp": "5491144396371@c.us",
    "email": "adrianduek@hotmail.com",
    "cumple": "2013-04-11",
    "notas": null
  },
  {
    "nombre": "Santiago Paez",
    "whatsapp": "5491164393520@c.us",
    "email": "santiago.paezfunez@icloud.com",
    "cumple": "2015-03-29",
    "notas": null
  },
  {
    "nombre": "Soledad Nakama",
    "whatsapp": "5491162629511@c.us",
    "email": "soledadnakama@gmail.com",
    "cumple": "--01-17",
    "notas": null
  },
  {
    "nombre": "Mariela Nigro",
    "whatsapp": "5491159050287@c.us",
    "email": "mariela.nigro@sondeos.com.ar",
    "cumple": "--02-28",
    "notas": null
  },
  {
    "nombre": "Mercedes Spangenberg",
    "whatsapp": "5491168250885@c.us",
    "email": "pachespangenberg@hotmail.com",
    "cumple": "--03-03",
    "notas": null
  },
  {
    "nombre": "Antonio Peña",
    "whatsapp": "5491155645553@c.us",
    "email": "toni@gomovil.co",
    "cumple": "--03-20",
    "notas": null
  },
  {
    "nombre": "Dario Fainguersch",
    "whatsapp": "5491151571000@c.us",
    "email": "dario.Fainguersch@gmail.com",
    "cumple": "--04-26",
    "notas": null
  },
  {
    "nombre": "David Winograd",
    "whatsapp": "5491164512905@c.us",
    "email": "dwinograd@froneus.com",
    "cumple": "--05-03",
    "notas": null
  },
  {
    "nombre": "Carlos Rivera",
    "whatsapp": "5491141446735@c.us",
    "email": "crivera@millscapitalgroup.com",
    "cumple": "--05-08",
    "notas": null
  },
  {
    "nombre": "Carlos Krigun",
    "whatsapp": null,
    "email": "ckrigun@millscapitalgroup.com",
    "cumple": "--05-09",
    "notas": null
  },
  {
    "nombre": "Roxana Stefani",
    "whatsapp": "5491133124478@c.us",
    "email": "roxana.stefani@sondeos.com.ar",
    "cumple": "--06-04",
    "notas": null
  },
  {
    "nombre": "Enrique Sosa",
    "whatsapp": "54959899643028@c.us",
    "email": "enrique.sosa@globalnetmobile.com",
    "cumple": "--07-28",
    "notas": null
  },
  {
    "nombre": "Fabio Boschetto",
    "whatsapp": "5491152189302@c.us",
    "email": "fabio.boschetto@vrainz.com",
    "cumple": "--08-01",
    "notas": null
  },
  {
    "nombre": "Federico Goldenberg",
    "whatsapp": "5491158763174@c.us",
    "email": "federico.goldenberg@sondeos.com.ar",
    "cumple": "--08-13",
    "notas": null
  },
  {
    "nombre": "Santiago Bignone",
    "whatsapp": "5491134274828@c.us",
    "email": null,
    "cumple": "--08-18",
    "notas": null
  },
  {
    "nombre": "Doris Capurro",
    "whatsapp": "5491144471264@c.us",
    "email": "doris@capurro.com.ar",
    "cumple": "--09-23",
    "notas": null
  },
  {
    "nombre": "Santiago Rodriguez",
    "whatsapp": "5491148557535@c.us",
    "email": "santijrodriguez@gmail.com",
    "cumple": "--09-25",
    "notas": null
  },
  {
    "nombre": "Marcela Carbajo",
    "whatsapp": "5491168936637@c.us",
    "email": "mcarbajo@movilgate.com",
    "cumple": "--10-18",
    "notas": null
  },
  {
    "nombre": "Daniela Alvarino",
    "whatsapp": "5491131770810@c.us",
    "email": null,
    "cumple": "--10-31",
    "notas": null
  },
  {
    "nombre": "Gastón Girotti",
    "whatsapp": "5491156408326@c.us",
    "email": "gaston.girotti@gmail.com",
    "cumple": "--12-04",
    "notas": null
  },
  {
    "nombre": "Florencia Funez",
    "whatsapp": "5491137034046@c.us",
    "email": "florsuper@hotmail.com",
    "cumple": "--12-06",
    "notas": null
  }
]
JSON_EOF

node << 'NODE_EOF'
const fs = require('fs');
const m  = require('./memory');
const usuarios = require('./usuarios');

const OWNER = usuarios.obtenerOwner();
if (!OWNER) { console.error('owner no encontrado'); process.exit(1); }
console.log(`DB en uso: ${m.db.name}`);
console.log(`Importando a libreta privada de ${OWNER.nombre} (id=${OWNER.id})`);

const lista = JSON.parse(fs.readFileSync('/tmp/import-contactos.json', 'utf8'));
console.log(`Total CSV: ${lista.length}`);
console.log(`Privados Diego ANTES: ${m.contactosPrivados(OWNER.id).length}`);

let creados = 0, actualizados = 0, intactos = 0;
const detalleAct = []; const detalleNuevos = [];

for (const c of lista) {
  const yaExiste = m.buscarContacto({ usuarioId: OWNER.id, nombre: c.nombre, incluirPublica: false });
  if (!yaExiste) {
    try {
      m.upsertContacto({
        usuarioId: OWNER.id, nombre: c.nombre,
        whatsapp: c.whatsapp || null, email: c.email || null,
        cumple: c.cumple || null, notas: c.notas || null,
        visibilidad: 'privada',
      });
      creados++; detalleNuevos.push(c.nombre);
    } catch (err) {
      console.error(`  ERROR creando "${c.nombre}":`, err.message);
    }
    continue;
  }
  const patch = {};
  if (!yaExiste.whatsapp && c.whatsapp) patch.whatsapp = c.whatsapp;
  if (!yaExiste.email    && c.email)    patch.email    = c.email;
  if (!yaExiste.cumple   && c.cumple)   patch.cumple   = c.cumple;
  if (!yaExiste.notas    && c.notas)    patch.notas    = c.notas;
  if (!Object.keys(patch).length) { intactos++; continue; }
  try {
    m.upsertContacto({
      usuarioId: OWNER.id, nombre: c.nombre,
      whatsapp: patch.whatsapp || null, email: patch.email || null,
      cumple: patch.cumple || null, notas: patch.notas || null,
      visibilidad: 'privada',
    });
    actualizados++;
    detalleAct.push(`${c.nombre} (+ ${Object.keys(patch).join(',')})`);
  } catch (err) {
    console.error(`  ERROR actualizando "${c.nombre}":`, err.message);
  }
}

console.log('\n=== RESUMEN ===');
console.log(`Creados:      ${creados}`);
console.log(`Actualizados: ${actualizados} (solo campos null)`);
console.log(`Intactos:     ${intactos}`);
if (detalleAct.length) {
  console.log('\nActualizados:'); detalleAct.forEach(n => console.log('  ~', n));
}
console.log(`\nPrivados Diego DESPUÉS: ${m.contactosPrivados(OWNER.id).length}`);
NODE_EOF

rm -f /tmp/import-contactos.json
