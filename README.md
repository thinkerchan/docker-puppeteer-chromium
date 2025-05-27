# Puppeteer 截图服务

这是一个基于 Puppeteer 的高性能截图服务，支持并发控制和队列管理。

## 特性

- ✅ 并发控制：最大并发数为 2，确保服务稳定性
- ✅ 队列管理：超出并发限制的请求会自动加入队列
- ✅ 任务追踪：可查询任务状态和历史记录
- ✅ 事件通知：支持任务生命周期事件监听
- ✅ 优雅关闭：确保所有任务完成后再关闭服务

## 安装

```bash
npm install
```

## 启动服务

```bash
node index.js
```

服务将在 http://localhost:4000 启动

## API 端点

### 1. 健康检查
```
GET /health
```

返回服务状态信息：
```json
{
  "status": "ok",
  "browserActive": true,
  "activeJobs": 1,
  "queueLength": 3,
  "maxConcurrency": 2,
  "totalJobsProcessed": 10,
  "historySize": 10
}
```

### 2. 同步截图（等待完成）
```
GET /screenshot?url=https://example.com
```

- 如果有空闲资源，立即执行并返回截图
- 如果正在排队，返回 202 状态码和队列信息

### 3. 异步截图（立即返回任务ID）
```
POST /screenshot/async
Content-Type: application/json

{
  "url": "https://example.com",
  "options": {
    "type": "jpeg",
    "quality": 90,
    "fullPage": true
  }
}
```

响应：
```json
{
  "message": "任务已加入队列",
  "jobId": 5,
  "status": "queued",
  "url": "https://example.com",
  "queueInfo": {
    "browserActive": true,
    "activeJobs": 2,
    "queueLength": 1,
    "maxConcurrency": 2
  }
}
```

### 4. 查询任务状态
```
GET /screenshot/job/:jobId
```

响应：
```json
{
  "jobId": 5,
  "url": "https://example.com",
  "status": "completed",
  "createdAt": 1699999999999,
  "completedAt": 1700000005555,
  "duration": 5556,
  "error": null,
  "queuePosition": null
}
```

状态值：
- `pending`: 准备执行
- `queued`: 在队列中等待
- `processing`: 正在处理
- `completed`: 已完成
- `failed`: 失败

### 5. 获取所有任务历史
```
GET /screenshot/jobs
```

### 6. 获取队列状态
```
GET /queue/status
```

## 测试并发功能

运行测试脚本：
```bash
node test-concurrent.js
```

该脚本会同时发起 5 个截图请求，演示并发控制和队列管理功能。

## 配置选项

在创建服务实例时可以配置：

```javascript
const screenshotService = getScreenshotService({
  maxConcurrency: 2,        // 最大并发数
  timeout: 60000,          // 默认超时时间（毫秒）
  maxHistorySize: 100      // 最多保存的历史记录数
});
```

## 事件监听

服务支持以下事件：

- `jobQueued`: 任务加入队列
- `jobStarted`: 任务开始执行
- `jobCompleted`: 任务完成
- `jobFailed`: 任务失败

示例：
```javascript
screenshotService.on('jobQueued', ({ jobId, queueLength, activeJobs }) => {
  console.log(`任务 ${jobId} 已加入队列`);
});
```

## 架构说明

- `index.js`: Express 服务器，提供 HTTP API
- `utils/shot.js`: 截图服务核心逻辑，包含：
  - `ScreenshotService`: 截图服务类，继承自 EventEmitter
  - 浏览器实例管理
  - 并发控制和队列管理
  - 任务状态追踪

## 优雅关闭

服务支持优雅关闭，使用 `Ctrl+C` 终止服务时：
1. 等待所有正在执行的任务完成
2. 拒绝队列中的待处理任务
3. 关闭浏览器实例
4. 退出进程