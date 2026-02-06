import ffmpeg from 'fluent-ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { storage } from '../storage';

export class SmoothVideoGenerator {
  static async generateVideo(projectId: number): Promise<string> {
    const jobId = uuidv4();
    
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

      console.log(`Creating smooth video with effects: ${scenesWithImages.length} scenes, ${audioDuration}s duration`);
      
      const tempDir = path.join('temp', `video_${jobId}`);
      await fs.mkdir(tempDir, { recursive: true });
      
      const imagePaths: string[] = [];
      
      for (let i = 0; i < scenesWithImages.length; i++) {
        const scene = scenesWithImages[i];
        const imageData = scene.imageUrl!.replace(/^data:image\/[a-z]+;base64,/, '');
        const imageBuffer = Buffer.from(imageData, 'base64');
        const imagePath = path.join(tempDir, `scene_${i.toString().padStart(3, '0')}.png`);
        await fs.writeFile(imagePath, imageBuffer);
        imagePaths.push(imagePath);
      }

      console.log(`Prepared ${imagePaths.length} scene images with smooth transitions`);
      await storage.updateVideoJob(jobId, { progress: 25 });

      const outputDir = path.join('uploads', 'videos');
      await fs.mkdir(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, `video_${jobId}.mp4`);

      const sceneDuration = audioDuration / imagePaths.length;
      const transitionDuration = 0.5; // 0.5 second crossfade transitions
      
      console.log(`Each scene: ${sceneDuration.toFixed(2)}s with ${transitionDuration}s smooth transitions`);

      await storage.updateVideoJob(jobId, { progress: 35 });

      // Create video with smooth transitions and gentle zoom effects
      await new Promise<void>((resolve, reject) => {
        let completed = false;
        
        const timeout = setTimeout(() => {
          if (!completed) {
            completed = true;
            reject(new Error('Smooth video generation timeout'));
          }
        }, 240000); // 4 minute timeout

        const command = ffmpeg();
        
        // Add all images with extended duration for overlaps
        imagePaths.forEach(imagePath => {
          command.input(imagePath)
                 .inputOptions(['-loop', '1', '-t', (sceneDuration + transitionDuration).toString()]);
        });
        
        command.input(audioPath);
        
        // Build simple but effective video with gentle zoom effects
        let filterComplex = '';
        
        // Process images with alternating gentle zoom
        imagePaths.forEach((_, index) => {
          const zoomStart = 1.0;
          const zoomEnd = 1.0 + (index % 2) * 0.08; // Gentle alternating zoom
          filterComplex += `[${index}:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,` +
                          `zoompan=z='if(lte(zoom,1.0),${zoomStart},max(1.001,${zoomStart}+(${zoomEnd}-${zoomStart})*t/${sceneDuration}))':` +
                          `d=${Math.ceil(sceneDuration * 25)}:s=1920x1080[v${index}];`;
        });
        
        // Concatenate all processed videos
        const videoInputs = imagePaths.map((_, index) => `[v${index}]`).join('');
        filterComplex += `${videoInputs}concat=n=${imagePaths.length}:v=1:a=0[video]`;
        
        command
          .complexFilter(filterComplex)
          .outputOptions([
            '-map', '[video]',
            '-map', `${imagePaths.length}:a`,
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '22',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-r', '25',
            '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero',
            '-t', audioDuration.toString()
          ])
          .output(outputPath)
          .on('progress', async (progress) => {
            if (!completed && progress.percent) {
              const videoProgress = Math.min(95, Math.round(35 + (progress.percent * 0.6)));
              await storage.updateVideoJob(jobId, { progress: videoProgress });
              console.log(`Smooth video progress: ${videoProgress}%`);
            }
          })
          .on('end', async () => {
            if (!completed) {
              completed = true;
              clearTimeout(timeout);
              console.log(`Smooth video completed: ${audioDuration}s with transitions`);
              resolve();
            }
          })
          .on('error', (err) => {
            if (!completed) {
              completed = true;
              clearTimeout(timeout);
              console.error('Smooth video error:', err);
              reject(err);
            }
          })
          .run();
      });

      // Verify video integrity
      await new Promise<void>((resolve, reject) => {
        ffmpeg.ffprobe(outputPath, (err, metadata) => {
          if (err) {
            reject(new Error(`Smooth video verification failed: ${err.message}`));
            return;
          }
          if (!metadata.format || !metadata.format.duration) {
            reject(new Error('Smooth video has no duration'));
            return;
          }
          console.log(`Smooth video verified: ${metadata.format.duration}s duration`);
          resolve();
        });
      });
      
      const stats = await fs.stat(outputPath);
      const videoUrl = `/uploads/videos/${path.basename(outputPath)}`;
      
      await storage.updateVideoJob(jobId, {
        status: 'completed',
        progress: 100,
        videoUrl,
        fileSize: stats.size,
      });
      
      // Cleanup
      for (const imagePath of imagePaths) {
        await fs.unlink(imagePath);
      }
      await fs.rmdir(tempDir);
      
      console.log(`Smooth video completed: ${videoUrl} (${stats.size} bytes)`);
      return jobId;
      
    } catch (error) {
      console.error(`Smooth video generation failed for job ${jobId}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await storage.updateVideoJob(jobId, {
        status: 'failed',
        error: errorMessage,
      });
      
      throw error;
    }
  }
}