import { EventEmitter } from 'events';
import { generateDalleImages, generateImagesWithReferences, CharacterDNA, generateSoraVideos } from './openai';
import { storage } from '../storage';
import { getModelConfig } from '../config';

export interface SoraSceneInput {
  id: number;
  sceneNumber: number;
  soraPrompt: string | null;
  soraClipLength: number | null;
  imageUrl: string | null;
}

export interface SoraVideoJob {
  id: string;
  scriptId: number;
  scenes: SoraSceneInput[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    completed: number;
    total: number;
  };
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  jobType: 'sora-video';
}

export interface ImageGenerationJob {
  id: string;
  scriptId: number;
  scenes: any[];
  style: string;
  customStylePrompt?: string;
  maintainContinuity: boolean;
  referenceImageUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    completed: number;
    total: number;
  };
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  jobType?: 'standard' | 'character-aware';
  characters?: CharacterDNA[];
  sceneCharacterMap?: { [sceneNumber: number]: string[] };
}

type Job = ImageGenerationJob | SoraVideoJob;

class JobQueue extends EventEmitter {
  private jobs: Map<string, Job> = new Map();
  private processingJobs: Set<string> = new Set();
  private cancelledJobs: Set<string> = new Set();

  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      console.log(`Cancel request for unknown job: ${jobId}`);
      return false;
    }
    
    if (job.status === 'completed' || job.status === 'failed') {
      console.log(`Cannot cancel job ${jobId} - already ${job.status}`);
      return false;
    }
    
    console.log(`Cancelling job ${jobId} for script ${job.scriptId}`);
    this.cancelledJobs.add(jobId);
    job.status = 'failed';
    job.error = 'Cancelled by user';
    job.completedAt = new Date();
    this.emit('jobCancelled', job);
    return true;
  }

  cancelJobsByScript(scriptId: number): number {
    const jobs = this.getJobsByScript(scriptId);
    let cancelledCount = 0;
    
    for (const job of jobs) {
      if (job.status === 'pending' || job.status === 'processing') {
        if (this.cancelJob(job.id)) {
          cancelledCount++;
        }
      }
    }
    
    console.log(`Cancelled ${cancelledCount} jobs for script ${scriptId}`);
    return cancelledCount;
  }

  isJobCancelled(jobId: string): boolean {
    return this.cancelledJobs.has(jobId);
  }

  async addImageGenerationJob(
    scriptId: number,
    scenes: any[],
    style: string,
    customStylePrompt?: string,
    maintainContinuity: boolean = true,
    referenceImageUrl?: string,
    forceRegenerate: boolean = false
  ): Promise<string> {
    const jobId = `img_${scriptId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Improved filtering logic to handle failed/partial states
    const scenesToProcess = scenes.filter(scene => {
      // Always process if force regenerate is enabled
      if (forceRegenerate) return true;
      
      // Process scenes without images
      if (!scene.imageUrl) return true;
      
      // Process scenes with placeholder or corrupted image URLs
      if (scene.imageUrl === 'placeholder' || 
          scene.imageUrl === 'generating' || 
          scene.imageUrl === 'failed' ||
          scene.imageUrl === 'error' ||
          scene.imageUrl.includes('placeholder') ||
          scene.imageUrl.length < 50) { // Suspiciously short URLs likely corrupted
        return true;
      }
      
      // Skip scenes with valid base64 or URL images
      return false;
    });
    
    console.log(`Image generation job: Processing ${scenesToProcess.length} of ${scenes.length} scenes (forceRegenerate: ${forceRegenerate})`);
    
    const job: ImageGenerationJob = {
      id: jobId,
      scriptId,
      scenes: scenesToProcess,
      style,
      customStylePrompt,
      maintainContinuity,
      referenceImageUrl,
      status: 'pending',
      progress: {
        completed: 0,
        total: scenesToProcess.length
      },
      createdAt: new Date(),
      jobType: 'standard'
    };

    this.jobs.set(jobId, job);
    this.emit('jobAdded', job);
    
    // Start processing if not already running
    this.processQueue();
    
    return jobId;
  }

  async addCharacterImageGenerationJob(
    scriptId: number,
    scenes: any[],
    characters: CharacterDNA[],
    sceneCharacterMap: { [sceneNumber: number]: string[] },
    style: string,
    customStylePrompt?: string,
    referenceImageUrl?: string
  ): Promise<string> {
    const jobId = `char_img_${scriptId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`Character image generation job: Processing ${scenes.length} scenes with ${characters.length} characters`);
    if (referenceImageUrl) {
      console.log(`Reference image URL provided for character consistency: ${referenceImageUrl.substring(0, 50)}...`);
    }
    
    const job: ImageGenerationJob = {
      id: jobId,
      scriptId,
      scenes,
      style,
      customStylePrompt,
      maintainContinuity: true,
      referenceImageUrl,
      status: 'pending',
      progress: {
        completed: 0,
        total: scenes.length
      },
      createdAt: new Date(),
      jobType: 'character-aware',
      characters,
      sceneCharacterMap
    };

    this.jobs.set(jobId, job);
    this.emit('jobAdded', job);
    
    // Start processing if not already running
    this.processQueue();
    
    return jobId;
  }

  async addSoraVideoJob(
    scriptId: number,
    scenes: Array<{
      id: number;
      sceneNumber: number;
      soraPrompt: string | null;
      soraClipLength?: number | null;
      imageUrl: string | null;
    }>
  ): Promise<string> {
    const jobId = `sora_${scriptId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Filter and map scenes that have Sora prompts with proper typing
    const scenesToProcess: SoraSceneInput[] = scenes
      .filter(scene => scene.soraPrompt && scene.imageUrl)
      .map(scene => ({
        id: scene.id,
        sceneNumber: scene.sceneNumber,
        soraPrompt: scene.soraPrompt,
        soraClipLength: scene.soraClipLength || null,
        imageUrl: scene.imageUrl
      }));
    
    console.log(`Sora video job: Processing ${scenesToProcess.length} of ${scenes.length} scenes`);
    
    const job: SoraVideoJob = {
      id: jobId,
      scriptId,
      scenes: scenesToProcess,
      status: 'pending',
      progress: {
        completed: 0,
        total: scenesToProcess.length
      },
      createdAt: new Date(),
      jobType: 'sora-video'
    };

    this.jobs.set(jobId, job);
    this.emit('jobAdded', job);
    
    // Start processing
    this.processQueue();
    
    return jobId;
  }

  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  getJobsByScript(scriptId: number): Job[] {
    return Array.from(this.jobs.values()).filter(job => job.scriptId === scriptId);
  }

  getAllJobs(): Job[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  clearCompletedJobs(): void {
    const completedJobs = Array.from(this.jobs.entries())
      .filter(([_, job]) => job.status === 'completed');
    
    completedJobs.forEach(([jobId, _]) => {
      this.jobs.delete(jobId);
    });
  }

  private async processQueue() {
    const pendingJobs = Array.from(this.jobs.values())
      .filter(job => job.status === 'pending' && !this.processingJobs.has(job.id))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // Process jobs based on their type
    const concurrentPromises = pendingJobs.map(job => {
      if (job.jobType === 'sora-video') {
        return this.processSoraVideoJob(job as SoraVideoJob);
      }
      if ((job as ImageGenerationJob).jobType === 'character-aware') {
        return this.processCharacterImageJob(job as ImageGenerationJob);
      }
      return this.processImageGenerationJob(job as ImageGenerationJob);
    });
    
    // Don't await all jobs - let them run in parallel
    concurrentPromises.forEach(promise => {
      promise.catch((error: unknown) => {
        console.error('Error in concurrent job processing:', error);
      });
    });
  }

  private async processImageGenerationJob(job: ImageGenerationJob) {
    // Mark this job as being processed
    this.processingJobs.add(job.id);

    try {
      if (job.scenes.length === 0) {
        job.status = 'completed';
        job.completedAt = new Date();
        this.emit('jobCompleted', job);
        return;
      }

      job.status = 'processing';
      this.emit('jobUpdated', job);

      console.log(`Starting image generation job ${job.id} for script ${job.scriptId}`);
      
      // Process images in parallel batches of 3 to avoid overwhelming the API
      const batchSize = 3;
      const scenes = [...job.scenes];
      
      for (let i = 0; i < scenes.length; i += batchSize) {
        // Check if job was cancelled before starting batch
        if (this.isJobCancelled(job.id)) {
          console.log(`Job ${job.id} cancelled, stopping image generation`);
          break;
        }
        
        const batch = scenes.slice(i, Math.min(i + batchSize, scenes.length));
        
        // Process batch in parallel
        const promises = batch.map(async (scene) => {
          // Check if job was cancelled before processing this scene
          if (this.isJobCancelled(job.id)) {
            console.log(`Skipping scene ${scene.id} - job ${job.id} was cancelled`);
            return;
          }
          
          try {
            console.log(`Generating image for scene ${scene.id} (job ${job.id})`);
            
            // Get project-specific model settings if available
            let projectModelSettings = null;
            try {
              const script = await storage.getScript(job.scriptId);
              console.log(`Retrieved script for job ${job.id}:`, {
                id: script?.id,
                title: script?.title,
                hasModelSettings: !!script?.modelSettings,
                modelSettings: script?.modelSettings
              });
              
              if (script && script.modelSettings) {
                projectModelSettings = script.modelSettings;
                console.log("Using project-specific model settings for job:", JSON.stringify(projectModelSettings));
              } else {
                console.log("No project-specific model settings found, using global settings");
              }
            } catch (error) {
              console.log("Error retrieving project model settings:", error);
            }
            
            // Use global config if no project settings
            if (!projectModelSettings) {
              projectModelSettings = getModelConfig();
              console.log("Using global model settings:", JSON.stringify(projectModelSettings));
            }
            
            // Generate image for individual scene
            const updatedScenes = await generateDalleImages(
              [scene],
              job.style,
              job.maintainContinuity,
              job.customStylePrompt,
              job.referenceImageUrl,
              projectModelSettings
            );
            
            if (updatedScenes[0]?.imageUrl) {
              // Update scene in database
              await storage.updateScene(scene.id, { 
                imageUrl: updatedScenes[0].imageUrl 
              });
              
              job.progress.completed++;
              this.emit('jobProgress', job, scene.id, updatedScenes[0].imageUrl);
              
              console.log(`Completed image for scene ${scene.id} (job ${job.id})`);
            } else {
              console.error(`Image generation failed for scene ${scene.id} - likely blocked by content moderation`);
              job.progress.completed++; // Still count as processed even if failed
              this.emit('jobProgress', job, scene.id, null); // Emit null to indicate failure
            }
          } catch (error) {
            console.error(`Error generating image for scene ${scene.id}:`, error);
            // Continue with other scenes even if one fails
          }
        });
        
        await Promise.all(promises);
        
        // Update job progress
        this.emit('jobUpdated', job);
        
        // Small delay between batches to be nice to the API
        if (i + batchSize < scenes.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      job.status = 'completed';
      job.completedAt = new Date();
      this.emit('jobCompleted', job);
      
      console.log(`Completed image generation job ${job.id} for script ${job.scriptId}`);
      
    } catch (error) {
      console.error(`Error processing job ${job.id}:`, error);
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.completedAt = new Date();
      this.emit('jobFailed', job);
    } finally {
      // Remove job from processing set when done
      this.processingJobs.delete(job.id);
    }
  }

  private async processCharacterImageJob(job: ImageGenerationJob) {
    // Mark this job as being processed
    this.processingJobs.add(job.id);

    try {
      if (job.scenes.length === 0 || !job.characters || !job.sceneCharacterMap) {
        job.status = 'completed';
        job.completedAt = new Date();
        this.emit('jobCompleted', job);
        return;
      }

      job.status = 'processing';
      this.emit('jobUpdated', job);

      console.log(`Starting character-aware image generation job ${job.id} for script ${job.scriptId}`);
      console.log(`Characters: ${job.characters.length}, Scenes: ${job.scenes.length}`);

      // Get project-specific model settings
      let projectModelSettings = null;
      try {
        const script = await storage.getScript(job.scriptId);
        if (script?.modelSettings) {
          projectModelSettings = script.modelSettings;
        }
      } catch (error) {
        console.log("Error retrieving project model settings:", error);
      }

      if (!projectModelSettings) {
        projectModelSettings = getModelConfig();
      }

      // Use generateImagesWithReferences which handles sequential generation with character DNA
      const generatedImages = await generateImagesWithReferences(
        job.scenes,
        job.characters,
        job.sceneCharacterMap,
        job.style,
        job.customStylePrompt,
        projectModelSettings,
        job.referenceImageUrl
      );

      // Update scenes in database and track progress
      for (const generated of generatedImages) {
        const originalScene = job.scenes.find(s => s.sceneNumber === generated.sceneNumber);
        if (originalScene && generated.imageUrl) {
          await storage.updateScene(originalScene.id, {
            imageUrl: generated.imageUrl
          });
          
          job.progress.completed++;
          this.emit('jobProgress', job, originalScene.id, generated.imageUrl);
        } else {
          job.progress.completed++;
          this.emit('jobProgress', job, originalScene?.id, null);
        }
        this.emit('jobUpdated', job);
      }

      job.status = 'completed';
      job.completedAt = new Date();
      this.emit('jobCompleted', job);
      
      console.log(`Completed character-aware image generation job ${job.id} for script ${job.scriptId}`);
      
    } catch (error: unknown) {
      console.error(`Error processing character image job ${job.id}:`, error);
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.completedAt = new Date();
      this.emit('jobFailed', job);
    } finally {
      // Remove job from processing set when done
      this.processingJobs.delete(job.id);
    }
  }

  private async processSoraVideoJob(job: SoraVideoJob) {
    this.processingJobs.add(job.id);

    try {
      if (job.scenes.length === 0) {
        job.status = 'completed';
        job.completedAt = new Date();
        this.emit('jobCompleted', job);
        return;
      }

      job.status = 'processing';
      this.emit('jobUpdated', job);

      console.log(`Starting Sora video generation job ${job.id} for script ${job.scriptId}`);
      console.log(`Processing ${job.scenes.length} scenes with Sora prompts`);

      // Generate videos using the Sora service
      const results = await generateSoraVideos(
        job.scenes.map(scene => ({
          id: scene.id,
          sceneNumber: scene.sceneNumber,
          soraPrompt: scene.soraPrompt,
          soraClipLength: scene.soraClipLength,
          imageUrl: scene.imageUrl
        })),
        (completed, total) => {
          job.progress.completed = completed;
          job.progress.total = total;
          this.emit('jobProgress', job, null, null);
          this.emit('jobUpdated', job);
        }
      );

      // Update scenes with video URLs
      for (const result of results) {
        if (result.status === 'completed' && result.videoUrl) {
          await storage.updateScene(result.sceneId, {
            videoUrl: result.videoUrl
          });
          console.log(`Updated scene ${result.sceneId} with video: ${result.videoUrl}`);
        }
      }

      const completedCount = results.filter(r => r.status === 'completed').length;
      const failedCount = results.filter(r => r.status === 'failed').length;
      
      console.log(`Sora job ${job.id} completed: ${completedCount} videos generated, ${failedCount} failed`);

      job.status = 'completed';
      job.completedAt = new Date();
      this.emit('jobCompleted', job);
      
    } catch (error: unknown) {
      console.error(`Error processing Sora video job ${job.id}:`, error);
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.completedAt = new Date();
      this.emit('jobFailed', job);
    } finally {
      this.processingJobs.delete(job.id);
    }
  }

  // Clean up old completed jobs (older than 24 hours)
  cleanupOldJobs() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const jobsToDelete = Array.from(this.jobs.entries())
      .filter(([_, job]) => job.status === 'completed' && job.completedAt && job.completedAt < twentyFourHoursAgo);
    
    jobsToDelete.forEach(([jobId, _]) => {
      this.jobs.delete(jobId);
    });
  }
}

export const jobQueue = new JobQueue();

// Clean up old jobs every 30 minutes
setInterval(() => {
  jobQueue.cleanupOldJobs();
}, 30 * 60 * 1000);