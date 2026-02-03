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


def fetch_workouts(api_key, page=1, page_size=7):
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


def fetch_exercise_templates(api_key):
    """Fetch exercise templates to get muscle group info"""
    templates = {}
    page = 1
    while True:
        try:
            response = requests.get(
                f"{HEVY_API_BASE}/exercise_templates",
                headers={"api-key": api_key, "accept": "application/json"},
                params={"page": page, "pageSize": 100},
                timeout=15
            )
            response.raise_for_status()
            data = response.json()
            page_templates = data.get("exercise_templates", [])

            if not page_templates:
                break

            for t in page_templates:
                templates[t["id"]] = {
                    "primary_muscle_group": t.get("primary_muscle_group", ""),
                    "secondary_muscle_groups": t.get("secondary_muscle_groups", [])
                }

            page += 1
        except Exception as e:
            print(f"WARNING: Could not fetch exercise templates page {page}: {e}")
            break

    return templates


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


def parse_workout(workout, templates):
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
                sets.append({
                    "reps": reps,
                    "weight": "0 kg"
                })

        if sets:
            exercise_data = {
                "name": ex.get("title", "Unknown"),
                "sets": sets
            }

            # Add muscle group from templates
            template_id = ex.get("exercise_template_id", "")
            if template_id and template_id in templates:
                t = templates[template_id]
                exercise_data["muscle_group"] = t["primary_muscle_group"]
                if t["secondary_muscle_groups"]:
                    exercise_data["secondary_muscles"] = t["secondary_muscle_groups"]

            exercises.append(exercise_data)

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

    # Fetch exercise templates for muscle group data
    print("\n→ Fetching exercise templates...")
    templates = fetch_exercise_templates(api_key)
    print(f"✓ Loaded {len(templates)} exercise templates")

    # Fetch workouts from API (latest 7)
    print("\n→ Fetching workouts from Hevy API...")
    workouts = fetch_workouts(api_key, page=1, page_size=7)

    if not workouts:
        print("✗ No workouts found or API error")
        return 1

    # Parse all workouts
    parsed = [parse_workout(w, templates) for w in workouts]

    latest = parsed[0]
    print(f"✓ Latest workout: {latest['name']} ({latest['date']})")
    print(f"  Duration: {latest['duration']}")
    print(f"  Volume: {latest['volume']}")
    print(f"  Exercises: {len(latest['exercises'])}")
    for ex in latest['exercises']:
        muscle = ex.get('muscle_group', '?')
        print(f"    - {ex['name']} [{muscle}]: {len(ex['sets'])} sets")

    # Fetch workout count
    print("\n→ Fetching workout count...")
    total_count = fetch_workout_count(api_key)
    print(f"✓ Total workouts: {total_count}")

    # Build output data — history comes directly from API
    new_data = {
        "last_updated": datetime.now().isoformat(),
        "profile_url": HEVY_PROFILE_URL,
        "last_workout": latest,
        "stats": {
            "total_workouts": str(total_count)
        },
        "previous_workouts": parsed[1:]  # Remaining workouts as history
    }

    print(f"\n✓ Tracking {len(parsed)} workouts total (1 current + {len(parsed) - 1} history)")

    # Save
    if save_data(new_data):
        print("✓ Fetch completed successfully")
        return 0
    else:
        print("✗ Failed to save data")
        return 1


if __name__ == "__main__":
    sys.exit(main())
