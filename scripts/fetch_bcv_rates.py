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

# Output file
OUTPUT_FILE = 'data/bcv-rates.json'

# API endpoints
EUR_API = 'https://bcvapi.tech/api/v1/euro/public'
USD_API = 'https://ve.dolarapi.com/v1/dolares/oficial'
USDT_API = 'https://ve.dolarapi.com/v1/dolares/paralelo'  # Paralelo ~= USDT P2P rate


def fetch_eur_rate():
    """Fetch EUR rate from bcvapi.tech"""
    try:
        response = requests.get(EUR_API, timeout=10)
        response.raise_for_status()
        data = response.json()

        return {
            'rate': float(data.get('tasa', 0)),
            'date': data.get('fecha', datetime.now().strftime('%Y-%m-%d'))
        }
    except Exception as e:
        print(f"✗ Error fetching EUR rate: {e}")
        return None


def fetch_usd_rate():
    """Fetch USD rate from DolarApi.com (official BCV rate)"""
    try:
        response = requests.get(USD_API, timeout=10)
        response.raise_for_status()
        data = response.json()

        # Parse date from ISO format
        fecha_str = data.get('fechaActualizacion', '')
        if fecha_str:
            date = fecha_str.split('T')[0]
        else:
            date = datetime.now().strftime('%Y-%m-%d')

        return {
            'rate': float(data.get('promedio', 0)),
            'date': date
        }
    except Exception as e:
        print(f"✗ Error fetching USD rate: {e}")
        return None


def fetch_usdt_rate():
    """Fetch USDT rate from DolarApi.com (paralelo rate ~= P2P)"""
    try:
        response = requests.get(USDT_API, timeout=10)
        response.raise_for_status()
        data = response.json()

        # Parse date from ISO format
        fecha_str = data.get('fechaActualizacion', '')
        if fecha_str:
            date = fecha_str.split('T')[0]
        else:
            date = datetime.now().strftime('%Y-%m-%d')

        return {
            'rate': float(data.get('promedio', 0)),
            'date': date
        }
    except Exception as e:
        print(f"✗ Error fetching USDT rate: {e}")
        return None


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

        # Write data
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)

        print(f"✓ Rates saved successfully to {OUTPUT_FILE}")
        print(f"  EUR: {eur_data['rate']} Bs. (fecha: {eur_data['date']})")
        print(f"  USD: {usd_data['rate']} Bs. (fecha: {usd_data['date']})")
        if usdt_data:
            print(f"  USDT: {usdt_data['rate']} Bs. (fecha: {usdt_data['date']})")
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
    print("\n→ Fetching EUR rate from bcvapi.tech...")
    eur_data = fetch_eur_rate()

    # Fetch USD rate
    print("→ Fetching USD rate from DolarApi.com...")
    usd_data = fetch_usd_rate()

    # Fetch USDT rate (paralelo)
    print("→ Fetching USDT rate from DolarApi.com...")
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
