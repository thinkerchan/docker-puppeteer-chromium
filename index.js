// index.js
const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const port = 4000;

app.use(express.json());

// 浏览器实例变量
let browser = null;
let browserInitPromise = null;

// 启动浏览器
async function initBrowser() {
  // 使用单例模式确保只有一个初始化过程
  if (!browserInitPromise) {
    console.log('初始化浏览器实例...');
    browserInitPromise = puppeteer.launch({
      // executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: true, // 使用无头模式提高性能
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage', // 避免内存共享问题
        '--disable-extensions', // 禁用扩展提高性能
        '--disable-audio-output', // 禁用音频
      ],
    });

    browser = await browserInitPromise;
    console.log('浏览器实例已初始化');
  }

  return browser;
}

// 关闭浏览器
async function closeBrowser() {
  if (browser) {
    console.log('关闭浏览器实例...');
    await browser.close();
    browser = null;
    browserInitPromise = null;
    console.log('浏览器实例已关闭');
  }
}

app.get('/', (req, res) => {
  res.send('Puppeteer 截图服务已启动');
});

// 健康检查端点
app.get('/health', async (req, res) => {
  res.json({ status: 'ok', browserActive: browser !== null });
});

// 截图端点
app.get('/screenshot', async (req, res) => {
  const { url } = req.query;
  const startTime = Date.now();

  if (!url) {
    return res.status(400).json({ error: '需要提供URL参数' });
  }

  let page;
  try {
    // 仅在请求时初始化浏览器
    await initBrowser();

    console.log(`puppeteer.executablePath()`, puppeteer.executablePath());
    page = await browser.newPage();

    // 设置用户代理
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

    // 设置默认超时时间
    page.setDefaultTimeout(60000);

    console.log(`正在访问: ${url}`);

    // 首次导航到页面，使用domcontentloaded以加快速度
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // 获取页面内容的实际尺寸
    const dimensions = await page.evaluate(() => {
      // 获取页面的真实尺寸，不设置最小值限制
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
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // 截图前等待一小段时间确保页面渲染完成
    await page.waitForTimeout(500);

    // 执行截图
    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 80,
      fullPage: true
    });

    const duration = Date.now() - startTime;
    console.log(`截图完成，耗时: ${duration}ms，URL: ${url}`);

    // 设置响应头并返回图片
    res.set('Content-Type', 'image/jpeg');
    res.set('X-Processing-Time', `${duration}ms`);
    res.send(screenshot);

  } catch (error) {
    console.error(`截图错误 [${url}]:`, error);
    res.status(500).json({
      error: '截图失败',
      message: error.message,
      url
    });
  } finally {
    // 截图完毕后关闭页面
    if (page) {
      try {
        if (!page.isClosed()) {
          await page.close();
          console.log(`页面已关闭: ${url}`);
        }
      } catch (err) {
        console.error(`关闭页面时出错 [${url}]:`, err);
      }
    }
  }
});

// 优雅关闭
async function gracefulShutdown() {
  console.log('正在关闭服务...');
  await closeBrowser();
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
});
