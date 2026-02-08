import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { storage } from '../storage';

const execAsync = promisify(exec);

export class BasicVideoGenerator {
  static async generateVideo(projectId: number, existingJobId?: string): Promise<string> {
    const jobId = existingJobId ?? `basic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      if (!existingJobId) {
        await storage.createVideoJob({
          id: jobId,
          projectId,
          status: 'processing',
          progress: 0,
          settings: { type: 'basic', quality: 'standard' }
        });
      } else {
        await storage.updateVideoJob(jobId, {
          projectId,
          status: 'processing',
          progress: 0,
          error: null
        });
      }

      console.log(`Starting basic video generation for project ${projectId}`);
      await storage.updateVideoJob(jobId, { progress: 10 });

      // Get project and audio info
      const project = await storage.getScript(projectId);
      if (!project?.audioTTSId) {
        throw new Error('Project missing audio');
      }

      const audioRecord = await storage.getAudioTTS(project.audioTTSId);
      if (!audioRecord?.audioUrl) {
        throw new Error('Audio file not found');
      }

      const scenes = await storage.getScenesByScriptId(projectId);
      const firstScene = scenes.find(s => s.imageUrl);
      if (!firstScene?.imageUrl) {
        throw new Error('No scene images found');
      }

      const audioPath = '.' + audioRecord.audioUrl;
      
      // Handle different image URL formats
      let imagePath: string;
      if (firstScene.imageUrl.startsWith('/uploads/')) {
        imagePath = '.' + firstScene.imageUrl;
      } else if (firstScene.imageUrl.startsWith('/api/scene-image/')) {
        imagePath = firstScene.imageUrl.replace('/api/scene-image/', './uploads/scenes/scene_');
      } else {
        imagePath = './uploads' + firstScene.imageUrl;
      }
      
      const outputPath = `./uploads/videos/video_${jobId}.mp4`;

      console.log(`Creating video: ${imagePath} + ${audioPath}`);
      await storage.updateVideoJob(jobId, { progress: 30 });

      // Check if files exist
      try {
        await fs.access(imagePath);
        await fs.access(audioPath);
      } catch (error) {
        throw new Error('Required files not accessible');
      }

      await storage.updateVideoJob(jobId, { progress: 50 });

      // Create video with minimal FFmpeg command
      const ffmpegCmd = [
        'ffmpeg -y',
        `-loop 1 -i "${imagePath}"`,
        `-i "${audioPath}"`,
        '-c:v libx264 -tune stillimage -c:a aac',
        '-b:a 192k -pix_fmt yuv420p',
        '-shortest',
        `"${outputPath}"`
      ].join(' ');

      console.log('Executing FFmpeg...');
      const { stdout, stderr } = await execAsync(ffmpegCmd);
      
      if (stderr && !stderr.includes('time=')) {
        console.log('FFmpeg stderr:', stderr);
      }

      await storage.updateVideoJob(jobId, { progress: 90 });

      // Verify output file
      const stats = await fs.stat(outputPath);
      if (stats.size === 0) {
        throw new Error('Generated video file is empty');
      }

      await storage.updateVideoJob(jobId, { 
        status: 'completed', 
        progress: 100,
        videoUrl: `/uploads/videos/video_${jobId}.mp4`,
        fileSize: stats.size
      });

      console.log(`Basic video completed: ${stats.size} bytes`);
      return jobId;

    } catch (error) {
      console.error('Basic video generation error:', error);
      await storage.updateVideoJob(jobId, { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}
