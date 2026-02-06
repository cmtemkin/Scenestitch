import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

export class BackgroundVideoGenerator {
  private static runningJobs = new Map<string, any>();

  static async generateVideoInBackground(
    projectId: number,
    imageFiles: string[],
    audioFile: string,
    duration: number = 30
  ): Promise<string> {
    const jobId = `bg_video_${projectId}_${Date.now()}`;
    const outputPath = `./uploads/videos/video_project_${projectId}_background.mp4`;
    
    // Use the first available image
    const imageFile = imageFiles[0] || './uploads/thumbnail_1749566481021.png';
    
    return new Promise((resolve, reject) => {
      // Create a detached process that runs independently
      const ffmpegProcess = spawn('nohup', [
        'sh', '-c', 
        `ffmpeg -y -loop 1 -i "${imageFile}" -i "${audioFile}" -c:v libx264 -preset ultrafast -crf 35 -c:a aac -b:a 64k -pix_fmt yuv420p -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" -movflags +faststart -t ${duration} "${outputPath}" && echo "COMPLETED:${outputPath}" > "./uploads/videos/status_${jobId}.txt"`
      ], {
        detached: true,
        stdio: 'ignore'
      });

      // Don't wait for the process - let it run in background
      ffmpegProcess.unref();
      
      // Store job info
      this.runningJobs.set(jobId, {
        projectId,
        outputPath,
        startTime: Date.now(),
        status: 'running'
      });

      console.log(`Started background video generation: ${jobId}`);
      resolve(jobId);
    });
  }

  static async checkJobStatus(jobId: string): Promise<{ status: string; outputPath?: string; progress?: number }> {
    const job = this.runningJobs.get(jobId);
    if (!job) {
      return { status: 'not_found' };
    }

    const statusFile = `./uploads/videos/status_${jobId}.txt`;
    
    try {
      const statusContent = await fs.readFile(statusFile, 'utf-8');
      if (statusContent.includes('COMPLETED:')) {
        const outputPath = statusContent.split('COMPLETED:')[1].trim();
        
        // Verify the file exists and has reasonable size
        try {
          const stats = await fs.stat(outputPath);
          if (stats.size > 10000) { // At least 10KB
            this.runningJobs.set(jobId, { ...job, status: 'completed' });
            return { status: 'completed', outputPath, progress: 100 };
          }
        } catch (error) {
          console.error('Failed to verify output file:', error);
        }
      }
    } catch (error) {
      // Status file doesn't exist yet - job still running
    }

    // Check if job has been running too long (timeout after 5 minutes)
    const elapsed = Date.now() - job.startTime;
    if (elapsed > 300000) {
      this.runningJobs.set(jobId, { ...job, status: 'timeout' });
      return { status: 'timeout', progress: 0 };
    }

    // Estimate progress based on time elapsed (rough approximation)
    const estimatedProgress = Math.min(90, (elapsed / 60000) * 50); // 50% progress per minute, max 90%
    
    return { status: 'running', progress: estimatedProgress };
  }

  static async generateSimpleVideo(
    projectId: number,
    imageFile: string,
    audioFile: string
  ): Promise<string> {
    const outputPath = `./uploads/videos/simple_video_${projectId}.mp4`;
    
    // Use a very simple, minimal FFmpeg command
    const command = [
      'ffmpeg', '-y',
      '-loop', '1', '-i', imageFile,
      '-i', audioFile,
      '-c:v', 'libx264', '-preset', 'ultrafast',
      '-c:a', 'copy',  // Copy audio without re-encoding
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=1280:720',
      '-t', '20',  // Short duration to ensure completion
      outputPath
    ];

    return new Promise((resolve, reject) => {
      console.log('Starting simple video generation...');
      
      const process = spawn(command[0], command.slice(1), {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Set a timeout to prevent hanging
      const timeout = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error('Video generation timed out'));
      }, 30000); // 30 second timeout

      process.on('close', async (code) => {
        clearTimeout(timeout);
        
        if (code === 0) {
          try {
            const stats = await fs.stat(outputPath);
            console.log(`Simple video generated: ${stats.size} bytes`);
            resolve(outputPath);
          } catch (error) {
            reject(new Error(`Output file verification failed: ${error}`));
          }
        } else {
          console.error('FFmpeg stderr:', stderr);
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      process.on('error', (error) => {
        clearTimeout(timeout);
        console.error('Process error:', error);
        reject(error);
      });
    });
  }
}