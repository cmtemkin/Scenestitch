#!/usr/bin/env node

/**
 * Test the model rollback functionality
 */

const BASE_URL = 'http://localhost:5000';

async function testRollback() {
  console.log('🔄 Testing Model Rollback Functionality...\n');
  
  try {
    // 1. Get current configuration
    console.log('1️⃣ Current configuration:');
    const currentConfig = await fetch(`${BASE_URL}/api/config/models`);
    const config = await currentConfig.json();
    console.log(JSON.stringify(config, null, 2));
    
    // 2. Test rollback to GPT-4 models
    console.log('\n2️⃣ Testing rollback to GPT-4 models...');
    const rollbackResponse = await fetch(`${BASE_URL}/api/models/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelType: 'prompts',
        targetModel: 'gpt-4.1-mini'
      })
    });
    
    if (rollbackResponse.ok) {
      const result = await rollbackResponse.json();
      console.log('✅ Rollback successful:', result.message);
      console.log('New config:', JSON.stringify(result.config, null, 2));
    } else {
      console.log('❌ Rollback failed:', rollbackResponse.status);
    }
    
    // 3. Test upgrade back to GPT-5
    console.log('\n3️⃣ Testing upgrade back to GPT-5...');
    const upgradeResponse = await fetch(`${BASE_URL}/api/models/upgrade-gpt5`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (upgradeResponse.ok) {
      const result = await upgradeResponse.json();
      console.log('✅ Upgrade successful:', result.message);
      console.log('New config:', JSON.stringify(result.config, null, 2));
    } else {
      console.log('❌ Upgrade failed:', upgradeResponse.status);
    }
    
    // 4. Get metrics
    console.log('\n4️⃣ Getting model metrics...');
    const metricsResponse = await fetch(`${BASE_URL}/api/models/metrics`);
    
    if (metricsResponse.ok) {
      const metrics = await metricsResponse.json();
      console.log('✅ Metrics retrieved:');
      console.log('Status:', JSON.stringify(metrics.status, null, 2));
      console.log('Recommendations:', JSON.stringify(metrics.recommendations, null, 2));
    } else {
      console.log('❌ Failed to get metrics:', metricsResponse.status);
    }
    
    console.log('\n✨ Rollback test complete!');
    console.log('The system supports easy switching between GPT-5 and legacy models.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testRollback();