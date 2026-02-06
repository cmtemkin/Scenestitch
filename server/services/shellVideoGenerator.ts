import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { storage } from '../storage';

const execAsync = promisify(exec);

export class ShellVideoGenerator {
  static async generateVideo(projectId: number): Promise<string> {
    const jobId = `shell_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      await storage.createVideoJob({
        id: jobId,
        projectId,
        status: 'processing',
        progress: 0,
        settings: { type: 'shell', quality: 'high' }
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

      console.log(`Shell video: Using ${imagePath} with ${audioPath}`);
      await storage.updateVideoJob(jobId, { progress: 20 });

      // Create video using direct ffmpeg shell command
      const command = `ffmpeg -loop 1 -i "${imagePath}" -i "${audioPath}" -c:v libx264 -c:a aac -shortest -y "${outputPath}"`;
      
      console.log('Executing FFmpeg command...');
      await storage.updateVideoJob(jobId, { progress: 50 });
      
      const { stdout, stderr } = await execAsync(command);
      console.log('FFmpeg output:', stdout);
      if (stderr) console.log('FFmpeg stderr:', stderr);

      await storage.updateVideoJob(jobId, { progress: 90 });

      // Get file stats and complete
      const stats = await fs.stat(outputPath);
      const fileSize = stats.size;

      await storage.updateVideoJob(jobId, { 
        status: 'completed', 
        progress: 100,
        videoUrl: `/uploads/videos/video_${jobId}.mp4`,
        fileSize
      });

      console.log(`Shell video completed: ${fileSize} bytes`);
      return jobId;

    } catch (error) {
      console.error('Shell video error:', error);
      await storage.updateVideoJob(jobId, { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}