// 测试修复后的AI饮食顾问云函数
const https = require('https');
const apiKey = (process.env.SILICONFLOW_API_KEY || '').trim();

if (!apiKey) {
  console.error('SILICONFLOW_API_KEY is not configured');
  process.exit(1);
}

// 模拟API调用测试
function testApiCall() {
  console.log('测试修复后的API调用...');

  const postData = JSON.stringify({
    model: 'Qwen/Qwen3.5-35B-A3B',
    messages: [
      {
        role: 'system',
        content: '你是一个专业的营养师'
      },
      {
        role: 'user',
        content: '我今天吃了什么？'
      }
    ],
    temperature: 0.5,
    max_tokens: 200
  });

  const options = {
    hostname: 'api.siliconflow.cn',
    port: 443,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('API响应:', data);

      try {
        const parsed = JSON.parse(data);
        if (parsed.choices && parsed.choices[0]) {
          const message = parsed.choices[0].message;
          console.log('Content:', message.content);
          console.log('Reasoning Content:', message.reasoning_content);
          console.log('修复后的结果:', message.content || message.reasoning_content || '无响应');
        }
      } catch (e) {
        console.error('解析响应失败:', e);
      }
    });
  });

  req.on('error', (e) => console.error('API请求错误:', e));
  req.write(postData);
  req.end();
}

testApiCall();
