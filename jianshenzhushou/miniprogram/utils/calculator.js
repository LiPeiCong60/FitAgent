/**
 * calculator.js - BMR / TDEE 计算工具
 *
 * BMR 公式采用 Mifflin-St Jeor（目前公认最准确的公式之一）
 *   男: 10 × 体重(kg) + 6.25 × 身高(cm) - 5 × 年龄 + 5
 *   女: 10 × 体重(kg) + 6.25 × 身高(cm) - 5 × 年龄 - 161
 *
 * TDEE = BMR × 活动系数
 */

// 活动系数映射
const ACTIVITY_FACTORS = {
    sedentary: 1.2,        // 久坐不动
    light: 1.375,          // 轻度运动 (1-3天/周)
    moderate: 1.55,        // 中度运动 (3-5天/周)
    active: 1.725,         // 高强度运动 (6-7天/周)
    extreme: 1.9           // 专业运动员
};

// 目标热量调整
const GOAL_ADJUSTMENTS = {
    lose: -500,            // 减脂：每日减少 500 kcal
    gain: 300,             // 增肌：每日增加 300 kcal
    maintain: 0            // 维持体重
};

/**
 * 计算 BMR（基础代谢率）
 * @param {string} gender - 'male' | 'female'
 * @param {number} weight - 体重 (kg)
 * @param {number} height - 身高 (cm)
 * @param {number} age    - 年龄 (岁)
 * @returns {number} BMR (kcal/天)
 */
function calculateBMR(gender, weight, height, age) {
    const base = 10 * weight + 6.25 * height - 5 * age;
    return gender === 'male' ? base + 5 : base - 161;
}

/**
 * 计算 TDEE（每日总能量消耗）
 * @param {number} bmr           - BMR 值
 * @param {string} activityLevel - 活动等级 key
 * @returns {number} TDEE (kcal/天)
 */
function calculateTDEE(bmr, activityLevel) {
    const factor = ACTIVITY_FACTORS[activityLevel] || 1.2;
    return Math.round(bmr * factor);
}

/**
 * 计算每日目标热量
 * @param {number} tdee - TDEE 值
 * @param {string} goal - 目标: 'lose' | 'gain' | 'maintain'
 * @returns {number} 每日目标热量 (kcal/天)
 */
function calculateDailyCalories(tdee, goal) {
    const adjustment = GOAL_ADJUSTMENTS[goal] || 0;
    return Math.round(tdee + adjustment);
}

/**
 * 一次性计算所有指标
 * @param {Object} params
 * @returns {Object} { bmr, tdee, dailyCalories }
 */
function calculateAll({ gender, weight, height, age, activityLevel, goal }) {
    const bmr = calculateBMR(gender, weight, height, age);
    const tdee = calculateTDEE(bmr, activityLevel);
    const dailyCalories = calculateDailyCalories(tdee, goal);
    return {
        bmr: Math.round(bmr),
        tdee,
        dailyCalories
    };
}

module.exports = {
    ACTIVITY_FACTORS,
    GOAL_ADJUSTMENTS,
    calculateBMR,
    calculateTDEE,
    calculateDailyCalories,
    calculateAll
};
