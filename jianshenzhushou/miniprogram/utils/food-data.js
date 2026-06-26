/**
 * food-data.js - 常见食物热量数据库
 * 单位: 每 100g 的营养含量
 */

const FOOD_DATABASE = [
    // ---- 主食类 ----
    { id: 1, name: '白米饭', calories: 116, protein: 2.6, fat: 0.3, carbs: 25.9, category: '主食', unit: '一碗 200g' },
    { id: 2, name: '馒头', calories: 223, protein: 7.0, fat: 1.1, carbs: 44.2, category: '主食', unit: '一个 100g' },
    { id: 3, name: '面条(煮)', calories: 110, protein: 3.4, fat: 0.3, carbs: 24.3, category: '主食', unit: '一碗 250g' },
    { id: 4, name: '全麦面包', calories: 246, protein: 8.5, fat: 3.4, carbs: 41.3, category: '主食', unit: '一片 40g' },
    { id: 5, name: '红薯', calories: 86, protein: 1.6, fat: 0.1, carbs: 20.1, category: '主食', unit: '一个 200g' },
    { id: 6, name: '玉米', calories: 112, protein: 4.0, fat: 1.2, carbs: 22.8, category: '主食', unit: '一根 200g' },
    { id: 7, name: '燕麦片', calories: 377, protein: 13.5, fat: 6.7, carbs: 66.3, category: '主食', unit: '一份 40g' },
    { id: 8, name: '小米粥', calories: 46, protein: 1.4, fat: 0.7, carbs: 8.4, category: '主食', unit: '一碗 300g' },
    { id: 9, name: '饺子(猪肉)', calories: 183, protein: 8.3, fat: 6.2, carbs: 23.5, category: '主食', unit: '10个 200g' },
    { id: 10, name: '包子(猪肉)', calories: 227, protein: 8.4, fat: 8.5, carbs: 28.6, category: '主食', unit: '一个 80g' },

    // ---- 肉类 ----
    { id: 11, name: '鸡胸肉', calories: 133, protein: 31.0, fat: 1.2, carbs: 0, category: '肉类', unit: '一块 150g' },
    { id: 12, name: '鸡腿', calories: 181, protein: 16.0, fat: 13.0, carbs: 0, category: '肉类', unit: '一个 120g' },
    { id: 13, name: '猪瘦肉', calories: 143, protein: 20.3, fat: 6.2, carbs: 1.5, category: '肉类', unit: '一份 100g' },
    { id: 14, name: '猪五花', calories: 349, protein: 14.0, fat: 32.0, carbs: 0, category: '肉类', unit: '一份 100g' },
    { id: 15, name: '牛肉(瘦)', calories: 106, protein: 20.2, fat: 2.3, carbs: 1.2, category: '肉类', unit: '一份 100g' },
    { id: 16, name: '牛排', calories: 188, protein: 19.5, fat: 12.0, carbs: 0, category: '肉类', unit: '一块 200g' },
    { id: 17, name: '羊肉', calories: 203, protein: 19.0, fat: 14.1, carbs: 0, category: '肉类', unit: '一份 100g' },
    { id: 18, name: '鸭肉', calories: 240, protein: 15.5, fat: 19.7, carbs: 0.2, category: '肉类', unit: '一份 100g' },

    // ---- 海鲜类 ----
    { id: 19, name: '三文鱼', calories: 139, protein: 21.3, fat: 6.3, carbs: 0, category: '海鲜', unit: '一块 100g' },
    { id: 20, name: '虾仁', calories: 48, protein: 10.8, fat: 0.3, carbs: 0, category: '海鲜', unit: '一份 100g' },
    { id: 21, name: '鲈鱼', calories: 105, protein: 18.6, fat: 3.4, carbs: 0, category: '海鲜', unit: '一条 300g' },
    { id: 22, name: '带鱼', calories: 127, protein: 17.7, fat: 4.9, carbs: 3.1, category: '海鲜', unit: '一条 150g' },

    // ---- 蛋奶类 ----
    { id: 23, name: '鸡蛋(煮)', calories: 144, protein: 13.3, fat: 8.8, carbs: 2.8, category: '蛋奶', unit: '一个 50g' },
    { id: 24, name: '牛奶', calories: 54, protein: 3.0, fat: 3.2, carbs: 3.4, category: '蛋奶', unit: '一杯 250ml' },
    { id: 25, name: '酸奶', calories: 72, protein: 2.5, fat: 2.7, carbs: 9.3, category: '蛋奶', unit: '一杯 200ml' },
    { id: 26, name: '豆浆', calories: 31, protein: 1.8, fat: 0.7, carbs: 3.3, category: '蛋奶', unit: '一杯 300ml' },

    // ---- 蔬菜类 ----
    { id: 27, name: '西兰花', calories: 36, protein: 4.1, fat: 0.6, carbs: 4.3, category: '蔬菜', unit: '一份 150g' },
    { id: 28, name: '菠菜', calories: 24, protein: 2.6, fat: 0.3, carbs: 3.6, category: '蔬菜', unit: '一份 100g' },
    { id: 29, name: '番茄', calories: 15, protein: 0.9, fat: 0.2, carbs: 3.3, category: '蔬菜', unit: '一个 150g' },
    { id: 30, name: '黄瓜', calories: 15, protein: 0.7, fat: 0.1, carbs: 2.9, category: '蔬菜', unit: '一根 200g' },
    { id: 31, name: '生菜', calories: 13, protein: 1.3, fat: 0.3, carbs: 1.7, category: '蔬菜', unit: '一份 100g' },
    { id: 32, name: '胡萝卜', calories: 37, protein: 1.0, fat: 0.2, carbs: 8.8, category: '蔬菜', unit: '一根 120g' },
    { id: 33, name: '土豆', calories: 76, protein: 2.0, fat: 0.2, carbs: 16.5, category: '蔬菜', unit: '一个 200g' },
    { id: 34, name: '青椒', calories: 22, protein: 1.0, fat: 0.2, carbs: 4.9, category: '蔬菜', unit: '一个 80g' },
    { id: 35, name: '白菜', calories: 17, protein: 1.5, fat: 0.2, carbs: 2.2, category: '蔬菜', unit: '一份 150g' },

    // ---- 水果类 ----
    { id: 36, name: '苹果', calories: 53, protein: 0.2, fat: 0.1, carbs: 13.5, category: '水果', unit: '一个 200g' },
    { id: 37, name: '香蕉', calories: 93, protein: 1.4, fat: 0.2, carbs: 22.0, category: '水果', unit: '一根 120g' },
    { id: 38, name: '橙子', calories: 48, protein: 0.8, fat: 0.2, carbs: 11.1, category: '水果', unit: '一个 200g' },
    { id: 39, name: '葡萄', calories: 43, protein: 0.5, fat: 0.2, carbs: 10.3, category: '水果', unit: '一串 200g' },
    { id: 40, name: '西瓜', calories: 25, protein: 0.5, fat: 0.1, carbs: 5.8, category: '水果', unit: '一块 300g' },
    { id: 41, name: '草莓', calories: 30, protein: 1.0, fat: 0.2, carbs: 6.2, category: '水果', unit: '一份 150g' },

    // ---- 豆制品 ----
    { id: 42, name: '豆腐', calories: 81, protein: 8.1, fat: 3.7, carbs: 4.2, category: '豆制品', unit: '一块 150g' },
    { id: 43, name: '豆腐干', calories: 140, protein: 16.2, fat: 7.5, carbs: 2.8, category: '豆制品', unit: '一块 50g' },

    // ---- 坚果零食 ----
    { id: 44, name: '核桃', calories: 646, protein: 14.9, fat: 58.8, carbs: 19.1, category: '坚果', unit: '一把 30g' },
    { id: 45, name: '花生', calories: 313, protein: 12.0, fat: 25.4, carbs: 13.0, category: '坚果', unit: '一把 30g' },
    { id: 46, name: '杏仁', calories: 578, protein: 21.4, fat: 50.6, carbs: 19.7, category: '坚果', unit: '一把 25g' },

    // ---- 常见菜品 ----
    { id: 47, name: '西红柿炒蛋', calories: 86, protein: 5.2, fat: 5.1, carbs: 4.6, category: '菜品', unit: '一份 200g' },
    { id: 48, name: '宫保鸡丁', calories: 170, protein: 15.0, fat: 9.0, carbs: 8.0, category: '菜品', unit: '一份 200g' },
    { id: 49, name: '麻婆豆腐', calories: 120, protein: 7.8, fat: 7.2, carbs: 5.8, category: '菜品', unit: '一份 200g' },
    { id: 50, name: '清炒时蔬', calories: 45, protein: 2.0, fat: 2.5, carbs: 3.5, category: '菜品', unit: '一份 200g' },
    { id: 51, name: '红烧肉', calories: 278, protein: 12.0, fat: 24.0, carbs: 4.0, category: '菜品', unit: '一份 150g' },
    { id: 52, name: '鱼香肉丝', calories: 148, protein: 10.5, fat: 8.0, carbs: 8.5, category: '菜品', unit: '一份 200g' },
    { id: 53, name: '水煮牛肉', calories: 135, protein: 16.0, fat: 6.5, carbs: 3.5, category: '菜品', unit: '一份 250g' },
    { id: 54, name: '蛋炒饭', calories: 174, protein: 5.8, fat: 6.2, carbs: 24.0, category: '菜品', unit: '一份 300g' },
    { id: 55, name: '炸鸡腿', calories: 245, protein: 18.0, fat: 16.0, carbs: 8.0, category: '菜品', unit: '一个 130g' },

    // ---- 饮品 ----
    { id: 56, name: '可口可乐', calories: 43, protein: 0, fat: 0, carbs: 10.6, category: '饮品', unit: '一罐 330ml' },
    { id: 57, name: '美式咖啡', calories: 2, protein: 0.1, fat: 0, carbs: 0.3, category: '饮品', unit: '一杯 350ml' },
    { id: 58, name: '拿铁咖啡', calories: 57, protein: 3.4, fat: 3.1, carbs: 4.0, category: '饮品', unit: '一杯 350ml' },
    { id: 59, name: '奶茶(珍珠)', calories: 95, protein: 1.2, fat: 2.8, carbs: 16.0, category: '饮品', unit: '一杯 500ml' },
    { id: 60, name: '橙汁', calories: 45, protein: 0.7, fat: 0.2, carbs: 10.1, category: '饮品', unit: '一杯 250ml' },
];

/**
 * 搜索食物
 * @param {string} keyword - 关键词
 * @returns {Array} 匹配的食物列表
 */
function searchFood(keyword) {
    if (!keyword || !keyword.trim()) return FOOD_DATABASE;
    const kw = keyword.trim().toLowerCase();
    return FOOD_DATABASE.filter(item =>
        item.name.toLowerCase().includes(kw) ||
        item.category.toLowerCase().includes(kw)
    );
}

/**
 * 按份量计算实际营养
 * @param {Object} food - 食物对象
 * @param {number} grams - 实际克数
 * @returns {Object} 实际营养数据
 */
function calculateNutrition(food, grams) {
    const ratio = grams / 100;
    return {
        name: food.name,
        grams,
        calories: Math.round(food.calories * ratio),
        protein: Math.round(food.protein * ratio * 10) / 10,
        fat: Math.round(food.fat * ratio * 10) / 10,
        carbs: Math.round(food.carbs * ratio * 10) / 10
    };
}

module.exports = {
    FOOD_DATABASE,
    searchFood,
    calculateNutrition
};
