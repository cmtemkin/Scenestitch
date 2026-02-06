import ffmpeg from 'fluent-ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { storage } from '../storage';
import { objectStorage } from '../objectStorage';
import { EventEmitter } from 'events';

export interface AnimationAssemblyJob {
  id: string;
  scriptId: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  videoUrl?: string;
  error?: string;
}

class AnimationAssemblyService extends EventEmitter {
  private jobs: Map<string, AnimationAssemblyJob> = new Map();
  private outputDir: string;
  private tempDir: string;

  constructor() {
    super();
    this.outputDir = path.join(import.meta.dirname, '..', '..', 'uploads', 'animated_videos');
    this.tempDir = path.join(import.meta.dirname, '..', '..', 'temp', 'animation_assembly');
  }

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.mkdir(this.tempDir, { recursive: true });
  }

  async assembleAnimatedVideo(scriptId: number): Promise<string> {
    const jobId = uuidv4();
    
    const job: AnimationAssemblyJob = {
      id: jobId,
      scriptId,
      status: 'pending',
      progress: 0,
    };

    this.jobs.set(jobId, job);
    
    // Start processing asynchronously
    this.processAssembly(jobId).catch(error => {
      console.error(`Animation assembly failed for job ${jobId}:`, error);
    });

    return jobId;
  }

  private async updateJobStatus(
    jobId: string, 
    status: AnimationAssemblyJob['status'], 
    progress: number,
    error?: string
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = status;
      job.progress = progress;
      if (error) job.error = error;
      this.emit('jobUpdated', job);
    }
  }

  private async processAssembly(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    try {
      await this.ensureDirectories();
      await this.updateJobStatus(jobId, 'processing', 5);

      // Get all scenes with animated clips
      const scenes = await storage.getScenesByScriptId(job.scriptId);
      const animatedScenes = scenes
        .filter(scene => scene.animatedClipUrl)
        .sort((a, b) => a.sceneNumber - b.sceneNumber);

      if (animatedScenes.length === 0) {
        throw new Error('No animated clips found for this project');
      }

      console.log(`[ANIMATION_ASSEMBLY] Found ${animatedScenes.length} animated clips to assemble`);
      await this.updateJobStatus(jobId, 'processing', 10);

      // Download all clips to temp directory
      const localClips: string[] = [];
      for (let i = 0; i < animatedScenes.length; i++) {
        const scene = animatedScenes[i];
        const storagePath = scene.animatedClipUrl!.replace('/api/object-storage/', '');
        
        try {
          const videoBuffer = await objectStorage.downloadToBuffer(storagePath);
          const buffer = videoBuffer;
          
          const localPath = path.join(this.tempDir, `clip_${job.id}_${i}.mp4`);
          await fs.writeFile(localPath, buffer);
          localClips.push(localPath);
          
          const progress = 10 + (40 * (i + 1) / animatedScenes.length);
          await this.updateJobStatus(jobId, 'processing', Math.round(progress));
          
          console.log(`[ANIMATION_ASSEMBLY] Downloaded clip ${i + 1}/${animatedScenes.length}`);
        } catch (err) {
          console.error(`[ANIMATION_ASSEMBLY] Error downloading clip for scene ${scene.id}:`, err);
          throw new Error(`Failed to download clip for scene ${scene.sceneNumber}`);
        }
      }

      await this.updateJobStatus(jobId, 'processing', 50);

      // Create concat list file for FFmpeg
      const concatListPath = path.join(this.tempDir, `concat_${job.id}.txt`);
      const concatContent = localClips.map(clip => `file '${clip}'`).join('\n');
      await fs.writeFile(concatListPath, concatContent);

      console.log(`[ANIMATION_ASSEMBLY] Created concat list with ${localClips.length} clips`);
      await this.updateJobStatus(jobId, 'processing', 55);

      // Concatenate clips using FFmpeg
      const outputFilename = `animated_${job.scriptId}_${Date.now()}.mp4`;
      const outputPath = path.join(this.outputDir, outputFilename);

      await this.concatenateClips(concatListPath, outputPath, jobId);
      await this.updateJobStatus(jobId, 'processing', 85);

      // Upload to object storage
      const outputBuffer = await fs.readFile(outputPath);
      const storagePath = `video/animated/${outputFilename}`;
      await objectStorage.uploadBuffer(outputBuffer, storagePath, 'video/mp4');

      const videoUrl = `/api/object-storage/${storagePath}`;

      // Update script with final video URL
      await storage.updateScript(job.scriptId, {
        finalAnimatedVideoUrl: videoUrl,
        finalAnimatedVideoStorageKey: storagePath,
        animationStatus: 'completed'
      });

      // Update job status
      job.videoUrl = videoUrl;
      await this.updateJobStatus(jobId, 'completed', 100);

      console.log(`[ANIMATION_ASSEMBLY] Assembly complete: ${videoUrl}`);

      // Cleanup temp files
      await this.cleanupTempFiles(job.id, localClips, concatListPath, outputPath);

    } catch (error: any) {
      console.error(`[ANIMATION_ASSEMBLY] Job ${jobId} failed:`, error);
      await this.updateJobStatus(jobId, 'failed', 0, error.message);
      
      // Update script status
      await storage.updateScript(job.scriptId, {
        animationStatus: 'failed'
      });
    }
  }

  private async concatenateClips(
    concatListPath: string, 
    outputPath: string,
    jobId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'fast',
          '-crf', '23',
          '-movflags', '+faststart'
        ])
        .on('start', (command) => {
          console.log(`[ANIMATION_ASSEMBLY] FFmpeg command: ${command}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            const adjustedProgress = 55 + (30 * progress.percent / 100);
            this.updateJobStatus(jobId, 'processing', Math.round(adjustedProgress));
          }
        })
        .on('error', (err) => {
          console.error(`[ANIMATION_ASSEMBLY] FFmpeg error:`, err);
          reject(err);
        })
        .on('end', () => {
          console.log(`[ANIMATION_ASSEMBLY] FFmpeg concatenation complete`);
          resolve();
        })
        .save(outputPath);
    });
  }

  private async cleanupTempFiles(
    jobId: string,
    clips: string[],
    concatList: string,
    outputPath: string
  ): Promise<void> {
    try {
      // Remove clip files
      for (const clip of clips) {
        await fs.unlink(clip).catch(() => {});
      }
      
      // Remove concat list
      await fs.unlink(concatList).catch(() => {});
      
      // Remove local output file (already uploaded to storage)
      await fs.unlink(outputPath).catch(() => {});
      
      console.log(`[ANIMATION_ASSEMBLY] Cleaned up temp files for job ${jobId}`);
    } catch (err) {
      console.warn(`[ANIMATION_ASSEMBLY] Error cleaning up temp files:`, err);
    }
  }

  getJob(jobId: string): AnimationAssemblyJob | undefined {
    return this.jobs.get(jobId);
  }

  async getJobStatus(jobId: string): Promise<AnimationAssemblyJob | null> {
    return this.jobs.get(jobId) || null;
  }
}

export const animationAssemblyService = new AnimationAssemblyService();
