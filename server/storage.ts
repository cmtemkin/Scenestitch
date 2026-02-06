import { 
  users, type User, type InsertUser,
  scripts, type Script, type InsertScript,
  scenes as scenesTable, type Scene, type InsertScene,
  audioTTS, type AudioTTS, type InsertAudioTTS, type UpdateAudioTTS,
  videoJobs, type VideoJob, type InsertVideoJob, type UpdateVideoJob,
  globalConfig, type GlobalConfig, type InsertGlobalConfig,
  animationCharacters, type AnimationCharacter, type InsertAnimationCharacter,
  animationFrames, type AnimationFrame, type InsertAnimationFrame,
  animationScenes, type AnimationScene, type InsertAnimationScene
} from "@shared/schema";
import { db, withRetry } from "./db";
import { eq, and, desc } from "drizzle-orm";

// Storage interface with required CRUD methods
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Script methods
  getScript(id: number): Promise<Script | undefined>;
  getAllScripts(): Promise<Script[]>;
  getScriptsByUserId(userId: number): Promise<Script[]>;
  createScript(script: InsertScript): Promise<Script>;
  updateScript(id: number, script: Partial<InsertScript & { archived?: boolean }>): Promise<Script | undefined>;
  deleteScript(id: number): Promise<boolean>;
  
  // Scene methods
  getScene(id: number): Promise<Scene | undefined>;
  getScenesByScriptId(scriptId: number): Promise<Scene[]>;
  createScene(scene: InsertScene): Promise<Scene>;
  updateScene(id: number, scene: Partial<InsertScene>): Promise<Scene | undefined>;
  deleteScene(id: number): Promise<boolean>;
  createScenes(scenes: InsertScene[]): Promise<Scene[]>;
  
  // Audio TTS methods
  getAudioTTS(id: number): Promise<AudioTTS | undefined>;
  getTTSAudio(id: number): Promise<AudioTTS | undefined>;
  getAllAudioTTS(): Promise<AudioTTS[]>;
  createAudioTTS(audio: InsertAudioTTS): Promise<AudioTTS>;
  updateAudioTTS(id: number, audio: UpdateAudioTTS): Promise<AudioTTS | undefined>;
  deleteAudioTTS(id: number): Promise<boolean>;
  
  // Incomplete project detection
  getIncompleteProjects(): Promise<Script[]>;
  
  // Video job methods
  getVideoJob(id: string): Promise<VideoJob | undefined>;
  getAllVideoJobs(): Promise<VideoJob[]>;
  getVideoJobsByProject(projectId: number): Promise<VideoJob[]>;
  createVideoJob(job: InsertVideoJob): Promise<VideoJob>;
  updateVideoJob(id: string, job: UpdateVideoJob): Promise<VideoJob | undefined>;
  
  // Global configuration methods
  getGlobalConfig(key: string): Promise<GlobalConfig | undefined>;
  setGlobalConfig(key: string, value: any): Promise<GlobalConfig>;
  deleteGlobalConfig(key: string): Promise<boolean>;
  deleteVideoJob(id: string): Promise<boolean>;
  
  // Helper methods for video generation
  get(id: number): Promise<Script | undefined>;
  getAudioById(id: number): Promise<AudioTTS | undefined>;

  // Animation Character methods
  getAnimationCharacter(id: number): Promise<AnimationCharacter | undefined>;
  getAnimationCharactersByScriptId(scriptId: number): Promise<AnimationCharacter[]>;
  createAnimationCharacter(character: InsertAnimationCharacter): Promise<AnimationCharacter>;
  updateAnimationCharacter(id: number, character: Partial<InsertAnimationCharacter>): Promise<AnimationCharacter | undefined>;
  deleteAnimationCharacter(id: number): Promise<boolean>;

  // Animation Frame methods
  getAnimationFrame(id: number): Promise<AnimationFrame | undefined>;
  getAnimationFramesByScriptId(scriptId: number): Promise<AnimationFrame[]>;
  createAnimationFrame(frame: InsertAnimationFrame): Promise<AnimationFrame>;
  createAnimationFrames(frames: InsertAnimationFrame[]): Promise<AnimationFrame[]>;
  updateAnimationFrame(id: number, frame: Partial<InsertAnimationFrame>): Promise<AnimationFrame | undefined>;
  deleteAnimationFrame(id: number): Promise<boolean>;
  deleteAnimationFramesByScriptId(scriptId: number): Promise<boolean>;
  reorderAnimationFrames(scriptId: number, frameIds: number[]): Promise<AnimationFrame[]>;

  // Animation Scene methods
  getAnimationScene(id: number): Promise<AnimationScene | undefined>;
  getAnimationScenesByScriptId(scriptId: number): Promise<AnimationScene[]>;
  createAnimationScene(scene: InsertAnimationScene): Promise<AnimationScene>;
  createAnimationScenes(scenes: InsertAnimationScene[]): Promise<AnimationScene[]>;
  updateAnimationScene(id: number, scene: Partial<InsertAnimationScene>): Promise<AnimationScene | undefined>;
  deleteAnimationScene(id: number): Promise<boolean>;
  deleteAnimationScenesByScriptId(scriptId: number): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private scripts: Map<number, Script>;
  private scenes: Map<number, Scene>;
  private audioTTS: Map<number, AudioTTS>;
  private videoJobs: Map<string, VideoJob>;
  private globalConfigs: Map<string, GlobalConfig>;
  private userCurrentId: number;
  private scriptCurrentId: number;
  private sceneCurrentId: number;
  private audioTTSCurrentId: number;
  private globalConfigCurrentId: number;

  constructor() {
    this.users = new Map();
    this.scripts = new Map();
    this.scenes = new Map();
    this.audioTTS = new Map();
    this.videoJobs = new Map();
    this.globalConfigs = new Map();
    this.userCurrentId = 1;
    this.scriptCurrentId = 1;
    this.sceneCurrentId = 1;
    this.audioTTSCurrentId = 1;
    this.globalConfigCurrentId = 1;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Script methods
  async getScript(id: number): Promise<Script | undefined> {
    return this.scripts.get(id);
  }
  
  async getAllScripts(): Promise<Script[]> {
    return Array.from(this.scripts.values()).sort((a, b) => {
      // Sort by updatedAt if available, otherwise by createdAt
      const aDate = a.updatedAt || a.createdAt;
      const bDate = b.updatedAt || b.createdAt;
      
      return bDate.getTime() - aDate.getTime(); // Descending order (newest first)
    });
  }

  async getScriptsByUserId(userId: number): Promise<Script[]> {
    return Array.from(this.scripts.values()).filter(
      (script) => script.userId === userId,
    );
  }

  async createScript(insertScript: InsertScript): Promise<Script> {
    const id = this.scriptCurrentId++;
    const createdAt = new Date();
    const script: Script = { 
      id, 
      createdAt, 
      updatedAt: createdAt,
      content: insertScript.content,
      title: insertScript.title ?? "Untitled Project",
      description: insertScript.description ?? null,
      projectType: insertScript.projectType ?? "video",
      status: insertScript.status ?? "draft",
      style: insertScript.style ?? null,
      customStylePrompt: insertScript.customStylePrompt ?? null,
      maintainContinuity: insertScript.maintainContinuity ?? true,
      referenceImageUrl: insertScript.referenceImageUrl ?? null,
      userId: insertScript.userId ?? null,
      archived: false,
      image_size: insertScript.image_size ?? null,
      image_quality: insertScript.image_quality ?? null,
      image_style: insertScript.image_style ?? null,
      image_model: insertScript.image_model ?? null,
      prompt_model: insertScript.prompt_model ?? null,
      modelSettings: insertScript.modelSettings ?? null,
      audioDuration: insertScript.audioDuration ?? null,
      audioFilePath: insertScript.audioFilePath ?? null,
      audioTTSId: insertScript.audioTTSId ?? null,
      thumbnailUrl: insertScript.thumbnailUrl ?? null,
      // Music video fields
      characters: insertScript.characters ?? null,
      musicAudioFilePath: insertScript.musicAudioFilePath ?? null,
      musicAudioDuration: insertScript.musicAudioDuration ?? null,
      musicAudioAnalysisStatus: insertScript.musicAudioAnalysisStatus ?? null,
      lyricsAlignment: insertScript.lyricsAlignment ?? null,
      musicSceneTimings: insertScript.musicSceneTimings ?? null,
      // Animation Mode fields
      animationSettings: insertScript.animationSettings ?? null,
      animationStatus: insertScript.animationStatus ?? null,
      finalAnimatedVideoUrl: insertScript.finalAnimatedVideoUrl ?? null,
      finalAnimatedVideoStorageKey: insertScript.finalAnimatedVideoStorageKey ?? null,
    };
    this.scripts.set(id, script);
    return script;
  }

  async updateScript(id: number, scriptUpdate: Partial<InsertScript & { archived?: boolean }>): Promise<Script | undefined> {
    const script = this.scripts.get(id);
    if (!script) return undefined;
    
    const updatedScript = { 
      ...script, 
      ...scriptUpdate,
      updatedAt: new Date()
    };
    this.scripts.set(id, updatedScript);
    return updatedScript;
  }

  async deleteScript(id: number): Promise<boolean> {
    return this.scripts.delete(id);
  }

  // Scene methods
  async getScene(id: number): Promise<Scene | undefined> {
    return this.scenes.get(id);
  }

  async getScenesByScriptId(scriptId: number): Promise<Scene[]> {
    return Array.from(this.scenes.values())
      .filter((scene) => scene.scriptId === scriptId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);
  }

  async createScene(insertScene: InsertScene): Promise<Scene> {
    const id = this.sceneCurrentId++;
    const scene: Scene = { 
      ...insertScene, 
      id,
      title: insertScene.title ?? null,
      scriptId: insertScene.scriptId ?? null,
      soraPrompt: insertScene.soraPrompt ?? null,
      imageUrl: insertScene.imageUrl ?? null,
      estimatedDuration: insertScene.estimatedDuration ?? null,
      metadata: insertScene.metadata ?? null,
      isPinned: insertScene.isPinned ?? false,
      overlayText: insertScene.overlayText ?? null,
      exactStartTime: insertScene.exactStartTime ?? null,
      exactEndTime: insertScene.exactEndTime ?? null,
    };
    this.scenes.set(id, scene);
    return scene;
  }

  async createScenes(insertScenes: InsertScene[]): Promise<Scene[]> {
    return Promise.all(insertScenes.map(scene => this.createScene(scene)));
  }

  async updateScene(id: number, sceneUpdate: Partial<InsertScene>): Promise<Scene | undefined> {
    const scene = this.scenes.get(id);
    if (!scene) return undefined;
    
    const updatedScene = { ...scene, ...sceneUpdate };
    this.scenes.set(id, updatedScene);
    return updatedScene;
  }

  async deleteScene(id: number): Promise<boolean> {
    return this.scenes.delete(id);
  }

  // Audio TTS methods
  async getAudioTTS(id: number): Promise<AudioTTS | undefined> {
    return this.audioTTS.get(id);
  }

  async getTTSAudio(id: number): Promise<AudioTTS | undefined> {
    return this.getAudioTTS(id);
  }

  async getAllAudioTTS(): Promise<AudioTTS[]> {
    return Array.from(this.audioTTS.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async createAudioTTS(insertAudio: InsertAudioTTS): Promise<AudioTTS> {
    const id = this.audioTTSCurrentId++;
    const createdAt = new Date();
    const audio: AudioTTS = {
      id,
      createdAt,
      updatedAt: createdAt,
      title: insertAudio.title,
      content: insertAudio.content,
      voice: insertAudio.voice ?? "coral",
      model: insertAudio.model ?? "gpt-4o-mini-tts",
      speed: insertAudio.speed ?? "1.0",
      audioUrl: null,
      duration: null,
      fileSize: null,
      status: "pending",
    };
    this.audioTTS.set(id, audio);
    return audio;
  }

  async updateAudioTTS(id: number, audioUpdate: UpdateAudioTTS): Promise<AudioTTS | undefined> {
    const audio = this.audioTTS.get(id);
    if (!audio) return undefined;
    
    const updatedAudio = { 
      ...audio, 
      ...audioUpdate, 
      updatedAt: new Date() 
    };
    this.audioTTS.set(id, updatedAudio);
    return updatedAudio;
  }

  async deleteAudioTTS(id: number): Promise<boolean> {
    return this.audioTTS.delete(id);
  }

  async getIncompleteProjects(): Promise<Script[]> {
    return [];
  }

  // Video job methods
  async getVideoJob(id: string): Promise<VideoJob | undefined> {
    return this.videoJobs.get(id);
  }

  async getAllVideoJobs(): Promise<VideoJob[]> {
    return Array.from(this.videoJobs.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getVideoJobsByProject(projectId: number): Promise<VideoJob[]> {
    return Array.from(this.videoJobs.values())
      .filter(job => job.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createVideoJob(job: InsertVideoJob): Promise<VideoJob> {
    const newJob: VideoJob = {
      id: job.id,
      projectId: job.projectId,
      status: job.status || 'pending',
      progress: job.progress || 0,
      videoUrl: job.videoUrl || null,
      duration: job.duration || null,
      fileSize: job.fileSize || null,
      settings: job.settings || null,
      error: job.error || null,
      createdAt: new Date(),
      completedAt: null,
    };
    this.videoJobs.set(job.id, newJob);
    return newJob;
  }

  async updateVideoJob(id: string, jobUpdate: UpdateVideoJob): Promise<VideoJob | undefined> {
    const job = this.videoJobs.get(id);
    if (!job) return undefined;
    
    const updatedJob = { ...job, ...jobUpdate };
    this.videoJobs.set(id, updatedJob);
    return updatedJob;
  }

  async deleteVideoJob(id: string): Promise<boolean> {
    return this.videoJobs.delete(id);
  }

  // Global configuration methods
  async getGlobalConfig(key: string): Promise<GlobalConfig | undefined> {
    return this.globalConfigs.get(key);
  }

  async setGlobalConfig(key: string, value: any): Promise<GlobalConfig> {
    const existing = this.globalConfigs.get(key);
    if (existing) {
      const updated: GlobalConfig = { ...existing, value, updatedAt: new Date() };
      this.globalConfigs.set(key, updated);
      return updated;
    }
    const config: GlobalConfig = {
      id: this.globalConfigCurrentId++,
      key,
      value,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.globalConfigs.set(key, config);
    return config;
  }

  async deleteGlobalConfig(key: string): Promise<boolean> {
    return this.globalConfigs.delete(key);
  }

  // Helper methods for video generation
  async get(id: number): Promise<Script | undefined> {
    return this.getScript(id);
  }

  async getAudioById(id: number): Promise<AudioTTS | undefined> {
    return this.getAudioTTS(id);
  }

  // Animation Character methods (stub implementations for MemStorage)
  async getAnimationCharacter(_id: number): Promise<AnimationCharacter | undefined> {
    return undefined;
  }
  async getAnimationCharactersByScriptId(_scriptId: number): Promise<AnimationCharacter[]> {
    return [];
  }
  async createAnimationCharacter(_character: InsertAnimationCharacter): Promise<AnimationCharacter> {
    throw new Error("MemStorage does not support animation characters");
  }
  async updateAnimationCharacter(_id: number, _character: Partial<InsertAnimationCharacter>): Promise<AnimationCharacter | undefined> {
    return undefined;
  }
  async deleteAnimationCharacter(_id: number): Promise<boolean> {
    return false;
  }

  // Animation Frame methods (stub implementations for MemStorage)
  async getAnimationFrame(_id: number): Promise<AnimationFrame | undefined> {
    return undefined;
  }
  async getAnimationFramesByScriptId(_scriptId: number): Promise<AnimationFrame[]> {
    return [];
  }
  async createAnimationFrame(_frame: InsertAnimationFrame): Promise<AnimationFrame> {
    throw new Error("MemStorage does not support animation frames");
  }
  async createAnimationFrames(_frames: InsertAnimationFrame[]): Promise<AnimationFrame[]> {
    return [];
  }
  async updateAnimationFrame(_id: number, _frame: Partial<InsertAnimationFrame>): Promise<AnimationFrame | undefined> {
    return undefined;
  }
  async deleteAnimationFrame(_id: number): Promise<boolean> {
    return false;
  }
  async deleteAnimationFramesByScriptId(_scriptId: number): Promise<boolean> {
    return true;
  }
  async reorderAnimationFrames(_scriptId: number, _frameIds: number[]): Promise<AnimationFrame[]> {
    return [];
  }

  // Animation Scene methods (stub implementations for MemStorage)
  async getAnimationScene(_id: number): Promise<AnimationScene | undefined> {
    return undefined;
  }
  async getAnimationScenesByScriptId(_scriptId: number): Promise<AnimationScene[]> {
    return [];
  }
  async createAnimationScene(_scene: InsertAnimationScene): Promise<AnimationScene> {
    throw new Error("MemStorage does not support animation scenes");
  }
  async createAnimationScenes(_scenes: InsertAnimationScene[]): Promise<AnimationScene[]> {
    return [];
  }
  async updateAnimationScene(_id: number, _scene: Partial<InsertAnimationScene>): Promise<AnimationScene | undefined> {
    return undefined;
  }
  async deleteAnimationScene(_id: number): Promise<boolean> {
    return false;
  }
  async deleteAnimationScenesByScriptId(_scriptId: number): Promise<boolean> {
    return true;
  }
}

// Database storage implementation using Drizzle ORM
export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Script methods
  async getScript(id: number): Promise<Script | undefined> {
    return await withRetry(async () => {
      const [script] = await db.select().from(scripts).where(eq(scripts.id, id));
      return script;
    });
  }
  
  async getAllScripts(): Promise<Script[]> {
    return await withRetry(async () => {
      return await db
        .select()
        .from(scripts)
        .orderBy(desc(scripts.updatedAt));
    });
  }

  async getScriptsByUserId(userId: number): Promise<Script[]> {
    return await db
      .select()
      .from(scripts)
      .where(eq(scripts.userId, userId))
      .orderBy(desc(scripts.createdAt));
  }

  async createScript(script: InsertScript): Promise<Script> {
    const [newScript] = await db.insert(scripts).values(script).returning();
    return newScript;
  }

  async updateScript(id: number, scriptUpdate: Partial<InsertScript & { archived?: boolean }>): Promise<Script | undefined> {
    const [updatedScript] = await db
      .update(scripts)
      .set(scriptUpdate)
      .where(eq(scripts.id, id))
      .returning();
    return updatedScript;
  }

  async deleteScript(id: number): Promise<boolean> {
    // First delete all scenes associated with this script
    await db.delete(scenesTable).where(eq(scenesTable.scriptId, id));
    
    // Then delete the script
    const [deletedScript] = await db
      .delete(scripts)
      .where(eq(scripts.id, id))
      .returning();
    
    return !!deletedScript;
  }

  // Scene methods
  async getScene(id: number): Promise<Scene | undefined> {
    const [scene] = await db.select().from(scenesTable).where(eq(scenesTable.id, id));
    return scene;
  }

  async getScenesByScriptId(scriptId: number): Promise<Scene[]> {
    try {
      const result = await withRetry(async () => {
        const sceneResults = await db
          .select()
          .from(scenesTable)
          .where(eq(scenesTable.scriptId, scriptId))
          .orderBy(scenesTable.sceneNumber);
        
        console.log(`Successfully retrieved ${sceneResults.length} scenes for script ${scriptId}`);
        return sceneResults;
      }, 3, 1000);
      
      return result;
    } catch (error) {
      console.error(`Database error retrieving scenes for script ${scriptId}:`, error);
      // For production stability, return empty array on database errors
      return [];
    }
  }

  async createScene(scene: InsertScene): Promise<Scene> {
    const [newScene] = await db.insert(scenesTable).values(scene).returning();
    return newScene;
  }

  async createScenes(scenesToInsert: InsertScene[]): Promise<Scene[]> {
    if (scenesToInsert.length === 0) return [];
    return await db.insert(scenesTable).values(scenesToInsert).returning();
  }

  async updateScene(id: number, sceneUpdate: Partial<InsertScene>): Promise<Scene | undefined> {
    const [updatedScene] = await db
      .update(scenesTable)
      .set(sceneUpdate)
      .where(eq(scenesTable.id, id))
      .returning();
    return updatedScene;
  }

  async deleteScene(id: number): Promise<boolean> {
    const [deletedScene] = await db
      .delete(scenesTable)
      .where(eq(scenesTable.id, id))
      .returning();
    
    return !!deletedScene;
  }

  // Audio TTS methods
  async getAudioTTS(id: number): Promise<AudioTTS | undefined> {
    const [audio] = await db.select().from(audioTTS).where(eq(audioTTS.id, id));
    return audio;
  }

  async getTTSAudio(id: number): Promise<AudioTTS | undefined> {
    return this.getAudioTTS(id);
  }

  async getAllAudioTTS(): Promise<AudioTTS[]> {
    return await db.select().from(audioTTS).orderBy(desc(audioTTS.createdAt));
  }

  async createAudioTTS(insertAudio: InsertAudioTTS): Promise<AudioTTS> {
    const [audio] = await db.insert(audioTTS).values(insertAudio).returning();
    return audio;
  }

  async updateAudioTTS(id: number, audioUpdate: UpdateAudioTTS): Promise<AudioTTS | undefined> {
    const [updatedAudio] = await db
      .update(audioTTS)
      .set({ ...audioUpdate, updatedAt: new Date() })
      .where(eq(audioTTS.id, id))
      .returning();
    
    return updatedAudio;
  }

  async deleteAudioTTS(id: number): Promise<boolean> {
    const [deletedAudio] = await db
      .delete(audioTTS)
      .where(eq(audioTTS.id, id))
      .returning();
    
    return !!deletedAudio;
  }

  async getIncompleteProjects(): Promise<Script[]> {
    return withRetry(async () => {
      // Query scripts that have scenes but are incomplete and not hidden
      const incompleteScripts = await db
        .select()
        .from(scripts)
        .where(and(eq(scripts.archived, false), eq(scripts.hiddenFromResume, false)))
        .orderBy(desc(scripts.updatedAt));

      const incompleteProjects: Script[] = [];

      for (const script of incompleteScripts) {
        // Get scene count and image count for this script
        const projectScenes = await db
          .select()
          .from(scenesTable)
          .where(eq(scenesTable.scriptId, script.id));

        const scenesWithImages = projectScenes.filter((scene: Scene) => scene.imageUrl);
        const hasAudio = script.audioDuration && script.audioFilePath;
        const hasThumbnail = script.thumbnailUrl;

        // Consider incomplete if:
        // 1. Has scenes but some are missing images
        // 2. Has audio but no timestamps processed (scenes missing exactStartTime/exactEndTime)
        // 3. Missing thumbnail
        const isIncomplete = 
          (projectScenes.length > 0 && scenesWithImages.length < projectScenes.length) ||
          (hasAudio && projectScenes.some((scene: Scene) => scene.exactStartTime === null || scene.exactEndTime === null)) ||
          (projectScenes.length > 0 && !hasThumbnail);

        if (isIncomplete) {
          incompleteProjects.push(script);
        }
      }

      return incompleteProjects;
    });
  }

  // Video job methods
  async getVideoJob(id: string): Promise<VideoJob | undefined> {
    const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, id));
    return job;
  }

  async getAllVideoJobs(): Promise<VideoJob[]> {
    return await db.select().from(videoJobs).orderBy(desc(videoJobs.createdAt));
  }

  async getVideoJobsByProject(projectId: number): Promise<VideoJob[]> {
    return await db.select().from(videoJobs).where(eq(videoJobs.projectId, projectId)).orderBy(desc(videoJobs.createdAt));
  }

  async createVideoJob(job: InsertVideoJob): Promise<VideoJob> {
    const [createdJob] = await db.insert(videoJobs).values(job).returning();
    return createdJob;
  }

  async updateVideoJob(id: string, job: UpdateVideoJob): Promise<VideoJob | undefined> {
    const [updatedJob] = await db
      .update(videoJobs)
      .set(job)
      .where(eq(videoJobs.id, id))
      .returning();
    
    return updatedJob;
  }

  async deleteVideoJob(id: string): Promise<boolean> {
    const [deletedJob] = await db
      .delete(videoJobs)
      .where(eq(videoJobs.id, id))
      .returning();
    
    return !!deletedJob;
  }

  // Global configuration methods
  async getGlobalConfig(key: string): Promise<GlobalConfig | undefined> {
    const [config] = await db.select().from(globalConfig).where(eq(globalConfig.key, key));
    return config;
  }

  async setGlobalConfig(key: string, value: any): Promise<GlobalConfig> {
    const configData: InsertGlobalConfig = {
      key,
      value
    };

    // Try to update existing config first
    const [updatedConfig] = await db
      .update(globalConfig)
      .set({ value, updatedAt: new Date() })
      .where(eq(globalConfig.key, key))
      .returning();

    if (updatedConfig) {
      return updatedConfig;
    }

    // If no existing config, insert new one
    const [newConfig] = await db.insert(globalConfig).values(configData).returning();
    return newConfig;
  }

  async deleteGlobalConfig(key: string): Promise<boolean> {
    const [deleted] = await db
      .delete(globalConfig)
      .where(eq(globalConfig.key, key))
      .returning();
    
    return !!deleted;
  }

  // Helper methods for video generation
  async get(id: number): Promise<Script | undefined> {
    return this.getScript(id);
  }

  async getAudioById(id: number): Promise<AudioTTS | undefined> {
    return this.getAudioTTS(id);
  }

  // Animation Character methods
  async getAnimationCharacter(id: number): Promise<AnimationCharacter | undefined> {
    const [character] = await db.select().from(animationCharacters).where(eq(animationCharacters.id, id));
    return character;
  }

  async getAnimationCharactersByScriptId(scriptId: number): Promise<AnimationCharacter[]> {
    return await db
      .select()
      .from(animationCharacters)
      .where(eq(animationCharacters.scriptId, scriptId))
      .orderBy(animationCharacters.sortOrder);
  }

  async createAnimationCharacter(character: InsertAnimationCharacter): Promise<AnimationCharacter> {
    const [created] = await db.insert(animationCharacters).values(character).returning();
    return created;
  }

  async updateAnimationCharacter(id: number, character: Partial<InsertAnimationCharacter>): Promise<AnimationCharacter | undefined> {
    const [updated] = await db
      .update(animationCharacters)
      .set(character)
      .where(eq(animationCharacters.id, id))
      .returning();
    return updated;
  }

  async deleteAnimationCharacter(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(animationCharacters)
      .where(eq(animationCharacters.id, id))
      .returning();
    return !!deleted;
  }

  // Animation Frame methods
  async getAnimationFrame(id: number): Promise<AnimationFrame | undefined> {
    const [frame] = await db.select().from(animationFrames).where(eq(animationFrames.id, id));
    return frame;
  }

  async getAnimationFramesByScriptId(scriptId: number): Promise<AnimationFrame[]> {
    return await db
      .select()
      .from(animationFrames)
      .where(eq(animationFrames.scriptId, scriptId))
      .orderBy(animationFrames.sortOrder);
  }

  async createAnimationFrame(frame: InsertAnimationFrame): Promise<AnimationFrame> {
    const [created] = await db.insert(animationFrames).values(frame).returning();
    return created;
  }

  async createAnimationFrames(frames: InsertAnimationFrame[]): Promise<AnimationFrame[]> {
    if (frames.length === 0) return [];
    return await db.insert(animationFrames).values(frames).returning();
  }

  async updateAnimationFrame(id: number, frame: Partial<InsertAnimationFrame>): Promise<AnimationFrame | undefined> {
    const [updated] = await db
      .update(animationFrames)
      .set(frame)
      .where(eq(animationFrames.id, id))
      .returning();
    return updated;
  }

  async deleteAnimationFrame(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(animationFrames)
      .where(eq(animationFrames.id, id))
      .returning();
    return !!deleted;
  }

  async deleteAnimationFramesByScriptId(scriptId: number): Promise<boolean> {
    await db
      .delete(animationFrames)
      .where(eq(animationFrames.scriptId, scriptId));
    return true;
  }

  async reorderAnimationFrames(scriptId: number, frameIds: number[]): Promise<AnimationFrame[]> {
    const updates = frameIds.map((id, index) => 
      db.update(animationFrames)
        .set({ sortOrder: index })
        .where(and(eq(animationFrames.id, id), eq(animationFrames.scriptId, scriptId)))
        .returning()
    );
    const results = await Promise.all(updates);
    return results.flat();
  }

  // Animation Scene methods
  async getAnimationScene(id: number): Promise<AnimationScene | undefined> {
    const [scene] = await db.select().from(animationScenes).where(eq(animationScenes.id, id));
    return scene;
  }

  async getAnimationScenesByScriptId(scriptId: number): Promise<AnimationScene[]> {
    return await db
      .select()
      .from(animationScenes)
      .where(eq(animationScenes.scriptId, scriptId))
      .orderBy(animationScenes.sortOrder);
  }

  async createAnimationScene(scene: InsertAnimationScene): Promise<AnimationScene> {
    const [created] = await db.insert(animationScenes).values(scene).returning();
    return created;
  }

  async createAnimationScenes(scenes: InsertAnimationScene[]): Promise<AnimationScene[]> {
    if (scenes.length === 0) return [];
    return await db.insert(animationScenes).values(scenes).returning();
  }

  async updateAnimationScene(id: number, scene: Partial<InsertAnimationScene>): Promise<AnimationScene | undefined> {
    const [updated] = await db
      .update(animationScenes)
      .set(scene)
      .where(eq(animationScenes.id, id))
      .returning();
    return updated;
  }

  async deleteAnimationScene(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(animationScenes)
      .where(eq(animationScenes.id, id))
      .returning();
    return !!deleted;
  }

  async deleteAnimationScenesByScriptId(scriptId: number): Promise<boolean> {
    await db
      .delete(animationScenes)
      .where(eq(animationScenes.scriptId, scriptId));
    return true;
  }
}

// Use DatabaseStorage for production
export const storage = new DatabaseStorage();
