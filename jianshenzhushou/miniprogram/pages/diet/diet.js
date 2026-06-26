// pages/diet/diet.js

function roundMacroTarget(value) {
    return Math.round(value * 10) / 10;
}

Page({
    data: {
        currentDate: '',
        displayDate: '',
        targetCalories: 2000,
        carbsRatio: 55,
        proteinRatio: 20,
        fatRatio: 25,
        carbsTarget: 275,
        proteinTarget: 100,
        fatTarget: 55.6,
        totalCalories: 0,
        totalProtein: 0,
        totalFat: 0,
        totalCarbs: 0,
        remaining: 2000,
        proteinPercent: 0,
        fatPercent: 0,
        carbsPercent: 0,
        meals: [
            { type: 'breakfast', name: '早餐', icon: '🍞', foods: [], totalCalories: 0 },
            { type: 'snack_am', name: '上午加餐', icon: '🍌', foods: [], totalCalories: 0 },
            { type: 'lunch', name: '午餐', icon: '☀️', foods: [], totalCalories: 0 },
            { type: 'snack_pm', name: '下午加餐', icon: '🥜', foods: [], totalCalories: 0 },
            { type: 'dinner', name: '晚餐', icon: '🍽', foods: [], totalCalories: 0 },
            { type: 'snack_ev', name: '夜宵/加餐', icon: '🥛', foods: [], totalCalories: 0 }
        ]
    },

    async onShow() {
        this._initDate();
        await this._loadTarget();
        this._loadDietLogs();
    },

    _initDate() {
        if (!this.data.currentDate) {
            const today = this._formatDate(new Date());
            this.setData({ currentDate: today });
        }
        this._updateDisplayDate();
    },

    _formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    _updateDisplayDate() {
        const today = this._formatDate(new Date());
        const currentDate = this.data.currentDate;
        if (currentDate === today) {
            this.setData({ displayDate: '今天' });
            return;
        }

        const [year, month, day] = currentDate.split('-');
        this.setData({ displayDate: `${year}年${month}月${day}日` });
    },

    prevDay() {
        const date = new Date(this.data.currentDate);
        date.setDate(date.getDate() - 1);
        this.setData({ currentDate: this._formatDate(date) });
        this._updateDisplayDate();
        this._loadDietLogs();
    },

    nextDay() {
        const today = this._formatDate(new Date());
        const date = new Date(this.data.currentDate);
        date.setDate(date.getDate() + 1);
        const next = this._formatDate(date);
        if (next > today) return;

        this.setData({ currentDate: next });
        this._updateDisplayDate();
        this._loadDietLogs();
    },

    async _loadTarget() {
        try {
            const db = wx.cloud.database();
            const { data } = await db.collection('users').get();
            if (data && data.length > 0) {
                const profile = data[0];
                const targetCalories = profile.daily_calories_target || 2000;
                const carbsRatio = profile.carbs_ratio != null ? profile.carbs_ratio : 55;
                const proteinRatio = profile.protein_ratio != null ? profile.protein_ratio : 20;
                const fatRatio = profile.fat_ratio != null ? profile.fat_ratio : 25;

                this.setData({
                    targetCalories,
                    carbsRatio,
                    proteinRatio,
                    fatRatio
                });
            }
        } catch (err) {
            console.error('加载目标热量失败:', err);
        }
    },

    _calculateMacroTargets(targetCalories, carbsRatio, proteinRatio, fatRatio) {
        return {
            proteinTarget: roundMacroTarget(targetCalories * (proteinRatio / 100) / 4),
            fatTarget: roundMacroTarget(targetCalories * (fatRatio / 100) / 9),
            carbsTarget: roundMacroTarget(targetCalories * (carbsRatio / 100) / 4)
        };
    },

    _getProgress(current, target) {
        if (!target) return 0;
        return Math.min(100, Math.round(current / target * 100));
    },

    async _loadDietLogs() {
        try {
            const db = wx.cloud.database();
            const { data } = await db.collection('diet_logs').where({
                date: this.data.currentDate
            }).get();

            const mealsMap = {
                breakfast: [],
                snack_am: [],
                lunch: [],
                snack_pm: [],
                dinner: [],
                snack_ev: []
            };

            data.forEach(item => {
                const rawType = item.meal_type || 'snack_pm';
                const type = rawType === 'snack' ? 'snack_pm' : rawType;
                if (mealsMap[type]) {
                    mealsMap[type].push(item);
                } else {
                    mealsMap.snack_pm.push(item);
                }
            });

            let totalCalories = 0;
            let totalProtein = 0;
            let totalFat = 0;
            let totalCarbs = 0;
            data.forEach(item => {
                totalCalories += item.calories || 0;
                totalProtein += item.protein || 0;
                totalFat += item.fat || 0;
                totalCarbs += item.carbs || 0;
            });

            const { targetCalories, carbsRatio, proteinRatio, fatRatio } = this.data;
            const { carbsTarget, proteinTarget, fatTarget } = this._calculateMacroTargets(
                targetCalories,
                carbsRatio,
                proteinRatio,
                fatRatio
            );

            const meals = this.data.meals.map(meal => ({
                ...meal,
                foods: mealsMap[meal.type],
                totalCalories: mealsMap[meal.type].reduce((sum, food) => sum + (food.calories || 0), 0)
            }));

            this.setData({
                meals,
                carbsTarget,
                proteinTarget,
                fatTarget,
                totalCalories: Math.round(totalCalories),
                totalProtein: Math.round(totalProtein * 10) / 10,
                totalFat: Math.round(totalFat * 10) / 10,
                totalCarbs: Math.round(totalCarbs * 10) / 10,
                remaining: Math.round(targetCalories - totalCalories),
                proteinPercent: this._getProgress(totalProtein, proteinTarget),
                fatPercent: this._getProgress(totalFat, fatTarget),
                carbsPercent: this._getProgress(totalCarbs, carbsTarget)
            });
        } catch (err) {
            console.error('加载饮食记录失败:', err);
        }
    },

    addFood(e) {
        const mealType = e.currentTarget.dataset.meal;
        wx.navigateTo({
            url: `/pages/diet-add/diet-add?meal=${mealType}&date=${this.data.currentDate}`
        });
    },

    async deleteFood(e) {
        const id = e.currentTarget.dataset.id;
        try {
            const db = wx.cloud.database();
            await db.collection('diet_logs').doc(id).remove();
            wx.showToast({ title: '已删除', icon: 'success' });
            this._loadDietLogs();
        } catch (err) {
            console.error('删除失败:', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
        }
    },

    openAiChat() {
        const { targetCalories, totalCalories, totalProtein, totalFat, totalCarbs, currentDate } = this.data;
        wx.navigateTo({
            url: `/pages/ai-chat/ai-chat?target=${targetCalories}&eaten=${totalCalories}&protein=${totalProtein}&fat=${totalFat}&carbs=${totalCarbs}&date=${currentDate}`
        });
    },

    async summarizeDiet() {
        const { targetCalories, totalCalories, totalProtein, totalFat, totalCarbs, meals } = this.data;
        if (totalCalories === 0) {
            wx.showToast({ title: '今天还没有记录饮食哦', icon: 'none' });
            return;
        }

        this.setData({ summaryLoading: true, dailySummary: '' });

        let mealsSummary = '';
        meals.forEach(m => {
            if (m.foods && m.foods.length > 0) {
                mealsSummary += `${m.name}: ${m.foods.map(f => f.food_name).join('、')}\n`;
            }
        });

        try {
            const res = await wx.cloud.callFunction({
                name: 'aiSuggest',
                data: {
                    action: 'summarizeDailyDiet',
                    targetCalories,
                    eatenCalories: totalCalories,
                    eatenProtein: totalProtein,
                    eatenFat: totalFat,
                    eatenCarbs: totalCarbs,
                    mealsSummary
                }
            });
            if (res.result && res.result.summary) {
                this.setData({ dailySummary: res.result.summary });
            } else {
                wx.showToast({ title: '总结失败', icon: 'none' });
            }
        } catch (err) {
            console.error('获取饮食总结失败:', err);
            wx.showToast({ title: '网络错误', icon: 'none' });
        } finally {
            this.setData({ summaryLoading: false });
        }
    }
});
