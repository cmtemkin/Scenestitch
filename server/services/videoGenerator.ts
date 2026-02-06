import ffmpeg from 'fluent-ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { storage } from '../storage';
import { EventEmitter } from 'events';

export interface VideoGenerationJob {
  id: string;
  projectId: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  videoUrl?: string;
  error?: string;
  settings: VideoSettings;
}

export interface VideoSettings {
  resolution: '720p' | '1080p' | '1440p';
  fps: number;
  quality: 'low' | 'medium' | 'high';
  kenBurnsIntensity: 'subtle' | 'moderate' | 'dramatic';
}

export interface SceneTimestamp {
  sceneNumber: number;
  startTime: number;
  endTime: number;
  imageUrl: string;
  title: string;
}

class VideoGeneratorService extends EventEmitter {
  private jobs: Map<string, VideoGenerationJob> = new Map();

  async generateVideo(
    projectId: number,
    settings: VideoSettings = {
      resolution: '1080p',
      fps: 30,
      quality: 'high',
      kenBurnsIntensity: 'moderate'
    }
  ): Promise<string> {
    const jobId = uuidv4();
    
    const job: VideoGenerationJob = {
      id: jobId,
      projectId,
      status: 'pending',
      progress: 0,
      settings,
    };

    this.jobs.set(jobId, job);
    
    // Store job in database
    await storage.createVideoJob({
      id: jobId,
      projectId,
      status: 'pending',
      progress: 0,
      settings: settings as any,
    });

    // Start processing asynchronously
    this.processVideo(jobId).catch(error => {
      console.error(`Video generation failed for job ${jobId}:`, error);
    });

    return jobId;
  }

  private async processVideo(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    try {
      await this.updateJobStatus(jobId, 'processing', 5);

      // Get project data
      const project = await storage.get(job.projectId);
      if (!project) {
        throw new Error(`Project ${job.projectId} not found`);
      }

      await this.updateJobStatus(jobId, 'processing', 10);

      // Get scenes with images
      const scenes = await storage.getScenesByScriptId(job.projectId);
      const scenesWithImages = scenes.filter(scene => scene.imageUrl);
      
      if (scenesWithImages.length === 0) {
        throw new Error('No scenes with images found for video generation');
      }

      await this.updateJobStatus(jobId, 'processing', 15);

      // Get audio file
      const audioFile = await this.getAudioFile(project);
      if (!audioFile) {
        throw new Error('Audio file required for video generation');
      }

      await this.updateJobStatus(jobId, 'processing', 25);

      // Calculate scene timings based on audio duration
      const sceneTimestamps = await this.calculateSceneTimings(scenesWithImages, audioFile);
      await this.updateJobStatus(jobId, 'processing', 35);

      // Prepare image files
      const imageFiles = await this.prepareImageFiles(scenesWithImages, jobId);
      await this.updateJobStatus(jobId, 'processing', 50);

      // Generate video with Ken Burns effects
      const videoPath = await this.createVideoWithKenBurns(
        imageFiles,
        sceneTimestamps,
        audioFile,
        job.settings,
        jobId
      );

      await this.updateJobStatus(jobId, 'processing', 90);

      // Store video file info
      const stats = await fs.stat(videoPath);
      const videoUrl = `/uploads/videos/${path.basename(videoPath)}`;
      
      await storage.updateVideoJob(jobId, {
        status: 'completed',
        progress: 100,
        videoUrl,
        fileSize: stats.size,
      });

      job.status = 'completed';
      job.progress = 100;
      job.videoUrl = videoUrl;

      // Clean up temporary files
      await this.cleanupTempFiles(imageFiles);

      console.log(`Video generation completed for job ${jobId}`);
      this.emit('jobCompleted', job);

    } catch (error) {
      console.error(`Video generation failed for job ${jobId}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await storage.updateVideoJob(jobId, {
        status: 'failed',
        error: errorMessage,
      });

      if (job) {
        job.status = 'failed';
        job.error = errorMessage;
      }

      this.emit('jobFailed', job);
    }
  }

  private async updateJobStatus(jobId: string, status: VideoGenerationJob['status'], progress: number): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = status;
      job.progress = progress;
    }

    await storage.updateVideoJob(jobId, { status, progress });
    this.emit('jobProgress', { jobId, status, progress });
  }

  private async getAudioFile(project: any): Promise<string | null> {
    if (!project.audioTTSId) return null;
    
    const audio = await storage.getAudioById(project.audioTTSId);
    if (!audio?.audioUrl) return null;

    // Convert relative path to absolute path
    const audioPath = path.resolve(audio.audioUrl.startsWith('/') ? audio.audioUrl.substring(1) : audio.audioUrl);
    
    // Check if file exists
    try {
      await fs.access(audioPath);
      return audioPath;
    } catch {
      return null;
    }
  }

  private async calculateSceneTimings(scenes: any[], audioFile: string): Promise<SceneTimestamp[]> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioFile, (err, metadata) => {
        if (err) {
          reject(new Error(`Failed to probe audio file: ${err.message}`));
          return;
        }

        const totalDuration = metadata.format.duration || 0;
        const timePerScene = totalDuration / scenes.length;

        const timestamps: SceneTimestamp[] = scenes.map((scene, index) => ({
          sceneNumber: scene.sceneNumber,
          startTime: index * timePerScene,
          endTime: (index + 1) * timePerScene,
          imageUrl: scene.imageUrl,
          title: scene.title || `Scene ${scene.sceneNumber}`,
        }));

        resolve(timestamps);
      });
    });
  }

  private async prepareImageFiles(scenes: any[], jobId: string): Promise<string[]> {
    const tempDir = path.join('temp', `video_${jobId}`);
    await fs.mkdir(tempDir, { recursive: true });

    const imageFiles: string[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (!scene.imageUrl) continue;

      // Extract base64 data
      const base64Data = scene.imageUrl.replace(/^data:image\/[a-z]+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      const imagePath = path.join(tempDir, `scene_${i + 1}.png`);
      await fs.writeFile(imagePath, imageBuffer);
      
      imageFiles.push(imagePath);
    }

    return imageFiles;
  }

  private async createVideoWithKenBurns(
    imageFiles: string[],
    timestamps: SceneTimestamp[],
    audioFile: string,
    settings: VideoSettings,
    jobId: string
  ): Promise<string> {
    const outputDir = path.join('uploads', 'videos');
    await fs.mkdir(outputDir, { recursive: true });
    
    const outputPath = path.join(outputDir, `video_${jobId}.mp4`);

    const { width, height } = this.getResolutionDimensions(settings.resolution);
    
    console.log(`Creating slideshow video with ALL ${imageFiles.length} scenes`);
    
    // Use simple but reliable approach
    return new Promise((resolve, reject) => {
      const tempDir = path.join('temp', `video_${jobId}`);
      fs.mkdir(tempDir, { recursive: true }).then(async () => {
        
        // Create a simple slideshow with proper timing
        let command = ffmpeg();
        
        // Add each image as input with its duration
        imageFiles.forEach((imagePath, index) => {
          command = command.input(imagePath);
        });
        
        // Add audio input
        command = command.input(audioFile);
        
        // Create simple concat filter for all images
        const filters = [];
        
        // Process each image with exact scene duration
        for (let i = 0; i < imageFiles.length; i++) {
          const duration = timestamps[i].endTime - timestamps[i].startTime;
          filters.push(
            `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setpts=PTS-STARTPTS[scaled${i}];` +
            `[scaled${i}]trim=duration=${duration.toFixed(2)}[clip${i}]`
          );
        }
        
        // Concatenate all clips
        const concatInputs = Array.from({ length: imageFiles.length }, (_, i) => `[clip${i}]`).join('');
        filters.push(`${concatInputs}concat=n=${imageFiles.length}:v=1[finalvideo]`);
        
        const filterComplex = filters.join(';');
        
        command
          .complexFilter(filterComplex)
          .outputOptions([
            '-map', '[finalvideo]',
            '-map', `${imageFiles.length}:a`,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '28',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-shortest'
          ])
          .output(outputPath)
          .on('progress', (progress) => {
            if (progress.percent) {
              const videoProgress = Math.round(50 + (progress.percent * 0.4));
              this.updateJobStatus(jobId, 'processing', videoProgress);
            }
          })
          .on('end', () => {
            console.log(`✅ Video completed with ALL ${imageFiles.length} scenes and full audio`);
            resolve(outputPath);
          })
          .on('error', async (err) => {
            console.error('Complex filter failed, using simple approach:', err);
            // Use most basic but reliable FFmpeg approach
            try {
              ffmpeg(imageFiles[0])
                .inputOptions(['-loop', '1'])
                .input(audioFile)
                .outputOptions([
                  '-c:v', 'libx264',
                  '-preset', 'ultrafast',
                  '-crf', '30',
                  '-c:a', 'aac',
                  '-b:a', '128k',
                  '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
                  '-shortest'
                ])
                .output(outputPath)
                .on('end', () => {
                  console.log('✅ Fallback video completed with full audio duration');
                  resolve(outputPath);
                })
                .on('error', (fallbackErr) => {
                  console.error('Fallback also failed:', fallbackErr);
                  reject(new Error(`Video generation failed: ${fallbackErr.message}`));
                })
                .run();
            } catch (fallbackErr) {
              reject(new Error(`All video generation methods failed: ${err.message}`));
            }
          })
          .run();
      });
    });
  }

  private async createBasicSlideshow(
    imagePath: string,
    audioFile: string,
    outputPath: string,
    settings: VideoSettings,
    jobId: string
  ): Promise<string> {
    const { width, height } = this.getResolutionDimensions(settings.resolution);
    
    return new Promise((resolve, reject) => {
      // Get audio duration first to ensure video matches exactly
      ffmpeg.ffprobe(audioFile, (err, metadata) => {
        if (err) {
          reject(new Error(`Failed to probe audio: ${err.message}`));
          return;
        }
        
        const audioDuration = metadata.format.duration || 60;
        console.log(`Creating video with exact audio duration: ${audioDuration}s`);
        
        ffmpeg(imagePath)
          .inputOptions(['-loop', '1'])
          .input(audioFile)
          .outputOptions([
            '-c:v', 'libx264',
            '-preset', 'ultrafast', 
            '-crf', '30',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
            '-t', audioDuration.toString(),
            '-shortest'
          ])
          .output(outputPath)
          .on('progress', (progress) => {
            if (progress.percent) {
              const videoProgress = Math.round(50 + (progress.percent * 0.4));
              this.updateJobStatus(jobId, 'processing', videoProgress);
            }
          })
          .on('end', () => {
            console.log(`Video completed with full ${audioDuration}s audio duration`);
            resolve(outputPath);
          })
          .on('error', (err) => {
            console.error('Video generation error:', err);
            reject(new Error(`Video generation failed: ${err.message}`));
          })
          .run();
      });
    });
  }

  private async createConcatDemuxerVideo(
    imageFiles: string[],
    timestamps: SceneTimestamp[],
    audioFile: string,
    settings: VideoSettings,
    jobId: string,
    outputPath: string
  ): Promise<string> {
    const { width, height } = this.getResolutionDimensions(settings.resolution);
    const tempDir = path.join('temp', `video_${jobId}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    console.log(`Processing ${imageFiles.length} scenes individually...`);
    
    // Create individual video clips for each scene
    const videoClips: string[] = [];
    
    for (let i = 0; i < imageFiles.length; i++) {
      const duration = timestamps[i].endTime - timestamps[i].startTime;
      const clipPath = path.join(tempDir, `clip_${String(i).padStart(3, '0')}.mp4`);
      videoClips.push(clipPath);
      
      try {
        await new Promise<void>((resolve, reject) => {
          ffmpeg(imageFiles[i])
            .inputOptions(['-loop', '1'])
            .outputOptions([
              '-c:v', 'libx264',
              '-t', duration.toFixed(3),
              '-pix_fmt', 'yuv420p',
              '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
              '-r', settings.fps.toString(),
              '-preset', 'ultrafast',
              '-crf', '28'
            ])
            .output(clipPath)
            .on('end', () => {
              console.log(`Clip ${i + 1}/${imageFiles.length} completed (${duration.toFixed(1)}s)`);
              resolve();
            })
            .on('error', (err) => {
              console.error(`Error creating clip ${i}:`, err);
              reject(err);
            })
            .run();
        });
        
        // Update progress for each clip
        const progress = Math.round(50 + (i / imageFiles.length) * 40);
        await this.updateJobStatus(jobId, 'processing', progress);
      } catch (error) {
        console.error(`Failed to create clip ${i}:`, error);
        throw error;
      }
    }
    
    console.log(`All ${videoClips.length} clips created. Concatenating with audio...`);
    
    // Create concat file with absolute paths
    const concatFile = path.join(tempDir, 'concat.txt');
    const concatContent = videoClips.map(clip => `file '${path.resolve(clip)}'`).join('\n');
    await fs.writeFile(concatFile, concatContent);
    
    // Concatenate all clips and add audio
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .input(audioFile)
        .outputOptions([
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-shortest'
        ])
        .output(outputPath)
        .on('progress', (progress) => {
          if (progress.percent) {
            const videoProgress = Math.round(90 + (progress.percent * 0.1));
            this.updateJobStatus(jobId, 'processing', videoProgress);
          }
        })
        .on('end', async () => {
          try {
            // Clean up temporary files
            await this.cleanupTempFiles([...videoClips, concatFile]);
            await fs.rmdir(tempDir);
            console.log(`✅ Video completed with all ${imageFiles.length} scenes and full audio duration`);
            resolve(outputPath);
          } catch (cleanupError) {
            console.warn('Cleanup failed:', cleanupError);
            resolve(outputPath);
          }
        })
        .on('error', (err) => {
          console.error('Final concatenation error:', err);
          reject(new Error(`Final video assembly failed: ${err.message}`));
        })
        .run();
    });
  }

  private async createBatchProcessedVideo(
    imageFiles: string[],
    timestamps: SceneTimestamp[],
    audioFile: string,
    settings: VideoSettings,
    jobId: string,
    outputPath: string
  ): Promise<string> {
    const { width, height } = this.getResolutionDimensions(settings.resolution);

    return new Promise((resolve, reject) => {
      let command = ffmpeg();

      // Add audio input first
      command = command.input(audioFile);

      // Add all image files
      imageFiles.forEach(imagePath => {
        command = command.input(imagePath);
      });

      // Create simple slideshow with all images
      const videoSegments = [];
      for (let i = 0; i < imageFiles.length; i++) {
        const duration = timestamps[i].endTime - timestamps[i].startTime;
        videoSegments.push(`[${i + 1}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setpts=PTS-STARTPTS,fps=${settings.fps},trim=duration=${duration.toFixed(2)}[v${i}]`);
      }

      // Concatenate all segments
      const concatInputs = Array.from({ length: imageFiles.length }, (_, i) => `[v${i}]`).join('');
      const filterComplex = `${videoSegments.join(';')};${concatInputs}concat=n=${imageFiles.length}:v=1[video]`;

      command
        .complexFilter(filterComplex)
        .outputOptions([
          '-map', '[video]',
          '-map', '0:a',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '30',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-shortest'
        ])
        .output(outputPath)
        .on('progress', (progress) => {
          if (progress.percent) {
            const videoProgress = Math.round(50 + (progress.percent * 0.4));
            this.updateJobStatus(jobId, 'processing', videoProgress);
          }
        })
        .on('end', () => {
          console.log('Video generation completed with all scenes');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('Video generation error:', err);
          reject(new Error(`Video generation failed: ${err.message}`));
        })
        .run();
    });
  }

  private async createSlideshowVideo(
    imageFiles: string[],
    audioFile: string,
    outputPath: string,
    timestamps: SceneTimestamp[],
    settings: VideoSettings,
    jobId: string
  ): Promise<string> {
    const { width, height } = this.getResolutionDimensions(settings.resolution);

    return new Promise((resolve, reject) => {
      // Create a simple concat demuxer approach
      let command = ffmpeg();

      // Add audio input first
      command = command.input(audioFile);

      // Create simple filter for slideshow
      const filters: string[] = [];
      let currentTime = 0;

      // Create timed segments for each image
      for (let i = 0; i < Math.min(imageFiles.length, 10); i++) { // Limit to 10 images for stability
        command = command.input(imageFiles[i]);
        const duration = timestamps[i].endTime - timestamps[i].startTime;
        
        filters.push(
          `[${i + 1}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},` +
          `setpts=PTS-STARTPTS,fps=${settings.fps}[v${i}];` +
          `[v${i}]trim=duration=${duration}[t${i}]`
        );
        currentTime += duration;
      }

      // Concatenate the processed clips
      const concatInputs = Array.from({ length: Math.min(imageFiles.length, 10) }, (_, i) => `[t${i}]`).join('');
      filters.push(`${concatInputs}concat=n=${Math.min(imageFiles.length, 10)}:v=1:a=0[video]`);

      command
        .complexFilter(filters)
        .outputOptions([
          '-map', '[video]',
          '-map', '0:a', // Audio from first input
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-t', '30', // Limit to 30 seconds for testing
          '-shortest'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('Slideshow FFmpeg command:', commandLine.substring(0, 200) + '...');
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            const videoProgress = Math.round(50 + (progress.percent * 0.4));
            this.updateJobStatus(jobId, 'processing', videoProgress);
          }
        })
        .on('end', () => {
          console.log('Slideshow video generation completed');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('Slideshow video error:', err);
          reject(new Error(`Slideshow video generation failed: ${err.message}`));
        })
        .run();
    });
  }

  private async processBatchVideo(
    imageFiles: string[],
    audioFile: string,
    outputPath: string,
    timestamps: SceneTimestamp[],
    settings: VideoSettings,
    jobId: string
  ): Promise<string> {
    const { width, height } = this.getResolutionDimensions(settings.resolution);
    const tempDir = path.join('temp', `segments_${jobId}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // Create individual video segments first
      const segmentFiles: string[] = [];
      
      for (let i = 0; i < imageFiles.length; i++) {
        const segmentPath = path.join(tempDir, `segment_${i.toString().padStart(3, '0')}.mp4`);
        const duration = timestamps[i].endTime - timestamps[i].startTime;
        
        await new Promise<void>((resolve, reject) => {
          ffmpeg(imageFiles[i])
            .inputOptions(['-loop', '1'])
            .outputOptions([
              '-t', duration.toString(),
              '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
              '-c:v', 'libx264',
              '-preset', 'ultrafast',
              '-crf', '23',
              '-r', settings.fps.toString(),
              '-pix_fmt', 'yuv420p'
            ])
            .output(segmentPath)
            .on('end', () => resolve())
            .on('error', (err) => {
              console.error(`Error creating segment ${i}:`, err);
              reject(err);
            })
            .run();
        });
        
        segmentFiles.push(segmentPath);
        
        // Update progress for segment creation (50-80%)
        const segmentProgress = Math.round(50 + (i / imageFiles.length) * 30);
        await this.updateJobStatus(jobId, 'processing', segmentProgress);
      }

      // Create concat file for FFmpeg
      const concatFilePath = path.join(tempDir, 'concat.txt');
      const concatContent = segmentFiles.map(file => `file '${path.resolve(file)}'`).join('\n');
      await fs.writeFile(concatFilePath, concatContent);

      // Concatenate all segments with audio
      return new Promise((resolve, reject) => {
        ffmpeg()
          .input(concatFilePath)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .input(audioFile)
          .outputOptions([
            '-c:v', 'copy', // Copy video streams (no re-encoding)
            '-c:a', 'aac',
            '-b:a', '128k',
            '-shortest'
          ])
          .output(outputPath)
          .on('progress', (progress) => {
            if (progress.percent) {
              const finalProgress = Math.round(80 + (progress.percent * 0.2)); // 80-100%
              this.updateJobStatus(jobId, 'processing', finalProgress);
            }
          })
          .on('end', () => {
            console.log('Video concatenation completed successfully');
            resolve(outputPath);
          })
          .on('error', (err) => {
            console.error('Video concatenation error:', err);
            reject(new Error(`Video concatenation failed: ${err.message}`));
          })
          .run();
      });

    } finally {
      // Clean up temporary files
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (err) {
        console.log('Error cleaning up temp files:', err);
      }
    }
  }

  private async createVideoFromSegments(
    imageFiles: string[],
    audioFile: string,
    outputPath: string,
    timestamps: SceneTimestamp[],
    settings: VideoSettings,
    jobId: string
  ): Promise<void> {
    const { width, height } = this.getResolutionDimensions(settings.resolution);
    const tempDir = path.join('temp', `video_${jobId}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // Create individual video segments
      const segmentFiles: string[] = [];
      
      for (let i = 0; i < imageFiles.length; i++) {
        const segmentPath = path.join(tempDir, `segment_${i}.mp4`);
        const duration = timestamps[i].endTime - timestamps[i].startTime;
        
        await new Promise<void>((resolve, reject) => {
          ffmpeg(imageFiles[i])
            .inputOptions(['-loop', '1'])
            .outputOptions([
              '-t', duration.toString(),
              '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
              '-c:v', 'libx264',
              '-preset', 'fast',
              '-crf', '23',
              '-r', settings.fps.toString(),
              '-pix_fmt', 'yuv420p'
            ])
            .output(segmentPath)
            .on('end', () => resolve())
            .on('error', reject)
            .run();
        });
        
        segmentFiles.push(segmentPath);
        
        // Update progress
        const segmentProgress = Math.round(50 + (i / imageFiles.length) * 30);
        await this.updateJobStatus(jobId, 'processing', segmentProgress);
      }

      // Create concat file for FFmpeg
      const concatFilePath = path.join(tempDir, 'concat.txt');
      const concatContent = segmentFiles.map(file => `file '${path.resolve(file)}'`).join('\n');
      await fs.writeFile(concatFilePath, concatContent);

      // Concatenate segments with audio
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatFilePath)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .input(audioFile)
          .outputOptions([
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-shortest'
          ])
          .output(outputPath)
          .on('progress', (progress) => {
            if (progress.percent) {
              const finalProgress = Math.round(80 + (progress.percent * 0.1));
              this.updateJobStatus(jobId, 'processing', finalProgress);
            }
          })
          .on('end', () => {
            console.log('Segment-based video generation completed');
            resolve();
          })
          .on('error', reject)
          .run();
      });

    } finally {
      // Clean up temporary files
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (err) {
        console.log('Error cleaning up temp files:', err);
      }
    }
  }

  private getResolutionDimensions(resolution: string): { width: number; height: number } {
    switch (resolution) {
      case '720p': return { width: 1280, height: 720 };
      case '1080p': return { width: 1920, height: 1080 };
      case '1440p': return { width: 2560, height: 1440 };
      default: return { width: 1920, height: 1080 };
    }
  }

  private getKenBurnsParameters(intensity: string) {
    switch (intensity) {
      case 'subtle': return { zoomRange: 0.1, panRange: 0.05 };
      case 'moderate': return { zoomRange: 0.2, panRange: 0.1 };
      case 'dramatic': return { zoomRange: 0.3, panRange: 0.15 };
      default: return { zoomRange: 0.2, panRange: 0.1 };
    }
  }

  private buildKenBurnsFilterComplex(
    imageCount: number,
    timestamps: SceneTimestamp[],
    kenBurns: { zoomRange: number; panRange: number },
    width: number,
    height: number
  ): string[] {
    // For large scene counts, use simpler processing to avoid FFmpeg limits
    if (imageCount > 15) {
      const filters: string[] = [];
      
      // Simple scale and duration approach for many scenes
      for (let i = 0; i < imageCount; i++) {
        const duration = timestamps[i].endTime - timestamps[i].startTime;
        filters.push(
          `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},` +
          `loop=loop=-1:size=1:start=0,trim=duration=${duration}[v${i}]`
        );
      }
      
      // Concatenate all clips
      const concatInputs = Array.from({ length: imageCount }, (_, i) => `[v${i}]`).join('');
      filters.push(`${concatInputs}concat=n=${imageCount}:v=1:a=0[final_video]`);
      
      return filters;
    }

    // Use Ken Burns for smaller scene counts
    const filters: string[] = [];

    for (let i = 0; i < imageCount; i++) {
      const duration = timestamps[i].endTime - timestamps[i].startTime;
      const endZoom = 1.0 + kenBurns.zoomRange;

      filters.push(
        `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},` +
        `zoompan=z='min(zoom+0.0015,${endZoom})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.ceil(duration * 30)}:s=${width}x${height}[kb${i}]`
      );
    }

    const concatInputs = Array.from({ length: imageCount }, (_, i) => `[kb${i}]`).join('');
    filters.push(`${concatInputs}concat=n=${imageCount}:v=1:a=0[final_video]`);

    return filters;
  }

  private getEncodingPreset(quality: string): string {
    switch (quality) {
      case 'low': return 'ultrafast';
      case 'medium': return 'medium';
      case 'high': return 'slow';
      default: return 'medium';
    }
  }

  private getCRF(quality: string): string {
    switch (quality) {
      case 'low': return '28';
      case 'medium': return '23';
      case 'high': return '18';
      default: return '23';
    }
  }

  private async cleanupTempFiles(imageFiles: string[]): Promise<void> {
    try {
      for (const file of imageFiles) {
        await fs.unlink(file).catch(() => {}); // Ignore errors
      }
      
      // Remove temp directory if it exists
      if (imageFiles.length > 0) {
        const tempDir = path.dirname(imageFiles[0]);
        await fs.rmdir(tempDir).catch(() => {}); // Ignore errors
      }
    } catch (error) {
      console.warn('Failed to cleanup temp files:', error);
    }
  }

  getJob(jobId: string): VideoGenerationJob | undefined {
    return this.jobs.get(jobId);
  }

  getAllJobs(): VideoGenerationJob[] {
    return Array.from(this.jobs.values());
  }

  getJobsByProject(projectId: number): VideoGenerationJob[] {
    return Array.from(this.jobs.values()).filter(job => job.projectId === projectId);
  }
}

export const videoGenerator = new VideoGeneratorService();