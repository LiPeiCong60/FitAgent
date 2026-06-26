const { searchFood, calculateNutrition, FOOD_DATABASE } = require('../../utils/food-data');

Page({
  data: {
    mealType: 'lunch',
    date: '',
    keyword: '',
    filteredFoods: FOOD_DATABASE,

    photoUrl: '',
    recognizing: false,
    recognizeResult: null,

    showModal: false,
    selectedFood: null,
    modalMode: 'preset',
    inputGrams: '',
    previewCalories: 0,
    previewProtein: 0,
    previewFat: 0,
    previewCarbs: 0,

    customFoodName: '',
    customCalories: '',
    customGrams: '',
    customCarbs: '',
    customProtein: '',
    customFat: ''
  },

  onLoad(options) {
    this.setData({
      mealType: options.meal || 'lunch',
      date: options.date || this._today()
    });
  },

  _today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  takePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success: async (res) => {
        const tempPath = res.tempFiles[0].tempFilePath;
        try {
          const uploadPath = await this._preparePhoto(tempPath);
          this.setData({ photoUrl: tempPath, recognizing: true, recognizeResult: null });
          await this._uploadAndRecognize(uploadPath, tempPath);
        } catch (err) {
          console.error('图片预处理失败:', err);
          wx.showToast({ title: '图片处理失败，请重试', icon: 'none' });
        }
      }
    });
  },

  async _preparePhoto(filePath) {
    try {
      const compressed = await wx.compressImage({
        src: filePath,
        quality: 70
      });
      return compressed.tempFilePath || filePath;
    } catch (err) {
      return filePath;
    }
  },

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  _buildCloudPath(filePath) {
    const extensionMatch = String(filePath || '').match(/\.(jpg|jpeg|png|webp)$/i);
    const extension = extensionMatch ? extensionMatch[0].toLowerCase() : '.jpg';
    return `food-photos/${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
  },

  async _uploadFileWithRetry(filePath, label) {
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await wx.cloud.uploadFile({
          cloudPath: this._buildCloudPath(filePath),
          filePath
        });
      } catch (err) {
        lastError = err;
        console.error(`${label}上传失败，第 ${attempt} 次:`, err);
        if (attempt < 2) {
          await this._sleep(600 * attempt);
        }
      }
    }
    throw lastError || new Error(`${label}上传失败`);
  },

  async _uploadAndRecognize(primaryPath, fallbackPath) {
    try {
      let uploadRes = null;
      let uploadError = null;

      try {
        uploadRes = await this._uploadFileWithRetry(primaryPath, '压缩图');
      } catch (err) {
        uploadError = err;
      }

      if (!uploadRes && fallbackPath && fallbackPath !== primaryPath) {
        try {
          uploadRes = await this._uploadFileWithRetry(fallbackPath, '原图');
        } catch (err) {
          uploadError = err;
        }
      }

      if (!uploadRes || !uploadRes.fileID) {
        throw uploadError || new Error('图片上传失败');
      }

      const aiRes = await wx.cloud.callFunction({
        name: 'aiSuggest',
        data: {
          action: 'recognizeFood',
          imageFileID: uploadRes.fileID
        }
      });

      if (aiRes.result && aiRes.result.food) {
        this.setData({
          recognizing: false,
          recognizeResult: this._normalizeRecognizeResult(aiRes.result.food)
        });
      } else {
        this.setData({ recognizing: false });
        const errorMsg = (aiRes.result && aiRes.result.error) || '未能识别，请手动搜索';
        console.error('识图返回失败:', errorMsg);
        wx.showToast({ title: errorMsg.slice(0, 30), icon: 'none' });
      }
    } catch (err) {
      console.error('拍照识别失败:', err);
      this.setData({ recognizing: false });
      wx.showToast({ title: '识别失败，请稍后重试', icon: 'none' });
    }
  },

  _normalizeRecognizeResult(food) {
    if (!food) return null;
    const grams = Math.max(1, Math.round(Number(food.grams) || 100));
    const caloriesPer100g = Number(food.calories_per_100g || food.calories) || 0;
    const calories = Math.round(Number(food.calories) || (caloriesPer100g * grams / 100));

    return {
      name: food.name || '未知食物',
      grams,
      calories_per_100g: caloriesPer100g,
      calories,
      protein: Number(food.protein) || 0,
      fat: Number(food.fat) || 0,
      carbs: Number(food.carbs) || 0
    };
  },

  retakePhoto() {
    this.setData({ photoUrl: '', recognizeResult: null });
    this.takePhoto();
  },

  useRecognizeResult() {
    const r = this.data.recognizeResult;
    if (!r) return;

    this.setData({
      modalMode: 'preset',
      selectedFood: {
        name: r.name,
        calories: r.calories_per_100g || r.calories,
        protein: r.protein || 0,
        fat: r.fat || 0,
        carbs: r.carbs || 0,
        unit: `约 ${r.grams || 100}g`
      },
      inputGrams: String(r.grams || 100),
      showModal: true
    });
    this._updatePreview();
  },

  onSearchInput(e) {
    const keyword = e.detail.value;
    this.setData({
      keyword,
      filteredFoods: searchFood(keyword)
    });
  },

  clearSearch() {
    this.setData({
      keyword: '',
      filteredFoods: FOOD_DATABASE
    });
  },

  selectFood(e) {
    const food = e.currentTarget.dataset.food;
    this.setData({
      selectedFood: food,
      modalMode: 'preset',
      inputGrams: '',
      showModal: true,
      previewCalories: 0,
      previewProtein: 0,
      previewFat: 0,
      previewCarbs: 0
    });
  },

  openCustomFoodModal() {
    this.setData({
      showModal: true,
      modalMode: 'custom',
      selectedFood: null,
      inputGrams: '',
      previewCalories: 0,
      previewProtein: 0,
      previewFat: 0,
      previewCarbs: 0,
      customFoodName: '',
      customCalories: '',
      customGrams: '',
      customCarbs: '',
      customProtein: '',
      customFat: ''
    });
  },

  onGramsInput(e) {
    this.setData({ inputGrams: e.detail.value });
    this._updatePreview();
  },

  setQuickGrams(e) {
    const grams = e.currentTarget.dataset.grams;
    this.setData({ inputGrams: String(grams) });
    this._updatePreview();
  },

  onCustomNameInput(e) {
    this.setData({ customFoodName: e.detail.value });
  },

  onCustomCaloriesInput(e) {
    this.setData({ customCalories: e.detail.value });
  },

  onCustomGramsInput(e) {
    this.setData({ customGrams: e.detail.value });
  },

  onCustomCarbsInput(e) {
    this.setData({ customCarbs: e.detail.value });
  },

  onCustomProteinInput(e) {
    this.setData({ customProtein: e.detail.value });
  },

  onCustomFatInput(e) {
    this.setData({ customFat: e.detail.value });
  },

  _updatePreview() {
    const { selectedFood, inputGrams } = this.data;
    if (!selectedFood || !inputGrams) return;

    const grams = parseFloat(inputGrams);
    if (!grams || grams <= 0) return;

    const n = calculateNutrition(selectedFood, grams);
    this.setData({
      previewCalories: n.calories,
      previewProtein: n.protein,
      previewFat: n.fat,
      previewCarbs: n.carbs
    });
  },

  closeModal() {
    this.setData({
      showModal: false,
      selectedFood: null,
      modalMode: 'preset',
      inputGrams: '',
      customFoodName: '',
      customCalories: '',
      customGrams: '',
      customCarbs: '',
      customProtein: '',
      customFat: ''
    });
  },

  preventClose() {},

  async confirmAdd() {
    if (this.data.modalMode === 'custom') {
      await this._confirmAddCustomFood();
      return;
    }

    const { selectedFood, inputGrams, mealType, date } = this.data;
    if (!selectedFood) return;

    const grams = parseFloat(inputGrams);
    if (!grams || grams <= 0) {
      wx.showToast({ title: '请输入克数', icon: 'none' });
      return;
    }

    const n = calculateNutrition(selectedFood, grams);

    try {
      const db = wx.cloud.database();
      await db.collection('diet_logs').add({
        data: {
          date,
          meal_type: mealType,
          food_name: n.name,
          grams: n.grams,
          calories: n.calories,
          protein: n.protein,
          fat: n.fat,
          carbs: n.carbs,
          createdAt: db.serverDate()
        }
      });

      wx.showToast({ title: '添加成功', icon: 'success' });
      this.setData({ showModal: false, selectedFood: null, inputGrams: '' });

      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    } catch (err) {
      console.error('添加食物失败:', err);
      wx.showToast({ title: '添加失败', icon: 'none' });
    }
  },

  async _confirmAddCustomFood() {
    const {
      mealType,
      date,
      customFoodName,
      customCalories,
      customGrams,
      customCarbs,
      customProtein,
      customFat
    } = this.data;

    const foodName = (customFoodName || '').trim();
    const calories = parseFloat(customCalories);
    const grams = parseFloat(customGrams);
    const carbs = parseFloat(customCarbs);
    const protein = parseFloat(customProtein);
    const fat = parseFloat(customFat);

    if (!foodName) {
      wx.showToast({ title: '请输入食物名称', icon: 'none' });
      return;
    }

    if (![calories, grams, carbs, protein, fat].every(value => Number.isFinite(value) && value >= 0)) {
      wx.showToast({ title: '请填写有效的营养数据', icon: 'none' });
      return;
    }

    if (grams <= 0) {
      wx.showToast({ title: '重量必须大于 0', icon: 'none' });
      return;
    }

    try {
      const db = wx.cloud.database();
      await db.collection('diet_logs').add({
        data: {
          date,
          meal_type: mealType,
          food_name: foodName,
          grams: Math.round(grams * 10) / 10,
          calories: Math.round(calories),
          protein: Math.round(protein * 10) / 10,
          fat: Math.round(fat * 10) / 10,
          carbs: Math.round(carbs * 10) / 10,
          source: 'custom',
          createdAt: db.serverDate()
        }
      });

      wx.showToast({ title: '添加成功', icon: 'success' });
      this.closeModal();

      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    } catch (err) {
      console.error('添加自定义食物失败:', err);
      wx.showToast({ title: '添加失败', icon: 'none' });
    }
  }
});
