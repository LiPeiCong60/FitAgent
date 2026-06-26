// 测试AI饮食顾问云函数
const cloud = require('wx-server-sdk');

// 初始化云开发环境
cloud.init({ env: 'cloud1-4gbaflgmce56c861' });

// 模拟云函数调用
async function testAiSuggest() {
  console.log('测试AI饮食顾问云函数...');

  try {
    // 测试chat功能
    const chatResult = await cloud.callFunction({
      name: 'aiSuggest',
      data: {
        action: 'chat',
        messages: [
          {
            role: 'system',
            content: '你是一个专业的营养师'
          },
          {
            role: 'user',
            content: '我今天吃了什么？'
          }
        ]
      }
    });

    console.log('Chat测试结果:', chatResult);

    // 测试suggestMeal功能
    const suggestResult = await cloud.callFunction({
      name: 'aiSuggest',
      data: {
        action: 'suggestMeal',
        targetCalories: 2000,
        eatenCalories: 1000,
        eatenProtein: 50,
        eatenFat: 30,
        eatenCarbs: 150,
        meals: []
      }
    });

    console.log('SuggestMeal测试结果:', suggestResult);

  } catch (error) {
    console.error('测试失败:', error);
  }
}

testAiSuggest();