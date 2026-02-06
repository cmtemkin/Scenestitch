import { Request, Response, Express } from 'express';
import { storage } from '../storage';
import { generateDallePrompts, generateDalleImages, generateSoraPrompts } from '../services/openai';
import { getModelConfig } from '../config';
import { exportProjectAssets } from '../services/exportService';
import { saveAudioFile, analyzeAudioForScenes } from '../services/audioProcessor';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Multer configuration for audio uploads
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedTypes = ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio file type'), false);
    }
  }
});

export function registerAutomationRoutes(app: Express) {
  
  /**
   * @swagger
   * /api/v1/script-to-images:
   *   post:
   *     summary: Transform script directly to images in one step
   *     description: Takes a script and transforms it into scenes with generated images in a single API call
   *     tags: [Automation]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ScriptToImagesRequest'
   *           example:
   *             title: "My Video Script"
   *             content: "Scene 1: A hero walks into a mysterious forest. The trees are tall and ancient. Scene 2: The hero discovers a hidden cave entrance. Scene 3: Inside the cave, glowing crystals illuminate the path."
   *             style: "comic"
   *             projectType: "video"
   *             maintainContinuity: true
   *             customStylePrompt: "Comic book style with vibrant colors"
   *     responses:
   *       200:
   *         description: Successfully generated scenes and images
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: "Successfully generated script with images"
   *                 data:
   *                   type: object
   *                   properties:
   *                     script:
   *                       $ref: '#/components/schemas/Script'
   *                     scenes:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/Scene'
   *       400:
   *         description: Bad request
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  app.post('/api/v1/script-to-images', async (req: Request, res: Response) => {
    try {
      const { title, content, style, projectType = 'video', maintainContinuity = true, customStylePrompt, referenceImageUrl } = req.body;
      
      if (!content || !style) {
        return res.status(400).json({
          success: false,
          message: 'Content and style are required',
          error: 'Missing required fields'
        });
      }

      // Step 1: Create the script
      const script = await storage.createScript({
        title: title || 'API Generated Script',
        content,
        style,
        projectType,
        maintainContinuity,
        customStylePrompt: style === 'custom' ? customStylePrompt : null
      });

      // Step 2: Generate scene prompts
      const scenesWithPrompts = await generateDallePrompts(
        content,
        style,
        maintainContinuity,
        customStylePrompt,
        referenceImageUrl,
        projectType
      );

      // Create scenes in database
      const createdScenes = await storage.createScenes(
        scenesWithPrompts.map(scene => ({
          scriptId: script.id,
          sceneNumber: scene.sceneNumber || 1,
          title: scene.title || `Scene ${scene.sceneNumber || 1}`,
          scriptExcerpt: scene.scriptExcerpt || "",
          dallePrompt: scene.dallePrompt,
          soraPrompt: scene.soraPrompt || null,
          imageUrl: null,
          estimatedDuration: scene.estimatedDuration || null,
          exactStartTime: null,
          exactEndTime: null,
          isPinned: false,
          overlayText: null,
          metadata: {}
        }))
      );

      // Step 3: Generate images with admin configuration
      const adminConfig = getModelConfig();
      const scenesForGeneration = createdScenes.map(scene => ({
        content: scene.scriptExcerpt,
        dallePrompt: scene.dallePrompt,
        title: scene.title || undefined,
        id: scene.id,
        sceneNumber: scene.sceneNumber,
        scriptId: scene.scriptId ?? undefined
      }));
      
      const scenesWithImages = await generateDalleImages(
        scenesForGeneration,
        style,
        maintainContinuity,
        customStylePrompt,
        referenceImageUrl,
        adminConfig
      );

      // Update scenes with image URLs
      for (const scene of scenesWithImages) {
        await storage.updateScene(scene.id!, { imageUrl: scene.imageUrl });
      }

      // Fetch final scenes with images
      const finalScenes = await storage.getScenesByScriptId(script.id);

      res.json({
        success: true,
        message: 'Successfully generated script with images',
        data: {
          script,
          scenes: finalScenes
        }
      });

    } catch (error) {
      console.error('Error in script-to-images:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate script and images',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * @swagger
   * /api/v1/generate-prompts:
   *   post:
   *     summary: Generate scene prompts from script
   *     description: Takes a script and generates DALL-E and Sora prompts for each scene
   *     tags: [Scene Generation]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/GeneratePromptsRequest'
   *           example:
   *             script: "A hero walks into a mysterious forest. The trees are tall and ancient."
   *             style: "comic"
   *             projectType: "video"
   *             maintainContinuity: true
   *     responses:
   *       200:
   *         description: Successfully generated prompts
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: "Successfully generated scene prompts"
   *                 data:
   *                   type: object
   *                   properties:
   *                     scenes:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/Scene'
   */
  app.post('/api/v1/generate-prompts', async (req: Request, res: Response) => {
    try {
      const { script, style, projectType = 'video', maintainContinuity = true, customStylePrompt, referenceImageUrl } = req.body;
      
      if (!script || !style) {
        return res.status(400).json({
          success: false,
          message: 'Script and style are required',
          error: 'Missing required fields'
        });
      }

      const scenesWithPrompts = await generateDallePrompts(
        script,
        style,
        maintainContinuity,
        customStylePrompt,
        referenceImageUrl,
        projectType
      );

      res.json({
        success: true,
        message: 'Successfully generated scene prompts',
        data: {
          scenes: scenesWithPrompts
        }
      });

    } catch (error) {
      console.error('Error generating prompts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate scene prompts',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * @swagger
   * /api/v1/generate-images:
   *   post:
   *     summary: Generate images from scene prompts
   *     description: Takes scenes with prompts and generates images using DALL-E
   *     tags: [Image Generation]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/GenerateImagesRequest'
   *     responses:
   *       200:
   *         description: Successfully generated images
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: "Successfully generated images"
   *                 data:
   *                   type: object
   *                   properties:
   *                     scenes:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/Scene'
   */
  app.post('/api/v1/generate-images', async (req: Request, res: Response) => {
    try {
      const { scenes, style, maintainContinuity = true, customStylePrompt, referenceImageUrl } = req.body;
      
      if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Scenes array is required',
          error: 'Missing or invalid scenes data'
        });
      }

      const adminConfig = getModelConfig();
      const scenesWithImages = await generateDalleImages(
        scenes,
        style,
        maintainContinuity,
        customStylePrompt,
        referenceImageUrl,
        adminConfig
      );

      res.json({
        success: true,
        message: 'Successfully generated images',
        data: {
          scenes: scenesWithImages
        }
      });

    } catch (error) {
      console.error('Error generating images:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate images',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * @swagger
   * /api/v1/upload-audio/{scriptId}:
   *   post:
   *     summary: Upload and analyze audio file
   *     description: Upload an audio file and analyze it to generate timestamps for scenes
   *     tags: [Audio Processing]
   *     parameters:
   *       - in: path
   *         name: scriptId
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID of the script to associate audio with
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               audioFile:
   *                 type: string
   *                 format: binary
   *                 description: Audio file (WAV, MP3, M4A, AAC, OGG, FLAC)
   *     responses:
   *       200:
   *         description: Successfully uploaded and analyzed audio
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: "Audio uploaded and analyzed successfully"
   *                 data:
   *                   type: object
   *                   properties:
   *                     audioUrl:
   *                       type: string
   *                       example: "/uploads/audio/filename.wav"
   *                     timestamps:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           sceneId:
   *                             type: integer
   *                           startTime:
   *                             type: number
   *                           endTime:
   *                             type: number
   */
  app.post('/api/v1/upload-audio/:scriptId', audioUpload.single('audioFile'), async (req: Request, res: Response) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      
      if (isNaN(scriptId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid script ID',
          error: 'Script ID must be a number'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Audio file is required',
          error: 'No file uploaded'
        });
      }

      // Save audio file
      const audioUrl = await saveAudioFile(req.file.buffer, req.file.originalname);
      
      // Get scenes for the script
      const scenes = await storage.getScenesByScriptId(scriptId);
      
      if (scenes.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No scenes found for this script',
          error: 'Script has no scenes to analyze'
        });
      }

      // Analyze audio and get timestamps
      const timestamps = await analyzeAudioForScenes(audioUrl, scenes);
      
      // Update scenes with timestamps
      for (const timestamp of timestamps) {
        await storage.updateScene(timestamp.sceneId, {
          exactStartTime: timestamp.startTime,
          exactEndTime: timestamp.endTime
        });
      }

      res.json({
        success: true,
        message: 'Audio uploaded and analyzed successfully',
        data: {
          audioUrl,
          timestamps
        }
      });

    } catch (error) {
      console.error('Error uploading audio:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload and analyze audio',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * @swagger
   * /api/v1/export-assets/{scriptId}:
   *   get:
   *     summary: Export all assets as ZIP
   *     description: Download a ZIP file containing all generated assets for a script
   *     tags: [Export]
   *     parameters:
   *       - in: path
   *         name: scriptId
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID of the script to export
   *     responses:
   *       200:
   *         description: ZIP file download
   *         content:
   *           application/zip:
   *             schema:
   *               type: string
   *               format: binary
   *       404:
   *         description: Script not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  app.get('/api/v1/export-assets/:scriptId', async (req: Request, res: Response) => {
    try {
      const scriptId = parseInt(req.params.scriptId);
      
      if (isNaN(scriptId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid script ID',
          error: 'Script ID must be a number'
        });
      }

      const script = await storage.getScript(scriptId);
      if (!script) {
        return res.status(404).json({
          success: false,
          message: 'Script not found',
          error: 'No script found with the provided ID'
        });
      }

      const scenes = await storage.getScenesByScriptId(scriptId);
      
      if (scenes.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No scenes found for this script',
          error: 'Script has no scenes to export'
        });
      }

      // Create ZIP export
      const zipPath = await exportProjectAssets(scriptId);
      
      // Create a sanitized filename from the project title or use script ID as fallback
      const sanitizedTitle = script.title ? script.title.replace(/[^a-z0-9]/gi, '-').toLowerCase() : `script-${scriptId}`;
      const downloadFilename = `scenestitch-${sanitizedTitle}.zip`;
      
      // Send the file
      res.download(zipPath, downloadFilename, (err) => {
        if (err) {
          console.error(`Error sending ZIP file: ${err}`);
        }
        
        // Cleanup after sending
        try {
          fs.unlinkSync(zipPath);
        } catch (unlinkErr) {
          console.error(`Error cleaning up temporary ZIP file: ${unlinkErr}`);
        }
      });

    } catch (error) {
      console.error('Error exporting assets:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export assets',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}