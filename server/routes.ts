import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { ZodError, z } from "zod";
import {
  generatePromptsSchema,
  generateImagesSchema,
  generateSoraPromptsSchema,
  insertScriptSchema,
  saveProjectSchema,
  projectModelSettingsSchema,
  modelSettingsSchema,
  generateTTSSchema,
  generateVideoSchema,
  elevenLabsGenerateSpeechSchema,
  assignVoiceSchema,
  scripts,
  scenes,
  type Scene
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";
import { parseScript, generateSceneTitles } from "./services/scriptParser";
import { generateDallePrompts, generateDalleImages, generateSoraPrompts, editImage, estimateSceneDurations, generateThumbnail, generateSoraTextToVideoPrompts, generateImageAwareSoraPrompts, extractCharactersFromScript, generateImagesWithReferences, openai, sanitizePrompt, saveImageToPersistentStorage } from "./services/openai";
import OpenAI from "openai";
import { exportProjectAssets } from "./services/exportService";
import { saveAudioFile, analyzeAudioForScenes } from "./services/audioProcessor";
import { getAudioDuration as getMusicAudioDuration } from "./services/musicAudioAnalyzer";
import { generateTTS, getActualAudioDuration, deleteAudioFile } from "./services/ttsService";
import { getModelConfig, updateModelConfig, resetModelConfig, loadModelConfigFromDB } from "./config";
import { workflowOrchestrator } from "./services/workflowOrchestrator";
import { videoGenerator } from "./services/videoGenerator";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { setupSwagger } from "./swagger";
import { registerAutomationRoutes } from "./api/automation";
import { registerModelManagementRoutes } from "./api/modelManagement";
import { registerProviderRoutes } from "./api/providers";
import { registerRenderRoutes } from "./api/renders";
import { registerAssetRoutes } from "./api/assets";
import { registerIntelligenceRoutes } from "./api/intelligence";
import { registerCaptionRoutes } from "./api/captions";
import { WebSocketServer, WebSocket } from 'ws';
import { jobQueue } from './services/jobQueue';
import { objectStorage, ObjectNotFoundError } from './objectStorage';
import { uploadSceneImage } from './services/robustStorage';
import { ElevenLabsService } from './services/elevenLabsService';
import { wav2lipService } from './services/wav2lipService';
import { animationAssemblyService } from './services/animationAssemblyService';
import { renderQueue } from './services/renderQueue';

// Initialize ElevenLabs service
const elevenLabsService = new ElevenLabsService();

// Setup file upload for reference images
// Create upload directories if they don't exist
const uploadDirs = {
  images: path.join(import.meta.dirname, "..", "uploads"),
  audio: path.join(import.meta.dirname, "..", "uploads", "audio"),
  music: path.join(import.meta.dirname, "..", "uploads", "music")
};

Object.values(uploadDirs).forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDirs.images);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const ext = path.extname(file.originalname).toLowerCase();
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && allowedTypes.test(ext)) {
      return cb(null, true);
    }
    
    cb(new Error("Only image files are allowed"));
  }
});

// Setup file upload for audio files
const audioUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDirs.audio);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    }
  }),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp3|wav|m4a|aac/;
    const ext = path.extname(file.originalname).toLowerCase();
    const mimetype = file.mimetype.includes('audio');
    
    if (mimetype || allowedTypes.test(ext)) {
      return cb(null, true);
    }
    
    cb(new Error("Only audio files are allowed"));
  }
});

// Setup file upload for music audio files (for music video projects)
const musicAudioUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDirs.music);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname);
      cb(null, `music-${uuidv4()}${ext}`);
    }
  }),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for music files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp3|wav|m4a|aac|flac|ogg/;
    const ext = path.extname(file.originalname).toLowerCase();
    const mimetype = file.mimetype.includes('audio');
    
    if (mimetype || allowedTypes.test(ext)) {
      return cb(null, true);
    }
    
    cb(new Error("Only audio files are allowed"));
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Check object storage health at startup
  const isStorageConfigured = await objectStorage.isConfigured();
  if (isStorageConfigured) {
    console.log("[Startup] Object storage is configured and healthy - images will persist across restarts");
  } else {
    console.error("[CRITICAL] Object storage NOT configured - images stored locally WILL BE LOST on restart!");
    console.error("[CRITICAL] Please configure Replit Object Storage to prevent data loss");
  }
  
  // Setup Swagger API Documentation
  setupSwagger(app);
  
  // Register automation API routes
  registerAutomationRoutes(app);
  
  // Register model management routes for easy GPT-5/legacy switching
  registerModelManagementRoutes(app);

  // Register rebuild-phase API routes
  registerProviderRoutes(app);
  registerRenderRoutes(app);
  registerAssetRoutes(app);
  registerIntelligenceRoutes(app);
  registerCaptionRoutes(app);
  try {
    await renderQueue.init();
  } catch (error) {
    console.error("[render-queue] Failed to initialize queue recovery:", error);
  }
  
  // Health check endpoint for storage status
  app.get("/api/health/storage", async (req: Request, res: Response) => {
    const isConfigured = await objectStorage.isConfigured();
    const { getStorageStatus } = await import('./services/storageMigration');
    const status = await getStorageStatus();
    res.json({
      status: isConfigured ? 'healthy' : 'degraded',
      objectStorage: isConfigured,
      warning: isConfigured ? null : 'Object storage not configured - images may be lost on restart',
      ...status
    });
  });
  
  app.post("/api/admin/migrate-storage", async (req: Request, res: Response) => {
    try {
      const { migrateLocalImagesToObjectStorage } = await import('./services/storageMigration');
      const result = await migrateLocalImagesToObjectStorage();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Serve files from persistent object storage (for generated images)
  app.get("/storage/*", async (req: Request, res: Response) => {
    try {
      const objectPath = req.path.replace("/storage/", "");
      if (!objectPath) {
        return res.status(400).json({ error: "No object path specified" });
      }
      
      if (!objectStorage.isConfigured()) {
        return res.status(503).json({ error: "Object storage not configured" });
      }
      
      await objectStorage.streamToResponse(objectPath, res);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "File not found" });
      }
      console.error("Error serving from object storage:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Simple cache for projects to handle database rate limits
  let projectsCache: any[] = [];
  let projectsCacheTime = 0;
  const PROJECTS_CACHE_DURATION = 15000; // 15 seconds

  // Project Management Routes
  app.get("/api/projects", async (req: Request, res: Response) => {
    try {
      // Check cache first to avoid hitting rate limits
      const now = Date.now();
      if (projectsCache.length > 0 && (now - projectsCacheTime) < PROJECTS_CACHE_DURATION) {
        console.log(`Returning ${projectsCache.length} projects from cache`);
        return res.status(200).json(projectsCache);
      }

      try {
        // Use raw SQL for better performance and to avoid timeout issues
        const projectsWithSceneCounts = await db.execute(`
          SELECT 
            s.*,
            COALESCE(scene_counts.scene_count, 0) as scene_count
          FROM scripts s
          LEFT JOIN (
            SELECT 
              script_id,
              COUNT(*) as scene_count
            FROM scenes
            GROUP BY script_id
          ) scene_counts ON s.id = scene_counts.script_id
          ORDER BY s.updated_at DESC
        `);

        const transformedProjects = projectsWithSceneCounts.rows.map((project: any) => ({
          id: project.id,
          content: project.content,
          title: project.title,
          description: project.description,
          projectType: project.project_type,
          style: project.style,
          customStylePrompt: project.custom_style_prompt,
          maintainContinuity: project.maintain_continuity,
          referenceImageUrl: project.reference_image_url,
          status: project.status,
          archived: project.archived,
          userId: project.user_id,
          image_size: project.image_size,
          image_quality: project.image_quality,
          image_style: project.image_style,
          image_model: project.image_model,
          prompt_model: project.prompt_model,
          modelSettings: project.model_settings,
          audioDuration: project.audio_duration,
          audioFilePath: project.audio_file_path,
          audioTTSId: project.audio_tts_id,
          thumbnailUrl: project.thumbnail_url,
          sceneCount: parseInt(project.scene_count) || 0,
          createdAt: new Date(project.created_at).toISOString(),
          updatedAt: new Date(project.updated_at).toISOString(),
        }));
        
        // Update cache on successful fetch
        projectsCache = transformedProjects;
        projectsCacheTime = now;
        
        res.status(200).json(transformedProjects);
      } catch (dbError) {
        console.warn("Database unavailable for projects fetch:", dbError);
        
        // Return cached data if available, otherwise empty array
        if (projectsCache.length > 0) {
          console.log(`Returning ${projectsCache.length} cached projects due to database error`);
          res.status(200).json(projectsCache);
        } else {
          console.log("No cached projects available, returning empty array");
          res.status(200).json([]);
        }
      }
    } catch (err) {
      console.error("Error fetching projects with scene counts:", err);
      res.status(200).json(projectsCache.length > 0 ? projectsCache : []);
    }
  });
  
  app.post("/api/projects", async (req: Request, res: Response) => {
    try {
      const data = saveProjectSchema.parse(req.body);
      
      // For new projects
      if (!data.id) {
        const script = await storage.createScript({
          content: data.content,
          title: data.title,
          description: data.description,
          style: data.style,
          customStylePrompt: data.customStylePrompt,
          maintainContinuity: data.maintainContinuity,
          referenceImageUrl: data.referenceImageUrl,
          status: data.status,
          projectType: data.projectType || 'video', // Default to video if not specified
          animationSettings: data.animationSettings || null,
          animationStatus: data.projectType === 'animation' ? 'pending' : null,
        });
        
        // Check if this is a duplication from an existing project
        // We can detect this by looking for source data in the request
        if (req.body.sourceProjectId) {
          try {
            // Get scenes from source project
            const sourceScenes = await storage.getScenesByScriptId(req.body.sourceProjectId);
            
            if (sourceScenes && sourceScenes.length > 0) {
              // Create new scenes with proper sequence numbers
              const newScenes = sourceScenes.map((scene, index) => ({
                scriptId: script.id,
                sceneNumber: index + 1, // Ensure proper numbering sequence
                title: scene.title,
                scriptExcerpt: scene.scriptExcerpt,
                dallePrompt: scene.dallePrompt,
                soraPrompt: scene.soraPrompt,
                imageUrl: scene.imageUrl,
                estimatedDuration: scene.estimatedDuration,
                metadata: scene.metadata as any,
                isPinned: scene.isPinned,
                overlayText: scene.overlayText,
                exactStartTime: scene.exactStartTime,
                exactEndTime: scene.exactEndTime,
              }));
              
              await storage.createScenes(newScenes);
            }
          } catch (copyError) {
            console.error("Error duplicating scenes:", copyError);
            // Continue without scenes if copying fails
          }
        }
        
        return res.status(201).json(script);
      } 
      // For updating existing projects
      else {
        const existingScript = await storage.getScript(data.id);
        if (!existingScript) {
          return res.status(404).json({ message: "Project not found" });
        }
        
        const updatedScript = await storage.updateScript(data.id, {
          content: data.content,
          title: data.title,
          description: data.description,
          style: data.style,
          customStylePrompt: data.customStylePrompt,
          maintainContinuity: data.maintainContinuity,
          referenceImageUrl: data.referenceImageUrl,
          status: data.status,
        });
        
        return res.status(200).json(updatedScript);
      }
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });
  
  // Check for incomplete projects that can be resumed - MUST come before :id route
  // Get completed projects for video generation
  app.get("/api/projects/completed", async (req: Request, res: Response) => {
    try {
      try {
        const allProjects = await storage.getAllScripts();
        
        // Filter projects that have scenes with images and audio
        const completedProjects = [];
        
        for (const project of allProjects) {
          if (project.archived) continue;
          
          const scenes = await storage.getScenesByScriptId(project.id);
          const scenesWithImages = scenes.filter(scene => scene.imageUrl);
          
          // Project is complete if it has scenes with images
          if (scenesWithImages.length > 0) {
            completedProjects.push({
              id: project.id,
              content: project.content,
              title: project.title,
              thumbnailUrl: project.thumbnailUrl,
              createdAt: project.createdAt,
              audioId: project.audioTTSId || null,
            });
          }
        }
        
        res.json(completedProjects);
      } catch (dbError) {
        console.warn("Database unavailable for completed projects fetch, returning empty array:", dbError);
        res.status(200).json([]);
      }
    } catch (err) {
      console.error("Error fetching completed projects:", err);
      res.status(200).json([]);
    }
  });

  app.get("/api/projects/incomplete", async (req: Request, res: Response) => {
    try {
      try {
        const incompleteProjects = await storage.getIncompleteProjects();
        return res.status(200).json({ projects: incompleteProjects });
      } catch (dbError) {
        console.warn("Database unavailable for incomplete projects fetch, returning empty array:", dbError);
        return res.status(200).json({ projects: [] });
      }
    } catch (err) {
      console.error("Error fetching incomplete projects:", err);
      return res.status(200).json({ projects: [] });
    }
  });

  app.get("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      
      try {
        const script = await storage.getScript(id);
        if (!script) {
          return res.status(404).json({ message: "Project not found" });
        }
        
        // Add extra logging to debug project 38 issues
        if (id === 38) {
          console.log(`Successfully found project ID 38: ${script.title || 'Untitled'}`);
        }
        
        return res.status(200).json(script);
      } catch (scriptErr) {
        console.error(`Error retrieving project ${id}:`, scriptErr);
        // Give a more helpful error message
        return res.status(500).json({ 
          message: "Database connection issue when loading project. Please try again.",
          details: scriptErr instanceof Error ? scriptErr.message : "Unknown error" 
        });
      }
    } catch (err) {
      console.error(`Outer error handling for project ${req.params.id}:`, err);
      errorHandler(err as Error, res);
    }
  });
  
  // Update project endpoint
  app.put("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      
      const data = saveProjectSchema.parse(req.body);
      
      // Check if project exists
      const existingScript = await storage.getScript(id);
      if (!existingScript) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const updatedScript = await storage.updateScript(id, {
        content: data.content,
        title: data.title,
        description: data.description,
        style: data.style,
        customStylePrompt: data.customStylePrompt,
        maintainContinuity: data.maintainContinuity,
        referenceImageUrl: data.referenceImageUrl,
        status: data.status,
      });
      
      return res.status(200).json(updatedScript);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });
  
  // Archive/unarchive project
  app.patch("/api/projects/:id/archive", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      
      const { archived } = req.body;
      if (typeof archived !== 'boolean') {
        return res.status(400).json({ message: "archived field must be boolean" });
      }
      
      const script = await storage.updateScript(id, { archived });
      
      if (!script) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      res.status(200).json(script);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Dismiss project from resume list
  app.patch("/api/projects/:id/dismiss-from-resume", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      
      const script = await storage.updateScript(id, { hiddenFromResume: true });
      
      if (!script) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      res.status(200).json(script);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  app.delete("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      
      // Check if project exists
      const script = await storage.getScript(id);
      if (!script) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Delete all scenes associated with this script
      const scenes = await storage.getScenesByScriptId(id);
      for (const scene of scenes) {
        if (scene.id) {
          await storage.deleteScene(scene.id);
        }
      }
      
      // Delete the script itself
      const deleted = await storage.deleteScript(id);
      if (deleted) {
        return res.status(200).json({ message: "Project deleted successfully" });
      } else {
        return res.status(500).json({ message: "Failed to delete project" });
      }
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });
  // Error handler middleware
  const errorHandler = (err: Error, res: Response) => {
    console.error("API Error:", err);
    
    if (err instanceof ZodError) {
      return res.status(400).json({
        message: "Validation error",
        errors: err.errors,
      });
    }
    
    return res.status(500).json({
      message: err.message || "Internal server error",
    });
  };

  // Create HTTP server
  const httpServer = createServer(app);

  // Set up API routes
  app.post("/api/upload-reference-image", imageUpload.single("referenceImage"), (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const imageUrl = `/uploads/${req.file.filename}`;
      return res.status(200).json({ imageUrl });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Music audio upload for music video projects
  app.post("/api/upload-music-audio", musicAudioUpload.single("musicAudio"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No audio file uploaded" });
      }
      
      const audioUrl = `/uploads/music/${req.file.filename}`;
      const fullPath = path.join(uploadDirs.music, req.file.filename);
      
      // Get the audio duration
      let duration = 0;
      try {
        duration = await getMusicAudioDuration(audioUrl);
      } catch (durationError) {
        console.error("Error getting audio duration:", durationError);
      }
      
      return res.status(200).json({ 
        audioUrl,
        duration,
        filename: req.file.originalname,
        size: req.file.size
      });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Regenerate music video scenes with audio analysis
  app.post("/api/regenerate-music-video/:scriptId", async (req: Request, res: Response) => {
    try {
      const scriptId = parseInt(req.params.scriptId, 10);
      if (isNaN(scriptId)) {
        return res.status(400).json({ message: "Invalid script ID" });
      }

      const script = await storage.getScript(scriptId);
      if (!script) {
        return res.status(404).json({ message: "Project not found" });
      }

      if (script.projectType !== 'music-video') {
        return res.status(400).json({ message: "This endpoint is only for music video projects" });
      }

      if (!script.musicAudioFilePath) {
        return res.status(400).json({ message: "No music audio file found for this project" });
      }

      // Delete existing scenes
      const existingScenes = await storage.getScenesByScriptId(scriptId);
      for (const scene of existingScenes) {
        await storage.deleteScene(scene.id);
      }
      console.log(`Deleted ${existingScenes.length} existing scenes for script ${scriptId}`);

      // Reset analysis status
      await storage.updateScript(scriptId, {
        musicAudioAnalysisStatus: 'pending',
        musicSceneTimings: null
      });

      // Create a new workflow for this project with audio analysis
      const workflowId = await workflowOrchestrator.createMusicVideoWorkflow(scriptId);

      return res.status(200).json({
        message: "Music video regeneration started",
        workflowId,
        scriptId
      });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  app.post("/api/generate-prompts", async (req: Request, res: Response) => {
    try {
      console.log("Starting prompt generation process");
      const data = generatePromptsSchema.parse(req.body);
      let script;
      let existingScenes: any[] = [];
      let scriptId = data.scriptId;
      
      // Add more detailed debugging for troubleshooting
      console.log(`Generating prompts with parameters:
        - Script ID: ${data.scriptId || 'New project'}
        - Style: ${data.style}
        - Maintain continuity: ${data.maintainContinuity}
        - Project type: ${data.projectType || 'video'}`);
      
      // Check if we're working with an existing script (regeneration case)
      if (scriptId) {
        try {
          // Get the existing script
          script = await storage.getScript(scriptId);
          if (!script) {
            return res.status(404).json({ message: "Script not found" });
          }
          
          console.log(`Found existing script: ${script.title || 'Untitled'}`);
          
          // Update the script with new properties
          script = await storage.updateScript(scriptId, {
            content: data.script,
            style: data.style,
            customStylePrompt: data.customStylePrompt,
            maintainContinuity: data.maintainContinuity,
            referenceImageUrl: data.referenceImageUrl,
          });
          
          // Get existing scenes
          try {
            existingScenes = await storage.getScenesByScriptId(scriptId);
            console.log(`Found ${existingScenes.length} existing scenes for script ${scriptId}`);
            
            // Filter out pinned scenes that should preserve their original prompts
            const pinnedScenes = existingScenes.filter(scene => scene.isPinned);
            console.log(`Found ${pinnedScenes.length} pinned scenes that will preserve their original prompts`);
          } catch (scenesError) {
            console.error("Error fetching existing scenes:", scenesError);
            existingScenes = []; // Fall back to empty array if we can't get scenes
          }
        } catch (scriptError) {
          console.error("Error fetching/updating script:", scriptError);
          return res.status(500).json({ 
            message: "Failed to retrieve or update the existing project",
            error: scriptError instanceof Error ? scriptError.message : "Unknown error"
          });
        }
      } else {
        // Create a new script entry
        try {
          script = await storage.createScript({
            content: data.script,
            title: data.title || "Untitled Project",
            description: data.description,
            style: data.style,
            customStylePrompt: data.customStylePrompt,
            maintainContinuity: data.maintainContinuity,
            referenceImageUrl: data.referenceImageUrl,
            userId: 1, // Default user ID since we don't have auth implemented
            projectType: data.projectType || 'video', // Add project type
          });
          scriptId = script.id;
          console.log(`Created new script with ID ${scriptId}`);
        } catch (createError) {
          console.error("Error creating new script:", createError);
          return res.status(500).json({ 
            message: "Failed to create a new project",
            error: createError instanceof Error ? createError.message : "Unknown error"
          });
        }
      }
      
      // Check for existing audio duration to optimize scene count
      let audioDurationSeconds: number | undefined;
      if (script?.audioDuration) {
        audioDurationSeconds = script.audioDuration;
        console.log(`Found existing audio duration: ${audioDurationSeconds} seconds`);
      }

      // Parse script into scenes with better error handling
      console.log("Starting script parsing...");
      let parsedScenes;
      try {
        parsedScenes = await parseScript(data.script, audioDurationSeconds);
        console.log(`Successfully parsed script into ${parsedScenes.length} scenes`);
      } catch (parseError) {
        console.error("Error parsing script:", parseError);
        return res.status(500).json({ 
          message: "Failed to parse script into scenes", 
          error: parseError instanceof Error ? parseError.message : "Unknown error" 
        });
      }
      
      // Generate scene titles with error handling
      console.log("Generating scene titles...");
      let scenesWithTitles;
      try {
        scenesWithTitles = await generateSceneTitles(parsedScenes);
        console.log(`Added titles to ${scenesWithTitles.length} scenes`);
      } catch (titlesError) {
        console.error("Error generating scene titles:", titlesError);
        // Fallback to scenes without titles
        scenesWithTitles = parsedScenes.map((scene, index) => ({
          ...scene,
          title: `Scene ${index + 1}`
        }));
        console.log("Using fallback scene titles");
      }
      
      // Get project-specific model settings if they exist
      let projectModelSettings = null;
      if (scriptId) {
        try {
          const modelSettingsResult = await db
            .select({ modelSettings: scripts.modelSettings })
            .from(scripts)
            .where(eq(scripts.id, scriptId));
          
          if (modelSettingsResult.length > 0 && modelSettingsResult[0].modelSettings) {
            projectModelSettings = modelSettingsResult[0].modelSettings;
            console.log("Using project-specific model settings for prompt generation");
          }
        } catch (error) {
          console.error("Error retrieving project model settings:", error);
        }
      }
      
      // Get project type (if scriptId is provided, get it from the script)
      let projectType = data.projectType || 'video'; // Default to video
      if (scriptId) {
        projectType = script?.projectType || 'video';
      }
      console.log("Using project type:", projectType);
      
      // Generate prompts based on project type
      let scenesWithPrompts;
      
      if (projectType === 'sora') {
        // For Sora projects, generate detailed text-to-video prompts
        console.log("Generating Sora text-to-video prompts...");
        try {
          scenesWithPrompts = await generateSoraTextToVideoPrompts(
            data.script,
            data.style,
            data.maintainContinuity,
            data.customStylePrompt,
            projectModelSettings
          );
          console.log(`Generated Sora prompts for ${scenesWithPrompts.length} scenes`);
        } catch (promptError) {
          console.error("Error generating Sora prompts:", promptError);
          
          // Create simple fallback prompts if AI generation fails
          scenesWithPrompts = scenesWithTitles.map((scene, index) => {
            const content = scene.content || `Scene ${index + 1}`;
            const styleText = data.style === 'custom' && data.customStylePrompt 
              ? data.customStylePrompt 
              : `${data.style} style`;
            
            return {
              ...scene,
              dallePrompt: '',
              soraPrompt: `${styleText} video. ${content}. A detailed 10-15 second video scene with cinematic camera work, expressive performances, and rich environmental details that brings the story to life.`
            };
          });
          
          console.log("Created fallback Sora prompts for all scenes");
        }
      } else {
        // For other project types, generate image prompts
        console.log("Generating DALL-E prompts...");
        try {
          scenesWithPrompts = await generateDallePrompts(
            scenesWithTitles,
            data.style,
            data.maintainContinuity,
            data.referenceImageUrl,
            data.customStylePrompt,
            projectModelSettings,
            projectType as any
          );
          console.log(`Generated prompts for ${scenesWithPrompts.length} scenes`);
        } catch (promptError) {
          console.error("Error generating DALL-E prompts:", promptError);
          
          // Create simple fallback prompts if AI generation fails
          scenesWithPrompts = scenesWithTitles.map((scene, index) => {
            const isFirst = index === 0;
            const isLast = index === scenesWithTitles.length - 1;
            const position = isFirst ? "introductory" : (isLast ? "concluding" : "middle");
            const content = scene.content || `Scene ${index + 1}`;
            const styleText = data.style === 'custom' && data.customStylePrompt 
              ? data.customStylePrompt 
              : `${data.style} style`;
            
            return {
              ...scene,
              dallePrompt: `A ${position} image showing ${content.substring(0, 100)}... in ${styleText}. The image should have high contrast, clear subject focus, and professional composition suitable for an educational video.`,
              soraPrompt: null
            };
          });
          
          console.log("Created fallback prompts for all scenes");
        }
      }
      
      let resultScenes = [];
      
      // Creating new scenes or updating existing ones
      if (existingScenes.length > 0) {
        // First, delete all non-pinned scenes
        await Promise.all(
          existingScenes
            .filter(scene => !scene.isPinned)
            .map(scene => storage.deleteScene(scene.id))
        );
        
        // Preserve pinned scenes
        const pinnedScenes = existingScenes.filter(scene => scene.isPinned);
        
        // Create new entries for non-pinned scenes
        const newSceneIndex = pinnedScenes.length;
        const insertScenes = scenesWithPrompts
          .filter((_, index) => !pinnedScenes.some(pinned => pinned.sceneNumber === index + 1))
          .map((scene, index) => ({
            scriptId,
            sceneNumber: newSceneIndex + index + 1,
            title: scene.title || `Scene ${newSceneIndex + index + 1}`,
            scriptExcerpt: scene.content || "",
            dallePrompt: scene.dallePrompt || '',
            soraPrompt: scene.soraPrompt || null,
            imageUrl: null,
            estimatedDuration: scene.estimatedDuration || null,
            metadata: {},
            isPinned: false,
          }));
        
        // Create the new scenes
        const createdScenes = await storage.createScenes(insertScenes);
        
        // Combine pinned and new scenes for the result
        resultScenes = [...pinnedScenes, ...createdScenes];
      } else {
        // Normal flow for creating all new scenes
        const insertScenes = scenesWithPrompts.map((scene, index) => ({
          scriptId,
          sceneNumber: index + 1,
          title: scene.title || `Scene ${index + 1}`,
          scriptExcerpt: scene.content || "",
          dallePrompt: scene.dallePrompt || '',
          soraPrompt: scene.soraPrompt || null,
          imageUrl: null,
          estimatedDuration: scene.estimatedDuration || null,
          metadata: {},
          isPinned: false,
        }));
        
        resultScenes = await storage.createScenes(insertScenes);
      }
      
      return res.status(200).json({ scenes: resultScenes, scriptId });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  app.post("/api/generate-images", async (req: Request, res: Response) => {
    try {
      console.log("Received request body:", JSON.stringify(req.body, null, 2));
      
      // Support both old format (with scenes array) and new format (with scriptId)
      let data;
      let scriptId;
      let scenes;
      let forceRegenerate = false;
      
      if (req.body.scenes && Array.isArray(req.body.scenes)) {
        // Old format - scenes provided in request
        data = generateImagesSchema.parse(req.body);
        scriptId = data.scenes[0]?.scriptId;
        scenes = data.scenes;
        forceRegenerate = req.body.forceRegenerate || false;
      } else {
        // New format - scriptId provided, fetch scenes from database
        const simpleSchema = z.object({
          scriptId: z.number(),
          style: z.string(),
          customStylePrompt: z.string().optional(),
          maintainContinuity: z.boolean().optional(),
          referenceImageUrl: z.string().optional(),
          forceRegenerate: z.boolean().optional()
        });
        
        data = simpleSchema.parse(req.body);
        scriptId = data.scriptId;
        scenes = await storage.getScenesByScriptId(scriptId);
        forceRegenerate = data.forceRegenerate || false;
        
        if (!scenes || scenes.length === 0) {
          return res.status(400).json({ message: "No scenes found for this script. Generate storyboard first." });
        }
        
        // Auto-detect and repair corrupted scenes from failed unified creator workflows
        const corruptedScenes = scenes.filter(scene => 
          !scene.dallePrompt || 
          scene.dallePrompt === 'Temporary prompt' ||
          scene.dallePrompt.length < 50 ||
          scene.imageUrl === 'generating' ||
          scene.imageUrl === 'placeholder'
        );
        
        if (corruptedScenes.length > 0) {
          console.log(`Detected ${corruptedScenes.length} corrupted scenes from failed workflow, enabling force regeneration`);
          forceRegenerate = true;
        }
      }
      
      console.log(`Starting async image generation for ${scenes.length} scenes`);
      
      if (!scriptId) {
        return res.status(400).json({ message: "Script ID is required" });
      }

      // Add job to the queue for asynchronous processing
      const jobId = await jobQueue.addImageGenerationJob(
        scriptId,
        scenes,
        data.style,
        data.customStylePrompt,
        data.maintainContinuity || true,
        data.referenceImageUrl,
        forceRegenerate
      );

      console.log(`Created image generation job ${jobId} for script ${scriptId}`);

      // Return immediately with job ID
      return res.status(202).json({ 
        message: "Image generation started",
        jobId,
        status: "processing"
      });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Get all jobs endpoint (for queue monitoring)
  app.get("/api/jobs", async (req: Request, res: Response) => {
    try {
      const jobs = jobQueue.getAllJobs();
      
      // Transform job data to include project titles and job type
      const enhancedJobs = await Promise.all(
        jobs.map(async (job) => {
          try {
            const script = await storage.getScript(job.scriptId);
            const jobType = job.jobType || 'standard';
            const isVideoJob = jobType === 'sora-video';
            
            return {
              id: job.id,
              type: isVideoJob ? 'video_generation' : 'image_generation',
              jobType: jobType,
              status: job.status,
              scriptId: job.scriptId,
              projectTitle: script?.title || `Project ${job.scriptId}`,
              totalScenes: job.progress.total,
              completedScenes: job.progress.completed,
              createdAt: job.createdAt.toISOString(),
              updatedAt: job.completedAt?.toISOString() || job.createdAt.toISOString(),
              error: job.error,
              progress: Math.round((job.progress.completed / job.progress.total) * 100) || 0,
              style: (job as any).style
            };
          } catch (error) {
            console.error(`Error fetching script for job ${job.id}:`, error);
            const jobType = job.jobType || 'standard';
            const isVideoJob = jobType === 'sora-video';
            
            return {
              id: job.id,
              type: isVideoJob ? 'video_generation' : 'image_generation',
              jobType: jobType,
              status: job.status,
              scriptId: job.scriptId,
              projectTitle: `Project ${job.scriptId}`,
              totalScenes: job.progress.total,
              completedScenes: job.progress.completed,
              createdAt: job.createdAt.toISOString(),
              updatedAt: job.completedAt?.toISOString() || job.createdAt.toISOString(),
              error: job.error,
              progress: Math.round((job.progress.completed / job.progress.total) * 100) || 0,
              style: (job as any).style
            };
          }
        })
      );
      
      return res.status(200).json(enhancedJobs);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Get job status endpoint
  app.get("/api/jobs/:jobId", async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const job = jobQueue.getJob(jobId);
      
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      
      return res.status(200).json(job);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Get all jobs for a script
  app.get("/api/scripts/:scriptId/jobs", async (req: Request, res: Response) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      if (isNaN(scriptId)) {
        return res.status(400).json({ message: "Invalid script ID" });
      }
      
      const jobs = jobQueue.getJobsByScript(scriptId);
      return res.status(200).json(jobs);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Clear completed jobs endpoint
  app.post("/api/jobs/clear-completed", (req: Request, res: Response) => {
    try {
      jobQueue.clearCompletedJobs();
      return res.status(200).json({ message: "Completed jobs cleared successfully" });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Cancel a specific job
  app.post("/api/jobs/:jobId/cancel", (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const cancelled = jobQueue.cancelJob(jobId);
      
      if (cancelled) {
        return res.status(200).json({ message: "Job cancelled successfully", jobId });
      } else {
        return res.status(400).json({ message: "Could not cancel job - may already be completed or not found", jobId });
      }
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Cancel all jobs for a script/project
  app.post("/api/scripts/:scriptId/cancel-jobs", (req: Request, res: Response) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      if (isNaN(scriptId)) {
        return res.status(400).json({ message: "Invalid script ID" });
      }
      
      const cancelledCount = jobQueue.cancelJobsByScript(scriptId);
      return res.status(200).json({ 
        message: `Cancelled ${cancelledCount} job(s)`, 
        cancelledCount,
        scriptId 
      });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  app.post("/api/generate-sora-prompts", async (req: Request, res: Response) => {
    try {
      const data = generateSoraPromptsSchema.parse(req.body);
      
      // Verify scriptId is provided
      if (!data.scriptId) {
        return res.status(400).json({ message: "Script ID is required" });
      }
      
      // Get all scenes for this script
      const allScenes = await storage.getScenesByScriptId(data.scriptId);
      
      // Check if any scenes have images - Sora prompts should be generated AFTER images
      const scenesWithImages = allScenes.filter(scene => scene.imageUrl);
      if (scenesWithImages.length === 0) {
        return res.status(400).json({ 
          message: "No scenes with images found. Please generate images first before creating Sora prompts. Per OpenAI's guide, Sora prompts work best when image-aware."
        });
      }
      
      // Get project-specific model settings if they exist
      let projectModelSettings = null;
      try {
        const modelSettingsResult = await db
          .select({ modelSettings: scripts.modelSettings })
          .from(scripts)
          .where(eq(scripts.id, data.scriptId));
        
        if (modelSettingsResult.length > 0 && modelSettingsResult[0].modelSettings) {
          projectModelSettings = modelSettingsResult[0].modelSettings;
          console.log("Using project-specific model settings for Sora prompt generation");
        }
      } catch (error) {
        console.error("Error retrieving project model settings:", error);
      }
      
      // Use the new image-aware Sora prompt generation following OpenAI's official guide
      // This generates prompts that reference the existing scene images for better results
      // Clip lengths are set to 4, 8, or 12 seconds per Sora API requirements
      console.log(`Generating image-aware Sora prompts for ${scenesWithImages.length} scenes...`);
      
      const soraResults = await generateImageAwareSoraPrompts(
        scenesWithImages.map(scene => ({
          id: scene.id,
          sceneNumber: scene.sceneNumber,
          content: scene.scriptExcerpt,
          scriptExcerpt: scene.scriptExcerpt,
          title: scene.title || undefined,
          imageUrl: scene.imageUrl,
          estimatedDuration: scene.estimatedDuration || undefined,
          dallePrompt: scene.dallePrompt
        })),
        data.style,
        true, // maintainContinuity
        data.customStylePrompt,
        projectModelSettings
      );
      
      // Update scenes with Sora prompts and clip lengths
      const updatedScenes = await Promise.all(
        soraResults.map(async (result) => {
          if (result.sceneId) {
            return storage.updateScene(result.sceneId, {
              soraPrompt: result.soraPrompt,
              soraClipLength: result.soraClipLength, // Store the Sora API clip length (4, 8, or 12 seconds)
            });
          }
          return result;
        })
      );
      
      console.log(`Generated Sora prompts for ${updatedScenes.length} scenes with clip lengths`);
      return res.status(200).json({ scenes: updatedScenes });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Generate Sora videos for scenes - uses job queue for async processing
  app.post("/api/generate-sora-videos/:scriptId", async (req: Request, res: Response) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      if (isNaN(scriptId)) {
        return res.status(400).json({ message: "Invalid script ID" });
      }

      // Get all scenes for this script
      const scenes = await storage.getScenesByScriptId(scriptId);
      
      // Filter scenes that have Sora prompts and images
      const scenesWithSoraPrompts = scenes.filter(scene => scene.soraPrompt && scene.imageUrl);
      
      if (scenesWithSoraPrompts.length === 0) {
        return res.status(400).json({ 
          message: "No scenes with Sora prompts found. Please generate Sora prompts first."
        });
      }

      console.log(`Starting Sora video generation job for ${scenesWithSoraPrompts.length} scenes`);

      // Add job to queue - processing happens asynchronously
      const jobId = await jobQueue.addSoraVideoJob(scriptId, scenesWithSoraPrompts);

      return res.status(202).json({ 
        message: "Sora video generation started", 
        jobId,
        scenesCount: scenesWithSoraPrompts.length,
        estimatedTime: `${scenesWithSoraPrompts.length * 3} to ${scenesWithSoraPrompts.length * 10} minutes`
      });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Generate Sora video for a single scene
  app.post("/api/generate-sora-video/scene/:sceneId", async (req: Request, res: Response) => {
    try {
      const sceneId = parseInt(req.params.sceneId);
      if (isNaN(sceneId)) {
        return res.status(400).json({ message: "Invalid scene ID" });
      }

      // Get the scene
      const scene = await storage.getScene(sceneId);
      if (!scene) {
        return res.status(404).json({ message: "Scene not found" });
      }

      // Check if scene has required data
      if (!scene.soraPrompt) {
        return res.status(400).json({ 
          message: "Scene does not have a Sora video prompt. Please generate one first."
        });
      }

      if (!scene.imageUrl) {
        return res.status(400).json({ 
          message: "Scene does not have an image. Please generate an image first."
        });
      }

      console.log(`Starting Sora video generation for single scene ${sceneId}...`);

      // Add job to queue with just this one scene
      const jobId = await jobQueue.addSoraVideoJob(scene.scriptId || 0, [scene]);

      return res.status(202).json({ 
        message: "Sora video generation started for scene", 
        jobId,
        sceneId: scene.id,
        sceneNumber: scene.sceneNumber,
        estimatedTime: "3 to 10 minutes"
      });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Extract characters from a script for consistent character generation
  app.post("/api/extract-characters/:scriptId", async (req: Request, res: Response) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      if (isNaN(scriptId)) {
        return res.status(400).json({ message: "Invalid script ID" });
      }

      const script = await storage.getScript(scriptId);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }

      // Get scenes for the script to provide scene-level character mapping
      const existingScenes = await storage.getScenesByScriptId(scriptId);
      const sceneBreakdown = existingScenes.map(scene => ({
        sceneNumber: scene.sceneNumber,
        content: scene.scriptExcerpt
      }));

      // Get project model settings if available
      let projectModelSettings = null;
      if (script.modelSettings) {
        projectModelSettings = script.modelSettings;
      }

      // Determine if we have a reference image to analyze with vision
      // For music video projects, use the musician reference image for vision-based character analysis
      const isMusicVideo = script.projectType === 'music_video' || script.projectType === 'music-video';
      const referenceImageForVision = isMusicVideo && script.referenceImageUrl ? script.referenceImageUrl : undefined;
      
      // Extract characters using GPT-5.1 (script analysis) + GPT-4o vision (reference image analysis)
      console.log(`Extracting characters from script ${scriptId}...`);
      if (referenceImageForVision) {
        console.log(`[CHARACTER EXTRACTION] Will analyze reference image with GPT-4o vision: ${referenceImageForVision.substring(0, 50)}...`);
      }
      
      const result = await extractCharactersFromScript(
        script.content,
        sceneBreakdown.length > 0 ? sceneBreakdown : undefined,
        projectModelSettings,
        referenceImageForVision // NEW: Pass reference image for vision analysis
      );

      // For music video projects, ensure the main character has the reference image URL set
      // (may already be set by vision analysis, but this ensures it's always present)
      if (isMusicVideo && script.referenceImageUrl) {
        console.log(`Ensuring musician reference image is assigned to main character for music video project ${scriptId}`);
        
        // Find the main character (Artist, Narrator, Singer, or first character)
        const mainCharacter = result.characters.find((c: any) => 
          c.name.toLowerCase().includes('artist') || 
          c.name.toLowerCase().includes('narrator') ||
          c.name.toLowerCase().includes('singer') ||
          c.name.toLowerCase().includes('performer') ||
          c.role === 'protagonist'
        ) || result.characters[0];
        
        if (mainCharacter && !mainCharacter.referenceImageUrl) {
          mainCharacter.referenceImageUrl = script.referenceImageUrl;
          console.log(`Assigned reference image to character: ${mainCharacter.name}`);
        }
      }

      // Save characters to the script
      await db
        .update(scripts)
        .set({ characters: result.characters })
        .where(eq(scripts.id, scriptId));

      // Update scenes with their character mappings
      if (result.sceneCharacterMap) {
        for (const [sceneNumStr, characterIds] of Object.entries(result.sceneCharacterMap)) {
          const sceneNum = parseInt(sceneNumStr);
          const scene = existingScenes.find(s => s.sceneNumber === sceneNum);
          if (scene) {
            await storage.updateScene(scene.id, {
              charactersInScene: characterIds
            });
          }
        }
      }

      console.log(`Extracted ${result.characters.length} characters from script ${scriptId}`);
      return res.status(200).json({
        characters: result.characters,
        sceneCharacterMap: result.sceneCharacterMap
      });
    } catch (err) {
      console.error("Error extracting characters:", err);
      errorHandler(err as Error, res);
    }
  });

  // Get characters for a script
  app.get("/api/characters/:scriptId", async (req: Request, res: Response) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      if (isNaN(scriptId)) {
        return res.status(400).json({ message: "Invalid script ID" });
      }

      const script = await storage.getScript(scriptId);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }

      // Get scenes to build character-to-scene mapping
      const existingScenes = await storage.getScenesByScriptId(scriptId);
      const sceneCharacterMap: { [sceneNumber: number]: string[] } = {};
      
      for (const scene of existingScenes) {
        if (scene.charactersInScene) {
          sceneCharacterMap[scene.sceneNumber] = scene.charactersInScene;
        }
      }

      return res.status(200).json({
        characters: script.characters || [],
        sceneCharacterMap
      });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Update characters for a script
  app.put("/api/characters/:scriptId", async (req: Request, res: Response) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      if (isNaN(scriptId)) {
        return res.status(400).json({ message: "Invalid script ID" });
      }

      const { characters } = req.body;
      if (!characters || !Array.isArray(characters)) {
        return res.status(400).json({ message: "Characters array is required" });
      }

      // Validate character DNA structure
      const validationErrors: string[] = [];
      const validCharacterIds = new Set<string>();
      
      for (let i = 0; i < characters.length; i++) {
        const char = characters[i];
        
        // Validate required fields
        if (!char.id || typeof char.id !== 'string') {
          validationErrors.push(`Character at index ${i}: missing or invalid 'id' field`);
        } else {
          validCharacterIds.add(char.id);
        }
        
        if (!char.name || typeof char.name !== 'string') {
          validationErrors.push(`Character at index ${i}: missing or invalid 'name' field`);
        }
        
        if (!char.visualDNA || typeof char.visualDNA !== 'object') {
          validationErrors.push(`Character at index ${i}: missing or invalid 'visualDNA' object`);
        }
      }
      
      if (validationErrors.length > 0) {
        return res.status(400).json({ 
          message: "Invalid character data",
          errors: validationErrors 
        });
      }

      const script = await storage.getScript(scriptId);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }

      // Update characters on the script
      await db
        .update(scripts)
        .set({ characters })
        .where(eq(scripts.id, scriptId));

      // Reconcile scenes.charactersInScene to remove stale character IDs
      const existingScenes = await storage.getScenesByScriptId(scriptId);
      const updatedScenes: { id: number; originalIds: string[]; newIds: string[] }[] = [];
      
      for (const scene of existingScenes) {
        if (scene.charactersInScene && scene.charactersInScene.length > 0) {
          const originalIds = scene.charactersInScene;
          const validIds = originalIds.filter(id => validCharacterIds.has(id));
          
          // Only update if some IDs were removed
          if (validIds.length !== originalIds.length) {
            await db
              .update(scenes)
              .set({ charactersInScene: validIds })
              .where(eq(scenes.id, scene.id));
            
            updatedScenes.push({
              id: scene.id,
              originalIds,
              newIds: validIds
            });
          }
        }
      }

      return res.status(200).json({ 
        success: true, 
        characters,
        reconciledScenes: updatedScenes.length,
        details: updatedScenes.length > 0 ? {
          message: `Removed stale character references from ${updatedScenes.length} scene(s)`,
          scenes: updatedScenes
        } : undefined
      });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Upload character reference image
  app.post("/api/characters/:scriptId/:characterId/upload-image", imageUpload.single("characterImage"), async (req: Request, res: Response) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      const characterId = req.params.characterId;
      
      if (isNaN(scriptId)) {
        return res.status(400).json({ message: "Invalid script ID" });
      }

      if (!characterId) {
        return res.status(400).json({ message: "Character ID is required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const script = await storage.getScript(scriptId);
      if (!script) {
        // Clean up uploaded file if script not found
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ message: "Script not found" });
      }

      const characters = (script.characters as any[]) || [];
      const characterIndex = characters.findIndex(c => c.id === characterId);
      
      if (characterIndex === -1) {
        // Clean up uploaded file if character not found
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ message: "Character not found" });
      }

      // Construct the URL for the uploaded image
      const imageUrl = `/uploads/${req.file.filename}`;

      // Delete old reference image if it exists
      const oldImageUrl = characters[characterIndex].referenceImageUrl;
      if (oldImageUrl && oldImageUrl.startsWith('/uploads/')) {
        const oldFilePath = path.join(uploadDirs.images, path.basename(oldImageUrl));
        if (fs.existsSync(oldFilePath)) {
          try {
            fs.unlinkSync(oldFilePath);
            console.log(`Deleted old character reference image: ${oldFilePath}`);
          } catch (err) {
            console.warn(`Failed to delete old character image: ${err}`);
          }
        }
      }

      // Update character with new reference image URL
      characters[characterIndex].referenceImageUrl = imageUrl;

      // Save updated characters to database
      await db
        .update(scripts)
        .set({ characters })
        .where(eq(scripts.id, scriptId));

      // Invalidate projects cache so UI gets updated character data
      projectsCacheTime = 0;
      projectsCache = [];

      console.log(`Uploaded reference image for character ${characterId} in script ${scriptId}: ${imageUrl}`);

      return res.status(200).json({ 
        success: true,
        imageUrl,
        character: characters[characterIndex]
      });
    } catch (err) {
      // Clean up uploaded file on error
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupErr) {
          console.warn("Failed to clean up uploaded file:", cleanupErr);
        }
      }
      errorHandler(err as Error, res);
    }
  });

  // Delete character reference image
  app.delete("/api/characters/:scriptId/:characterId/image", async (req: Request, res: Response) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      const characterId = req.params.characterId;
      
      if (isNaN(scriptId)) {
        return res.status(400).json({ message: "Invalid script ID" });
      }

      if (!characterId) {
        return res.status(400).json({ message: "Character ID is required" });
      }

      const script = await storage.getScript(scriptId);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }

      const characters = (script.characters as any[]) || [];
      const characterIndex = characters.findIndex(c => c.id === characterId);
      
      if (characterIndex === -1) {
        return res.status(404).json({ message: "Character not found" });
      }

      // Delete the image file if it exists
      const imageUrl = characters[characterIndex].referenceImageUrl;
      if (imageUrl && imageUrl.startsWith('/uploads/')) {
        const filePath = path.join(uploadDirs.images, path.basename(imageUrl));
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log(`Deleted character reference image: ${filePath}`);
          } catch (err) {
            console.warn(`Failed to delete character image: ${err}`);
          }
        }
      }

      // Remove the reference image URL from the character
      characters[characterIndex].referenceImageUrl = undefined;

      // Save updated characters to database
      await db
        .update(scripts)
        .set({ characters })
        .where(eq(scripts.id, scriptId));

      // Invalidate projects cache so UI gets updated character data
      projectsCacheTime = 0;
      projectsCache = [];

      return res.status(200).json({ 
        success: true,
        message: "Character reference image deleted"
      });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Generate images with character consistency (using job queue for background processing)
  app.post("/api/generate-images-with-characters", async (req: Request, res: Response) => {
    try {
      const { scriptId, style, customStylePrompt } = req.body;
      
      if (!scriptId) {
        return res.status(400).json({ message: "Script ID is required" });
      }

      const script = await storage.getScript(scriptId);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }

      // Get characters from the script
      const characters = (script.characters as any[]) || [];
      if (characters.length === 0) {
        return res.status(400).json({ 
          message: "No characters found. Please extract characters first using /api/extract-characters/:scriptId" 
        });
      }

      // Get scenes with their prompts
      const existingScenes = await storage.getScenesByScriptId(scriptId);
      if (existingScenes.length === 0) {
        return res.status(400).json({ message: "No scenes found for this script" });
      }

      // Build scene character map
      const sceneCharacterMap: { [sceneNumber: number]: string[] } = {};
      for (const scene of existingScenes) {
        if (scene.charactersInScene) {
          sceneCharacterMap[scene.sceneNumber] = scene.charactersInScene;
        }
      }

      console.log(`Creating character-aware image generation job for script ${scriptId}...`);
      console.log(`Characters: ${characters.length}, Scenes: ${existingScenes.length}`);

      // Prepare scenes for job queue
      const scenesWithPrompts = existingScenes.map(scene => ({
        content: scene.scriptExcerpt,
        title: scene.title || undefined,
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
      }));

      // Add job to the queue for background processing
      // Pass reference image URL for musician/artist consistency in music videos
      const jobId = await jobQueue.addCharacterImageGenerationJob(
        scriptId,
        scenesWithPrompts,
        characters,
        sceneCharacterMap,
        style || script.style || 'cinematic',
        customStylePrompt || script.customStylePrompt,
        script.referenceImageUrl || undefined
      );

      console.log(`Created character image generation job ${jobId} for script ${scriptId}`);
      
      // Return immediately with job info
      return res.status(202).json({ 
        message: "Character-aware image generation started",
        jobId,
        totalScenes: existingScenes.length,
        charactersUsed: characters.length
      });
    } catch (err) {
      console.error("Error creating character image generation job:", err);
      errorHandler(err as Error, res);
    }
  });

  // Enhance script using AI
  app.post("/api/enhance-script", async (req: Request, res: Response) => {
    try {
      const { title, content } = req.body;
      
      if (!title || !content) {
        return res.status(400).json({ message: "Title and content are required" });
      }
      
      // Use GPT-4o-mini to enhance the script
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const enhancementPrompt = `You are an expert YouTube explainer video script writer. Your task is to enhance the following script to be optimized for YouTube explainer videos.

Title: "${title}"

Current Script:
${content}

Please enhance this script with the following requirements:
1. STRICT CHARACTER LIMIT: Must be under 3000 characters total - this is mandatory
2. Target length: 2500-2900 characters (never exceed 2900)
3. Make it factual and informative for YouTube explainer content
4. Optimize for text-to-speech (TTS) - avoid complex formatting, symbols, or hard-to-pronounce elements
5. Write in a conversational, engaging tone suitable for YouTube
6. Structure with clear flow and natural speech patterns
7. Include smooth transitions between topics
8. Ensure the content matches the title and is educational
9. Return ONLY the enhanced script text as a clean block - no formatting, no markdown, no additional text
10. IMPORTANT: Count characters as you write and stop before reaching 2900 characters

Enhanced Script:`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "user",
            content: enhancementPrompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.7,
      });

      let enhancedScript = response.choices[0].message.content?.trim() || content;
      
      // Ensure the script is under 3000 characters
      if (enhancedScript.length > 3000) {
        // Truncate at the last complete sentence before 3000 characters
        const truncated = enhancedScript.substring(0, 2950);
        const lastSentenceEnd = Math.max(
          truncated.lastIndexOf('.'),
          truncated.lastIndexOf('!'),
          truncated.lastIndexOf('?')
        );
        
        if (lastSentenceEnd > 2000) {
          enhancedScript = truncated.substring(0, lastSentenceEnd + 1);
        } else {
          enhancedScript = truncated + '...';
        }
      }
      
      return res.status(200).json({ 
        enhancedScript: enhancedScript
      });
    } catch (err) {
      console.error("Error enhancing script:", err);
      errorHandler(err as Error, res);
    }
  });

  // Generate thumbnail for a project
  app.post("/api/generate-thumbnail", async (req: Request, res: Response) => {
    try {
      const { scriptId, script, style, customStylePrompt, title, thumbnailConfig } = req.body;
      
      if (!scriptId || !script) {
        return res.status(400).json({ message: "Script ID and script content are required" });
      }
      
      // Get the project to update it with the thumbnail
      const project = await storage.getScript(scriptId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Get project-specific model settings if they exist
      let projectModelSettings = null;
      try {
        const modelSettingsResult = await db
          .select({ modelSettings: scripts.modelSettings })
          .from(scripts)
          .where(eq(scripts.id, scriptId));
        
        if (modelSettingsResult.length > 0 && modelSettingsResult[0].modelSettings) {
          projectModelSettings = modelSettingsResult[0].modelSettings;
          console.log("Using project-specific model settings for thumbnail generation");
        }
      } catch (error) {
        console.error("Error retrieving project model settings:", error);
      }
      
      // Generate the thumbnail with enhanced configuration
      const thumbnailUrl = await generateThumbnail(
        script,
        style,
        customStylePrompt,
        title,
        projectModelSettings,
        thumbnailConfig
      );
      
      // Update the project with the thumbnail URL
      await storage.updateScript(scriptId, {
        thumbnailUrl: thumbnailUrl
      });
      
      return res.status(200).json({ 
        message: "Thumbnail generated successfully",
        thumbnailUrl: thumbnailUrl
      });
    } catch (err) {
      console.error("Error generating thumbnail:", err);
      errorHandler(err as Error, res);
    }
  });

  // Add scene to a script (manual mode)
  app.post("/api/scenes/:scriptId", async (req: Request, res: Response) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      if (isNaN(scriptId)) {
        return res.status(400).json({ message: "Invalid script ID" });
      }
      
      // Get the script
      const script = await storage.getScript(scriptId);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }
      
      // Get current scenes to determine the next scene number
      const currentScenes = await storage.getScenesByScriptId(scriptId);
      const nextSceneNumber = currentScenes.length + 1;
      
      console.log("Creating manual scene with body:", req.body);
      
      // Create a new scene with minimal required fields
      // Make sure dallePrompt has some value, as it's set to notNull in the schema
      const newScene = await storage.createScene({
        scriptId,
        sceneNumber: nextSceneNumber,
        title: req.body.title || `Scene ${nextSceneNumber}`,
        scriptExcerpt: req.body.scriptExcerpt || "",
        dallePrompt: req.body.dallePrompt || "Temporary prompt", // Will be filled later by generate-prompts
        estimatedDuration: req.body.estimatedDuration || 10,
        metadata: req.body.metadata || {},
      });
      
      return res.status(200).json({ scene: newScene });
    } catch (err) {
      console.error("Error creating scene:", err);
      errorHandler(err as Error, res);
    }
  });

  app.get("/api/scenes/:scriptId", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      const scriptId = parseInt(req.params.scriptId);
      if (isNaN(scriptId)) {
        console.log(`Invalid scriptId parameter: ${req.params.scriptId}`);
        return res.status(200).json({ scenes: [] });
      }
      
      console.log(`Fetching scenes for script ${scriptId}...`);
      const scenes = await storage.getScenesByScriptId(scriptId);
      const duration = Date.now() - startTime;
      
      console.log(`Retrieved ${scenes.length} scenes for script ${scriptId} in ${duration}ms`);
      
      // Critical production fix: Always optimize for large responses
      let optimizedScenes = scenes;
      
      if (scenes.length > 0) {
        // Calculate response size
        const estimatedSize = JSON.stringify(scenes).length;
        const sizeMB = Math.round(estimatedSize / 1024 / 1024);
        
        console.log(`Response size: ${sizeMB}MB for ${scenes.length} scenes`);
        
        // If response is larger than 5MB, create compressed thumbnails
        if (estimatedSize > 5 * 1024 * 1024) {
          console.log('Large response detected: Creating compressed thumbnails...');
          
          optimizedScenes = scenes.map(scene => {
            // For scenes with large base64 images, replace with endpoint URLs
            if (scene.imageUrl && scene.imageUrl.startsWith('data:image/') && scene.imageUrl.length > 50000) {
              return {
                ...scene,
                imageUrl: `/api/scene-image/${scene.id}`,
                isCompressed: true,
                hasLargeImage: true,
                fullImageEndpoint: `/api/scene-image/${scene.id}`,
                originalSize: Math.round(scene.imageUrl.length / 1024) + 'KB'
              };
            }
            
            // Return scenes with small or no images unchanged
            return {
              ...scene,
              isCompressed: false,
              hasLargeImage: false,
              fullImageEndpoint: scene.imageUrl && scene.imageUrl.startsWith('data:image/') ? `/api/scene-image/${scene.id}` : null,
              originalSize: scene.imageUrl ? Math.round(scene.imageUrl.length / 1024) + 'KB' : '0KB'
            };
          });
          
          const optimizedSize = Math.round(JSON.stringify(optimizedScenes).length / 1024);
          console.log(`Response optimized: ${sizeMB}MB → ${optimizedSize}KB (with thumbnails)`);
        }
      }
      
      // Set appropriate headers for production
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'max-age=300'); // 5 minutes cache
      
      return res.status(200).json({ 
        scenes: optimizedScenes,
        meta: {
          count: scenes.length,
          scriptId,
          fetchTime: duration,
          optimized: optimizedScenes !== scenes
        }
      });
    } catch (err) {
      const duration = Date.now() - startTime;
      console.error(`Critical error in /api/scenes/${req.params.scriptId} after ${duration}ms:`, err);
      
      // Always return 200 with empty scenes for production stability
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({ 
        scenes: [],
        error: 'Database temporarily unavailable',
        meta: {
          count: 0,
          scriptId: parseInt(req.params.scriptId) || 0,
          fetchTime: duration
        }
      });
    }
  });

  // Serve individual scene images efficiently
  app.get("/api/scene-image/:id", async (req: Request, res: Response) => {
    try {
      const sceneId = parseInt(req.params.id);
      if (isNaN(sceneId)) {
        return res.status(404).json({ error: "Invalid scene ID" });
      }

      const scene = await storage.getScene(sceneId);
      if (!scene || !scene.imageUrl) {
        return res.status(404).json({ error: "Scene image not found" });
      }

      // Set appropriate headers for image response
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'max-age=3600'); // 1 hour cache for images
      
      return res.status(200).json({ 
        imageUrl: scene.imageUrl,
        sceneId: scene.id,
        title: scene.title
      });
    } catch (err) {
      console.error(`Error serving scene image ${req.params.id}:`, err);
      return res.status(500).json({ error: "Failed to load image" });
    }
  });

  app.patch("/api/scenes/:id", async (req: Request, res: Response) => {
    try {
      const sceneId = parseInt(req.params.id);
      if (isNaN(sceneId)) {
        return res.status(400).json({ message: "Invalid scene ID" });
      }
      
      const scene = await storage.getScene(sceneId);
      if (!scene) {
        return res.status(404).json({ message: "Scene not found" });
      }
      
      const updatedScene = await storage.updateScene(sceneId, req.body);
      return res.status(200).json({ scene: updatedScene });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  app.post("/api/regenerate-scene/:id", async (req: Request, res: Response) => {
    try {
      const sceneId = parseInt(req.params.id);
      if (isNaN(sceneId)) {
        return res.status(400).json({ message: "Invalid scene ID" });
      }
      
      const scene = await storage.getScene(sceneId);
      if (!scene) {
        return res.status(404).json({ message: "Scene not found" });
      }
      
      // If the scene prompt is pinned (edited by user), don't regenerate it
      if (scene.isPinned) {
        console.log(`Scene ${sceneId} is pinned, keeping original prompt: ${scene.dallePrompt}`);
        return res.status(200).json({ 
          scene,
          message: "Scene prompt is locked and was not regenerated"
        });
      }
      
      // Generate new DALL-E prompt
      const { style, maintainContinuity, referenceImageUrl, customStylePrompt } = req.body;
      
      // Get project-specific model settings if they exist
      let projectModelSettings = null;
      if (scene.scriptId) {
        try {
          const modelSettingsResult = await db
            .select({ modelSettings: scripts.modelSettings })
            .from(scripts)
            .where(eq(scripts.id, scene.scriptId));
          
          if (modelSettingsResult.length > 0 && modelSettingsResult[0].modelSettings) {
            projectModelSettings = modelSettingsResult[0].modelSettings;
            console.log("Using project-specific model settings for scene prompt regeneration");
          }
        } catch (error) {
          console.error("Error retrieving project model settings:", error);
        }
      }
      
      const updatedPrompt = await generateDallePrompts(
        [{ content: scene.scriptExcerpt, title: scene.title || undefined }],
        style,
        maintainContinuity,
        referenceImageUrl,
        customStylePrompt,
        projectModelSettings
      );
      
      // Update the scene with the new prompt
      const updatedScene = await storage.updateScene(sceneId, {
        dallePrompt: updatedPrompt[0].dallePrompt,
      });
      
      return res.status(200).json({ scene: updatedScene });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });
  
  app.post("/api/generate-image/:id", async (req: Request, res: Response) => {
    try {
      const sceneId = parseInt(req.params.id);
      if (isNaN(sceneId)) {
        return res.status(400).json({ message: "Invalid scene ID" });
      }
      
      const scene = await storage.getScene(sceneId);
      if (!scene) {
        return res.status(404).json({ message: "Scene not found" });
      }
      
      if (!scene.dallePrompt) {
        return res.status(400).json({ message: "Scene has no image prompt" });
      }
      
      console.log(`Generating image for scene ${sceneId} with prompt: ${scene.dallePrompt}`);
      
      // Get project info including reference image
      let projectModelSettings = null;
      let referenceImageUrl: string | undefined = req.body.referenceImageUrl;
      let providerConfig: any = {
        image: "openai",
        tts: "openai",
        imageToVideo: "sora-2",
        enableFallbacks: true,
      };
      
      if (scene.scriptId !== null) {
        try {
          const script = await storage.getScript(scene.scriptId);
          if (script) {
            if (script.modelSettings) {
              projectModelSettings = script.modelSettings;
              const modelSettings = script.modelSettings as any;
              if (modelSettings?.providerConfig) {
                providerConfig = {
                  ...providerConfig,
                  ...modelSettings.providerConfig,
                };
              }
            }
            // Use project's reference image if not provided in request
            if (!referenceImageUrl && script.referenceImageUrl) {
              referenceImageUrl = script.referenceImageUrl;
              console.log(`[SINGLE SCENE] Using project reference image: ${referenceImageUrl.substring(0, 50)}...`);
            }
          }
        } catch (error) {
          console.log("No project-specific model settings found, using global settings");
        }
      }
      
      // Use global config if no project settings
      if (!projectModelSettings) {
        projectModelSettings = getModelConfig();
      }
      
      let imageUrl: string | undefined;
      
      // If we have a reference image, use images.edit for character consistency
      if (referenceImageUrl && providerConfig.image === "openai") {
        console.log(`[SINGLE SCENE] Using images.edit with reference image for character consistency`);
        
        try {
          const fs = await import('fs');
          const path = await import('path');
          
          // Load the reference image
          let referenceImageBuffer: Buffer;
          
          if (referenceImageUrl.startsWith('/uploads/')) {
            const refPath = path.join(process.cwd(), referenceImageUrl);
            if (fs.existsSync(refPath)) {
              referenceImageBuffer = fs.readFileSync(refPath);
              console.log(`[SINGLE SCENE] Loaded reference image from disk: ${refPath}`);
            } else {
              throw new Error(`Reference image file not found: ${refPath}`);
            }
          } else if (referenceImageUrl.startsWith('data:')) {
            const base64Data = referenceImageUrl.split(',')[1];
            referenceImageBuffer = Buffer.from(base64Data, 'base64');
            console.log(`[SINGLE SCENE] Loaded reference image from data URL`);
          } else {
            throw new Error(`Unsupported reference image format: ${referenceImageUrl.substring(0, 30)}`);
          }
          
          // Create edit prompt that describes the scene while maintaining the person's likeness
          const editPrompt = `Transform this image into a new scene while keeping the EXACT same person with their IDENTICAL physical features (face, hair color, body type, distinctive features like tattoos and freckles). 

NEW SCENE: ${scene.dallePrompt}

CRITICAL: The person in the output MUST look like the SAME PERSON from the input image. Maintain exact:
- Face structure and features
- Hair color and style  
- Skin tone and freckles
- Any visible tattoos or markings
- Body proportions

Only change: pose, clothing (if specified), background, lighting, and camera angle to match the new scene description.`;

          // Convert buffer to File object for the SDK
          const imageFile = new File([referenceImageBuffer], 'reference.png', { type: 'image/png' });
          
          // Use landscape size for videos (1536x1024)
          const editSize = "1536x1024";
          console.log(`[SINGLE SCENE] Calling images.edit with reference image, size: ${editSize}...`);
          
          const editResult = await openai.images.edit({
            model: "gpt-image-1",
            image: imageFile,
            prompt: sanitizePrompt(editPrompt),
            n: 1,
            size: editSize as "1024x1024" | "1536x1024" | "1024x1536"
          });
          
          // Get the result and save to persistent storage with robust storage service
          if (editResult.data?.[0]?.b64_json) {
            const imageBuffer = Buffer.from(editResult.data[0].b64_json, 'base64');
            const storageResult = await uploadSceneImage({
              sceneId: scene.id,
              projectId: scene.scriptId,
              sceneNumber: scene.sceneNumber,
              imageBuffer,
              forceRegenerate: true
            });
            imageUrl = storageResult.url;
            console.log(`[SINGLE SCENE] Generated with reference image: ${imageUrl} (verified: ${storageResult.verified})`);
          } else if (editResult.data?.[0]?.url) {
            imageUrl = editResult.data[0].url;
          } else {
            throw new Error("No image data returned from edit endpoint");
          }
          
        } catch (editError: any) {
          console.error(`[SINGLE SCENE] Edit with reference failed:`, editError?.message || editError);
          console.log(`[SINGLE SCENE] Falling back to standard generation...`);
          // Fall through to standard generation
        }
      }
      
      // Standard generation (no reference image or edit failed)
      if (!imageUrl) {
        const { generateImagesWithProvider } = await import("./providers/engine");
        const sceneWithImage = await generateImagesWithProvider(providerConfig, {
          scriptId: scene.scriptId || 0,
          style: req.body.style || "cinematic",
          customStylePrompt: req.body.customStylePrompt,
          maintainContinuity: false,
          referenceImageUrl,
          modelSettings: projectModelSettings,
          scenes: [
            {
              id: scene.id,
              sceneNumber: scene.sceneNumber,
              scriptId: scene.scriptId || undefined,
              title: scene.title || "",
              content: scene.scriptExcerpt || "",
              dallePrompt: scene.dallePrompt,
            },
          ],
        });
        imageUrl = sceneWithImage[0]?.imageUrl;
      }
      
      console.log(`Generated image URL: ${imageUrl}`);
      
      // Check if image generation actually succeeded
      if (!imageUrl) {
        return res.status(400).json({ 
          message: "Image generation failed. The content may have been blocked by OpenAI's safety system. Try modifying the scene content or image prompt to be more general.",
          error: "image_generation_failed"
        });
      }
      
      // Update the scene with the image URL
      const updatedScene = await storage.updateScene(sceneId, {
        imageUrl: imageUrl,
      });
      
      return res.status(200).json({ scene: updatedScene });
    } catch (err) {
      console.error("Error generating image:", err);
      errorHandler(err as Error, res);
    }
  });
  
  // New endpoint to edit an existing image using OpenAI's image edit API
  app.post("/api/edit-image/:id", async (req: Request, res: Response) => {
    try {
      console.log("Received image edit request:", req.params.id, req.body);
      
      const sceneId = parseInt(req.params.id);
      if (isNaN(sceneId)) {
        return res.status(400).json({ message: "Invalid scene ID" });
      }
      
      // Get the scene
      const scene = await storage.getScene(sceneId);
      if (!scene) {
        return res.status(404).json({ message: "Scene not found" });
      }
      
      // Enhanced request body validation
      if (!req.body) {
        return res.status(400).json({ message: "Request body is missing" });
      }
      
      const { editPrompt } = req.body;
      
      // More robust validation for editPrompt
      if (!editPrompt || typeof editPrompt !== 'string' || editPrompt.trim().length === 0) {
        return res.status(400).json({ message: "Edit prompt is required" });
      }
      
      if (editPrompt.trim().length < 5) {
        return res.status(400).json({ message: "Edit prompt must be at least 5 characters" });
      }
      
      // Ensure the scene has an image to edit
      if (!scene.imageUrl) {
        return res.status(400).json({ message: "Scene has no image to edit" });
      }
      
      console.log(`Editing image for scene ${sceneId} with prompt: ${editPrompt.substring(0, 100)}...`);
      
      // Edit the image using OpenAI's image edit API
      const editedImageUrl = await editImage(scene.imageUrl, editPrompt.trim());
      
      // Update the scene with the edited image URL
      const updatedScene = await storage.updateScene(sceneId, {
        imageUrl: editedImageUrl,
      });
      
      return res.status(200).json({ scene: updatedScene });
    } catch (err) {
      console.error("Error handling edit image request:", err);
      errorHandler(err as Error, res);
    }
  });

  // New endpoint to regenerate a single scene's Sora prompt
  app.post("/api/regenerate-sora-prompt/:id", async (req: Request, res: Response) => {
    try {
      const sceneId = parseInt(req.params.id);
      if (isNaN(sceneId)) {
        return res.status(400).json({ message: "Invalid scene ID" });
      }
      
      // Get the scene data
      const scene = await storage.getScene(sceneId);
      if (!scene) {
        return res.status(404).json({ message: "Scene not found" });
      }
      
      // Check if the scene has an image (required for Sora prompts)
      if (!scene.imageUrl) {
        return res.status(400).json({ 
          message: "Scene must have an image before generating a Sora prompt" 
        });
      }
      
      console.log(`Regenerating Sora prompt for scene ${sceneId}`);
      
      // Generate the Sora prompt for this single scene
      const sceneForSora = {
        id: scene.id,
        sceneNumber: scene.sceneNumber,
        scriptExcerpt: scene.scriptExcerpt,
        dallePrompt: scene.dallePrompt,
        title: scene.title || undefined,
        soraPrompt: scene.soraPrompt || undefined,
        imageUrl: scene.imageUrl || undefined,
        estimatedDuration: scene.estimatedDuration || undefined
      } as any;
      const scenesWithSoraPrompts = await generateSoraPrompts(
        [sceneForSora],
        req.body.style || "",
        req.body.customStylePrompt
      );
      
      if (scenesWithSoraPrompts.length === 0) {
        return res.status(500).json({ message: "Failed to generate Sora prompt" });
      }
      
      // Update the scene with the new Sora prompt
      const updatedScene = await storage.updateScene(sceneId, {
        soraPrompt: scenesWithSoraPrompts[0].soraPrompt,
      });
      
      return res.status(200).json({ scene: updatedScene });
    } catch (err) {
      console.error("Error generating Sora prompt:", err);
      errorHandler(err as Error, res);
    }
  });

  // Get AI-generated prompt variations for a scene
  app.get("/api/scenes/:id/suggestions", async (req: Request, res: Response) => {
    try {
      const sceneId = parseInt(req.params.id);
      if (isNaN(sceneId)) {
        return res.status(400).json({ message: "Invalid scene ID" });
      }
      
      const scene = await storage.getScene(sceneId);
      if (!scene) {
        return res.status(404).json({ message: "Scene not found" });
      }
      
      // Determine which prompt to use (prioritize soraPrompt if it exists)
      const promptToImprove = scene.soraPrompt || scene.dallePrompt;
      const promptType = scene.soraPrompt ? "sora" : "dalle";
      
      if (!promptToImprove) {
        return res.status(400).json({ message: "Scene has no prompt to improve" });
      }
      
      console.log(`Generating prompt variations for scene ${sceneId} (${promptType} prompt)`);
      
      // Import the prompt variations service
      const { generatePromptVariations } = await import("./services/promptVariations");
      const variations = await generatePromptVariations(promptToImprove, promptType);
      
      return res.status(200).json(variations);
    } catch (err) {
      console.error("Error generating prompt variations:", err);
      errorHandler(err as Error, res);
    }
  });

  // Update a scene's prompt (dalle or sora)
  app.patch("/api/scenes/:id/update-prompt", async (req: Request, res: Response) => {
    try {
      const sceneId = parseInt(req.params.id);
      if (isNaN(sceneId)) {
        return res.status(400).json({ message: "Invalid scene ID" });
      }
      
      const { promptType, prompt } = req.body;
      
      if (!promptType || !prompt) {
        return res.status(400).json({ message: "Missing promptType or prompt in request body" });
      }
      
      if (promptType !== "dalle" && promptType !== "sora") {
        return res.status(400).json({ message: "Invalid promptType. Must be 'dalle' or 'sora'" });
      }
      
      const scene = await storage.getScene(sceneId);
      if (!scene) {
        return res.status(404).json({ message: "Scene not found" });
      }
      
      console.log(`Updating ${promptType} prompt for scene ${sceneId}`);
      
      // Update the appropriate prompt field
      const updateData = promptType === "dalle" 
        ? { dallePrompt: prompt }
        : { soraPrompt: prompt };
      
      const updatedScene = await storage.updateScene(sceneId, updateData);
      
      return res.status(200).json({ scene: updatedScene });
    } catch (err) {
      console.error("Error updating prompt:", err);
      errorHandler(err as Error, res);
    }
  });

  app.post("/api/upload-audio/:scriptId", audioUpload.single("audioFile"), async (req: Request, res: Response) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      if (isNaN(scriptId)) {
        return res.status(400).json({ message: "Invalid script ID" });
      }
      
      // Handle both file uploads and preloaded audio references
      const isPreloadedAudio = req.body.audioUrl && !req.file;
      
      if (!req.file && !isPreloadedAudio) {
        return res.status(400).json({ message: "No audio file uploaded" });
      }
      
      const script = await storage.getScript(scriptId);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }
      
      let scenes = await storage.getScenesByScriptId(scriptId);
      
      // If no scenes exist, this is an early audio upload (before scene generation)
      // Just store the audio info and return basic information
      if (!scenes.length) {
        let totalAudioDuration: number;
        let audioUrl: string;
        let audioFilePath: string;
        
        if (isPreloadedAudio) {
          // For preloaded audio, the audioUrl is the actual file path like "/uploads/audio/filename.mp3"
          // We need to find the audio record that matches this file path
          const audioRecords = await storage.getAllAudioTTS();
          const audioRecord = audioRecords.find(record => record.audioUrl === req.body.audioUrl);
          
          if (!audioRecord) {
            return res.status(404).json({ message: `Audio record not found for URL: ${req.body.audioUrl}` });
          }
          
          totalAudioDuration = audioRecord.duration ?? 0;
          audioUrl = req.body.audioUrl;
          // Convert relative URL to absolute file path
          audioFilePath = path.join(process.cwd(), audioRecord.audioUrl?.replace(/^\//, '') ?? "");
          console.log(`Early preloaded audio - duration: ${totalAudioDuration.toFixed(3)} seconds`);
        } else {
          // Get audio duration for uploaded file
          const { getAudioDurationInSeconds } = await import('get-audio-duration');
          
          try {
            totalAudioDuration = await getAudioDurationInSeconds(req.file!.path);
            console.log(`Early audio upload - duration: ${totalAudioDuration.toFixed(3)} seconds`);
          } catch (err) {
            console.error("Error getting audio duration:", err);
            totalAudioDuration = 180; // Default to 3 minutes
          }
          
          audioUrl = `/uploads/audio/${req.file!.filename}`;
          audioFilePath = req.file!.path;
        }
        
        // Calculate recommended number of scenes based on audio duration
        const maxSecondsPerPanel = 15;
        const recommendedScenes = Math.ceil(totalAudioDuration / maxSecondsPerPanel);
        
        // Save audio duration and path to the script for future scene generation
        await storage.updateScript(scriptId, {
          audioDuration: Math.round(totalAudioDuration),
          audioFilePath: audioFilePath
        });
        
        console.log(`Saved audio duration (${totalAudioDuration}s) to script ${scriptId}`);
        
        return res.status(200).json({ 
          audioUrl,
          totalDuration: totalAudioDuration,
          recommendedScenes,
          message: `Audio processed successfully. Recommended ${recommendedScenes} scenes for optimal pacing.`,
          isEarlyUpload: true
        });
      }
      
      // Get audio duration to calculate minimum panels needed
      let totalAudioDuration: number;
      let processedAudioUrl: string;
      
      if (isPreloadedAudio) {
        // For preloaded audio, the audioUrl is the actual file path like "/uploads/audio/filename.mp3"
        // We need to find the audio record that matches this file path
        const audioRecords = await storage.getAllAudioTTS();
        const audioRecord = audioRecords.find(record => record.audioUrl === req.body.audioUrl);
        
        if (!audioRecord) {
          return res.status(404).json({ message: `Audio record not found for URL: ${req.body.audioUrl}` });
        }
        
        totalAudioDuration = audioRecord.duration ?? 0;
        processedAudioUrl = req.body.audioUrl;
        console.log(`Preloaded audio file total duration: ${totalAudioDuration.toFixed(3)} seconds`);
      } else {
        const { getAudioDurationInSeconds } = await import('get-audio-duration');
        
        try {
          totalAudioDuration = await getAudioDurationInSeconds(req.file!.path);
          console.log(`Audio file total duration: ${totalAudioDuration.toFixed(3)} seconds`);
        } catch (err) {
          console.error("Error getting audio duration:", err);
          totalAudioDuration = scenes.length * 15;
        }
        
        processedAudioUrl = `/uploads/audio/${req.file!.filename}`;
      }
      
      // Calculate minimum panels needed (15 seconds max per panel)
      const maxSecondsPerPanel = 15;
      const minimumPanelsNeeded = Math.ceil(totalAudioDuration / maxSecondsPerPanel);
      
      console.log(`Audio: ${totalAudioDuration}s, Current panels: ${scenes.length}, Minimum needed: ${minimumPanelsNeeded}`);
      
      // Save audio duration and path to the script for future scene generation
      let audioFilePathForStorage: string;
      
      if (isPreloadedAudio) {
        // For preloaded audio, convert relative URL to absolute file path
        audioFilePathForStorage = path.join(process.cwd(), req.body.audioUrl?.replace(/^\//, '') ?? "");
      } else {
        audioFilePathForStorage = req.file!.path;
      }
        
      await storage.updateScript(scriptId, {
        audioDuration: Math.round(totalAudioDuration),
        audioFilePath: audioFilePathForStorage
      });
      
      console.log(`Saved audio duration (${totalAudioDuration}s) to script ${scriptId}`);
      
      // If we need more panels, generate additional scenes
      if (scenes.length < minimumPanelsNeeded) {
        const additionalScenesNeeded = minimumPanelsNeeded - scenes.length;
        console.log(`Generating ${additionalScenesNeeded} additional scenes for optimal pacing`);
        
        // Generate additional scenes by splitting the script content
        const averageTimePerScene = totalAudioDuration / minimumPanelsNeeded;
        
        // Create additional scenes with placeholder content
        const newScenes = [];
        for (let i = 0; i < additionalScenesNeeded; i++) {
          const sceneNumber = scenes.length + i + 1;
          newScenes.push({
            scriptId: scriptId,
            sceneNumber: sceneNumber,
            title: `Scene ${sceneNumber}`,
            scriptExcerpt: `Additional scene content for optimal pacing (scene ${sceneNumber})`,
            dallePrompt: `A scene that develops the narrative, suitable for a ${averageTimePerScene.toFixed(1)}-second segment`,
            soraPrompt: null,
            imageUrl: null,
            estimatedDuration: Math.round(averageTimePerScene),
            metadata: {},
            isPinned: false,
            overlayText: null,
            exactStartTime: null,
            exactEndTime: null
          });
        }
        
        // Create the new scenes in storage
        const createdScenes = await storage.createScenes(newScenes);
        
        // Refresh the scenes list
        scenes = await storage.getScenesByScriptId(scriptId);
        
        console.log(`Created ${createdScenes.length} additional scenes. Total scenes now: ${scenes.length}`);
      }
      
      // Analyze audio and generate timestamps for all scenes
      const audioFileToAnalyze = isPreloadedAudio ? audioFilePathForStorage : req.file!.path;
      const timestamps = await analyzeAudioForScenes(audioFileToAnalyze, scenes);
      
      // Update scenes with timestamps
      await Promise.all(
        timestamps.map(async ({ sceneId, startTime, endTime }) => {
          await storage.updateScene(sceneId, {
            exactStartTime: startTime,
            exactEndTime: endTime,
          });
        })
      );
      
      return res.status(200).json({ 
        audioUrl: processedAudioUrl, 
        timestamps,
        totalDuration: totalAudioDuration,
        minimumPanelsNeeded,
        scenesCreated: Math.max(0, minimumPanelsNeeded - scenes.length),
        message: minimumPanelsNeeded > scenes.length ? 
          `Audio processed successfully. Created ${minimumPanelsNeeded - scenes.length} additional scenes for optimal pacing.` :
          "Audio processed successfully"
      });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });
  
  app.get("/api/export-assets/:scriptId", async (req: Request, res: Response) => {
    // Set extended timeout for export requests - must match exportService timeouts
    // Note: Cloudflare/proxy may have shorter timeouts (100-300s), but export is faster with STORE mode (no compression)
    if (process.env.NODE_ENV === 'production') {
      req.setTimeout(20 * 60 * 1000); // 20 minutes for production (matches exportService)
      res.setTimeout(20 * 60 * 1000);
    } else {
      req.setTimeout(10 * 60 * 1000); // 10 minutes for development
      res.setTimeout(10 * 60 * 1000);
    }

    try {
      const scriptId = parseInt(req.params.scriptId);
      console.log(`Export assets requested for script ID ${scriptId}`);
      
      if (isNaN(scriptId)) {
        console.error(`Invalid script ID: ${req.params.scriptId}`);
        return res.status(400).json({ message: "Invalid script ID" });
      }
      
      const script = await storage.getScript(scriptId);
      if (!script) {
        console.error(`Script with ID ${scriptId} not found`);
        return res.status(404).json({ message: "Script not found" });
      }
      
      console.log(`Found script: "${script.title}" (ID: ${script.id})`);
      const scenes = await storage.getScenesByScriptId(scriptId);
      console.log(`Found ${scenes.length} scenes for export`);
      
      // Log image URL formats to help diagnose issues
      const imageFormats = scenes
        .filter(scene => scene.imageUrl)
        .map(scene => {
          const url = scene.imageUrl as string;
          const type = url.startsWith('data:') 
            ? 'data-url' 
            : url.startsWith('http') 
              ? 'http-url' 
              : url.startsWith('/uploads/') 
                ? 'local-file' 
                : 'unknown';
                
          return { sceneId: scene.id, sceneNumber: scene.sceneNumber, type, preview: url ? url.substring(0, 30) + '...' : null };
        });
        
      console.log(`Image formats in scenes:`, JSON.stringify(imageFormats, null, 2));
      
      // Create export ZIP with enhanced error handling for production
      try {
        console.log(`Creating ZIP export for script ID ${scriptId}...`);
        console.log(`Environment: ${process.env.NODE_ENV || 'unknown'}`);
        console.log(`Available memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used`);
        
        const zipPath = await exportProjectAssets(script.id);
        console.log(`ZIP export created successfully at ${zipPath}`);
        
        // Create a sanitized filename from the project title or use script ID as fallback
        const sanitizedTitle = script.title ? script.title.replace(/[^a-z0-9]/gi, '-').toLowerCase() : `script-${scriptId}`;
        const downloadFilename = `scenestitch-${sanitizedTitle}.zip`;
        
        // Try a simpler approach with res.download
        return res.download(zipPath, downloadFilename, (err) => {
          if (err) {
            console.error(`Error sending ZIP file: ${err}`);
          } else {
            console.log(`Successfully sent ZIP file for script ID ${scriptId}`);
          }
          
          // Cleanup after sending (or attempting to send)
          try {
            fs.unlinkSync(zipPath);
            console.log(`Cleaned up temporary ZIP file: ${zipPath}`);
          } catch (unlinkErr) {
            console.error(`Error cleaning up temporary ZIP file: ${unlinkErr}`);
          }
        });
      } catch (zipError) {
        const error = zipError as Error;
        console.error(`Error creating ZIP export for script ID ${scriptId}:`, error);
        console.error(`Error stack:`, error.stack);
        console.error(`Memory usage after error:`, process.memoryUsage());
        return res.status(500).json({ 
          message: `Export failed: ${error.message || String(error)}`,
          error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    } catch (err) {
      console.error(`Unhandled error in export endpoint:`, err);
      errorHandler(err as Error, res);
    }
  });

  // Model Configuration API Routes
  
  // Get current model configuration
  app.get("/api/config/models", async (req: Request, res: Response) => {
    try {
      // Load latest configuration from database
      await loadModelConfigFromDB();
      const config = getModelConfig();
      return res.json(config);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Update model configuration
  app.post("/api/config/models", async (req: Request, res: Response) => {
    try {
      const newConfig = req.body;
      const updatedConfig = await updateModelConfig(newConfig);
      return res.json(updatedConfig);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Reset model configuration to defaults
  app.post("/api/config/models/reset", async (req: Request, res: Response) => {
    try {
      const config = await resetModelConfig();
      return res.json(config);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });
  
  // Get project-specific model settings
  app.get("/api/projects/:id/model-settings", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }
      
      const script = await storage.getScript(id);
      if (!script) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      // Return project model settings or system defaults if not set
      let modelSettings = script.modelSettings ? script.modelSettings : {};
      const systemDefaults = getModelConfig();
      
      // Merge with system defaults for any missing properties
      const mergedSettings = { ...systemDefaults, ...modelSettings };
      
      return res.json(mergedSettings);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });
  
  // Update project-specific model settings
  app.post("/api/projects/:id/model-settings", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }
      
      const script = await storage.getScript(id);
      if (!script) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      // Validate the incoming model settings
      const updateData = projectModelSettingsSchema.parse({
        scriptId: id,
        modelSettings: req.body
      });
      
      // Update the script with new model settings
      const updatedScript = await storage.updateScript(id, {
        modelSettings: updateData.modelSettings
      });
      
      if (!updatedScript) {
        return res.status(404).json({ error: "Failed to update project settings" });
      }
      
      return res.json(updateData.modelSettings);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Photo Library API Endpoints
  
  // Get project images with pagination (for the photo library feature)
  app.get("/api/library", async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 12;
      const offset = (page - 1) * limit;
      
      console.log(`API: Fetching library page ${page} with limit ${limit}`);
      
      try {
        // Get all projects first to know total count
        const allProjects = await storage.getAllScripts();
        console.log(`API: Found ${allProjects.length} total projects`);
        
        // Sort projects by creation date (newest first) and apply pagination
        const sortedProjects = allProjects
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
          .slice(offset, offset + limit);
        
        console.log(`API: Processing ${sortedProjects.length} projects for page ${page}`);
        
        const projectImagesArray = [];
        
        // Process only the projects for this page
        for (const project of sortedProjects) {
          try {
            console.log(`API: Processing project ${project.id} (${project.title || 'Untitled'})`);
            const scenes = await storage.getScenesByScriptId(project.id);
            
            if (!scenes || !Array.isArray(scenes)) {
              console.log(`API: Error getting scenes for project ${project.id}, skipping`);
              continue;
            }
            
            const scenesWithImages = scenes.filter(scene => scene.imageUrl && scene.imageUrl.length > 0);
            
            if (scenesWithImages.length === 0) {
              console.log(`API: Skipping project ${project.id} (no images)`);
              continue; // Skip projects with no images
            }
          
          // Use the first scene's image as preview
          const previewImage = scenesWithImages[0].imageUrl;
          
          projectImagesArray.push({
            projectId: project.id,
            projectTitle: project.title || `Project ${project.id}`,
            createdAt: project.createdAt,
            imageCount: scenesWithImages.length,
            previewImage: previewImage,
          });
        } catch (projectErr) {
          console.error(`API: Error processing project ${project.id}:`, projectErr);
          continue;
        }
      }
      
      // Calculate pagination info
      const totalPages = Math.ceil(allProjects.length / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;
      
      console.log(`API: Returning ${projectImagesArray.length} projects for page ${page}/${totalPages}`);
      
      return res.status(200).json({
          projects: projectImagesArray,
          pagination: {
            currentPage: page,
            totalPages,
            totalProjects: allProjects.length,
            hasNextPage,
            hasPrevPage,
            limit
          }
        });
      } catch (dbError) {
        console.warn("Database unavailable for library fetch, returning empty response:", dbError);
        return res.status(200).json({
          projects: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalProjects: 0,
            hasNextPage: false,
            hasPrevPage: false,
            limit
          }
        });
      }
    } catch (err) {
      console.error("Error fetching library data:", err);
      return res.status(200).json({
        projects: [],
        pagination: {
          currentPage: 1,
          totalPages: 0,
          totalProjects: 0,
          hasNextPage: false,
          hasPrevPage: false,
          limit: parseInt(req.query.limit as string) || 12
        }
      });
    }
  });
  
  // Get all images for a specific project
  app.get("/api/library/:id", async (req: Request, res: Response) => {
    try {
      console.log(`API: Getting library album for project ID ${req.params.id}`);
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        console.log("API: Invalid project ID format");
        return res.status(400).json({ message: "Invalid project ID" });
      }
      
      // Check for query param to request low-res versions first
      const optimizeLoading = req.query.optimizeLoading === 'true';
      console.log(`API: Optimize loading: ${optimizeLoading}`);
      
      // Get the project
      const project = await storage.getScript(projectId);
      if (!project) {
        console.log(`API: Project ${projectId} not found`);
        return res.status(404).json({ message: "Project not found" });
      }
      console.log(`API: Found project ${projectId} (${project.title || 'Untitled'})`);
      
      try {
        // Get all scenes for the project that have images
        const scenes = await storage.getScenesByScriptId(projectId);
        
        if (!scenes || !Array.isArray(scenes)) {
          console.log(`API: Error getting scenes for project ${projectId}`);
          return res.status(500).json({ message: "Failed to load project scenes" });
        }
        
        console.log(`API: Project ${projectId} has ${scenes.length} total scenes`);
        const scenesWithImages = scenes
          .filter(scene => scene.imageUrl && scene.imageUrl.length > 0);
        console.log(`API: Project ${projectId} has ${scenesWithImages.length} scenes with images`);
        
        const mappedImages = scenesWithImages.map(scene => {
            // Base image object
            return {
              id: scene.id,
              sceneNumber: scene.sceneNumber,
              title: scene.title || `Scene ${scene.sceneNumber}`,
              overlayText: scene.overlayText || "",
              // Always include image URL for all images
              imageUrl: scene.imageUrl
            };
          });
        
        // Sort images by scene number
        mappedImages.sort((a, b) => a.sceneNumber - b.sceneNumber);
        
        return res.status(200).json({
          project: {
            id: project.id,
            title: project.title || `Project ${project.id}`,
            createdAt: project.createdAt
          },
          images: mappedImages
        });
      } catch (scenesErr) {
        console.error(`API: Error processing scenes for project ${projectId}:`, scenesErr);
        // Return partial data with empty images array if we at least have the project info
        return res.status(200).json({
          project: {
            id: project.id,
            title: project.title || `Project ${project.id}`,
            createdAt: project.createdAt
          },
          images: [],
          error: "Could not load all images, please try refreshing"
        });
      }
    } catch (err) {
      console.error("Error fetching project images:", err);
      console.error(err);
      return res.status(500).json({ 
        message: "Failed to load project images", 
        error: err instanceof Error ? err.message : "Unknown error"
      });
    }
  });

  // Workflow Orchestration API Endpoints
  
  // Create a new project workflow (unified journey)
  app.post("/api/workflows/create-project", async (req: Request, res: Response) => {
    try {
      const {
        title,
        content,
        style,
        customStylePrompt,
        maintainContinuity,
        referenceImageUrl,
        voice,
        audioModel,
        projectType,
        musicAudioFilePath,
        animationSettings,
        providers,
      } = req.body;
      
      if (!title || !content || !style) {
        return res.status(400).json({ message: "Title, content, and style are required" });
      }
      
      const isMusicVideo = projectType === 'music-video';
      const isAnimation = projectType === 'animation';
      console.log(`Creating ${isMusicVideo ? 'music video' : isAnimation ? 'animation' : 'standard'} workflow with audio settings - Voice: ${voice || 'alloy'}, Model: ${audioModel || 'gpt-4o-mini-tts'}`);
      
      // Log music audio file path for music videos
      if (isMusicVideo && musicAudioFilePath) {
        console.log(`[CREATE_WORKFLOW] Music video with audio file: ${musicAudioFilePath}`);
      } else if (isMusicVideo) {
        console.log(`[CREATE_WORKFLOW] Music video without audio file - will use default scene timing`);
      }
      
      // Log animation settings for animation mode
      if (isAnimation && animationSettings) {
        console.log(`[CREATE_WORKFLOW] Animation mode with settings:`, animationSettings);
      }
      
      const workflowId = await workflowOrchestrator.createProjectWorkflow({
        title,
        content,
        style,
        customStylePrompt,
        maintainContinuity: maintainContinuity ?? true,
        referenceImageUrl,
        voice: voice || 'alloy',
        audioModel: audioModel || 'gpt-4o-mini-tts',
        projectType: projectType || 'video',
        musicAudioFilePath: isMusicVideo ? musicAudioFilePath : undefined,
        animationSettings: isAnimation ? animationSettings : undefined,
        providerConfig: providers,
      });

      const workflow = await workflowOrchestrator.getWorkflow(workflowId);
      
      return res.status(200).json({ 
        workflowId, 
        scriptId: workflow?.scriptId,
        message: "Project workflow started successfully" 
      });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });
  
  // Get workflow status
  app.get("/api/workflows/:workflowId", async (req: Request, res: Response) => {
    try {
      const workflowId = req.params.workflowId;
      const workflow = await workflowOrchestrator.getWorkflow(workflowId);
      
      if (!workflow) {
        return res.status(404).json({ message: "Workflow not found" });
      }
      
      return res.status(200).json(workflow);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });
  
  // Get workflows by script ID
  app.get("/api/workflows/script/:scriptId", async (req: Request, res: Response) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      if (isNaN(scriptId)) {
        return res.status(400).json({ message: "Invalid script ID" });
      }
      
      const workflows = workflowOrchestrator.getWorkflowsByScript(scriptId);
      return res.status(200).json(workflows);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });



  // Resume incomplete project workflow
  app.post("/api/workflows/resume/:scriptId", async (req: Request, res: Response) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      if (isNaN(scriptId)) {
        return res.status(400).json({ message: "Invalid script ID" });
      }

      const script = await storage.getScript(scriptId);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }

      console.log(`Resuming incomplete project ${scriptId}: ${script.title}`);

      const workflowId = await workflowOrchestrator.resumeProjectWorkflow(scriptId);
      
      return res.status(200).json({ 
        workflowId, 
        message: "Project workflow resumed successfully" 
      });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });
  
  // Create thumbnail workflow
  app.post("/api/workflows/create-thumbnail", async (req: Request, res: Response) => {
    try {
      const { scriptId, thumbnailConfig } = req.body;
      
      if (!scriptId) {
        return res.status(400).json({ message: "Script ID is required" });
      }
      
      const workflowId = await workflowOrchestrator.createThumbnailWorkflow(scriptId, thumbnailConfig);
      
      return res.status(200).json({ 
        workflowId, 
        message: "Thumbnail workflow started successfully" 
      });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Audio TTS API Routes
  
  // Get all audio TTS items
  app.get("/api/audio", async (req: Request, res: Response) => {
    try {
      try {
        const audioItems = await storage.getAllAudioTTS();
        res.json(audioItems);
      } catch (dbError) {
        console.warn("Database unavailable for audio fetch, returning empty array:", dbError);
        res.json([]);
      }
    } catch (err) {
      console.error("Error fetching audio items:", err);
      res.json([]);
    }
  });

  // Get audio TTS item by ID
  app.get("/api/audio/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      const audioItem = await storage.getAudioTTS(id);
      if (!audioItem) {
        return res.status(404).json({ message: "Audio not found" });
      }

      res.json(audioItem);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Generate TTS audio
  app.post("/api/audio/generate", async (req: Request, res: Response) => {
    try {
      const data = generateTTSSchema.parse(req.body);
      
      // Generate TTS audio first to avoid database dependency
      try {
        console.log(`Generating TTS audio for: ${data.title}`);
        const result = await generateTTS({
          model: data.model,
          voice: data.voice,
          input: data.content,
        });

        // Get actual duration if possible
        const actualDuration = await getActualAudioDuration(
          path.join(process.cwd(), result.audioUrl.replace(/^\//, ''))
        );

        // Try to save to database, but don't fail if database is unavailable
        let audioItem = null;
        try {
          // Create audio record in database
          audioItem = await storage.createAudioTTS({
            title: data.title,
            content: data.content,
            voice: data.voice,
            model: data.model,
            audioUrl: result.audioUrl,
            duration: actualDuration,
            fileSize: result.fileSize,
            status: "completed",
          });
          console.log(`Audio record saved to database with ID: ${audioItem.id}`);
        } catch (dbError) {
          console.warn("Database unavailable, audio generated but not saved to database:", dbError);
          // Return a mock response with the audio data
          audioItem = {
            id: Date.now(), // Use timestamp as temporary ID
            title: data.title,
            content: data.content,
            voice: data.voice,
            model: data.model,
            audioUrl: result.audioUrl,
            duration: actualDuration,
            fileSize: result.fileSize,
            status: "completed",
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }

        res.json(audioItem);
      } catch (ttsError) {
        console.error("TTS generation failed:", ttsError);
        res.status(500).json({ 
          message: "Failed to generate audio", 
          error: ttsError instanceof Error ? ttsError.message : "Unknown error" 
        });
      }
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: err.errors,
        });
      }
      errorHandler(err as Error, res);
    }
  });

  // Update audio TTS item (for renaming)
  app.patch("/api/audio/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      const { title } = req.body;
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ message: "Title is required" });
      }

      const updatedAudio = await storage.updateAudioTTS(id, { title: title.trim() });
      if (!updatedAudio) {
        return res.status(404).json({ message: "Audio not found" });
      }

      res.json(updatedAudio);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Delete audio TTS item
  app.delete("/api/audio/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      // Get audio item first to delete file
      const audioItem = await storage.getAudioTTS(id);
      if (!audioItem) {
        return res.status(404).json({ message: "Audio not found" });
      }

      // Delete audio file if it exists
      if (audioItem.audioUrl) {
        try {
          await deleteAudioFile(audioItem.audioUrl);
        } catch (fileError) {
          console.warn(`Failed to delete audio file: ${audioItem.audioUrl}`, fileError);
          // Continue with database deletion even if file deletion fails
        }
      }

      // Delete from database
      const deleted = await storage.deleteAudioTTS(id);
      if (!deleted) {
        return res.status(404).json({ message: "Audio not found" });
      }

      res.json({ message: "Audio deleted successfully" });
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Validate and recover missing audio files
  app.post("/api/audio/validate-and-recover", async (req: Request, res: Response) => {
    try {
      const { scriptIds } = req.body;
      
      if (!Array.isArray(scriptIds) || scriptIds.length === 0) {
        return res.status(400).json({ message: "Script IDs array is required" });
      }

      const { batchValidateAndRecoverAudio } = await import("./services/audioRecoveryService");
      const result = await batchValidateAndRecoverAudio(scriptIds);
      
      res.json(result);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Validate single audio file
  app.get("/api/audio/validate/:scriptId", async (req: Request, res: Response) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      if (isNaN(scriptId)) {
        return res.status(400).json({ message: "Invalid script ID" });
      }

      const { validateAndRecoverAudio } = await import("./services/audioRecoveryService");
      const result = await validateAndRecoverAudio(scriptId);
      
      res.json(result);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Video Generation API Endpoints

  // Get all video jobs
  app.get("/api/video-jobs", async (req: Request, res: Response) => {
    try {
      try {
        const jobs = await storage.getAllVideoJobs();
        res.json(jobs);
      } catch (dbError) {
        console.warn("Database unavailable for video jobs fetch, returning empty array:", dbError);
        res.status(200).json([]);
      }
    } catch (err) {
      console.error("Error fetching video jobs:", err);
      res.status(200).json([]);
    }
  });

  // Get video job by ID
  app.get("/api/video-jobs/:id", async (req: Request, res: Response) => {
    try {
      const job = await storage.getVideoJob(req.params.id);
      if (!job) {
        return res.status(404).json({ message: "Video job not found" });
      }
      res.json(job);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Generate video from project
  app.post("/api/generate-video", async (req: Request, res: Response) => {
    try {
      const { projectId, settings } = generateVideoSchema.parse(req.body);

      // Validate project exists and has required data
      const project = await storage.getScript(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check if project has scenes with images
      const scenes = await storage.getScenesByScriptId(projectId);
      const scenesWithImages = scenes.filter(scene => scene.imageUrl);
      
      if (scenesWithImages.length === 0) {
        return res.status(400).json({ 
          message: "Project must have scenes with images to generate video" 
        });
      }

      // Check if project has audio
      if (!project.audioTTSId) {
        return res.status(400).json({ 
          message: "Project must have an audio track to generate video" 
        });
      }

      const jobId = await renderQueue.enqueue(projectId, {
        ...(settings || {}),
        requestedFrom: "legacy-generate-video-endpoint",
      });
      
      res.json({
        jobId,
        message: "Video generation started",
        status: "pending"
      });
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: err.errors 
        });
      }
      errorHandler(err as Error, res);
    }
  });

  // Get video jobs for a specific project
  app.get("/api/projects/:id/video-jobs", async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const jobs = await storage.getVideoJobsByProject(projectId);
      res.json(jobs);
    } catch (err) {
      errorHandler(err as Error, res);
    }
  });

  // Serve generated video files
  app.get("/uploads/videos/:filename", (req: Request, res: Response) => {
    try {
      const filename = req.params.filename;
      const videoPath = path.join("uploads", "videos", filename);
      
      // Check if file exists
      if (!fs.existsSync(videoPath)) {
        return res.status(404).json({ message: "Video file not found" });
      }

      // Set proper headers for video streaming
      const stat = fs.statSync(videoPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        // Support range requests for video streaming
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
        };
        res.writeHead(200, head);
        fs.createReadStream(videoPath).pipe(res);
      }
    } catch (err) {
      console.error("Error serving video file:", err);
      res.status(500).json({ message: "Error serving video file" });
    }
  });

  // ============================================
  // ElevenLabs Voice API Routes (Animation Mode)
  // ============================================

  // Get available voices from ElevenLabs
  app.get("/api/elevenlabs/voices", async (req, res) => {
    try {
      if (!elevenLabsService.isConfigured()) {
        return res.status(503).json({ 
          message: "ElevenLabs API not configured",
          voices: [] 
        });
      }

      const voices = await elevenLabsService.listVoices();
      
      // Transform to a simpler format for the frontend
      const formattedVoices = voices.map(v => ({
        voiceId: v.voice_id,
        name: v.name,
        category: v.category,
        description: v.description,
        previewUrl: v.preview_url,
        labels: v.labels
      }));

      res.json({ voices: formattedVoices });
    } catch (err) {
      console.error("[ELEVENLABS] Error fetching voices:", err);
      res.status(500).json({ message: "Failed to fetch voices" });
    }
  });

  // Check ElevenLabs configuration status
  app.get("/api/elevenlabs/status", async (req, res) => {
    try {
      const isConfigured = elevenLabsService.isConfigured();
      res.json({ 
        configured: isConfigured,
        message: isConfigured ? "ElevenLabs API is configured" : "ElevenLabs API key not found"
      });
    } catch (err) {
      console.error("[ELEVENLABS] Error checking status:", err);
      res.status(500).json({ configured: false, message: "Error checking ElevenLabs status" });
    }
  });

  // Generate speech for a single line of dialogue
  app.post("/api/elevenlabs/generate-speech", async (req, res) => {
    try {
      if (!elevenLabsService.isConfigured()) {
        return res.status(503).json({ message: "ElevenLabs API not configured" });
      }

      // Validate request body
      const validationResult = elevenLabsGenerateSpeechSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationResult.error.errors 
        });
      }

      const { text, voiceId, settings, sceneId } = validationResult.data;

      console.log(`[ELEVENLABS] Generating speech for scene ${sceneId}: "${text.substring(0, 50)}..."`);

      const result = await elevenLabsService.generateSpeech(text, voiceId, settings);

      // Save the audio to object storage
      const audioFilename = `tts_${sceneId || uuidv4()}_${Date.now()}.mp3`;
      const storagePath = `audio/tts/${audioFilename}`;
      
      await objectStorage.uploadBuffer(result.audioBuffer, storagePath, 'audio/mpeg');

      // Get the full URL for the audio
      const audioUrl = `/api/object-storage/${storagePath}`;

      // Update scene with audio URL if sceneId provided
      if (sceneId) {
        await storage.updateScene(parseInt(sceneId), {
          dialogueAudioUrl: audioUrl
        });
      }

      res.json({ 
        success: true,
        audioUrl,
        contentType: result.contentType
      });
    } catch (err: any) {
      console.error("[ELEVENLABS] Error generating speech:", err);
      res.status(500).json({ message: err.message || "Failed to generate speech" });
    }
  });

  // Assign voice to a character in a project
  app.post("/api/projects/:scriptId/assign-voice", async (req, res) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      
      // Validate request body
      const validationResult = assignVoiceSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationResult.error.errors 
        });
      }
      
      const { characterName, voiceId, voiceName } = validationResult.data;

      const script = await storage.getScript(scriptId);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }

      // Get existing character voice assignments or initialize
      const characterVoices = (script.characterVoices as Record<string, { voiceId: string; voiceName: string }>) || {};
      
      // Update the voice assignment
      characterVoices[characterName] = { voiceId, voiceName };

      await storage.updateScript(scriptId, {
        characterVoices: characterVoices
      });

      console.log(`[ELEVENLABS] Assigned voice "${voiceName}" (${voiceId}) to character "${characterName}" in script ${scriptId}`);

      res.json({ 
        success: true,
        characterVoices
      });
    } catch (err: any) {
      console.error("[ELEVENLABS] Error assigning voice:", err);
      res.status(500).json({ message: err.message || "Failed to assign voice" });
    }
  });

  // Get character voice assignments for a project
  app.get("/api/projects/:scriptId/character-voices", async (req, res) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      
      const script = await storage.getScript(scriptId);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }

      const characterVoices = script.characterVoices || {};
      
      res.json({ characterVoices });
    } catch (err: any) {
      console.error("[ELEVENLABS] Error getting character voices:", err);
      res.status(500).json({ message: err.message || "Failed to get character voices" });
    }
  });

  // Generate TTS for all dialogue lines in a scene
  app.post("/api/scenes/:sceneId/generate-dialogue-audio", async (req, res) => {
    try {
      const sceneId = parseInt(req.params.sceneId);
      
      const scene = await storage.getScene(sceneId);
      if (!scene) {
        return res.status(404).json({ message: "Scene not found" });
      }

      if (!elevenLabsService.isConfigured()) {
        return res.status(503).json({ message: "ElevenLabs API not configured" });
      }

      const script = await storage.getScript(scene.scriptId);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }

      // Get the dialogue text and speaker from scene
      const dialogueLine = scene.dialogueLine as string;
      const speaker = scene.dialogueSpeaker as string;

      if (!dialogueLine || !speaker) {
        return res.status(400).json({ message: "Scene has no dialogue information" });
      }

      // Get character voice assignments
      const characterVoices = (script.characterVoices as Record<string, { voiceId: string; voiceName: string }>) || {};
      const voiceAssignment = characterVoices[speaker];

      if (!voiceAssignment) {
        return res.status(400).json({ 
          message: `No voice assigned for character "${speaker}"`,
          availableCharacters: Object.keys(characterVoices)
        });
      }

      console.log(`[ELEVENLABS] Generating audio for scene ${sceneId}, speaker: ${speaker}, voice: ${voiceAssignment.voiceName}`);

      // Generate the speech
      const result = await elevenLabsService.generateSpeech(dialogueLine, voiceAssignment.voiceId);

      // Save to object storage
      const audioFilename = `dialogue_${sceneId}_${Date.now()}.mp3`;
      const storagePath = `audio/dialogue/${audioFilename}`;
      
      await objectStorage.uploadBuffer(result.audioBuffer, storagePath, 'audio/mpeg');

      const audioUrl = `/api/object-storage/${storagePath}`;

      // Update scene with audio URL
      await storage.updateScene(sceneId, {
        dialogueAudioUrl: audioUrl
      });

      res.json({ 
        success: true,
        sceneId,
        speaker,
        audioUrl
      });
    } catch (err: any) {
      console.error("[ELEVENLABS] Error generating dialogue audio:", err);
      res.status(500).json({ message: err.message || "Failed to generate dialogue audio" });
    }
  });

  // Batch generate TTS for all scenes in a project
  app.post("/api/projects/:scriptId/generate-all-dialogue-audio", async (req, res) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      
      const script = await storage.getScript(scriptId);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }

      if (!elevenLabsService.isConfigured()) {
        return res.status(503).json({ message: "ElevenLabs API not configured" });
      }

      const scenes = await storage.getScenesByScriptId(scriptId);
      const characterVoices = (script.characterVoices as Record<string, { voiceId: string; voiceName: string }>) || {};

      const results: Array<{
        sceneId: number;
        speaker: string;
        audioUrl?: string;
        error?: string;
      }> = [];

      // Process each scene with dialogue
      for (const scene of scenes) {
        const dialogueLine = scene.dialogueLine as string;
        const speaker = scene.dialogueSpeaker as string;

        if (!dialogueLine || !speaker) {
          continue; // Skip scenes without dialogue
        }

        const voiceAssignment = characterVoices[speaker];
        if (!voiceAssignment) {
          results.push({
            sceneId: scene.id,
            speaker,
            error: `No voice assigned for "${speaker}"`
          });
          continue;
        }

        try {
          console.log(`[ELEVENLABS] Generating audio for scene ${scene.id}, speaker: ${speaker}`);
          
          const result = await elevenLabsService.generateSpeech(dialogueLine, voiceAssignment.voiceId);

          const audioFilename = `dialogue_${scene.id}_${Date.now()}.mp3`;
          const storagePath = `audio/dialogue/${audioFilename}`;
          
          await objectStorage.uploadBuffer(result.audioBuffer, storagePath, 'audio/mpeg');

          const audioUrl = `/api/object-storage/${storagePath}`;

          await storage.updateScene(scene.id, {
            dialogueAudioUrl: audioUrl
          });

          results.push({
            sceneId: scene.id,
            speaker,
            audioUrl
          });
        } catch (sceneErr: any) {
          console.error(`[ELEVENLABS] Error generating audio for scene ${scene.id}:`, sceneErr);
          results.push({
            sceneId: scene.id,
            speaker,
            error: sceneErr.message
          });
        }
      }

      const successCount = results.filter(r => r.audioUrl).length;
      const failureCount = results.filter(r => r.error).length;

      console.log(`[ELEVENLABS] Batch generation complete: ${successCount} success, ${failureCount} failures`);

      res.json({ 
        success: true,
        total: results.length,
        successCount,
        failureCount,
        results
      });
    } catch (err: any) {
      console.error("[ELEVENLABS] Error in batch dialogue generation:", err);
      res.status(500).json({ message: err.message || "Failed to generate dialogue audio" });
    }
  });

  // ============================================
  // Wav2Lip Lip-Sync API Routes (Animation Mode)
  // ============================================

  // Check Wav2Lip/Replicate configuration status
  app.get("/api/wav2lip/status", async (req, res) => {
    try {
      const isConfigured = wav2lipService.isConfigured();
      res.json({ 
        configured: isConfigured,
        message: isConfigured ? "Replicate API is configured for Wav2Lip" : "Replicate API token not found"
      });
    } catch (err) {
      console.error("[WAV2LIP] Error checking status:", err);
      res.status(500).json({ configured: false, message: "Error checking Wav2Lip status" });
    }
  });

  // Generate lip-sync video for a single scene
  app.post("/api/scenes/:sceneId/generate-lipsync", async (req, res) => {
    try {
      const sceneId = parseInt(req.params.sceneId);
      
      const scene = await storage.getScene(sceneId);
      if (!scene) {
        return res.status(404).json({ message: "Scene not found" });
      }

      if (!wav2lipService.isConfigured()) {
        return res.status(503).json({ message: "Replicate API not configured for Wav2Lip" });
      }

      // Check if scene has required assets
      if (!scene.imageUrl) {
        return res.status(400).json({ message: "Scene has no image - generate image first" });
      }

      if (!scene.dialogueAudioUrl) {
        return res.status(400).json({ message: "Scene has no dialogue audio - generate TTS first" });
      }

      console.log(`[WAV2LIP] Starting lip-sync for scene ${sceneId}`);

      // Get full URLs for the assets
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const faceImageUrl = scene.imageUrl.startsWith('http') 
        ? scene.imageUrl 
        : `${baseUrl}${scene.imageUrl}`;
      const audioUrl = scene.dialogueAudioUrl.startsWith('http')
        ? scene.dialogueAudioUrl
        : `${baseUrl}${scene.dialogueAudioUrl}`;

      const result = await wav2lipService.generateLipSync(faceImageUrl, audioUrl, {
        sceneId: scene.id,
      });

      // Update scene with animated clip URL
      await storage.updateScene(sceneId, {
        animatedClipUrl: result.videoUrl
      });

      res.json({ 
        success: true,
        sceneId,
        animatedClipUrl: result.videoUrl
      });
    } catch (err: any) {
      console.error("[WAV2LIP] Error generating lip-sync:", err);
      res.status(500).json({ message: err.message || "Failed to generate lip-sync video" });
    }
  });

  // Batch generate lip-sync videos for all scenes in a project
  app.post("/api/projects/:scriptId/generate-all-lipsync", async (req, res) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      
      const script = await storage.getScript(scriptId);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }

      if (!wav2lipService.isConfigured()) {
        return res.status(503).json({ message: "Replicate API not configured for Wav2Lip" });
      }

      const scenes = await storage.getScenesByScriptId(scriptId);
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const results: Array<{
        sceneId: number;
        animatedClipUrl?: string;
        error?: string;
      }> = [];

      // Process each scene that has both image and audio
      for (const scene of scenes) {
        // Skip narrator scenes (no face to lip-sync)
        if (scene.isNarrator) {
          continue;
        }

        if (!scene.imageUrl || !scene.dialogueAudioUrl) {
          results.push({
            sceneId: scene.id,
            error: "Missing image or dialogue audio"
          });
          continue;
        }

        try {
          console.log(`[WAV2LIP] Generating lip-sync for scene ${scene.id}`);
          
          const faceImageUrl = scene.imageUrl.startsWith('http') 
            ? scene.imageUrl 
            : `${baseUrl}${scene.imageUrl}`;
          const audioUrl = scene.dialogueAudioUrl.startsWith('http')
            ? scene.dialogueAudioUrl
            : `${baseUrl}${scene.dialogueAudioUrl}`;

          const result = await wav2lipService.generateLipSync(faceImageUrl, audioUrl, {
            sceneId: scene.id,
          });

          await storage.updateScene(scene.id, {
            animatedClipUrl: result.videoUrl
          });

          results.push({
            sceneId: scene.id,
            animatedClipUrl: result.videoUrl
          });
        } catch (sceneErr: any) {
          console.error(`[WAV2LIP] Error processing scene ${scene.id}:`, sceneErr);
          results.push({
            sceneId: scene.id,
            error: sceneErr.message
          });
        }
      }

      const successCount = results.filter(r => r.animatedClipUrl).length;
      const failureCount = results.filter(r => r.error).length;

      console.log(`[WAV2LIP] Batch generation complete: ${successCount} success, ${failureCount} failures`);

      res.json({ 
        success: true,
        total: results.length,
        successCount,
        failureCount,
        results
      });
    } catch (err: any) {
      console.error("[WAV2LIP] Error in batch lip-sync generation:", err);
      res.status(500).json({ message: err.message || "Failed to generate lip-sync videos" });
    }
  });

  // Assemble all animated clips into final video
  app.post("/api/projects/:scriptId/assemble-animation", async (req, res) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      
      const script = await storage.getScript(scriptId);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }

      // Check if this is an animation project
      if (script.projectType !== 'animation') {
        return res.status(400).json({ message: "This is not an animation project" });
      }

      // Update status
      await storage.updateScript(scriptId, {
        animationStatus: 'assembling'
      });

      const jobId = await animationAssemblyService.assembleAnimatedVideo(scriptId);

      res.json({ 
        success: true,
        jobId,
        message: "Animation assembly started"
      });
    } catch (err: any) {
      console.error("[ANIMATION] Error starting assembly:", err);
      res.status(500).json({ message: err.message || "Failed to start animation assembly" });
    }
  });

  // Get animation assembly job status
  app.get("/api/animation-jobs/:jobId/status", async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await animationAssemblyService.getJobStatus(jobId);
      
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      res.json(job);
    } catch (err: any) {
      console.error("[ANIMATION] Error getting job status:", err);
      res.status(500).json({ message: err.message || "Failed to get job status" });
    }
  });

  // Download final assembled animation video
  app.get("/api/projects/:scriptId/download-animation", async (req, res) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      
      const script = await storage.getScript(scriptId);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }

      if (!script.finalAnimatedVideoUrl) {
        return res.status(404).json({ message: "No final animated video available" });
      }

      const storagePath = script.finalAnimatedVideoUrl.replace('/api/object-storage/', '');
      
      try {
        const videoBuffer = await objectStorage.downloadToBuffer(storagePath);
        
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="animation_${scriptId}.mp4"`);
        res.send(videoBuffer);
      } catch (storageErr) {
        console.error(`[ANIMATION] Error downloading video from storage:`, storageErr);
        return res.status(404).json({ message: "Video file not found in storage" });
      }
    } catch (err: any) {
      console.error("[ANIMATION] Error downloading animation:", err);
      res.status(500).json({ message: err.message || "Failed to download animation" });
    }
  });

  // Download a single animated clip
  app.get("/api/scenes/:sceneId/download-clip", async (req, res) => {
    try {
      const sceneId = parseInt(req.params.sceneId);
      
      const scene = await storage.getScene(sceneId);
      if (!scene) {
        return res.status(404).json({ message: "Scene not found" });
      }

      if (!scene.animatedClipUrl) {
        return res.status(404).json({ message: "No animated clip available for this scene" });
      }

      // Get the storage path from the URL
      const storagePath = scene.animatedClipUrl.replace('/api/object-storage/', '');
      
      try {
        const videoBuffer = await objectStorage.downloadToBuffer(storagePath);
        
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="scene_${sceneId}_animated.mp4"`);
        res.send(videoBuffer);
      } catch (storageErr) {
        console.error(`[WAV2LIP] Error downloading clip from storage:`, storageErr);
        return res.status(404).json({ message: "Clip file not found in storage" });
      }
    } catch (err: any) {
      console.error("[WAV2LIP] Error downloading clip:", err);
      res.status(500).json({ message: err.message || "Failed to download clip" });
    }
  });

  // ============================================
  // Animation Storyboard Builder API Routes
  // ============================================

  // Get all animation characters for a script
  app.get("/api/scripts/:scriptId/animation-characters", async (req, res) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      const characters = await storage.getAnimationCharactersByScriptId(scriptId);
      res.json({ characters });
    } catch (err: any) {
      console.error("[ANIMATION] Error fetching characters:", err);
      res.status(500).json({ message: err.message || "Failed to fetch characters" });
    }
  });

  // Create a new animation character
  app.post("/api/scripts/:scriptId/animation-characters", async (req, res) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      const { name, displayName, description, isNarrator, voiceId, voiceName, voiceSettings, referenceImageUrl, color } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: "Character name is required" });
      }

      const existingChars = await storage.getAnimationCharactersByScriptId(scriptId);
      const sortOrder = existingChars.length;

      const character = await storage.createAnimationCharacter({
        scriptId,
        name,
        displayName: displayName || name,
        description: description || null,
        isNarrator: isNarrator || false,
        voiceId: voiceId || null,
        voiceName: voiceName || null,
        voiceSettings: voiceSettings || null,
        referenceImageUrl: referenceImageUrl || null,
        color: color || null,
        sortOrder
      });

      res.status(201).json({ character });
    } catch (err: any) {
      console.error("[ANIMATION] Error creating character:", err);
      res.status(500).json({ message: err.message || "Failed to create character" });
    }
  });

  // Update an animation character
  app.patch("/api/animation-characters/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      
      const character = await storage.updateAnimationCharacter(id, updates);
      if (!character) {
        return res.status(404).json({ message: "Character not found" });
      }

      res.json({ character });
    } catch (err: any) {
      console.error("[ANIMATION] Error updating character:", err);
      res.status(500).json({ message: err.message || "Failed to update character" });
    }
  });

  // Delete an animation character
  app.delete("/api/animation-characters/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteAnimationCharacter(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Character not found" });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("[ANIMATION] Error deleting character:", err);
      res.status(500).json({ message: err.message || "Failed to delete character" });
    }
  });

  // Get all animation frames for a script
  app.get("/api/scripts/:scriptId/animation-frames", async (req, res) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      const frames = await storage.getAnimationFramesByScriptId(scriptId);
      res.json({ frames });
    } catch (err: any) {
      console.error("[ANIMATION] Error fetching frames:", err);
      res.status(500).json({ message: err.message || "Failed to fetch frames" });
    }
  });

  // Create a new animation frame
  app.post("/api/scripts/:scriptId/animation-frames", async (req, res) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      const { characterId, dialogue, emotion, action, setting, visualNotes } = req.body;
      
      if (!dialogue) {
        return res.status(400).json({ message: "Dialogue is required" });
      }

      const existingFrames = await storage.getAnimationFramesByScriptId(scriptId);
      const sortOrder = existingFrames.length;

      // Calculate estimated duration based on word count (~150 words per minute)
      const wordCount = dialogue.split(/\s+/).length;
      const estimatedDuration = Math.max(2, Math.ceil(wordCount / 2.5)).toString();

      const frame = await storage.createAnimationFrame({
        scriptId,
        characterId: characterId || null,
        dialogue,
        emotion: emotion || 'neutral',
        action: action || null,
        setting: setting || null,
        visualNotes: visualNotes || null,
        estimatedDuration,
        sortOrder,
        status: 'draft'
      });

      res.status(201).json({ frame });
    } catch (err: any) {
      console.error("[ANIMATION] Error creating frame:", err);
      res.status(500).json({ message: err.message || "Failed to create frame" });
    }
  });

  // Batch create animation frames (for import from script)
  app.post("/api/scripts/:scriptId/animation-frames/batch", async (req, res) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      const { frames: frameData } = req.body;
      
      if (!Array.isArray(frameData) || frameData.length === 0) {
        return res.status(400).json({ message: "Frames array is required" });
      }

      // Delete existing frames for this script
      await storage.deleteAnimationFramesByScriptId(scriptId);

      // Create new frames
      const frames = await storage.createAnimationFrames(
        frameData.map((f: any, index: number) => ({
          scriptId,
          characterId: f.characterId || null,
          dialogue: f.dialogue,
          emotion: f.emotion || 'neutral',
          action: f.action || null,
          setting: f.setting || null,
          visualNotes: f.visualNotes || null,
          estimatedDuration: f.estimatedDuration || Math.max(2, Math.ceil(f.dialogue.split(/\s+/).length / 2.5)).toString(),
          sortOrder: index,
          status: 'draft'
        }))
      );

      res.status(201).json({ frames });
    } catch (err: any) {
      console.error("[ANIMATION] Error batch creating frames:", err);
      res.status(500).json({ message: err.message || "Failed to create frames" });
    }
  });

  // Update an animation frame
  app.patch("/api/animation-frames/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      
      const frame = await storage.updateAnimationFrame(id, updates);
      if (!frame) {
        return res.status(404).json({ message: "Frame not found" });
      }

      res.json({ frame });
    } catch (err: any) {
      console.error("[ANIMATION] Error updating frame:", err);
      res.status(500).json({ message: err.message || "Failed to update frame" });
    }
  });

  // Delete an animation frame
  app.delete("/api/animation-frames/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteAnimationFrame(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Frame not found" });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("[ANIMATION] Error deleting frame:", err);
      res.status(500).json({ message: err.message || "Failed to delete frame" });
    }
  });

  // Reorder animation frames
  app.post("/api/scripts/:scriptId/animation-frames/reorder", async (req, res) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      const { frameIds } = req.body;
      
      if (!Array.isArray(frameIds)) {
        return res.status(400).json({ message: "frameIds array is required" });
      }

      const frames = await storage.reorderAnimationFrames(scriptId, frameIds);
      res.json({ frames });
    } catch (err: any) {
      console.error("[ANIMATION] Error reordering frames:", err);
      res.status(500).json({ message: err.message || "Failed to reorder frames" });
    }
  });

  // Parse raw script text into frames (AI-assisted)
  app.post("/api/scripts/:scriptId/parse-dialogue-to-frames", async (req, res) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      const { dialogueText } = req.body;
      
      if (!dialogueText) {
        return res.status(400).json({ message: "dialogueText is required" });
      }

      // Simple pattern: "SPEAKER: dialogue text"
      const lines = dialogueText.split('\n').filter((line: string) => line.trim());
      const parsedFrames: any[] = [];

      for (const line of lines) {
        const match = line.match(/^([A-Z][A-Z0-9_\s]*?):\s*(.+)$/);
        if (match) {
          const speaker = match[1].trim();
          const dialogue = match[2].trim();
          parsedFrames.push({
            speaker,
            dialogue,
            emotion: 'neutral',
            isNarrator: speaker.toUpperCase() === 'NARRATOR'
          });
        }
      }

      res.json({ 
        parsedFrames,
        uniqueSpeakers: [...new Set(parsedFrames.map(f => f.speaker))]
      });
    } catch (err: any) {
      console.error("[ANIMATION] Error parsing dialogue:", err);
      res.status(500).json({ message: err.message || "Failed to parse dialogue" });
    }
  });

  // ===== Animation Scenes CRUD =====
  
  // Get all animation scenes for a script
  app.get("/api/scripts/:scriptId/animation-scenes", async (req, res) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      const scenes = await storage.getAnimationScenesByScriptId(scriptId);
      res.json({ scenes });
    } catch (err: any) {
      console.error("[ANIMATION] Error getting scenes:", err);
      res.status(500).json({ message: err.message || "Failed to get scenes" });
    }
  });

  // Create a new animation scene
  app.post("/api/scripts/:scriptId/animation-scenes", async (req, res) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      const { title, setting, timeOfDay, visualStyle, transitionNote, summary, sortOrder } = req.body;
      
      if (!title) {
        return res.status(400).json({ message: "Scene title is required" });
      }

      const scene = await storage.createAnimationScene({
        scriptId,
        title,
        setting: setting || null,
        timeOfDay: timeOfDay || null,
        visualStyle: visualStyle || null,
        transitionNote: transitionNote || null,
        summary: summary || null,
        sortOrder: sortOrder || 0,
      });

      res.json({ scene });
    } catch (err: any) {
      console.error("[ANIMATION] Error creating scene:", err);
      res.status(500).json({ message: err.message || "Failed to create scene" });
    }
  });

  // Update an animation scene
  app.patch("/api/animation-scenes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      
      const scene = await storage.updateAnimationScene(id, updates);
      if (!scene) {
        return res.status(404).json({ message: "Scene not found" });
      }

      res.json({ scene });
    } catch (err: any) {
      console.error("[ANIMATION] Error updating scene:", err);
      res.status(500).json({ message: err.message || "Failed to update scene" });
    }
  });

  // Delete an animation scene
  app.delete("/api/animation-scenes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteAnimationScene(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Scene not found" });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("[ANIMATION] Error deleting scene:", err);
      res.status(500).json({ message: err.message || "Failed to delete scene" });
    }
  });

  // ===== AI Script Enhancement for Animation =====
  
  // Parse and enhance script for animation project - extracts characters, scenes, and dialogue
  app.post("/api/scripts/:scriptId/animation-enhance", async (req, res) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      const script = await storage.getScript(scriptId);
      
      if (!script) {
        return res.status(404).json({ message: "Project not found" });
      }

      if (!script.content || script.content.trim().length === 0) {
        return res.status(400).json({ message: "Script content is empty" });
      }

      // Use OpenAI to parse the script into structured animation format
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI();

      const systemPrompt = `You are a script parser for an animation project. Analyze the provided script and extract:
1. Characters - identify all speakers/characters with their names and whether they are narrators
2. Scenes - group dialogue into logical scenes based on setting changes, time jumps, or narrative shifts
3. Dialogue frames - parse each line of dialogue with speaker, text, emotion, and any stage directions

Output JSON format:
{
  "characters": [
    { "name": "CHARACTER_NAME", "displayName": "Display Name", "description": "brief visual description", "isNarrator": false, "suggestedVoiceType": "male_adult/female_adult/child/narrator" }
  ],
  "scenes": [
    {
      "title": "Scene Title",
      "setting": "INT. LOCATION - TIME",
      "timeOfDay": "morning/afternoon/evening/night",
      "summary": "Brief scene summary",
      "frames": [
        { "speaker": "CHARACTER_NAME", "dialogue": "The dialogue text", "emotion": "neutral/happy/sad/angry/excited/confused", "action": "optional stage direction", "visualNotes": "optional visual notes" }
      ]
    }
  ]
}

Rules:
- NARRATOR lines should have isNarrator: true
- Group related dialogue into the same scene
- Create new scenes when location/time changes or there's a significant narrative shift
- If no clear scene breaks exist, group every 4-6 dialogue lines into a scene
- Keep emotions simple: neutral, happy, sad, angry, excited, confused, scared, thoughtful
- Extract stage directions like "(sighs)" or "[walks away]" into the action field`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Parse this script:\n\n${script.content}` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const parsed = JSON.parse(response.choices[0].message.content || "{}");

      // Validate the response structure
      if (!parsed.characters || !parsed.scenes) {
        throw new Error("Invalid AI response format");
      }

      res.json({ 
        success: true,
        parsed,
        characterCount: parsed.characters?.length || 0,
        sceneCount: parsed.scenes?.length || 0,
        frameCount: parsed.scenes?.reduce((sum: number, s: any) => sum + (s.frames?.length || 0), 0) || 0
      });
    } catch (err: any) {
      console.error("[ANIMATION] Error enhancing script:", err);
      res.status(500).json({ message: err.message || "Failed to enhance script for animation" });
    }
  });

  // Apply parsed animation data to the project (creates characters, scenes, frames)
  app.post("/api/scripts/:scriptId/animation-apply", async (req, res) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      const { characters, scenes } = req.body;
      
      if (!characters || !scenes) {
        return res.status(400).json({ message: "characters and scenes are required" });
      }

      // Clear existing data first
      await storage.deleteAnimationFramesByScriptId(scriptId);
      await storage.deleteAnimationScenesByScriptId(scriptId);
      const existingChars = await storage.getAnimationCharactersByScriptId(scriptId);
      for (const char of existingChars) {
        await storage.deleteAnimationCharacter(char.id);
      }

      // Create characters and build a name-to-id map
      const charIdMap: Record<string, number> = {};
      for (let i = 0; i < characters.length; i++) {
        const char = characters[i];
        const created = await storage.createAnimationCharacter({
          scriptId,
          name: char.name,
          displayName: char.displayName || char.name,
          description: char.description || null,
          isNarrator: char.isNarrator || false,
          color: `hsl(${(i * 60) % 360}, 70%, 50%)`,
          sortOrder: i,
        });
        charIdMap[char.name.toUpperCase()] = created.id;
      }

      // Create scenes and frames
      const createdScenes = [];
      let globalFrameOrder = 0;

      for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
        const sceneData = scenes[sceneIndex];
        
        const scene = await storage.createAnimationScene({
          scriptId,
          title: sceneData.title || `Scene ${sceneIndex + 1}`,
          setting: sceneData.setting || null,
          timeOfDay: sceneData.timeOfDay || null,
          summary: sceneData.summary || null,
          sortOrder: sceneIndex,
        });

        // Create frames for this scene
        if (sceneData.frames && Array.isArray(sceneData.frames)) {
          for (const frameData of sceneData.frames) {
            const characterId = charIdMap[frameData.speaker?.toUpperCase()] || null;
            
            await storage.createAnimationFrame({
              scriptId,
              characterId,
              sceneGroupId: scene.id,
              sortOrder: globalFrameOrder++,
              dialogue: frameData.dialogue || "",
              emotion: frameData.emotion || "neutral",
              action: frameData.action || null,
              setting: sceneData.setting || null,
              visualNotes: frameData.visualNotes || null,
              status: "draft",
            });
          }
        }

        createdScenes.push(scene);
      }

      // Update script status to show wizard progression
      await storage.updateScript(scriptId, {
        animationStatus: "scenes_suggested"
      });

      res.json({ 
        success: true,
        charactersCreated: Object.keys(charIdMap).length,
        scenesCreated: createdScenes.length,
        message: "Animation data applied successfully"
      });
    } catch (err: any) {
      console.error("[ANIMATION] Error applying animation data:", err);
      res.status(500).json({ message: err.message || "Failed to apply animation data" });
    }
  });

  // Lock storyboard and prepare for generation
  app.post("/api/scripts/:scriptId/animation-lock-storyboard", async (req, res) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      
      await storage.updateScript(scriptId, {
        animationStatus: "storyboard_locked"
      });

      res.json({ success: true, message: "Storyboard locked and ready for generation" });
    } catch (err: any) {
      console.error("[ANIMATION] Error locking storyboard:", err);
      res.status(500).json({ message: err.message || "Failed to lock storyboard" });
    }
  });

  // Setup WebSocket server for real-time job updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');

    // Send initial connection confirmation
    ws.send(JSON.stringify({ type: 'connected', message: 'WebSocket connected' }));

    // Listen for job queue events and broadcast to connected clients
    const jobEventHandlers = {
      jobAdded: (job: any) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'jobAdded', data: job }));
        }
      },
      jobUpdated: (job: any) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'jobUpdated', data: job }));
        }
      },
      jobProgress: (job: any, sceneId: number, imageUrl: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ 
            type: 'jobProgress', 
            data: { job, sceneId, imageUrl } 
          }));
        }
      },
      jobCompleted: (job: any) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'jobCompleted', data: job }));
        }
      },
      jobFailed: (job: any) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'jobFailed', data: job }));
        }
      }
    };

    // Register event listeners
    jobQueue.on('jobAdded', jobEventHandlers.jobAdded);
    jobQueue.on('jobUpdated', jobEventHandlers.jobUpdated);
    jobQueue.on('jobProgress', jobEventHandlers.jobProgress);
    jobQueue.on('jobCompleted', jobEventHandlers.jobCompleted);
    jobQueue.on('jobFailed', jobEventHandlers.jobFailed);

    // Register workflow event listeners
    const workflowEventHandlers = {
      workflowCompleted: (workflow: any) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'workflowCompleted',
            data: {
              workflowId: workflow.id,
              scriptId: workflow.scriptId,
              title: workflow.title,
              message: `Your project "${workflow.title}" has been completed successfully!`
            }
          }));
        }
      },
      workflowFailed: (workflow: any, error: any) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'workflowFailed',
            data: {
              workflowId: workflow.id,
              scriptId: workflow.scriptId,
              title: workflow.title,
              message: `Your project "${workflow.title}" failed to complete. Please try again.`,
              error: error.message
            }
          }));
        }
      }
    };

    workflowOrchestrator.on('workflowCompleted', workflowEventHandlers.workflowCompleted);
    workflowOrchestrator.on('workflowFailed', workflowEventHandlers.workflowFailed);

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      // Remove event listeners when client disconnects
      jobQueue.removeListener('jobAdded', jobEventHandlers.jobAdded);
      jobQueue.removeListener('jobUpdated', jobEventHandlers.jobUpdated);
      jobQueue.removeListener('jobProgress', jobEventHandlers.jobProgress);
      jobQueue.removeListener('jobCompleted', jobEventHandlers.jobCompleted);
      jobQueue.removeListener('jobFailed', jobEventHandlers.jobFailed);
      workflowOrchestrator.removeListener('workflowCompleted', workflowEventHandlers.workflowCompleted);
      workflowOrchestrator.removeListener('workflowFailed', workflowEventHandlers.workflowFailed);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  // ===== NOTION DOCUMENTATION ENDPOINTS =====
  // Admin authentication middleware for Notion endpoints
  const requireAdminAuth = (req: Request, res: Response, next: any) => {
    const adminKey = req.headers['x-admin-key'] || req.query.adminKey;
    const expectedKey = process.env.NOTION_ADMIN_KEY || process.env.REPLIT_DEPLOYMENT_ID;
    
    // In development, allow access if no key is set
    if (!expectedKey && process.env.NODE_ENV !== 'production') {
      return next();
    }
    
    if (!adminKey || adminKey !== expectedKey) {
      return res.status(401).json({ message: "Unauthorized: Admin key required" });
    }
    next();
  };

  app.post("/api/notion/initialize", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { initializeSceneStitchWorkspace } = await import('./services/notionDocs');
      const workspace = await initializeSceneStitchWorkspace();
      res.json({ 
        success: true, 
        message: "SceneStitch workspace created in Notion",
        workspace 
      });
    } catch (err) {
      console.error("Error initializing Notion workspace:", err);
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/notion/update-docs", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { updateTechnicalDocs, updateUserGuide } = await import('./services/notionDocs');
      await updateTechnicalDocs();
      await updateUserGuide();
      res.json({ success: true, message: "Documentation updated" });
    } catch (err) {
      console.error("Error updating Notion docs:", err);
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/notion/release", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { version, changes } = req.body;
      if (!version || !changes || !Array.isArray(changes)) {
        return res.status(400).json({ message: "version and changes[] required" });
      }
      const { createReleaseNote } = await import('./services/notionDocs');
      const pageId = await createReleaseNote(version, changes);
      res.json({ success: true, message: "Release note created", pageId });
    } catch (err) {
      console.error("Error creating release note:", err);
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/notion/publish-hook", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { version, changes } = req.body;
      if (!version) {
        return res.status(400).json({ message: "version required" });
      }
      const changesList = changes || ["General updates and improvements"];
      const { onPublish } = await import('./services/notionDocs');
      await onPublish(version, changesList);
      res.json({ 
        success: true, 
        message: "Documentation updated and release note created" 
      });
    } catch (err) {
      console.error("Error in publish hook:", err);
      res.status(500).json({ message: (err as Error).message });
    }
  });

  return httpServer;
}
