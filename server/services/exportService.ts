import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import archiver from "archiver";
import { Scene, Script } from "@shared/schema";
import fetch from "node-fetch";
import { storage } from "../storage";
import { objectStorage } from "../objectStorage";

/**
 * Format seconds into SRT time format (HH:MM:SS,mmm)
 */
function formatSrtTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.round((seconds % 1) * 1000);
  
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

/**
 * Format seconds into video editing friendly time format (HH:MM:SS.X)
 */
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const tenthSeconds = Math.round((seconds % 1) * 10); 
  
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenthSeconds}`;
  } else {
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenthSeconds}`;
  }
}

/**
 * Format seconds into iMovie-specific time format
 */
function formatIMovieTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const tenthSeconds = Math.round((seconds % 1) * 10);
  
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenthSeconds}`;
  } else {
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenthSeconds}`;
  }
}

/**
 * Process a single scene image with production-safe memory management
 */
async function processSceneImage(scene: any, imagesDir: string): Promise<void> {
  if (!scene.imageUrl) {
    console.log(`Scene ${scene.sceneNumber} has no image URL`);
    return;
  }

  try {
    if (scene.imageUrl.startsWith('/api/scene-image/')) {
      console.log(`Processing scene image endpoint for scene ${scene.sceneNumber}`);
      
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : 'http://localhost:5000';
      
      const response = await fetch(`${baseUrl}${scene.imageUrl}`);
      
      if (response.ok) {
        const imageData = await response.json() as { imageUrl?: string; sceneId?: number; title?: string };
        if (imageData.imageUrl && imageData.imageUrl.startsWith('data:image/')) {
          const matches = imageData.imageUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const imageType = matches[1];
            const base64Data = matches[2];
            
            // Memory management for large images
            const estimatedSize = (base64Data.length * 3) / 4;
            if (estimatedSize > 50 * 1024 * 1024) {
              console.warn(`Large image detected for scene ${scene.sceneNumber}: ~${(estimatedSize / 1024 / 1024).toFixed(2)}MB`);
            }
            
            const buffer = Buffer.from(base64Data, 'base64');
            const extension = imageType === 'jpeg' || imageType === 'jpg' ? 'jpg' : 
                             imageType === 'png' ? 'png' : 'jpg';
            const outputPath = path.join(imagesDir, `scene_${scene.sceneNumber}.${extension}`);
            fs.writeFileSync(outputPath, buffer);
            console.log(`Saved image to ${outputPath} (${(buffer.length / 1024 / 1024).toFixed(2)}MB)`);
            scene.imageUrl = `scene_${scene.sceneNumber}.${extension}`;
          }
        }
      } else {
        console.error(`Failed to fetch scene image: ${response.status}`);
      }
    }
    else if (scene.imageUrl.startsWith('http')) {
      console.log(`Processing HTTP URL for scene ${scene.sceneNumber}`);
      const response = await fetch(scene.imageUrl);
      const buffer = await response.buffer();
      
      const sizeInMB = buffer.length / (1024 * 1024);
      if (sizeInMB > 50) {
        console.warn(`Large remote image for scene ${scene.sceneNumber}: ${sizeInMB.toFixed(2)}MB`);
      }
      
      const outputPath = path.join(imagesDir, `scene_${scene.sceneNumber}.jpg`);
      fs.writeFileSync(outputPath, buffer);
      console.log(`Saved remote image to ${outputPath} (${sizeInMB.toFixed(2)}MB)`);
      scene.imageUrl = `scene_${scene.sceneNumber}.jpg`;
    } 
    else if (scene.imageUrl.startsWith('/storage/')) {
      console.log(`Processing object storage file for scene ${scene.sceneNumber}`);
      try {
        // Extract the object path from /storage/path/to/file.png
        const objectPath = scene.imageUrl.replace('/storage/', '');
        const buffer = await objectStorage.downloadToBuffer(objectPath);
        
        const sizeInMB = buffer.length / (1024 * 1024);
        console.log(`Downloaded ${sizeInMB.toFixed(2)}MB from object storage for scene ${scene.sceneNumber}`);
        
        // Determine extension from path
        const ext = objectPath.split('.').pop()?.toLowerCase() || 'png';
        const extension = ext === 'jpeg' || ext === 'jpg' ? 'jpg' : ext === 'png' ? 'png' : 'jpg';
        const outputPath = path.join(imagesDir, `scene_${scene.sceneNumber}.${extension}`);
        fs.writeFileSync(outputPath, buffer);
        console.log(`Saved object storage image to ${outputPath}`);
        scene.imageUrl = `scene_${scene.sceneNumber}.${extension}`;
      } catch (error) {
        console.error(`Failed to download from object storage for scene ${scene.sceneNumber}:`, error);
      }
    } 
    else if (scene.imageUrl.startsWith('/uploads/')) {
      console.log(`Processing local file for scene ${scene.sceneNumber}`);
      const localPath = path.join(process.cwd(), scene.imageUrl);
      if (fs.existsSync(localPath)) {
        const outputPath = path.join(imagesDir, `scene_${scene.sceneNumber}.jpg`);
        fs.copyFileSync(localPath, outputPath);
        console.log(`Copied local image to ${outputPath}`);
        scene.imageUrl = `scene_${scene.sceneNumber}.jpg`;
      } else {
        console.error(`Local file not found: ${localPath}`);
      }
    } 
    else if (scene.imageUrl.startsWith('data:')) {
      console.log(`Processing data URL for scene ${scene.sceneNumber}`);
      const matches = scene.imageUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const imageType = matches[1];
        const base64Data = matches[2];
        
        const estimatedSize = (base64Data.length * 3) / 4;
        if (estimatedSize > 50 * 1024 * 1024) {
          console.warn(`Large base64 image for scene ${scene.sceneNumber}: ~${(estimatedSize / 1024 / 1024).toFixed(2)}MB`);
        }
        
        const buffer = Buffer.from(base64Data, 'base64');
        const extension = imageType === 'jpeg' || imageType === 'jpg' ? 'jpg' : 
                         imageType === 'png' ? 'png' : 'jpg';
        const outputPath = path.join(imagesDir, `scene_${scene.sceneNumber}.${extension}`);
        fs.writeFileSync(outputPath, buffer);
        console.log(`Saved base64 image to ${outputPath} (${(buffer.length / 1024 / 1024).toFixed(2)}MB)`);
        scene.imageUrl = `scene_${scene.sceneNumber}.${extension}`;
      }
    } else {
      console.error(`Unsupported image URL format for scene ${scene.sceneNumber}: ${scene.imageUrl.substring(0, 30)}...`);
    }
  } catch (error) {
    console.error(`Failed to process image for scene ${scene.sceneNumber}:`, error);
  }
}

export async function exportProjectAssets(scriptId: number): Promise<string> {
  try {
    console.log(`[EXPORT] Starting export for script ID ${scriptId}`);
    console.log(`[EXPORT] Environment: ${process.env.NODE_ENV}, Platform: ${process.platform}`);
    
    const script = await storage.getScript(scriptId);
    if (!script) {
      throw new Error(`Script with ID ${scriptId} not found`);
    }
    console.log(`[EXPORT] Found script: ${script.title}`);

    const scenes = await storage.getScenesByScriptId(scriptId);
    if (!scenes || scenes.length === 0) {
      throw new Error(`No scenes found for script ID ${scriptId}`);
    }
    console.log(`[EXPORT] Found ${scenes.length} scenes`);

  // Create temporary directory structure
  const tempDir = path.join(process.cwd(), "temp");
  const exportId = uuidv4();
  const exportDir = path.join(tempDir, exportId);
  const imagesDir = path.join(exportDir, "images");
  const videosDir = path.join(exportDir, "videos");
  const dataDir = path.join(exportDir, "data");
  const audioDir = path.join(exportDir, "audio");
  const thumbnailsDir = path.join(exportDir, "thumbnails");

  // Ensure directories exist
  [tempDir, exportDir, imagesDir, videosDir, dataDir, audioDir, thumbnailsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Process images with production-safe batching
  console.log(`Processing ${scenes.length} scenes for export`);
  const BATCH_SIZE = 3; // Process 3 images at a time to prevent memory overflow
  const IMAGE_TIMEOUT = 25000; // 25 second timeout per image
  
  for (let i = 0; i < scenes.length; i += BATCH_SIZE) {
    const batch = scenes.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(scenes.length / BATCH_SIZE);
    
    console.log(`Processing image batch ${batchNumber}/${totalBatches} (scenes ${i + 1}-${Math.min(i + BATCH_SIZE, scenes.length)})`);
    
    // Process batch with timeout protection
    await Promise.all(batch.map(async (scene) => {
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error(`Image processing timeout for scene ${scene.sceneNumber}`)), IMAGE_TIMEOUT);
      });
      
      try {
        await Promise.race([processSceneImage(scene, imagesDir), timeoutPromise]);
      } catch (error) {
        console.error(`Scene ${scene.sceneNumber} processing failed:`, error);
      }
    }));
    
    // Force garbage collection between batches if available
    if (global.gc) {
      global.gc();
    }
    
    // Small delay between batches to prevent overwhelming the system
    if (i + BATCH_SIZE < scenes.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Process videos - copy Sora-generated videos to export
  console.log("Processing videos for export...");
  const scenesWithVideos = scenes.filter(scene => scene.videoUrl);
  console.log(`Found ${scenesWithVideos.length} scenes with videos`);
  
  for (const scene of scenesWithVideos) {
    try {
      const videoFilename = `scene_${scene.sceneNumber}_video.mp4`;
      const outputPath = path.join(videosDir, videoFilename);
      
      if (scene.videoUrl && scene.videoUrl.startsWith('/storage/')) {
        // Handle object storage videos
        const objectPath = scene.videoUrl.replace('/storage/', '');
        const buffer = await objectStorage.downloadToBuffer(objectPath);
        fs.writeFileSync(outputPath, buffer);
        console.log(`Downloaded video from object storage for scene ${scene.sceneNumber}: ${videoFilename}`);
        (scene as any).exportedVideoFilename = videoFilename;
      } else if (scene.videoUrl && scene.videoUrl.startsWith('/uploads/videos/')) {
        const videoPath = path.join(process.cwd(), scene.videoUrl);
        if (fs.existsSync(videoPath)) {
          fs.copyFileSync(videoPath, outputPath);
          console.log(`Copied video for scene ${scene.sceneNumber}: ${videoFilename}`);
          (scene as any).exportedVideoFilename = videoFilename;
        } else {
          console.log(`Video file not found for scene ${scene.sceneNumber}: ${videoPath}`);
        }
      }
    } catch (videoError) {
      console.error(`Failed to process video for scene ${scene.sceneNumber}:`, videoError);
    }
  }

  // Create metadata files
  const sceneData = scenes.map(scene => ({
    sceneNumber: scene.sceneNumber,
    title: scene.title,
    scriptExcerpt: scene.scriptExcerpt,
    dallePrompt: scene.dallePrompt,
    soraPrompt: scene.soraPrompt,
    soraClipLength: (scene as any).soraClipLength || null, // Sora clip length: 4, 8, or 12 seconds
    estimatedDuration: scene.estimatedDuration,
    exactStartTime: scene.exactStartTime,
    exactEndTime: scene.exactEndTime,
    imageFilename: scene.imageUrl && typeof scene.imageUrl === 'string' && 
      !scene.imageUrl.startsWith('data:') && !scene.imageUrl.startsWith('http') ? 
      scene.imageUrl : 
      scene.imageUrl ? `scene_${scene.sceneNumber}.jpg` : "",
    videoFilename: (scene as any).exportedVideoFilename || null // Sora-generated video filename
  }));
  
  fs.writeFileSync(
    path.join(dataDir, "scenes.json"),
    JSON.stringify(sceneData, null, 2)
  );
  
  // Create CSV with proper formatting
  const hasAudioTimestamps = scenes.some(scene => scene.exactStartTime !== null || scene.exactEndTime !== null);
  const hasSoraClipLengths = scenes.some(scene => (scene as any).soraClipLength);
  const hasVideos = scenes.some(scene => (scene as any).exportedVideoFilename);
  
  // Build header dynamically based on available data
  let csvHeader = "SceneNumber,Title,FormattedDuration";
  if (hasAudioTimestamps) {
    csvHeader += ",ExactStartTime,ExactEndTime";
  }
  if (hasSoraClipLengths) {
    csvHeader += ",SoraClipLength"; // Sora API clip duration (4, 8, or 12 seconds)
  }
  csvHeader += ",ScriptText,ImageFilename";
  if (hasVideos) {
    csvHeader += ",VideoFilename"; // Sora-generated video filename
  }
    
  const csvRows = scenes.map(scene => {
    const imageFilename = scene.imageUrl && typeof scene.imageUrl === 'string' && 
      !scene.imageUrl.startsWith('data:') && !scene.imageUrl.startsWith('http') ? 
      scene.imageUrl : 
      scene.imageUrl ? `scene_${scene.sceneNumber}.jpg` : "";
      
    let durationFormatted = '';
    let exactStartFormatted = '';
    let exactEndFormatted = '';
    
    if (scene.exactStartTime !== null && scene.exactEndTime !== null) {
      const startSec = (scene.exactStartTime as number) / 1000;
      const endSec = (scene.exactEndTime as number) / 1000;
      const durationSec = endSec - startSec;
      
      durationFormatted = formatTime(durationSec);
      exactStartFormatted = formatIMovieTime(startSec);
      exactEndFormatted = formatIMovieTime(endSec);
    } else if (scene.estimatedDuration) {
      const durationSec = scene.estimatedDuration;
      durationFormatted = formatTime(durationSec);
      
      const prevScenes = scenes.filter(s => s.sceneNumber < scene.sceneNumber);
      const startSec = prevScenes.reduce((total, s) => total + (s.estimatedDuration || 5), 0);
      const endSec = startSec + durationSec;
      
      exactStartFormatted = formatIMovieTime(startSec);
      exactEndFormatted = formatIMovieTime(endSec);
    }
    
    const safeScriptText = scene.scriptExcerpt ? scene.scriptExcerpt.replace(/"/g, '""') : '';
    const safeTitle = scene.title ? scene.title.replace(/"/g, '""') : '';
    const soraClipLength = (scene as any).soraClipLength || '';
    
    // Build row dynamically based on available data
    let row = `${scene.sceneNumber},"${safeTitle}","${durationFormatted}"`;
    if (hasAudioTimestamps) {
      row += `,"${exactStartFormatted}","${exactEndFormatted}"`;
    }
    if (hasSoraClipLengths) {
      row += `,"${soraClipLength}"`;
    }
    row += `,"${safeScriptText}","${imageFilename}"`;
    if (hasVideos) {
      const videoFilename = (scene as any).exportedVideoFilename || '';
      row += `,"${videoFilename}"`;
    }
    
    return row;
  });
  
  fs.writeFileSync(
    path.join(dataDir, "scenes.csv"),
    [csvHeader, ...csvRows].join("\n")
  );

  // Create other data files
  const soraPrompts = scenes
    .filter(scene => scene.soraPrompt)
    .map(scene => `SCENE ${scene.sceneNumber}: ${scene.title}\n\n${scene.soraPrompt}\n\n---\n`);
  
  fs.writeFileSync(
    path.join(dataDir, "sora_prompts.txt"),
    soraPrompts.join("\n")
  );

  // Process audio files with fallback logic
  console.log("Processing audio files for export...");
  try {
    let audioFileCopied = false;
    
    // First, try the direct audio file path from script
    if (script.audioFilePath) {
      // Handle both absolute and relative paths
      const audioPath = script.audioFilePath.startsWith('/') 
        ? path.join(process.cwd(), script.audioFilePath.substring(1))
        : path.join(process.cwd(), script.audioFilePath);
        
      console.log(`Looking for script audio file at: ${audioPath}`);
      if (fs.existsSync(audioPath)) {
        const audioOutputPath = path.join(audioDir, `${script.title}.mp3`);
        fs.copyFileSync(audioPath, audioOutputPath);
        console.log(`Copied script audio file to ${audioOutputPath}`);
        audioFileCopied = true;
      } else {
        console.log(`Script audio file not found at ${audioPath}`);
      }
    }
    
    // If no audio file was found and script has TTS ID, look for TTS audio
    if (!audioFileCopied && script.audioTTSId) {
      try {
        const ttsAudio = await storage.getAudioTTS(script.audioTTSId);
        if (ttsAudio && ttsAudio.audioUrl) {
          const ttsPath = path.join(process.cwd(), ttsAudio.audioUrl);
          if (fs.existsSync(ttsPath)) {
            const audioOutputPath = path.join(audioDir, `${script.title}_tts.mp3`);
            fs.copyFileSync(ttsPath, audioOutputPath);
            console.log(`Copied TTS audio file to ${audioOutputPath}`);
            audioFileCopied = true;
          } else {
            console.log(`TTS audio file not found at ${ttsPath}`);
          }
        }
      } catch (ttsError) {
        console.log("Could not retrieve TTS audio from database, trying direct file search:", ttsError);
      }
    }
    
    // If still no audio file copied, attempt audio recovery
    if (!audioFileCopied) {
      console.log(`No audio file found for project ${script.id}, attempting audio recovery...`);
      try {
        const { validateAndRecoverAudio } = await import("./audioRecoveryService");
        const recoveryResult = await validateAndRecoverAudio(script.id);
        
        if (recoveryResult.audioExists && recoveryResult.audioUrl) {
          const recoveredAudioPath = path.join(process.cwd(), recoveryResult.audioUrl.replace(/^\//, ''));
          if (fs.existsSync(recoveredAudioPath)) {
            const audioOutputPath = path.join(audioDir, `${script.title}_recovered.mp3`);
            fs.copyFileSync(recoveredAudioPath, audioOutputPath);
            console.log(`Successfully recovered and copied audio file: ${audioOutputPath}`);
            audioFileCopied = true;
            
            if (recoveryResult.regenerated) {
              console.log(`Audio file was regenerated during recovery process`);
            }
          }
        } else {
          console.log(`Audio recovery failed: ${recoveryResult.error}`);
        }
      } catch (recoveryError) {
        console.error("Audio recovery attempt failed:", recoveryError);
      }
    }
    
    // Final fallback - export without audio if all recovery attempts failed
    if (!audioFileCopied) {
      console.log(`WARNING: Project ${script.id} (${script.title}) has missing audio file - exporting without audio`);
      console.log(`Expected audio at: ${script.audioFilePath}`);
      // Continue export without audio file
    }
  } catch (audioError) {
    console.error("Error processing audio files for export:", audioError);
    throw audioError; // Re-throw to fail export properly
  }

  // Process thumbnails
  console.log("Processing thumbnails for export...");
  if (script.thumbnailUrl) {
    try {
      let thumbnailFileName = "project_thumbnail.png";
      
      if (script.thumbnailUrl.startsWith('/storage/')) {
        // Handle object storage thumbnails
        const objectPath = script.thumbnailUrl.replace('/storage/', '');
        const buffer = await objectStorage.downloadToBuffer(objectPath);
        const thumbnailPath = path.join(thumbnailsDir, thumbnailFileName);
        fs.writeFileSync(thumbnailPath, buffer);
        console.log(`Downloaded thumbnail from object storage to ${thumbnailPath}`);
      } else if (script.thumbnailUrl.startsWith('/uploads/')) {
        const thumbnailPath = path.join(process.cwd(), script.thumbnailUrl);
        if (fs.existsSync(thumbnailPath)) {
          const outputPath = path.join(thumbnailsDir, path.basename(script.thumbnailUrl));
          fs.copyFileSync(thumbnailPath, outputPath);
          console.log(`Copied thumbnail to ${outputPath}`);
        }
      } else if (script.thumbnailUrl.startsWith('http')) {
        const response = await fetch(script.thumbnailUrl);
        const buffer = await response.buffer();
        const thumbnailPath = path.join(thumbnailsDir, thumbnailFileName);
        fs.writeFileSync(thumbnailPath, buffer);
        console.log(`Downloaded thumbnail to ${thumbnailPath}`);
      } else if (script.thumbnailUrl.startsWith('data:')) {
        const base64Data = script.thumbnailUrl.split('base64,')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const thumbnailPath = path.join(thumbnailsDir, thumbnailFileName);
        fs.writeFileSync(thumbnailPath, buffer);
        console.log(`Saved base64 thumbnail to ${thumbnailPath}`);
      }
    } catch (thumbnailError) {
      console.error("Error processing thumbnail:", thumbnailError);
    }
  }
  
  // Create SRT file
  const hasExactTimestamps = scenes.some(scene => 
    scene.exactStartTime !== null && scene.exactEndTime !== null
  );

  const srtContent = scenes
    .filter(scene => {
      if (hasExactTimestamps) {
        return scene.exactStartTime !== null && scene.exactEndTime !== null;
      } else {
        return scene.estimatedDuration !== null && scene.estimatedDuration !== undefined;
      }
    })
    .map((scene, index) => {
      let startTimeSec: number;
      let endTimeSec: number;
      
      if (hasExactTimestamps && scene.exactStartTime !== null && scene.exactEndTime !== null) {
        startTimeSec = (scene.exactStartTime as number) / 1000;
        endTimeSec = (scene.exactEndTime as number) / 1000;
      } else {
        const prevScenes = scenes.filter(s => s.sceneNumber < scene.sceneNumber);
        const prevScenesDuration = prevScenes.reduce((total, s) => {
          return total + (s.estimatedDuration || 5);
        }, 0);
        
        const durationSec = scene.estimatedDuration || 5;
        startTimeSec = prevScenesDuration;
        endTimeSec = startTimeSec + durationSec;
      }
      
      const startTime = formatSrtTime(startTimeSec);
      const endTime = formatSrtTime(endTimeSec);
      const text = scene.scriptExcerpt;
      
      return `${index + 1}\n${startTime} --> ${endTime}\n${text}\n`;
    })
    .join("\n");
  
  fs.writeFileSync(
    path.join(dataDir, "script.srt"),
    srtContent
  );
  
  // Create full script file
  fs.writeFileSync(
    path.join(dataDir, "full_script.txt"),
    script.content
  );
  
  // Create scene script excerpts
  const sceneScriptExcerpts = scenes
    .map(scene => {
      const durationInfo = scene.exactStartTime !== null && scene.exactEndTime !== null
        ? `[Duration: ${formatTime((scene.exactEndTime - scene.exactStartTime) / 1000)}]`
        : scene.estimatedDuration 
          ? `[Estimated Duration: ${formatTime(scene.estimatedDuration)}]`
          : '';
          
      return `=== SCENE ${scene.sceneNumber}: ${scene.title || ''} ${durationInfo} ===

${scene.scriptExcerpt || ''}

---------------------------------------------------------`;
    })
    .join('\n\n');
    
  fs.writeFileSync(
    path.join(dataDir, "scene_script_excerpts.txt"),
    sceneScriptExcerpts
  );

  // Create ZIP archive with production-safe settings
  const sanitizedTitle = script.title ? script.title.replace(/[^a-z0-9]/gi, '-').toLowerCase() : `script-${script.id}`;
  const zipPath = path.join(tempDir, `scenestitch-${sanitizedTitle}-${Date.now()}.zip`);
  const output = fs.createWriteStream(zipPath);
  
  // Check if we have large media files (videos) - use STORE mode (no compression) for speed
  const hasLargeMedia = scenesWithVideos.length > 0;
  
  // Production-safe archiver settings - NO compression for media-heavy exports (PNG/MP4 already compressed)
  const archive = archiver("zip", { 
    zlib: { level: 0 }, // Level 0 = no compression (fastest) - media files are already compressed
    forceLocalTime: true,
    store: hasLargeMedia, // STORE mode for video exports (no compression at all)
    highWaterMark: 4 * 1024 * 1024 // 4MB buffer for faster streaming of large files
  });
  
  // Extended timeout for production environments with larger files
  const ZIP_TIMEOUT = process.env.NODE_ENV === 'production' ? 20 * 60 * 1000 : 10 * 60 * 1000; // 20 min for prod, 10 min for dev
  let timeoutId: NodeJS.Timeout;
  
  archive.pipe(output);
  
  console.log(`Creating ZIP archive for export (${hasLargeMedia ? 'STORE mode - no compression' : 'compressed'})...`);
  console.log(`Export contains ${scenes.length} scenes, ${scenesWithVideos.length} videos`);
  const startTime = Date.now();
  
  archive.directory(exportDir, false);
  
  await new Promise<void>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      archive.abort();
      reject(new Error("Export timeout: Archive creation took too long. Try reducing project size or export fewer scenes."));
    }, ZIP_TIMEOUT);
    
    output.on("close", () => {
      clearTimeout(timeoutId);
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      console.log(`ZIP export created successfully at ${zipPath}`);
      console.log(`Archive creation took ${duration.toFixed(2)} seconds`);
      
      // Clean up the export directory after creating the ZIP
      fs.rm(exportDir, { recursive: true, force: true }, (err: NodeJS.ErrnoException | null) => {
        if (err) console.error("Error cleaning up export directory:", err);
        resolve();
      });
    });
    
    archive.on("error", (err: Error) => {
      clearTimeout(timeoutId);
      console.error("Archive creation error:", err);
      reject(new Error(`Export failed: ${err.message}. This may be due to large file sizes or memory constraints.`));
    });
    
    archive.on("warning", (err: any) => {
      if (err.code === 'ENOENT') {
        console.warn("Archive warning:", err);
      } else {
        clearTimeout(timeoutId);
        reject(err);
      }
    });
    
    // Monitor progress for large archives
    archive.on('progress', (progress: any) => {
      if (progress.entries && progress.entries.processed > 0) {
        console.log(`Archive progress: ${progress.entries.processed}/${progress.entries.total} files processed`);
      }
    });
    
    archive.finalize();
  });
  
  return zipPath;
  } catch (error) {
    console.error(`[EXPORT] Critical error during export:`, error);
    throw error;
  }
}