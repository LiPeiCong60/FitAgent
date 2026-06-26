import json
import os
import urllib.request

api_key = os.environ.get('SILICONFLOW_API_KEY', '').strip()
if not api_key:
    raise SystemExit('SILICONFLOW_API_KEY is not configured')

req = urllib.request.Request(
    'https://api.siliconflow.cn/v1/models',
    headers={'Authorization': f'Bearer {api_key}'}
)
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        with open('models.json', 'w', encoding='utf-8') as f:
            json.dump([m['id'] for m in data['data']], f, ensure_ascii=False, indent=2)
except Exception as e:
    print(e)
