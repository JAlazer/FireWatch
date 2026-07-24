from datetime import datetime

# In-memory store for the three seeded mock users.
# Structure mirrors the Pydantic schemas so repositories can return these dicts directly.
MOCK_USERS: dict[str, dict] = {
    "user_001": {
        "user": {
            "user_id": "user_001",
            "name": "Maya Chen",
            "email": "maya.chen@example.com",
            "created_at": datetime(2025, 1, 15, 9, 0, 0),
        },
        "biometrics": {
            "hrv": 72.0,
            "resting_heart_rate": 54,
            "skin_temperature": 92.1,
            "respiratory_rate": 13.0,
            "spo2": 98.0,
            "sleep_hours": 8.2,
        },
        "lifestyle": {
            "diet": "healthy",
            "has_autoimmune_condition": False,
            "smoking_status": "never",
            "alcohol_consumption": "none",
            "medications": [],
            "activity_level": "active",
            "perceived_stress_level": 2,
            "works_shift_work": False,
            "family_history_autoimmune": False,
            "currently_in_flare": False,
        },
    },
    "user_002": {
        "user": {
            "user_id": "user_002",
            "name": "James Okafor",
            "email": "james.okafor@example.com",
            "created_at": datetime(2025, 2, 3, 14, 30, 0),
        },
        "biometrics": {
            "hrv": 38.0,
            "resting_heart_rate": 74,
            "skin_temperature": 94.8,
            "respiratory_rate": 17.0,
            "spo2": 95.0,
            "sleep_hours": 5.5,
        },
        "lifestyle": {
            "diet": "unhealthy",
            "has_autoimmune_condition": False,
            "smoking_status": "former",
            "alcohol_consumption": "light",
            "medications": ["ibuprofen"],
            "activity_level": "light",
            "perceived_stress_level": 8,
            "works_shift_work": True,
            "family_history_autoimmune": True,
            "currently_in_flare": False,
        },
    },
    "user_003": {
        "user": {
            "user_id": "user_003",
            "name": "Sofia Reyes",
            "email": "sofia.reyes@example.com",
            "created_at": datetime(2025, 3, 10, 11, 15, 0),
        },
        "biometrics": {
            "hrv": 18.0,
            "resting_heart_rate": 88,
            "skin_temperature": 97.2,
            "respiratory_rate": 21.0,
            "spo2": 91.0,
            "sleep_hours": 4.0,
        },
        "lifestyle": {
            "diet": "very_unhealthy",
            "has_autoimmune_condition": True,
            "smoking_status": "current",
            "alcohol_consumption": "heavy",
            "medications": ["methotrexate", "prednisone"],
            "activity_level": "sedentary",
            "perceived_stress_level": 9,
            "works_shift_work": True,
            "family_history_autoimmune": True,
            "currently_in_flare": True,
        },
    },
}
