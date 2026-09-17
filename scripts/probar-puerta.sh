#!/bin/sh
# Intenta rodear la puerta escribiendo la ruta de otras formas.
#
# Aquí aparecieron dos agujeros de verdad: /api/bcv/ con barra final y
# /API/BCV en mayúsculas devolvían las tasas enteras sin sesión, porque
# Cloudflare Pages enruta sin distinguir mayúsculas y tolera la barra
# mientras el filtro exigía coincidencia exacta.
#
#   sh scripts/probar-puerta.sh [http://localhost:8788]

BASE="${1:-http://localhost:8788}"
TMP=$(mktemp)
FALLOS=0

# Estas NO deben devolver datos
for r in "/api/bcv" "/api/bcv/" "/API/BCV" "/Api/Bcv/" "//api/bcv" "/api/%62cv" \
         "/api/fuentes" "/api/fuentes/" "/api/60iq" "/api/montos" \
         "/calculadora" "/calculadora/" "/CALCULADORA" "/calculadora.html" \
         "/data/bcv-rates.json" "/data/BCV-RATES.json" "/data/bcv-rates-history.json" \
         "/data/p2p.json"; do
  code=$(curl -s -o "$TMP" -w "%{http_code}" --max-time 20 --path-as-is "$BASE$r")
  if grep -qE '"(last_updated|usd_rate|usd)"' "$TMP" 2>/dev/null; then
    echo "  ✗ $r  ($code) DEVUELVE DATOS"
    FALLOS=$((FALLOS+1))
  else
    echo "  ✓ $r  ($code)"
  fi
done

# Bajo /api/ todo está cerrado salvo lo que la lista abra. Una ruta que no
# existe tiene que dar 401 y no 404: si diera 404 querría decir que la puerta
# ni la mira, y entonces el día que exista nacería pública.
echo ""
for r in "/api/inventada" "/api/acceso" "/api/admin/quien-sea" "/api/60iq/otra"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 --path-as-is "$BASE$r")
  if [ "$code" = "401" ]; then echo "  ✓ $r nace cerrada ($code)"
  else echo "  ✗ $r debería dar 401 y da $code"; FALLOS=$((FALLOS+1)); fi
done

# Los apuntes y el taller: los .md, las migraciones y los scripts de prueba.
# Aquí no vale mirar si vienen tasas dentro: son texto, y el filtro de arriba
# los daría por buenos. Lo que delata que Pages está sirviendo el archivo tal
# cual es el tipo de contenido; cerrado, lo que llega es la página de la puerta.
echo ""
for r in "/DEPLOYMENT.md" "/README.md" "/ESTETICA_ANALISIS.md" "/deployment.md" \
         "/vercel/tasa-p2p/README.md" \
         "/migrations/0005_acceso.sql" "/migrations/0008_iq_memoria.sql" \
         "/scripts/probar-puerta.sh" "/scripts/probar-acceso.mjs" \
         "/scripts/probar-60iq.mjs" "/SCRIPTS/probar-60iq.mjs"; do
  tipo=$(curl -s -o /dev/null -w "%{content_type}" --max-time 20 --path-as-is "$BASE$r")
  case "$tipo" in
    *markdown*|*sql*|*javascript*|*x-sh*) echo "  ✗ $r SE SIRVE ($tipo)"; FALLOS=$((FALLOS+1)) ;;
    *) echo "  ✓ $r cerrado ($tipo)" ;;
  esac
done

# Estas SÍ deben seguir públicas
echo ""
for r in "/" "/acceso" "/data/bcv-liquidity.json" "/api/acceso/reto"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 --path-as-is "$BASE$r")
  if [ "$code" = "200" ]; then echo "  ✓ $r sigue pública ($code)"
  else echo "  ✗ $r debería ser pública y da $code"; FALLOS=$((FALLOS+1)); fi
done

rm -f "$TMP"
[ "$FALLOS" -eq 0 ] && echo "\nTodo correcto\n" || echo "\n$FALLOS FALLOS\n"
exit $FALLOS
