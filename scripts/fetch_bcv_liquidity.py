#!/usr/bin/env python3
"""
BCV Monetary Indicators Fetcher
Scrapes weekly liquidity and base monetaria data from BCV website
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

# BCV Excel URLs (direct links)
LIQUIDITY_URL = 'https://www.bcv.org.ve/sites/default/files/indicadores_sector_monetario/liquidez_monetaria_semanal1.xls'
BASE_MONETARIA_URL = 'https://www.bcv.org.ve/sites/default/files/indicadores_sector_monetario/base_monetaria_semanal.xls'

# Headers to mimic browser
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': '*/*',
}


def download_excel(url, name):
    """Download an Excel file"""
    try:
        print(f"→ Downloading {name} Excel file from BCV...")
        response = requests.get(
            url,
            headers=HEADERS,
            timeout=30,
            verify=False
        )
        response.raise_for_status()

        temp_file = f'/tmp/bcv_{name}.xls'
        with open(temp_file, 'wb') as f:
            f.write(response.content)

        print(f"  ✓ Downloaded {len(response.content)} bytes")
        return temp_file
    except Exception as e:
        print(f"✗ Error downloading {name} Excel: {e}")
        return None


def parse_liquidity_excel(file_path):
    """Parse the liquidity Excel file to extract data"""
    try:
        import xlrd

        print("→ Parsing liquidity Excel file...")
        workbook = xlrd.open_workbook(file_path)
        sheet = workbook.sheet_by_index(0)

        # Column structure:
        # 0: Semana (date)
        # 1: Monedas y Billetes
        # 2: Depósitos a la Vista
        # 3: Depósitos de Ahorro Transferibles
        # 4: Dinero (M1)
        # 5: Cuasidinero
        # 6: Liquidez Monetaria (M2)
        # 7: Variación %

        # Find the data rows (start after header rows)
        data_start = None
        for row_idx in range(sheet.nrows):
            cell = sheet.cell_value(row_idx, 0)
            if isinstance(cell, str) and re.match(r'\d{2}/\d{2}/\d{4}', cell.strip()):
                data_start = row_idx
                break

        if data_start is None:
            print("✗ Could not find data rows in liquidity file")
            return None

        # Get the most recent weeks (first 10 data rows)
        weeks = []
        for row_idx in range(data_start, min(data_start + 10, sheet.nrows)):
            try:
                date_str = sheet.cell_value(row_idx, 0)
                if not date_str or not isinstance(date_str, str):
                    continue

                # Clean date string
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
                print(f"  Warning: Error parsing liquidity row {row_idx}: {e}")
                continue

        # Calculate variations if not provided
        for i, week in enumerate(weeks):
            if week['variation'] is None and i < len(weeks) - 1:
                current_m2 = week['m2']
                previous_m2 = weeks[i + 1]['m2']
                if current_m2 and previous_m2 and previous_m2 > 0:
                    week['variation'] = round(((current_m2 - previous_m2) / previous_m2) * 100, 2)

        print(f"  ✓ Parsed {len(weeks)} weeks of liquidity data")
        return weeks

    except ImportError:
        print("✗ xlrd not installed. Run: pip install xlrd")
        return None
    except Exception as e:
        print(f"✗ Error parsing liquidity Excel: {e}")
        import traceback
        traceback.print_exc()
        return None


def parse_base_monetaria_excel(file_path):
    """Parse the base monetaria Excel file to extract data

    This file has a different structure:
    - Row 5 contains dates as column headers (e.g., "02/01/2026 (*)")
    - Row 68 (USOS) contains the total Base Monetaria values
    - Data is organized as rows (categories) vs columns (dates)
    """
    try:
        import xlrd

        print("→ Parsing base monetaria Excel file...")
        workbook = xlrd.open_workbook(file_path)
        sheet = workbook.sheet_by_index(0)

        # Find the dates row (usually row 5, contains dates like "02/01/2026 (*)")
        dates_row = None
        for row_idx in range(10):
            cell = str(sheet.cell_value(row_idx, 1)).strip()
            if re.match(r'\d{2}/\d{2}/\d{4}', cell):
                dates_row = row_idx
                break

        if dates_row is None:
            print("✗ Could not find dates row in base monetaria file")
            return None

        # Find the USOS row (contains total Base Monetaria)
        usos_row = None
        for row_idx in range(sheet.nrows):
            cell = str(sheet.cell_value(row_idx, 0)).strip().upper()
            if cell == 'USOS' or cell.startswith('USOS:'):
                usos_row = row_idx
                break

        if usos_row is None:
            print("✗ Could not find USOS (Base Monetaria total) row")
            return None

        print(f"  Found dates at row {dates_row}, USOS at row {usos_row}")

        # Extract data for each date column (most recent first)
        weeks = []
        date_cols = []

        # Collect all date columns (columns 1 onwards that have dates)
        for col_idx in range(1, sheet.ncols):
            date_str = str(sheet.cell_value(dates_row, col_idx)).strip()
            if re.match(r'\d{2}/\d{2}/\d{4}', date_str):
                date_cols.append(col_idx)

        # Get data in reverse order (most recent first)
        for col_idx in reversed(date_cols[-10:]):  # Get last 10 dates
            try:
                date_str = str(sheet.cell_value(dates_row, col_idx)).strip()
                # Clean date string (remove asterisks, parentheses)
                date_str = re.sub(r'[\s*()]+', '', date_str)

                base_value = sheet.cell_value(usos_row, col_idx)

                # Skip if value is not numeric or is placeholder
                if not isinstance(base_value, (int, float)) or base_value < 1000:
                    continue

                weeks.append({
                    'date': date_str,
                    'base': round(base_value, 2),
                    'variation': None
                })

            except Exception as e:
                print(f"  Warning: Error parsing column {col_idx}: {e}")
                continue

        # Calculate variations
        for i, week in enumerate(weeks):
            if i < len(weeks) - 1:
                current = week['base']
                previous = weeks[i + 1]['base']
                if current and previous and previous > 0:
                    week['variation'] = round(((current - previous) / previous) * 100, 2)

        print(f"  ✓ Parsed {len(weeks)} weeks of base monetaria data")
        return weeks

    except ImportError:
        print("✗ xlrd not installed. Run: pip install xlrd")
        return None
    except Exception as e:
        print(f"✗ Error parsing base monetaria Excel: {e}")
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


def save_data(liquidity_weeks, base_weeks):
    """Save parsed data to JSON file"""
    if not liquidity_weeks:
        print("✗ No liquidity data to save")
        return False

    latest_liquidity = liquidity_weeks[0]

    output = {
        'last_updated': datetime.now().isoformat(),
        'latest': {
            'date': latest_liquidity['date'],
            'm1_billions': format_number(latest_liquidity['m1']),
            'm2_billions': format_number(latest_liquidity['m2']),
            'variation_pct': latest_liquidity['variation'],
            'variation_direction': 'up' if latest_liquidity['variation'] and latest_liquidity['variation'] > 0 else 'down' if latest_liquidity['variation'] and latest_liquidity['variation'] < 0 else 'neutral'
        },
        'history': [{
            'date': w['date'],
            'm2_billions': format_number(w['m2']),
            'variation_pct': w['variation']
        } for w in liquidity_weeks[:8]]
    }

    # Add base monetaria if available
    if base_weeks:
        latest_base = base_weeks[0]
        output['base_monetaria'] = {
            'latest': {
                'date': latest_base['date'],
                'value_billions': format_number(latest_base['base']),
                'variation_pct': latest_base['variation'],
                'variation_direction': 'up' if latest_base['variation'] and latest_base['variation'] > 0 else 'down' if latest_base['variation'] and latest_base['variation'] < 0 else 'neutral'
            },
            'history': [{
                'date': w['date'],
                'value_billions': format_number(w['base']),
                'variation_pct': w['variation']
            } for w in base_weeks[:8]]
        }

    try:
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)

        print(f"\n✓ Data saved to {OUTPUT_FILE}")
        print(f"  Fecha: {latest_liquidity['date']}")
        print(f"  M2 (Liquidez): {format_number(latest_liquidity['m2'])} billones Bs.")
        if latest_liquidity['variation']:
            var_symbol = "↑" if latest_liquidity['variation'] > 0 else "↓"
            print(f"  Variación M2: {var_symbol} {abs(latest_liquidity['variation'])}%")

        if base_weeks:
            latest_base = base_weeks[0]
            print(f"  Base Monetaria: {format_number(latest_base['base'])} billones Bs.")
            if latest_base['variation']:
                var_symbol = "↑" if latest_base['variation'] > 0 else "↓"
                print(f"  Variación BM: {var_symbol} {abs(latest_base['variation'])}%")

        return True

    except Exception as e:
        print(f"✗ Error saving data: {e}")
        return False


def main():
    """Main execution"""
    print("=" * 50)
    print("BCV Monetary Indicators Fetcher")
    print("=" * 50)

    # Download and parse liquidity
    liquidity_file = download_excel(LIQUIDITY_URL, 'liquidity')
    liquidity_weeks = None
    if liquidity_file:
        liquidity_weeks = parse_liquidity_excel(liquidity_file)

    # Download and parse base monetaria
    base_file = download_excel(BASE_MONETARIA_URL, 'base_monetaria')
    base_weeks = None
    if base_file:
        base_weeks = parse_base_monetaria_excel(base_file)

    if not liquidity_weeks:
        print("\n✗ Failed to get liquidity data")
        return 1

    # Save to JSON
    if save_data(liquidity_weeks, base_weeks):
        print("\n✓ Monetary indicators updated successfully")
        return 0
    else:
        print("\n✗ Failed to save monetary data")
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
