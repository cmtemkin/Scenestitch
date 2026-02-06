#!/usr/bin/env node

/**
 * Fix timing for Project 172 by recalculating based on actual audio duration
 */

const BASE_URL = 'http://localhost:5000';

async function fixProject172Timing() {
  console.log('🔧 Fixing Project 172 timing based on actual audio duration...\n');
  
  try {
    const ACTUAL_AUDIO_DURATION = 151; // seconds (rounded from 150.912)
    const MIN_SCENE_DURATION = 3;
    const MAX_SCENE_DURATION = 20;
    
    // Get scenes
    const scenesResponse = await fetch(`${BASE_URL}/api/scenes/172`);
    const scenesData = await scenesResponse.json();
    const scenes = scenesData.scenes;
    
    console.log(`Found ${scenes.length} scenes for ${ACTUAL_AUDIO_DURATION}s audio file`);
    
    // Calculate content-aware timing distribution
    const contentWeights = scenes.map(scene => {
      const content = scene.scriptExcerpt || '';
      const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
      return Math.max(1, Math.sqrt(wordCount));
    });
    
    const totalWeight = contentWeights.reduce((sum, weight) => sum + weight, 0);
    
    // Calculate durations based on content weights
    let durations = contentWeights.map(weight => 
      (weight / totalWeight) * ACTUAL_AUDIO_DURATION
    );
    
    // Enforce min/max constraints
    let totalAdjustment = 0;
    for (let i = 0; i < durations.length; i++) {
      if (durations[i] < MIN_SCENE_DURATION) {
        const deficit = MIN_SCENE_DURATION - durations[i];
        durations[i] = MIN_SCENE_DURATION;
        totalAdjustment += deficit;
      } else if (durations[i] > MAX_SCENE_DURATION) {
        const excess = durations[i] - MAX_SCENE_DURATION;
        durations[i] = MAX_SCENE_DURATION;
        totalAdjustment -= excess;
      }
    }
    
    // Redistribute adjustment
    if (Math.abs(totalAdjustment) > 0.1) {
      const redistributeRate = totalAdjustment / ACTUAL_AUDIO_DURATION;
      durations = durations.map(duration => 
        Math.max(MIN_SCENE_DURATION, 
          Math.min(MAX_SCENE_DURATION, duration - (duration * redistributeRate)))
      );
    }
    
    // Final normalization
    const currentTotal = durations.reduce((sum, duration) => sum + duration, 0);
    const scaleFactor = ACTUAL_AUDIO_DURATION / currentTotal;
    durations = durations.map(duration => duration * scaleFactor);
    
    // Generate new timestamps
    let currentTime = 0;
    const newTimestamps = scenes.map((scene, index) => {
      const duration = durations[index];
      const startTime = Math.round(currentTime);
      const endTime = index === scenes.length - 1 
        ? ACTUAL_AUDIO_DURATION // Ensure last scene ends at actual duration
        : Math.round(currentTime + duration);
      
      currentTime += duration;
      
      return {
        sceneId: scene.id,
        sceneNumber: scene.sceneNumber,
        startTime,
        endTime,
        duration: endTime - startTime,
        contentLength: scene.scriptExcerpt?.length || 0
      };
    });
    
    console.log('\n📊 New Timing Distribution:');
    console.log('Scene | Content | Duration | Start-End');
    console.log('------|---------|----------|----------');
    
    newTimestamps.forEach(t => {
      console.log(`${t.sceneNumber.toString().padStart(5)} | ${t.contentLength.toString().padStart(7)} | ${t.duration.toString().padStart(8)}s | ${t.startTime}s-${t.endTime}s`);
    });
    
    const minDur = Math.min(...newTimestamps.map(t => t.duration));
    const maxDur = Math.max(...newTimestamps.map(t => t.duration));
    const avgDur = newTimestamps.reduce((sum, t) => sum + t.duration, 0) / newTimestamps.length;
    
    console.log(`\n📈 New Statistics:`);
    console.log(`   Min Duration: ${minDur}s`);
    console.log(`   Max Duration: ${maxDur}s`);
    console.log(`   Avg Duration: ${avgDur.toFixed(1)}s`);
    console.log(`   Total Duration: ${ACTUAL_AUDIO_DURATION}s`);
    console.log(`   Panel Frequency: ${(ACTUAL_AUDIO_DURATION / scenes.length).toFixed(1)}s per panel`);
    
    // Update each scene in the database
    console.log('\n🔄 Updating scene timestamps...');
    for (const timestamp of newTimestamps) {
      const updateResponse = await fetch(`${BASE_URL}/api/scenes/${timestamp.sceneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exactStartTime: timestamp.startTime,
          exactEndTime: timestamp.endTime
        })
      });
      
      if (updateResponse.ok) {
        console.log(`✓ Updated scene ${timestamp.sceneNumber}: ${timestamp.startTime}s-${timestamp.endTime}s`);
      } else {
        console.error(`✗ Failed to update scene ${timestamp.sceneNumber}`);
      }
    }
    
    console.log('\n✅ Project 172 timing fixed successfully!');
    console.log('The final scene should no longer be nearly a minute long.');
    
  } catch (error) {
    console.error('❌ Fix failed:', error.message);
  }
}

// Run the fix
fixProject172Timing();