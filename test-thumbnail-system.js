import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testThumbnailSystem() {
  console.log('Testing thumbnail optimization system...\n');
  
  try {
    // Test with existing project that has images (project 132)
    const projectId = 132;
    console.log(`1. Testing scenes endpoint for project ${projectId}...`);
    
    const scenesResponse = await fetch(`${BASE_URL}/api/scenes/${projectId}`);
    if (!scenesResponse.ok) {
      throw new Error(`Failed to retrieve scenes: ${scenesResponse.status}`);
    }
    
    const scenesData = await scenesResponse.json();
    const scenes = scenesData.scenes || [];
    
    console.log(`   Retrieved ${scenes.length} scenes`);
    
    if (scenesData.meta?.optimized) {
      console.log(`   Optimization active: ${scenesData.meta.originalSize} → ${scenesData.meta.compressedSize}`);
    } else {
      console.log('   No optimization applied');
    }
    
    // Test individual image endpoints
    console.log('\n2. Testing image endpoints...');
    let endpointImages = 0;
    let successfulLoads = 0;
    
    for (let i = 0; i < Math.min(3, scenes.length); i++) {
      const scene = scenes[i];
      if (scene.imageUrl && scene.imageUrl.startsWith('/api/scene-image/')) {
        endpointImages++;
        console.log(`   Testing: ${scene.imageUrl}`);
        
        const imageResponse = await fetch(`${BASE_URL}${scene.imageUrl}`);
        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          if (imageData.imageUrl && imageData.imageUrl.startsWith('data:image/')) {
            successfulLoads++;
            const sizeKB = Math.round(imageData.imageUrl.length / 1024);
            console.log(`   ✓ Scene ${scene.sceneNumber}: ${sizeKB}KB image loaded`);
          }
        } else {
          console.log(`   ✗ Scene ${scene.sceneNumber}: Failed (${imageResponse.status})`);
        }
      } else if (scene.imageUrl && scene.imageUrl.startsWith('data:image/')) {
        const sizeKB = Math.round(scene.imageUrl.length / 1024);
        console.log(`   ✓ Scene ${scene.sceneNumber}: ${sizeKB}KB direct base64`);
        successfulLoads++;
      }
    }
    
    console.log('\n3. Results:');
    console.log(`   Total scenes: ${scenes.length}`);
    console.log(`   Endpoint images: ${endpointImages}`);
    console.log(`   Successful loads: ${successfulLoads}`);
    console.log(`   Optimization: ${scenesData.meta?.optimized ? 'ACTIVE' : 'INACTIVE'}`);
    
    if (scenesData.meta?.optimized) {
      console.log(`   Size reduction: ${scenesData.meta.originalSize} → ${scenesData.meta.compressedSize}`);
    }
    
    return {
      success: true,
      totalScenes: scenes.length,
      endpointImages,
      successfulLoads,
      optimized: scenesData.meta?.optimized || false
    };
    
  } catch (error) {
    console.error('Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

testThumbnailSystem()
  .then(result => {
    console.log('\nTest completed:', result);
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });