/**
 * Biometrics are pieces of biological data that can be measured through use of a wearable smart device.
 * These include:
 *  - heartRateVariability <- int
 *  - restingHeartRate <- int
 *  - respiratoryRate <- int
 *  - bloodOxygenSaturation <- int
 *  - skinTemperature <- int
 *  - sleepTimeAverage <- int
 *  - stepCount <- int
 *  - activeEnergy <- int
 *  - totalEnergy <- int
 */
class Biometrics {
    constructor(heartRateVariability, restingHeartRate, respiratoryRate, bloodOxygenSaturation, skinTemperature, sleepTimeAverage, stepCount, activeEnergy, totalEnergy) {
        this.heartRateVariability = heartRateVariability;
        this.restingHeartRate = restingHeartRate;
        this.respiratoryRate = respiratoryRate;
        this.bloodOxygenSaturation = bloodOxygenSaturation;
        this.skinTemperature = skinTemperature;
        this.sleepTimeAverage = sleepTimeAverage;
        this.stepCount = stepCount;
        this.activeEnergy = activeEnergy;
        this.totalEnergy = totalEnergy;
    }
}


/**
 * A Lifestyle is made up of qualitative pieces of information about a user's lifestyle.
 * They are as follows:
 *  - dietSentiment <- "Very Unhealthy" | "Unhealthy" | "Moderate" | "Healthy" | "Very Healthy"
 *  - hasAutoimmuneCondition <- boolean
 *  - isASmoker <- boolean
 *  - isAlcoholic <- boolean
 *  - isStressed <- boolean
 */
class Lifestyle {
    constructor(dietSentiment, hasAutoimmmuneCondition, isASmoker, isAlcoholic, isStressed) {
        this.dietSentiment = dietSentiment;
        this.hasAutoimmmuneCondition = hasAutoimmmuneCondition;
        this.isASmoker = isASmoker;
        this.isAlcoholic = isAlcoholic;
        this.isStressed = isStressed;
    }
}


/**
 * A User is one who has:
 *  - lifestyle <- Lifestyle
 *  - biometrics <- Biometrics
 *  - inflammationLevel <- int [1,5] 1 - no inflammation, and 5 - high inflammation
 */
class User {
    constructor(biometrics, lifestyle, inflammationLevel) {
        this.biometrics = biometrics;
        this.lifestyle = lifestyle;
        this.inflammationLevel = inflammationLevel;
    }
}

// array of users as mock data
const mockUsers = []
