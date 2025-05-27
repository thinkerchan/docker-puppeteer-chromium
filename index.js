// index.js
const express = require('express');
const { getScreenshotService } = require('./utils/shot');

const app = express();
const port = 4000;

app.use(express.json());

// 创建截图服务实例，最大并发数为2
const screenshotService = getScreenshotService({
  maxConcurrency: 2,
  timeout: 60000
});

// 监听截图服务事件
screenshotService.on('jobQueued', ({ jobId, queueLength, activeJobs }) => {
  console.log(`[队列通知] 任务 ${jobId} 已加入队列，当前活跃任务: ${activeJobs}，队列长度: ${queueLength}`);
});

screenshotService.on('jobStarted', ({ jobId, url }) => {
  console.log(`[任务开始] 任务 ${jobId} 开始处理: ${url}`);
});

screenshotService.on('jobCompleted', ({ jobId, duration }) => {
  console.log(`[任务完成] 任务 ${jobId} 完成，耗时: ${duration}ms`);
});

screenshotService.on('jobFailed', ({ jobId, error }) => {
  console.log(`[任务失败] 任务 ${jobId} 失败: ${error}`);
});

app.get('/', (req, res) => {
  res.send('Puppeteer 截图服务已启动');
});

// 健康检查端点
app.get('/health', async (req, res) => {
  const status = screenshotService.getStatus();
  res.json({
    status: 'ok',
    ...status
  });
});

// 截图端点
app.get('/screenshot', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: '需要提供URL参数' });
  }

  try {
    // 创建截图任务
    const { jobId, promise, status } = await screenshotService.createScreenshotJob(url, {
      type: 'jpeg',
      quality: 80,
      fullPage: true
    });

    // 如果任务被加入队列，立即返回提示信息
    if (status === 'queued') {
      res.status(202).json({
        message: '任务已加入队列，正在等待处理',
        jobId,
        status: 'queued',
        queueInfo: screenshotService.getStatus()
      });
      return;
    }

    // 等待截图完成
    const result = await promise;

    // 设置响应头并返回图片
    res.set('Content-Type', 'image/jpeg');
    res.set('X-Processing-Time', `${result.duration}ms`);
    res.set('X-Job-Id', `${result.jobId}`);
    res.send(result.screenshot);

  } catch (error) {
    console.error(`截图错误 [${url}]:`, error);
    res.status(500).json({
      error: '截图失败',
      message: error.message,
      url
    });
  }
});

// 获取队列状态端点
app.get('/queue/status', (req, res) => {
  const status = screenshotService.getStatus();
  res.json({
    ...status,
    timestamp: new Date().toISOString()
  });
});

// 异步截图端点 - 立即返回任务ID
app.post('/screenshot/async', async (req, res) => {
  const { url, options = {} } = req.body;

  if (!url) {
    return res.status(400).json({ error: '需要提供URL参数' });
  }

  try {
    // 创建截图任务
    const { jobId, status } = await screenshotService.createScreenshotJob(url, {
      type: options.type || 'jpeg',
      quality: options.quality || 80,
      fullPage: options.fullPage !== false,
      ...options
    });

    // 立即返回任务信息
    res.status(202).json({
      message: status === 'queued' ? '任务已加入队列' : '任务正在处理',
      jobId,
      status,
      url,
      queueInfo: screenshotService.getStatus()
    });

  } catch (error) {
    console.error(`创建截图任务失败 [${url}]:`, error);
    res.status(500).json({
      error: '创建截图任务失败',
      message: error.message,
      url
    });
  }
});

// 任务状态查询端点
app.get('/screenshot/job/:jobId', (req, res) => {
  const jobId = parseInt(req.params.jobId);

  const jobStatus = screenshotService.getJobStatus(jobId);

  if (!jobStatus) {
    return res.status(404).json({
      error: '任务不存在',
      jobId
    });
  }

  res.json(jobStatus);
});

// 获取所有任务历史
app.get('/screenshot/jobs', (req, res) => {
  const jobs = screenshotService.getAllJobs();
  res.json({
    jobs,
    total: jobs.length,
    currentStatus: screenshotService.getStatus()
  });
});

// 优雅关闭
async function gracefulShutdown() {
  console.log('正在关闭服务...');
  await screenshotService.shutdown();
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
  console.log(`截图服务配置: 最大并发数=${screenshotService.maxConcurrency}`);
});
