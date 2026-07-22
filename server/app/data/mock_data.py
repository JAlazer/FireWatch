from dataclasses import dataclass


@dataclass
class Biometrics:
    """
    Biometrics are pieces of biological data that can be measured through use of a wearable smart device.
    These include:
     - heartRateVariability <- int
     - restingHeartRate <- int
     - respiratoryRate <- int
     - bloodOxygenSaturation <- int
     - skinTemperature <- int
     - sleepTimeAverage <- int
     - stepCount <- int
     - activeEnergy <- int
     - totalEnergy <- int
    """
    heartRateVariability: int
    restingHeartRate: int
    respiratoryRate: int
    bloodOxygenSaturation: int
    skinTemperature: int
    sleepTimeAverage: float
    stepCount: int
    activeEnergy: int
    totalEnergy: int


@dataclass
class Lifestyle:
    """
    A Lifestyle is made up of qualitative pieces of information about a user's lifestyle.
    They are as follows:
     - dietSentiment <- "Very Unhealthy" | "Unhealthy" | "Moderate" | "Healthy" | "Very Healthy"
     - hasAutoimmuneCondition <- boolean
     - isASmoker <- boolean
     - isAlcoholic <- boolean
     - isStressed <- boolean
    """
    dietSentiment: str
    hasAutoimmuneCondition: bool
    isASmoker: bool
    isAlcoholic: bool
    isStressed: bool


@dataclass
class User:
    """
    A User is one who has:
     - lifestyle <- Lifestyle
     - biometrics <- Biometrics
     - inflammationLevel <- int [1,5] 1 - no inflammation, and 5 - high inflammation
    """
    biometrics: Biometrics
    lifestyle: Lifestyle
    inflammationLevel: int


# array of users as mock data
mock_users = [
    # --- Low inflammation (1) : healthy lifestyle, strong biometrics ---
    User(
        Biometrics(72, 54, 13, 98, 92, 8, 11200, 520, 2400),
        Lifestyle("Very Healthy", False, False, False, False),
        1
    ),
    User(
        Biometrics(68, 56, 14, 97, 93, 7.8, 9800, 480, 2300),
        Lifestyle("Healthy", False, False, False, False),
        1
    ),
    User(
        Biometrics(75, 52, 13, 98, 92, 8.2, 10500, 510, 2500),
        Lifestyle("Very Healthy", False, False, False, False),
        1
    ),

    # --- Mild inflammation (2) : mostly healthy, one or two risk factors ---
    User(
        Biometrics(58, 62, 15, 96, 94, 7, 7600, 380, 2200),
        Lifestyle("Healthy", False, False, False, True),
        2
    ),
    User(
        Biometrics(55, 64, 16, 96, 94, 6.5, 6900, 340, 2150),
        Lifestyle("Moderate", False, False, False, False),
        2
    ),
    User(
        Biometrics(60, 61, 15, 97, 93, 7.2, 8100, 400, 2250),
        Lifestyle("Moderate", True, False, False, False),
        2
    ),

    # --- Moderate inflammation (3) : autoimmune condition and/or stress ---
    User(
        Biometrics(42, 70, 17, 95, 95, 6, 5200, 280, 2000),
        Lifestyle("Moderate", True, False, False, True),
        3
    ),
    User(
        Biometrics(45, 68, 17, 95, 95, 5.8, 4800, 260, 1950),
        Lifestyle("Unhealthy", False, True, False, True),
        3
    ),
    User(
        Biometrics(40, 72, 18, 94, 96, 6.2, 5000, 270, 2050),
        Lifestyle("Moderate", True, False, True, False),
        3
    ),
    User(
        Biometrics(43, 69, 16, 95, 95, 5.5, 4600, 250, 1900),
        Lifestyle("Unhealthy", True, False, False, False),
        3
    ),

    # --- High inflammation (4) : multiple risk factors compounding ---
    User(
        Biometrics(30, 82, 19, 93, 97, 5, 3200, 190, 1800),
        Lifestyle("Unhealthy", True, True, False, True),
        4
    ),
    User(
        Biometrics(28, 85, 20, 92, 97, 4.5, 2800, 170, 1750),
        Lifestyle("Unhealthy", True, False, True, True),
        4
    ),
    User(
        Biometrics(32, 80, 19, 93, 97, 5.2, 3400, 200, 1850),
        Lifestyle("Very Unhealthy", False, True, True, False),
        4
    ),

    # --- Very high inflammation (5) : severe compounding risk factors ---
    User(
        Biometrics(20, 92, 22, 90, 99, 4, 1800, 130, 1650),
        Lifestyle("Very Unhealthy", True, True, True, True),
        5
    ),
    User(
        Biometrics(18, 95, 23, 89, 99, 3.8, 1500, 110, 1600),
        Lifestyle("Very Unhealthy", True, True, True, True),
        5
    ),
    User(
        Biometrics(22, 90, 21, 91, 98, 4.3, 2000, 140, 1700),
        Lifestyle("Very Unhealthy", True, False, True, True),
        5
    ),

    # --- Edge cases: worth keeping in your test set ---
    # Athletic build masking some inflammation risk (low RHR despite risk factors)
    User(
        Biometrics(50, 58, 15, 96, 95, 6.8, 12500, 650, 2600),
        Lifestyle("Moderate", True, False, False, True),
        3
    ),
    # Sedentary but otherwise clean lifestyle (low activity, no other risk factors)
    User(
        Biometrics(65, 60, 14, 97, 93, 7.5, 3000, 150, 2000),
        Lifestyle("Healthy", False, False, False, False),
        2
    ),
]