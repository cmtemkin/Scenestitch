import { storage } from '../storage';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class WorkingKenBurnsGenerator {
  static async generateVideo(projectId: number): Promise<string> {
    const jobId = uuidv4();
    
    await storage.createVideoJob({
      id: jobId,
      projectId,
      status: 'processing',
      progress: 5,
      videoUrl: null,
      duration: null,
      fileSize: null,
      settings: {
        fps: 25,
        quality: 'high',
        resolution: '1080p',
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
      const audioPath = audio.audioUrl.startsWith('/') ? audio.audioUrl.substring(1) : audio.audioUrl;
      
      const audioDuration = await new Promise<number>((resolve, reject) => {
        ffmpeg.ffprobe(audioPath, (err, metadata) => {
          if (err) {
            reject(new Error(`Failed to probe audio: ${err.message}`));
            return;
          }
          resolve(metadata.format.duration || 60);
        });
      });

      console.log(`Creating Ken Burns video: ${scenesWithImages.length} scenes, ${audioDuration}s duration`);
      
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

      console.log(`Prepared ${imagePaths.length} scene images for Ken Burns processing`);
      await storage.updateVideoJob(jobId, { progress: 25 });

      // Calculate scene duration
      const sceneDuration = audioDuration / imagePaths.length;
      console.log(`Each scene duration: ${sceneDuration.toFixed(2)}s`);

      // Process each image with Ken Burns effect
      const processedVideos: string[] = [];
      
      for (let i = 0; i < imagePaths.length; i++) {
        const inputImage = imagePaths[i];
        const outputVideo = path.join(tempDir, `ken_burns_${i.toString().padStart(3, '0')}.mp4`);
        
        // Apply different Ken Burns patterns
        const pattern = i % 4;
        await this.createKenBurnsClip(inputImage, outputVideo, sceneDuration, pattern);
        
        processedVideos.push(outputVideo);
        
        const progress = 25 + (i / imagePaths.length) * 50;
        await storage.updateVideoJob(jobId, { progress: Math.round(progress) });
        console.log(`Processed scene ${i + 1}/${imagePaths.length} with Ken Burns effect`);
      }

      console.log(`Created ${processedVideos.length} Ken Burns video clips`);
      await storage.updateVideoJob(jobId, { progress: 75 });

      // Create concat file for all processed clips
      const concatFile = path.join(tempDir, 'concat.txt');
      const concatContent = processedVideos
        .map(video => `file '${path.resolve(video)}'`)
        .join('\n');
      await fs.writeFile(concatFile, concatContent);

      const outputPath = path.join('uploads', 'videos', `video_${jobId}.mp4`);

      // Combine all Ken Burns clips with audio
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatFile)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .input(audioPath)
          .outputOptions([
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero',
            '-shortest'
          ])
          .output(outputPath)
          .on('progress', async (progress) => {
            if (progress.percent) {
              const videoProgress = Math.min(95, Math.round(75 + (progress.percent * 0.2)));
              await storage.updateVideoJob(jobId, { progress: videoProgress });
              console.log(`Final Ken Burns video progress: ${videoProgress}%`);
            }
          })
          .on('end', () => {
            console.log('Ken Burns video assembly completed');
            resolve();
          })
          .on('error', (err) => {
            console.error('Ken Burns video assembly failed:', err);
            reject(err);
          })
          .run();
      });

      // Get file stats
      const stats = await fs.stat(outputPath);
      const fileSize = stats.size;
      const videoUrl = `/uploads/videos/video_${jobId}.mp4`;

      console.log(`Ken Burns video completed: ${videoUrl} (${fileSize} bytes)`);

      await storage.updateVideoJob(jobId, { 
        status: 'completed', 
        progress: 100, 
        videoUrl,
        fileSize,
        duration: audioDuration
      });

      // Cleanup temp directory
      await fs.rm(tempDir, { recursive: true, force: true });

      return jobId;
    } catch (error) {
      console.error(`Ken Burns generation failed for job ${jobId}:`, error);
      await storage.updateVideoJob(jobId, { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  private static async createKenBurnsClip(
    imagePath: string, 
    outputPath: string, 
    duration: number,
    pattern: number
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let kenBurnsFilter: string;
      
      // Define Ken Burns movement patterns
      switch (pattern) {
        case 0: // Zoom in from center
          kenBurnsFilter = `scale=2304:1296:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z=1.2:d=${Math.ceil(duration * 25)}:s=1920x1080:fps=25`;
          break;
        case 1: // Pan left to right 
          kenBurnsFilter = `scale=2304:1296:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z=1.1:x=200:d=${Math.ceil(duration * 25)}:s=1920x1080:fps=25`;
          break;
        case 2: // Pan right to left
          kenBurnsFilter = `scale=2304:1296:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z=1.15:x=-200:d=${Math.ceil(duration * 25)}:s=1920x1080:fps=25`;
          break;
        default: // Gentle zoom
          kenBurnsFilter = `scale=2304:1296:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z=1.08:d=${Math.ceil(duration * 25)}:s=1920x1080:fps=25`;
          break;
      }

      ffmpeg()
        .input(imagePath)
        .outputOptions([
          '-vf', kenBurnsFilter,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-t', duration.toString(),
          '-r', '25'
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }
}