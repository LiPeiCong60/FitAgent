// pages/workout-ai-chat/workout-ai-chat.js
Page({
  onLoad() {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    wx.redirectTo({
      url: `/pages/ai-chat/ai-chat?date=${y}-${m}-${d}`
    });
  }
});
