const express = require('express');
const puppeteer = require('puppeteer-core');
const app = express();
const port = 3000;

app.use(express.json());

let browser;

async function initBrowser() {
  browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ],
    headless: 'new'
  });
}

// 初始化浏览器
initBrowser().catch(console.error);

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 截图端点
app.post('/screenshot', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 80,
      fullPage: true
    });

    await page.close();

    res.set('Content-Type', 'image/jpeg');
    res.send(screenshot);

  } catch (error) {
    console.error('Screenshot error:', error);
    res.status(500).json({ error: 'Failed to take screenshot' });
  }
});

// 优雅关闭
process.on('SIGTERM', async () => {
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
