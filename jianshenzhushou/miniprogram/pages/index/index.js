// pages/index/index.js
const app = getApp();

Page({
  data: {
    hasProfile: false,
    userProfile: null
  },

  onShow() {
    this._loadUserProfile();
    this._loadOverviewData();
  },

  async _loadOverviewData() {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const now = new Date();

      // 当天摄入
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const dietRes = await db.collection('diet_logs').where({ date: todayStr }).get();
      let totalCalories = 0;
      if (dietRes.data && dietRes.data.length > 0) {
        dietRes.data.forEach(item => { totalCalories += (item.calories || 0); });
      }

      // 本周训练天数
      // 0是周日，所以周一=1, 周日=7
      let dayOfWeek = now.getDay();
      if (dayOfWeek === 0) dayOfWeek = 7;
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart.getTime() - (dayOfWeek - 1) * 24 * 60 * 60 * 1000);

      const workoutRes = await db.collection('workout_records')
        .where({ createdAt: _.gte(weekStart) })
        .count();

      this.setData({
        todayCalories: totalCalories,
        weekWorkoutCount: workoutRes.total || 0
      });
    } catch (err) {
      console.error('加载总览数据失败:', err);
    }
  },

  async _loadUserProfile() {
    try {
      const db = wx.cloud.database();
      const { data } = await db.collection('users').get();

      if (data && data.length > 0) {
        const profile = data[0];
        this.setData({
          hasProfile: true,
          userProfile: profile
        });
        app.globalData.userProfile = profile;
      } else {
        this.setData({ hasProfile: false, userProfile: null });
      }
    } catch (err) {
      console.error('加载用户数据失败:', err);
      this.setData({ hasProfile: false });
    }
  },

  goToProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' });
  },

  onFeatureTap(e) {
    const feature = e.currentTarget.dataset.feature;
    if (feature === 'diet') {
      wx.navigateTo({ url: '/pages/diet/diet' });
      return;
    }
    if (feature === 'workout') {
      wx.navigateTo({ url: '/pages/workout/workout' });
      return;
    }
    if (feature === 'ai') {
      wx.navigateTo({ url: '/pages/ai-chat/ai-chat' });
      return;
    }
    if (feature === 'stats') {
      wx.navigateTo({ url: '/pages/body-stats/body-stats' });
      return;
    }
    wx.showToast({
      title: '功能开发中，敬请期待',
      icon: 'none'
    });
  }
});
