import ffmpeg from 'fluent-ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { storage } from '../storage';
import sharp from 'sharp';

interface KenBurnsScene {
  imagePath: string;
  orientation: 'portrait' | 'landscape' | 'square';
  aspectRatio: number;
  duration: number;
  effect: 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'pan_up' | 'pan_down';
}

export class SmartKenBurnsGenerator {
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
        kenBurnsIntensity: 'smart'
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

      console.log(`Creating smart Ken Burns video: ${scenesWithImages.length} scenes, ${audioDuration}s duration`);
      
      const tempDir = path.join('temp', `smart_kb_${jobId}`);
      await fs.mkdir(tempDir, { recursive: true });
      
      // Analyze images and prepare Ken Burns scenes
      const kenBurnsScenes: KenBurnsScene[] = [];
      const sceneDuration = audioDuration / scenesWithImages.length;
      
      for (let i = 0; i < scenesWithImages.length; i++) {
        const scene = scenesWithImages[i];
        const imageData = scene.imageUrl!.replace(/^data:image\/[a-z]+;base64,/, '');
        const imageBuffer = Buffer.from(imageData, 'base64');
        const imagePath = path.join(tempDir, `scene_${i.toString().padStart(3, '0')}.png`);
        await fs.writeFile(imagePath, imageBuffer);

        // Analyze image dimensions
        const metadata = await sharp(imageBuffer).metadata();
        const width = metadata.width || 1024;
        const height = metadata.height || 1024;
        const aspectRatio = width / height;

        let orientation: 'portrait' | 'landscape' | 'square';
        if (aspectRatio > 1.2) orientation = 'landscape';
        else if (aspectRatio < 0.8) orientation = 'portrait';
        else orientation = 'square';

        // Choose Ken Burns effect based on orientation
        const effect = this.chooseKenBurnsEffect(orientation, i);

        kenBurnsScenes.push({
          imagePath,
          orientation,
          aspectRatio,
          duration: sceneDuration,
          effect
        });
      }

      await storage.updateVideoJob(jobId, { progress: 30 });

      // Process each scene individually with Ken Burns effects
      const processedVideos: string[] = [];
      
      for (let i = 0; i < kenBurnsScenes.length; i++) {
        const scene = kenBurnsScenes[i];
        const sceneVideoPath = path.join(tempDir, `scene_video_${i}.mp4`);
        
        await this.createKenBurnsScene(scene, sceneVideoPath);
        processedVideos.push(sceneVideoPath);
        
        const sceneProgress = 30 + Math.round((i + 1) / kenBurnsScenes.length * 40);
        await storage.updateVideoJob(jobId, { progress: sceneProgress });
      }

      // Create concat file for final video assembly
      const concatContent = processedVideos.map(videoPath => 
        `file '${path.resolve(videoPath)}'`
      ).join('\n');
      
      const concatPath = path.join(tempDir, 'concat.txt');
      await fs.writeFile(concatPath, concatContent);

      await storage.updateVideoJob(jobId, { progress: 75 });

      const outputDir = path.join('uploads', 'videos');
      await fs.mkdir(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, `video_${jobId}.mp4`);

      // Combine all scene videos with audio
      await new Promise<void>((resolve, reject) => {
        let completed = false;
        
        const timeout = setTimeout(() => {
          if (!completed) {
            completed = true;
            reject(new Error('Smart Ken Burns video assembly timeout'));
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
              console.log(`Smart Ken Burns assembly progress: ${videoProgress}%`);
            }
          })
          .on('end', () => {
            if (!completed) {
              completed = true;
              clearTimeout(timeout);
              console.log('Smart Ken Burns video assembly completed');
              resolve();
            }
          })
          .on('error', (err) => {
            if (!completed) {
              completed = true;
              clearTimeout(timeout);
              console.error('Smart Ken Burns video assembly error:', err);
              reject(err);
            }
          })
          .run();
      });

      // Verify video file
      const stats = await fs.stat(outputPath);
      if (stats.size < 1000) {
        throw new Error('Generated smart Ken Burns video file is too small');
      }
      
      const videoUrl = `/uploads/videos/${path.basename(outputPath)}`;
      
      await storage.updateVideoJob(jobId, {
        status: 'completed',
        progress: 100,
        videoUrl,
        fileSize: stats.size,
      });
      
      // Cleanup
      try {
        for (const imagePath of kenBurnsScenes.map(s => s.imagePath)) {
          await fs.unlink(imagePath);
        }
        for (const videoPath of processedVideos) {
          await fs.unlink(videoPath);
        }
        await fs.unlink(concatPath);
        await fs.rmdir(tempDir);
      } catch (cleanupError) {
        console.warn('Smart Ken Burns cleanup warning:', cleanupError);
      }
      
      console.log(`Smart Ken Burns video completed: ${videoUrl} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
      return jobId;
      
    } catch (error) {
      console.error(`Smart Ken Burns video generation failed for job ${jobId}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await storage.updateVideoJob(jobId, {
        status: 'failed',
        error: errorMessage,
      });
      
      throw error;
    }
  }

  private static async createKenBurnsScene(scene: KenBurnsScene, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let completed = false;
      
      const timeout = setTimeout(() => {
        if (!completed) {
          completed = true;
          reject(new Error(`Ken Burns scene timeout: ${scene.effect}`));
        }
      }, 30000); // 30 second timeout per scene

      // Create Ken Burns filter based on effect and orientation
      let kenBurnsFilter = '';
      
      switch (scene.effect) {
        case 'zoom_in':
          kenBurnsFilter = `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='1+0.2*t/${scene.duration}':d=${Math.ceil(scene.duration * 25)}:s=1920x1080:fps=25`;
          break;
        case 'zoom_out':
          kenBurnsFilter = `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='1.2-0.2*t/${scene.duration}':d=${Math.ceil(scene.duration * 25)}:s=1920x1080:fps=25`;
          break;
        case 'pan_left':
          kenBurnsFilter = `scale=2304:1296:force_original_aspect_ratio=increase,crop=1920:1080:x='384-64*t/${scene.duration}':y=108,fps=25`;
          break;
        case 'pan_right':
          kenBurnsFilter = `scale=2304:1296:force_original_aspect_ratio=increase,crop=1920:1080:x='64*t/${scene.duration}':y=108,fps=25`;
          break;
        case 'pan_up':
          kenBurnsFilter = `scale=1920:1296:force_original_aspect_ratio=increase,crop=1920:1080:x=0:y='216-136*t/${scene.duration}',fps=25`;
          break;
        case 'pan_down':
          kenBurnsFilter = `scale=1920:1296:force_original_aspect_ratio=increase,crop=1920:1080:x=0:y='136*t/${scene.duration}',fps=25`;
          break;
      }

      ffmpeg()
        .input(scene.imagePath)
        .inputOptions(['-loop', '1', '-t', scene.duration.toString()])
        .outputOptions([
          '-vf', kenBurnsFilter,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '22',
          '-pix_fmt', 'yuv420p',
          '-r', '25'
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

  private static chooseKenBurnsEffect(orientation: string, sceneIndex: number): KenBurnsScene['effect'] {
    const effects: KenBurnsScene['effect'][] = [];
    
    switch (orientation) {
      case 'portrait':
        effects.push('pan_up', 'pan_down', 'zoom_in');
        break;
      case 'landscape':
        effects.push('pan_left', 'pan_right', 'zoom_out');
        break;
      case 'square':
        effects.push('zoom_in', 'zoom_out', 'pan_left', 'pan_right');
        break;
    }
    
    // Vary effects to create dynamic feeling
    return effects[sceneIndex % effects.length];
  }
}