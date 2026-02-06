#!/usr/bin/env node

/**
 * Fix Project 172 by regenerating complete scenes that cover the full script
 */

const BASE_URL = 'http://localhost:5000';

async function fixMissingScenes() {
  console.log('🔧 Fixing Project 172 missing scenes...\n');
  
  try {
    // First, get the full script content
    const projectResponse = await fetch(`${BASE_URL}/api/projects/172`);
    const project = await projectResponse.json();
    const fullScript = project.content;
    
    console.log('📝 Full script length:', fullScript.length, 'characters');
    console.log('📝 Full script preview:');
    console.log(fullScript.substring(0, 200) + '...');
    console.log('📝 Full script ending:');
    console.log('...' + fullScript.substring(fullScript.length - 200));
    
    // Get current scenes to see what's missing
    const scenesResponse = await fetch(`${BASE_URL}/api/scenes/172`);
    const scenesData = await scenesResponse.json();
    const currentScenes = scenesData.scenes;
    
    console.log('\n📊 Current scenes cover:');
    const currentSceneText = currentScenes.map(s => s.scriptExcerpt).join(' ');
    console.log('Current scenes length:', currentSceneText.length, 'characters');
    console.log('Coverage:', ((currentSceneText.length / fullScript.length) * 100).toFixed(1), '%');
    
    // Check what's missing
    const missingContent = fullScript.replace(currentSceneText.trim(), '').trim();
    console.log('\n🚨 MISSING CONTENT:');
    console.log('Missing content length:', missingContent.length, 'characters');
    console.log('Missing content preview:');
    console.log(missingContent.substring(0, 300) + '...');
    
    if (missingContent.length < 100) {
      console.log('✅ No significant missing content found.');
      return;
    }
    
    console.log('\n🔄 SOLUTION: Regenerate scenes to cover complete script');
    console.log('This will require regenerating the storyboard with the full script content.');
    console.log('Current 15 scenes only cover ~50% of the actual script.');
    console.log('We need approximately 25-30 scenes to cover the full 2:30 audio properly.');
    
    // Calculate what we should have
    const ACTUAL_AUDIO_DURATION = 150; // 2:30 in seconds
    const TARGET_SCENE_DURATION = 6; // 6 seconds per scene average
    const RECOMMENDED_SCENES = Math.round(ACTUAL_AUDIO_DURATION / TARGET_SCENE_DURATION);
    
    console.log(`\n📈 RECOMMENDATIONS:`);
    console.log(`- Current scenes: ${currentScenes.length}`);
    console.log(`- Recommended scenes for ${ACTUAL_AUDIO_DURATION}s: ${RECOMMENDED_SCENES}`);
    console.log(`- Missing scenes: ${RECOMMENDED_SCENES - currentScenes.length}`);
    console.log(`- Average scene duration should be: ${(ACTUAL_AUDIO_DURATION / RECOMMENDED_SCENES).toFixed(1)}s`);
    
    console.log('\n⚠️  To fix this issue completely, you need to:');
    console.log('1. Regenerate the storyboard using the complete script content');
    console.log('2. Ensure the scene generation algorithm captures the full script');
    console.log('3. Recalculate timing based on the complete scene set');
    
  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
  }
}

// Run the analysis
fixMissingScenes();