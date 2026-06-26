const https = require('https');
const apiKey = (process.env.SILICONFLOW_API_KEY || '').trim();

if (!apiKey) {
    console.error('SILICONFLOW_API_KEY is not configured');
    process.exit(1);
}

const postData = JSON.stringify({
    model: 'deepseek-ai/DeepSeek-V3',
    messages: [{ role: 'user', content: '测试回复，只说OK' }],
    max_tokens: 50
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
    },
    timeout: 15000
};

console.log('Testing api.siliconflow.cn ...');
const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', data.substring(0, 500));
    });
});

req.on('timeout', () => { req.destroy(); console.log('TIMEOUT'); });
req.on('error', (err) => { console.log('ERROR:', err.message); });
req.write(postData);
req.end();
