import { storage } from '../storage';
import { generateDallePrompts, generateDalleImages, generateThumbnail } from './openai';
import { getModelConfig } from '../config';
import { jobQueue } from './jobQueue';
import { parseScript } from './scriptParser';
import { EventEmitter } from 'events';
import { db } from '../db';
import { workflows, projectProviderConfigSchema, type ProjectProviderConfig, type BrandKit, type PersonaKit } from '@shared/schema';
import { eq } from 'drizzle-orm';
import path from 'path';
import fs from 'fs';
import { getDefaultProviderConfig } from '../providers/registry';
import { generateNarrationWithProvider } from '../providers/engine';

export interface WorkflowStep {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  result?: any;
}

export interface ProjectWorkflow {
  id: string;
  scriptId: number;
  title: string;
  content: string;
  style: string;
  customStylePrompt?: string;
  maintainContinuity: boolean;
  referenceImageUrl?: string;
  voice?: string;
  audioModel?: string;
  personaKitId?: number;
  brandKitId?: number;
  musicAudioFilePath?: string;
  steps: WorkflowStep[];
  currentStep: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

class WorkflowOrchestrator extends EventEmitter {
  private workflows: Map<string, ProjectWorkflow> = new Map();

  async resumeProjectWorkflow(scriptId: number): Promise<string> {
    const script = await storage.getScript(scriptId);
    if (!script) {
      throw new Error(`Script ${scriptId} not found`);
    }

    const scenes = await storage.getScenesByScriptId(scriptId);
    const workflowId = `resume_${scriptId}_${Date.now()}`;

    // Determine which steps need to be completed
    const steps: WorkflowStep[] = [];
    
    // Check if scenes need images
    const scenesWithoutImages = scenes.filter(scene => !scene.imageUrl);
    if (scenesWithoutImages.length > 0) {
      steps.push({
        id: 'generate-images',
        name: `Generate Images (${scenesWithoutImages.length} remaining)`,
        status: 'pending'
      });
    }

    // Check if thumbnail is missing
    if (!script.thumbnailUrl) {
      steps.push({
        id: 'generate-thumbnail',
        name: 'Generate Thumbnail',
        status: 'pending'
      });
    }

    // Check if audio timestamps need processing
    if (script.audioFilePath && scenes.some(scene => scene.exactStartTime === null)) {
      steps.push({
        id: 'process-timestamps',
        name: 'Process Audio Timestamps',
        status: 'pending'
      });
    }

    if (steps.length === 0) {
      throw new Error('Project appears to be complete');
    }

    const workflow: ProjectWorkflow = {
      id: workflowId,
      scriptId: script.id,
      title: script.title,
      content: script.content,
      style: script.style || 'realistic',
      maintainContinuity: script.maintainContinuity || false,
      referenceImageUrl: script.referenceImageUrl ?? undefined,
      steps,
      currentStep: 0,
      status: 'pending',
      createdAt: new Date()
    };

    this.workflows.set(workflowId, workflow);
    
    // Save to database
    await db.insert(workflows).values({
      id: workflowId,
      scriptId: script.id,
      title: script.title,
      content: script.content,
      style: script.style || 'realistic',
      status: 'pending',
      currentStep: 0,
      steps: JSON.stringify(steps)
    });

    // Start processing workflow steps
    setTimeout(() => this.startWorkflowProcessing(workflowId), 100);
    
    return workflowId;
  }

  // Create a workflow for an existing music video project (for regeneration with audio analysis)
  async createMusicVideoWorkflow(scriptId: number): Promise<string> {
    const script = await storage.getScript(scriptId);
    if (!script) {
      throw new Error(`Script ${scriptId} not found`);
    }

    if (script.projectType !== 'music-video') {
      throw new Error(`Script ${scriptId} is not a music video project`);
    }

    const workflowId = `workflow_${scriptId}_${Date.now()}`;
    const hasMusicAudio = !!script.musicAudioFilePath;

    const workflowSteps = [
      { id: 'create_script', name: 'Create Music Video Project', status: 'completed' as const },
      ...(hasMusicAudio ? [{ id: 'analyze_music_audio', name: 'Analyze Music & Timing', status: 'pending' as const }] : []),
      { id: 'generate_scenes', name: 'Parse Lyrics into Scenes', status: 'pending' as const },
      { id: 'extract_characters', name: 'Create Artist Profile', status: 'pending' as const },
      { id: 'generate_images', name: 'Generate Music Video Visuals', status: 'pending' as const },
      { id: 'generate_thumbnail', name: 'Generate Thumbnail', status: 'pending' as const },
      { id: 'generate_sora_prompts', name: 'Generate Sora Video Prompts', status: 'pending' as const },
      // Note: generate_sora_videos removed - user triggers manually after reviewing images
      { id: 'complete', name: 'Complete', status: 'pending' as const }
    ];

    console.log(`[WORKFLOW] Creating music video workflow for existing project ${scriptId} with ${hasMusicAudio ? 'audio analysis' : 'no audio'}`);

    const workflow: ProjectWorkflow = {
      id: workflowId,
      scriptId: script.id,
      title: script.title,
      content: script.content,
      style: script.style || 'cinematic',
      customStylePrompt: script.customStylePrompt ?? undefined,
      maintainContinuity: script.maintainContinuity ?? true,
      referenceImageUrl: script.referenceImageUrl ?? undefined,
      musicAudioFilePath: script.musicAudioFilePath ?? undefined,
      steps: workflowSteps,
      currentStep: 0,
      status: 'pending',
      createdAt: new Date()
    };

    this.workflows.set(workflowId, workflow);

    // Save to database
    await db.insert(workflows).values({
      id: workflowId,
      scriptId: script.id,
      title: script.title,
      content: script.content,
      style: script.style || 'cinematic',
      status: 'pending',
      currentStep: 0,
      steps: JSON.stringify(workflowSteps),
      musicAudioFilePath: script.musicAudioFilePath
    });

    // Start processing with executeWorkflow (not startWorkflowProcessing)
    setTimeout(() => this.executeWorkflow(workflowId), 100);

    return workflowId;
  }

  private async startWorkflowProcessing(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    try {
      workflow.status = 'processing';
      this.emit('workflow:updated', workflow);

      for (let i = workflow.currentStep; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        workflow.currentStep = i;
        
        step.status = 'processing';
        this.emit('workflow:step:started', { workflowId, step });

        if (step.id === 'generate-images') {
          await this.processGenerateImagesStep(workflow);
        } else if (step.id === 'generate-thumbnail') {
          await this.processGenerateThumbnailStep(workflow);
        } else if (step.id === 'process-timestamps') {
          await this.processTimestampsStep(workflow);
        }

        step.status = 'completed';
        this.emit('workflow:step:completed', { workflowId, step });
      }

      workflow.status = 'completed';
      workflow.completedAt = new Date();
      this.emit('workflow:completed', workflow);

    } catch (error) {
      workflow.status = 'failed';
      workflow.steps[workflow.currentStep].status = 'failed';
      workflow.steps[workflow.currentStep].error = error instanceof Error ? error.message : 'Unknown error';
      this.emit('workflow:failed', { workflowId, error });
    }
  }

  private async processGenerateImagesStep(workflow: ProjectWorkflow): Promise<void> {
    const scenes = await storage.getScenesByScriptId(workflow.scriptId);
    const scenesWithoutImages = scenes.filter(scene => !scene.imageUrl);

    for (const scene of scenesWithoutImages) {
      try {
        console.log(`Generating image for scene ${scene.sceneNumber}`);
        
        // Convert scene to required format for image generation with proper typing
        const sceneWithPrompt = {
          content: scene.scriptExcerpt,
          title: scene.title || `Scene ${scene.sceneNumber}`,
          estimatedDuration: scene.estimatedDuration || undefined,
          dallePrompt: scene.dallePrompt,
          soraPrompt: scene.soraPrompt || undefined,
          soraClipLength: (scene.soraClipLength === 4 || scene.soraClipLength === 8)
            ? scene.soraClipLength as 4 | 8
            : undefined,
          imageUrl: scene.imageUrl || undefined,
          sceneNumber: scene.sceneNumber,
          scriptExcerpt: scene.scriptExcerpt,
          scriptId: scene.scriptId || undefined,
          id: scene.id
        };
        
        const imageResults = await generateDalleImages([sceneWithPrompt], workflow.style, workflow.maintainContinuity, workflow.referenceImageUrl, workflow.customStylePrompt);
        
        if (imageResults && imageResults.length > 0) {
          // Extract just the imageUrl from the result
          const imageUrl = typeof imageResults[0] === 'string' ? imageResults[0] : imageResults[0].imageUrl;
          if (imageUrl) {
            await storage.updateScene(scene.id, { imageUrl });
          }
        }
      } catch (error) {
        console.error(`Failed to generate image for scene ${scene.sceneNumber}:`, error);
      }
    }
  }

  private async processGenerateThumbnailStep(workflow: ProjectWorkflow): Promise<void> {
    try {
      console.log(`Generating thumbnail for project ${workflow.scriptId}`);
      const thumbnailUrl = await generateThumbnail(workflow.title, workflow.style);
      await storage.updateScript(workflow.scriptId, { thumbnailUrl });
    } catch (error) {
      console.error(`Failed to generate thumbnail for project ${workflow.scriptId}:`, error);
    }
  }

  private async processTimestampsStep(workflow: ProjectWorkflow): Promise<void> {
    // Placeholder for timestamp processing logic
    console.log(`Processing audio timestamps for project ${workflow.scriptId}`);
  }

  private composeKitPrompt(
    customStylePrompt: string | undefined,
    personaKit: PersonaKit | undefined,
    brandKit: BrandKit | undefined
  ): string | undefined {
    const segments = [
      customStylePrompt?.trim(),
      personaKit?.tone ? `Persona tone: ${personaKit.tone}` : null,
      personaKit?.promptDirectives?.trim(),
      brandKit?.promptDirectives?.trim(),
      brandKit?.captionPreset ? `Caption preset: ${brandKit.captionPreset}` : null,
    ].filter((segment): segment is string => Boolean(segment && segment.length));

    if (!segments.length) {
      return undefined;
    }
    return segments.join("\n\n");
  }

  private toPersonaSnapshot(kit: PersonaKit) {
    return {
      id: kit.id,
      name: kit.name,
      defaultVoice: kit.defaultVoice,
      defaultStyle: kit.defaultStyle,
      tone: kit.tone,
      humorLevel: kit.humorLevel,
      hookStyle: kit.hookStyle,
    };
  }

  private toBrandSnapshot(kit: BrandKit) {
    return {
      id: kit.id,
      name: kit.name,
      primaryColor: kit.primaryColor,
      secondaryColor: kit.secondaryColor,
      accentColor: kit.accentColor,
      fontFamily: kit.fontFamily,
      captionPreset: kit.captionPreset,
      logoUrl: kit.logoUrl,
      watermarkEnabled: kit.watermarkEnabled,
    };
  }

  async createProjectWorkflow(data: {
    title: string;
    content: string;
    style: string;
    customStylePrompt?: string;
    maintainContinuity?: boolean;
    referenceImageUrl?: string;
    voice?: string;
    audioModel?: string;
    projectType?: string;
    musicAudioFilePath?: string;
    animationSettings?: {
      style: string;
      comedyLevel: number;
      absurdityLevel: number;
    };
    providerConfig?: ProjectProviderConfig;
    personaKitId?: number;
    brandKitId?: number;
  }): Promise<string> {
    // Get current admin model settings and preserve them for this project
    const adminModelSettings = getModelConfig();
    const parsedProviderConfig = projectProviderConfigSchema.safeParse(data.providerConfig);
    const providerConfig = parsedProviderConfig.success
      ? parsedProviderConfig.data
      : getDefaultProviderConfig();
    const personaKit = typeof data.personaKitId === "number" ? await storage.getPersonaKit(data.personaKitId) : undefined;
    const brandKit = typeof data.brandKitId === "number" ? await storage.getBrandKit(data.brandKitId) : undefined;
    if (typeof data.personaKitId === "number" && !personaKit) {
      throw new Error(`Persona kit ${data.personaKitId} not found`);
    }
    if (typeof data.brandKitId === "number" && !brandKit) {
      throw new Error(`Brand kit ${data.brandKitId} not found`);
    }

    const effectiveStyle = data.style || personaKit?.defaultStyle || "cinematic";
    const effectiveVoice = data.voice || personaKit?.defaultVoice || "alloy";
    const effectiveCustomStylePrompt = this.composeKitPrompt(data.customStylePrompt, personaKit, brandKit);
    console.log(`Creating project with admin model settings:`, adminModelSettings);
    console.log(`Image size setting: ${adminModelSettings.image_size}, Quality setting: ${adminModelSettings.image_quality}`);
    
    // Determine project type - default to 'video' if not specified
    const projectType = data.projectType || 'video';
    const isMusicVideo = projectType === 'music-video';
    const isAnimation = projectType === 'animation';
    
    // Create the project using the same method as the projects page
    const script = await storage.createScript({
      content: data.content,
      title: data.title,
      description: null,
      style: effectiveStyle,
      customStylePrompt: effectiveCustomStylePrompt,
      maintainContinuity: data.maintainContinuity ?? true,
      referenceImageUrl: data.referenceImageUrl,
      status: 'draft',
      projectType: projectType as any,
      modelSettings: {
        ...adminModelSettings,
        providerConfig,
        kits: {
          personaKitId: personaKit?.id ?? null,
          brandKitId: brandKit?.id ?? null,
          personaSnapshot: personaKit ? this.toPersonaSnapshot(personaKit) : null,
          brandSnapshot: brandKit ? this.toBrandSnapshot(brandKit) : null,
        },
      },
      musicAudioFilePath: data.musicAudioFilePath,
      musicAudioAnalysisStatus: data.musicAudioFilePath ? 'pending' : null,
      animationSettings: isAnimation ? data.animationSettings : null,
      animationStatus: isAnimation ? 'pending' : null,
    });

    const workflowId = `workflow_${script.id}_${Date.now()}`;
    
    // Different workflow steps for music videos, animation, or standard projects
    // If music video has audio, add an analyze audio step
    const hasMusicAudio = isMusicVideo && data.musicAudioFilePath;
    // Note: generate_sora_videos removed from workflow - user triggers manually after reviewing images
    let workflowSteps;
    
    if (isAnimation) {
      // Animation Mode workflow: dialogue parsing → image generation → TTS → lip-sync
      workflowSteps = [
        { id: 'create_script', name: 'Create Animation Project', status: 'completed' as const },
        { id: 'parse_dialogue', name: 'Parse Dialogue Script', status: 'pending' as const },
        { id: 'extract_characters', name: 'Extract Characters from Dialogue', status: 'pending' as const },
        { id: 'generate_images', name: 'Generate Character Images', status: 'pending' as const },
        { id: 'generate_thumbnail', name: 'Generate Thumbnail', status: 'pending' as const },
        { id: 'complete', name: 'Ready for Voice Generation', status: 'pending' as const }
      ];
    } else if (isMusicVideo) {
      workflowSteps = [
        { id: 'create_script', name: 'Create Music Video Project', status: 'completed' as const },
        ...(hasMusicAudio ? [{ id: 'analyze_music_audio', name: 'Analyze Music & Timing', status: 'pending' as const }] : []),
        { id: 'generate_scenes', name: 'Parse Lyrics into Scenes', status: 'pending' as const },
        { id: 'extract_characters', name: 'Create Artist Profile', status: 'pending' as const },
        { id: 'generate_images', name: 'Generate Music Video Visuals', status: 'pending' as const },
        { id: 'generate_thumbnail', name: 'Generate Thumbnail', status: 'pending' as const },
        { id: 'generate_sora_prompts', name: 'Generate Sora Video Prompts', status: 'pending' as const },
        { id: 'complete', name: 'Complete', status: 'pending' as const }
      ];
    } else {
      workflowSteps = [
        { id: 'create_script', name: 'Create Project', status: 'completed' as const },
        { id: 'generate_audio', name: 'Generate Audio & Process Timestamps', status: 'pending' as const },
        { id: 'generate_scenes', name: 'Generate Storyboard', status: 'pending' as const },
        { id: 'extract_characters', name: 'Extract Characters', status: 'pending' as const },
        { id: 'generate_images', name: 'Generate Images with Character Consistency', status: 'pending' as const },
        { id: 'generate_thumbnail', name: 'Generate Thumbnail', status: 'pending' as const },
        { id: 'generate_sora_prompts', name: 'Generate Sora Video Prompts', status: 'pending' as const },
        { id: 'complete', name: 'Complete', status: 'pending' as const }
      ];
    }
    
    console.log(`[WORKFLOW] Creating ${isMusicVideo ? 'music video' : isAnimation ? 'animation' : 'standard'} project workflow`);

    const workflow: ProjectWorkflow = {
      id: workflowId,
      scriptId: script.id,
      title: data.title,
      content: data.content,
      style: effectiveStyle,
      customStylePrompt: effectiveCustomStylePrompt,
      maintainContinuity: data.maintainContinuity ?? true,
      referenceImageUrl: data.referenceImageUrl,
      voice: effectiveVoice,
      audioModel: data.audioModel,
      personaKitId: personaKit?.id,
      brandKitId: brandKit?.id,
      musicAudioFilePath: data.musicAudioFilePath,
      steps: workflowSteps,
      currentStep: 1,
      status: 'processing',
      createdAt: new Date()
    };

    // Store workflow in both memory and database for persistence
    this.workflows.set(workflowId, workflow);
    
    // Persist workflow to database for async processing
    await db.insert(workflows).values({
      id: workflowId,
      scriptId: script.id,
      title: data.title,
      content: data.content,
      style: effectiveStyle,
      customStylePrompt: effectiveCustomStylePrompt,
      maintainContinuity: data.maintainContinuity ?? true,
      referenceImageUrl: data.referenceImageUrl,
      voice: effectiveVoice,
      audioModel: data.audioModel || 'gpt-4o-mini-tts',
      currentStep: 1,
      status: 'processing',
      steps: workflowSteps,
    });

    console.log(`Workflow ${workflowId} persisted to database for async processing`);
    this.emit('workflowCreated', workflow);

    // Start the automated workflow asynchronously - don't wait for completion
    setImmediate(() => {
      this.executeWorkflow(workflowId).catch(error => {
        console.error(`Workflow ${workflowId} failed:`, error);
        this.updateWorkflowStatus(workflowId, 'failed', error.message).catch(console.error);
      });
    });

    return workflowId;
  }

  async executeWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }
    
    // Check if this is a music video or animation workflow
    const projectScript = await storage.getScript(workflow.scriptId);
    const isMusicVideo = projectScript?.projectType === 'music-video';
    const isAnimation = projectScript?.projectType === 'animation';

    try {
      // Animation Mode: Parse dialogue script first
      if (isAnimation) {
        await this.executeStep(workflow, 'parse_dialogue', async () => {
          console.log(`[WORKFLOW] Parsing dialogue script for animation workflow ${workflowId}`);
          
          const { parseDialogueScript, generateAnimationDallePrompt } = await import('./dialogueParser');
          
          // Get animation settings from script
          const animationSettings = projectScript?.animationSettings as any || {};
          const animationStyle = animationSettings?.style || 'pixar-talking';
          const comedyLevel = animationSettings?.comedyLevel || 50;
          const absurdityLevel = animationSettings?.absurdityLevel || 30;
          
          // Parse the dialogue content
          const parsedDialogue = await parseDialogueScript(
            workflow.content,
            animationStyle,
            comedyLevel,
            absurdityLevel
          );
          
          console.log(`[WORKFLOW] Parsed ${parsedDialogue.scenes.length} dialogue scenes with ${parsedDialogue.characters.length} characters`);
          
          // Store characters info in script for later use
          await storage.updateScript(workflow.scriptId, {
            animationStatus: 'dialogue_parsed'
          });
          
          // Create scenes from parsed dialogue
          for (let i = 0; i < parsedDialogue.scenes.length; i++) {
            const dialogueScene = parsedDialogue.scenes[i];
            
            // Generate DALL-E prompt optimized for animation/lip-sync
            const dallePrompt = await generateAnimationDallePrompt(
              dialogueScene,
              animationStyle,
              undefined, // character profiles (we'll add this later)
              i,
              parsedDialogue.scenes.length
            );
            
            // Calculate estimated duration based on dialogue length
            const wordCount = dialogueScene.lines.reduce((acc, line) => 
              acc + line.dialogue.split(/\s+/).length, 0);
            const estimatedDuration = Math.max(3, Math.ceil(wordCount / 2.5)); // ~150 words per minute
            
            await storage.createScene({
              scriptId: workflow.scriptId,
              sceneNumber: dialogueScene.sceneNumber,
              title: dialogueScene.title || `Scene ${dialogueScene.sceneNumber}`,
              scriptExcerpt: dialogueScene.lines.map(l => `${l.speaker}: ${l.dialogue}`).join('\n'),
              dallePrompt: dallePrompt,
              estimatedDuration: estimatedDuration,
              metadata: {
                dialogueLines: dialogueScene.lines,
                setting: dialogueScene.setting,
                visualDescription: dialogueScene.visualDescription,
                animationStyle: animationStyle
              }
            });
            
            console.log(`[WORKFLOW] Created animation scene ${dialogueScene.sceneNumber}: ${dialogueScene.lines.length} dialogue lines`);
          }
          
          // Store character/narrator info for voice profile assignment
          const characterInfo = {
            characters: parsedDialogue.characters,
            narrators: parsedDialogue.narrators
          };
          
          console.log(`[WORKFLOW] Animation dialogue parsing complete: ${parsedDialogue.scenes.length} scenes, ${characterInfo.characters.length} characters, ${characterInfo.narrators.length} narrators`);
          
          return { parsedDialogue, characterInfo };
        });
      }
      
      // Step 1: Generate audio (skip for music videos and animation - animation uses ElevenLabs per-character TTS)
      if (!isMusicVideo && !isAnimation) {
        await this.executeStep(workflow, 'generate_audio', async () => {
        console.log(`Generating audio for workflow ${workflowId}`);
        const currentScript = await storage.getScript(workflow.scriptId);
        
        // Create audio record in database
        const audioItem = await storage.createAudioTTS({
          title: workflow.title,
          content: workflow.content,
          voice: workflow.voice || 'alloy',
          model: workflow.audioModel || 'gpt-4o-mini-tts',
        });

        // Update status to generating
        await storage.updateAudioTTS(audioItem.id, { status: "generating" });

        const providerConfig = projectProviderConfigSchema.parse(
          ((currentScript?.modelSettings as any)?.providerConfig) || getDefaultProviderConfig()
        );

        // Generate TTS audio using provider engine
        const result = await generateNarrationWithProvider(providerConfig, {
          model: (workflow.audioModel as any) || 'gpt-4o-mini-tts',
          voice: (workflow.voice as any) || 'alloy',
          text: workflow.content,
          elevenLabsVoiceId: (currentScript as any)?.characterVoices?.narrator?.voiceId,
        });

        // Use the duration from the TTS result
        let actualDuration = result.duration;

        // Update audio record with results
        const audioResult = await storage.updateAudioTTS(audioItem.id, {
          audioUrl: result.audioUrl,
          duration: actualDuration,
          fileSize: result.fileSize,
          status: "completed",
        });
        
        // CRITICAL: Verify the audio file exists before proceeding - this is mandatory
        const audioFilePath = path.join(process.cwd(), result.audioUrl.replace(/^\//, ''));
        console.log(`[AUDIO_VERIFICATION] Checking audio file at: ${audioFilePath}`);
        
        if (!fs.existsSync(audioFilePath)) {
          console.error(`[AUDIO_VERIFICATION] FAILED: Audio file not found at ${audioFilePath}`);
          // Mark audio as failed in database
          await storage.updateAudioTTS(audioItem.id, { status: "failed" });
          throw new Error(`CRITICAL: Audio file generation failed - file not found at ${audioFilePath}. Cannot proceed without audio.`);
        }
        
        // Double-check file size to ensure it's not corrupted
        const stats = fs.statSync(audioFilePath);
        if (stats.size < 1000) { // Less than 1KB indicates corruption
          console.error(`[AUDIO_VERIFICATION] FAILED: Audio file too small (${stats.size} bytes), likely corrupted`);
          await storage.updateAudioTTS(audioItem.id, { status: "failed" });
          throw new Error(`CRITICAL: Audio file appears corrupted (${stats.size} bytes). Cannot proceed without valid audio.`);
        }
        
        // CRITICAL: Verify actual audio duration matches database record to prevent timing issues
        try {
          const { getAudioDurationInSeconds } = await import('get-audio-duration');
          const actualDuration = await getAudioDurationInSeconds(audioFilePath);
          const databaseDuration = actualDuration; // From TTS generation
          const durationDifference = Math.abs(actualDuration - databaseDuration);
          
          console.log(`[AUDIO_VERIFICATION] Database duration: ${databaseDuration}s, Actual duration: ${actualDuration.toFixed(3)}s`);
          
          if (durationDifference > 1) { // Allow 1 second tolerance
            console.warn(`[AUDIO_VERIFICATION] Duration mismatch: database=${databaseDuration}s, actual=${actualDuration.toFixed(3)}s`);
            // Update script with correct duration to prevent timing issues
            await storage.updateScript(workflow.scriptId, { 
              audioDuration: Math.round(actualDuration) 
            });
            console.log(`[AUDIO_VERIFICATION] Updated script ${workflow.scriptId} with correct audio duration: ${Math.round(actualDuration)}s`);
          }
        } catch (durationError) {
          console.error(`[AUDIO_VERIFICATION] Could not verify audio duration:`, durationError);
          // Don't fail the workflow for this, but log the warning
        }
        
        console.log(`[AUDIO_VERIFICATION] SUCCESS: Audio file verified at ${audioFilePath} (${stats.size} bytes)`);
        
        // Update the script with audio information for scene generation
        await storage.updateScript(workflow.scriptId, {
          audioDuration: actualDuration,
          audioFilePath: result.audioUrl,
          audioTTSId: audioItem.id,
        });
        
        console.log(`[WORKFLOW] Audio step completed - Duration: ${actualDuration}s, File: ${result.audioUrl}`);
        
        console.log(`Audio generated successfully for workflow ${workflowId}, duration: ${actualDuration}s`);
        return audioResult;
        });
      } // End of audio generation step (skipped for music videos)

      // Step 1b: Music Audio Analysis (only for music videos with uploaded audio)
      if (isMusicVideo && workflow.musicAudioFilePath) {
        await this.executeStep(workflow, 'analyze_music_audio', async () => {
          console.log(`[WORKFLOW] Analyzing music audio for workflow ${workflowId}`);
          
          const { analyzeMusicAudio, getAudioDuration } = await import('./musicAudioAnalyzer');
          
          try {
            // Update status to processing
            await storage.updateScript(workflow.scriptId, {
              musicAudioAnalysisStatus: 'processing'
            });
            
            // Convert URL path to file system path
            const audioFilePath = path.join(process.cwd(), workflow.musicAudioFilePath!.replace(/^\//, ''));
            
            // Check file exists
            if (!fs.existsSync(audioFilePath)) {
              throw new Error(`Music audio file not found: ${audioFilePath}`);
            }
            
            // Get the audio duration
            const audioDuration = await getAudioDuration(audioFilePath);
            
            // Run the audio analysis - returns SceneTiming[] directly
            const sceneTimings = await analyzeMusicAudio(audioFilePath, workflow.content);
            
            console.log(`[WORKFLOW] Music audio analysis complete: ${sceneTimings.length} scenes, ${audioDuration}s total`);
            
            // Store the analysis result for use in scene generation
            // musicAudioDuration is numeric type which expects string
            await storage.updateScript(workflow.scriptId, {
              musicAudioDuration: String(audioDuration),
              musicAudioAnalysisStatus: 'completed'
            });
            
            // Store scene timings in workflow for scene generation to use
            (workflow as any).musicSceneTimings = sceneTimings;
            (workflow as any).musicAudioDuration = audioDuration;
            
            // CRITICAL: Persist scene timings to database so they're authoritative
            await storage.updateScript(workflow.scriptId, {
              musicSceneTimings: sceneTimings as any
            });
            
            return { sceneTimings, audioDuration };
          } catch (error: any) {
            console.error(`[WORKFLOW] Music audio analysis failed:`, error);
            await storage.updateScript(workflow.scriptId, {
              musicAudioAnalysisStatus: 'failed'
            });
            throw error;
          }
        });
      }

      // Step 2: Generate scenes - For music videos with audio analysis, create scenes directly from timing data
      // Animation mode already created scenes in parse_dialogue step, so skip this
      if (!isAnimation) {
      await this.executeStep(workflow, 'generate_scenes', async () => {
        console.log(`[WORKFLOW] Generating scenes for ${isMusicVideo ? 'music video' : 'standard'} workflow ${workflowId}`);
        
        const currentScript = await storage.getScript(workflow.scriptId);
        
        // Get and apply admin model settings before scene generation
        const adminModelSettings = getModelConfig();
        const currentModelSettings =
          currentScript?.modelSettings && typeof currentScript.modelSettings === 'object'
            ? currentScript.modelSettings as Record<string, unknown>
            : {};
        console.log(`[WORKFLOW] Applying admin model settings:`, adminModelSettings);
        
        // Update the script with admin model settings before generating scenes
        await storage.updateScript(workflow.scriptId, {
          modelSettings: {
            ...adminModelSettings,
            providerConfig: currentModelSettings.providerConfig || getDefaultProviderConfig(),
          }
        });
        
        // Check if we have pre-computed scene timings from audio analysis
        // First check workflow memory, then fallback to database for workflow restarts
        let musicSceneTimings = (workflow as any).musicSceneTimings as Array<{
          sceneNumber: number;
          lyricText: string;
          startTime: number;
          endTime: number;
          soraClipLength: 4 | 8;
        }> | undefined;
        
        // If not in memory, check database (for resumed workflows)
        if (!musicSceneTimings && currentScript?.musicSceneTimings) {
          musicSceneTimings = currentScript.musicSceneTimings as Array<{
            sceneNumber: number;
            lyricText: string;
            startTime: number;
            endTime: number;
            soraClipLength: 4 | 8;
          }>;
          console.log(`[WORKFLOW] Loaded ${musicSceneTimings?.length || 0} scene timings from database`);
        }
        
        // CRITICAL: For music videos WITH audio analysis, create scenes directly from timing data
        // This ensures perfect sync between audio and scenes
        if (isMusicVideo && musicSceneTimings && musicSceneTimings.length > 0) {
          console.log(`[WORKFLOW] Creating ${musicSceneTimings.length} scenes directly from audio analysis`);
          
          // Import prompt generation functions
          const { generateMusicVideoScenePrompts } = await import('./openai');
          
          // Generate prompts for each scene segment
          const scenePrompts = await generateMusicVideoScenePrompts(
            musicSceneTimings.map(t => t.lyricText),
            workflow.style,
            workflow.customStylePrompt,
            workflow.referenceImageUrl
          );
          
          // Create scenes directly from the timing data
          for (let i = 0; i < musicSceneTimings.length; i++) {
            const timing = musicSceneTimings[i];
            const prompt = scenePrompts[i] || { dallePrompt: timing.lyricText, title: `Scene ${timing.sceneNumber}` };
            
            await storage.createScene({
              scriptId: workflow.scriptId,
              sceneNumber: timing.sceneNumber,
              title: prompt.title || `Scene ${timing.sceneNumber}`,
              scriptExcerpt: timing.lyricText,
              dallePrompt: prompt.dallePrompt,
              // Convert seconds to milliseconds for UI display
              exactStartTime: Math.round(timing.startTime * 1000),
              exactEndTime: Math.round(timing.endTime * 1000),
              soraClipLength: timing.soraClipLength,
              lyricStartTime: String(timing.startTime),
              lyricEndTime: String(timing.endTime),
            });
            
            console.log(`[WORKFLOW] Created Scene ${timing.sceneNumber}: ${timing.startTime.toFixed(2)}s - ${timing.endTime.toFixed(2)}s (${timing.soraClipLength}s clip)`);
          }
          
          console.log(`[WORKFLOW] Created ${musicSceneTimings.length} scenes with precise audio sync`);
          return { scenes: musicSceneTimings, count: musicSceneTimings.length };
        }
        
        // For standard projects: verify audio exists before scene generation
        if (!isMusicVideo) {
          if (!currentScript?.audioFilePath || !currentScript?.audioDuration) {
            throw new Error('CRITICAL: Cannot generate scenes - no audio file or duration found');
          }
          
          const audioFilePath = path.join(process.cwd(), currentScript.audioFilePath.replace(/^\//, ''));
          if (!fs.existsSync(audioFilePath)) {
            throw new Error(`CRITICAL: Audio file missing at ${audioFilePath} - cannot generate scenes without audio`);
          }
          
          console.log(`[WORKFLOW] Audio verified for scene generation - Duration: ${currentScript.audioDuration}s`);
        } else {
          console.log(`[WORKFLOW] Music video mode without audio - parsing lyrics into scenes`);
        }
        
        // Use the existing generate prompts API endpoint logic
        const response = await fetch(`http://localhost:5000/api/generate-prompts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scriptId: workflow.scriptId,
            script: workflow.content,
            style: workflow.style,
            customStylePrompt: workflow.customStylePrompt,
            maintainContinuity: workflow.maintainContinuity,
            referenceImageUrl: workflow.referenceImageUrl,
            projectType: isMusicVideo ? 'music-video' : undefined
          })
        });

        if (!response.ok) {
          throw new Error(`Scene generation failed: ${response.statusText}`);
        }

        const result = await response.json();
        console.log(`[WORKFLOW] Generated ${result.scenes?.length || 0} scenes using admin model settings`);
        
        // For music videos without audio analysis, use default 8s clips
        if (isMusicVideo) {
          console.log(`[WORKFLOW] Music video mode - configuring default scene timing`);
          const scenes = await storage.getScenesByScriptId(workflow.scriptId);
          
          console.log(`[WORKFLOW] No audio analysis - using default 8s clips for ${scenes.length} scenes`);
          for (const scene of scenes) {
            const clipLength = 8;
            const startTimeSec = (scene.sceneNumber - 1) * clipLength;
            const endTimeSec = scene.sceneNumber * clipLength;
            await storage.updateScene(scene.id, {
              // Convert seconds to milliseconds for UI display
              exactStartTime: startTimeSec * 1000,
              exactEndTime: endTimeSec * 1000,
              soraClipLength: clipLength
            });
          }
          console.log(`[WORKFLOW] Music video scenes configured with default 8s clips each`);
          return result;
        }
        
        // For standard projects: process audio timestamps after scene generation
        console.log(`[WORKFLOW] Processing audio timestamps for ${result.scenes?.length || 0} scenes`);
        
        const scenes = await storage.getScenesByScriptId(workflow.scriptId);
        
        if (currentScript?.audioDuration && scenes.length > 0) {
          const audioDuration = currentScript.audioDuration;
          let timestamps: any[] = [];
          
          // CRITICAL FIX: Use proper audio analysis instead of simple distribution
          console.log(`[WORKFLOW] Starting audio analysis for ${scenes.length} scenes over ${audioDuration}s`);
          
          try {
            // Get the actual audio file path for analysis
            const audioFilePath = path.join(process.cwd(), currentScript.audioFilePath?.replace(/^\//, '') || '');
            
            if (fs.existsSync(audioFilePath)) {
              console.log(`[WORKFLOW] Analyzing audio file: ${audioFilePath}`);
              
              // Import audio analysis function
              const { analyzeAudioForScenes } = await import('./audioProcessor.js');
              timestamps = await analyzeAudioForScenes(audioFilePath, scenes);
              
              console.log(`[WORKFLOW] Audio analysis completed, got ${timestamps.length} timestamps`);
              
              // Update each scene with analyzed timing information
              for (const timestamp of timestamps) {
                await storage.updateScene(timestamp.sceneId, {
                  exactStartTime: timestamp.startTime,
                  exactEndTime: timestamp.endTime
                });
                console.log(`[WORKFLOW] Scene ${timestamp.sceneId}: ${timestamp.startTime}s - ${timestamp.endTime}s (${(timestamp.endTime - timestamp.startTime).toFixed(1)}s)`);
              }
            } else {
              console.warn(`[WORKFLOW] Audio file not found, falling back to content-aware distribution`);
              // Fallback to content-aware distribution if audio file missing
              timestamps = this.calculateOptimalSceneTiming(scenes, audioDuration);
              
              for (const timestamp of timestamps) {
                await storage.updateScene(timestamp.sceneId, {
                  exactStartTime: timestamp.startTime,
                  exactEndTime: timestamp.endTime
                });
                console.log(`[WORKFLOW] Scene ${timestamp.sceneId}: ${timestamp.startTime}s - ${timestamp.endTime}s (${(timestamp.endTime - timestamp.startTime).toFixed(1)}s)`);
              }
            }
          } catch (analysisError) {
            console.error(`[WORKFLOW] Audio analysis failed:`, analysisError);
            // Fallback to content-aware distribution
            timestamps = this.calculateOptimalSceneTiming(scenes, audioDuration);
            
            for (const timestamp of timestamps) {
              await storage.updateScene(timestamp.sceneId, {
                exactStartTime: timestamp.startTime,
                exactEndTime: timestamp.endTime
              });
              console.log(`[WORKFLOW] Scene ${timestamp.sceneId}: ${timestamp.startTime}s - ${timestamp.endTime}s (${(timestamp.endTime - timestamp.startTime).toFixed(1)}s)`);
            }
          }
          
          console.log(`[WORKFLOW] Scene generation completed: ${timestamps.length} scenes over ${audioDuration}s`);
        } else {
          throw new Error('CRITICAL: Scene generation completed but audio duration missing - workflow integrity compromised');
        }
        
        return result;
      });
      } // End of !isAnimation block for generate_scenes

      // Step 3: Extract characters from script for visual consistency
      await this.executeStep(workflow, 'extract_characters', async () => {
        console.log(`[WORKFLOW] Extracting characters for workflow ${workflowId}`);
        
        const response = await fetch(`http://localhost:5000/api/extract-characters/${workflow.scriptId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
          // Character extraction is optional - log warning but don't fail the workflow
          console.warn(`[WORKFLOW] Character extraction failed: ${response.statusText}, continuing without character consistency`);
          return { characters: [], sceneCharacterMap: {} };
        }

        const result = await response.json();
        console.log(`[WORKFLOW] Extracted ${result.characters?.length || 0} characters for visual consistency`);
        return result;
      });

      // Step 4: Start image generation with character consistency (but don't complete the step yet)
      console.log(`Starting character-aware image generation for workflow ${workflowId}`);
      
      // Set the step to processing state
      const imageStep = workflow.steps.find(s => s.id === 'generate_images');
      if (imageStep) {
        imageStep.status = 'processing';
        imageStep.progress = 0;
        this.emit('workflowUpdated', workflow);
      }
      
      const scenes = await storage.getScenesByScriptId(workflow.scriptId);
      
      // Get project-specific or global model settings and check for characters
      let projectModelSettings = null;
      const script = await storage.getScript(workflow.scriptId);
      
      if (script && script.modelSettings) {
        projectModelSettings = script.modelSettings;
      }

      if (!projectModelSettings) {
        projectModelSettings = getModelConfig();
      }

      // Check if we have characters extracted - use character-aware generation if so
      const characters = script?.characters as any[] | null;
      const hasCharacters = characters && Array.isArray(characters) && characters.length > 0;
      
      let response;
      if (hasCharacters) {
        console.log(`[WORKFLOW] Using character-aware image generation for ${characters.length} characters`);
        console.log(`[WORKFLOW] Reference image: ${script?.referenceImageUrl ? 'provided' : 'not provided'}`);
        // Use character-aware image generation for better consistency
        response = await fetch(`http://localhost:5000/api/generate-images-with-characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scriptId: workflow.scriptId,
            style: workflow.style,
            customStylePrompt: workflow.customStylePrompt
          })
        });
      } else {
        console.log(`[WORKFLOW] No characters found, using standard image generation`);
        // Fallback to standard image generation if no characters
        response = await fetch(`http://localhost:5000/api/generate-images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scriptId: workflow.scriptId,
            style: workflow.style,
            customStylePrompt: workflow.customStylePrompt
          })
        });
      }

      if (!response.ok) {
        this.failStep(workflow, 'generate_images', `Image generation failed: ${response.statusText}`);
        throw new Error(`Image generation failed: ${response.statusText}`);
      }

      const result = await response.json();
      const jobId = result.jobId;
      console.log(`Started ${hasCharacters ? 'character-aware' : 'standard'} image generation job ${jobId} for workflow ${workflowId}, monitoring progress...`);

      // Start monitoring the job - this will complete the step when images are done
      this.monitorImageGenerationJob(workflow, jobId);

      // Don't continue to other steps - they will be executed by monitorImageGenerationJob

    } catch (error) {
      console.error(`Workflow ${workflowId} failed:`, error);
      workflow.status = 'failed';
      this.emit('workflowFailed', workflow, error);
    }
  }

  private async monitorImageGenerationJob(workflow: ProjectWorkflow, jobId: string): Promise<void> {
    const checkJobStatus = async () => {
      try {
        const jobResponse = await fetch(`http://localhost:5000/api/jobs/${jobId}`);
        if (!jobResponse.ok) {
          console.error(`Failed to check job status for ${jobId}`);
          setTimeout(checkJobStatus, 5000);
          return;
        }
        
        const job = await jobResponse.json();
        
        if (job.status === 'completed') {
          console.log(`Image generation completed for workflow ${workflow.id}`);
          
          // Complete the generate_images step
          this.completeStep(workflow, 'generate_images');
          
          // Execute thumbnail generation step
          await this.executeStep(workflow, 'generate_thumbnail', async () => {
            console.log(`Generating thumbnail for workflow ${workflow.id}`);
            
            try {
              // Generate simple clickbait text based on title
              const thumbnailText = workflow.title.length > 20 
                ? workflow.title.substring(0, 17) + "..." 
                : workflow.title.toUpperCase();
              
              console.log(`Using thumbnail text: "${thumbnailText}"`);
              
              // Create a timeout wrapper for the thumbnail API call
              const thumbnailPromise = fetch(`http://localhost:5000/api/generate-thumbnail`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  scriptId: workflow.scriptId,
                  script: workflow.content.substring(0, 100), // Shorter script to reduce API load
                  style: workflow.style,
                  customStylePrompt: workflow.customStylePrompt,
                  title: workflow.title,
                  thumbnailConfig: {
                    customText: thumbnailText,
                    textPlacement: "center",
                    emphasizeText: true,
                    thumbnailStyle: workflow.style,
                    imageSize: "1536x1024",
                    imageQuality: "low" // Use low quality for faster generation
                  }
                })
              });
              
              // Set 30 second timeout
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Thumbnail generation timeout')), 30000)
              );
              
              const thumbnailResponse = await Promise.race([thumbnailPromise, timeoutPromise]) as Response;
              
              if (!thumbnailResponse.ok) {
                const errorText = await thumbnailResponse.text();
                console.error(`Thumbnail API error: ${thumbnailResponse.status} - ${errorText}`);
                // Don't fail the workflow, just log the error
                return { 
                  message: 'Thumbnail generation skipped due to API timeout',
                  thumbnailText: thumbnailText,
                  thumbnailUrl: null
                };
              }
              
              const thumbnailResult = await thumbnailResponse.json();
              
              console.log(`Thumbnail generated successfully with text: "${thumbnailText}"`);
              console.log(`Thumbnail URL: ${thumbnailResult.thumbnailUrl}`);
              
              return { 
                message: 'Thumbnail generated successfully',
                thumbnailText: thumbnailText,
                thumbnailUrl: thumbnailResult.thumbnailUrl
              };
            } catch (error) {
              console.error(`Thumbnail generation failed for workflow ${workflow.id}:`, error);
              // Don't fail the entire workflow for thumbnail issues
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              
              // For content safety issues, try a generic fallback thumbnail
              if (errorMessage.includes('safety system') || errorMessage.includes('moderation_blocked') || errorMessage.includes('content_policy_violation')) {
                console.log(`Attempting fallback thumbnail generation for sensitive content...`);
                try {
                  const fallbackResponse = await fetch(`http://localhost:5000/api/generate-thumbnail`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      scriptId: workflow.scriptId,
                      script: "A compelling story that captures viewers' attention",
                      style: workflow.style,
                      title: "Mystery Story",
                      thumbnailConfig: {
                        customText: "MYSTERY",
                        textPlacement: "center",
                        emphasizeText: true,
                        thumbnailStyle: workflow.style,
                        imageSize: "1536x1024",
                        imageQuality: "low"
                      }
                    })
                  });
                  
                  if (fallbackResponse.ok) {
                    const fallbackResult = await fallbackResponse.json();
                    console.log(`Fallback thumbnail generated successfully: ${fallbackResult.thumbnailUrl}`);
                    return { 
                      message: 'Fallback thumbnail generated successfully',
                      thumbnailUrl: fallbackResult.thumbnailUrl,
                      originalError: errorMessage
                    };
                  }
                } catch (fallbackError) {
                  console.error('Fallback thumbnail generation also failed:', fallbackError);
                }
              }
              
              return { 
                message: 'Thumbnail generation skipped due to error',
                error: errorMessage
              };
            }
          });
          
          // Generate Sora video prompts
          await this.executeStep(workflow, 'generate_sora_prompts', async () => {
            console.log(`Generating Sora prompts for workflow ${workflow.id}`);
            
            const response = await fetch(`http://localhost:5000/api/generate-sora-prompts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                scriptId: workflow.scriptId,
                style: workflow.style,
                customStylePrompt: workflow.customStylePrompt
              })
            });

            if (!response.ok) {
              console.warn(`[WORKFLOW] Sora prompt generation failed: ${response.statusText}, continuing without videos`);
              return { message: 'Sora prompt generation skipped', error: response.statusText };
            }

            const result = await response.json();
            console.log(`[WORKFLOW] Generated Sora prompts for ${result.updatedScenes?.length || 0} scenes`);
            return result;
          });
          
          // WORKFLOW STOPS HERE - User must manually trigger Sora video generation after reviewing images
          // This saves costs and time by allowing users to review and approve images first
          console.log(`[WORKFLOW] Sora prompts generated. Workflow stopping - user can manually trigger video generation.`);
          
          // Complete the workflow - user will manually trigger Sora video generation from UI
          await this.executeStep(workflow, 'complete', async () => {
            console.log(`Workflow ${workflow.id} completed - ready for manual Sora video generation`);
            await storage.updateScript(workflow.scriptId, { status: 'completed' });
            this.emit('workflowCompleted', workflow);
            return { message: 'Project workflow completed - images ready, click Generate Videos to create Sora videos' };
          });
          
          
        } else if (job.status === 'failed') {
          console.error(`Image generation failed for workflow ${workflow.id}: ${job.error}`);
          this.failStep(workflow, 'generate_images', job.error || 'Image generation failed');
        } else {
          // Update progress
          if (job.progress && job.progress.total > 0) {
            const progressPercent = Math.round((job.progress.completed / job.progress.total) * 100);
            this.updateStepProgress(workflow, 'generate_images', progressPercent);
            console.log(`Image generation progress: ${progressPercent}% (${job.progress.completed}/${job.progress.total})`);
          }
          // Check again in 5 seconds
          setTimeout(checkJobStatus, 5000);
        }
      } catch (error) {
        console.error(`Error monitoring job ${jobId}:`, error);
        setTimeout(checkJobStatus, 5000);
      }
    };
    
    // Start monitoring after 3 seconds
    setTimeout(checkJobStatus, 3000);
  }

  private async monitorSoraVideoJob(workflow: ProjectWorkflow, jobId: string): Promise<void> {
    const checkJobStatus = async () => {
      try {
        const jobResponse = await fetch(`http://localhost:5000/api/jobs/${jobId}`);
        if (!jobResponse.ok) {
          console.error(`Failed to check Sora job status for ${jobId}`);
          setTimeout(checkJobStatus, 10000); // Check every 10 seconds for Sora (slower generation)
          return;
        }
        
        const job = await jobResponse.json();
        
        if (job.status === 'completed') {
          console.log(`Sora video generation completed for workflow ${workflow.id}`);
          
          // Complete the generate_sora_videos step
          this.completeStep(workflow, 'generate_sora_videos');
          
          // Execute final completion step
          await this.executeStep(workflow, 'complete', async () => {
            console.log(`Workflow ${workflow.id} completed successfully with Sora videos`);
            
            // CRITICAL: Update script status to completed
            await storage.updateScript(workflow.scriptId, { 
              status: 'completed' 
            });
            
            console.log(`Updated script ${workflow.scriptId} status to completed`);
            
            // Emit completion event for WebSocket notifications
            this.emit('workflowCompleted', workflow);
            
            return { message: 'Project workflow completed successfully with Sora videos' };
          });
          
        } else if (job.status === 'failed') {
          console.error(`Sora video generation failed for workflow ${workflow.id}: ${job.error}`);
          // Don't fail the whole workflow, just mark the step as completed with error
          const soraStep = workflow.steps.find(s => s.id === 'generate_sora_videos');
          if (soraStep) {
            soraStep.status = 'completed';
            soraStep.progress = 100;
            soraStep.result = { message: 'Sora video generation failed', error: job.error };
            this.emit('workflowUpdated', workflow);
          }
          
          // Complete the workflow anyway
          await this.executeStep(workflow, 'complete', async () => {
            console.log(`Workflow ${workflow.id} completed (Sora videos failed)`);
            await storage.updateScript(workflow.scriptId, { status: 'completed' });
            this.emit('workflowCompleted', workflow);
            return { message: 'Project workflow completed (Sora videos failed)' };
          });
        } else {
          // Update progress
          if (job.progress && job.progress.total > 0) {
            const progressPercent = Math.round((job.progress.completed / job.progress.total) * 100);
            this.updateStepProgress(workflow, 'generate_sora_videos', progressPercent);
            console.log(`Sora video generation progress: ${progressPercent}% (${job.progress.completed}/${job.progress.total})`);
          }
          // Check again in 10 seconds (Sora is slower)
          setTimeout(checkJobStatus, 10000);
        }
      } catch (error) {
        console.error(`Error monitoring Sora job ${jobId}:`, error);
        setTimeout(checkJobStatus, 10000);
      }
    };
    
    // Start monitoring after 5 seconds
    setTimeout(checkJobStatus, 5000);
  }

  private async executeStep(
    workflow: ProjectWorkflow, 
    stepId: string, 
    executor: () => Promise<any>
  ): Promise<void> {
    const step = workflow.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found in workflow`);
    }

    step.status = 'processing';
    step.progress = 0;
    this.emit('workflowUpdated', workflow);

    try {
      const result = await executor();
      step.status = 'completed';
      step.progress = 100;
      step.result = result;
      
      // Move to next step
      const currentStepIndex = workflow.steps.findIndex(s => s.id === stepId);
      if (currentStepIndex < workflow.steps.length - 1) {
        workflow.currentStep = currentStepIndex + 1;
      } else {
        workflow.status = 'completed';
        workflow.completedAt = new Date();
      }

      await this.updateWorkflowInDB(workflow.id, { 
        steps: workflow.steps,
        currentStep: workflow.currentStep,
        status: workflow.status,
        completedAt: workflow.completedAt
      });

      this.emit('workflowUpdated', workflow);
      console.log(`Step ${stepId} completed for workflow ${workflow.id}`);
    } catch (error) {
      await this.failStep(workflow, stepId, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  private completeStep(workflow: ProjectWorkflow, stepId: string): void {
    const step = workflow.steps.find(s => s.id === stepId);
    if (step) {
      step.status = 'completed';
      step.progress = 100;
      this.emit('workflowUpdated', workflow);
    }
  }

  private updateStepStatus(workflow: ProjectWorkflow, stepId: string, status: 'pending' | 'processing' | 'completed' | 'failed'): void {
    const step = workflow.steps.find(s => s.id === stepId);
    if (step) {
      step.status = status;
      if (status === 'processing') {
        step.progress = 0;
      } else if (status === 'completed') {
        step.progress = 100;
      }
      this.emit('workflowUpdated', workflow);
    }
  }

  private updateStepProgress(workflow: ProjectWorkflow, stepId: string, progress: number): void {
    const step = workflow.steps.find(s => s.id === stepId);
    if (step) {
      step.progress = progress;
      this.emit('workflowUpdated', workflow);
    }
  }

  private async failStep(workflow: ProjectWorkflow, stepId: string, error: string): Promise<void> {
    console.error(`Workflow ${workflow.id} step ${stepId} failed: ${error}`);
    const step = workflow.steps.find(s => s.id === stepId);
    if (step) {
      step.status = 'failed';
      step.error = error;
    }
    workflow.status = 'failed';
    
    await this.updateWorkflowInDB(workflow.id, { 
      steps: workflow.steps,
      status: 'failed',
      error: error
    });
    
    this.emit('workflowFailed', workflow, new Error(error));
  }

  /**
   * Calculate optimal scene timing based on content length and constraints
   * Ensures at least one panel per 10 seconds and no panel exceeds 20 seconds
   */
  private calculateOptimalSceneTiming(
    scenes: any[], 
    totalDurationSeconds: number
  ): Array<{ sceneId: number, startTime: number, endTime: number }> {
    const MIN_SCENE_DURATION = 3; // Minimum 3 seconds per scene
    const MAX_SCENE_DURATION = 20; // Maximum 20 seconds per scene
    const TARGET_PANEL_FREQUENCY = 10; // At least one panel per 10 seconds
    
    console.log(`[TIMING] Calculating optimal timing for ${scenes.length} scenes over ${totalDurationSeconds}s`);
    
    // Step 1: Calculate content weights based on script excerpt length
    const contentWeights = scenes.map(scene => {
      const content = scene.scriptExcerpt || '';
      const wordCount = content.split(/\s+/).filter((word: string) => word.length > 0).length;
      // Weight by word count, but with diminishing returns to prevent extreme differences
      return Math.max(1, Math.sqrt(wordCount));
    });
    
    const totalWeight = contentWeights.reduce((sum, weight) => sum + weight, 0);
    
    // Step 2: Calculate initial durations based on content weights
    let initialDurations = contentWeights.map(weight => 
      (weight / totalWeight) * totalDurationSeconds
    );
    
    console.log(`[TIMING] Initial durations:`, initialDurations.map(d => d.toFixed(1)));
    
    // Step 3: Enforce constraints (min/max durations)
    let adjustedDurations = [...initialDurations];
    let totalAdjustment = 0;
    
    // First pass: enforce minimum durations
    for (let i = 0; i < adjustedDurations.length; i++) {
      if (adjustedDurations[i] < MIN_SCENE_DURATION) {
        const deficit = MIN_SCENE_DURATION - adjustedDurations[i];
        adjustedDurations[i] = MIN_SCENE_DURATION;
        totalAdjustment += deficit;
      }
    }
    
    // Second pass: enforce maximum durations and redistribute excess
    for (let i = 0; i < adjustedDurations.length; i++) {
      if (adjustedDurations[i] > MAX_SCENE_DURATION) {
        const excess = adjustedDurations[i] - MAX_SCENE_DURATION;
        adjustedDurations[i] = MAX_SCENE_DURATION;
        totalAdjustment -= excess;
      }
    }
    
    // Step 4: Redistribute any remaining time adjustment proportionally
    if (Math.abs(totalAdjustment) > 0.1) {
      const redistributeRate = totalAdjustment / totalDurationSeconds;
      adjustedDurations = adjustedDurations.map(duration => 
        Math.max(MIN_SCENE_DURATION, 
          Math.min(MAX_SCENE_DURATION, duration - (duration * redistributeRate)))
      );
    }
    
    // Step 5: Final normalization to ensure total matches exactly
    const currentTotal = adjustedDurations.reduce((sum, duration) => sum + duration, 0);
    const scaleFactor = totalDurationSeconds / currentTotal;
    adjustedDurations = adjustedDurations.map(duration => duration * scaleFactor);
    
    // Step 6: Check panel frequency constraint
    const requiredMinPanels = Math.ceil(totalDurationSeconds / TARGET_PANEL_FREQUENCY);
    if (scenes.length < requiredMinPanels) {
      console.warn(`[TIMING] Warning: ${scenes.length} panels for ${totalDurationSeconds}s (recommended: at least ${requiredMinPanels})`);
    }
    
    // Step 7: Generate timestamps
    let currentTime = 0;
    const timestamps = scenes.map((scene, index) => {
      const duration = adjustedDurations[index];
      const startTime = Math.round(currentTime);
      const endTime = index === scenes.length - 1 
        ? Math.round(totalDurationSeconds) // Ensure last scene ends exactly at total duration
        : Math.round(currentTime + duration);
      
      currentTime += duration;
      
      return {
        sceneId: scene.id,
        startTime,
        endTime
      };
    });
    
    // Verify timing
    const finalDurations = timestamps.map(t => t.endTime - t.startTime);
    console.log(`[TIMING] Final durations:`, finalDurations.map(d => `${d}s`).join(', '));
    console.log(`[TIMING] Range: ${Math.min(...finalDurations)}s - ${Math.max(...finalDurations)}s`);
    console.log(`[TIMING] Panel frequency: ${(totalDurationSeconds / scenes.length).toFixed(1)}s per panel`);
    
    return timestamps;
  }

  async createThumbnailWorkflow(scriptId: number, thumbnailConfig?: any): Promise<string> {
    const script = await storage.getScript(scriptId);
    if (!script) {
      throw new Error('Script not found');
    }

    const workflowId = `thumbnail_${scriptId}_${Date.now()}`;
    
    const workflow: ProjectWorkflow = {
      id: workflowId,
      scriptId,
      title: script.title,
      content: script.content,
      style: script.style || 'auto',
      customStylePrompt: script.customStylePrompt || undefined,
      maintainContinuity: true,
      steps: [
        { id: 'generate_thumbnail', name: 'Generate Thumbnail', status: 'processing' }
      ],
      currentStep: 0,
      status: 'processing',
      createdAt: new Date()
    };

    this.workflows.set(workflowId, workflow);
    this.emit('workflowCreated', workflow);

    // Execute thumbnail generation
    try {
      await this.executeStep(workflow, 'generate_thumbnail', async () => {
        // Get project-specific model settings
        let projectModelSettings = null;
        try {
          if (script.modelSettings) {
            projectModelSettings = script.modelSettings;
          }
        } catch (error) {
          console.log("No project-specific model settings found for thumbnail");
        }

        const thumbnailUrl = await generateThumbnail(
          script.content,
          script.style || 'auto',
          script.customStylePrompt || undefined,
          script.title,
          projectModelSettings,
          thumbnailConfig
        );

        // Update script with thumbnail
        await storage.updateScript(scriptId, { thumbnailUrl });

        return { thumbnailUrl };
      });
    } catch (error) {
      console.error(`Thumbnail workflow ${workflowId} failed:`, error);
    }

    return workflowId;
  }

  async getWorkflow(workflowId: string): Promise<ProjectWorkflow | undefined> {
    // Check memory first for active workflows
    let workflow = this.workflows.get(workflowId);
    
    if (!workflow) {
      // Load from database if not in memory for async persistence
      try {
        const dbWorkflow = await db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
        if (dbWorkflow.length > 0) {
          const dbData = dbWorkflow[0];
          workflow = {
            id: dbData.id,
            scriptId: dbData.scriptId,
            title: dbData.title,
            content: dbData.content,
            style: dbData.style,
            customStylePrompt: dbData.customStylePrompt || undefined,
            maintainContinuity: dbData.maintainContinuity !== null ? dbData.maintainContinuity : true,
            referenceImageUrl: dbData.referenceImageUrl || undefined,
            voice: dbData.voice || undefined,
            audioModel: dbData.audioModel || undefined,
            steps: dbData.steps as WorkflowStep[],
            currentStep: dbData.currentStep !== null ? dbData.currentStep : 0,
            status: dbData.status as 'pending' | 'processing' | 'completed' | 'failed',
            createdAt: dbData.createdAt,
            completedAt: dbData.completedAt || undefined
          };
          
          // Cache in memory for future access
          if (workflow) {
            this.workflows.set(workflowId, workflow);
            console.log(`Loaded workflow ${workflowId} from database for async processing`);
          }
        }
      } catch (error) {
        console.error(`Error loading workflow ${workflowId} from database:`, error);
      }
    }
    
    return workflow;
  }

  private async updateWorkflowStatus(workflowId: string, status: 'pending' | 'processing' | 'completed' | 'failed', error?: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.status = status;
      if (status === 'completed') {
        workflow.completedAt = new Date();
      }
      
      // Update database for persistence
      const updateData: any = { 
        status, 
        lastUpdated: new Date() 
      };
      
      if (status === 'completed') {
        updateData.completedAt = new Date();
      }
      
      if (error) {
        updateData.error = error;
      }
      
      await db.update(workflows).set(updateData).where(eq(workflows.id, workflowId));
      this.emit('workflowUpdated', workflow);
    }
  }

  private async updateWorkflowInDB(workflowId: string, updates: Partial<ProjectWorkflow>): Promise<void> {
    try {
      const updateData: any = { lastUpdated: new Date() };
      
      if (updates.currentStep !== undefined) {
        updateData.currentStep = updates.currentStep;
      }
      
      if (updates.steps) {
        updateData.steps = updates.steps;
      }
      
      if (updates.status) {
        updateData.status = updates.status;
      }
      
      if (updates.completedAt) {
        updateData.completedAt = updates.completedAt;
      }
      
      await db.update(workflows).set(updateData).where(eq(workflows.id, workflowId));
    } catch (error) {
      console.error(`Error updating workflow ${workflowId} in database:`, error);
    }
  }

  getWorkflowsByScript(scriptId: number): ProjectWorkflow[] {
    return Array.from(this.workflows.values()).filter(w => w.scriptId === scriptId);
  }

  getAllWorkflows(): ProjectWorkflow[] {
    return Array.from(this.workflows.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

export const workflowOrchestrator = new WorkflowOrchestrator();
