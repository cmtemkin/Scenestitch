import { storage } from '../storage';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class KenBurnsVideoGenerator {
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

      console.log(`Creating Ken Burns video: ${scenesWithImages.length} scenes, ${audio.duration}s duration`);

      const tempDir = path.join('temp', `video_${jobId}`);
      await fs.mkdir(tempDir, { recursive: true });

      // Calculate scene duration
      const totalDuration = audio.duration || 120;
      const sceneDuration = totalDuration / scenesWithImages.length;
      console.log(`Each scene duration: ${sceneDuration.toFixed(2)}s`);

      await storage.updateVideoJob(jobId, { progress: 15 });

      // Save scene images to files
      const imagePaths: string[] = [];
      for (let i = 0; i < scenesWithImages.length; i++) {
        const scene = scenesWithImages[i];
        const imageData = scene.imageUrl!.replace(/^data:image\/[a-z]+;base64,/, '');
        const imageBuffer = Buffer.from(imageData, 'base64');
        const imagePath = path.join(tempDir, `scene_${i.toString().padStart(3, '0')}.png`);
        await fs.writeFile(imagePath, imageBuffer);
        imagePaths.push(imagePath);
      }

      console.log(`Prepared ${imagePaths.length} scene images for Ken Burns effect`);
      await storage.updateVideoJob(jobId, { progress: 30 });

      // Create direct video with Ken Burns effects using single FFmpeg command
      const outputPath = path.join('uploads', 'videos', `video_${jobId}.mp4`);
      const audioPath = audio.audioUrl.startsWith('/') ? audio.audioUrl.substring(1) : audio.audioUrl;
      console.log(`Using audio file: ${audioPath}`);

      // Create concat file with Ken Burns durations
      const concatFile = path.join(tempDir, 'concat.txt');
      let concatContent = '';
      
      for (const imagePath of imagePaths) {
        concatContent += `file '${path.resolve(imagePath)}'\n`;
        concatContent += `duration ${sceneDuration}\n`;
      }
      // Add the last image again to make duration work properly
      if (imagePaths.length > 0) {
        concatContent += `file '${path.resolve(imagePaths[imagePaths.length - 1])}'`;
      }
      
      await fs.writeFile(concatFile, concatContent);
      console.log('Created concat file for Ken Burns processing');

      await storage.updateVideoJob(jobId, { progress: 40 });

      // Generate video with Ken Burns effect using concat method
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatFile)
          .inputOptions([
            '-f', 'concat',
            '-safe', '0'
          ])
          .input(audioPath)
          .outputOptions([
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-vf', 'scale=2304:1296:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z=1.1:d=125:s=1920x1080',
            '-r', '25',
            '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero',
            '-shortest'
          ])
          .output(outputPath)
          .on('progress', async (progress) => {
            if (progress.percent) {
              const videoProgress = Math.min(95, Math.round(40 + (progress.percent * 0.55)));
              await storage.updateVideoJob(jobId, { progress: videoProgress });
              console.log(`Ken Burns video progress: ${videoProgress}%`);
            }
          })
          .on('end', () => {
            console.log('Ken Burns video completed');
            resolve();
          })
          .on('error', (err) => {
            console.error('Ken Burns video generation failed:', err);
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
        duration: totalDuration
      });

      // Cleanup temp directory
      await fs.rm(tempDir, { recursive: true, force: true });

      return videoUrl;
    } catch (error) {
      console.error(`Ken Burns generation failed for job ${jobId}:`, error);
      await storage.updateVideoJob(jobId, { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  private static async createKenBurnsScene(
    imagePath: string, 
    outputPath: string, 
    duration: number,
    pattern: number
  ): Promise<void> {
    const imageFile = imagePath.replace('/uploads/', '');
    
    // Define different Ken Burns patterns
    const patterns = [
      // Zoom in from center
      { 
        scale: 'scale=2560:1440:force_original_aspect_ratio=increase',
        zoom: `zoompan=z='1+0.1*sin(t*0.1)':x='(iw-ow)/2':y='(ih-oh)/2':d=${Math.ceil(duration * 25)}:s=1920x1080:fps=25`
      },
      // Pan left to right with slight zoom
      {
        scale: 'scale=2560:1440:force_original_aspect_ratio=increase', 
        zoom: `zoompan=z='1.1':x='iw*t/${duration}/2':y='(ih-oh)/2':d=${Math.ceil(duration * 25)}:s=1920x1080:fps=25`
      },
      // Pan right to left with zoom out
      {
        scale: 'scale=2560:1440:force_original_aspect_ratio=increase',
        zoom: `zoompan=z='1.2-0.05*t/${duration}':x='iw-ow-iw*t/${duration}/3':y='(ih-oh)/2':d=${Math.ceil(duration * 25)}:s=1920x1080:fps=25`
      },
      // Diagonal pan with zoom
      {
        scale: 'scale=2560:1440:force_original_aspect_ratio=increase',
        zoom: `zoompan=z='1.05+0.05*sin(t*0.2)':x='iw*t/${duration}/4':y='ih*t/${duration}/4':d=${Math.ceil(duration * 25)}:s=1920x1080:fps=25`
      }
    ];

    const selectedPattern = patterns[pattern];

    return new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(imageFile)
        .outputOptions([
          '-vf', `${selectedPattern.scale},${selectedPattern.zoom}`,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-t', duration.toString()
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }
}