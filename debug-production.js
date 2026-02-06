// Production diagnostic script
import https from 'https';
import http from 'http';

function testProductionAPI() {
  const options = {
    hostname: 'scene-stitch-cmtemkin.replit.app',
    port: 443,
    path: '/api/scenes/132',
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'SceneStitch-Diagnostic'
    }
  };

  const req = https.request(options, (res) => {
    console.log(`Production API Status: ${res.statusCode}`);
    console.log(`Headers:`, res.headers);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log(`Response Body Length: ${data.length}`);
      if (data.length > 0) {
        try {
          const parsed = JSON.parse(data);
          console.log(`Scenes Count: ${parsed.scenes ? parsed.scenes.length : 'No scenes property'}`);
        } catch (e) {
          console.log(`Parse Error: ${e.message}`);
          console.log(`Raw Response: ${data.substring(0, 500)}`);
        }
      }
    });
  });

  req.on('error', (e) => {
    console.error(`Production API Error: ${e.message}`);
  });

  req.setTimeout(10000, () => {
    console.error('Production API Timeout');
    req.destroy();
  });

  req.end();
}

function testLocalAPI() {
  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/scenes/132',
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  };

  const req = http.request(options, (res) => {
    console.log(`Local API Status: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        console.log(`Local Scenes Count: ${parsed.scenes ? parsed.scenes.length : 'No scenes property'}`);
      } catch (e) {
        console.log(`Local Parse Error: ${e.message}`);
      }
    });
  });

  req.on('error', (e) => {
    console.error(`Local API Error: ${e.message}`);
  });

  req.end();
}

console.log('Testing Production API...');
testProductionAPI();

setTimeout(() => {
  console.log('\nTesting Local API...');
  testLocalAPI();
}, 2000);