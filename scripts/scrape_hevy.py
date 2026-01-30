#!/usr/bin/env python3
"""
Hevy.com Workout Scraper
Extracts latest workout data from public Hevy profile
"""

import json
import os
import sys
from datetime import datetime
import requests
from bs4 import BeautifulSoup

# Configuration
HEVY_PROFILE_URL = "https://hevy.com/user/cjj109"
TIMEOUT = 30
OUTPUT_FILE = "data/gym-data.json"

def scrape_hevy_profile():
    """Scrape workout data from Hevy profile"""
    try:
        print(f"Fetching {HEVY_PROFILE_URL}...")

        # Make request
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = requests.get(HEVY_PROFILE_URL, headers=headers, timeout=TIMEOUT)
        response.raise_for_status()

        # Parse HTML
        soup = BeautifulSoup(response.content, 'html.parser')

        # Extract workout data (adapt selectors based on actual Hevy HTML structure)
        workout_data = {
            "last_updated": datetime.now().isoformat(),
            "profile_url": HEVY_PROFILE_URL,
            "last_workout": extract_last_workout(soup),
            "stats": extract_stats(soup)
        }

        return workout_data

    except requests.Timeout:
        print("ERROR: Request timed out", file=sys.stderr)
        return None
    except requests.RequestException as e:
        print(f"ERROR: Request failed: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"ERROR: Scraping failed: {e}", file=sys.stderr)
        return None


def extract_last_workout(soup):
    """Extract last workout details from soup"""
    # TODO: Adapt these selectors to actual Hevy HTML structure
    # This is a placeholder implementation

    workout = {
        "name": "Último Workout",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "duration": "0 min",
        "volume": "0 kg",
        "exercises": []
    }

    # Try to find workout title
    title_elem = soup.find('h1') or soup.find('h2') or soup.find(class_='workout-title')
    if title_elem:
        workout["name"] = title_elem.get_text(strip=True)

    # Try to find workout date
    date_elem = soup.find(class_='workout-date') or soup.find('time')
    if date_elem:
        workout["date"] = date_elem.get_text(strip=True)

    # Try to find exercises
    exercise_elems = soup.find_all(class_='exercise') or soup.find_all(class_='workout-exercise')
    for ex in exercise_elems[:5]:  # Limit to 5 exercises
        exercise = {
            "name": ex.get_text(strip=True),
            "sets": [],
            "image": None
        }

        # Try to extract image
        img = ex.find('img')
        if img and img.get('src'):
            exercise["image"] = img.get('src')

        workout["exercises"].append(exercise)

    return workout


def extract_stats(soup):
    """Extract profile stats"""
    stats = {
        "total_workouts": "0",
        "total_volume": "0 kg",
        "streak": "0 días"
    }

    # Try to find stats
    stat_elems = soup.find_all(class_='stat') or soup.find_all(class_='profile-stat')
    for stat in stat_elems:
        text = stat.get_text(strip=True)
        # Parse based on content
        # This is placeholder logic
        if 'workout' in text.lower():
            stats["total_workouts"] = text
        elif 'kg' in text.lower() or 'volume' in text.lower():
            stats["total_volume"] = text
        elif 'streak' in text.lower() or 'días' in text.lower():
            stats["streak"] = text

    return stats


def load_existing_data():
    """Load existing data from JSON file"""
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return None
    return None


def save_data(data):
    """Save data to JSON file"""
    try:
        # Ensure directory exists
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

        # Write data
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        print(f"✓ Data saved to {OUTPUT_FILE}")
        return True

    except IOError as e:
        print(f"ERROR: Failed to save data: {e}", file=sys.stderr)
        return False


def main():
    """Main execution"""
    print("=" * 50)
    print("Hevy Workout Scraper")
    print("=" * 50)

    # Scrape new data
    new_data = scrape_hevy_profile()

    if new_data:
        # Save new data
        if save_data(new_data):
            print("✓ Scraping completed successfully")
            return 0
        else:
            print("✗ Failed to save data")
            # Keep existing data if save fails
            return 1
    else:
        print("✗ Scraping failed")
        # Keep existing data if scraping fails
        existing_data = load_existing_data()
        if existing_data:
            print("→ Keeping existing data")
            return 0
        return 1


if __name__ == "__main__":
    sys.exit(main())
