// Test thumbnail compression in production
import fetch from 'node-fetch';

const prodUrl = 'https://e0f63fb5-0f96-47da-8bee-8822f91efbcf-00-9ncugbp9kcsg.kirk.replit.dev';

async function testThumbnails() {
  try {
    console.log('Testing thumbnail compression...');
    const response = await fetch(`${prodUrl}/api/scenes/102`);
    const data = await response.json();
    
    const firstScene = data.scenes?.[0];
    if (firstScene) {
      console.log('First scene data:');
      console.log('- Has imageUrl:', !!firstScene.imageUrl);
      console.log('- Is compressed:', firstScene.isCompressed);
      console.log('- Thumbnail size:', firstScene.imageUrl ? Math.round(firstScene.imageUrl.length / 1024) + 'KB' : 'N/A');
      console.log('- Full image endpoint:', firstScene.fullImageEndpoint);
      console.log('- Original size:', firstScene.originalSize);
      
      // Check if thumbnail is valid base64 image
      if (firstScene.imageUrl && firstScene.imageUrl.startsWith('data:image/')) {
        console.log('- Thumbnail format: Valid base64 image');
        console.log('- Thumbnail preview:', firstScene.imageUrl.substring(0, 100) + '...');
      } else {
        console.log('- Thumbnail format: Invalid or missing');
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testThumbnails();