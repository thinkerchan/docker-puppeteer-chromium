// test-concurrent.js
const axios = require('axios');

const API_BASE = 'http://localhost:4000';

// 测试 URL 列表
const urls = [
  'https://www.google.com',
  'https://www.github.com',
  'https://www.stackoverflow.com',
  'https://www.wikipedia.org',
  'https://www.reddit.com'
];

async function testConcurrentScreenshots() {
  console.log('开始并发截图测试...\n');

  // 1. 检查服务健康状态
  try {
    const health = await axios.get(`${API_BASE}/health`);
    console.log('服务状态:', health.data);
    console.log('---\n');
  } catch (error) {
    console.error('服务未启动，请先启动服务');
    return;
  }

  // 2. 同时发起多个截图请求
  console.log('发起 5 个并发截图请求...');
  const promises = urls.map(async (url, index) => {
    try {
      console.log(`[${index + 1}] 发起请求: ${url}`);
      const response = await axios.post(`${API_BASE}/screenshot/async`, {
        url,
        options: {
          quality: 90
        }
      });
      console.log(`[${index + 1}] 响应:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`[${index + 1}] 错误:`, error.response?.data || error.message);
      return null;
    }
  });

  const results = await Promise.all(promises);
  console.log('\n所有请求已发送\n---\n');

  // 3. 查看队列状态
  const queueStatus = await axios.get(`${API_BASE}/queue/status`);
  console.log('当前队列状态:', queueStatus.data);
  console.log('---\n');

  // 4. 定期检查任务状态
  console.log('开始监控任务状态...\n');

  const jobIds = results.filter(r => r && r.jobId).map(r => r.jobId);
  let completedCount = 0;

  while (completedCount < jobIds.length) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // 每2秒检查一次

    const statuses = await Promise.all(
      jobIds.map(async jobId => {
        try {
          const response = await axios.get(`${API_BASE}/screenshot/job/${jobId}`);
          return response.data;
        } catch (error) {
          return null;
        }
      })
    );

    // 统计完成情况
    const completed = statuses.filter(s => s && (s.status === 'completed' || s.status === 'failed'));
    completedCount = completed.length;

    // 显示进度
    console.log(`进度: ${completedCount}/${jobIds.length} 已完成`);

    // 显示每个任务的状态
    statuses.forEach(status => {
      if (status) {
        const queueInfo = status.queuePosition ? ` (队列位置: ${status.queuePosition})` : '';
        const duration = status.duration ? ` (耗时: ${status.duration}ms)` : '';
        console.log(`  任务 ${status.jobId}: ${status.status}${queueInfo}${duration}`);
      }
    });

    console.log('---\n');
  }

  console.log('所有任务已完成！\n');

  // 5. 查看最终的任务历史
  const jobsHistory = await axios.get(`${API_BASE}/screenshot/jobs`);
  console.log('任务历史摘要:');
  jobsHistory.data.jobs.slice(0, 5).forEach(job => {
    console.log(`  任务 ${job.jobId}: ${job.status} - ${job.url} (${job.duration}ms)`);
  });
}

// 运行测试
testConcurrentScreenshots().catch(console.error);