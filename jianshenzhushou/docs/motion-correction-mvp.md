# AI动作纠正 MVP 方案

## 1. 整体架构

采用“录制后分析 + 后台异步任务”的方案 1。

调用关系：

1. 小程序录制或选择 5-10 秒视频。
2. 小程序将视频上传到微信云存储，拿到 `videoFileId`。
3. 小程序调用云函数 `createMotionTask`。
4. `createMotionTask` 写入 `motion_tasks` 集合，状态置为 `queued`。
5. `createMotionTask` 立即调用独立 FastAPI 分析服务 `POST /analyze-motion`。
6. 分析服务异步执行：下载视频、FFmpeg 抽帧、MediaPipe Pose 提取关键点、规则引擎评分。
7. 分析服务完成后调用受保护的回调接口 `updateMotionTask`。
8. `updateMotionTask` 将状态更新为 `success` 或 `failed`，并回写结果 JSON。
9. 小程序通过 `listMotionTasks` 和 `getMotionTask` 查看历史与详情。

推荐写回方式：

- 推荐“分析服务回调云函数 `updateMotionTask`”，不推荐分析服务直接写数据库。
- 原因：鉴权更简单、数据库 schema 只在云函数维护、后续加审计和重试更容易、分析服务不需要持有云开发管理密钥。

## 2. 异步任务生命周期

- `queued`
  - 任务已创建，已入库，等待分析服务受理或开始执行。
- `processing`
  - 分析服务已开始处理视频。
- `success`
  - 结构化结果已生成并回写数据库。
- `failed`
  - 视频下载失败、抽帧失败、姿态点不足、规则分析异常或回调失败。

建议状态流转：

- `queued -> processing -> success`
- `queued -> failed`
- `processing -> failed`

## 3. 小程序侧设计

新增页面：

1. `pages/motion-task-create/motion-task-create`
   - 选择动作类型
   - 录制/选择视频
   - 上传视频并创建任务
2. `pages/motion-task-list/motion-task-list`
   - 展示当前用户动作纠正任务列表
3. `pages/motion-task-detail/motion-task-detail`
   - 展示任务详情、评分、问题、建议

页面跳转：

- 首页 `AI动作纠正` 入口 -> `motion-task-create`
- `motion-task-create` -> 上传成功后可跳到 `motion-task-list`
- `motion-task-list` -> 点击卡片进入 `motion-task-detail`

上传成功后的提示文案：

- 主文案：`已进入后台分析，可稍后在“动作纠正记录”中查看结果`
- 辅助文案：`当前页面可直接退出，无需等待分析完成`

历史记录页字段：

- 动作类型
- 状态
- 次数或时长
- 总评分
- 摘要 `summary`
- 创建时间

详情页字段：

- `taskId`
- 动作类型
- 状态
- 次数 `reps`
- 时长 `duration`
- 总评分 `score`
- 摘要 `summary`
- 问题列表 `issues`
- 每条问题的建议 `advice`
- 错误信息 `errorMessage`
- 创建/更新时间/完成时间
- `videoFileId`

## 4. 云函数设计

### `createMotionTask`

输入：

```json
{
  "exerciseType": "squat",
  "videoFileId": "cloud://xxx.mp4",
  "videoMeta": {
    "duration": 8,
    "sizeMB": 4.2,
    "fileName": "1711111111-squat.mp4"
  }
}
```

职责：

1. 校验动作类型只允许 `squat/pushup/plank`
2. 获取当前用户 `openid`
3. 创建 `motion_tasks` 文档，状态为 `queued`
4. 调用分析服务 `POST /analyze-motion`
5. 返回 `taskId`

当前仓库已落地：

- [createMotionTask](../cloudfunctions/createMotionTask/index.js)

返回示例：

```json
{
  "success": true,
  "taskId": "motion_1711111111111_abcd1234",
  "status": "queued",
  "analysisAccepted": true
}
```

### `getMotionTask`

职责：

- 按 `taskId` 查询任务详情
- 校验任务归属用户

当前仓库已落地：

- [getMotionTask](../cloudfunctions/getMotionTask/index.js)

### `listMotionTasks`

职责：

- 查询当前用户最近任务列表
- 按 `createdAt desc` 排序

当前仓库已落地：

- [listMotionTasks](../cloudfunctions/listMotionTasks/index.js)

### `updateMotionTask`

职责：

- 内部回调函数
- 仅允许分析服务使用共享 token 调用
- 写入 `processing/success/failed`
- 回写 `score/summary/result/errorMessage`

当前仓库已落地：

- [updateMotionTask](../cloudfunctions/updateMotionTask/index.js)

## 5. 数据库集合设计

集合名：`motion_tasks`

建议字段：

```json
{
  "_id": "motion_1711111111111_abcd1234",
  "taskId": "motion_1711111111111_abcd1234",
  "openid": "oXXXX",
  "exerciseType": "squat",
  "videoFileId": "cloud://env-id.xxx/motion-videos/squat/demo.mp4",
  "videoMeta": {
    "duration": 8,
    "sizeMB": 4.2,
    "fileName": "demo.mp4"
  },
  "status": "success",
  "score": 82,
  "summary": "动作整体完成较好，但仍有两个主要问题",
  "result": {},
  "reps": 8,
  "duration": 8.3,
  "errorMessage": "",
  "analysisAccepted": true,
  "analysisRequestId": "job_1234567890ab",
  "createdAt": "serverDate",
  "updatedAt": "serverDate",
  "finishedAt": "serverDate"
}
```

建议索引：

- `openid + createdAt desc`
- `status + updatedAt desc`

`success` 示例文档：

```json
{
  "_id": "motion_1711111111111_abcd1234",
  "taskId": "motion_1711111111111_abcd1234",
  "openid": "o_user_001",
  "exerciseType": "squat",
  "videoFileId": "cloud://demo-env.64656d6f/motion-videos/squat/demo.mp4",
  "videoMeta": {
    "duration": 8,
    "sizeMB": 4.2,
    "fileName": "1711111111-squat.mp4"
  },
  "status": "success",
  "score": 82,
  "summary": "动作整体完成较好，但仍有两个主要问题",
  "reps": 8,
  "duration": 8.3,
  "result": {
    "exerciseType": "squat",
    "reps": 8,
    "duration": 8.3,
    "score": 82,
    "summary": "动作整体完成较好，但仍有两个主要问题",
    "issues": [
      {
        "code": "insufficient_depth",
        "title": "下蹲深度不足",
        "severity": "high",
        "advice": "下放时继续坐髋，让大腿至少接近平行地面"
      },
      {
        "code": "forward_lean",
        "title": "躯干前倾过多",
        "severity": "medium",
        "advice": "收紧核心并保持胸口朝前，减少塌腰前扑"
      }
    ],
    "metrics": {
      "minKneeAngle": 109.4,
      "avgBottomTorsoLean": 34.1,
      "tempoSecondsPerRep": 1.52
    }
  },
  "errorMessage": "",
  "createdAt": "2026-03-11T09:20:00.000Z",
  "updatedAt": "2026-03-11T09:20:09.000Z",
  "finishedAt": "2026-03-11T09:20:09.000Z"
}
```

## 6. 分析服务设计

目录结构：

```text
motion-analysis-service/
  app/
    main.py
    clients/
      callback.py
    core/
      config.py
      pipeline.py
    schemas/
      motion.py
  requirements.txt
  README.md
```

当前仓库已落地：

- [main.py](../motion-analysis-service/app/main.py)
- [pipeline.py](../motion-analysis-service/app/core/pipeline.py)

接口：

### `POST /analyze-motion`

输入：

```json
{
  "taskId": "motion_1711111111111_abcd1234",
  "exerciseType": "squat",
  "videoFileId": "cloud://env.xxx/demo.mp4",
  "videoTempUrl": "https://tmp-url/demo.mp4",
  "videoMeta": {
    "duration": 8
  },
  "callbackUrl": "https://example.com/updateMotionTask",
  "callbackToken": "shared-secret"
}
```

返回：

```json
{
  "accepted": "true",
  "taskId": "motion_1711111111111_abcd1234",
  "jobId": "job_1234567890ab"
}
```

处理方式：

- HTTP 请求返回即表示任务已被服务接收
- 真正分析在后台线程中执行

回写方式：

- 推荐：分析服务回调 `updateMotionTask`
- 备选：分析服务直写数据库

推荐理由：

- 不暴露数据库写入凭证给分析服务
- 业务状态转换逻辑只保留一份
- 后续可加签名校验、重试和审计日志

## 7. 视频分析流程

完整链路：

1. 获取视频
   - 使用 `videoTempUrl` 下载视频到本地工作目录
2. FFmpeg 抽帧
   - 建议 `fps=6`
3. MediaPipe Pose 提取关键点
   - 每帧提取 33 个关键点
4. 关键点平滑
   - 第一版使用 EMA 平滑
5. 动作分段/计次
   - 基于关节角阈值切换状态机
6. 规则判断
   - 基于角度、躯干倾斜、身体连线偏差
7. 生成统一结果 JSON
8. 回写任务结果

异常兜底：

- 视频无法下载 -> `failed`
- 抽帧失败 -> `failed`
- 有效姿态帧太少 -> `failed`
- 规则计算异常 -> `failed`

## 8. 第一版动作规则

原则：

- 只做高价值、可解释、阈值可调的规则
- 不做复杂 3D 重建
- 默认优先单人侧面拍摄

### 深蹲 `squat`

计次：

- 用膝角 `>155` 视为站起
- 用膝角 `<95` 视为到底
- `up -> down -> up` 记 1 次

评分维度：

- 深度是否足够
- 底部躯干前倾是否过大
- 顶部是否完成锁定
- 节奏是否过快

第一版错误：

- `insufficient_depth`
- `forward_lean`
- `incomplete_lockout`
- `unstable_tempo`

### 俯卧撑 `pushup`

计次：

- 肘角 `>155` 视为顶部
- 肘角 `<95` 视为底部
- `up -> down -> up` 记 1 次

评分维度：

- 下放深度
- 身体是否保持一直线
- 顶部是否完全伸肘
- 节律是否清晰

第一版错误：

- `insufficient_depth`
- `body_line_break`
- `partial_lockout`
- `segment_unclear`

### 平板支撑 `plank`

时长：

- 每帧计算肩-髋-踝夹角偏差
- 偏差在阈值内的帧计为有效保持
- `valid_frames / fps` 得到有效时长

评分维度：

- 臀部是否过高
- 腰部是否下塌
- 整体身体直线是否稳定
- 有效保持时长

第一版错误：

- `hip_too_high`
- `hip_sagging`
- `body_line_break`
- `hold_too_short`

## 9. 统一结果 JSON

推荐结构：

```json
{
  "exerciseType": "squat",
  "reps": 8,
  "duration": 12.4,
  "score": 82,
  "summary": "动作整体完成较好，但仍有两个主要问题",
  "issues": [
    {
      "code": "knee_valgus",
      "title": "膝盖内扣",
      "severity": "high",
      "advice": "起身时主动让膝盖朝脚尖方向打开"
    }
  ],
  "metrics": {
    "minKneeAngle": 102.5,
    "avgBottomTorsoLean": 31.2
  },
  "debug": {
    "framesUsed": 48
  }
}
```

字段说明：

- `reps`
  - 深蹲、俯卧撑返回
- `duration`
  - 平板支撑优先返回有效时长，其他动作可返回视频有效分析时长
- `score`
  - 0-100
- `issues`
  - 第一版最多返回 3 条
- `metrics`
  - 规则调试和后续前端可视化基础

## 10. 文案策略

第一版直接模板生成：

- 状态文案
- `summary`
- 问题标题
- 改进建议
- 失败原因

后续可接 LLM 润色：

- `summary` 的自然语言优化
- 多条问题的综合讲解
- 个性化建议排序

但 LLM 只做：

- 解释
- 改写
- 润色

LLM 不做：

- 计次
- 姿态识别
- 核心评分
- 规则触发

## 11. 落地优先级

建议顺序：

1. 先打通最小链路
   - 小程序上传视频
   - `createMotionTask`
   - FastAPI `/analyze-motion`
   - `updateMotionTask`
   - 列表页查看结果
2. 再完善动作规则
   - 先深蹲
   - 再俯卧撑
   - 最后平板支撑
3. 再补详情页和文案

当前仓库建议先做的文件：

- [motion-task-create.js](../miniprogram/pages/motion-task-create/motion-task-create.js)
- [createMotionTask/index.js](../cloudfunctions/createMotionTask/index.js)
- [main.py](../motion-analysis-service/app/main.py)
- [pipeline.py](../motion-analysis-service/app/core/pipeline.py)
- [updateMotionTask/index.js](../cloudfunctions/updateMotionTask/index.js)

可以先留 stub 的功能：

- 评分明细拆分
- 动作分段可视化
- 关键帧截图
- 多机位支持
- LLM 润色
- 失败任务重试按钮

第一版不要做：

- 实时边录边纠正
- 多人同框识别
- 自由动作开放上传
- 复杂 3D 姿态估计
- 用户自定义规则编辑器
