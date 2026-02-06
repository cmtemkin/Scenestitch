import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from "openai";
import { Scene } from '@shared/schema';

// Create OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// The directory to store uploaded audio files
const AUDIO_DIR = path.join(process.cwd(), 'uploads', 'audio');

// Ensure the audio directory exists
async function ensureAudioDirExists() {
  try {
    await fs.access(AUDIO_DIR);
  } catch (error) {
    await fs.mkdir(AUDIO_DIR, { recursive: true });
  }
}

/**
 * Save an uploaded audio file to disk
 */
export async function saveAudioFile(buffer: Buffer, originalFilename: string): Promise<string> {
  await ensureAudioDirExists();
  
  const fileExtension = path.extname(originalFilename);
  const filename = `audio-${uuidv4()}${fileExtension}`;
  const filePath = path.join(AUDIO_DIR, filename);
  
  await fs.writeFile(filePath, buffer);
  
  return filePath;
}

/**
 * Analyze audio file and match it to the script text
 * This implementation uses OpenAI's Whisper API to transcribe the audio
 * and then matches the transcription to the script content
 */
export async function analyzeAudioForScenes(
  audioFilePath: string, 
  scenes: Scene[]
): Promise<Array<{ sceneId: number, startTime: number, endTime: number, recommendedMinPanels?: number }>> {
  try {
    // Get the full duration of the audio file
    const { getAudioDurationInSeconds } = await import('get-audio-duration');
    let totalAudioDuration: number;
    
    try {
      totalAudioDuration = await getAudioDurationInSeconds(audioFilePath);
      console.log(`Audio file total duration: ${totalAudioDuration.toFixed(3)} seconds`);
    } catch (err) {
      console.error("Error getting audio duration:", err);
      // Default to a reasonable duration if we can't read the file
      totalAudioDuration = scenes.length * 15; // Assume 15 seconds per scene as fallback
      console.log(`Using fallback audio duration: ${totalAudioDuration.toFixed(3)} seconds`);
    }
    
    // Calculate minimum panels needed based on 15-second maximum per panel
    const maxSecondsPerPanel = 15;
    const minimumPanelsNeeded = Math.ceil(totalAudioDuration / maxSecondsPerPanel);
    
    console.log(`Audio duration: ${totalAudioDuration}s, Current panels: ${scenes.length}, Recommended minimum: ${minimumPanelsNeeded}`);
    
    // If we have fewer scenes than the minimum needed, warn about this
    if (scenes.length < minimumPanelsNeeded) {
      console.warn(`⚠️  Audio is ${totalAudioDuration}s long but only ${scenes.length} panels exist. Recommend at least ${minimumPanelsNeeded} panels for optimal pacing (max 15s per panel).`);
    }
    
    // Step 1: Transcribe the audio file using Whisper
    console.log("Transcribing audio file...");
    const transcription = await transcribeAudio(audioFilePath);
    console.log("Transcription complete:", transcription);

    // Step 2: Extract script content from scenes
    const sceneTexts = scenes.map(scene => ({
      id: scene.id,
      text: scene.scriptExcerpt || ""
    }));

    // Step 3: Use OpenAI to analyze the transcription and match it to scene texts
    const systemPrompt = `
      You are an expert audio analyst. You will receive a full audio transcription and a list of script segments.
      Your task is to determine the precise timestamp (in seconds) where each script segment starts and ends in the audio.
      
      IMPORTANT REQUIREMENTS:
      - The audio file is exactly ${totalAudioDuration.toFixed(3)} seconds long.
      - Your timestamps MUST account for the ENTIRE duration.
      - The FIRST scene MUST start at 0.000 seconds.
      - The LAST scene MUST end at ${totalAudioDuration.toFixed(3)} seconds.
      - Ensure timestamps are CONSECUTIVE with no gaps or overlaps.
      - Each scene's end time must equal the next scene's start time.
      - The SUM of all segment durations MUST EQUAL ${totalAudioDuration.toFixed(3)} seconds exactly.
      
      Follow this step-by-step process:
      1. First analyze the audio transcription and match it to the script segments
      2. Determine approximate boundaries between segments
      3. Calculate the total duration of all segments and verify it equals ${totalAudioDuration.toFixed(3)} seconds
      4. Adjust timestamps as needed to ensure perfect continuity
      5. Double-check your work: verify first scene starts at 0, last scene ends at ${totalAudioDuration.toFixed(3)}, and all segments connect perfectly
      
      Return ONLY a JSON object with the following format:
      {
        "timestamps": [
          {
            "sceneId": [scene id as a number],
            "startTimeSec": [start time in seconds with 3 decimal places, e.g. 0.000, 7.350, etc.],
            "endTimeSec": [end time in seconds with 3 decimal places, e.g. 7.350, 12.825, etc.]
          },
          ... (one entry for each scene)
        ],
        "totalDuration": ${totalAudioDuration.toFixed(3)},
        "verification": "All segments account for the full ${totalAudioDuration.toFixed(3)} seconds of audio"
      }
      
      Be precise with the JSON formatting and ensure all timestamps have decimal precision to the millisecond.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-5.1", // Use the latest model 
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: [
            `Here is the full audio transcription:\n\n${transcription}\n\n`,
            `Here are the script segments to match (in order):\n\n${sceneTexts.map((s, idx) => 
              `ID: ${s.id}\nPosition: ${idx + 1} of ${sceneTexts.length}\nContent: "${s.text}"\n`
            ).join('\n')}`
          ].join('\n')
        }
      ],
      response_format: { type: "json_object" }, // Ensure response is properly formatted JSON
      temperature: 0.2 // Lower temperature for more precise timing calculations
    });

    console.log("OpenAI response received");
    
    // Step 4: Parse the response and create timestamp data
    const content = response.choices[0].message.content || '{"timestamps":[]}';
    const analysisResult = JSON.parse(content);
    
    console.log("Analysis result:", JSON.stringify(analysisResult, null, 2));
    
    if (!analysisResult.timestamps || !Array.isArray(analysisResult.timestamps) || analysisResult.timestamps.length === 0) {
      // As a fallback, if the AI doesn't provide valid data, use our estimated algorithm
      console.log("AI did not provide valid timestamp data, using estimated durations");
      return generateEstimatedTimestamps(scenes, totalAudioDuration);
    }
    
    try {
      // Validate and safely convert timestamps
      const timestamps = analysisResult.timestamps.map((item: any, index: number) => {
        // Make sure we have a valid scene ID
        let sceneId: number;
        try {
          sceneId = typeof item.sceneId === 'number' ? item.sceneId : parseInt(item.sceneId);
          if (isNaN(sceneId)) {
            throw new Error(`Invalid sceneId: ${item.sceneId}`);
          }
        } catch (e) {
          console.warn(`Invalid scene ID in timestamp data: ${item.sceneId}`);
          // Try to find a valid scene
          const scene = scenes.find(s => s.id);
          if (!scene) {
            throw new Error(`No valid scene found for timestamp data`);
          }
          sceneId = scene.id;
        }
        
        // Convert string times to numbers
        let startTimeSec = typeof item.startTimeSec === 'number' ? 
          item.startTimeSec : parseFloat(item.startTimeSec);
        let endTimeSec = typeof item.endTimeSec === 'number' ? 
          item.endTimeSec : parseFloat(item.endTimeSec);
        
        // Ensure valid values - handle any potential errors in the data
        if (isNaN(startTimeSec)) startTimeSec = index === 0 ? 0 : NaN;
        if (isNaN(endTimeSec)) endTimeSec = NaN;
          
        // Convert to milliseconds for storage
        return {
          sceneId,
          startTime: Math.round(startTimeSec * 1000),
          endTime: Math.round(endTimeSec * 1000)
        };
      });
      
      // Verify and fix timestamps if needed
      let verifiedTimestamps = [...timestamps];
      
      // Step 1: Check if first scene starts at 0
      if (verifiedTimestamps.length > 0 && verifiedTimestamps[0].startTime !== 0) {
        console.log("Fixing first scene start time to 0");
        verifiedTimestamps[0].startTime = 0;
      }
      
      // Step 2: Check if last scene ends at total duration
      const expectedEndTime = Math.round(totalAudioDuration * 1000);
      if (verifiedTimestamps.length > 0 && 
          verifiedTimestamps[verifiedTimestamps.length - 1].endTime !== expectedEndTime) {
        console.log(`Fixing last scene end time to match audio duration: ${expectedEndTime}ms`);
        verifiedTimestamps[verifiedTimestamps.length - 1].endTime = expectedEndTime;
      }
      
      // Step 3: Fix any gaps or overlaps between scenes
      for (let i = 0; i < verifiedTimestamps.length - 1; i++) {
        const currentScene = verifiedTimestamps[i];
        const nextScene = verifiedTimestamps[i + 1];
        
        if (currentScene.endTime !== nextScene.startTime) {
          console.log(`Fixing gap/overlap between scenes ${i} and ${i+1}`);
          
          // Calculate the midpoint between the end of current and start of next
          const midpoint = Math.round((currentScene.endTime + nextScene.startTime) / 2);
          
          // Set end of current and start of next to this midpoint
          currentScene.endTime = midpoint;
          nextScene.startTime = midpoint;
        }
      }
      
      // Step 4: Verify all scenes have valid start/end times
      verifiedTimestamps = verifiedTimestamps.filter(t => {
        if (isNaN(t.startTime) || isNaN(t.endTime) || t.startTime >= t.endTime) {
          console.warn(`Removing invalid timestamp for scene ${t.sceneId}: start=${t.startTime}, end=${t.endTime}`);
          return false;
        }
        return true;
      });
      
      // Step 5: Fill in any missing scenes
      const missingScenes = scenes.filter(scene => 
        !verifiedTimestamps.some(t => t.sceneId === scene.id)
      );
      
      if (missingScenes.length > 0) {
        console.log(`Missing timestamps for ${missingScenes.length} scenes, adding estimates`);
        
        // Generate timestamps for missing scenes by appending them to the end
        // or inserting them at appropriate positions if we can determine them
        
        if (verifiedTimestamps.length === 0) {
          // If we have no valid timestamps, generate them from scratch
          console.log("No valid timestamps, generating from scratch");
          return generateEstimatedTimestamps(scenes, totalAudioDuration);
        }
        
        // Get the last valid timestamp
        const lastTimestamp = verifiedTimestamps.reduce((latest, curr) => 
          curr.endTime > latest ? curr.endTime : latest, 0);
          
        // If we've already reached the total duration, we need to make space
        // by proportionally reducing the duration of verified timestamps
        if (lastTimestamp >= expectedEndTime && verifiedTimestamps.length > 0) {
          console.log("Need to make space for missing scenes");
          
          // Calculate how much space we need for missing scenes
          // Allocate 5 seconds per missing scene (or less if that's too much)
          const spaceNeeded = Math.min(
            missingScenes.length * 5000, 
            expectedEndTime * 0.2 // Don't take more than 20% of total time
          );
          
          // Calculate scaling factor to compress existing scenes
          const scaleFactor = (expectedEndTime - spaceNeeded) / expectedEndTime;
          
          // Scale all verified timestamps
          let currentTime = 0;
          verifiedTimestamps = verifiedTimestamps.map(t => {
            const originalDuration = t.endTime - t.startTime;
            const scaledDuration = Math.round(originalDuration * scaleFactor);
            
            const newTimestamp = {
              sceneId: t.sceneId,
              startTime: currentTime,
              endTime: currentTime + scaledDuration
            };
            
            currentTime += scaledDuration;
            return newTimestamp;
          });
          
          // Now we have space at the end for missing scenes
          let currentStart = currentTime;
          const remainingTime = expectedEndTime - currentStart;
          const durationPerScene = Math.floor(remainingTime / missingScenes.length);
          
          missingScenes.forEach((scene, index) => {
            const isLastMissing = index === missingScenes.length - 1;
            const endTime = isLastMissing 
              ? expectedEndTime 
              : currentStart + durationPerScene;
              
            verifiedTimestamps.push({
              sceneId: scene.id,
              startTime: currentStart,
              endTime: endTime
            });
            
            currentStart = endTime;
          });
        } else {
          // We have space after the last timestamp, just add the missing scenes
          let currentTime = lastTimestamp;
          const remainingTime = expectedEndTime - currentTime;
          const durationPerScene = Math.floor(remainingTime / missingScenes.length);
          
          missingScenes.forEach((scene, index) => {
            const isLastMissing = index === missingScenes.length - 1;
            const endTime = isLastMissing 
              ? expectedEndTime 
              : currentTime + durationPerScene;
              
            verifiedTimestamps.push({
              sceneId: scene.id,
              startTime: currentTime,
              endTime: endTime
            });
            
            currentTime = endTime;
          });
        }
      }
      
      // Step 6: Sort timestamps by start time
      verifiedTimestamps.sort((a, b) => a.startTime - b.startTime);
      
      // Step 7: Final validation - ensure we cover the full duration
      if (verifiedTimestamps.length > 0) {
        if (verifiedTimestamps[0].startTime !== 0) {
          verifiedTimestamps[0].startTime = 0;
        }
        
        if (verifiedTimestamps[verifiedTimestamps.length - 1].endTime !== expectedEndTime) {
          verifiedTimestamps[verifiedTimestamps.length - 1].endTime = expectedEndTime;
        }
      }
      
      // Log duration sum for verification
      const durationSum = verifiedTimestamps.reduce((sum, timestamp) => 
        sum + (timestamp.endTime - timestamp.startTime), 0);
      
      console.log(`Total duration of all segments: ${durationSum}ms (expected: ${expectedEndTime}ms)`);
      console.log(`Difference: ${durationSum - expectedEndTime}ms`);
      
      if (Math.abs(durationSum - expectedEndTime) > 5) {
        console.warn("Warning: Total duration doesn't match expected audio length");
      }
      
      console.log("Final verified timestamps:", verifiedTimestamps);
      return verifiedTimestamps;
    } catch (error) {
      console.error("Error processing timestamps:", error);
      return generateEstimatedTimestamps(scenes, totalAudioDuration);
    }
    
  } catch (error) {
    console.error("Error analyzing audio with AI:", error);
    console.log("Falling back to estimated durations");
    
    // Fallback to estimated durations if AI analysis fails
    return generateEstimatedTimestamps(scenes);
  }
}

/**
 * Generate timestamps based on estimated scene durations
 * Used as a fallback when AI analysis is not available
 * 
 * @param scenes The list of scenes to generate timestamps for
 * @param knownAudioDuration Optional total audio duration in seconds, if known
 */
function generateEstimatedTimestamps(
  scenes: Scene[], 
  knownAudioDuration?: number
): Promise<Array<{ sceneId: number, startTime: number, endTime: number }>> {
  // Get total estimated duration or calculate based on scene count
  let totalEstimatedDuration = 0;
  
  if (knownAudioDuration && knownAudioDuration > 0) {
    // Use the known audio duration if provided
    totalEstimatedDuration = knownAudioDuration;
    console.log(`Using known audio duration: ${totalEstimatedDuration.toFixed(3)} seconds`);
  } else {
    // Check if we have estimated durations
    const hasEstimatedDurations = scenes.some(scene => 
      scene.estimatedDuration !== undefined && 
      scene.estimatedDuration !== null &&
      scene.estimatedDuration > 0
    );
    
    if (hasEstimatedDurations) {
      // Use the sum of all estimated durations
      totalEstimatedDuration = scenes.reduce((sum, scene) => 
        sum + (scene.estimatedDuration || 5), 0
      );
      console.log(`Using sum of scene durations: ${totalEstimatedDuration.toFixed(3)} seconds`);
    } else {
      // Default to 3 minutes total if no durations available
      totalEstimatedDuration = 180; // 3 minutes in seconds
      console.log(`Using default duration: ${totalEstimatedDuration.toFixed(3)} seconds`);
    }
  }
  
  // Convert to milliseconds
  const totalDurationMs = totalEstimatedDuration * 1000;
  
  // Calculate the relative weight of each scene if we have estimated durations
  const hasEstimatedDurations = scenes.some(scene => 
    scene.estimatedDuration !== undefined && 
    scene.estimatedDuration !== null &&
    (scene.estimatedDuration as number) > 0
  );
  
  let weights: number[] = [];
  
  if (hasEstimatedDurations) {
    // Calculate relative weights based on estimated durations
    const totalWeight = scenes.reduce((sum, scene) => 
      sum + (scene.estimatedDuration || 1), 0
    );
    
    weights = scenes.map(scene => 
      (scene.estimatedDuration || 1) / totalWeight
    );
  } else {
    // Equal weights if no estimated durations
    const equalWeight = 1 / scenes.length;
    weights = Array(scenes.length).fill(equalWeight);
  }
  
  // Distribute the total duration according to weights
  let currentTime = 0;
  const timestamps = scenes.map((scene, index) => {
    // Calculate this scene's duration
    const sceneWeight = weights[index];
    const sceneDuration = Math.round(totalDurationMs * sceneWeight);
    
    const startTime = currentTime;
    const endTime = index === scenes.length - 1 
      ? totalDurationMs  // Make sure last scene ends exactly at total duration
      : currentTime + sceneDuration;
    
    // Update the time tracker for the next scene
    currentTime = endTime;
    
    return {
      sceneId: scene.id,
      startTime: Math.round(startTime),
      endTime: Math.round(endTime),
    };
  });
  
  // Verify that the total duration matches exactly
  if (timestamps.length > 0) {
    const lastTimestamp = timestamps[timestamps.length - 1];
    if (lastTimestamp.endTime !== totalDurationMs) {
      console.log(`Adjusting last timestamp end time from ${lastTimestamp.endTime}ms to ${totalDurationMs}ms`);
      lastTimestamp.endTime = totalDurationMs;
    }
  }
  
  // Log sum of durations for verification
  const durationSum = timestamps.reduce((sum, timestamp) => 
    sum + (timestamp.endTime - timestamp.startTime), 0);
  
  console.log(`Generated ${timestamps.length} estimated timestamps`);
  console.log(`Total duration of all segments: ${durationSum}ms (expected: ${totalDurationMs}ms)`);
  console.log(`Difference: ${durationSum - totalDurationMs}ms`);
  
  return Promise.resolve(timestamps);
}

/**
 * Analyze audio using OpenAI's Whisper API to transcribe speech to text
 */
export async function transcribeAudio(audioFilePath: string): Promise<string> {
  try {
    console.log(`Transcribing audio file at: ${audioFilePath}`);
    
    // Check if file exists
    if (!fsSync.existsSync(audioFilePath)) {
      throw new Error(`Audio file not found at path: ${audioFilePath}`);
    }
    
    // Create read stream for the audio file
    const audioStream = fsSync.createReadStream(audioFilePath);
    
    // Use OpenAI's Whisper API to transcribe the audio
    const transcription = await openai.audio.transcriptions.create({
      file: audioStream,
      model: "whisper-1",
      language: "en", // Specify English for better results
    });
    
    console.log("Transcription completed successfully");
    
    // In case we get no text back, return empty string rather than null
    return transcription.text || "";
  } catch (error) {
    console.error('Error transcribing audio:', error);
    
    // More detailed error message to help with debugging
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      if ('stack' in error) {
        console.error('Stack trace:', error.stack);
      }
    }
    
    throw new Error('Failed to transcribe audio file: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}