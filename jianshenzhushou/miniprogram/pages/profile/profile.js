// pages/profile/profile.js
const { calculateAll } = require('../../utils/calculator');

Page({
    data: {
        gender: '',
        age: '',
        height: '',
        weight: '',
        goal: '',
        activityLevel: '',
        bmr: 0,
        tdee: 0,
        recommendedCalories: 0,
        dailyCalories: '',
        carbsRatio: '55',
        proteinRatio: '20',
        fatRatio: '25',
        calorieCustomized: false,
        showResult: false,
        saving: false
    },

    onShow() {
        this._loadExistingData();
    },

    async _loadExistingData() {
        try {
            const db = wx.cloud.database();
            const res = await db.collection('users').get();
            const data = res.data;

            if (data && data.length > 0) {
                const profile = data[0];
                this.setData({
                    gender: profile.gender || '',
                    age: profile.age ? String(profile.age) : '',
                    height: profile.height ? String(profile.height) : '',
                    weight: profile.weight ? String(profile.weight) : '',
                    goal: profile.goal || '',
                    activityLevel: profile.activityLevel || '',
                    dailyCalories: profile.daily_calories_target ? String(profile.daily_calories_target) : '',
                    carbsRatio: profile.carbs_ratio != null ? String(profile.carbs_ratio) : '55',
                    proteinRatio: profile.protein_ratio != null ? String(profile.protein_ratio) : '20',
                    fatRatio: profile.fat_ratio != null ? String(profile.fat_ratio) : '25',
                    calorieCustomized: !!profile.daily_calories_target
                });
                this._tryCalculate();
            }
        } catch (err) {
            console.error('加载已有数据失败:', err);
        }
    },

    onGenderSelect(e) {
        this.setData({ gender: e.currentTarget.dataset.gender });
        this._tryCalculate();
    },

    onAgeInput(e) {
        this.setData({ age: e.detail.value });
        this._tryCalculate();
    },

    onHeightInput(e) {
        this.setData({ height: e.detail.value });
        this._tryCalculate();
    },

    onWeightInput(e) {
        this.setData({ weight: e.detail.value });
        this._tryCalculate();
    },

    onGoalSelect(e) {
        this.setData({ goal: e.currentTarget.dataset.goal });
        this._tryCalculate();
    },

    onActivitySelect(e) {
        this.setData({ activityLevel: e.currentTarget.dataset.level });
        this._tryCalculate();
    },

    onDailyCaloriesInput(e) {
        this.setData({
            dailyCalories: e.detail.value,
            calorieCustomized: true
        });
    },

    onCarbsRatioInput(e) {
        this.setData({ carbsRatio: e.detail.value });
    },

    onProteinRatioInput(e) {
        this.setData({ proteinRatio: e.detail.value });
    },

    onFatRatioInput(e) {
        this.setData({ fatRatio: e.detail.value });
    },

    _tryCalculate() {
        const { gender, age, height, weight, goal, activityLevel, calorieCustomized, dailyCalories } = this.data;

        if (!gender || !age || !height || !weight || !goal || !activityLevel) {
            this.setData({ showResult: false });
            return;
        }

        const result = calculateAll({
            gender,
            weight: parseFloat(weight),
            height: parseFloat(height),
            age: parseInt(age, 10),
            activityLevel,
            goal
        });

        this.setData({
            bmr: result.bmr,
            tdee: result.tdee,
            recommendedCalories: result.dailyCalories,
            dailyCalories: calorieCustomized && dailyCalories ? dailyCalories : String(result.dailyCalories),
            showResult: true
        });
    },

    _validate() {
        const {
            gender,
            age,
            height,
            weight,
            goal,
            activityLevel,
            dailyCalories,
            carbsRatio,
            proteinRatio,
            fatRatio
        } = this.data;

        if (!gender) return '请选择性别';
        if (!age || age <= 0 || age > 120) return '请输入有效的年龄';
        if (!height || height < 50 || height > 300) return '请输入有效的身高 (50-300 cm)';
        if (!weight || weight < 20 || weight > 500) return '请输入有效的体重 (20-500 kg)';
        if (!goal) return '请选择健身目标';
        if (!activityLevel) return '请选择运动频率';

        const calories = parseInt(dailyCalories, 10);
        if (!calories || calories < 800 || calories > 10000) {
            return '请输入有效的热量目标 (800-10000 kcal)';
        }

        const carbs = parseFloat(carbsRatio);
        const protein = parseFloat(proteinRatio);
        const fat = parseFloat(fatRatio);

        if ([carbs, protein, fat].some(value => Number.isNaN(value) || value < 0 || value > 100)) {
            return '碳水、蛋白质、脂肪比例需在 0-100 之间';
        }

        const ratioTotal = Math.round((carbs + protein + fat) * 10) / 10;
        if (ratioTotal !== 100) {
            return '碳水、蛋白质、脂肪比例总和必须是 100%';
        }

        return null;
    },

    async onSave() {
        const error = this._validate();
        if (error) {
            wx.showToast({ title: error, icon: 'none' });
            return;
        }

        this.setData({ saving: true });

        const {
            gender,
            age,
            height,
            weight,
            goal,
            activityLevel,
            bmr,
            tdee,
            dailyCalories,
            carbsRatio,
            proteinRatio,
            fatRatio
        } = this.data;

        const payload = {
            gender,
            age: parseInt(age, 10),
            height: parseFloat(height),
            weight: parseFloat(weight),
            goal,
            activityLevel,
            bmr,
            tdee,
            daily_calories_target: parseInt(dailyCalories, 10),
            carbs_ratio: parseFloat(carbsRatio),
            protein_ratio: parseFloat(proteinRatio),
            fat_ratio: parseFloat(fatRatio)
        };

        try {
            const res = await wx.cloud.callFunction({
                name: 'saveUserProfile',
                data: payload
            });

            if (res.result && res.result.success) {
                getApp().globalData.userProfile = payload;
                wx.showToast({ title: '保存成功', icon: 'success' });
                setTimeout(() => {
                    wx.navigateBack();
                }, 1500);
            } else {
                throw new Error(res.result ? res.result.error : '未知错误');
            }
        } catch (err) {
            console.error('保存用户数据失败:', err);
            wx.showToast({ title: '保存失败，请重试', icon: 'none' });
        } finally {
            this.setData({ saving: false });
        }
    }
});
