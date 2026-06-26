Page({
  data: {},

  goBack() {
    wx.navigateBack({
      fail() {
        wx.switchTab && wx.switchTab({ url: '/pages/index/index' });
      }
    });
  }
});
