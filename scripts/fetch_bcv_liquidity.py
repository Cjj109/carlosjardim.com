#!/usr/bin/env python3
"""
BCV Monetary Liquidity Fetcher
Scrapes weekly liquidity data from BCV website
"""

import requests
import json
import os
import re
import urllib3
from datetime import datetime

# Disable SSL warnings for BCV site (has certificate issues)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Output file
OUTPUT_FILE = 'data/bcv-liquidity.json'

# BCV liquidity Excel URL (direct link)
EXCEL_URL = 'https://www.bcv.org.ve/sites/default/files/indicadores_sector_monetario/liquidez_monetaria_semanal1.xls'

# Headers to mimic browser
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': '*/*',
}


def download_excel():
    """Download the Excel file"""
    try:
        print("→ Downloading Excel file from BCV...")
        response = requests.get(
            EXCEL_URL,
            headers=HEADERS,
            timeout=30,
            verify=False
        )
        response.raise_for_status()

        temp_file = '/tmp/bcv_liquidity.xls'
        with open(temp_file, 'wb') as f:
            f.write(response.content)

        print(f"  ✓ Downloaded {len(response.content)} bytes")
        return temp_file
    except Exception as e:
        print(f"✗ Error downloading Excel: {e}")
        return None


def parse_excel(file_path):
    """Parse the Excel file to extract liquidity data"""
    try:
        import xlrd

        print("→ Parsing Excel file...")
        workbook = xlrd.open_workbook(file_path)
        sheet = workbook.sheet_by_index(0)

        # Column structure (based on analysis):
        # 0: Semana (date)
        # 1: Monedas y Billetes
        # 2: Depósitos a la Vista
        # 3: Depósitos de Ahorro Transferibles
        # 4: Dinero (M1)
        # 5: Cuasidinero
        # 6: Liquidez Monetaria (M2)
        # 7: Variación %

        # Find the data rows (start after header rows, usually row 7)
        data_start = None
        for row_idx in range(sheet.nrows):
            cell = sheet.cell_value(row_idx, 0)
            if isinstance(cell, str) and re.match(r'\d{2}/\d{2}/\d{4}', cell.strip()):
                data_start = row_idx
                break

        if data_start is None:
            print("✗ Could not find data rows")
            return None

        # Get the most recent weeks (first 10 data rows)
        weeks = []
        for row_idx in range(data_start, min(data_start + 10, sheet.nrows)):
            try:
                date_str = sheet.cell_value(row_idx, 0)
                if not date_str or not isinstance(date_str, str):
                    continue

                # Clean date string (remove asterisks, parentheses, and extra spaces)
                date_str = re.sub(r'[\s*()]+', '', date_str.strip())

                # Parse values
                m1 = sheet.cell_value(row_idx, 4)  # Dinero (M1)
                m2 = sheet.cell_value(row_idx, 6)  # Liquidez Monetaria (M2)

                # Get variation if available
                variation = None
                if sheet.ncols > 7:
                    var_cell = sheet.cell_value(row_idx, 7)
                    if isinstance(var_cell, (int, float)) and var_cell != 0:
                        variation = round(var_cell, 2)
                    elif isinstance(var_cell, str):
                        # Check for parentheses (negative)
                        match = re.search(r'\((\d+[.,]\d+)\)', var_cell)
                        if match:
                            variation = -float(match.group(1).replace(',', '.'))
                        else:
                            match = re.search(r'(\d+[.,]\d+)', var_cell)
                            if match:
                                variation = float(match.group(1).replace(',', '.'))

                weeks.append({
                    'date': date_str,
                    'm1': round(m1, 2) if isinstance(m1, (int, float)) else None,
                    'm2': round(m2, 2) if isinstance(m2, (int, float)) else None,
                    'variation': variation
                })

            except Exception as e:
                print(f"  Warning: Error parsing row {row_idx}: {e}")
                continue

        # Calculate variations if not provided
        for i, week in enumerate(weeks):
            if week['variation'] is None and i < len(weeks) - 1:
                current_m2 = week['m2']
                previous_m2 = weeks[i + 1]['m2']
                if current_m2 and previous_m2 and previous_m2 > 0:
                    week['variation'] = round(((current_m2 - previous_m2) / previous_m2) * 100, 2)

        print(f"  ✓ Parsed {len(weeks)} weeks of data")
        return weeks

    except ImportError:
        print("✗ xlrd not installed. Run: pip install xlrd")
        return None
    except Exception as e:
        print(f"✗ Error parsing Excel: {e}")
        import traceback
        traceback.print_exc()
        return None


def format_number(value):
    """Format number in billions for display"""
    if value is None:
        return None
    # Value is in thousands, convert to billions
    billions = value / 1_000_000
    return round(billions, 2)


def save_data(weeks):
    """Save parsed data to JSON file"""
    if not weeks:
        print("✗ No data to save")
        return False

    latest = weeks[0]

    output = {
        'last_updated': datetime.now().isoformat(),
        'latest': {
            'date': latest['date'],
            'm1_billions': format_number(latest['m1']),
            'm2_billions': format_number(latest['m2']),
            'variation_pct': latest['variation'],
            'variation_direction': 'up' if latest['variation'] and latest['variation'] > 0 else 'down' if latest['variation'] and latest['variation'] < 0 else 'neutral'
        },
        'history': [{
            'date': w['date'],
            'm2_billions': format_number(w['m2']),
            'variation_pct': w['variation']
        } for w in weeks[:8]]
    }

    try:
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)

        print(f"\n✓ Data saved to {OUTPUT_FILE}")
        print(f"  Fecha: {latest['date']}")
        print(f"  M2 (Liquidez): {format_number(latest['m2'])} billones Bs.")
        if latest['variation']:
            var_symbol = "↑" if latest['variation'] > 0 else "↓"
            print(f"  Variación: {var_symbol} {abs(latest['variation'])}%")

        return True

    except Exception as e:
        print(f"✗ Error saving data: {e}")
        return False


def main():
    """Main execution"""
    print("=" * 50)
    print("BCV Monetary Liquidity Fetcher")
    print("=" * 50)

    # Download Excel
    excel_file = download_excel()
    if not excel_file:
        return 1

    # Parse data
    weeks = parse_excel(excel_file)
    if not weeks:
        return 1

    # Save to JSON
    if save_data(weeks):
        print("\n✓ Liquidity data updated successfully")
        return 0
    else:
        print("\n✗ Failed to save liquidity data")
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
