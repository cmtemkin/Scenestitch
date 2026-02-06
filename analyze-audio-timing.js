#!/usr/bin/env node

/**
 * Deep analysis of Project 172 audio timing issue
 */

const BASE_URL = 'http://localhost:5000';

async function analyzeAudioTiming() {
  console.log('🔍 Deep analysis of Project 172 audio timing...\n');
  
  try {
    // Get all scenes for Project 172
    const scenesResponse = await fetch(`${BASE_URL}/api/scenes/172`);
    const scenesData = await scenesResponse.json();
    const scenes = scenesData.scenes;
    
    console.log('📝 All Scene Content and Timing:');
    console.log('='.repeat(60));
    
    scenes.forEach(scene => {
      const duration = scene.exactEndTime - scene.exactStartTime;
      console.log(`Scene ${scene.sceneNumber}: ${scene.exactStartTime}s - ${scene.exactEndTime}s (${duration}s)`);
      console.log(`Content: "${scene.scriptExcerpt}"`);
      console.log(`Characters: ${scene.scriptExcerpt?.length || 0}`);
      console.log('-'.repeat(40));
    });
    
    // Find the problematic scene
    const problemScene = scenes.find(scene => 
      scene.scriptExcerpt && scene.scriptExcerpt.includes("But as time went on")
    );
    
    if (problemScene) {
      console.log('\n🚨 FOUND PROBLEM SCENE:');
      console.log(`Scene ${problemScene.sceneNumber}: "${problemScene.scriptExcerpt}"`);
      console.log(`Database timing: ${problemScene.exactStartTime}s - ${problemScene.exactEndTime}s`);
      console.log(`Database duration: ${problemScene.exactEndTime - problemScene.exactStartTime}s`);
      console.log('');
      console.log('🎵 USER REPORTS:');
      console.log('- "But as time went on" occurs at around 1:20 (80s) in audio');
      console.log('- Total audio file is 2:30 (150s)');
      console.log('- Final frame is about 70 seconds long');
      console.log('');
      console.log('📊 ANALYSIS:');
      console.log(`- Database says scene starts at: ${problemScene.exactStartTime}s`);
      console.log(`- User says it actually starts at: ~80s`);
      console.log(`- Timing error: ${Math.abs(problemScene.exactStartTime - 80)}s difference`);
      
      if (problemScene.exactStartTime < 80) {
        console.log('- Problem: Database timing is too early - scenes are compressed');
      } else {
        console.log('- Problem: Database timing is too late - scenes are stretched');
      }
    }
    
    // Check if we're missing scenes or have incorrect content analysis
    const totalDatabaseTime = Math.max(...scenes.map(s => s.exactEndTime));
    console.log(`\n🔢 TIMING SUMMARY:`);
    console.log(`- Database total duration: ${totalDatabaseTime}s`);
    console.log(`- Actual audio duration: ~150s`);
    console.log(`- Scene count: ${scenes.length}`);
    console.log(`- Average scene duration: ${(totalDatabaseTime / scenes.length).toFixed(1)}s`);
    
    if (totalDatabaseTime < 150) {
      console.log(`\n⚠️  MISMATCH: Database shows ${totalDatabaseTime}s but audio is ~150s`);
      console.log('   This suggests the timing calculation is fundamentally wrong.');
    }
    
    // Check content analysis
    const fullScript = scenes.map(s => s.scriptExcerpt).join(' ');
    console.log(`\n📖 CONTENT CHECK:`);
    console.log(`- Total script characters: ${fullScript.length}`);
    console.log(`- Contains "But as time went on": ${fullScript.includes("But as time went on")}`);
    
    if (!fullScript.includes("But as time went on")) {
      console.log('🚨 CRITICAL: Scene content may be incomplete or incorrectly parsed!');
    }
    
  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
  }
}

// Run the analysis
analyzeAudioTiming();