import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs/promises';
import { storage } from '../storage';

export class SimpleVideoGenerator {
  static async generateVideo(projectId: number): Promise<string> {
    const jobId = `simple_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Create video job
      await storage.createVideoJob({
        id: jobId,
        projectId,
        status: 'processing',
        progress: 0,
        settings: { type: 'simple', quality: 'high' }
      });

      // Get project data
      const project = await storage.getScript(projectId);
      const scenes = await storage.getScenesByScriptId(projectId);
      
      if (!scenes?.length || !project?.audioTTSId) {
        throw new Error('Missing scenes or audio');
      }

      // Get audio file
      const audioRecord = await storage.getAudioTTS(project.audioTTSId);
      if (!audioRecord?.audioUrl) {
        throw new Error('Audio file not found');
      }

      const audioPath = '.' + audioRecord.audioUrl;

      console.log(`Simple video: ${scenes.length} scenes`);
      await storage.updateVideoJob(jobId, { progress: 20 });

      // Get audio duration
      const audioDuration = await this.getAudioDuration(audioPath);
      console.log(`Audio duration: ${audioDuration}s`);

      // Create video
      const outputPath = `./uploads/videos/video_${jobId}.mp4`;
      await this.createSimpleVideo(scenes, audioPath, outputPath, audioDuration, jobId);

      // Get file size and complete
      const stats = await fs.stat(outputPath);
      const fileSize = stats.size;

      await storage.updateVideoJob(jobId, { 
        status: 'completed', 
        progress: 100,
        videoUrl: `/uploads/videos/video_${jobId}.mp4`,
        fileSize
      });

      console.log(`Simple video completed: ${fileSize} bytes`);
      return jobId;

    } catch (error) {
      console.error('Simple video error:', error);
      await storage.updateVideoJob(jobId, { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private static async getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration || 0);
      });
    });
  }

  private static async createSimpleVideo(
    scenes: any[], 
    audioPath: string, 
    outputPath: string, 
    audioDuration: number,
    jobId: string
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const sceneDuration = audioDuration / scenes.length;
      
      // Get first scene image for the base
      const firstScene = scenes.find(scene => scene.imageUrl);
      if (!firstScene) {
        return reject(new Error('No valid scene images found'));
      }
      
      const firstImagePath = firstScene.imageUrl.replace('/api/scene-image/', './uploads/scenes/scene_');

      // Create simple slideshow video using single image as base
      ffmpeg()
        .input(firstImagePath)
        .inputOptions([
          '-loop', '1',
          '-t', audioDuration.toString()
        ])
        .input(audioPath)
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080',
          '-r', '25',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-shortest'
        ])
        .output(outputPath)
        .on('progress', async (progress) => {
          if (progress.percent) {
            const videoProgress = Math.min(95, Math.round(30 + (progress.percent * 0.65)));
            await storage.updateVideoJob(jobId, { progress: videoProgress });
            console.log(`Simple video progress: ${videoProgress}%`);
          }
        })
        .on('end', () => {
          console.log('Simple video generation completed');
          resolve();
        })
        .on('error', (err) => {
          console.error('Simple video error:', err);
          reject(err);
        })
        .run();
    });
  }
}