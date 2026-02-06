// Production deployment test
import fetch from 'node-fetch';

async function testProductionEndpoints() {
  const prodUrl = 'https://e0f63fb5-0f96-47da-8bee-8822f91efbcf-00-9ncugbp9kcsg.kirk.replit.dev';
  
  console.log('Testing production health...');
  
  try {
    // Test health check first
    const healthResponse = await fetch(`${prodUrl}/health`, {
      timeout: 5000
    });
    console.log('Health Status:', healthResponse.status);
    
    if (healthResponse.status === 200) {
      const healthData = await healthResponse.text();
      console.log('Health Response:', healthData);
    }
  } catch (err) {
    console.log('Health check failed:', err.message);
  }
  
  try {
    // Test projects endpoint
    const projectsResponse = await fetch(`${prodUrl}/api/projects`, {
      timeout: 10000
    });
    console.log('Projects Status:', projectsResponse.status);
    console.log('Projects Headers:', Object.fromEntries(projectsResponse.headers.entries()));
    
    if (projectsResponse.status === 200) {
      const projectsData = await projectsResponse.text();
      console.log('Projects Response Length:', projectsData.length);
    }
  } catch (err) {
    console.log('Projects test failed:', err.message);
  }
  
  try {
    // Test scenes endpoint
    const scenesResponse = await fetch(`${prodUrl}/api/scenes/132`, {
      timeout: 15000
    });
    console.log('Scenes Status:', scenesResponse.status);
    console.log('Scenes Headers:', Object.fromEntries(scenesResponse.headers.entries()));
    
    if (scenesResponse.status === 200) {
      const scenesData = await scenesResponse.text();
      console.log('Scenes Response Length:', scenesData.length);
      
      try {
        const parsed = JSON.parse(scenesData);
        console.log('Scenes Count:', parsed.scenes?.length || 0);
      } catch (parseErr) {
        console.log('Failed to parse scenes response');
      }
    }
  } catch (err) {
    console.log('Scenes test failed:', err.message);
  }
}

testProductionEndpoints().catch(console.error);