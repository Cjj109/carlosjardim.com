#!/usr/bin/env python3
"""
BCV Exchange Rates Fetcher
Fetches EUR and USD exchange rates from BCV sources
Updates every 3 hours via GitHub Actions
"""

import requests
import json
import os
from datetime import datetime

# Output files
OUTPUT_FILE = 'data/bcv-rates.json'
HISTORY_FILE = 'data/bcv-rates-history.json'
# Con una toma al dia, esto es algo mas de un anio de historial. Antes se
# tomaba cada tres horas y los mismos 90 registros eran solo once dias.
MAX_HISTORY_ENTRIES = 400

# API endpoints
# Se leen del propio endpoint del sitio, que ya resuelve de donde sacar cada
# tasa: el dolar y el euro de la pagina del BCV y el USDT del p2p de Binance.
# Antes cada una se pedia por separado a bcvapi.tech, que dejo de responder, y
# por eso este historial llevaba congelado desde mayo.
API_TASAS = 'https://carlosjardim.com/api/bcv'


_tasas_cache = {}


def _tasas_del_sitio():
    """Una sola llamada al endpoint; las tres tasas salen de ahi."""
    if not _tasas_cache:
        response = requests.get(API_TASAS, timeout=20)
        response.raise_for_status()
        _tasas_cache.update(response.json())
    return _tasas_cache


def _leer(moneda):
    try:
        datos = _tasas_del_sitio().get(moneda)
        if not datos or not datos.get('rate'):
            print(f"\u2717 Sin tasa para {moneda}")
            return None
        return {
            'rate': float(datos['rate']),
            'date': datos.get('date') or datetime.now().strftime('%Y-%m-%d'),
        }
    except Exception as e:
        print(f"\u2717 Error leyendo {moneda}: {e}")
        return None


def fetch_eur_rate():
    """Tasa del euro publicada por el BCV"""
    return _leer('eur')


def fetch_usd_rate():
    """Tasa del dolar publicada por el BCV"""
    return _leer('usd')


def fetch_usdt_rate():
    """USDT p2p (Binance via Cotizave)"""
    return _leer('usdt')


def load_history():
    """Load existing history file"""
    try:
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"Warning: Could not load history: {e}")
    return {'entries': []}


def calculate_variation(current, previous):
    """Calculate percentage variation between two rates"""
    if previous and previous > 0:
        return round(((current - previous) / previous) * 100, 2)
    return 0


def save_history(eur_rate, usd_rate, usdt_rate=None):
    """Save rate to history file with variation calculation"""
    try:
        history = load_history()
        entries = history.get('entries', [])

        # Get previous entry for variation calculation
        prev_eur = entries[0]['eur']['rate'] if entries else None
        prev_usd = entries[0]['usd']['rate'] if entries else None
        prev_usdt = entries[0].get('usdt', {}).get('rate') if entries else None

        # Create new entry
        new_entry = {
            'timestamp': datetime.now().isoformat(),
            'date': datetime.now().strftime('%Y-%m-%d'),
            'eur': {
                'rate': eur_rate,
                'variation': calculate_variation(eur_rate, prev_eur)
            },
            'usd': {
                'rate': usd_rate,
                'variation': calculate_variation(usd_rate, prev_usd)
            }
        }

        if usdt_rate:
            new_entry['usdt'] = {
                'rate': usdt_rate,
                'variation': calculate_variation(usdt_rate, prev_usdt)
            }

        # Add to beginning of list (newest first)
        entries.insert(0, new_entry)

        # Trim to max entries
        entries = entries[:MAX_HISTORY_ENTRIES]

        # Save history
        history_output = {
            'last_updated': datetime.now().isoformat(),
            'entries': entries
        }

        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(history_output, f, ensure_ascii=False, indent=2)

        print(f"✓ History updated ({len(entries)} entries)")
        if prev_usd:
            var_usd = calculate_variation(usd_rate, prev_usd)
            var_symbol = "↑" if var_usd > 0 else "↓" if var_usd < 0 else "="
            print(f"  USD variation: {var_symbol} {abs(var_usd)}%")

        return True

    except Exception as e:
        print(f"✗ Error saving history: {e}")
        return False


def save_rates(eur_data, usd_data, usdt_data=None):
    """Save rates to JSON file"""
    if not eur_data or not usd_data:
        print("✗ Missing rate data, cannot save")
        return False

    output = {
        'last_updated': datetime.now().isoformat(),
        'eur': {
            'rate': eur_data['rate'],
            'date': eur_data['date'],
            'symbol': '€'
        },
        'usd': {
            'rate': usd_data['rate'],
            'date': usd_data['date'],
            'symbol': '$'
        }
    }

    # Add USDT if available
    if usdt_data:
        output['usdt'] = {
            'rate': usdt_data['rate'],
            'date': usdt_data['date'],
            'symbol': '₮'
        }

    try:
        # Ensure directory exists
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

        # Write current rates
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)

        print(f"✓ Rates saved successfully to {OUTPUT_FILE}")
        print(f"  EUR: {eur_data['rate']} Bs. (fecha: {eur_data['date']})")
        print(f"  USD: {usd_data['rate']} Bs. (fecha: {usd_data['date']})")
        if usdt_data:
            print(f"  USDT: {usdt_data['rate']} Bs. (fecha: {usdt_data['date']})")

        # Save to history
        usdt_rate = usdt_data['rate'] if usdt_data else None
        save_history(eur_data['rate'], usd_data['rate'], usdt_rate)

        return True

    except Exception as e:
        print(f"✗ Error saving rates: {e}")
        return False


def main():
    """Main execution"""
    print("=" * 50)
    print("BCV Exchange Rates Fetcher")
    print("=" * 50)

    # Fetch EUR rate
    print("\n→ Leyendo la tasa del euro...")
    eur_data = fetch_eur_rate()

    # Fetch USD rate
    print("→ Leyendo la tasa del dolar...")
    usd_data = fetch_usd_rate()

    # Fetch USDT rate (P2P)
    print("→ Leyendo el USDT p2p...")
    usdt_data = fetch_usdt_rate()

    # Save rates
    if eur_data and usd_data:
        if save_rates(eur_data, usd_data, usdt_data):
            print("\n✓ Exchange rates updated successfully")
            return 0
        else:
            print("\n✗ Failed to save exchange rates")
            return 1
    else:
        print("\n✗ Failed to fetch exchange rates")
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
