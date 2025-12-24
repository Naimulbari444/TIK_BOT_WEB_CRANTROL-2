const express = require('express');
const crypto = require('crypto');
const https = require('https');
const cluster = require('cluster');
const os = require('os');
const { EventEmitter } = require('events');
const http2 = require('http2');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 🚀 ADVANCED CONFIGURATION
const CONFIG = {
  MAX_CONCURRENT_REQUESTS: 500,          // একসাথে কত রিকোয়েস্ট
  REQUEST_TIMEOUT: 2000,                 // 2 সেকেন্ড টাইমআউট
  BATCH_SIZE: 100,                       // প্রতি ব্যাচে কত রিকোয়েস্ট
  RETRY_ATTEMPTS: 2,                     // ফেইল হলে রিট্রাই কতবার
  PROXY_ROTATION: true,                  // প্রোক্সি রোটেশন
  USE_HTTP2: true,                       // HTTP/2 ব্যবহার করবে
  STATS_INTERVAL: 1000,                  // স্ট্যাটস আপডেট ইন্টারভাল
  MAX_RPS_TARGET: 1000,                  // টার্গেট RPS
  CONNECTION_POOL_SIZE: 50,              // কানেকশন পুল সাইজ
  REQUEST_DELAY_MIN: 1,                  // মিনিমাল ডেলে (ms)
  REQUEST_DELAY_MAX: 10                  // ম্যাক্সিমাম ডেলে (ms)
};

// 🚀 GLOBAL VARIABLES WITH SHARED MEMORY
const botStatus = {
  running: false,
  success: 0,
  fails: 0,
  totalRequests: 0,
  targetViews: 0,
  aweme_id: '',
  startTime: null,
  rps: 0,
  rpm: 0,
  rph: 0,
  successRate: '0%',
  activeWorkers: 0,
  ipRotations: 0,
  estimatedCompletion: null,
  currentBatch: 0
};

// 🚀 PROXY MANAGEMENT SYSTEM
class ProxyManager {
  constructor() {
    this.proxies = [];
    this.currentIndex = 0;
    this.loadProxies();
  }

  loadProxies() {
    // Load proxies from file or API
    try {
      const proxyFile = fs.readFileSync('./proxies.txt', 'utf8');
      this.proxies = proxyFile
        .split('\n')
        .filter(p => p.trim())
        .map(p => ({
          host: p.split(':')[0],
          port: parseInt(p.split(':')[1]),
          protocol: 'http'
        }));
      
      console.log(`✅ Loaded ${this.proxies.length} proxies`);
    } catch (e) {
      // Fallback to direct connection
      this.proxies = [null];
      console.log('⚠️ No proxies found, using direct connection');
    }
  }

  getNextProxy() {
    if (!CONFIG.PROXY_ROTATION || this.proxies.length === 0) {
      return null;
    }
    
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    botStatus.ipRotations++;
    return this.proxies[this.currentIndex];
  }
}

// 🚀 DEVICE POOL FOR REUSE
class DevicePool {
  constructor(size = 1000) {
    this.pool = [];
    this.generatePool(size);
  }

  generatePool(size) {
    for (let i = 0; i < size; i++) {
      this.pool.push(this.generateDevice());
    }
  }

  generateDevice() {
    const device_id = Array.from({length: 19}, () => 
      '0123456789'[Math.floor(Math.random() * 10)]
    ).join('');
    
    const iid = Array.from({length: 19}, () => 
      '0123456789'[Math.floor(Math.random() * 10)]
    ).join('');
    
    return {
      device_id,
      iid,
      cdid: crypto.randomUUID(),
      openudid: Array.from({length: 16}, () => 
        '0123456789abcdef'[Math.floor(Math.random() * 16)]
      ).join(''),
      sessionid: this.randomSessionId(),
      install_time: Date.now() - Math.floor(Math.random() * 1000000000),
      device_fingerprint: this.generateFingerprint()
    };
  }

  randomSessionId() {
    return Array.from({length: 32}, () => 
      '0123456789abcdef'[Math.floor(Math.random() * 16)]
    ).join('');
  }

  generateFingerprint() {
    return Array.from({length: 40}, () => 
      '0123456789abcdef'[Math.floor(Math.random() * 16)]
    ).join('');
  }

  getDevice() {
    if (this.pool.length === 0) {
      this.generatePool(100);
    }
    return this.pool.pop() || this.generateDevice();
  }

  returnDevice(device) {
    this.pool.push(device);
  }
}

// 🚀 CONNECTION MANAGER
class ConnectionManager {
  constructor() {
    this.connections = new Map();
    this.agent = new https.Agent({
      keepAlive: true,
      maxSockets: CONFIG.CONNECTION_POOL_SIZE,
      maxFreeSockets: 20,
      timeout: CONFIG.REQUEST_TIMEOUT
    });
  }

  getConnection(key) {
    if (!this.connections.has(key)) {
      this.connections.set(key, {
        agent: this.agent,
        lastUsed: Date.now(),
        requestCount: 0
      });
    }
    return this.connections.get(key);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, conn] of this.connections.entries()) {
      if (now - conn.lastUsed > 30000) { // 30 seconds
        this.connections.delete(key);
      }
    }
  }
}

// 🚀 REQUEST ENGINE - EVENT DRIVEN
class RequestEngine extends EventEmitter {
  constructor() {
    super();
    this.proxyManager = new ProxyManager();
    this.devicePool = new DevicePool();
    this.connectionManager = new ConnectionManager();
    this.requestQueue = [];
    this.activeRequests = 0;
    this.paused = false;
    
    this.setMaxListeners(1000);
  }

  async sendRequest(aweme_id) {
    if (this.paused || this.activeRequests >= CONFIG.MAX_CONCURRENT_REQUESTS) {
      return new Promise(resolve => {
        this.requestQueue.push({ aweme_id, resolve });
      });
    }

    this.activeRequests++;
    
    const device = this.devicePool.getDevice();
    const proxy = this.proxyManager.getNextProxy();
    
    try {
      const success = await this.executeRequest(aweme_id, device, proxy);
      
      if (success) {
        botStatus.success++;
        this.emit('success');
      } else {
        botStatus.fails++;
        this.emit('failure');
      }
    } catch (error) {
      botStatus.fails++;
      this.emit('error', error);
    } finally {
      this.devicePool.returnDevice(device);
      this.activeRequests--;
      this.processQueue();
    }
    
    botStatus.totalRequests++;
  }

  async executeRequest(aweme_id, device, proxy) {
    const params = `device_id=${device.device_id}&iid=${device.iid}&device_type=SM-G973N&app_name=musically_go&host_abi=armeabi-v7a&channel=googleplay&device_platform=android&version_code=300904&device_brand=samsung&os_version=12&aid=1340`;
    const payload = `item_id=${aweme_id}&play_delta=1&${this.generateExtraParams()}`;
    
    const headers = this.generateHeaders(device);
    
    const options = {
      hostname: 'api16-normal-c-useast1a.tiktokv.com',
      port: 443,
      path: `/aweme/v1/aweme/stats/?${params}`,
      method: 'POST',
      agent: this.connectionManager.agent,
      timeout: CONFIG.REQUEST_TIMEOUT,
      headers: headers
    };

    // Add proxy if available
    if (proxy) {
      options.hostname = proxy.host;
      options.port = proxy.port;
      options.path = `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/aweme/stats/?${params}`;
      options.headers = {
        ...headers,
        'Host': 'api16-normal-c-useast1a.tiktokv.com'
      };
    }

    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            resolve(jsonData && jsonData.log_pb && jsonData.log_pb.impr_id);
          } catch {
            resolve(false);
          }
        });
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.write(payload);
      req.end();
    });
  }

  generateHeaders(device) {
    const unix = Math.floor(Date.now() / 1000);
    
    return {
      'cookie': `sessionid=${device.sessionid}; install_id=${device.iid};`,
      'x-gorgon': '0404b0d30000' + Array.from({length: 24}, () => 
        '0123456789abcdef'[Math.floor(Math.random() * 16)]
      ).join(''),
      'x-khronos': unix.toString(),
      'user-agent': 'okhttp/3.12.1',
      'x-tt-trace-id': this.generateTraceId(),
      'x-ss-req-ticket': Date.now().toString(),
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'accept-encoding': 'gzip',
      'connection': 'Keep-Alive'
    };
  }

  generateExtraParams() {
    const params = [
      `random_seed=${Date.now()}`,
      `device_fingerprint=${crypto.randomBytes(20).toString('hex')}`,
      `ts=${Math.floor(Date.now() / 1000)}`,
      `_rticket=${Date.now()}`,
      `is_play_url=1`,
      `video_id=${Math.floor(Math.random() * 1000000000)}`,
      `play_time=${Math.floor(Math.random() * 10) + 1}`
    ];
    return params.join('&');
  }

  generateTraceId() {
    return Array.from({length: 32}, () => 
      '0123456789abcdef'[Math.floor(Math.random() * 16)]
    ).join('');
  }

  processQueue() {
    while (this.requestQueue.length > 0 && 
           this.activeRequests < CONFIG.MAX_CONCURRENT_REQUESTS &&
           !this.paused) {
      const { aweme_id, resolve } = this.requestQueue.shift();
      this.sendRequest(aweme_id).then(resolve);
    }
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.processQueue();
  }
}

// 🚀 MAIN CONTROLLER
let requestEngine = null;

// Routes
app.get('/', (req, res) => {
  res.json({ 
    status: '🚀 TIKTOK ULTRA TURBO BOT - MULTI-CORE',
    message: 'Optimized for 1000+ RPS',
    config: CONFIG,
    endpoints: [
      'GET /status',
      'POST /start',
      'POST /stop',
      'POST /pause',
      'POST /resume',
      'GET /config'
    ]
  });
});

app.get('/status', (req, res) => {
  const total = botStatus.totalRequests;
  const success = botStatus.success;
  botStatus.successRate = total > 0 ? 
    ((success / total) * 100).toFixed(1) + '%' : '0%';
  
  // Calculate estimated completion
  if (botStatus.rps > 0 && botStatus.targetViews > 0) {
    const remaining = botStatus.targetViews - botStatus.success;
    const minutes = remaining / (botStatus.rps * 60);
    botStatus.estimatedCompletion = new Date(Date.now() + minutes * 60000);
  }
  
  res.json(botStatus);
});

app.post('/start', async (req, res) => {
  const { targetViews, videoLink, customConfig } = req.body;
  
  if (!videoLink) {
    return res.json({ success: false, message: 'Video link required' });
  }

  const idMatch = videoLink.match(/\d{18,19}/g);
  if (!idMatch) {
    return res.json({ success: false, message: 'Invalid TikTok video link' });
  }

  // Update config if provided
  if (customConfig) {
    Object.assign(CONFIG, customConfig);
  }

  // Reset stats
  Object.assign(botStatus, {
    running: true,
    success: 0,
    fails: 0,
    totalRequests: 0,
    targetViews: parseInt(targetViews) || 10000,
    aweme_id: idMatch[0],
    startTime: new Date(),
    rps: 0,
    rpm: 0,
    rph: 0,
    successRate: '0%',
    activeWorkers: os.cpus().length,
    ipRotations: 0,
    estimatedCompletion: null,
    currentBatch: 0
  });

  console.log('🚀 ULTRA TURBO BOT STARTING...');
  console.log(`🎯 Target: ${botStatus.targetViews} views`);
  console.log(`⚡ Config: ${CONFIG.MAX_CONCURRENT_REQUESTS} concurrent requests`);
  console.log(`💻 Cores: ${botStatus.activeWorkers}`);

  // Initialize request engine
  requestEngine = new RequestEngine();
  
  // Start the bot
  startTurboBot();
  
  res.json({ 
    success: true, 
    message: '🚀 ULTRA TURBO BOT STARTED!',
    target: botStatus.targetViews,
    videoId: botStatus.aweme_id,
    config: CONFIG
  });
});

app.post('/stop', (req, res) => {
  botStatus.running = false;
  if (requestEngine) {
    requestEngine.pause();
  }
  res.json({ success: true, message: 'Bot stopped' });
});

app.post('/pause', (req, res) => {
  if (requestEngine) {
    requestEngine.pause();
    botStatus.running = false;
  }
  res.json({ success: true, message: 'Bot paused' });
});

app.post('/resume', (req, res) => {
  if (requestEngine) {
    requestEngine.resume();
    botStatus.running = true;
  }
  res.json({ success: true, message: 'Bot resumed' });
});

app.get('/config', (req, res) => {
  res.json(CONFIG);
});

// 🚀 TURBO BOT STARTER
async function startTurboBot() {
  console.log('🔥 Starting turbo mode...');
  
  let lastReqs = 0;
  let lastSuccess = 0;
  
  const statsInterval = setInterval(() => {
    const now = Date.now();
    const elapsedSeconds = (now - botStatus.startTime) / 1000;
    
    // Calculate rates
    botStatus.rps = ((botStatus.totalRequests - lastReqs) / 1).toFixed(1);
    botStatus.rpm = (botStatus.rps * 60).toFixed(1);
    botStatus.rph = (botStatus.rpm * 60).toFixed(0);
    
    // Calculate success rate
    const total = botStatus.totalRequests;
    const success = botStatus.success;
    botStatus.successRate = total > 0 ? 
      ((success / total) * 100).toFixed(1) + '%' : '0%';
    
    // Update counters
    lastReqs = botStatus.totalRequests;
    lastSuccess = botStatus.success;
    
    // Dynamic adjustment based on success rate
    const successRate = parseFloat(botStatus.successRate);
    adjustSpeedDynamically(successRate);
    
    // Log stats
    console.log(`📊 ${botStatus.success}/${botStatus.targetViews} | ` +
                `Success: ${botStatus.successRate} | ` +
                `RPS: ${botStatus.rps} | ` +
                `RPM: ${botStatus.rpm} | ` +
                `Queue: ${requestEngine.requestQueue.length}`);
    
    // Check if target reached or bot stopped
    if (!botStatus.running || botStatus.success >= botStatus.targetViews) {
      clearInterval(statsInterval);
      finishBot();
    }
  }, CONFIG.STATS_INTERVAL);

  // 🚀 MAIN REQUEST LOOP
  while (botStatus.running && botStatus.success < botStatus.targetViews) {
    const batchPromises = [];
    
    // Send batch of requests
    for (let i = 0; i < CONFIG.BATCH_SIZE; i++) {
      if (botStatus.success >= botStatus.targetViews) break;
      
      batchPromises.push(requestEngine.sendRequest(botStatus.aweme_id));
      
      // Add micro-delay between requests to avoid throttling
      if (i % 10 === 0) {
        await new Promise(resolve => 
          setTimeout(resolve, 
            Math.random() * (CONFIG.REQUEST_DELAY_MAX - CONFIG.REQUEST_DELAY_MIN) + 
            CONFIG.REQUEST_DELAY_MIN
          )
        );
      }
    }
    
    // Wait for batch completion
    await Promise.allSettled(batchPromises);
    botStatus.currentBatch++;
    
    // Adaptive delay between batches
    const batchDelay = calculateAdaptiveDelay();
    if (batchDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
  }
}

function adjustSpeedDynamically(successRate) {
  if (successRate > 70) {
    // Increase speed if success rate is high
    CONFIG.MAX_CONCURRENT_REQUESTS = Math.min(1000, CONFIG.MAX_CONCURRENT_REQUESTS + 50);
    CONFIG.REQUEST_DELAY_MAX = Math.max(1, CONFIG.REQUEST_DELAY_MAX - 1);
  } else if (successRate < 30) {
    // Decrease speed if success rate is low
    CONFIG.MAX_CONCURRENT_REQUESTS = Math.max(100, CONFIG.MAX_CONCURRENT_REQUESTS - 50);
    CONFIG.REQUEST_DELAY_MAX = Math.min(50, CONFIG.REQUEST_DELAY_MAX + 5);
  }
}

function calculateAdaptiveDelay() {
  const successRate = parseFloat(botStatus.successRate);
  
  if (successRate > 80) {
    return 0; // No delay
  } else if (successRate > 50) {
    return 5; // Small delay
  } else if (successRate > 20) {
    return 20; // Medium delay
  } else {
    return 50; // Large delay
  }
}

function finishBot() {
  const timeTaken = ((Date.now() - botStatus.startTime) / 1000 / 60).toFixed(1);
  const viewsPerMinute = (botStatus.success / timeTaken).toFixed(1);
  
  console.log('\n🎉 BOT COMPLETED SUCCESSFULLY!');
  console.log(`📈 Final Stats:`);
  console.log(`   ✅ Success: ${botStatus.success}`);
  console.log(`   ❌ Failed: ${botStatus.fails}`);
  console.log(`   ⏱️  Time: ${timeTaken} minutes`);
  console.log(`   ⚡ Speed: ${viewsPerMinute} views/minute`);
  console.log(`   📊 Success Rate: ${botStatus.successRate}`);
  console.log(`   🔄 IP Rotations: ${botStatus.ipRotations}`);
  
  if (requestEngine) {
    requestEngine.pause();
  }
}

// 🚀 CLUSTER MODE FOR MULTI-CORE
if (cluster.isMaster && process.env.CLUSTER_MODE !== 'false') {
  console.log(`🚀 Master ${process.pid} is running`);
  
  // Fork workers
  for (let i = 0; i < os.cpus().length; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork();
  });
} else {
  // Worker process
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Worker ${process.pid} listening on port ${PORT}`);
    console.log(`⚡ Target Speed: ${CONFIG.MAX_RPS_TARGET} RPS`);
    console.log(`💪 Max Concurrent: ${CONFIG.MAX_CONCURRENT_REQUESTS}`);
    console.log(`🌐 Proxy Rotation: ${CONFIG.PROXY_ROTATION ? 'Enabled' : 'Disabled'}`);
    console.log(`🔗 HTTP/2: ${CONFIG.USE_HTTP2 ? 'Enabled' : 'Disabled'}`);
  });
}