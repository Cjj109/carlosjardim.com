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

        # Wait for page to load
        print("Waiting for page to load...")
        wait = WebDriverWait(driver, TIMEOUT)
        time.sleep(3)  # Give page time to render

        # Look for "See more exercises" link or button
        print("Looking for workout details link...")
        workout_url = None

        try:
            # Try to find "See more exercises" link/button
            see_more_selectors = [
                "//a[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'see more')]",
                "//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'see more')]",
                "//a[contains(@href, '/workout/')]",
                "//a[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'view workout')]"
            ]

            for selector in see_more_selectors:
                try:
                    elements = driver.find_elements(By.XPATH, selector)
                    if elements:
                        # Get the first workout link
                        element = elements[0]
                        workout_url = element.get_attribute('href')
                        if workout_url:
                            print(f"✓ Found workout link: {workout_url}")
                            break
                except:
                    continue

            if workout_url:
                # Navigate to the workout detail page
                print(f"Loading workout details from {workout_url}...")
                driver.get(workout_url)
                time.sleep(3)  # Wait for workout page to load

        except Exception as e:
            print(f"WARNING: Could not find workout detail link: {e}")

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
    import re

    workout = {
        "name": "Último Workout",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "duration": "0 min",
        "volume": "0 kg",
        "exercises": []
    }

    try:
        # Wait for dynamic content to load
        time.sleep(5)

        # Get all text content from the page
        page_text = driver.find_element(By.TAG_NAME, 'body').text
        print(f"Page text preview: {page_text[:500]}...")

        # Try to find workout name in page title or h1/h2
        title_selectors = ['h1', 'h2', '[class*="title" i]', '[class*="Title" i]']
        for selector in title_selectors:
            try:
                elements = driver.find_elements(By.CSS_SELECTOR, selector)
                for elem in elements:
                    text = elem.text.strip()
                    if text and len(text) > 2 and text != "Loading..." and "Sign Up" not in text and "Log in" not in text:
                        workout["name"] = text
                        print(f"✓ Workout name: {workout['name']}")
                        break
                if workout["name"] != "Último Workout":
                    break
            except:
                continue

        # If still not found, try to extract from page text (format: "username\ntime ago\nWorkout Name\nDuration")
        if workout["name"] == "Último Workout":
            name_match = re.search(r'(?:a day ago|[\d]+ (?:days?|hours?|minutes?) ago)\s+([A-Z][A-Za-z0-9\s]+)\s+Duration', page_text)
            if name_match:
                workout["name"] = name_match.group(1).strip()
                print(f"✓ Workout name (from text): {workout['name']}")

        # Extract all visible text and parse with regex
        import re

        # Duration pattern - "Duration\n57min"
        duration_match = re.search(r'Duration\s*(\d+)\s*min', page_text, re.IGNORECASE)
        if duration_match:
            workout["duration"] = f"{duration_match.group(1)} min"
            print(f"✓ Duration: {workout['duration']}")

        # Volume pattern - "Volume\n10,607 kg"
        volume_match = re.search(r'Volume\s*([\d,]+)\s*kg', page_text, re.IGNORECASE)
        if volume_match:
            workout["volume"] = f"{volume_match.group(1)} kg"
            print(f"✓ Volume: {workout['volume']}")

        # Extract exercises
        # Pattern: Exercise Name (Equipment)\nSETS\nWEIGHT & REPS\n1\n110kg x 8 reps\n2\n110kg x 8 reps
        # Split by exercise sections
        exercise_sections = re.split(r'(?=^[A-Z][a-zA-Z\s]+\([A-Za-z]+\))', page_text, flags=re.MULTILINE)

        for section in exercise_sections:
            # Check if this is an exercise section
            exercise_name_match = re.match(r'^([A-Z][a-zA-Z\s]+\([A-Za-z]+\))', section)
            if not exercise_name_match:
                continue

            exercise_name = exercise_name_match.group(1).strip()

            # Find all sets in this exercise: "110kg x 8 reps"
            set_matches = re.findall(r'([\d.]+)\s*kg\s*x\s*(\d+)\s*reps?', section, re.IGNORECASE)

            if set_matches:
                exercise = {
                    "name": exercise_name,
                    "sets": [],
                    "image": None
                }

                for weight, reps in set_matches:
                    exercise["sets"].append({
                        "reps": int(reps),
                        "weight": f"{weight} kg"
                    })

                workout["exercises"].append(exercise)
                print(f"  ✓ Exercise: {exercise_name} - {len(set_matches)} sets")

        if len(workout["exercises"]) > 5:
            workout["exercises"] = workout["exercises"][:5]  # Limit to 5 exercises

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

    # Stats are usually on the profile page, not the workout detail page
    # For now, return default values since we're on the workout page
    # In the future, we could navigate back to profile or extract from profile page first

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
