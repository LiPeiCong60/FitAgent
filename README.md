# FitAgent：AI 智能健身助手微信小程序

FitAgent 是一个面向普通健身用户的 AI 智能健身助手微信小程序。项目围绕“记录更轻、建议更准、长期可追踪”的目标，整合用户档案、身体数据、饮食记录、训练计划、训练打卡、AI 食物识别、RAG 健身问答和动作纠正 MVP，帮助用户把日常健身行为沉淀成可分析、可反馈的数据闭环。

## 项目背景

很多普通用户在减脂、增肌或保持健康时，会遇到几个典型问题：

- 饮食记录成本高，食物热量和三大营养素难估算。
- 训练计划不够个性化，练什么、练几天、如何进阶经常靠经验。
- 普通 AI 问答容易停留在通用建议，不能结合用户自己的饮食、训练和身体变化。
- 身体数据、饮食数据、训练数据分散记录，难以形成长期反馈。

FitAgent 的核心思路是：用小程序承载低门槛交互，用微信云开发完成数据存储和云函数编排，用大模型处理识别、总结、计划生成和问答，用 RAG 知识库提高健身问答的专业性和边界感。

## 核心功能

### 用户档案

- 录入性别、年龄、身高、体重、健身目标和运动频率。
- 根据用户信息计算 BMR、TDEE 和每日热量目标。
- 支持自定义碳水、蛋白质、脂肪比例。
- 档案数据写入 `users` 集合，并同步部分身体数据到 `body_stats`。

### 饮食记录

- 按早餐、午餐、晚餐、加餐等餐次记录食物。
- 支持本地食物库搜索、自定义食物、克数换算和营养预览。
- 支持拍照或相册上传食物图片，由 AI 识别食物并估算热量、蛋白质、脂肪和碳水。
- 记录写入 `diet_logs` 集合，用于每日统计和 AI 上下文。

### 训练计划与打卡

- 支持 AI 根据用户目标、训练频率和重点部位生成周训练计划。
- 训练计划可继续手动编辑、保存和导入今日训练。
- 打卡过程支持训练计时、组间休息、动作组数和完成状态记录。
- 训练计划写入 `training_plans`，训练记录写入 `workout_records`。

### 身体数据统计

- 记录体重、身高、体脂、瘦体重、腰围等指标。
- 同日记录自动覆盖，便于维护每日身体数据快照。
- 使用小程序 Canvas 绘制趋势图，展示身体变化。
- 数据写入 `body_stats`，并同步更新 `users` 中的最新身体字段。

### AI 综合助手

- 读取今日饮食、今日训练、最近训练记录和用户档案。
- 支持饮食分析、训练建议、健身问答和自然语言记录。
- 当用户明确说“帮我记一下饮食/训练”时，AI 会输出隐藏结构化标签，云函数解析后自动写库。
- 支持 RAG 增强：优先调用 FastAPI RAG 服务，失败时回退普通大模型问答。

### 动作纠正 MVP

- 项目包含动作分析服务和任务表设计，支持深蹲、俯卧撑、平板支撑等动作的异步分析扩展。
- 设计链路为：小程序上传视频 -> 创建动作分析任务 -> FastAPI 服务抽帧和姿态分析 -> 回调云函数 -> 写入 `motion_tasks`。
- 当前仓库中保留了动作分析服务、查询和回调云函数，适合作为后续迭代模块。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 小程序端 | 微信原生小程序、WXML、WXSS、JavaScript、Canvas |
| 云开发 | 微信云函数、云数据库、云存储 |
| AI 调用 | 硅基流动 OpenAI-compatible API、Kimi-K2.5、GLM-4.7 备用模型 |
| RAG 服务 | FastAPI、ChromaDB、BAAI/bge-m3 Embedding、httpx |
| 动作分析 | FastAPI、FFmpeg、MediaPipe Pose、规则引擎 |
| 数据与配置 | 云数据库集合、环境变量、`.env.example` |

## 目录结构

```text
FitAgent/
├── README.md
├── README_RAG.md
├── knowledge_base/                       # RAG 健身知识库 Markdown
└── jianshenzhushou/
    ├── miniprogram/                      # 微信小程序页面与工具函数
    │   ├── pages/index/                  # 首页与功能入口
    │   ├── pages/profile/                # 用户档案
    │   ├── pages/diet/                   # 饮食统计
    │   ├── pages/diet-add/               # 食物添加与图片识别
    │   ├── pages/workout/                # 训练计划与打卡
    │   ├── pages/ai-chat/                # AI 综合助手
    │   └── pages/body-stats/             # 身体数据趋势
    ├── cloudfunctions/                   # 微信云函数
    │   ├── aiSuggest/                    # 统一 AI 云函数
    │   ├── saveUserProfile/
    │   ├── saveBodyStats/
    │   ├── getBodyStats/
    │   ├── listMotionTasks/
    │   ├── getMotionTask/
    │   └── updateMotionTask/
    ├── rag-service/                      # FastAPI RAG 服务
    ├── motion-analysis-service/          # FastAPI 动作分析服务
    └── docs/
```

## 系统架构

```text
微信小程序
  -> 用户档案 / 饮食 / 训练 / 身体数据 / AI 对话
  -> 微信云数据库与云存储
  -> 微信云函数 aiSuggest
       -> 食物识别 / 饮食总结 / 训练计划 / 普通问答
       -> RAG 服务 /rag/chat
           -> Chroma 检索 knowledge_base
           -> 调用大模型生成回答
  -> 动作分析服务 /analyze-motion
       -> 视频抽帧 / 姿态识别 / 规则评分 / 回调写库
```

FitAgent 把业务数据留在微信云开发体系内，把相对独立、计算逻辑更重的 AI 能力拆到 FastAPI 服务中。这样既能保持小程序开发和部署简单，又能让 RAG、动作分析等模块独立扩展。

## AI 调用设计

统一 AI 云函数为 `cloudfunctions/aiSuggest`，根据 `action` 分发不同任务：

| action | 功能 |
| --- | --- |
| `recognizeFood` | 根据云存储图片识别食物和营养数据 |
| `suggestMeal` | 根据今日摄入和目标生成下一餐建议 |
| `summarizeDailyDiet` | 总结今日饮食并给出简短建议 |
| `chat` | 综合健身问答，优先 RAG，失败回退普通大模型 |
| `suggestWorkout` | 生成个性化周训练计划 |

### 食物图片识别

1. 小程序选择或拍摄图片。
2. 前端压缩图片后上传到微信云存储，得到 `fileID`。
3. 云函数通过 `cloud.getTempFileURL` 获取临时 URL，优先把图片 URL 发给视觉模型。
4. 如果临时 URL 失败，回退为下载图片并转成 base64 data URL。
5. 大模型按 JSON 格式返回食物名称、每 100g 热量、蛋白质、脂肪、碳水和估算重量。
6. 前端展示识别结果，用户确认后写入 `diet_logs`。

### 自然语言自动记录

AI 对话页会把今日饮食、今日训练、最近训练记录拼入系统提示词。用户说“我刚吃了鸡胸肉和米饭，帮我记一下”时，AI 会在回复末尾附加隐藏标签：

```text
$$RECORD[
{"name":"鸡胸肉","meal_type":"lunch","grams":150,"calories":248,"protein":46,"fat":5,"carbs":0,"time_text":"今天中午"}
]$$
```

云函数解析 `$$RECORD[...]$$` 后写入 `diet_logs`，再把隐藏标签从用户可见回复中删除。

训练记录同理，AI 会输出：

```text
$$WORKOUT[
{"title":"胸肩训练","duration_minutes":45,"time_text":"今天下午","exercises":[{"name":"卧推","sets":4,"reps":"8-10次"}]}
]$$
```

云函数解析后写入 `workout_records`。

### RAG 问答

`chat` 动作会优先调用 `rag-service`：

1. 云函数读取用户档案、近 14 天身体数据、近 14 天饮食记录和最近训练记录。
2. 发送 `user_context` 和当前问题到 `/rag/chat`。
3. RAG 服务用问题向量检索 `knowledge_base` 中的相关健身知识。
4. 将用户真实记录、检索片段和当前问题合并成提示词。
5. 调用大模型生成回答，并返回引用来源。
6. 如果 RAG 服务不可用，云函数自动回退普通大模型问答。

RAG 提示词要求模型优先参考用户真实记录，不进行疾病诊断，不给医疗处方，出现疼痛、胸闷、头晕等风险情况时提醒咨询专业人士。

## 数据库集合

| 集合 | 用途 |
| --- | --- |
| `users` | 用户档案、BMR、TDEE、每日热量目标、营养比例 |
| `body_stats` | 体重、身高、体脂、瘦体重、腰围历史 |
| `diet_logs` | 饮食记录、餐次、食物、克数、热量和三大营养素 |
| `training_plans` | 周训练计划、训练日和动作列表 |
| `workout_records` | 训练打卡记录、动作、组数、时长和休息时间 |
| `motion_tasks` | 动作纠正异步任务、状态、评分和分析结果 |

## 本地运行

### 1. 打开小程序

使用微信开发者工具打开：

```text
jianshenzhushou/
```

根目录中的 `project.config.json` 已做公开仓库处理，真实 AppID 和本地私有配置请放在 `project.private.config.json` 中，不要提交到仓库。

### 2. 配置云函数环境变量

`aiSuggest` 需要配置：

```bash
SILICONFLOW_API_KEY=your_api_key_here
RAG_ENABLED=true
RAG_SERVICE_URL=http://your-rag-service-host:8001
RAG_SERVICE_TOKEN=your_optional_shared_token
RAG_SERVICE_TIMEOUT_MS=12000
```

如果没有部署 RAG 服务，可设置：

```bash
RAG_ENABLED=false
```

此时 AI 对话会直接走普通大模型路径。

### 3. 启动 RAG 服务

```bash
cd jianshenzhushou/rag-service
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

编辑 `.env`：

```bash
SILICONFLOW_API_KEY=your_api_key_here
RAG_API_TOKEN=change_me_optional_shared_token
RAG_CHAT_MODEL=Pro/moonshotai/Kimi-K2.5
RAG_EMBEDDING_MODEL=BAAI/bge-m3
RAG_KNOWLEDGE_BASE_DIR=../../knowledge_base
RAG_CHROMA_DIR=.chroma
RAG_TOP_K=5
```

启动服务：

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

测试：

```bash
curl http://127.0.0.1:8001/healthz
curl -X POST http://127.0.0.1:8001/rag/reindex \
  -H "Authorization: Bearer $RAG_API_TOKEN"
```

### 4. 启动动作分析服务

```bash
cd jianshenzhushou/motion-analysis-service
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

可选环境变量：

```bash
MOTION_CALLBACK_URL=your_update_motion_task_endpoint
MOTION_CALLBACK_TOKEN=your_shared_secret
MOTION_ANALYSIS_FPS=6
```

## 隐私与安全

本仓库已按公开 GitHub 仓库处理：

- API Key 通过环境变量读取，不提交到代码。
- `.env`、`project.private.config.json`、依赖目录、虚拟环境、压缩包、缓存、日志和常见图片/视频文件已加入 `.gitignore`。
- 小程序真实 AppID 不应直接提交，公开配置中使用 `touristappid`。
- 用户上传图片和训练视频属于个人数据，生产环境应配置访问权限、生命周期和删除策略。

## 项目亮点

- 小程序、云函数、云数据库、RAG 服务和动作分析服务组成完整闭环。
- AI 能力不是简单聊天，而是能完成识图、总结、计划生成、问答和自动写库。
- RAG 问答结合用户真实记录与健身知识库，回答更贴合个人场景。
- 使用结构化隐藏标签让自然语言记录变成数据库记录，降低用户输入成本。
- 通过独立 FastAPI 服务承载 RAG 和动作分析，便于后续扩展和部署。

## 适用场景

- AI 应用开发项目展示。
- 微信小程序 + 云开发实践。
- RAG 知识库问答实践。
- 大模型结构化输出与业务落库实践。
- 健身、饮食、训练数据管理类产品原型。
