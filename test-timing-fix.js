#!/usr/bin/env node

/**
 * Test script to verify the improved timing logic for Project 172
 */

const BASE_URL = 'http://localhost:5000';

async function testTimingLogic() {
  console.log('🕐 Testing improved storyboard timing logic...\n');
  
  try {
    // Get Project 172 current timing data
    console.log('1. Analyzing current timing for Project 172...');
    
    const scenesResponse = await fetch(`${BASE_URL}/api/scenes/172`);
    if (!scenesResponse.ok) {
      throw new Error(`Failed to fetch scenes: ${scenesResponse.status}`);
    }
    
    const scenesData = await scenesResponse.json();
    const scenes = scenesData.scenes;
    
    console.log(`✓ Found ${scenes.length} scenes`);
    
    // Analyze current timing distribution
    const durations = scenes.map(scene => {
      const duration = (scene.exactEndTime - scene.exactStartTime);
      return {
        sceneNumber: scene.sceneNumber,
        contentLength: scene.scriptExcerpt?.length || 0,
        duration: duration,
        startTime: scene.exactStartTime,
        endTime: scene.exactEndTime
      };
    });
    
    console.log('\n📊 Current Timing Analysis:');
    console.log('Scene | Content Length | Duration | Start-End');
    console.log('------|----------------|----------|----------');
    
    durations.forEach(d => {
      console.log(`${d.sceneNumber.toString().padStart(5)} | ${d.contentLength.toString().padStart(14)} | ${d.duration.toString().padStart(8)}s | ${d.startTime}s-${d.endTime}s`);
    });
    
    const minDuration = Math.min(...durations.map(d => d.duration));
    const maxDuration = Math.max(...durations.map(d => d.duration));
    const avgDuration = durations.reduce((sum, d) => sum + d.duration, 0) / durations.length;
    const totalDuration = Math.max(...durations.map(d => d.endTime));
    
    console.log(`\n📈 Statistics:`);
    console.log(`   Min Duration: ${minDuration}s`);
    console.log(`   Max Duration: ${maxDuration}s`);
    console.log(`   Avg Duration: ${avgDuration.toFixed(1)}s`);
    console.log(`   Total Duration: ${totalDuration}s`);
    console.log(`   Panel Frequency: ${(totalDuration / scenes.length).toFixed(1)}s per panel`);
    
    // Check for problematic scenes (too long)
    const longScenes = durations.filter(d => d.duration > 15);
    if (longScenes.length > 0) {
      console.log(`\n⚠️  Found ${longScenes.length} scenes longer than 15 seconds:`);
      longScenes.forEach(scene => {
        console.log(`   Scene ${scene.sceneNumber}: ${scene.duration}s (${scene.contentLength} characters)`);
      });
    }
    
    // Check panel frequency (should be at least 1 per 10 seconds)
    const recommendedPanels = Math.ceil(totalDuration / 10);
    if (scenes.length < recommendedPanels) {
      console.log(`\n⚠️  Panel frequency issue: ${scenes.length} panels for ${totalDuration}s`);
      console.log(`   Recommended: at least ${recommendedPanels} panels`);
    }
    
    console.log('\n✅ Analysis complete. The improved timing logic should address these issues.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testTimingLogic();