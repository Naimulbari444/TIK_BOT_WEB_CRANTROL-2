const express = require('express');
const crypto = require('crypto');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Global variables
let botStatus = {
  running: false,
  success: 0,
  fails: 0,
  reqs: 0,
  targetViews: 0,
  aweme_id: '',
  startTime: null,
  rps: 0,
  rpm: 0,
  successRate: '0%'
};

let isRunning = false;

// Routes
app.get('/', (req, res) => {
  res.json({ 
    status: '🚀 ULTRA FAST TIKTOK BOT - MAX SPEED',
    message: 'Optimized for maximum real views per minute',
    endpoints: ['GET /status', 'POST /start', 'POST /stop']
  });
});

app.get('/status', (req, res) => {
  const total = botStatus.reqs;
  const success = botStatus.success;
  botStatus.successRate = total > 0 ? ((success / total) * 100).toFixed(1) + '%' : '0%';
  res.json(botStatus);
});

app.post('/start', (req, res) => {
  const { targetViews, videoLink } = req.body;
  
  if (!videoLink) {
    return res.json({ success: false, message: 'Video link required' });
  }

  const idMatch = videoLink.match(/\d{18,19}/g);
  if (!idMatch) {
    return res.json({ success: false, message: 'Invalid TikTok video link' });
  }

  isRunning = false;
  
  // Reset stats
  botStatus = {
    running: true,
    success: 0,
    fails: 0,
    reqs: 0,
    targetViews: parseInt(targetViews) || 1000,
    aweme_id: idMatch[0],
    startTime: new Date(),
    rps: 0,
    rpm: 0,
    successRate: '0%'
  };

  console.log('🚀 ULTRA FAST BOT STARTING...');
  
  isRunning = true;
  startUltraFastBot();
  
  res.json({ 
    success: true, 
    message: '🚀 ULTRA FAST BOT STARTED! Maximum speed activated',
    target: botStatus.targetViews,
    videoId: botStatus.aweme_id
  });
});

app.post('/stop', (req, res) => {
  isRunning = false;
  botStatus.running = false;
  res.json({ success: true, message: 'Bot stopped' });
});

// 🚀 ULTRA FAST DEVICE GENERATION
function generateUltraDevice() {
  const device_id = Array.from({length: 19}, () => '0123456789'[Math.floor(Math.random() * 10)]).join('');
  const iid = Array.from({length: 19}, () => '0123456789'[Math.floor(Math.random() * 10)]).join('');
  const cdid = crypto.randomUUID();
  const openudid = Array.from({length: 16}, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  
  return { device_id, iid, cdid, openudid };
}

// 🚀 ULTRA FAST REQUEST
function sendUltraRequest(aweme_id) {
  return new Promise((resolve) => {
    if (!isRunning) {
      resolve();
      return;
    }

    const device = generateUltraDevice();
    
    const params = `device_id=${device.device_id}&iid=${device.iid}&device_type=SM-G973N&app_name=musically_go&host_abi=armeabi-v7a&channel=googleplay&device_platform=android&version_code=160904&device_brand=samsung&os_version=9&aid=1340`;
    const payload = `item_id=${aweme_id}&play_delta=1`;
    
    const unix = Math.floor(Date.now() / 1000);
    const sig = {
      'X-Gorgon': '0404b0d30000' + Array.from({length: 24}, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''),
      'X-Khronos': unix.toString()
    };
    
    const options = {
      hostname: 'api16-va.tiktokv.com',
      port: 443,
      path: `/aweme/v1/aweme/stats/?${params}`,
      method: 'POST',
      headers: {
        'cookie': 'sessionid=90c38a59d8076ea0fbc01c8643efbe47',
        'x-gorgon': sig['X-Gorgon'],
        'x-khronos': sig['X-Khronos'],
        'user-agent': 'okhttp/3.10.0.1',
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': Buffer.byteLength(payload)
      },
      timeout: 3000  // 🚀 SHORTER TIMEOUT
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        botStatus.reqs++;
        try {
          const jsonData = JSON.parse(data);
          if (jsonData && jsonData.log_pb && jsonData.log_pb.impr_id) {
            botStatus.success++;
          } else {
            botStatus.fails++;
          }
        } catch (e) {
          botStatus.fails++;
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      botStatus.fails++;
      botStatus.reqs++;
      resolve();
    });

    req.on('timeout', () => {
      req.destroy();
      botStatus.fails++;
      botStatus.reqs++;
      resolve();
    });

    req.write(payload);
    req.end();
  });
}

// 🚀 ULTRA FAST BOT LOOP - MAXIMUM SPEED
async function startUltraFastBot() {
  console.log('🚀 ULTRA FAST BOT ACTIVATED!');
  console.log('🎯 MAXIMUM SPEED - 50+ RPS Target');
  console.log(`📹 Target: ${botStatus.targetViews} views | Video: ${botStatus.aweme_id}`);

  let lastReqs = 0;
  let consecutiveSuccess = 0;

  const statsInterval = setInterval(() => {
    botStatus.rps = ((botStatus.reqs - lastReqs) / 1).toFixed(1);
    botStatus.rpm = (botStatus.rps * 60).toFixed(1);
    lastReqs = botStatus.reqs;
    
    const total = botStatus.reqs;
    const success = botStatus.success;
    botStatus.successRate = total > 0 ? ((success / total) * 100).toFixed(1) + '%' : '0%';
    
    console.log(`📊 ${botStatus.success}/${botStatus.targetViews} | Success: ${botStatus.successRate} | RPS: ${botStatus.rps} | RPM: ${botStatus.rpm}`);
    
    if (!isRunning) {
      clearInterval(statsInterval);
    }
  }, 1000);

  // 🚀 ULTRA FAST LOOP - MAXIMUM CONCURRENCY
  console.log('🔥 Starting 80+ concurrent requests...');
  
  while (isRunning && botStatus.success < botStatus.targetViews) {
    const successRate = parseFloat(botStatus.successRate);
    
    // 🚀 ADAPTIVE BATCH SIZE - Success rate ke hisab se
    let batchSize = 80;  // 🚀 HIGH CONCURRENCY
    let delay = 10;      // 🚀 MINIMAL DELAY
    
    if (successRate > 40) {
      // Agar success rate high hai, aur speed badhao
      batchSize = 100;
      delay = 5;
      consecutiveSuccess++;
    } else if (successRate < 20) {
      // Agar success rate low hai, thora slow karo
      batchSize = 60;
      delay = 20;
      consecutiveSuccess = 0;
    }
    
    // Agar consistently high success rate hai, aur speed badhao
    if (consecutiveSuccess > 5) {
      batchSize = 120;
      delay = 2;
    }
    
    const promises = [];
    for (let i = 0; i < batchSize; i++) {
      promises.push(sendUltraRequest(botStatus.aweme_id));
    }
    
    await Promise.all(promises);
    
    // 🚀 MINIMAL DELAY ONLY
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  isRunning = false;
  botStatus.running = false;
  clearInterval(statsInterval);
  
  const timeTaken = ((Date.now() - botStatus.startTime) / 1000 / 60).toFixed(1);
  console.log('🛑 Bot stopped');
  console.log(`📈 Final: ${botStatus.success} views in ${timeTaken} minutes`);
  console.log(`⚡ Average: ${(botStatus.success / timeTaken).toFixed(1)} views/minute`);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ULTRA FAST TIKTOK BOT RUNNING ON PORT ${PORT}`);
  console.log(`🎯 TARGET: 50-100 RPS | 3000-6000 RPM`);
  console.log(`⚡ MAXIMUM SPEED - ADAPTIVE CONCURRENCY`);
});
