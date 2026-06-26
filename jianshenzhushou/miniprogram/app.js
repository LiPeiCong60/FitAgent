// app.js
App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }

    wx.cloud.init({
      // 请替换为你的云开发环境 ID
      env: 'cloud1-4gbaflgmce56c861',
      traceUser: true
    });
  },

  globalData: {
    userInfo: null,
    userProfile: null
  }
});
