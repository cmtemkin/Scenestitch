import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs/promises';
import { storage } from '../storage';

export class ReliableVideoGenerator {
  static async generateVideo(projectId: number): Promise<string> {
    const jobId = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Create video job
      await storage.createVideoJob({
        id: jobId,
        projectId,
        status: 'processing',
        progress: 0,
        settings: { type: 'kenburns', quality: 'high' }
      });

      // Get project scenes and audio
      const scenes = await storage.getScenesByScriptId(projectId);
      if (!scenes || scenes.length === 0) {
        throw new Error('No scenes found for project');
      }

      const audioRecords = await storage.getAllAudioTTS();
      const projectAudio = audioRecords.find((a: any) => a.scriptId === projectId);
      if (!projectAudio || !projectAudio.filePath) {
        throw new Error('No audio file found for project');
      }

      console.log(`Starting reliable video generation: ${scenes.length} scenes`);
      await storage.updateVideoJob(jobId, { progress: 10 });

      // Get audio duration
      const audioDuration = await this.getAudioDuration(projectAudio.filePath);
      const sceneDuration = audioDuration / scenes.length;

      console.log(`Audio duration: ${audioDuration}s, Scene duration: ${sceneDuration.toFixed(2)}s`);
      await storage.updateVideoJob(jobId, { progress: 20 });

      // Prepare image paths
      const imagePaths: string[] = [];
      for (const scene of scenes) {
        if (scene.imageUrl) {
          const imagePath = scene.imageUrl.replace('/api/scene-image/', './uploads/scenes/scene_');
          imagePaths.push(imagePath);
        }
      }

      if (imagePaths.length === 0) {
        throw new Error('No valid scene images found');
      }

      console.log(`Prepared ${imagePaths.length} scene images`);
      await storage.updateVideoJob(jobId, { progress: 30 });

      // Create output path
      const outputPath = `./uploads/videos/video_${jobId}.mp4`;
      
      // Create video with reliable settings
      await this.createVideoWithReliableSettings(
        imagePaths, 
        projectAudio.filePath, 
        outputPath, 
        audioDuration, 
        sceneDuration,
        jobId
      );

      // Get file size
      const stats = await fs.stat(outputPath);
      const fileSize = stats.size;

      console.log(`Reliable video completed: ${outputPath} (${fileSize} bytes)`);

      // Update job as completed
      await storage.updateVideoJob(jobId, { 
        status: 'completed', 
        progress: 100,
        videoUrl: `/uploads/videos/video_${jobId}.mp4`,
        fileSize
      });

      return `/uploads/videos/video_${jobId}.mp4`;

    } catch (error) {
      console.error('Reliable video generation error:', error);
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

  private static async createVideoWithReliableSettings(
    imagePaths: string[], 
    audioPath: string, 
    outputPath: string, 
    audioDuration: number,
    sceneDuration: number,
    jobId: string
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Create a reliable slideshow video
      const command = ffmpeg();

      // Add all images as inputs with duration
      imagePaths.forEach((imagePath, index) => {
        command.input(imagePath)
          .inputOptions([
            '-loop', '1',
            '-t', sceneDuration.toString()
          ]);
      });

      // Add audio input
      command.input(audioPath);

      // Create filter complex for seamless transitions
      let filterComplex = '';
      let inputs = '';
      
      for (let i = 0; i < imagePaths.length; i++) {
        filterComplex += `[${i}:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1[v${i}];`;
        inputs += `[v${i}]`;
      }
      
      filterComplex += `${inputs}concat=n=${imagePaths.length}:v=1:a=0[outv]`;

      command
        .complexFilter(filterComplex)
        .outputOptions([
          '-map', '[outv]',
          '-map', `${imagePaths.length}:a`,
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '20',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-b:v', '6000k',
          '-maxrate', '8000k',
          '-bufsize', '12000k',
          '-r', '25',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-shortest',
          '-t', audioDuration.toString()
        ])
        .output(outputPath)
        .on('progress', async (progress) => {
          if (progress.percent) {
            const videoProgress = Math.min(95, Math.round(40 + (progress.percent * 0.55)));
            await storage.updateVideoJob(jobId, { progress: videoProgress });
            console.log(`Reliable video progress: ${videoProgress}%`);
          }
        })
        .on('end', () => {
          console.log('Reliable video generation completed successfully');
          resolve();
        })
        .on('error', (err) => {
          console.error('Reliable video generation error:', err);
          reject(err);
        })
        .run();
    });
  }
}