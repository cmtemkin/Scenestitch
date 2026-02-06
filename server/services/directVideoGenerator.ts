import ffmpeg from 'fluent-ffmpeg';
import { storage } from '../storage';

export class DirectVideoGenerator {
  static async generateVideo(projectId: number): Promise<string> {
    const jobId = `direct_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      await storage.createVideoJob({
        id: jobId,
        projectId,
        status: 'processing',
        progress: 0,
        settings: { type: 'direct', quality: 'high' }
      });

      const project = await storage.getScript(projectId);
      const scenes = await storage.getScenesByScriptId(projectId);
      
      if (!scenes?.length || !project?.audioTTSId) {
        throw new Error('Missing scenes or audio');
      }

      const audioRecord = await storage.getAudioTTS(project.audioTTSId);
      if (!audioRecord?.audioUrl) {
        throw new Error('Audio file not found');
      }

      const audioPath = '.' + audioRecord.audioUrl;
      const firstScene = scenes.find(scene => scene.imageUrl);
      if (!firstScene || !firstScene.imageUrl) {
        throw new Error('No valid scene images found');
      }
      
      const imagePath = firstScene.imageUrl.replace('/api/scene-image/', './uploads/scenes/scene_');
      const outputPath = `./uploads/videos/video_${jobId}.mp4`;

      console.log(`Direct video: Using ${imagePath} with ${audioPath}`);
      await storage.updateVideoJob(jobId, { progress: 20 });

      // Create video directly with minimal options
      await new Promise<void>((resolve, reject) => {
        ffmpeg(imagePath)
          .input(audioPath)
          .outputOptions([
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-shortest',
            '-y'
          ])
          .output(outputPath)
          .on('progress', async (progress) => {
            if (progress.percent) {
              const videoProgress = Math.min(95, Math.round(30 + (progress.percent * 0.65)));
              await storage.updateVideoJob(jobId, { progress: videoProgress });
              console.log(`Direct video progress: ${videoProgress}%`);
            }
          })
          .on('end', () => {
            console.log('Direct video completed');
            resolve();
          })
          .on('error', (err) => {
            console.error('Direct video error:', err);
            reject(err);
          })
          .run();
      });

      // Get file stats and complete
      const fs = await import('fs/promises');
      const stats = await fs.stat(outputPath);
      const fileSize = stats.size;

      await storage.updateVideoJob(jobId, { 
        status: 'completed', 
        progress: 100,
        videoUrl: `/uploads/videos/video_${jobId}.mp4`,
        fileSize
      });

      console.log(`Direct video completed: ${fileSize} bytes`);
      return jobId;

    } catch (error) {
      console.error('Direct video error:', error);
      await storage.updateVideoJob(jobId, { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}