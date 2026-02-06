import ffmpeg from 'fluent-ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { storage } from '../storage';

export class EfficientVideoGenerator {
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
        fps: 30,
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

      console.log(`Creating efficient slideshow: ${scenesWithImages.length} scenes, ${audioDuration}s duration`);
      
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

      await storage.updateVideoJob(jobId, { progress: 25 });

      // Create output path
      const outputDir = path.join('uploads', 'videos');
      await fs.mkdir(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, `video_${jobId}.mp4`);

      // Calculate scene duration
      const sceneDuration = audioDuration / imagePaths.length;
      console.log(`Each scene duration: ${sceneDuration.toFixed(2)}s`);

      // Create efficient slideshow using image2 input and complex filter
      await new Promise<void>((resolve, reject) => {
        const command = ffmpeg();
        
        // Use image2 input for smoother processing
        command.input(path.join(tempDir, 'scene_%03d.png'))
              .inputOptions([
                '-framerate', `${1/sceneDuration}`,
                '-pattern_type', 'sequence',
                '-start_number', '0'
              ]);
        
        // Add audio
        command.input(audioPath);
        
        command
          .outputOptions([
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '20',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080',
            '-r', '25',
            '-shortest'
          ])
          .output(outputPath)
          .on('progress', async (progress) => {
            if (progress.percent) {
              const videoProgress = Math.round(25 + (progress.percent * 0.7));
              await storage.updateVideoJob(jobId, { progress: videoProgress });
              console.log(`Efficient slideshow progress: ${videoProgress}%`);
            }
          })
          .on('end', async () => {
            console.log(`Efficient slideshow completed: ${audioDuration}s with ${imagePaths.length} scenes`);
            resolve();
          })
          .on('error', (err) => {
            console.error('Efficient slideshow error:', err);
            reject(err);
          })
          .run();
      });
      
      // Get file stats and complete job
      const stats = await fs.stat(outputPath);
      const videoUrl = `/uploads/videos/${path.basename(outputPath)}`;
      
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
      
      console.log(`Efficient video completed: ${videoUrl} (${stats.size} bytes)`);
      return jobId;
      
    } catch (error) {
      console.error(`Efficient video generation failed for job ${jobId}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await storage.updateVideoJob(jobId, {
        status: 'failed',
        error: errorMessage,
      });
      
      throw error;
    }
  }
}