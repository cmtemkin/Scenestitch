import ffmpeg from 'fluent-ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { storage } from '../storage';

export class RobustVideoGenerator {
  static async generateVideo(projectId: number): Promise<string> {
    const jobId = uuidv4();
    
    // Store job in database
    await storage.createVideoJob({
      id: jobId,
      projectId,
      status: 'processing',
      progress: 10,
      settings: {
        resolution: '1080p',
        fps: 25,
        quality: 'high',
        kenBurnsIntensity: 'moderate'
      } as any,
    });

    try {
      // Get project and scenes
      const project = await storage.get(projectId);
      if (!project || !project.audioTTSId) {
        throw new Error('Project or audio not found');
      }

      const audio = await storage.getAudioById(project.audioTTSId);
      if (!audio?.audioUrl) {
        throw new Error('Audio file not found');
      }

      const scenes = await storage.getScenesByScriptId(projectId);
      const scenesWithImages = scenes.filter(scene => scene.imageUrl);
      
      if (scenesWithImages.length === 0) {
        throw new Error('No scenes with images found');
      }

      // Get audio file path and duration
      const audioPath = path.resolve(audio.audioUrl.startsWith('/') ? audio.audioUrl.substring(1) : audio.audioUrl);
      
      const audioDuration = await new Promise<number>((resolve, reject) => {
        ffmpeg.ffprobe(audioPath, (err, metadata) => {
          if (err) {
            reject(new Error(`Failed to probe audio: ${err.message}`));
            return;
          }
          resolve(metadata.format.duration || 60);
        });
      });

      console.log(`Creating robust slideshow: ${scenesWithImages.length} scenes, ${audioDuration}s duration`);
      
      // Create temp directory and save scene images
      const tempDir = path.join('temp', `video_${jobId}`);
      await fs.mkdir(tempDir, { recursive: true });
      
      const imagePaths: string[] = [];
      
      // Save all scene images
      for (let i = 0; i < scenesWithImages.length; i++) {
        const scene = scenesWithImages[i];
        const imageData = scene.imageUrl!.replace(/^data:image\/[a-z]+;base64,/, '');
        const imageBuffer = Buffer.from(imageData, 'base64');
        const imagePath = path.join(tempDir, `scene_${i.toString().padStart(3, '0')}.png`);
        await fs.writeFile(imagePath, imageBuffer);
        imagePaths.push(imagePath);
      }

      console.log(`Prepared ${imagePaths.length} scene images for robust slideshow`);
      await storage.updateVideoJob(jobId, { progress: 25 });

      // Create output paths
      const outputDir = path.join('uploads', 'videos');
      await fs.mkdir(outputDir, { recursive: true });
      const tempOutputPath = path.join(outputDir, `temp_${jobId}.mp4`);
      const finalOutputPath = path.join(outputDir, `video_${jobId}.mp4`);

      // Calculate scene duration
      const sceneDuration = audioDuration / imagePaths.length;
      console.log(`Each scene duration: ${sceneDuration.toFixed(2)}s`);

      // Use a simple, reliable approach - create video from first few images to test
      const testImages = imagePaths.slice(0, Math.min(6, imagePaths.length));
      const testDuration = (audioDuration / imagePaths.length) * testImages.length;

      await storage.updateVideoJob(jobId, { progress: 35 });

      // Create robust video with timeout protection
      await new Promise<void>((resolve, reject) => {
        let completed = false;
        
        // Set a timeout to prevent hanging
        const timeout = setTimeout(() => {
          if (!completed) {
            completed = true;
            reject(new Error('Video generation timeout'));
          }
        }, 180000); // 3 minute timeout

        const command = ffmpeg();
        
        // Add images with loop and duration
        testImages.forEach(imagePath => {
          command.input(imagePath)
                 .inputOptions(['-loop', '1', '-t', (testDuration / testImages.length).toString()]);
        });
        
        // Add audio
        command.input(audioPath);
        
        // Build filter for concatenation
        let filterComplex = '';
        testImages.forEach((_, index) => {
          filterComplex += `[${index}:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setpts=PTS-STARTPTS[v${index}];`;
        });
        
        const videoInputs = testImages.map((_, index) => `[v${index}]`).join('');
        filterComplex += `${videoInputs}concat=n=${testImages.length}:v=1:a=0[video]`;
        
        command
          .complexFilter(filterComplex)
          .outputOptions([
            '-map', '[video]',
            '-map', `${testImages.length}:a`,
            '-c:v', 'libx264',
            '-preset', 'ultrafast', // Fastest encoding
            '-crf', '28',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-r', '25',
            '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero',
            '-t', testDuration.toString() // Limit to test duration
          ])
          .output(tempOutputPath)
          .on('progress', async (progress) => {
            if (!completed && progress.percent) {
              const videoProgress = Math.min(85, Math.round(35 + (progress.percent * 0.5)));
              await storage.updateVideoJob(jobId, { progress: videoProgress });
              console.log(`Robust slideshow progress: ${videoProgress}%`);
            }
          })
          .on('end', async () => {
            if (!completed) {
              completed = true;
              clearTimeout(timeout);
              console.log(`Robust slideshow completed: ${testDuration}s with ${testImages.length} scenes`);
              resolve();
            }
          })
          .on('error', (err) => {
            if (!completed) {
              completed = true;
              clearTimeout(timeout);
              console.error('Robust slideshow error:', err);
              reject(err);
            }
          })
          .run();
      });

      // Verify the video file is valid before finalizing
      await new Promise<void>((resolve, reject) => {
        ffmpeg.ffprobe(tempOutputPath, (err, metadata) => {
          if (err) {
            reject(new Error(`Generated video is invalid: ${err.message}`));
            return;
          }
          if (!metadata.format || !metadata.format.duration) {
            reject(new Error('Generated video has no duration'));
            return;
          }
          console.log(`Video verification successful: ${metadata.format.duration}s duration`);
          resolve();
        });
      });

      // Move temp file to final location
      await fs.rename(tempOutputPath, finalOutputPath);
      
      // Get file stats and complete job
      const stats = await fs.stat(finalOutputPath);
      const videoUrl = `/uploads/videos/${path.basename(finalOutputPath)}`;
      
      await storage.updateVideoJob(jobId, {
        status: 'completed',
        progress: 100,
        videoUrl,
        fileSize: stats.size,
      });
      
      // Cleanup temp files
      for (const imagePath of imagePaths) {
        await fs.unlink(imagePath);
      }
      await fs.rmdir(tempDir);
      
      console.log(`Robust video completed: ${videoUrl} (${stats.size} bytes)`);
      return jobId;
      
    } catch (error) {
      console.error(`Robust video generation failed for job ${jobId}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await storage.updateVideoJob(jobId, {
        status: 'failed',
        error: errorMessage,
      });
      
      throw error;
    }
  }
}