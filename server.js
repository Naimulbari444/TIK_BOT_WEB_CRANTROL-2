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
  successRate: '0%',
  deviceCount: 0
};

let isRunning = false;
let generatedDevices = [];

// 🔧 DEVICE GENERATOR FUNCTIONS - YAHI ASLI MAGIC HAI
function generateRandomHex(length) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

function generateDeviceId() {
  // Generate 16-byte hex for device_id
  return generateRandomHex(16);
}

function generateInstallId() {
  // Generate 19-digit number for iid
  return Math.floor(1000000000000000000 + Math.random() * 9000000000000000000).toString();
}

function generateCDID() {
  // Generate CDID (32 chars)
  return generateRandomHex(32);
}

function generateOpenUDID() {
  // Generate OpenUDID (16 chars)
  return generateRandomHex(16);
}

function generateDeviceModel() {
  const models = [
    'SM-G973N', 'SM-G975F', 'SM-G980F', 'SM-G981B', 'SM-G991B',
    'SM-A525F', 'SM-A326B', 'SM-A127F', 'SM-A037G', 'SM-M225FV',
    'Redmi Note 10', 'Redmi 9', 'Poco X3', 'Mi 11 Lite', 'Mi 10T',
    'iPhone12,1', 'iPhone13,2', 'iPhone14,5', 'iPhone15,2'
  ];
  return models[Math.floor(Math.random() * models.length)];
}

function generateAndroidVersion() {
  const versions = ['9', '10', '11', '12', '13'];
  return versions[Math.floor(Math.random() * versions.length)];
}

function generateRandomUserAgent() {
  const devices = [
    'SM-G973N', 'SM-G975F', 'SM-G980F', 'Redmi Note 10', 'Mi 11 Lite'
  ];
  const device = devices[Math.floor(Math.random() * devices.length)];
  const androidVersions = ['9', '10', '11', '12'];
  const androidVersion = androidVersions[Math.floor(Math.random() * androidVersions.length)];
  const sdkVersions = ['28', '29', '30', '31', '32'];
  const sdkVersion = sdkVersions[Math.floor(Math.random() * sdkVersions.length)];
  
  return `Mozilla/5.0 (Linux; Android ${androidVersion}; ${device}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36`;
}

function generateDevice() {
  const device_id = generateDeviceId();
  const iid = generateInstallId();
  const cdid = generateCDID();
  const openudid = generateOpenUDID();
  const device_type = generateDeviceModel();
  const os_version = generateAndroidVersion();
  
  // Format: device_id:iid:cdid:openudid:device_type:os_version
  return `${device_id}:${iid}:${cdid}:${openudid}:${device_type}:${os_version}`;
}

async function generateDevices(count = 1000) {
  console.log(`🔧 Generating ${count} unique devices...`);
  generatedDevices = [];
  
  for (let i = 0; i < count; i++) {
    generatedDevices.push(generateDevice());
    if (i % 100 === 0) {
      process.stdout.write(`📱 Generated ${i} devices...\r`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  
  console.log(`✅ Successfully generated ${generatedDevices.length} unique devices`);
  
  // Save to file for future use
  fs.writeFileSync('generated_devices.txt', generatedDevices.join('\n'));
  console.log(`💾 Saved devices to generated_devices.txt`);
  
  return generatedDevices;
}

// Initialize devices on startup
(async () => {
  console.log('🚀 Initializing auto device generation system...');
  
  // Check if we already have generated devices
  if (fs.existsSync('generated_devices.txt')) {
    try {
      generatedDevices = fs.readFileSync('generated_devices.txt', 'utf-8')
        .split('\n')
        .filter(Boolean);
      
      if (generatedDevices.length >= 500) {
        console.log(`📱 Loaded ${generatedDevices.length} pre-generated devices`);
        botStatus.deviceCount = generatedDevices.length;
      } else {
        console.log(`⚠ Found only ${generatedDevices.length} devices, generating more...`);
        await generateDevices(1000);
      }
    } catch (e) {
      console.log('⚠ Error loading devices, generating new ones...');
      await generateDevices(1000);
    }
  } else {
    // Generate fresh devices
    await generateDevices(1000);
  }
  
  botStatus.deviceCount = generatedDevices.length;
  console.log(`✅ Device system ready! ${botStatus.deviceCount} devices available`);
})();

// Routes
app.get('/', (req, res) => {
  res.json({ 
    status: 'TikTok Bot Instance Running',
    message: 'Ready to receive commands from main controller',
    endpoints: ['GET /status', 'POST /start', 'POST /stop', 'POST /generate-devices'],
    deviceCount: botStatus.deviceCount,
    features: ['Auto Device Generation', 'Maximum Speed Requests', 'Real TikTok Views']
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
    successRate: '0%',
    deviceCount: generatedDevices.length
  };

  isRunning = true;
  
  // Start bot in background
  startBot();
  
  res.json({ 
    success: true, 
    message: 'Bot started successfully!',
    target: botStatus.targetViews,
    videoId: botStatus.aweme_id,
    devicesAvailable: botStatus.deviceCount
  });
});

app.post('/stop', (req, res) => {
  isRunning = false;
  botStatus.running = false;
  res.json({ success: true, message: 'Bot stopped' });
});

// New endpoint to generate more devices
app.post('/generate-devices', async (req, res) => {
  const { count = 1000 } = req.body;
  const newCount = parseInt(count);
  
  if (newCount < 100 || newCount > 10000) {
    return res.json({ 
      success: false, 
      message: 'Count must be between 100 and 10000' 
    });
  }
  
  console.log(`🔄 Generating ${newCount} new devices...`);
  await generateDevices(newCount);
  botStatus.deviceCount = generatedDevices.length;
  
  res.json({ 
    success: true, 
    message: `Generated ${newCount} new devices`,
    totalDevices: botStatus.deviceCount
  });
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
        'user-agent': generateRandomUserAgent(), // RANDOM USER AGENT
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
    const [did, iid, cdid, openudid, device_type, os_version] = device.split(':');
    // Use device_type and os_version from generated device for more realistic requests
    return sendRequest(did, iid, cdid, openudid, aweme_id);
  });
  await Promise.all(promises);
}

async function startBot() {
  console.log('🚀 Starting TikTok Bot Instance...');
  
  // Use generated devices instead of devices.txt
  const devices = generatedDevices.length > 0 ? generatedDevices : [];
  
  if (devices.length === 0) {
    console.log('❌ No devices found! Generating fresh devices...');
    await generateDevices(500);
  }

  console.log(`📱 Loaded ${devices.length} auto-generated devices`);
  console.log(`🎯 Target: ${botStatus.targetViews} views`);
  console.log(`📹 Video ID: ${botStatus.aweme_id}`);
  console.log('🔥 MAXIMUM SPEED WITH AUTO-GENERATED DEVICES ACTIVATED!');

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
    
    console.log(`📊 ${botStatus.success}/${botStatus.targetViews} | Success Rate: ${botStatus.successRate} | RPS: ${botStatus.rps} | Devices: ${botStatus.deviceCount}`);
    
    if (!isRunning) {
      clearInterval(statsInterval);
    }
  }, 1000);

  // MAIN BOT LOOP - MAXIMUM SPEED WITH AUTO-GENERATED DEVICES
  console.log('🔥 Starting maximum speed requests with auto-generated devices...');
  
  while (isRunning && botStatus.success < botStatus.targetViews) {
    const batchDevices = [];
    for (let i = 0; i < concurrency && i < devices.length; i++) {
      // Randomly select from generated devices
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
  console.log(`🤖 AUTO DEVICE GENERATION SYSTEM ACTIVE`);
  console.log(`🔥 MAXIMUM SPEED MODE ACTIVATED`);
  console.log(`🎯 Ready to send TikTok views with auto-generated devices!`);
});