import ffmpeg from 'fluent-ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { storage } from '../storage';

export class KenBurnsEnhancedGenerator {
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
        kenBurnsIntensity: 'enhanced'
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

      console.log(`Creating Ken Burns enhanced video: ${scenesWithImages.length} scenes, ${audioDuration}s duration`);
      
      const tempDir = path.join('temp', `ken_burns_${jobId}`);
      await fs.mkdir(tempDir, { recursive: true });
      
      // Save images and create individual Ken Burns clips
      const imagePaths: string[] = [];
      const clipPaths: string[] = [];
      const sceneDuration = audioDuration / scenesWithImages.length;
      
      for (let i = 0; i < scenesWithImages.length; i++) {
        const scene = scenesWithImages[i];
        const imageData = scene.imageUrl!.replace(/^data:image\/[a-z]+;base64,/, '');
        const imageBuffer = Buffer.from(imageData, 'base64');
        const imagePath = path.join(tempDir, `scene_${i.toString().padStart(3, '0')}.png`);
        await fs.writeFile(imagePath, imageBuffer);
        imagePaths.push(imagePath);
      }

      await storage.updateVideoJob(jobId, { progress: 25 });

      // Create Ken Burns clips individually to avoid complex filter chains
      for (let i = 0; i < imagePaths.length; i++) {
        const imagePath = imagePaths[i];
        const clipPath = path.join(tempDir, `clip_${i.toString().padStart(3, '0')}.mp4`);
        
        // Determine Ken Burns effect based on scene position
        const effects = ['zoom_in', 'zoom_out', 'pan_horizontal', 'pan_vertical'];
        const effect = effects[i % effects.length];
        
        await this.createKenBurnsClip(imagePath, clipPath, effect, sceneDuration);
        clipPaths.push(clipPath);
        
        const progress = 25 + Math.round((i + 1) / imagePaths.length * 45);
        await storage.updateVideoJob(jobId, { progress });
        console.log(`Created Ken Burns clip ${i + 1}/${imagePaths.length}: ${effect}`);
      }

      // Create concat file for final assembly
      const concatContent = clipPaths.map(clipPath => 
        `file '${path.resolve(clipPath)}'`
      ).join('\n');
      
      const concatPath = path.join(tempDir, 'concat.txt');
      await fs.writeFile(concatPath, concatContent);

      await storage.updateVideoJob(jobId, { progress: 75 });

      const outputDir = path.join('uploads', 'videos');
      await fs.mkdir(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, `video_${jobId}.mp4`);

      // Final assembly with audio
      await new Promise<void>((resolve, reject) => {
        let completed = false;
        
        const timeout = setTimeout(() => {
          if (!completed) {
            completed = true;
            reject(new Error('Ken Burns enhanced assembly timeout'));
          }
        }, 120000); // 2 minute timeout

        ffmpeg()
          .input(concatPath)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .input(audioPath)
          .outputOptions([
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '20',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-shortest'
          ])
          .output(outputPath)
          .on('progress', (progress) => {
            if (!completed && progress.percent) {
              const videoProgress = Math.min(95, Math.round(75 + (progress.percent * 0.2)));
              storage.updateVideoJob(jobId, { progress: videoProgress }).catch(console.error);
              console.log(`Ken Burns enhanced assembly: ${videoProgress}%`);
            }
          })
          .on('end', () => {
            if (!completed) {
              completed = true;
              clearTimeout(timeout);
              console.log('Ken Burns enhanced video completed');
              resolve();
            }
          })
          .on('error', (err) => {
            if (!completed) {
              completed = true;
              clearTimeout(timeout);
              console.error('Ken Burns enhanced assembly error:', err);
              reject(err);
            }
          })
          .run();
      });

      // Verify and finalize
      const stats = await fs.stat(outputPath);
      if (stats.size < 1000) {
        throw new Error('Ken Burns enhanced video too small');
      }
      
      const videoUrl = `/uploads/videos/${path.basename(outputPath)}`;
      
      await storage.updateVideoJob(jobId, {
        status: 'completed',
        progress: 100,
        videoUrl,
        fileSize: stats.size,
      });
      
      // Cleanup temp files
      try {
        for (const imagePath of imagePaths) {
          await fs.unlink(imagePath);
        }
        for (const clipPath of clipPaths) {
          await fs.unlink(clipPath);
        }
        await fs.unlink(concatPath);
        await fs.rmdir(tempDir);
      } catch (cleanupError) {
        console.warn('Ken Burns enhanced cleanup warning:', cleanupError);
      }
      
      console.log(`Ken Burns enhanced video completed: ${videoUrl} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
      return jobId;
      
    } catch (error) {
      console.error(`Ken Burns enhanced generation failed for job ${jobId}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await storage.updateVideoJob(jobId, {
        status: 'failed',
        error: errorMessage,
      });
      
      throw error;
    }
  }

  private static async createKenBurnsClip(
    imagePath: string, 
    outputPath: string, 
    effect: string, 
    duration: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let completed = false;
      
      const timeout = setTimeout(() => {
        if (!completed) {
          completed = true;
          reject(new Error(`Ken Burns clip timeout: ${effect}`));
        }
      }, 30000); // 30 second timeout per clip

      // Create Ken Burns filter for 16:9 output with smart aspect ratio handling
      let videoFilter = '';
      
      switch (effect) {
        case 'zoom_in':
          // Simple zoom in effect
          videoFilter = `scale=2304:1296:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='1+0.1*t/${duration}':d=${Math.ceil(duration * 25)}:s=1920x1080:fps=25`;
          break;
        case 'zoom_out':
          // Simple zoom out effect
          videoFilter = `scale=2304:1296:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='1.1-0.1*t/${duration}':d=${Math.ceil(duration * 25)}:s=1920x1080:fps=25`;
          break;
        case 'pan_horizontal':
          // Simple horizontal pan
          videoFilter = `scale=2304:1296:force_original_aspect_ratio=increase,crop=1920:1080:x='192*t/${duration}':y=138,fps=25`;
          break;
        case 'pan_vertical':
          // Simple vertical pan
          videoFilter = `scale=1920:1296:force_original_aspect_ratio=increase,crop=1920:1080:x=0:y='108*t/${duration}',fps=25`;
          break;
      }

      ffmpeg()
        .input(imagePath)
        .inputOptions(['-loop', '1', '-t', duration.toString()])
        .outputOptions([
          '-vf', videoFilter,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '22',
          '-pix_fmt', 'yuv420p'
        ])
        .output(outputPath)
        .on('end', () => {
          if (!completed) {
            completed = true;
            clearTimeout(timeout);
            resolve();
          }
        })
        .on('error', (err) => {
          if (!completed) {
            completed = true;
            clearTimeout(timeout);
            reject(err);
          }
        })
        .run();
    });
  }
}