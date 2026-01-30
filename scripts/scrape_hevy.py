#!/usr/bin/env python3
"""
Hevy.com Workout Scraper with Selenium
Extracts latest workout data from public Hevy profile
"""

import json
import os
import sys
import time
from datetime import datetime

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.options import Options
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
except ImportError:
    print("ERROR: Selenium not installed. Install with: pip install selenium", file=sys.stderr)
    sys.exit(1)

# Configuration
HEVY_PROFILE_URL = "https://hevy.com/user/cjj109"
TIMEOUT = 20
OUTPUT_FILE = "data/gym-data.json"

def setup_driver():
    """Setup headless Chrome driver"""
    chrome_options = Options()
    chrome_options.add_argument('--headless')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--disable-gpu')
    chrome_options.add_argument('--window-size=1920,1080')
    chrome_options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')

    try:
        driver = webdriver.Chrome(options=chrome_options)
        return driver
    except Exception as e:
        print(f"ERROR: Failed to setup Chrome driver: {e}", file=sys.stderr)
        print("Make sure chromedriver is installed and in PATH", file=sys.stderr)
        return None


def scrape_hevy_profile():
    """Scrape workout data from Hevy profile using Selenium"""
    driver = None

    try:
        print(f"Setting up Chrome driver...")
        driver = setup_driver()
        if not driver:
            return None

        print(f"Loading {HEVY_PROFILE_URL}...")
        driver.get(HEVY_PROFILE_URL)

        # Wait for page to load - wait for workout cards or profile stats
        print("Waiting for page to load...")
        wait = WebDriverWait(driver, TIMEOUT)

        # Try to wait for workout content to appear
        try:
            wait.until(
                lambda d: len(d.find_elements(By.CSS_SELECTOR, '[class*="workout"], [class*="Workout"], article, .card')) > 0
            )
            print("✓ Page loaded")
            time.sleep(2)  # Additional wait for dynamic content
        except TimeoutException:
            print("WARNING: Timeout waiting for workout content. Trying to extract anyway...")

        # Extract data
        workout_data = {
            "last_updated": datetime.now().isoformat(),
            "profile_url": HEVY_PROFILE_URL,
            "last_workout": extract_last_workout(driver),
            "stats": extract_stats(driver)
        }

        return workout_data

    except Exception as e:
        print(f"ERROR: Scraping failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return None

    finally:
        if driver:
            driver.quit()


def extract_last_workout(driver):
    """Extract last workout details from page"""
    workout = {
        "name": "Último Workout",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "duration": "0 min",
        "volume": "0 kg",
        "exercises": []
    }

    try:
        # Try multiple selectors for workout cards
        workout_selectors = [
            'article',
            '[class*="WorkoutCard"]',
            '[class*="workout-card"]',
            '.card',
            '[data-testid*="workout"]'
        ]

        workout_element = None
        for selector in workout_selectors:
            elements = driver.find_elements(By.CSS_SELECTOR, selector)
            if elements:
                workout_element = elements[0]
                print(f"✓ Found workout with selector: {selector}")
                break

        if not workout_element:
            print("WARNING: No workout element found. Using default values.")
            return workout

        # Extract workout name/title
        title_selectors = ['h1', 'h2', 'h3', '[class*="title"]', '[class*="Title"]']
        for selector in title_selectors:
            try:
                title = workout_element.find_element(By.CSS_SELECTOR, selector)
                if title and title.text.strip():
                    workout["name"] = title.text.strip()
                    print(f"✓ Workout name: {workout['name']}")
                    break
            except NoSuchElementException:
                continue

        # Extract date
        time_element = workout_element.find_elements(By.TAG_NAME, 'time')
        if time_element:
            workout["date"] = time_element[0].get_attribute('datetime') or time_element[0].text.strip()
            print(f"✓ Date: {workout['date']}")

        # Extract all text from workout card to find duration/volume
        workout_text = workout_element.text
        print(f"Workout card text preview: {workout_text[:200]}...")

        # Look for patterns like "65 min", "1h 5min", "4,250 kg", "4250kg"
        import re

        # Duration patterns
        duration_patterns = [
            r'(\d+)\s*h\s*(\d+)\s*min',  # 1h 30min
            r'(\d+)\s*min',               # 65 min
            r'(\d+)\s*m(?!g|uscle)'       # 65m (but not mg or muscle)
        ]
        for pattern in duration_patterns:
            match = re.search(pattern, workout_text, re.IGNORECASE)
            if match:
                if len(match.groups()) == 2:
                    workout["duration"] = f"{int(match.group(1))*60 + int(match.group(2))} min"
                else:
                    workout["duration"] = f"{match.group(1)} min"
                print(f"✓ Duration: {workout['duration']}")
                break

        # Volume patterns
        volume_patterns = [
            r'([\d,]+)\s*kg',             # 4,250 kg
            r'([\d,]+)\s*lbs'             # 9,370 lbs
        ]
        for pattern in volume_patterns:
            match = re.search(pattern, workout_text, re.IGNORECASE)
            if match:
                workout["volume"] = f"{match.group(1)} kg"
                print(f"✓ Volume: {workout['volume']}")
                break

        # Try to extract exercises
        exercise_elements = workout_element.find_elements(By.CSS_SELECTOR, '[class*="exercise"], [class*="Exercise"]')

        if not exercise_elements:
            # Try finding exercises by looking for lists or repeated elements
            exercise_elements = workout_element.find_elements(By.CSS_SELECTOR, 'li, [role="listitem"]')

        print(f"Found {len(exercise_elements)} exercise elements")

        for i, ex_elem in enumerate(exercise_elements[:5]):  # Limit to 5 exercises
            try:
                ex_text = ex_elem.text.strip()
                if not ex_text or len(ex_text) < 3:
                    continue

                exercise = {
                    "name": ex_text.split('\n')[0] if '\n' in ex_text else ex_text,
                    "sets": [],
                    "image": None
                }

                # Try to parse sets from text
                # Look for patterns like "3 × 10 @ 50kg" or "10 reps × 50kg"
                set_patterns = [
                    r'(\d+)\s*×\s*(\d+)\s*@\s*([\d.]+)\s*kg',
                    r'(\d+)\s*reps?\s*×\s*([\d.]+)\s*kg'
                ]

                for pattern in set_patterns:
                    matches = re.findall(pattern, ex_text, re.IGNORECASE)
                    for match in matches:
                        if len(match) == 3:
                            # sets × reps @ weight
                            num_sets = int(match[0])
                            reps = int(match[1])
                            weight = match[2]
                            for _ in range(num_sets):
                                exercise["sets"].append({
                                    "reps": reps,
                                    "weight": f"{weight} kg"
                                })

                if exercise["sets"] or len(exercise["name"]) > 3:
                    workout["exercises"].append(exercise)
                    print(f"  ✓ Exercise {i+1}: {exercise['name']}")

            except Exception as e:
                print(f"  ⚠ Error parsing exercise {i+1}: {e}")
                continue

    except Exception as e:
        print(f"WARNING: Error extracting workout details: {e}")
        import traceback
        traceback.print_exc()

    return workout


def extract_stats(driver):
    """Extract profile stats"""
    stats = {
        "total_workouts": "0",
        "total_volume": "0 kg",
        "streak": "0 días"
    }

    try:
        # Look for stats in various places
        stat_selectors = [
            '[class*="stat"]',
            '[class*="Stat"]',
            '[class*="metric"]',
            '[data-testid*="stat"]'
        ]

        stat_elements = []
        for selector in stat_selectors:
            elements = driver.find_elements(By.CSS_SELECTOR, selector)
            if elements:
                stat_elements = elements
                print(f"✓ Found {len(elements)} stat elements with selector: {selector}")
                break

        # Parse stat text
        import re
        for stat in stat_elements[:10]:  # Check first 10 stats
            text = stat.text.strip()
            if not text:
                continue

            # Workout count
            if re.search(r'workout', text, re.IGNORECASE):
                match = re.search(r'(\d+)', text)
                if match:
                    stats["total_workouts"] = match.group(1)
                    print(f"✓ Total workouts: {stats['total_workouts']}")

            # Volume
            elif 'kg' in text.lower() or 'volume' in text.lower():
                match = re.search(r'([\d,]+)\s*kg', text, re.IGNORECASE)
                if match:
                    stats["total_volume"] = f"{match.group(1)} kg"
                    print(f"✓ Total volume: {stats['total_volume']}")

            # Streak
            elif 'streak' in text.lower() or 'día' in text.lower() or 'day' in text.lower():
                match = re.search(r'(\d+)', text)
                if match:
                    stats["streak"] = f"{match.group(1)} días"
                    print(f"✓ Streak: {stats['streak']}")

    except Exception as e:
        print(f"WARNING: Error extracting stats: {e}")

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
    print("Hevy Workout Scraper (Selenium)")
    print("=" * 50)

    # Scrape new data
    new_data = scrape_hevy_profile()

    if new_data and (new_data["last_workout"]["name"] != "Último Workout" or new_data["stats"]["total_workouts"] != "0"):
        # Save new data if we got something useful
        if save_data(new_data):
            print("✓ Scraping completed successfully")
            return 0
        else:
            print("✗ Failed to save data")
            return 1
    else:
        print("✗ Scraping failed or no data found")
        # Keep existing data if scraping fails
        existing_data = load_existing_data()
        if existing_data:
            print("→ Keeping existing data")
            return 0
        return 1


if __name__ == "__main__":
    sys.exit(main())
