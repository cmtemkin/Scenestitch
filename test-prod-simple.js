import https from 'https';

const options = {
  hostname: 'scene-stitch-cmtemkin.replit.app',
  port: 443,
  path: '/api/projects',
  method: 'GET',
  headers: {
    'Accept': 'application/json'
  }
};

console.log('Testing basic production API...');

const req = https.request(options, (res) => {
  console.log(`Projects API Status: ${res.statusCode}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`Projects Response Length: ${data.length}`);
    if (res.statusCode === 200 && data.length > 0) {
      try {
        const projects = JSON.parse(data);
        console.log(`Found ${projects.length} projects in production`);
        
        // Now test scenes endpoint
        testScenesEndpoint();
      } catch (e) {
        console.log(`Projects parse error: ${e.message}`);
      }
    }
  });
});

req.on('error', (e) => {
  console.error(`Projects API Error: ${e.message}`);
});

req.setTimeout(5000, () => {
  console.error('Projects API Timeout');
  req.destroy();
});

req.end();

function testScenesEndpoint() {
  const sceneOptions = {
    hostname: 'scene-stitch-cmtemkin.replit.app',
    port: 443,
    path: '/api/scenes/132',
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  };

  console.log('Testing scenes endpoint...');
  
  const sceneReq = https.request(sceneOptions, (res) => {
    console.log(`Scenes API Status: ${res.statusCode}`);
    console.log(`Response Headers:`, res.headers);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log(`Scenes Response Length: ${data.length}`);
      if (data.length > 0) {
        console.log(`First 200 chars: ${data.substring(0, 200)}`);
      }
    });
  });

  sceneReq.on('error', (e) => {
    console.error(`Scenes API Error: ${e.message}`);
  });

  sceneReq.setTimeout(8000, () => {
    console.error('Scenes API Timeout after 8 seconds');
    sceneReq.destroy();
  });

  sceneReq.end();
}