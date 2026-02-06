/**
 * Configuration settings for SceneStitch
 * This file contains admin settings that can be adjusted
 */

// Quality options per model
export const MODEL_QUALITY_OPTIONS = {
  'dall-e-3': ["standard", "hd"] as const,
  'gpt-image-1': ["low", "medium", "high", "auto"] as const,
  'gpt-image-1-mini': ["low", "medium", "high", "auto"] as const
};

// Size options per model
export const MODEL_SIZE_OPTIONS = {
  'dall-e-3': ["1024x1024", "1024x1792", "1792x1024"] as const,
  'gpt-image-1': ["1024x1024", "1024x1536", "1536x1024", "1792x1024", "1024x1792", "auto"] as const,
  'gpt-image-1-mini': ["1024x1024", "1024x1536", "1536x1024", "1792x1024", "1024x1792", "auto"] as const
};

// Default AI model settings for different processes
export const defaultModelConfig = {
  // OpenAI models for each process - Upgraded to GPT-5.1 for improved quality
  dalle_prompt_generation: "gpt-5.1", // GPT-5.1 for superior prompt generation
  sora_prompt_generation: "gpt-5.1", // GPT-5.1 for enhanced video prompts
  scene_duration_estimation: "gpt-5.1", // GPT-5.1 for accurate timing estimation
  image_generation: "gpt-image-1", // Keep gpt-image-1 for now, ready for rollback
  
  // Other settings
  image_size: "auto" as "1024x1024" | "1024x1536" | "1536x1024" | "1792x1024" | "1024x1792" | "auto",
  image_quality: "medium" as "standard" | "hd" | "low" | "medium" | "high" | "auto", // Set to medium for quality/cost balance
  image_style: "vivid" as "vivid" | "natural", // Only used for legacy image models
};

// Helper function to determine temperature for models
export function getTemperatureForModel(model: string): number {
  // GPT-5 and GPT-5.1 only support temperature (1.0)
  if (model === "gpt-5" || model === "gpt-5.1") {
    return 1.0;
  }
  // Default temperature for other models
  return 0.7;
}

// Loaded configuration (can be modified at runtime)
export let modelConfig = { ...defaultModelConfig };

// Import storage to access persistent configuration
import { storage } from "./storage";

// Function to load configuration from database
export async function loadModelConfigFromDB(): Promise<typeof modelConfig> {
  try {
    const storedConfig = await storage.getGlobalConfig('model_config');
    if (storedConfig && storedConfig.value) {
      // Merge stored config with defaults to ensure all properties exist
      modelConfig = { ...defaultModelConfig, ...storedConfig.value };
      console.log('Loaded model configuration from database:', JSON.stringify(modelConfig));
    } else {
      console.log('No stored configuration found, using defaults');
      modelConfig = { ...defaultModelConfig };
    }
  } catch (error) {
    console.error('Failed to load configuration from database:', error);
    modelConfig = { ...defaultModelConfig };
  }
  return modelConfig;
}

// Function to update configuration - ensures persistence
export async function updateModelConfig(newConfig: Partial<typeof modelConfig>): Promise<typeof modelConfig> {
  // Only update the specific properties that are provided
  modelConfig = { ...modelConfig, ...newConfig };
  
  try {
    // Persist to database
    await storage.setGlobalConfig('model_config', modelConfig);
    console.log('Model configuration updated and persisted:', JSON.stringify(modelConfig));
  } catch (error) {
    console.error('Failed to persist configuration to database:', error);
  }
  
  return modelConfig;
}

// Function to reset configuration to defaults
export async function resetModelConfig(): Promise<typeof modelConfig> {
  modelConfig = { ...defaultModelConfig };
  
  try {
    // Persist reset to database
    await storage.setGlobalConfig('model_config', modelConfig);
    console.log('Model configuration reset to defaults and persisted');
  } catch (error) {
    console.error('Failed to persist reset configuration to database:', error);
  }
  
  return modelConfig;
}

// Function to get current configuration
export function getModelConfig(): typeof modelConfig {
  return { ...modelConfig };
}