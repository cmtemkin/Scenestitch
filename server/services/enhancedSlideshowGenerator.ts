import ffmpeg from 'fluent-ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { storage } from '../storage';
import sharp from 'sharp';

interface EnhancedScene {
  imagePath: string;
  orientation: 'portrait' | 'landscape' | 'square';
  aspectRatio: number;
  duration: number;
  kenBurnsType: 'zoom_in' | 'zoom_out' | 'pan_horizontal' | 'pan_vertical';
}

export class EnhancedSlideshowGenerator {
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

      console.log(`Creating enhanced Ken Burns slideshow: ${scenesWithImages.length} scenes, ${audioDuration}s duration`);
      
      const tempDir = path.join('temp', `enhanced_${jobId}`);
      await fs.mkdir(tempDir, { recursive: true });
      
      // Analyze and prepare images for Ken Burns effects
      const enhancedScenes: EnhancedScene[] = [];
      const sceneDuration = audioDuration / scenesWithImages.length;
      
      for (let i = 0; i < scenesWithImages.length; i++) {
        const scene = scenesWithImages[i];
        const imageData = scene.imageUrl!.replace(/^data:image\/[a-z]+;base64,/, '');
        const imageBuffer = Buffer.from(imageData, 'base64');
        const imagePath = path.join(tempDir, `scene_${i.toString().padStart(3, '0')}.png`);
        await fs.writeFile(imagePath, imageBuffer);

        // Analyze image dimensions with Sharp
        const metadata = await sharp(imageBuffer).metadata();
        const width = metadata.width || 1024;
        const height = metadata.height || 1024;
        const aspectRatio = width / height;

        let orientation: 'portrait' | 'landscape' | 'square';
        if (aspectRatio > 1.2) orientation = 'landscape';
        else if (aspectRatio < 0.8) orientation = 'portrait';
        else orientation = 'square';

        // Determine Ken Burns effect based on orientation
        let kenBurnsType: EnhancedScene['kenBurnsType'];
        if (orientation === 'portrait') {
          kenBurnsType = i % 2 === 0 ? 'pan_vertical' : 'zoom_in';
        } else if (orientation === 'landscape') {
          kenBurnsType = i % 2 === 0 ? 'pan_horizontal' : 'zoom_out';
        } else {
          kenBurnsType = ['zoom_in', 'zoom_out', 'pan_horizontal', 'pan_vertical'][i % 4] as EnhancedScene['kenBurnsType'];
        }

        enhancedScenes.push({
          imagePath,
          orientation,
          aspectRatio,
          duration: sceneDuration,
          kenBurnsType
        });
      }

      await storage.updateVideoJob(jobId, { progress: 30 });

      // Create individual Ken Burns video clips
      const videoClips: string[] = [];
      
      for (let i = 0; i < enhancedScenes.length; i++) {
        const scene = enhancedScenes[i];
        const clipPath = path.join(tempDir, `clip_${i.toString().padStart(3, '0')}.mp4`);
        
        await this.createKenBurnsClip(scene, clipPath);
        videoClips.push(clipPath);
        
        const progress = 30 + Math.round((i + 1) / enhancedScenes.length * 40);
        await storage.updateVideoJob(jobId, { progress });
      }

      // Create concat file for final assembly
      const concatContent = videoClips.map(clipPath => 
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
            reject(new Error('Enhanced slideshow assembly timeout'));
          }
        }, 90000); // 90 second timeout

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
              console.log(`Enhanced slideshow assembly: ${videoProgress}%`);
            }
          })
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

      // Verify and finalize
      const stats = await fs.stat(outputPath);
      if (stats.size < 1000) {
        throw new Error('Enhanced slideshow video too small');
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
        for (const imagePath of enhancedScenes.map(s => s.imagePath)) {
          await fs.unlink(imagePath);
        }
        for (const clipPath of videoClips) {
          await fs.unlink(clipPath);
        }
        await fs.unlink(concatPath);
        await fs.rmdir(tempDir);
      } catch (cleanupError) {
        console.warn('Enhanced slideshow cleanup warning:', cleanupError);
      }
      
      console.log(`Enhanced Ken Burns slideshow completed: ${videoUrl} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
      return jobId;
      
    } catch (error) {
      console.error(`Enhanced slideshow generation failed for job ${jobId}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await storage.updateVideoJob(jobId, {
        status: 'failed',
        error: errorMessage,
      });
      
      throw error;
    }
  }

  private static async createKenBurnsClip(scene: EnhancedScene, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let completed = false;
      
      const timeout = setTimeout(() => {
        if (!completed) {
          completed = true;
          reject(new Error(`Ken Burns clip timeout: ${scene.kenBurnsType}`));
        }
      }, 20000); // 20 second timeout per clip

      // Create filter based on Ken Burns type and maintain 16:9 aspect ratio
      let videoFilter = '';
      const duration = scene.duration;
      
      switch (scene.kenBurnsType) {
        case 'zoom_in':
          videoFilter = `scale=2304:1296:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='1+0.15*t/${duration}':d=${Math.ceil(duration * 25)}:s=1920x1080:fps=25`;
          break;
        case 'zoom_out':
          videoFilter = `scale=2304:1296:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='1.15-0.15*t/${duration}':d=${Math.ceil(duration * 25)}:s=1920x1080:fps=25`;
          break;
        case 'pan_horizontal':
          videoFilter = `scale=2304:1296:force_original_aspect_ratio=increase,crop=1920:1080:x='192*(1-t/${duration})':y=108,fps=25`;
          break;
        case 'pan_vertical':
          videoFilter = `scale=1920:1296:force_original_aspect_ratio=increase,crop=1920:1080:x=0:y='108*(1-t/${duration})',fps=25`;
          break;
      }

      ffmpeg()
        .input(scene.imagePath)
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