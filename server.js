const express = require('express');
const fs = require('fs');
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
    status: 'TikTok Bot Instance Running',
    message: 'Ready to receive commands from main controller',
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
  const { targetViews, videoLink, mode } = req.body;
  
  if (!videoLink) {
    return res.json({ success: false, message: 'Video link required' });
  }

  const idMatch = videoLink.match(/\d{18,19}/g);
  if (!idMatch) {
    return res.json({ success: false, message: 'Invalid TikTok video link' });
  }

  // Stop previous bot if running
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

  isRunning = true;
  
  // Start bot in background
  startBot();
  
  res.json({ 
    success: true, 
    message: 'Bot started successfully!',
    target: botStatus.targetViews,
    videoId: botStatus.aweme_id
  });
});

app.post('/stop', (req, res) => {
  isRunning = false;
  botStatus.running = false;
  res.json({ success: true, message: 'Bot stopped' });
});

// Bot functions - YAHI REAL TIKTOK VIEWS KA MAGIC HAI
function gorgon(params, data, cookies, unix) {
  function md5(input) {
    return crypto.createHash('md5').update(input).digest('hex');
  }
  let baseStr = md5(params) + (data ? md5(data) : '0'.repeat(32)) + (cookies ? md5(cookies) : '0'.repeat(32));
  return {
    'X-Gorgon': '0404b0d300000000000000000000000000000000',
    'X-Khronos': unix.toString()
  };
}

function sendRequest(did, iid, cdid, openudid, aweme_id) {
  return new Promise((resolve) => {
    if (!isRunning) {
      resolve();
      return;
    }

    const params = `device_id=${did}&iid=${iid}&device_type=SM-G973N&app_name=musically_go&host_abi=armeabi-v7a&channel=googleplay&device_platform=android&version_code=160904&device_brand=samsung&os_version=9&aid=1340`;
    const payload = `item_id=${aweme_id}&play_delta=1`;
    const sig = gorgon(params, null, null, Math.floor(Date.now() / 1000));
    
    const options = {
      hostname: 'api16-va.tiktokv.com',  // TIKTOK SERVER
      port: 443,
      path: `/aweme/v1/aweme/stats/?${params}`, // TIKTOK API
      method: 'POST',
      headers: {
        'cookie': 'sessionid=90c38a59d8076ea0fbc01c8643efbe47',
        'x-gorgon': sig['X-Gorgon'],     // TIKTOK SIGNATURE
        'x-khronos': sig['X-Khronos'],   // TIKTOK TIMESTAMP
        'user-agent': 'okhttp/3.10.0.1', // TIKTOK USER AGENT
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': Buffer.byteLength(payload)
      },
      timeout: 3000
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
            botStatus.success++; // ✅ SUCCESSFUL TIKTOK VIEW
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

async function sendBatch(batchDevices, aweme_id) {
  const promises = batchDevices.map(device => {
    const [did, iid, cdid, openudid] = device.split(':');
    return sendRequest(did, iid, cdid, openudid, aweme_id);
  });
  await Promise.all(promises);
}

async function startBot() {
  console.log('🚀 Starting TikTok Bot Instance...');
  
  const devices = fs.existsSync('devices.txt') ? 
    fs.readFileSync('devices.txt', 'utf-8').split('\n').filter(Boolean) : [];
  
  if (devices.length === 0) {
    console.log('❌ No devices found!');
    botStatus.running = false;
    isRunning = false;
    return;
  }

  console.log(`📱 Loaded ${devices.length} devices`);
  console.log(`🎯 Target: ${botStatus.targetViews} views`);
  console.log(`📹 Video ID: ${botStatus.aweme_id}`);

  const concurrency = 200; // MAXIMUM SPEED
  let lastReqs = 0;

  // RPS Calculator
  const statsInterval = setInterval(() => {
    botStatus.rps = ((botStatus.reqs - lastReqs) / 1).toFixed(1);
    botStatus.rpm = (botStatus.rps * 60).toFixed(1);
    lastReqs = botStatus.reqs;
    
    const total = botStatus.reqs;
    const success = botStatus.success;
    botStatus.successRate = total > 0 ? ((success / total) * 100).toFixed(1) + '%' : '0%';
    
    console.log(`📊 ${botStatus.success}/${botStatus.targetViews} | Success Rate: ${botStatus.successRate} | RPS: ${botStatus.rps}`);
    
    if (!isRunning) {
      clearInterval(statsInterval);
    }
  }, 1000);

  // MAIN BOT LOOP - MAXIMUM SPEED
  console.log('🔥 Starting maximum speed requests to TikTok...');
  
  while (isRunning && botStatus.success < botStatus.targetViews) {
    const batchDevices = [];
    for (let i = 0; i < concurrency && i < devices.length; i++) {
      batchDevices.push(devices[Math.floor(Math.random() * devices.length)]);
    }
    
    await sendBatch(batchDevices, botStatus.aweme_id);
    
    // MINIMAL DELAY FOR MAXIMUM SPEED
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  // Cleanup
  isRunning = false;
  botStatus.running = false;
  clearInterval(statsInterval);
  
  console.log('🛑 Bot instance stopped');
  const successRate = botStatus.reqs > 0 ? ((botStatus.success / botStatus.reqs) * 100).toFixed(1) : 0;
  console.log(`📈 Final Stats: ${botStatus.success} success, ${botStatus.fails} fails, ${successRate}% success rate`);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 TikTok Bot Instance running on port ${PORT}`);
  console.log(`🔥 MAXIMUM SPEED MODE ACTIVATED`);
  console.log(`🎯 Ready to send TikTok views!`);
});
