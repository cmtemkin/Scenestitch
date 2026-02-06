/**
 * Model Management API
 * Provides easy controls for switching between GPT-5 and legacy models
 */

import { Express, Request, Response } from "express";
import { updateModelConfig, getModelConfig, resetModelConfig } from "../config";
import { z } from "zod";

// Schema for model rollback
const rollbackSchema = z.object({
  modelType: z.enum(['all', 'prompts', 'images']),
  targetModel: z.string().optional()
});

export function registerModelManagementRoutes(app: Express) {
  
  // Quick rollback to GPT-4 models (emergency fallback)
  app.post("/api/models/rollback", async (req: Request, res: Response) => {
    try {
      const { modelType, targetModel } = rollbackSchema.parse(req.body);
      
      let updates: any = {};
      
      switch (modelType) {
        case 'all':
          // Rollback all models to GPT-4 series
          updates = {
            dalle_prompt_generation: "gpt-4.1-mini",
            sora_prompt_generation: "gpt-4.1-mini", 
            scene_duration_estimation: "gpt-4.1-mini",
            image_generation: targetModel || "gpt-image-1"
          };
          break;
          
        case 'prompts':
          // Only rollback prompt generation models
          updates = {
            dalle_prompt_generation: targetModel || "gpt-4.1-mini",
            sora_prompt_generation: targetModel || "gpt-4.1-mini",
            scene_duration_estimation: targetModel || "gpt-4.1-mini"
          };
          break;
          
        case 'images':
          // Only rollback image generation
          updates = {
            image_generation: targetModel || "gpt-image-1"
          };
          break;
      }
      
      const newConfig = await updateModelConfig(updates);
      
      return res.json({
        message: `Models rolled back for ${modelType}`,
        config: newConfig
      });
      
    } catch (error) {
      console.error("Rollback error:", error);
      return res.status(500).json({ 
        message: "Failed to rollback models",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Upgrade to GPT-5.1 (quick upgrade)
  app.post("/api/models/upgrade-gpt5", async (req: Request, res: Response) => {
    try {
      const updates = {
        dalle_prompt_generation: "gpt-5.1",
        sora_prompt_generation: "gpt-5.1",
        scene_duration_estimation: "gpt-5.1"
        // Keep image_generation as is
      };
      
      const newConfig = await updateModelConfig(updates);
      
      return res.json({
        message: "Successfully upgraded prompt generation to GPT-5.1",
        config: newConfig
      });
      
    } catch (error) {
      console.error("Upgrade error:", error);
      return res.status(500).json({
        message: "Failed to upgrade to GPT-5.1",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Get model performance metrics
  app.get("/api/models/metrics", async (req: Request, res: Response) => {
    try {
      const config = getModelConfig();
      
      // In a production system, you would track actual metrics
      // For now, return configuration and status
      const metrics = {
        current_models: config,
        status: {
          dalle_prompt_generation: config.dalle_prompt_generation === "gpt-5.1" ? "upgraded-latest" : config.dalle_prompt_generation === "gpt-5" ? "upgraded" : "legacy",
          sora_prompt_generation: config.sora_prompt_generation === "gpt-5.1" ? "upgraded-latest" : config.sora_prompt_generation === "gpt-5" ? "upgraded" : "legacy",
          scene_duration_estimation: config.scene_duration_estimation === "gpt-5.1" ? "upgraded-latest" : config.scene_duration_estimation === "gpt-5" ? "upgraded" : "legacy",
          image_generation: config.image_generation === "gpt-image-1" ? "stable" : "experimental"
        },
        recommendations: {
          prompts: config.dalle_prompt_generation === "gpt-5.1" 
            ? "GPT-5.1 (latest) is performing well for prompt generation"
            : "Consider upgrading to GPT-5.1 for best prompt quality",
          images: "gpt-image-1 is stable and recommended"
        }
      };
      
      return res.json(metrics);
      
    } catch (error) {
      console.error("Metrics error:", error);
      return res.status(500).json({
        message: "Failed to get model metrics",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
}