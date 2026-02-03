#!/usr/bin/env python3
"""
Hevy Workout Fetcher via Official API
Fetches latest workout data from Hevy API (requires Pro subscription)
"""

import json
import os
import sys
from datetime import datetime

import requests

# Configuration
HEVY_API_BASE = "https://api.hevyapp.com/v1"
HEVY_PROFILE_URL = "https://hevy.com/user/cjj109"
OUTPUT_FILE = "data/gym-data.json"


def get_api_key():
    """Get Hevy API key from environment variable"""
    api_key = os.environ.get("HEVY_API_KEY", "")
    if not api_key:
        print("ERROR: HEVY_API_KEY environment variable not set", file=sys.stderr)
        print("Get your API key at https://hevy.com/settings?developer", file=sys.stderr)
        return None
    return api_key


def fetch_workouts(api_key, page=1, page_size=5):
    """Fetch workouts from Hevy API"""
    try:
        response = requests.get(
            f"{HEVY_API_BASE}/workouts",
            headers={"api-key": api_key, "accept": "application/json"},
            params={"page": page, "pageSize": page_size},
            timeout=15
        )
        response.raise_for_status()
        data = response.json()
        return data.get("workouts", [])
    except Exception as e:
        print(f"ERROR: Failed to fetch workouts: {e}", file=sys.stderr)
        return None


def fetch_workout_count(api_key):
    """Fetch total workout count"""
    try:
        response = requests.get(
            f"{HEVY_API_BASE}/workouts/count",
            headers={"api-key": api_key, "accept": "application/json"},
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        return data.get("workout_count", 0)
    except Exception as e:
        print(f"WARNING: Could not fetch workout count: {e}")
        return 0


def parse_workout(workout):
    """Parse a workout from API response into our format"""
    # Calculate duration from start_time and end_time
    duration_min = 0
    try:
        start = datetime.fromisoformat(workout["start_time"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(workout["end_time"].replace("Z", "+00:00"))
        duration_min = int((end - start).total_seconds() / 60)
    except (KeyError, ValueError):
        pass

    # Calculate total volume (sum of weight_kg * reps for all sets)
    total_volume = 0
    exercises = []

    for ex in workout.get("exercises", []):
        sets = []
        for s in ex.get("sets", []):
            weight_kg = s.get("weight_kg")
            reps = s.get("reps")

            if weight_kg is not None and reps is not None:
                total_volume += weight_kg * reps
                sets.append({
                    "reps": reps,
                    "weight": f"{weight_kg} kg"
                })
            elif reps is not None:
                # Bodyweight or cardio exercise
                sets.append({
                    "reps": reps,
                    "weight": "0 kg"
                })

        if sets:
            exercises.append({
                "name": ex.get("title", "Unknown"),
                "sets": sets,
                "image": None
            })

    # Format volume with thousands separator
    volume_str = f"{total_volume:,.0f} kg"

    # Parse date
    workout_date = datetime.now().strftime("%Y-%m-%d")
    try:
        start = datetime.fromisoformat(workout["start_time"].replace("Z", "+00:00"))
        workout_date = start.strftime("%Y-%m-%d")
    except (KeyError, ValueError):
        pass

    return {
        "name": workout.get("title", "Workout"),
        "date": workout_date,
        "duration": f"{duration_min} min",
        "volume": volume_str,
        "exercises": exercises
    }


def load_existing_data():
    """Load existing data from JSON file"""
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if "previous_workouts" not in data:
                    data["previous_workouts"] = []
                return data
        except (json.JSONDecodeError, IOError):
            return None
    return None


def is_new_workout(new_workout, old_workout):
    """Check if the new workout is different from the old one"""
    if not old_workout:
        return True
    return (new_workout.get("date") != old_workout.get("date") or
            new_workout.get("name") != old_workout.get("name"))


def save_data(data):
    """Save data to JSON file"""
    try:
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
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
    print("Hevy Workout Fetcher (API)")
    print("=" * 50)

    # Get API key
    api_key = get_api_key()
    if not api_key:
        return 1

    # Load existing data
    existing_data = load_existing_data()

    # Fetch workouts from API
    print("\n→ Fetching workouts from Hevy API...")
    workouts = fetch_workouts(api_key, page=1, page_size=7)

    if not workouts:
        print("✗ No workouts found or API error")
        if existing_data:
            print("→ Keeping existing data")
            return 0
        return 1

    # Parse latest workout
    latest = parse_workout(workouts[0])
    print(f"✓ Latest workout: {latest['name']} ({latest['date']})")
    print(f"  Duration: {latest['duration']}")
    print(f"  Volume: {latest['volume']}")
    print(f"  Exercises: {len(latest['exercises'])}")
    for ex in latest['exercises']:
        print(f"    - {ex['name']}: {len(ex['sets'])} sets")

    # Fetch workout count
    print("\n→ Fetching workout count...")
    total_count = fetch_workout_count(api_key)
    print(f"✓ Total workouts: {total_count}")

    # Build output data
    new_data = {
        "last_updated": datetime.now().isoformat(),
        "profile_url": HEVY_PROFILE_URL,
        "last_workout": latest,
        "stats": {
            "total_workouts": str(total_count),
            "total_volume": "0 kg",
            "streak": "0 días"
        }
    }

    # Handle workout history
    if existing_data and is_new_workout(latest, existing_data.get("last_workout")):
        print("\n→ New workout detected! Saving previous workout to history...")
        previous_workouts = existing_data.get("previous_workouts", [])
        previous_workouts.insert(0, existing_data["last_workout"])
        new_data["previous_workouts"] = previous_workouts[:6]
        print(f"  ✓ Now tracking {len(new_data['previous_workouts']) + 1} workouts total")
    elif existing_data:
        new_data["previous_workouts"] = existing_data.get("previous_workouts", [])
        print("\n→ Same workout as before, updating data")
    else:
        new_data["previous_workouts"] = []
        print("\n→ First workout saved!")

    # Save
    if save_data(new_data):
        print("✓ Fetch completed successfully")
        return 0
    else:
        print("✗ Failed to save data")
        return 1


if __name__ == "__main__":
    sys.exit(main())
