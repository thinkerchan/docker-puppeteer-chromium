const puppeteer = require('puppeteer');
const EventEmitter = require('events');

class ScreenshotService extends EventEmitter {
  constructor(options = {}) {
    super();

    // 配置选项
    this.maxConcurrency = options.maxConcurrency || 2; // 最大并发数
    this.timeout = options.timeout || 60000; // 默认超时时间

    // 状态管理
    this.browser = null;
    this.browserInitPromise = null;
    this.activeJobs = 0; // 当前活跃的任务数
    this.queue = []; // 等待队列
    this.jobId = 0; // 任务ID计数器
    this.jobHistory = new Map(); // 任务历史记录
    this.maxHistorySize = options.maxHistorySize || 100; // 最多保存的历史记录数
  }

  // 初始化浏览器
  async initBrowser() {
    // 如果浏览器已经初始化完成，直接返回
    if (this.browser) {
      return this.browser;
    }

    // 如果正在初始化中，等待初始化完成
    if (this.browserInitPromise) {
      return await this.browserInitPromise;
    }

    // 开始初始化
    console.log('初始化浏览器实例...');
    this.browserInitPromise = puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-audio-output',
      ],
    }).then(browser => {
      this.browser = browser;
      console.log('浏览器实例已初始化');
      return browser;
    }).catch(error => {
      // 初始化失败时清理状态
      this.browserInitPromise = null;
      this.browser = null;
      throw error;
    });

    return await this.browserInitPromise;
  }

  // 关闭浏览器
  async closeBrowser() {
    if (this.browser) {
      console.log('关闭浏览器实例...');
      await this.browser.close();
      this.browser = null;
      this.browserInitPromise = null;
      console.log('浏览器实例已关闭');
    }
  }

  // 创建截图任务
  async createScreenshotJob(url, options = {}) {
    const jobId = ++this.jobId;
    const job = {
      id: jobId,
      url,
      options,
      status: 'pending',
      createdAt: Date.now(),
      promise: null,
      resolve: null,
      reject: null,
      result: null,
      error: null
    };

    // 保存到历史记录
    this.jobHistory.set(jobId, job);
    this.cleanupHistory();

    // 创建 Promise 用于返回给调用者
    job.promise = new Promise((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
    });

    // 如果当前活跃任务数小于最大并发数，立即执行
    if (this.activeJobs < this.maxConcurrency) {
      this.executeJob(job);
    } else {
      // 否则加入队列
      job.status = 'queued';
      this.queue.push(job);
      console.log(`任务 ${jobId} 已加入队列，当前队列长度: ${this.queue.length}`);

      // 触发队列事件
      this.emit('jobQueued', {
        jobId,
        queueLength: this.queue.length,
        activeJobs: this.activeJobs
      });
    }

    return {
      jobId,
      promise: job.promise,
      status: job.status
    };
  }

  // 执行截图任务
  async executeJob(job) {
    this.activeJobs++;
    job.status = 'processing';
    job.startTime = Date.now();

    console.log(`开始执行任务 ${job.id}，URL: ${job.url}`);
    this.emit('jobStarted', { jobId: job.id, url: job.url });

    let page;
    try {
      // 确保浏览器已初始化
      const browser = await this.initBrowser();

      // 创建新页面
      page = await browser.newPage();

      // 设置用户代理
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

      // 设置默认超时时间
      page.setDefaultTimeout(job.options.timeout || this.timeout);

      console.log(`正在访问: ${job.url}`);

      // 首次导航到页面
      await page.goto(job.url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // 获取页面内容的实际尺寸
      const dimensions = await page.evaluate(() => {
        return {
          width: document.documentElement.scrollWidth || document.body.scrollWidth,
          height: document.documentElement.scrollHeight || document.body.scrollHeight
        };
      });

      // 设置视口为页面实际尺寸
      await page.setViewport({
        width: dimensions.width,
        height: dimensions.height
      });

      // 等待页面完全加载
      await page.goto(job.url, {
        waitUntil: 'networkidle2',
        timeout: job.options.timeout || this.timeout
      });

      // 截图前等待一小段时间确保页面渲染完成
      await page.waitForTimeout(500);

      // 执行截图
      const screenshot = await page.screenshot({
        type: job.options.type || 'jpeg',
        quality: job.options.quality || 80,
        fullPage: job.options.fullPage !== false
      });

      const duration = Date.now() - job.startTime;
      console.log(`任务 ${job.id} 完成，耗时: ${duration}ms`);

      job.status = 'completed';
      job.result = {
        screenshot,
        duration,
        jobId: job.id,
        url: job.url
      };
      job.completedAt = Date.now();
      job.resolve(job.result);

      this.emit('jobCompleted', { jobId: job.id, duration });

    } catch (error) {
      console.error(`任务 ${job.id} 失败 [${job.url}]:`, error);
      job.status = 'failed';
      job.error = error.message;
      job.completedAt = Date.now();
      job.reject(error);

      this.emit('jobFailed', { jobId: job.id, error: error.message });
    } finally {
      // 关闭页面
      if (page) {
        try {
          if (!page.isClosed()) {
            await page.close();
            console.log(`页面已关闭: ${job.url}`);
          }
        } catch (err) {
          console.error(`关闭页面时出错 [${job.url}]:`, err);
        }
      }

      // 减少活跃任务数
      this.activeJobs--;

      // 处理队列中的下一个任务
      this.processQueue();
    }
  }

  // 处理队列
  processQueue() {
    if (this.queue.length > 0 && this.activeJobs < this.maxConcurrency) {
      const nextJob = this.queue.shift();
      console.log(`从队列中取出任务 ${nextJob.id}，剩余队列长度: ${this.queue.length}`);
      this.executeJob(nextJob);
    }
  }

  // 获取任务状态
  getJobStatus(jobId) {
    const job = this.jobHistory.get(jobId);
    if (!job) {
      return null;
    }

    // 构建返回的状态信息
    const statusInfo = {
      jobId: job.id,
      url: job.url,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: job.completedAt || null,
      duration: job.completedAt ? job.completedAt - job.createdAt : null,
      error: job.error || null,
      queuePosition: null
    };

    // 如果任务在队列中，计算队列位置
    if (job.status === 'queued') {
      const queueIndex = this.queue.findIndex(j => j.id === jobId);
      statusInfo.queuePosition = queueIndex >= 0 ? queueIndex + 1 : null;
    }

    return statusInfo;
  }

  // 获取所有任务历史
  getAllJobs() {
    const jobs = [];
    for (const [jobId, job] of this.jobHistory) {
      jobs.push(this.getJobStatus(jobId));
    }
    return jobs.sort((a, b) => b.createdAt - a.createdAt);
  }

  // 清理旧的历史记录
  cleanupHistory() {
    if (this.jobHistory.size > this.maxHistorySize) {
      // 获取所有任务并按创建时间排序
      const jobs = Array.from(this.jobHistory.entries())
        .sort((a, b) => a[1].createdAt - b[1].createdAt);

      // 删除最旧的记录
      const toDelete = jobs.slice(0, this.jobHistory.size - this.maxHistorySize);
      for (const [jobId] of toDelete) {
        this.jobHistory.delete(jobId);
      }
    }
  }

  // 获取当前状态
  getStatus() {
    return {
      browserActive: this.browser !== null,
      activeJobs: this.activeJobs,
      queueLength: this.queue.length,
      maxConcurrency: this.maxConcurrency,
      totalJobsProcessed: this.jobId,
      historySize: this.jobHistory.size
    };
  }

  // 优雅关闭
  async shutdown() {
    console.log('正在关闭截图服务...');

    // 等待所有活跃任务完成
    while (this.activeJobs > 0) {
      console.log(`等待 ${this.activeJobs} 个任务完成...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 拒绝队列中的所有任务
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      job.reject(new Error('服务正在关闭'));
    }

    // 关闭浏览器
    await this.closeBrowser();
    console.log('截图服务已关闭');
  }
}

// 创建单例实例
let serviceInstance = null;

function getScreenshotService(options) {
  if (!serviceInstance) {
    serviceInstance = new ScreenshotService(options);
  }
  return serviceInstance;
}

module.exports = {
  ScreenshotService,
  getScreenshotService
};
