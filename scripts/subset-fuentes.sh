#!/usr/bin/env bash
#
# Recorta las fuentes a los caracteres que el sitio usa de verdad.
#
# Los .woff2 de Google traen el subconjunto "latin" entero: unos 800 glifos,
# la mayoría de los cuales este sitio no escribe nunca. Recortarlos deja las
# dos fuentes en un tercio:
#
#   Inter            48.432 → 19.968 bytes  (-59%)
#   JetBrains Mono   40.480 → 14.288 bytes  (-65%)
#
# Sobre 112 KB de carga en frío, de los que 89 eran tipografía, eso es la
# mitad de la página. Para un público que entra desde el móvil en Venezuela,
# pesa.
#
# HAY QUE VOLVER A EJECUTARLO al añadir texto con caracteres nuevos. Si se
# olvida no se rompe nada: el glifo que falte cae a la fuente del sistema y
# se ve distinto, no desaparece. Pero conviene correrlo antes de desplegar
# cambios grandes de copy.
#
# Los originales completos se guardan en fonts/originales/ para poder volver
# a recortar sin bajarlos otra vez de Google.
#
# Uso:  bash scripts/subset-fuentes.sh

set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$raiz"

venv="${TMPDIR:-/tmp}/subset-fuentes-venv"
if [ ! -x "$venv/bin/pyftsubset" ]; then
  echo "Preparando fonttools…"
  python3 -m venv "$venv"
  "$venv/bin/pip" install --quiet fonttools brotli
fi

mkdir -p fonts/originales

# Los caracteres que el sitio escribe, sacados del propio código y no de una
# suposición, más el alfabeto latino completo por si entra texto nuevo.
"$venv/bin/python" - <<'PY'
import glob
usados = set()
for f in glob.glob('**/*.html', recursive=True) + glob.glob('css/*.css') + glob.glob('js/*.js'):
    if 'node_modules' in f or f.startswith('fonts/'):
        continue
    usados |= set(open(f, encoding='utf-8', errors='replace').read())

# Fuera los emoji y los sustitutos: no los cubre ninguna de estas dos fuentes
util = {c for c in usados if 0x20 <= ord(c) < 0x2C00 and not 0xD800 <= ord(c) < 0xE000}
util |= set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
util |= set('áéíóúÁÉÍÓÚñÑüÜ¿¡«»°ºªç')   # castellano completo
util |= set('€$₮₿£¥¢')                   # las monedas que salen en pantalla

with open('fonts/.subset.txt', 'w', encoding='utf-8') as f:
    f.write(''.join(sorted(util)))
print(f"  {len(util)} caracteres distintos")
PY

# Los cuatro, incluidos los latin-ext: ahi viven el ₮ del USDT y el ₿, y
# bajar 15 KB enteros por dos simbolos no tiene sentido. Recortado, ese
# archivo se queda en nada y el unicode-range del CSS sigue igual.
for f in inter-latin inter-latin-ext jetbrains-mono-latin jetbrains-mono-latin-ext; do
  # La primera vez se guarda el original; después se recorta siempre desde él
  [ -f "fonts/originales/$f.woff2" ] || cp "fonts/$f.woff2" "fonts/originales/$f.woff2"

  antes=$(wc -c < "fonts/originales/$f.woff2")
  "$venv/bin/pyftsubset" "fonts/originales/$f.woff2" \
    --text-file=fonts/.subset.txt \
    --flavor=woff2 \
    --layout-features='' \
    --output-file="fonts/$f.woff2"
  despues=$(wc -c < "fonts/$f.woff2")

  printf "  %-22s %7s → %7s bytes (-%d%%)\n" \
    "$f" "$antes" "$despues" "$(( 100 - despues * 100 / antes ))"
done

rm -f fonts/.subset.txt
echo
echo "Recuerda subir la versión para que llegue a quien ya tenga la app:"
echo "  node scripts/version-calculadora.mjs"
