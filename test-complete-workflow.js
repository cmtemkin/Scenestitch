import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testCompleteWorkflow() {
  console.log('🧪 Testing complete SceneStitch workflow...\n');
  
  try {
    // Step 1: Create a new project
    console.log('1. Creating new project...');
    const projectData = {
      title: 'Test Project - Performance Optimization',
      content: 'Welcome to our performance test! This is a short script to test the new thumbnail optimization system. We will create multiple scenes with images to verify that everything loads quickly and displays correctly. The optimization should automatically compress large responses while maintaining full image quality.',
      style: 'digital art',
      projectType: 'video',
      maintainContinuity: true
    };
    
    const createResponse = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectData)
    });
    
    if (!createResponse.ok) {
      throw new Error(`Failed to create project: ${createResponse.status}`);
    }
    
    const project = await createResponse.json();
    console.log(`✓ Project created: ID ${project.id} - "${project.title}"`);
    
    // Step 2: Generate scene prompts
    console.log('\n2. Generating scene prompts...');
    const promptData = {
      script: projectData.content,
      style: projectData.style,
      scriptId: project.id,
      maintainContinuity: true,
      projectType: 'video'
    };
    
    const promptResponse = await fetch(`${BASE_URL}/api/generate-prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(promptData)
    });
    
    if (!promptResponse.ok) {
      throw new Error(`Failed to generate prompts: ${promptResponse.status}`);
    }
    
    const promptResult = await promptResponse.json();
    console.log(`✓ Generated ${promptResult.scenes?.length || 0} scene prompts`);
    
    // Step 3: Generate images for first 3 scenes
    console.log('\n3. Generating images for first 3 scenes...');
    const scenes = promptResult.scenes || [];
    const imagesToGenerate = scenes.slice(0, 3);
    
    for (let i = 0; i < imagesToGenerate.length; i++) {
      const scene = imagesToGenerate[i];
      console.log(`   Generating image for scene ${scene.sceneNumber}...`);
      
      const imageResponse = await fetch(`${BASE_URL}/api/generate-image/${scene.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      if (imageResponse.ok) {
        console.log(`   ✓ Scene ${scene.sceneNumber} image generated`);
      } else {
        console.log(`   ⚠ Scene ${scene.sceneNumber} image failed: ${imageResponse.status}`);
      }
      
      // Wait a bit between requests to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Step 4: Test scene data retrieval and optimization
    console.log('\n4. Testing scene data retrieval and optimization...');
    const scenesResponse = await fetch(`${BASE_URL}/api/scenes/${project.id}`);
    
    if (!scenesResponse.ok) {
      throw new Error(`Failed to retrieve scenes: ${scenesResponse.status}`);
    }
    
    const scenesData = await scenesResponse.json();
    const retrievedScenes = scenesData.scenes || [];
    
    console.log(`✓ Retrieved ${retrievedScenes.length} scenes`);
    
    if (scenesData.meta?.optimized) {
      console.log(`✓ Response optimization active: ${scenesData.meta.originalSize} → ${scenesData.meta.compressedSize}`);
    }
    
    // Step 5: Test individual scene images
    console.log('\n5. Testing individual scene image endpoints...');
    let successfulImages = 0;
    let imageEndpointCount = 0;
    
    for (const scene of retrievedScenes) {
      if (scene.imageUrl) {
        if (scene.imageUrl.startsWith('/api/scene-image/')) {
          imageEndpointCount++;
          console.log(`   Testing image endpoint: ${scene.imageUrl}`);
          
          const imageResponse = await fetch(`${BASE_URL}${scene.imageUrl}`);
          if (imageResponse.ok) {
            const imageData = await imageResponse.json();
            if (imageData.imageUrl && imageData.imageUrl.startsWith('data:image/')) {
              successfulImages++;
              const sizeKB = Math.round(imageData.imageUrl.length / 1024);
              console.log(`   ✓ Scene ${scene.sceneNumber}: ${sizeKB}KB base64 image`);
            }
          } else {
            console.log(`   ✗ Scene ${scene.sceneNumber}: Failed to load image`);
          }
        } else if (scene.imageUrl.startsWith('data:image/')) {
          successfulImages++;
          const sizeKB = Math.round(scene.imageUrl.length / 1024);
          console.log(`   ✓ Scene ${scene.sceneNumber}: ${sizeKB}KB direct base64`);
        }
      }
    }
    
    // Step 6: Summary
    console.log('\n6. Test Summary:');
    console.log(`   📊 Total scenes: ${retrievedScenes.length}`);
    console.log(`   🖼️  Images with endpoints: ${imageEndpointCount}`);
    console.log(`   ✅ Successfully loaded images: ${successfulImages}`);
    console.log(`   📈 Response optimization: ${scenesData.meta?.optimized ? 'ACTIVE' : 'NOT ACTIVE'}`);
    
    if (scenesData.meta?.optimized) {
      console.log(`   💾 Size reduction: ${scenesData.meta.originalSize} → ${scenesData.meta.compressedSize}`);
    }
    
    // Clean up test project
    console.log('\n7. Cleaning up test project...');
    const deleteResponse = await fetch(`${BASE_URL}/api/projects/${project.id}`, {
      method: 'DELETE'
    });
    
    if (deleteResponse.ok) {
      console.log('✓ Test project cleaned up');
    }
    
    console.log('\n🎉 Complete workflow test finished!');
    console.log(`📝 Project ID ${project.id} tested successfully`);
    
    return {
      projectId: project.id,
      totalScenes: retrievedScenes.length,
      successfulImages,
      imageEndpointCount,
      optimized: scenesData.meta?.optimized || false,
      originalSize: scenesData.meta?.originalSize,
      compressedSize: scenesData.meta?.compressedSize
    };
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    throw error;
  }
}

// Run the test
testCompleteWorkflow()
  .then(result => {
    console.log('\n✅ Test completed successfully:', result);
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });