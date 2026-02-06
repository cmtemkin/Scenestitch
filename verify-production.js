// Verify production deployment is fully functional
import fetch from 'node-fetch';

const prodUrl = 'https://e0f63fb5-0f96-47da-8bee-8822f91efbcf-00-9ncugbp9kcsg.kirk.replit.dev';

async function verifyProduction() {
  try {
    console.log('Verifying optimized production scenes endpoint...');
    const response = await fetch(`${prodUrl}/api/scenes/132`);
    const data = await response.json();
    
    console.log('✓ Status:', response.status);
    console.log('✓ Total scenes:', data.scenes?.length || 0);
    console.log('✓ Response size:', Math.round(JSON.stringify(data).length / 1024) + 'KB');
    console.log('✓ Production optimized:', data.meta?.optimized);
    console.log('✓ Response metadata:', data.meta);
    
    // Test individual scene image endpoint
    if (data.scenes?.[0]?.id) {
      console.log('Testing individual scene image endpoint...');
      const imageResponse = await fetch(`${prodUrl}/api/scene-image/${data.scenes[0].id}`);
      console.log('✓ Scene image status:', imageResponse.status);
      
      if (imageResponse.status === 200) {
        const imageData = await imageResponse.json();
        console.log('✓ Image data size:', Math.round((imageData.imageUrl?.length || 0) / 1024) + 'KB');
      }
    }
    
    if (data.scenes?.length > 0) {
      console.log('✓ Production deployment working with optimized responses');
    } else {
      console.log('⚠ No scenes loaded');
    }
    
  } catch (error) {
    console.error('✗ Production verification failed:', error.message);
  }
}

verifyProduction();