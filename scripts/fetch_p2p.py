#!/usr/bin/env python3
"""
Mide la tasa p2p de USDT/VES leyendo el libro de Binance.

Por que existe: Binance rechaza las peticiones que salen de la red de
Cloudflare, donde corre el sitio, asi que la medicion se hace desde aqui
—un runner de GitHub— y se deja publicada en data/p2p.json para que la web
la use. Es la misma via que usan los bots de Telegram que dan esta tasa:
preguntarle al libro, no a un tercero.

Metodo: dos paginas de cada lado del mercado (hasta 80 anuncios) y promedio
recortado, descartando el 20% de los extremos, que es donde estan los
anuncios disparatados.
"""

import json
import os
import urllib.request
from datetime import datetime, timezone

URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search"
SALIDA = os.path.join(os.path.dirname(__file__), "..", "data", "p2p.json")

CABECERAS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Accept-Language": "es,en;q=0.9",
    "Origin": "https://p2p.binance.com",
    "Referer": "https://p2p.binance.com/es/trade/all-payments/USDT?fiat=VES",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "clienttype": "web",
}


def leer_pagina(trade_type, pagina):
    cuerpo = {
        "asset": "USDT", "fiat": "VES", "tradeType": trade_type,
        "page": pagina, "rows": 20, "payTypes": [], "countries": [],
        "publisherType": None, "proMerchantAds": False,
        "shieldMerchantAds": False, "filterType": "all", "periods": [],
        "additionalKycVerifyFilter": 0,
        "classifies": ["mass", "profession", "fiat_trade"],
    }
    peticion = urllib.request.Request(URL, data=json.dumps(cuerpo).encode(), headers=CABECERAS)
    with urllib.request.urlopen(peticion, timeout=25) as respuesta:
        datos = json.load(respuesta)

    precios = []
    for anuncio in datos.get("data", []):
        try:
            precio = float(anuncio["adv"]["price"])
            if precio > 0:
                precios.append(precio)
        except (KeyError, TypeError, ValueError):
            continue
    return precios


def promedio_recortado(valores, recorte=0.2):
    if not valores:
        return None
    ordenados = sorted(valores)
    fuera = int(len(ordenados) * recorte)
    centro = ordenados[fuera:len(ordenados) - fuera] or ordenados
    return sum(centro) / len(centro)


def main():
    precios = []
    fallos = []

    for trade_type in ("SELL", "BUY"):
        for pagina in (1, 2):
            try:
                precios += leer_pagina(trade_type, pagina)
            except Exception as e:
                fallos.append(f"{trade_type} p{pagina}: {e}")

    if len(precios) < 10:
        print(f"✗ Muestra insuficiente: {len(precios)} anuncios")
        for f in fallos:
            print("  ", f)
        raise SystemExit(1)

    tasa = round(promedio_recortado(precios), 2)
    ordenados = sorted(precios)

    salida = {
        "rate": tasa,
        "ads": len(precios),
        "min": round(ordenados[0], 2),
        "max": round(ordenados[-1], 2),
        "source": "binance-p2p",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    ruta = os.path.abspath(SALIDA)
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, indent=2)

    print(f"✓ {tasa} Bs. con {len(precios)} anuncios (rango {salida['min']}–{salida['max']})")
    if fallos:
        print("  Páginas que fallaron:", "; ".join(fallos))


if __name__ == "__main__":
    main()
