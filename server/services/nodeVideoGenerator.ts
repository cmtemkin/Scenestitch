import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

interface VideoGenerationOptions {
  imageFiles: string[];
  audioFile: string;
  outputPath: string;
  duration?: number;
  sceneDurations?: number[];
}

export class NodeVideoGenerator {
  private static async ensureDirectoryExists(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
  }

  static async generateSimpleSlideshow(options: VideoGenerationOptions): Promise<string> {
    const { imageFiles, audioFile, outputPath, duration = 158 } = options;
    
    await this.ensureDirectoryExists(outputPath);

    // Use a simple, reliable FFmpeg command that works within system limits
    return new Promise((resolve, reject) => {
      const args = [
        '-y', // Overwrite output file
        '-loop', '1',
        '-i', imageFiles[0], // Use first image for now
        '-i', audioFile,
        '-c:v', 'libx264',
        '-preset', 'ultrafast', // Fastest encoding
        '-crf', '30', // Lower quality for faster processing
        '-c:a', 'aac',
        '-b:a', '64k', // Lower audio bitrate
        '-pix_fmt', 'yuv420p',
        '-vf', 'scale=1280:720', // Lower resolution for reliability
        '-movflags', '+faststart',
        '-shortest',
        '-t', duration.toString(),
        outputPath
      ];

      console.log('Starting FFmpeg with args:', args.slice(0, 10), '...');
      
      const ffmpeg = spawn('ffmpeg', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderr = '';
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', async (code) => {
        if (code === 0) {
          try {
            // Verify the file was created and has content
            const stats = await fs.stat(outputPath);
            if (stats.size > 1000) { // More than 1KB indicates actual content
              console.log(`Video generated successfully: ${stats.size} bytes`);
              resolve(outputPath);
            } else {
              reject(new Error(`Generated file is too small: ${stats.size} bytes`));
            }
          } catch (error) {
            reject(new Error(`Failed to verify output file: ${error}`));
          }
        } else {
          console.error('FFmpeg error:', stderr);
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
        }
      });

      ffmpeg.on('error', (error) => {
        console.error('FFmpeg spawn error:', error);
        reject(error);
      });
    });
  }

  static async generateMultiImageSlideshow(options: VideoGenerationOptions): Promise<string> {
    const { imageFiles, audioFile, outputPath, sceneDurations } = options;
    
    if (imageFiles.length === 0) {
      throw new Error('No image files provided');
    }

    await this.ensureDirectoryExists(outputPath);

    // Create a simple concat file for multiple images
    const concatFilePath = path.join(path.dirname(outputPath), 'concat_list.txt');
    const defaultDuration = sceneDurations ? sceneDurations[0] || 5 : 5;
    
    const concatContent = imageFiles.map(imagePath => 
      `file '${path.resolve(imagePath)}'\nduration ${defaultDuration}`
    ).join('\n') + '\nfile \'' + path.resolve(imageFiles[imageFiles.length - 1]) + '\'';
    
    await fs.writeFile(concatFilePath, concatContent);

    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFilePath,
        '-i', audioFile,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '30',
        '-c:a', 'aac',
        '-b:a', '64k',
        '-pix_fmt', 'yuv420p',
        '-vf', 'scale=1280:720',
        '-movflags', '+faststart',
        '-shortest',
        outputPath
      ];

      const ffmpeg = spawn('ffmpeg', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderr = '';
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', async (code) => {
        // Clean up concat file
        try {
          await fs.unlink(concatFilePath);
        } catch (error) {
          console.warn('Failed to clean up concat file:', error);
        }

        if (code === 0) {
          try {
            const stats = await fs.stat(outputPath);
            if (stats.size > 1000) {
              console.log(`Multi-image video generated: ${stats.size} bytes`);
              resolve(outputPath);
            } else {
              reject(new Error(`Generated file is too small: ${stats.size} bytes`));
            }
          } catch (error) {
            reject(new Error(`Failed to verify output file: ${error}`));
          }
        } else {
          console.error('FFmpeg error:', stderr);
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
        }
      });

      ffmpeg.on('error', (error) => {
        console.error('FFmpeg spawn error:', error);
        reject(error);
      });
    });
  }
}