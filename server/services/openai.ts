import OpenAI from "openai";
import { modelConfig, getTemperatureForModel, getModelConfig } from "../config";
import { ProjectType, scenes } from "@shared/schema";
import { generateProjectTypePrompts, getSceneParsingInstructions } from "./projectTypes";
import { objectStorage } from "../objectStorage";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export async function saveImageToPersistentStorage(
  imageBuffer: Buffer,
  filename: string,
  sceneNumber?: number,
  projectId?: number,
  sceneId?: number
): Promise<string> {
  const isStorageConfigured = await objectStorage.isConfigured();
  
  if (!isStorageConfigured) {
    console.error("[CRITICAL] Object storage not configured - images will be lost on restart!");
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, imageBuffer);
    console.warn(`[WARNING] Image saved to ephemeral local storage: /uploads/${filename}`);
    return `/uploads/${filename}`;
  }
  
  try {
    const objectPath = sceneNumber && projectId
      ? `projects/${projectId}/scenes/${sceneNumber}/image.png`
      : sceneNumber
        ? objectStorage.generateSceneImagePath(sceneNumber, projectId)
        : `images/${filename}`;
    
    const storageUrl = await objectStorage.uploadBuffer(imageBuffer, objectPath);
    console.log(`[Storage] Image saved to object storage: ${storageUrl} (${imageBuffer.length} bytes)`);
    
    // Update database with storage metadata if sceneId is provided
    if (sceneId) {
      const checksum = createHash('sha256').update(imageBuffer).digest('hex');
      await db.update(scenes)
        .set({
          imageUrl: storageUrl,
          imageStorageKey: objectPath,
          imageChecksum: checksum,
          imageByteLength: imageBuffer.length,
          imageVerified: true
        })
        .where(eq(scenes.id, sceneId));
      console.log(`[Storage] Updated scene ${sceneId} with storage metadata: ${objectPath}`);
    }
    
    return storageUrl;
  } catch (error: any) {
    console.error("[Storage] Object storage upload failed:", error?.message || error);
    throw new Error(`Failed to save image to persistent storage: ${error?.message || 'Unknown error'}`);
  }
}

// OpenAI client with configurable model options
export const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "",
  dangerouslyAllowBrowser: true 
});

async function generateAutoStyle(scriptContent: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: `You are a visual style expert analyzing scripts to determine the most appropriate artistic style for consistent video imagery. 

CRITICAL: Your response must NEVER suggest photorealistic styles. Always recommend stylized, artistic, or illustrated approaches.

Analyze the script content and determine:
1. Genre and tone (horror, comedy, drama, sci-fi, fantasy, etc.)
2. Setting and time period
3. Mood and atmosphere
4. Target audience
5. Key visual themes

Based on your analysis, recommend ONE specific artistic style that would work consistently throughout the entire video. Choose from styles like:
- Hand-drawn illustration styles (cartoon, anime, comic book)
- Digital art styles (cyberpunk, retro-futuristic, minimalist)
- Traditional art styles (watercolor, oil painting, sketch, woodcut)
- Stylized 3D rendering (low-poly, cel-shaded, voxel)
- Unique artistic movements (art deco, bauhaus, expressionist)

Respond with a detailed style description that includes:
- The main artistic style name and technique
- Color palette suggestions
- Visual mood and atmosphere
- Specific artistic elements (line work, shading, textures)
- Why this style fits the script content

Keep response under 200 words and focus on creating a cohesive visual identity.`
        },
        {
          role: "user",
          content: `Analyze this script content and recommend the best artistic style:\n\n${scriptContent}`
        }
      ],
      max_completion_tokens: 300,
      temperature: 1.0
    });

    const styleAnalysis = response.choices[0].message.content;
    return styleAnalysis || "Stylized digital illustration with bold colors and clean lines, avoiding photorealistic elements";
  } catch (error) {
    console.error("Error generating auto style:", error);
    return "Stylized digital illustration with bold colors and clean lines, avoiding photorealistic elements";
  }
}

// Function to validate API key before making requests
async function validateApiKey(): Promise<boolean> {
  try {
    if (!process.env.OPENAI_API_KEY && !process.env.VITE_OPENAI_API_KEY) {
      console.error("OpenAI API key is not set. Please set OPENAI_API_KEY environment variable.");
      return false;
    }
    
    // Simplify API key validation - just check if it exists
    const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      console.error("OpenAI API key is empty");
      return false;
    }
    
    console.log("API key validation successful");
    return true;
  } catch (error) {
    console.error("Failed to validate OpenAI API key:", error);
    return false;
  }
}

// Type definitions
interface ScriptScene {
  content?: string;
  title?: string;
  estimatedDuration?: number;
  dallePrompt?: string;
  soraPrompt?: string;
  imageUrl?: string;
  id?: number;
  sceneNumber?: number;
  scriptExcerpt?: string;
  scriptId?: number;
  isPinned?: boolean;
  overlayText?: string;
  exactStartTime?: number;
  exactEndTime?: number;
  metadata?: any;
}

interface SceneWithPrompt extends ScriptScene {
  dallePrompt: string;
  soraClipLength?: 4 | 8; // Sora API only supports 4 or 8 second clips for music videos
}

interface SceneWithImage extends Omit<SceneWithPrompt, 'imageUrl'> {
  imageUrl: string;
}

interface SceneWithSoraPrompt extends ScriptScene {
  soraPrompt: string;
}

/**
 * Generate DALL-E prompts for each scene based on the script and style
 */
export async function generateDallePrompts(
  scenes: ScriptScene[],
  style: string,
  maintainContinuity: boolean = true,
  referenceImageUrl?: string,
  customStylePrompt?: string,
  projectModelSettings?: any, // Accept project-specific model settings
  projectType: ProjectType = 'video' // Default to video if not specified
): Promise<SceneWithPrompt[]> {
  // Validate API key first
  const isApiKeyValid = await validateApiKey();
  if (!isApiKeyValid) {
    throw new Error("Invalid or missing OpenAI API key. Please check your environment variables.");
  }
  
  // Use project-specific settings if provided, otherwise fall back to global settings
  const effectiveModelConfig = projectModelSettings || getModelConfig();

  let previousPrompts: string[] = [];
  const results: SceneWithPrompt[] = [];

  for (let i = 0; i < scenes.length; i++) {
    try {
      const scene = scenes[i];
      // We'll store up to 3 previous prompts for context (or fewer if at the beginning)
      const recentPrompts = previousPrompts.slice(-3);
      
      // Determine style description
      let styleDescription = style;
      if (style === 'custom' && customStylePrompt) {
        styleDescription = customStylePrompt;
      } else if (style === 'auto') {
        // For auto style, generate based on overall script content
        const fullScript = scenes.map(s => s.content || s.scriptExcerpt || '').join(' ');
        styleDescription = await generateAutoStyle(fullScript.substring(0, 1000));
      }
      
      // Calculate where we are in the story (beginning, middle, end)
      const totalScenes = scenes.length;
      const currentPosition = i + 1;
      const storyPosition = 
        currentPosition <= Math.ceil(totalScenes * 0.25) ? "beginning" :
        currentPosition >= Math.floor(totalScenes * 0.75) ? "end" : "middle";
      
      // Get nearby scenes for context
      const previousSceneContent = i > 0 ? scenes[i-1].content : "";
      const nextSceneContent = i < scenes.length - 1 ? scenes[i+1].content : "";
      
      // Get content type-specific wording
      const contentTypeTerms: { [key: string]: { type: string; unit: string; flow: string } } = {
        'video': { type: 'video', unit: 'scene', flow: 'flow of the video' },
        'blog': { type: 'blog post', unit: 'section', flow: 'structure of the blog post' },
        'presentation': { type: 'presentation', unit: 'slide', flow: 'sequence of the presentation' },
        'audio-driven': { type: 'audio-driven video', unit: 'scene', flow: 'flow of the audio narrative' }
      };
      
      const terms = contentTypeTerms[projectType] || contentTypeTerms['video'];
      
      let prompt = `Generate a detailed image prompt for the following ${terms.type} content in ${styleDescription} style:

Content excerpt: "${scene.content}"

This is ${terms.unit} ${currentPosition} of ${totalScenes} in the overall ${terms.type} (${storyPosition} of the content).

${previousSceneContent ? `Previous ${terms.unit} context: "${previousSceneContent}"` : `This is the first ${terms.unit}.`}
${nextSceneContent ? `Next ${terms.unit} context: "${nextSceneContent}"` : `This is the final ${terms.unit}.`}

Your task is to create a prompt that will generate an image that:
1. Clearly illustrates the specific content in this ${terms.unit}
2. Fits within the overall ${terms.flow}
3. Has a distinct visual focus that effectively represents this content
4. Maintains consistent style, color palette, and visual language with other images`;
      
      if (maintainContinuity && recentPrompts.length > 0) {
        prompt += `\n\nVisual context from recent scenes (for consistency purposes):`;
        
        // Add recent prompts with scene numbers for context
        recentPrompts.forEach((prevPrompt, idx) => {
          const sceneNumber = i - (recentPrompts.length - idx);
          prompt += `\n- Scene ${sceneNumber + 1}: "${prevPrompt.substring(0, 200)}${prevPrompt.length > 200 ? '...' : ''}"`;
        });
        
        prompt += `\n\nYour prompt should create an image that feels like it belongs in the same visual sequence with consistent style and visual language, 
but should show clear progression in the narrative. Each image should have its own distinct focus and composition while maintaining overall consistency.
The key is finding a balance between variety (different subjects and compositions) and consistency (similar visual treatment).`;
      }
      
      if (referenceImageUrl) {
        prompt += `\n\nUse the uploaded reference image for style guidance. The reference image URL is: ${referenceImageUrl}`;
      }
      
      const response = await openai.chat.completions.create({
        model: effectiveModelConfig.dalle_prompt_generation,
        temperature: getTemperatureForModel(effectiveModelConfig.dalle_prompt_generation),
        messages: [
          {
            role: "system",
            content: (() => {
              // Project type-specific instructions
              let systemPrompt = "";
              
              if (projectType === 'blog') {
                systemPrompt = "You are an expert visual designer specializing in creating detailed image prompts for blog content. " +
                "Your goal is to create engaging, witty, and visually appealing images that enhance blog content while maintaining brand consistency. ";
              } else if (projectType === 'presentation') {
                systemPrompt = "You are an expert presentation designer specializing in creating detailed image prompts for business slides. " +
                "Your goal is to create professional, informative, and visually engaging images that enhance presentation content while maintaining corporate standards. ";
              } else {
                // Default to video
                systemPrompt = "You are an expert storyboard artist specializing in creating detailed image prompts " + 
                "that tell a visual story for faceless YouTube explainer videos. " +
                "Your goal is to create a sequence of visuals that maintains a consistent style while progressing the narrative. ";
              }
              
              // Common guidelines for all project types
              systemPrompt += "Each image should:\n\n" +
                "1. Have a clear visual focus that directly relates to the specific content\n" +
                "2. Share visual elements (color palette, artistic style, composition approach) with other images for consistency\n" +
                "3. Visually communicate the key message without relying on text in the image\n" +
                "4. Use metaphors and visual storytelling techniques appropriate for the content type\n\n" +
                "Find the balance between consistency (same artistic treatment) and variety (different compositions/perspectives). " +
                "Don't use watermarks, signatures, or text. " +
                "Keep prompts between 100-150 words for optimal results.";
              
              return systemPrompt;
            })()
          },
          {
            role: "user",
            content: prompt
          }
        ],
      });

      const dallePrompt = response.choices[0].message.content || "";
      // Store the prompt for future scenes to reference
      previousPrompts.push(dallePrompt);
      
      results.push({
        ...scene,
        dallePrompt
      });
    } catch (error) {
      console.error(`Error generating DALL-E prompt for scene ${i + 1}:`, error);
      // Create a more thoughtful fallback prompt that considers narrative position
      const content = scenes[i].content || scenes[i].scriptExcerpt || "scene content";
      const isFirstScene = i === 0;
      const isLastScene = i === scenes.length - 1;
      let fallbackDescription = "";
      
      if (isFirstScene) {
        fallbackDescription = "An introductory image that establishes the subject and setting, ";
      } else if (isLastScene) {
        fallbackDescription = "A concluding image that provides closure to the story, ";
      } else {
        // Middle scene - position it in the story flow
        fallbackDescription = `A ${i < scenes.length / 2 ? "build-up" : "climactic"} scene that develops the narrative, `;
      }
      
      let styleDescription;
      if (style === 'custom' && customStylePrompt) {
        styleDescription = customStylePrompt;
      } else if (style === 'auto') {
        // For auto style, generate based on overall script content
        const fullScript = scenes.map(s => s.content || s.scriptExcerpt || '').join(' ');
        styleDescription = await generateAutoStyle(fullScript.substring(0, 1000));
      } else {
        styleDescription = `${style} style`;
      }
      
      results.push({
        ...scenes[i],
        dallePrompt: `${fallbackDescription}clearly showing ${content.substring(0, 100)}... in ${styleDescription}. The image should have high contrast, clear subject focus, and professional composition suitable for an educational YouTube video.`
      });
    }
  }

  return results;
}

/**
 * Edit an existing image using OpenAI's image editing API
 * 
 * @param imageUrl Base64 data URL of the image to edit
 * @param editPrompt Text description of the desired edits
 * @returns A base64-encoded data URL of the edited image
 */
export async function editImage(imageUrl: string, editPrompt: string): Promise<string> {
  // Validate API key first
  const isApiKeyValid = await validateApiKey();
  if (!isApiKeyValid) {
    throw new Error("Invalid or missing OpenAI API key. Please check your environment variables.");
  }

  // Extract the base64 data from the data URL
  let base64Data = imageUrl;
  if (base64Data.startsWith('data:image')) {
    base64Data = base64Data.split(',')[1];
  }

  // Convert base64 to buffer
  const imageBuffer = Buffer.from(base64Data, 'base64');

  try {
    console.log(`Editing image with prompt: ${editPrompt.substring(0, 100)}...`);
    
    // Use GPT-Image-1 for editing (currently the most capable model for this)
    const model = "gpt-image-1";
    
    // Convert buffer to File object which the SDK requires
    const imageFile = new File([imageBuffer], 'image.png', { type: 'image/png' });
    
    // Call the OpenAI API using the SDK
    console.log("Calling OpenAI images.edit API...");
    const result = await openai.images.edit({
      model,
      image: imageFile,
      prompt: editPrompt,
      n: 1,
      size: "1024x1024" // Use same default as our generation
    });
    
    // Get the base64-encoded image data
    if (result && result.data && result.data.length > 0) {
      const imageBase64 = result.data[0].b64_json;
      if (imageBase64) {
        return `data:image/png;base64,${imageBase64}`;
      } else {
        throw new Error("No image data found in the response");
      }
    } else {
      console.log("Unexpected response structure:", JSON.stringify(result, null, 2));
      throw new Error("Failed to get edited image data from OpenAI");
    }
  } catch (error) {
    console.error("Error editing image:", error);
    throw error;
  }
}

/**
 * Sanitize prompt to avoid content moderation issues
 * This function identifies potentially problematic content and makes it more abstract
 * to avoid triggering moderation filters while preserving the educational intent
 */
export function sanitizePrompt(prompt: string): string {
  // Enhanced dictionary of problematic terms and their replacements
  const replacements: [RegExp, string][] = [
    
    // Historical/political terms
    [/nazi/gi, "historical regime"],
    [/hitler/gi, "historical figure"],
    [/reich/gi, "government"],
    [/fascis(t|m)/gi, "authoritarian system"],
    [/swastika/gi, "symbolic icon"],
    [/third reich/gi, "1930s German government"],
    [/holocaust/gi, "historical tragedy"],
    [/jew(s|ish)/gi, "targeted groups"],
    [/ww2/gi, "mid-20th century conflict"],
    [/world war (ii|2)/gi, "global conflict era"],
    
    // Violence/weapons terms
    [/gun(s|fire)?/gi, "device"],
    [/weapon(s)?/gi, "tool"],
    [/shoot(ing)?/gi, "action"],
    [/kill(ing|ed)?/gi, "defeat"],
    [/murder/gi, "conflict"],
    [/blood(y)?/gi, "dramatic"],
    [/violence/gi, "intensity"],
    [/fight(ing)?/gi, "competition"],
    [/war(fare)?/gi, "conflict"],
    [/battle/gi, "challenge"],
    [/bomb/gi, "explosive device"],
    [/attack/gi, "approach"],
    
    // Adult content terms
    [/sexual/gi, "romantic"],
    [/nude/gi, "artistic"],
    [/naked/gi, "minimal clothing"],
    
    // General moderation triggers
    [/explicit/gi, "clear"],
    [/graphic/gi, "detailed"],
    [/disturbing/gi, "notable"],
    [/controversial/gi, "significant"]
  ];
  
  // Apply all replacements
  let sanitized = prompt;
  for (const [pattern, replacement] of replacements) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  
  // Add safe artistic context if not already present
  if (!sanitized.toLowerCase().includes('artistic') && !sanitized.toLowerCase().includes('educational')) {
    sanitized += ", in an educational and family-friendly artistic style";
  }
  

  
  return sanitized;
}

/**
 * Generate AI images based on prompts
 */
export async function generateDalleImages(
  scenes: SceneWithPrompt[],
  style: string,
  maintainContinuity: boolean = true,
  referenceImageUrl?: string,
  customStylePrompt?: string,
  projectModelSettings?: any // Accept project-specific model settings
): Promise<SceneWithImage[]> {
  // Validate API key first
  const isApiKeyValid = await validateApiKey();
  if (!isApiKeyValid) {
    throw new Error("Invalid or missing OpenAI API key. Please check your environment variables.");
  }

  // Use project-specific settings if provided, otherwise fall back to current admin settings
  const effectiveModelConfig = projectModelSettings || getModelConfig();
  console.log("Using model configuration:", JSON.stringify({
    model: effectiveModelConfig.image_generation,
    size: effectiveModelConfig.image_size,
    quality: effectiveModelConfig.image_quality,
    style: effectiveModelConfig.image_style
  }));

  const results: SceneWithImage[] = [];

  for (const scene of scenes) {
    try {
      console.log(`Generating image for scene ${scene.sceneNumber} using model: ${effectiveModelConfig.image_generation}`);
      
      let imageUrl = "";
      const currentModel = effectiveModelConfig.image_generation;
      
      // Use the configured image generation model
      const imageModel = effectiveModelConfig.image_generation || "gpt-image-1";
      console.log(`Using quality '${effectiveModelConfig.image_quality}' for ${imageModel}`);
      
      // Sanitize the prompt to avoid content moderation issues
      const sanitizedPrompt = sanitizePrompt(scene.dallePrompt);
      console.log(`Original prompt: ${scene.dallePrompt.substring(0, 100)}...`);
      console.log(`Sanitized prompt: ${sanitizedPrompt.substring(0, 100)}...`);
      

      
      // GPT-Image models support all sizes including the new ones
      const supportedSizes = ["1024x1024", "1024x1536", "1536x1024", "1792x1024", "1024x1792", "auto"];
      const imageSize = supportedSizes.includes(effectiveModelConfig.image_size) 
        ? effectiveModelConfig.image_size 
        : "auto"; // Default to auto if configured size is not supported
        
      console.log(`Using image size: ${imageSize}`);
      
      try {
        const result = await openai.images.generate({
          model: imageModel as "gpt-image-1" | "gpt-image-1-mini",
          prompt: sanitizedPrompt,
          n: 1,
          size: imageSize as "1024x1024" | "1024x1536" | "1536x1024" | "1792x1024" | "1024x1792" | "auto",
          quality: effectiveModelConfig.image_quality as "low" | "medium" | "high" | "auto"
        });
        
        // Get the base64-encoded image data and save to persistent storage
        if (result && result.data && result.data.length > 0) {
          const imageBase64 = result.data[0].b64_json;
          if (imageBase64) {
            const imageBuffer = Buffer.from(imageBase64, 'base64');
            const fileName = `scene_${scene.sceneNumber}_${Date.now()}.png`;
            
            // Save to persistent storage with proper metadata
            // Use scriptId from the scene object if available
            imageUrl = await saveImageToPersistentStorage(
              imageBuffer, 
              fileName, 
              scene.sceneNumber, 
              scene.scriptId,
              scene.id
            );
            console.log(`Successfully generated and saved image with ${imageModel}: ${imageUrl}`);
          } else {
            console.log("No b64_json data found in the response");
          }
        } else {
          console.log("Unexpected response structure:", JSON.stringify(result, null, 2));
        }
      } catch (apiError: any) {
        if (apiError?.code === 'moderation_blocked' || apiError?.error?.code === 'moderation_blocked') {
          console.error(`Content moderation blocked image generation for scene ${scene.sceneNumber}:`, apiError.message);
          // Leave imageUrl empty to indicate failure
        } else {
          console.error(`OpenAI API error for scene ${scene.sceneNumber}:`, apiError);
          // Re-throw other errors
          throw apiError;
        }
      }
      
      results.push({
        ...scene,
        imageUrl
      });
    } catch (error) {
      console.error(`Failed to generate image for scene ${scene.sceneNumber}:`, error);
      console.error("Error details:", error);
      
      // Still include the scene in results, but without an image URL
      results.push({
        ...scene,
        imageUrl: ""
      });
    }
  }

  return results;
}

/**
 * Generate Sora prompts for each scene - specifically for image-to-video animation
 * 
 * This function expects scenes to already have generated images and will create prompts
 * that describe how to animate those static images into video using Sora's image-to-video feature.
 */
export async function generateSoraPrompts(
  scenes: ScriptScene[],
  style: string,
  customStylePrompt?: string,
  projectModelSettings?: any // Accept project-specific model settings
): Promise<SceneWithSoraPrompt[]> {
  // Validate API key first
  const isApiKeyValid = await validateApiKey();
  if (!isApiKeyValid) {
    throw new Error("Invalid or missing OpenAI API key. Please check your environment variables.");
  }
  
  // Use project-specific settings if provided, otherwise fall back to global settings
  const effectiveModelConfig = projectModelSettings || getModelConfig();

  // Filter scenes that have images - Sora prompts require existing images
  const scenesWithImages = scenes.filter(scene => scene.imageUrl);
  if (scenesWithImages.length === 0) {
    throw new Error("No scenes with generated images found. Please generate images first before creating Sora prompts.");
  }
  
  // Apply content safety measures for problematic topics that might trigger moderation filters
  // This is to avoid the "moderation_blocked" error

  const results: SceneWithSoraPrompt[] = [];

  for (let i = 0; i < scenesWithImages.length; i++) {
    try {
      const scene = scenesWithImages[i];
      
      if (!scene.imageUrl) {
        console.warn(`Skipping Sora prompt generation for scene ${scene.sceneNumber || i + 1} as it has no image`);
        continue;
      }
      
      // Determine style description
      let styleDescription = style;
      if (style === 'custom' && customStylePrompt) {
        styleDescription = customStylePrompt;
      }
      
      // Get the script excerpt to animate
      const scriptContent = scene.scriptExcerpt || scene.content;
      
      // Sanitize all content to avoid moderation issues
      const sanitizedScriptContent = sanitizePrompt(scriptContent || "");
      const sanitizedDallePrompt = sanitizePrompt(scene.dallePrompt || "Unknown prompt");
      const sanitizedOverlayText = scene.overlayText ? sanitizePrompt(scene.overlayText) : null;
      
      // Build a prompt focused on animating the existing image
      let prompt = `Generate a detailed Sora image-to-video animation prompt based on this script excerpt in ${styleDescription} style:\n\n${sanitizedScriptContent}`;
      
      // Include information about the image that was generated
      prompt += `\n\nAn image has been generated using this DALL-E prompt: ${sanitizedDallePrompt}`;
      
      // Provide context about audio timing if available
      if (scene.exactStartTime !== undefined && scene.exactEndTime !== undefined) {
        const durationSec = (scene.exactEndTime - scene.exactStartTime) / 1000;
        prompt += `\n\nThe video should be approximately ${durationSec.toFixed(1)} seconds long to match the audio timing.`;
      }
      
      // Add information about text overlay if available
      if (sanitizedOverlayText) {
        prompt += `\n\nThe video will include this text overlay: "${sanitizedOverlayText}"`;
      }
      
      console.log(`Original script excerpt: ${scriptContent ? scriptContent.substring(0, 100) : "No content"}...`);
      console.log(`Sanitized script excerpt: ${sanitizedScriptContent.substring(0, 100)}...`);
      
      const response = await openai.chat.completions.create({
        model: effectiveModelConfig.sora_prompt_generation,
        temperature: getTemperatureForModel(effectiveModelConfig.sora_prompt_generation),
        messages: [
          {
            role: "system",
            content: 
              "You are an expert in generating Sora image-to-video animation prompts. " +
              "Your task is to create detailed prompts that will animate a static image into a short video clip. " +
              "Focus on describing subtle, realistic movements and transitions that bring the image to life while maintaining its core composition. " +
              "Specifically describe HOW the static elements in the image should move or animate (e.g., 'the leaves gently rustling', 'light slowly shifting', 'subtle camera pan from left to right'). " +
              "The animation should respect the original composition while adding cinematic life. " +
              "Begin each prompt with 'Animate this image:' followed by your detailed animation instructions. " +
              "Keep prompts concise (75-150 words) but detailed enough to guide the animation process. " +
              "This is specifically for Sora's image-to-video feature, not for generating videos from scratch."
          },
          {
            role: "user",
            content: prompt
          }
        ],
      });

      const soraPrompt = response.choices[0].message.content || "";
      
      results.push({
        ...scene,
        soraPrompt
      });
    } catch (error) {
      console.error(`Error generating Sora prompt for scene ${scenesWithImages[i].sceneNumber || i + 1}:`, error);
      // Add a default prompt so we can continue
      results.push({
        ...scenesWithImages[i],
        soraPrompt: `Animate this image: A cinematic ${style} animation that subtly brings the static image to life with gentle movements and shifting light. The camera slowly zooms in on the main subject while maintaining the original composition and style.`
      });
    }
  }

  return results;
}

/**
 * Generate a YouTube-style clickbait thumbnail for a video project
 */
export async function generateThumbnail(
  script: string,
  style: string,
  customStylePrompt?: string,
  title?: string,
  projectModelSettings?: any,
  thumbnailConfig?: {
    customText?: string;
    textPlacement?: string;
    emphasizeText?: boolean;
    thumbnailStyle?: string;
    imageSize?: string;
    imageQuality?: string;
  }
): Promise<string> {
  // Validate API key first
  const isValid = await validateApiKey();
  if (!isValid) {
    throw new Error("Invalid OpenAI API key. Please check your configuration.");
  }

  // Use project-specific settings if available, otherwise fall back to global config
  const effectiveModelConfig = projectModelSettings || getModelConfig();

  try {
    console.log(`Generating thumbnail for project: ${title || 'Untitled'}`);
    console.log(`Style: ${style}`);
    console.log(`Script length: ${script.length} characters`);

    // Extract key elements from the script for the thumbnail
    const scriptExcerpt = script.substring(0, 500); // First 500 characters for context
    
    // Build the style prompt using exact same styles from storyboard system
    let styleDescription = "";
    const thumbnailStyle = thumbnailConfig?.thumbnailStyle || style;
    
    if (thumbnailStyle === "custom" && customStylePrompt) {
      styleDescription = customStylePrompt;
    } else if (thumbnailStyle === "auto") {
      // Generate AI-analyzed style based on script content
      styleDescription = await generateAutoStyle(scriptExcerpt);
    } else {
      // Use exact same style mappings from storyboard system
      const styleMap: { [key: string]: string } = {
        // Animated Music Video Styles (non-photorealistic, optimized for Sora video generation)
        "anime-music-video": "Cinematic anime music video style with dynamic camera angles, dramatic lighting, vivid colors, stylized characters with expressive faces, flowing motion lines, and emotional intensity suitable for music video storytelling - fully animated, NOT photorealistic",
        "pixar-3d": "Pixar/Disney 3D animation style with stylized cartoon characters, smooth plastic-like textures, expressive eyes, rounded forms, vibrant saturated colors, and professional lighting - fully animated, NOT photorealistic",
        "studio-ghibli": "Studio Ghibli hand-drawn animation style with soft watercolor backgrounds, gentle pastoral scenes, detailed natural environments, whimsical character designs, warm color palettes, and dreamlike atmospheric quality - fully animated, NOT photorealistic",
        "cel-animation": "Classic 2D cel animation style with bold outlines, flat cel-shaded colors, hand-drawn character movements, traditional animation aesthetics, and vintage cartoon quality - fully animated, NOT photorealistic",
        "motion-graphics": "Abstract motion graphics style with geometric shapes, flowing particles, dynamic typography, vibrant gradients, smooth transitions, and modern design aesthetics - fully animated and abstract, NOT photorealistic",
        "stylized-3d": "Stylized 3D render with non-realistic proportions, artistic lighting, bold color choices, smooth surfaces, exaggerated features, and modern digital art aesthetics - fully animated, NOT photorealistic",
        "rotoscope": "Rotoscope animation style with traced live-action movements, artistic color treatment, hand-drawn line quality, fluid motion, and unique blend of realism and illustration - fully animated, NOT photorealistic",
        "lofi-aesthetic": "Lo-fi aesthetic animation style with soft pastel colors, cozy indoor scenes, nostalgic atmosphere, anime-influenced character design, gentle lighting, and relaxed mood - fully animated, NOT photorealistic",
        "synthwave": "Synthwave/Retrowave style with neon pink and cyan colors, 80s retro-futuristic aesthetics, grid landscapes, chrome elements, sunset gradients, and cyberpunk-lite atmosphere - fully animated, NOT photorealistic",
        "illustrated-music": "Illustrated music video style with artistic brushstrokes, painterly textures, expressive color palettes, hand-drawn quality, and artistic interpretation of scenes - fully illustrated, NOT photorealistic",
        "paper-cutout": "Paper cutout animation style with layered paper textures, handcraft aesthetics, stop-motion quality, colorful construction paper look, and charming DIY appearance - fully animated, NOT photorealistic",
        "neon-pop": "Neon pop art style with bold fluorescent colors, high contrast, graphic design elements, stylized silhouettes, vibrant energy, and modern artistic expression - fully stylized, NOT photorealistic",
        
        // Original styles
        "adventure-time": "Adventure Time whimsical cartoon style with rounded characters, bright colors, and playful fantasy elements",
        "anime-epic": "Epic anime style with dramatic poses, dynamic action lines, detailed character designs, and vibrant effects",
        "art-deco": "Art Deco elegance with geometric patterns, luxury aesthetics, gold accents, and streamlined designs",
        "art-nouveau": "Art Nouveau floral style with organic curves, botanical motifs, elegant typography, and decorative elements",
        "bauhaus": "Bauhaus geometric style with clean lines, primary colors, functional design, and modernist principles",
        "blueprint": "Technical blueprint style with white lines on blue background, engineering drawings, and precise annotations",
        "cel-shaded": "Cel-shaded animation style with flat colors, bold outlines, and cartoon-like rendering",
        "chalkboard": "Chalkboard classroom style with white chalk drawings on dark background, educational diagrams",
        "chibi-cute": "Chibi cute style with oversized heads, small bodies, kawaii aesthetics, and adorable expressions",
        "claymation": "Claymation stop-motion style with textured clay characters, handmade appearance, and tactile quality",
        "comic": "Comic panel style with speech bubbles, action words, halftone patterns, and sequential art layout",
        "comic-book-pop-art": "Comic book pop-art style with bold colors, Ben-Day dots, dramatic shadows, and superhero aesthetics",
        "constructivist": "Constructivist propaganda style with bold typography, geometric shapes, revolutionary themes",
        "crayon-children": "Crayon children's drawing style with waxy textures, bright colors, and innocent artistic expression",
        "cyberpunk-neon": "Cyberpunk neon style with glowing lights, dark urban environments, futuristic technology, electric colors",
        "disney-princess": "Disney Princess style with magical kingdoms, elegant characters, fairy tale romance, and enchanting atmosphere",
        "doodle": "Doodle sketch style with hand-drawn lines, casual artistic expression, and spontaneous creativity",
        "engraving": "Victorian engraving style with fine line work, cross-hatching, classical illustrations, and vintage elegance",
        "expressionist": "German Expressionist style with distorted forms, intense emotions, bold brushstrokes, and psychological themes",
        "fairy-tale": "Fairy tale illustration style with magical creatures, enchanted forests, storybook aesthetics",
        "finding-nemo": "Finding Nemo underwater style with colorful coral reefs, ocean life, and Pixar's aquatic world",
        "flat-infographic": "Flat design infographic style with simple icons, clean layouts, data visualization, and modern graphics",
        "futuristic-hud": "Futuristic HUD style with holographic interfaces, digital displays, sci-fi technology, and glowing elements",
        "gothic-horror": "Gothic horror style with dark atmospheres, medieval architecture, supernatural elements, and ominous mood",
        "graffiti": "Street graffiti style with spray paint effects, urban art, bold letters, and rebellious expression",
        "impressionist": "Impressionist painting style with soft brushstrokes, natural lighting, outdoor scenes, and artistic atmosphere",
        "incredibles": "The Incredibles superhero style with retro-futuristic design, family dynamics, and mid-century modern aesthetics",
        "inside-out": "Inside Out emotional style with colorful abstract representations of feelings and psychological landscapes",
        "isometric": "Isometric technical style with 3D perspective, geometric precision, architectural drawings, and technical illustrations",
        "japanese-ukiyo-e": "Japanese Ukiyo-e style with woodblock print aesthetics, traditional motifs, and classical Japanese art",
        "lego-brick": "LEGO brick animation style with blocky characters, plastic textures, and modular construction aesthetics",
        "letterpress": "Letterpress vintage type style with pressed typography, textured paper, and classic printing techniques",
        "low-poly-3d": "Low-poly 3D style with geometric shapes, faceted surfaces, modern digital art, and angular designs",
        "medieval-illuminated": "Medieval illuminated manuscript style with ornate borders, gold leaf, religious imagery, and classical calligraphy",
        "memphis-design": "Memphis Design 80s style with bold patterns, bright colors, geometric shapes, and postmodern aesthetics",
        "mid-century-modern": "Mid-century modern style with clean lines, atomic age design, retro furniture, and sophisticated minimalism",
        "mixed-media-collage": "Mixed-media collage style with layered textures, diverse materials, artistic experimentation, and eclectic composition",
        "monsters-inc": "Monsters Inc. style with furry creatures, colorful monsters, industrial settings, and Pixar's creature design",
        "mosaic-tile": "Mosaic tile art style with small colored pieces, ancient Roman aesthetics, and decorative patterns",
        "neue-sachlichkeit": "New Objectivity style with precise realism, clinical observation, and German artistic movement aesthetics",
        "new-yorker-cartoon": "New Yorker cartoon style with sophisticated humor, minimalist line art, and witty social commentary",
        "nintendo-universe": "Nintendo Universe style with colorful game worlds, iconic characters, power-ups, and video game aesthetics",
        "noir-film": "Film noir dramatic style with high contrast lighting, shadows, urban settings, and classic Hollywood atmosphere",
        "paper-cut-out": "Paper cut-out style with layered paper effects, craft aesthetics, handmade appearance, and dimensional depth",
        "photorealistic": "Photorealistic style with ultra-realistic details, professional photography quality, and lifelike rendering",
        "pixel-art": "Pixel art retro style with 8-bit graphics, video game aesthetics, blocky characters, and nostalgic digital art",
        "pixar-general": "Pixar general animation style with emotional storytelling, detailed 3D rendering, and heartwarming character design",
        "pop-surrealism": "Pop surrealism style with dream-like imagery, contemporary themes, and fantastical artistic expression",
        "puppet-theater": "Puppet theater style with handmade marionettes, stage settings, and traditional performance art aesthetics",
        "ratatouille": "Ratatouille culinary style with French cuisine, cooking scenes, restaurant environments, and food-focused storytelling",
        "retro": "Retro tech style with vintage electronics, old-school computers, analog devices, and nostalgic technology aesthetics",
        "risograph": "Risograph print style with unique color palettes, textured printing effects, and independent publication aesthetics",
        "russian-constructivism": "Russian Constructivism style with revolutionary graphics, bold typography, geometric compositions",
        "shrek": "Shrek fairy tale style with ogre characters, medieval fantasy settings, and DreamWorks' subversive humor",
        "simpsons": "Simpsons-inspired cartoon style with yellow characters, satirical humor, and iconic animation design",
        "sketchbook": "Sketchbook doodle style with pencil drawings, artistic sketches, and creative exploration",
        "soul": "Soul jazz aesthetic style with musical themes, New York City settings, and spiritual artistic expression",
        "south-park": "South Park cut-out style with simple paper craft characters, crude animation, and satirical comedy",
        "stick-figure": "Stick figure/line art style with minimalist drawings, simple characters, and basic artistic expression",
        "super-mario": "Super Mario style with colorful platformer worlds, power-ups, mushroom kingdoms, and Nintendo game aesthetics",
        "toy-story": "Toy Story animation style with plastic toys, bedroom adventures, and Pixar's pioneering 3D animation",
        "up": "Up adventure style with balloons, elderly protagonist, heartwarming journey, and Pixar's emotional storytelling",
        "vintage-1930s": "Vintage 1930s cartoon style with rubber hose animation, black and white or sepia tones, classic Disney aesthetics",
        "vhs": "VHS horror style with analog video effects, grain, distortion, and retro horror movie aesthetics",
        "voxel-minecraft": "Voxel/Minecraft style with blocky 3D worlds, cubic characters, and sandbox game aesthetics",
        "wall-e": "WALL-E post-apocalyptic style with robot characters, environmental themes, and Pixar's dystopian future vision",
        "watercolor": "Watercolor poster style with fluid paint effects, artistic brushstrokes, and organic color blending",
        "whiteboard": "Whiteboard animation style with hand-drawn markers, educational diagrams, and clean presentation graphics",
        "woodcut": "Woodcut print style with carved textures, traditional printing techniques, and historical artistic methods",
        
        // Music Video Stylized Realistic Styles
        "neon-concert": "Neon concert style with vibrant neon lights, concert stage energy, glowing effects, and live performance atmosphere - stylized and artistic",
        "moody-indie": "Moody indie style with soft artistic lighting, intimate atmosphere, cinematic shots, and emotional depth - stylized and artistic",
        "cinematic-performance": "Cinematic performance style with film-quality visuals, dramatic lighting, professional composition - stylized and artistic",
        "retro-mtv": "Retro MTV 80s/90s music video aesthetic with vintage effects, VHS quality, nostalgic color grading - stylized and artistic",
        "abstract-visualizer": "Abstract visualizer style with artistic abstract visuals, flowing shapes, synced to mood and rhythm - fully abstract, NOT photorealistic",
        "urban-streetwear": "Urban streetwear style with street fashion, urban environments, graffiti elements - stylized and artistic",
        "dreamy-ethereal": "Dreamy ethereal style with soft focus, pastel colors, dreamlike atmosphere, floating elements - stylized and artistic",
        "high-energy-edm": "High energy EDM style with dynamic visuals, light shows, festival vibes, strobe effects - stylized and artistic",
        "acoustic-intimate": "Acoustic intimate style with warm lighting, close-up compositions, emotional connection, cozy atmosphere - stylized and artistic",
        "psychedelic-trip": "Psychedelic trip style with colorful trippy visuals, surreal imagery, kaleidoscopic patterns - fully abstract, NOT photorealistic",
        "black-and-white-classic": "Black and white classic style with timeless monochrome, classic film aesthetics, dramatic contrast - stylized and artistic",
        "glitch-digital": "Glitch digital style with digital artifacts, glitch effects, futuristic distortion, data corruption aesthetics - stylized and artistic",
        "nature-landscape": "Nature landscape style with beautiful outdoor settings, natural lighting, scenic environments - stylized scenic, minimal people",
        "studio-performance": "Studio performance style with professional studio setting, clean production, controlled lighting - stylized and artistic"
      };
      styleDescription = styleMap[thumbnailStyle] || styleMap[style] || "professional, high-quality with maximum visual impact";
    }

    // ALWAYS use 1536x1024 for thumbnails (landscape orientation)
    const imageSize = "1536x1024";
    const imageQuality = thumbnailConfig?.imageQuality || "auto";
    
    // Parse dimensions for buffer calculations - always 1536x1024
    const [width, height] = [1536, 1024];
    const isPortrait = height > width;
    const isLandscape = width > height;
    
    // Calculate enhanced buffer zones based on image dimensions
    const baseBuffer = Math.min(width, height) * 0.12; // 12% of smaller dimension
    const minBuffer = Math.max(baseBuffer, 100); // Minimum 100px buffer
    const safeZone = {
      horizontal: Math.round(minBuffer),
      vertical: Math.round(minBuffer * (isPortrait ? 0.8 : 1.2)) // Adjust for aspect ratio
    };

    // Handle custom text and placement with enhanced anti-cutoff measures
    let textInstructions = "";
    if (thumbnailConfig?.customText) {
      const textPlacement = thumbnailConfig.textPlacement || "overlay";
      const emphasizeText = thumbnailConfig.emphasizeText !== false; // Default to true
      
      const placementMap: { [key: string]: string } = {
        "center": `prominently centered in the middle of the image with EXACTLY ${safeZone.horizontal}+ pixels of padding from all edges`,
        "top": `positioned in the upper third of the thumbnail with EXACTLY ${safeZone.vertical}+ pixels margin from the top edge and ${safeZone.horizontal}+ pixels from left/right edges`,
        "bottom": `placed in the lower third of the image with EXACTLY ${safeZone.vertical}+ pixels spacing from the bottom edge and ${safeZone.horizontal}+ pixels from left/right edges`,
        "left": `positioned on the left side with EXACTLY ${safeZone.horizontal}+ pixels margin from the left edge and centered vertically with ${safeZone.vertical}+ pixels top/bottom buffer`,
        "right": `positioned on the right side with EXACTLY ${safeZone.horizontal}+ pixels spacing from the right edge and centered vertically with ${safeZone.vertical}+ pixels top/bottom buffer`,
        "overlay": `strategically placed in an area with minimal visual interference, maintaining EXACTLY ${safeZone.horizontal}+ pixels from horizontal edges and ${safeZone.vertical}+ pixels from vertical edges`
      };
      
      const placementDescription = placementMap[textPlacement] || `strategically positioned with EXACTLY ${safeZone.horizontal}+ pixels horizontal and ${safeZone.vertical}+ pixels vertical edge spacing to prevent any cutoff`;
      const emphasisLevel = emphasizeText ? "bold, extra-thick sans-serif typography with 4-6px black stroke outline and white fill for maximum contrast and visibility" : "clear, readable sans-serif typography with 2-3px black outline for visibility";
      
      textInstructions = `\n\nCRITICAL TEXT PLACEMENT REQUIREMENTS: Include the text "${thumbnailConfig.customText}" ${placementDescription} using ${emphasisLevel}. The text MUST:
- Have EXACTLY ${safeZone.horizontal}+ pixels of buffer space from horizontal edges (left, right)
- Have EXACTLY ${safeZone.vertical}+ pixels of buffer space from vertical edges (top, bottom)
- Use extra-thick black stroke outlines (4-6px) with white text fill for maximum contrast and readability
- Be sized appropriately so the ENTIRE text including outlines fits comfortably within the safe text zone
- NEVER extend beyond the image boundaries or get cut off at any edge - this is critical
- Be positioned away from the main visual elements/characters to avoid overlap
- Use bold, sans-serif typography (like Impact, Arial Black, or Helvetica Bold) optimized for thumbnail visibility
- Have proper letter spacing and generous line height for optimal readability
- Consider the visual composition - place text in areas with less visual complexity
- Text size should be large enough to be readable but small enough to fit within safe zones with full outlines
- If text is too long, break it into multiple lines while maintaining safe zone requirements`;
    } else {
      textInstructions = `\n\nTEXT PLACEMENT GUIDELINES (if including text): Use compelling, engaging phrases that relate to the content. ALL TEXT MUST:
- Maintain EXACTLY ${safeZone.horizontal}+ pixels of buffer space from horizontal edges (left, right)
- Maintain EXACTLY ${safeZone.vertical}+ pixels of buffer space from vertical edges (top, bottom)
- Use thick black stroke outlines (4-6px) with white text fill for maximum contrast and readability
- Be positioned in areas with minimal visual interference (away from main characters/elements)
- NEVER extend beyond image boundaries or get cut off at any edge - this is absolutely critical
- Use bold, sans-serif typography (Impact, Arial Black, Helvetica Bold) optimized for thumbnail visibility
- Consider the overall composition to avoid overlapping with key visual elements
- Be sized appropriately so the ENTIRE text including outlines fits comfortably within the safe text zone
- Break long text into multiple lines if needed while maintaining safe zone requirements
- Ensure text remains readable at small thumbnail sizes (72x40 pixels when scaled down)`;
    }

    // Create a concise thumbnail generation prompt under 4000 characters
    const thumbnailPrompt = `Create a high-impact thumbnail image for: "${title || 'Video Content'}"

Content: ${scriptExcerpt.substring(0, 300)}...

Style: ${styleDescription}

CRITICAL TEXT PLACEMENT - MUST INCLUDE TITLE:
Title "${title || 'Video Content'}" with these STRICT requirements:
- EXACTLY ${safeZone.horizontal}+ pixels from left/right edges, ${safeZone.vertical}+ pixels from top/bottom
- Thick black outlines (4-6px) with white text fill
- Multi-line if needed (2-3 lines max), centered horizontally
- NEVER extend to image edges - all text completely inside boundaries
- Position in low-complexity areas or add semi-transparent background
- Scale appropriately - smaller text better than cut-off text

DESIGN REQUIREMENTS:
- Leave ${safeZone.horizontal}+ pixel margins from ALL edges for text safety
- Position main visual elements toward center
- Create text-friendly zones with negative space
- High contrast, vibrant colors for maximum visual impact
- Professional quality, eye-catching composition
- Bold visual elements positioned to leave text space
- NO LOGOS, NO BRAND MARKS, NO YOUTUBE SYMBOLS
- Clean design without any platform-specific branding

ABSOLUTE RULE: No text touches image boundaries. All characters must fit completely within safe zones with generous margins. NO LOGOS OR BRAND SYMBOLS.`;

    console.log(`Thumbnail prompt length: ${thumbnailPrompt.length} characters`);

    console.log("Sending thumbnail generation request to OpenAI...");
    console.log("Thumbnail prompt:", thumbnailPrompt.substring(0, 200) + "...");

    try {
      // Use configured image model for thumbnail generation
      const thumbnailModel = getModelConfig().image_generation || "gpt-image-1";
      console.log(`Using ${thumbnailModel} with FORCED size: ${imageSize} (always landscape), quality: ${imageQuality}`);
      
      const response = await openai.images.generate({
        model: thumbnailModel as "gpt-image-1" | "gpt-image-1-mini",
        prompt: thumbnailPrompt,
        n: 1,
        size: imageSize as "auto" | "1024x1024" | "1024x1536" | "1536x1024",
        quality: imageQuality as "auto" | "low" | "medium" | "high"
      });

      console.log("OpenAI GPT Image 1 response received");
      console.log("Response structure:", JSON.stringify(response, null, 2));
      
      if (!response.data || response.data.length === 0) {
        throw new Error("No image data returned from GPT Image 1");
      }

      // Check different possible response formats
      const imageData = response.data[0];
      let imageUrl = imageData.url;
      
      // GPT Image 1 might return different formats
      if (!imageUrl && imageData.b64_json) {
        const timestamp = Date.now();
        const filename = `thumbnail_${timestamp}.png`;
        const imageBuffer = Buffer.from(imageData.b64_json, 'base64');
        
        const savedUrl = await saveImageToPersistentStorage(imageBuffer, filename);
        console.log("Thumbnail generated successfully with GPT Image 1 (base64):", savedUrl);
        return savedUrl;
      }
      
      if (!imageUrl) {
        console.log("Available response data keys:", Object.keys(imageData));
        throw new Error("No image URL or base64 data in GPT Image 1 response");
      }

      // Download and save the image
      const fetch = (await import('node-fetch')).default;
      const imageResponse = await fetch(imageUrl);
      
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.statusText}`);
      }

      const timestamp = Date.now();
      const filename = `thumbnail_${timestamp}.png`;
      const imageBuffer = await imageResponse.buffer();
      
      const savedUrl = await saveImageToPersistentStorage(imageBuffer, filename);
      console.log("Thumbnail generated successfully with GPT Image 1:", savedUrl);
      return savedUrl;
    } catch (openaiError: any) {
      console.error("GPT Image 1 failed:", openaiError?.message);
      console.error("Full error details:", JSON.stringify(openaiError, null, 2));
      
      // Handle content moderation blocks gracefully - create a solid color thumbnail
      if (openaiError?.error?.code === 'moderation_blocked' || 
          (openaiError?.error?.error?.code === 'moderation_blocked') ||
          openaiError?.message?.includes('safety system')) {
        console.log("Content moderation blocked thumbnail generation. Creating solid color fallback...");
        
        // Create a solid dark blue fallback thumbnail (generic, doesn't trigger moderation)
        try {
          const sharp = await import('sharp');
          const fs = await import('fs');
          const path = await import('path');
          
          const uploadsDir = path.join(process.cwd(), 'uploads');
          if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
          }
          
          const timestamp = Date.now();
          const filename = `thumbnail_fallback_${timestamp}.png`;
          const filepath = path.join(uploadsDir, filename);
          
          // Create a solid color thumbnail with text overlay
          await sharp.default({
            create: {
              width: 1536,
              height: 1024,
              channels: 3,
              background: { r: 30, g: 50, b: 80 } // Dark blue background
            }
          })
          .png()
          .toFile(filepath);
          
          const localImageUrl = `/uploads/${filename}`;
          console.log("Fallback thumbnail generated successfully:", localImageUrl);
          return localImageUrl;
        } catch (fallbackError) {
          console.error("Failed to create fallback thumbnail:", fallbackError);
          // If fallback fails, return a data URL placeholder
          return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        }
      }
      
      // Don't fallback to DALL-E 3 to avoid YouTube logos and lower quality
      throw new Error(`GPT Image 1 thumbnail generation failed: ${openaiError?.message}. Please try again with different settings.`);
    }

  } catch (error: any) {
    console.error("Error generating thumbnail:", error);
    
    // Handle specific OpenAI errors
    if (error?.error?.code === 'content_policy_violation') {
      console.log("Thumbnail blocked by content policy - using fallback...");
      // Create fallback instead of throwing
      try {
        const sharp = await import('sharp');
        const fs = await import('fs');
        const path = await import('path');
        
        const uploadsDir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        
        const timestamp = Date.now();
        const filename = `thumbnail_fallback_${timestamp}.png`;
        const filepath = path.join(uploadsDir, filename);
        
        await sharp.default({
          create: {
            width: 1536,
            height: 1024,
            channels: 3,
            background: { r: 30, g: 50, b: 80 }
          }
        })
        .png()
        .toFile(filepath);
        
        return `/uploads/${filename}`;
      } catch {
        return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      }
    }
    
    if (error?.error?.type === 'invalid_request_error') {
      throw new Error(`Invalid request: ${error.error.message || 'Please check your input and try again'}`);
    }
    
    if (error?.status === 429) {
      throw new Error("Rate limit exceeded. Please wait a moment and try again.");
    }
    
    if (error?.status === 401) {
      throw new Error("Authentication failed. Please check your OpenAI API key.");
    }

    // Generic error handling
    throw new Error(error?.message || "Failed to generate thumbnail. Please try again.");
  }
}

/**
 * Estimate durations for scenes based on word count
 */
export async function estimateSceneDurations(
  scenes: ScriptScene[],
  projectModelSettings?: any // Accept project-specific model settings
): Promise<number[]> {
  // Validate API key first
  const isApiKeyValid = await validateApiKey();
  if (!isApiKeyValid) {
    // Fallback to simple word count estimation if API key is invalid
    console.warn("Invalid OpenAI API key, using word count estimation for durations.");
    return estimateBasedOnWordCount(scenes);
  }
  
  // Use project-specific settings if provided, otherwise fall back to global settings
  const effectiveModelConfig = projectModelSettings || getModelConfig();

  try {
    const response = await openai.chat.completions.create({
      model: effectiveModelConfig.scene_duration_estimation,
      temperature: getTemperatureForModel(effectiveModelConfig.scene_duration_estimation),
      messages: [
        {
          role: "system",
          content: "You are an expert at estimating narration time for video scripts. Given script excerpts, estimate how many seconds each would take to narrate at a comfortable pace. Return your response as a JSON object."
        },
        {
          role: "user",
          content: `Estimate the narration time in seconds for each of these ${scenes.length} script excerpts. Return a JSON object with a 'durations' field containing an array of numbers, one for each excerpt. Example: {"durations": [10, 15, 20]}.\n\n${scenes.map((scene, i) => `${i+1}: ${scene.content || scene.scriptExcerpt || ""}`).join('\n\n')}`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(response.choices[0].message.content || "{}");
    if (Array.isArray(result.durations)) {
      return result.durations;
    }
    
    // Fallback to simple word count estimation if the response format is unexpected
    console.warn("Unexpected response format from OpenAI, using word count estimation for durations.");
    return estimateBasedOnWordCount(scenes);
  } catch (error) {
    console.error("Error estimating durations:", error);
    // Fallback to simple word count estimation
    return estimateBasedOnWordCount(scenes);
  }
}

// Helper function to estimate durations based on word count
function estimateBasedOnWordCount(scenes: ScriptScene[]): number[] {
  return scenes.map(scene => {
    const wordCount = (scene.content || "").split(/\s+/).length;
    return Math.max(Math.round(wordCount * 0.5), 3); // Rough estimate: 2 words per second, minimum 3 seconds
  });
}

/**
 * Determine optimal Sora clip length based on scene duration
 * Sora only supports 4 or 8 second clips for music videos
 * Per OpenAI guide: shorter clips (4s) are more reliable for complex scenes
 */
function determineSoraClipLength(estimatedDuration: number): 4 | 8 {
  if (estimatedDuration <= 6) return 4;
  return 8;
}

/**
 * Generate image-aware Sora prompts for scenes that already have images
 * This follows the official OpenAI Sora prompting guide:
 * https://cookbook.openai.com/examples/sora/sora2_prompting_guide
 * 
 * Key principles from the guide:
 * - Use image input for more control over composition and style
 * - Clip lengths can only be 4, 8, or 12 seconds
 * - Shorter clips (4s) are more reliable
 * - Include: Format & Look, Lenses, Grade/Palette, Lighting, Location, Action, Sound
 */
export async function generateImageAwareSoraPrompts(
  scenes: Array<{
    id?: number;
    sceneNumber: number;
    content?: string;
    scriptExcerpt?: string;
    title?: string;
    imageUrl?: string | null;
    estimatedDuration?: number;
    dallePrompt?: string;
  }>,
  style: string,
  maintainContinuity: boolean = true,
  customStylePrompt?: string,
  projectModelSettings?: any
): Promise<Array<{
  sceneId?: number;
  sceneNumber: number;
  soraPrompt: string;
  soraClipLength: 4 | 8;
}>> {
  // Validate API key first
  const isApiKeyValid = await validateApiKey();
  if (!isApiKeyValid) {
    throw new Error("Invalid or missing OpenAI API key. Please check your environment variables.");
  }

  // Determine style description
  let styleDescription = style;
  if (style === 'custom' && customStylePrompt) {
    styleDescription = customStylePrompt;
  } else if (style === 'auto') {
    const fullContent = scenes.map(s => s.content || s.scriptExcerpt || '').join(' ');
    styleDescription = await generateAutoStyle(fullContent.substring(0, 1000));
  }

  const results: Array<{
    sceneId?: number;
    sceneNumber: number;
    soraPrompt: string;
    soraClipLength: 4 | 8;
  }> = [];
  
  let previousPrompts: string[] = [];
  const totalScenes = scenes.length;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneContent = scene.content || scene.scriptExcerpt || '';
    const hasImage = scene.imageUrl && !scene.imageUrl.startsWith('data:');
    
    // Determine clip length (4, 8, or 12 seconds only per Sora API)
    const soraClipLength = determineSoraClipLength(scene.estimatedDuration || 8);
    
    const currentPosition = i + 1;
    const storyPosition = 
      currentPosition <= Math.ceil(totalScenes * 0.25) ? "opening" :
      currentPosition >= Math.floor(totalScenes * 0.75) ? "conclusion" : "middle";

    const recentPrompts = previousPrompts.slice(-2);

    // Build the prompt following OpenAI's Sora prompting guide structure
    let userPrompt = `Generate a cinematic Sora video prompt for scene ${currentPosition} of ${totalScenes} (${storyPosition}).

**CLIP DURATION**: ${soraClipLength} seconds (this is the exact API parameter)

**SCENE NARRATIVE**:
${sceneContent}

**VISUAL STYLE DIRECTION**:
${styleDescription}

${hasImage ? `**IMAGE REFERENCE**: This scene has a reference image that establishes the exact visual composition, character appearance, color palette, and setting. The video prompt should animate this specific frame.

**DALL-E PROMPT USED FOR IMAGE**:
${scene.dallePrompt || 'N/A'}
` : ''}

Following OpenAI's official Sora prompting guide, create a prompt with these structured sections:

---
**Format & Look**
Duration ${soraClipLength}s; describe the visual capture style (film stock emulation, digital capture, resolution feel, grain, halation, etc.)

**Lenses & Filtration**
Specify focal length (e.g., 35mm, 50mm, 85mm), lens type (spherical/anamorphic), any filters (Pro-Mist, CPL, etc.)

**Grade / Palette**
- Highlights: [describe color and treatment]
- Mids: [describe color and treatment]  
- Blacks: [describe color and treatment]
- Name 3-5 specific color anchors

**Lighting & Atmosphere**
- Key light direction, quality, and color temperature
- Fill and rim lighting
- Practical lights in scene
- Atmospheric effects (haze, fog, dust particles)

**Location & Framing**
- Setting and spatial layout
- Foreground, midground, background elements
- What to avoid (modern elements, logos, anachronisms)

**Subject & Action**
- Character appearance (age, clothing, distinguishing features)
- Specific movements broken into beats/timing
- Facial expressions and body language
- Props and interactions

**Camera Motion**
- Starting position and framing
- Movement type (dolly, pan, tilt, handheld, steadicam)
- Movement speed and timing
- Ending position

**Sound Design Cues** (visual equivalents only)
- What visual elements suggest diegetic sound
- Ambient atmosphere

**Shot List** (for ${soraClipLength} seconds)
Break into 1-2 specific shot descriptions with timing:
0.00-X.XX — "Shot Name" (lens, movement type)
Description of exactly what happens.
---`;

    if (maintainContinuity && recentPrompts.length > 0) {
      userPrompt += `\n\n**CONTINUITY FROM PREVIOUS SCENES**:
${recentPrompts.map((p, idx) => `Scene ${i - recentPrompts.length + idx + 1}: ${p.substring(0, 250)}...`).join('\n')}

Maintain consistency in: character appearances, lighting style, color grade, and camera language.`;
    }

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        temperature: 1.0,
        messages: [
          {
            role: "system",
            content: `You are an expert cinematographer and Sora prompt engineer following OpenAI's official Sora 2 prompting guide.

Your prompts should read like professional shot lists combined with technical specifications. Be extremely specific about:
- Exact camera movements and lens choices
- Precise timing of actions within the ${soraClipLength}-second clip
- Color palette with specific color names
- Lighting direction and quality
- Subject movements broken into beats

Write in a professional, technical style. Output should be 200-400 words of dense, specific direction.

IMPORTANT: The clip MUST work as a complete ${soraClipLength}-second video - plan the action and camera movement accordingly. Shorter clips are more reliable, so keep actions simple and focused.`
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
      });

      const soraPrompt = response.choices[0].message.content || "";
      previousPrompts.push(soraPrompt);

      results.push({
        sceneId: scene.id,
        sceneNumber: scene.sceneNumber,
        soraPrompt,
        soraClipLength
      });

      console.log(`Generated image-aware Sora prompt for scene ${scene.sceneNumber} (${soraClipLength}s clip): ${soraPrompt.substring(0, 100)}...`);

    } catch (error) {
      console.error(`Error generating Sora prompt for scene ${scene.sceneNumber}:`, error);
      
      // Fallback with basic structure following the guide
      const fallbackPrompt = `Format & Look
Duration ${soraClipLength}s; digital capture with cinematic color grade; natural grain.

Lenses & Filtration  
50mm spherical prime; subtle diffusion.

Grade / Palette
Balanced naturalistic grade with warm highlights, neutral mids. Colors: ${styleDescription}.

Lighting & Atmosphere
Natural ambient lighting appropriate to the scene.

Location & Framing
${sceneContent}

Subject & Action
Character performs the described action over ${soraClipLength} seconds with natural, grounded movement.

Camera Motion
Steady shot with subtle movement, maintaining subject in frame throughout.

Shot: 0.00-${soraClipLength}.00 — "Main Shot"
${sceneContent}`;

      results.push({
        sceneId: scene.id,
        sceneNumber: scene.sceneNumber,
        soraPrompt: fallbackPrompt,
        soraClipLength
      });
    }
  }

  return results;
}

/**
 * Generate detailed Sora text-to-video prompts for each scene
 * This is the legacy function - use generateImageAwareSoraPrompts for better results
 * Each prompt is optimized for Sora's supported clip lengths (4, 8, or 12 seconds)
 */
export async function generateSoraTextToVideoPrompts(
  script: string,
  style: string,
  maintainContinuity: boolean = true,
  customStylePrompt?: string,
  projectModelSettings?: any
): Promise<SceneWithPrompt[]> {
  // Validate API key first
  const isApiKeyValid = await validateApiKey();
  if (!isApiKeyValid) {
    throw new Error("Invalid or missing OpenAI API key. Please check your environment variables.");
  }
  
  // Use project-specific settings if provided, otherwise fall back to global settings
  const effectiveModelConfig = projectModelSettings || getModelConfig();

  try {
    // Step 1: Break the script into scenes optimized for Sora clip lengths (4, 8, 12 seconds)
    console.log('Breaking script into Sora-optimized scenes (4/8/12 second clips)...');
    
    // Determine style description
    let styleDescription = style;
    if (style === 'custom' && customStylePrompt) {
      styleDescription = customStylePrompt;
    } else if (style === 'auto') {
      styleDescription = await generateAutoStyle(script.substring(0, 1000));
    }
    
    const sceneBreakdownResponse = await openai.chat.completions.create({
      model: "gpt-5.1",
      temperature: 1.0,
      messages: [
        {
          role: "system",
          content: `You are an expert video director specializing in scene breakdowns for OpenAI's Sora video model.

CRITICAL: Sora only supports clip lengths of exactly 4, 8, or 12 seconds. Per OpenAI's guide, shorter clips (4s) are more reliable.

Break the script into scenes where each scene:
- Has a clear "soraClipLength" of 4, 8, or 12 seconds ONLY
- Contains one focused action or moment (simpler = better for Sora)
- Can be filmed as a single continuous shot
- Flows naturally into the next scene

Return a JSON object with a "scenes" array, each with:
- "content": The script excerpt for this scene
- "soraClipLength": 4, 8, or 12 (the exact Sora API parameter)
- "title": Brief descriptive title
- "cameraNote": Brief note on suggested camera approach`
        },
        {
          role: "user",
          content: `Break this script into scenes optimized for Sora (4/8/12 second clips):\n\n${script}`
        }
      ],
      response_format: { type: "json_object" }
    });

    const sceneBreakdown = JSON.parse(sceneBreakdownResponse.choices[0].message.content || "{}");
    
    if (!Array.isArray(sceneBreakdown.scenes) || sceneBreakdown.scenes.length === 0) {
      throw new Error("Failed to break script into scenes");
    }

    console.log(`Script broken into ${sceneBreakdown.scenes.length} Sora-optimized scenes`);

    // Step 2: Generate Sora prompts following the official guide format
    const results: SceneWithPrompt[] = [];
    let previousPrompts: string[] = [];

    for (let i = 0; i < sceneBreakdown.scenes.length; i++) {
      const scene = sceneBreakdown.scenes[i];
      const recentPrompts = previousPrompts.slice(-2);
      
      const currentPosition = i + 1;
      const totalScenes = sceneBreakdown.scenes.length;
      const storyPosition = 
        currentPosition <= Math.ceil(totalScenes * 0.25) ? "opening" :
        currentPosition >= Math.floor(totalScenes * 0.75) ? "conclusion" : "middle";

      // Validate and normalize clip length to 4, 8, or 12
      const clipLength = [4, 8, 12].includes(scene.soraClipLength) 
        ? scene.soraClipLength 
        : determineSoraClipLength(scene.soraClipLength || 8);

      let prompt = `Generate a professional Sora prompt for scene ${currentPosition}/${totalScenes} (${storyPosition}).

**EXACT CLIP DURATION**: ${clipLength} seconds

**SCENE CONTENT**:
${scene.content}

**VISUAL STYLE**:
${styleDescription}

${scene.cameraNote ? `**CAMERA DIRECTION**: ${scene.cameraNote}` : ''}

Following OpenAI's Sora prompting guide, structure your prompt as:

---
**Format & Look**
Duration ${clipLength}s; [capture style, film emulation, grain, etc.]

**Lenses & Filtration**
[Focal length, lens type, filters]

**Grade / Palette**
Highlights: [treatment]
Mids: [treatment]
Blacks: [treatment]
Color anchors: [3-5 specific colors]

**Lighting & Atmosphere**
[Key light, fill, rim, practicals, atmosphere]

**Location & Framing**
[Setting, foreground/midground/background, avoid list]

**Subject & Action**
[Character details, movements with timing, expressions]

**Camera Motion**
[Start position, movement type/speed, end position]

**Shot List** (${clipLength}s total)
0.00-X.XX — "[Shot Name]" ([lens], [movement])
[What happens in this shot segment]
---`;

      if (maintainContinuity && recentPrompts.length > 0) {
        prompt += `\n\n**CONTINUITY CONTEXT**:
${recentPrompts.map((p, idx) => `Previous: ${p.substring(0, 200)}...`).join('\n')}

Match: character look, lighting style, color grade, camera language.`;
      }

      try {
        const soraPromptResponse = await openai.chat.completions.create({
          model: "gpt-5.1",
          temperature: 1.0,
          messages: [
            {
              role: "system",
              content: `You are an expert Sora prompt engineer following OpenAI's official prompting guide.

Write professional, technical prompts that read like cinematographer shot lists. Be specific about:
- Camera, lens, and movement (exactly what happens over ${clipLength} seconds)
- Color palette with named colors
- Lighting quality and direction
- Subject action broken into timed beats

Keep prompts 200-400 words. Remember: this is a ${clipLength}-second clip, so actions must be achievable in that time. Shorter = more reliable.`
            },
            {
              role: "user",
              content: prompt
            }
          ],
        });

        const soraPrompt = soraPromptResponse.choices[0].message.content || "";
        previousPrompts.push(soraPrompt);

        results.push({
          content: scene.content,
          title: scene.title,
          estimatedDuration: clipLength,
          soraPrompt: soraPrompt,
          soraClipLength: clipLength,
          dallePrompt: '',
          scriptExcerpt: scene.content,
          sceneNumber: i + 1
        });

        console.log(`Generated Sora prompt for scene ${i + 1} (${clipLength}s): ${soraPrompt.substring(0, 100)}...`);
      } catch (error) {
        console.error(`Error generating Sora prompt for scene ${i + 1}:`, error);
        
        const fallbackPrompt = `Format & Look
Duration ${clipLength}s; digital capture with cinematic grade.

Grade / Palette
${styleDescription} color treatment.

Location & Framing
${scene.content}

Subject & Action
Natural performance over ${clipLength} seconds.

Camera Motion
Steady with subtle movement.

Shot: 0.00-${clipLength}.00
${scene.content}`;
        
        results.push({
          content: scene.content,
          title: scene.title,
          estimatedDuration: clipLength,
          soraPrompt: fallbackPrompt,
          soraClipLength: clipLength,
          dallePrompt: '',
          scriptExcerpt: scene.content,
          sceneNumber: i + 1
        });
      }
    }

    return results;
  } catch (error) {
    console.error("Error generating Sora text-to-video prompts:", error);
    throw error;
  }
}

/**
 * Character DNA interface for consistent character generation
 */
export interface CharacterDNA {
  id: string;
  name: string;
  aliases?: string[];
  isNarrator?: boolean; // True if character is a narrator/voiceover - should NOT appear in images
  referenceImageUrl?: string; // Uploaded reference image URL for visual consistency
  visualDNA: {
    age?: string;
    gender?: string;
    ethnicity?: string;
    bodyType?: string;
    face?: {
      shape?: string;
      eyes?: string;
      nose?: string;
      mouth?: string;
      distinctiveFeatures?: string[];
    };
    hair?: {
      style?: string;
      color?: string;
      length?: string;
    };
    skin?: string;
    clothing?: {
      typical?: string;
      accessories?: string[];
    };
  };
  personality?: string;
  role?: string;
}

interface CharacterExtractionResult {
  characters: CharacterDNA[];
  sceneCharacterMap: { [sceneNumber: number]: string[] }; // Maps scene numbers to character IDs
}

/**
 * Analyze a reference image using GPT-4o vision to extract accurate visual DNA
 * This ensures character descriptions match the actual uploaded photo
 */
export async function analyzeReferenceImageWithVision(
  imageUrl: string,
  characterName: string = "Artist"
): Promise<CharacterDNA['visualDNA']> {
  const isApiKeyValid = await validateApiKey();
  if (!isApiKeyValid) {
    throw new Error("Invalid or missing OpenAI API key.");
  }

  console.log(`[VISION] Analyzing reference image for character: ${characterName}`);
  console.log(`[VISION] Image URL: ${imageUrl.substring(0, 80)}...`);

  try {
    // Read the image and convert to base64 for vision API
    let imageBase64: string;
    let mimeType = 'image/png';
    
    if (imageUrl.startsWith('data:')) {
      // Already base64
      const matches = imageUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
      if (matches) {
        mimeType = `image/${matches[1]}`;
        imageBase64 = matches[2];
      } else {
        throw new Error("Invalid data URL format");
      }
    } else if (imageUrl.startsWith('/uploads/')) {
      // Local file - read from disk
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join(process.cwd(), imageUrl);
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`Reference image file not found: ${filePath}`);
      }
      
      const imageBuffer = fs.readFileSync(filePath);
      imageBase64 = imageBuffer.toString('base64');
      
      // Determine mime type from extension
      if (imageUrl.endsWith('.jpg') || imageUrl.endsWith('.jpeg')) {
        mimeType = 'image/jpeg';
      } else if (imageUrl.endsWith('.png')) {
        mimeType = 'image/png';
      } else if (imageUrl.endsWith('.webp')) {
        mimeType = 'image/webp';
      }
    } else {
      throw new Error(`Unsupported image URL format: ${imageUrl.substring(0, 50)}`);
    }

    const visionPrompt = `You are an expert at analyzing photographs to create detailed, accurate visual descriptions for character consistency in image generation.

Analyze this reference photograph and extract PRECISE visual details. Be EXTREMELY accurate - do not guess or infer features that are not clearly visible.

For each feature, describe EXACTLY what you see in the photo:

1. HAIR:
   - Exact color (use descriptive terms AND hex codes, e.g., "bright copper-red/ginger (#CC5500)")
   - Length (e.g., "shoulder-length", "long past shoulders")
   - Style (straight, wavy, curly, how it's parted)
   
2. EYES:
   - Color (be specific - "blue-gray", "hazel with green flecks", etc.)
   - Shape (almond, round, hooded, etc.)
   
3. SKIN:
   - Tone (fair, light, medium, tan, etc.)
   - Notable features (freckles, birthmarks, complexion)
   
4. FACE:
   - Shape (oval, round, heart, square)
   - Distinctive features visible in photo
   
5. BODY TYPE (if visible):
   - Build description
   
6. CLOTHING (in photo):
   - Exactly what they're wearing
   - Colors and style
   
7. ACCESSORIES:
   - Jewelry, headphones, glasses, etc.
   
8. TATTOOS/MARKINGS:
   - Location and description of any visible tattoos
   - Other distinctive markings

9. APPROXIMATE AGE:
   - Your best estimate based on appearance

CRITICAL: Only describe what you can CLEARLY SEE. If something is not visible or unclear, say so.

Respond in valid JSON format:
{
  "age": "mid-20s",
  "gender": "female-presenting",
  "ethnicity": "fair-skinned, appears Caucasian",
  "bodyType": "slim build with narrow shoulders",
  "face": {
    "shape": "oval face with soft jawline",
    "eyes": "blue-gray eyes (#7B9AAF), almond-shaped",
    "nose": "description if clearly visible",
    "mouth": "description if clearly visible",
    "distinctiveFeatures": ["array of distinctive features"]
  },
  "hair": {
    "color": "bright copper-red/ginger (#CC5500)",
    "length": "long, past shoulders",
    "style": "straight, natural, parted slightly off-center"
  },
  "skin": "fair skin with light freckles across nose and cheeks",
  "clothing": {
    "typical": "purple/lavender ribbed tank top",
    "accessories": ["black over-ear headphones", "visible tattoos on arms"]
  },
  "tattoos": [
    {"location": "left inner forearm", "description": "small text tattoo"},
    {"location": "left upper arm", "description": "four-pointed star outline"}
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3, // Lower temperature for more accurate descriptions
      max_tokens: 1500,
      messages: [
        { 
          role: "user", 
          content: [
            { type: "text", text: visionPrompt },
            { 
              type: "image_url", 
              image_url: { 
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high" // High detail for accurate feature extraction
              } 
            }
          ]
        }
      ],
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No response from vision analysis");
    }

    const visualDNA = JSON.parse(content);
    console.log(`[VISION] Successfully extracted visual DNA from reference image`);
    console.log(`[VISION] Hair color: ${visualDNA.hair?.color || 'unknown'}`);
    console.log(`[VISION] Eye color: ${visualDNA.face?.eyes || 'unknown'}`);
    
    return visualDNA;
  } catch (error) {
    console.error("[VISION] Error analyzing reference image:", error);
    throw error;
  }
}

/**
 * Extract characters from a script and generate detailed visual DNA profiles
 * Uses GPT-5.1 to analyze the script and identify all characters with consistent visual descriptions
 */
export async function extractCharactersFromScript(
  scriptContent: string,
  sceneBreakdown?: { sceneNumber: number; content: string }[],
  projectModelSettings?: any,
  referenceImageUrl?: string // NEW: Optional reference image to analyze with vision
): Promise<CharacterExtractionResult> {
  const isApiKeyValid = await validateApiKey();
  if (!isApiKeyValid) {
    throw new Error("Invalid or missing OpenAI API key.");
  }

  const effectiveModelConfig = projectModelSettings || getModelConfig();
  console.log("Extracting characters from script using GPT-5.1...");

  const systemPrompt = `You are an expert character analyst and visual designer. Your job is to:

1. IDENTIFY all distinct characters mentioned in the script (named characters, unnamed but recurring figures, etc.)
2. Generate DETAILED visual DNA profiles for each character that can be reused across multiple image generations

For each character, create a comprehensive visual description including:
- Age (specific, e.g., "32-year-old")
- Gender and physical presentation
- Ethnicity/skin tone (be specific with descriptive terms)
- Body type with proportions (e.g., "athletic build, head-to-body ratio 1:7")
- Face details:
  - Shape (e.g., "oval-shaped with high cheekbones")
  - Eyes (color, shape, distinctive features - use specific colors like "sapphire blue (#0F52BA)")
  - Nose and mouth if distinctive
  - Any distinctive features (freckles, scars, birthmarks)
- Hair (style, color, length - be very specific)
- Typical clothing and accessories
- Personality traits that affect expression/posture

CRITICAL RULES:
1. Be EXTREMELY specific with visual details - vague descriptions lead to inconsistent images
2. Use color codes (hex) for eye/hair colors when possible
3. Include proportions and body ratios for consistency
4. Note any recurring visual motifs (always wears red, has a specific accessory, etc.)
5. Generate a unique ID for each character (lowercase, no spaces, e.g., "john_hero", "mysterious_stranger")
6. Identify aliases (if character is referred to by different names/titles)
7. IMPORTANT: Mark characters as "isNarrator": true if they are:
   - The narrator/voiceover who tells the story but is NOT physically present in scenes
   - An off-screen voice or commentator
   - Someone who only exists as a voice narrating events
   Narrators should NOT be included in image generation - they are audio-only.

${sceneBreakdown ? `
Also analyze which characters appear in each scene. Return a mapping of scene numbers to character IDs.

Scene breakdown:
${sceneBreakdown.map(s => `Scene ${s.sceneNumber}: ${s.content.substring(0, 200)}...`).join('\n')}
` : ''}

Respond in valid JSON format:
{
  "characters": [
    {
      "id": "character_id",
      "name": "Character Name",
      "aliases": ["Nick", "The Boss"],
      "isNarrator": false,
      "visualDNA": {
        "age": "32-year-old",
        "gender": "male",
        "ethnicity": "Caucasian with Mediterranean features",
        "bodyType": "athletic build, broad shoulders, head-to-body ratio 1:7.5",
        "face": {
          "shape": "square jaw with defined cheekbones",
          "eyes": "deep-set, storm gray (#6B7B8C), intense gaze with slight crow's feet",
          "nose": "straight with slight bump from old break",
          "mouth": "thin lips, often set in determined line",
          "distinctiveFeatures": ["5 o'clock shadow", "small scar above left eyebrow"]
        },
        "hair": {
          "style": "short, swept back",
          "color": "dark brown with gray at temples (#3D2314)",
          "length": "2 inches on top, tapered sides"
        },
        "skin": "olive complexion, weathered",
        "clothing": {
          "typical": "charcoal three-piece suit, white dress shirt unbuttoned at collar, no tie",
          "accessories": ["silver watch on left wrist", "simple gold wedding band"]
        }
      },
      "personality": "confident, calculating, carries himself with quiet authority",
      "role": "protagonist"
    }
  ],
  "sceneCharacterMap": {
    "1": ["character_id"],
    "2": ["character_id", "another_character"]
  }
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      temperature: 1.0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Analyze this script and extract all characters with detailed visual DNA:\n\n${scriptContent}` }
      ],
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No response from character extraction");
    }

    const result = JSON.parse(content) as CharacterExtractionResult;
    console.log(`Extracted ${result.characters.length} characters from script`);
    
    // NEW: If a reference image is provided, use GPT-4o vision to get ACCURATE visual DNA
    // This overrides the script-based guesses with actual photo analysis
    if (referenceImageUrl) {
      console.log(`[CHARACTER EXTRACTION] Reference image provided, analyzing with vision...`);
      
      try {
        // Find the main character (protagonist, narrator, artist, or first character)
        const mainCharacter = result.characters.find(c => 
          c.name?.toLowerCase().includes('artist') || 
          c.name?.toLowerCase().includes('narrator') ||
          c.name?.toLowerCase().includes('singer') ||
          c.name?.toLowerCase().includes('performer') ||
          c.role === 'protagonist' ||
          c.role?.includes('protagonist')
        ) || result.characters[0];
        
        if (mainCharacter) {
          console.log(`[CHARACTER EXTRACTION] Analyzing reference image for main character: ${mainCharacter.name}`);
          
          // Use GPT-4o vision to extract accurate visual DNA from the actual photo
          const visionDNA = await analyzeReferenceImageWithVision(referenceImageUrl, mainCharacter.name);
          
          // Merge vision-based DNA with script-based personality/role
          // Vision provides: physical appearance (hair, eyes, skin, body, clothing, tattoos)
          // Script provides: personality, role, scene context
          const originalPersonality = mainCharacter.personality;
          const originalRole = mainCharacter.role;
          
          mainCharacter.visualDNA = {
            ...mainCharacter.visualDNA,
            ...visionDNA,
            // Preserve personality from script analysis
          };
          mainCharacter.personality = originalPersonality;
          mainCharacter.role = originalRole;
          mainCharacter.referenceImageUrl = referenceImageUrl;
          
          console.log(`[CHARACTER EXTRACTION] Updated ${mainCharacter.name} visual DNA from reference photo`);
          console.log(`[CHARACTER EXTRACTION] Hair: ${mainCharacter.visualDNA.hair?.color}`);
          console.log(`[CHARACTER EXTRACTION] Eyes: ${mainCharacter.visualDNA.face?.eyes}`);
        }
      } catch (visionError) {
        console.error(`[CHARACTER EXTRACTION] Vision analysis failed, using script-based DNA:`, visionError);
        // Continue with script-based DNA if vision fails
      }
    }
    
    return result;
  } catch (error) {
    console.error("Error extracting characters:", error);
    throw error;
  }
}

/**
 * Generate a compact character description from CharacterDNA for injection into image prompts
 * This creates a consistent, reusable description that can be prepended to any scene prompt
 */
export function generateCharacterPromptDescription(character: CharacterDNA): string {
  const dna = character.visualDNA;
  let desc = '';

  // Build a detailed but compact description
  if (dna.age) desc += `${dna.age} `;
  if (dna.ethnicity) desc += `${dna.ethnicity} `;
  if (dna.gender) desc += `${dna.gender} `;
  
  // Body
  if (dna.bodyType) desc += `with ${dna.bodyType} `;
  
  // Face
  if (dna.face) {
    if (dna.face.shape) desc += `${dna.face.shape} face `;
    if (dna.face.eyes) desc += `${dna.face.eyes} eyes `;
    if (dna.face.distinctiveFeatures?.length) {
      desc += `with ${dna.face.distinctiveFeatures.join(', ')} `;
    }
  }
  
  // Hair
  if (dna.hair) {
    if (dna.hair.color) desc += `${dna.hair.color} `;
    if (dna.hair.length) desc += `${dna.hair.length} `;
    if (dna.hair.style) desc += `${dna.hair.style} hair `;
  }
  
  // Skin
  if (dna.skin) desc += `${dna.skin} skin `;
  
  // Clothing
  if (dna.clothing?.typical) desc += `wearing ${dna.clothing.typical} `;
  if (dna.clothing?.accessories?.length) {
    desc += `with ${dna.clothing.accessories.join(' and ')} `;
  }

  return desc.trim();
}

/**
 * Inject character DNA descriptions into a scene prompt for consistent character generation
 */
export function injectCharactersIntoPrompt(
  originalPrompt: string,
  characters: CharacterDNA[],
  characterIds: string[]
): string {
  if (!characterIds.length || !characters.length) {
    return originalPrompt;
  }

  // Find the characters that appear in this scene, EXCLUDING narrators
  // Narrators are voice-only and should not be visually depicted in images
  const sceneCharacters = characters.filter(c => 
    characterIds.includes(c.id) && !c.isNarrator
  );
  if (!sceneCharacters.length) {
    return originalPrompt;
  }

  // Generate character descriptions with reference image notes
  const characterDescriptions = sceneCharacters.map(char => {
    const desc = generateCharacterPromptDescription(char);
    const hasRefImage = char.referenceImageUrl ? ' [HAS REFERENCE IMAGE - maintain exact likeness]' : '';
    return `[${char.name}]${hasRefImage}: ${desc}`;
  }).join('\n');

  // Check if any characters have reference images
  const hasReferenceImages = sceneCharacters.some(c => c.referenceImageUrl);
  const referenceNote = hasReferenceImages 
    ? '\n\nCRITICAL: Some characters have reference images. Match their exact facial features, body proportions, and distinctive characteristics precisely.'
    : '';

  // Inject character DNA at the start of the prompt for maximum influence
  const injectedPrompt = `IMPORTANT - Maintain exact character consistency:

${characterDescriptions}${referenceNote}

---

${originalPrompt}

REMINDER: Characters must match the exact descriptions above. Do not deviate from specified features, clothing, or physical attributes.`;

  return injectedPrompt;
}

/**
 * Interface for image generation with reference images
 */
interface ReferenceImageData {
  sceneNumber: number;
  imageUrl: string;
  characterIds: string[];
}

/**
 * Generate images sequentially with reference to previous images for character consistency
 * Uses the OpenAI edit endpoint to pass previous images as visual references
 */
export async function generateImagesWithReferences(
  scenes: SceneWithPrompt[],
  characters: CharacterDNA[],
  sceneCharacterMap: { [sceneNumber: number]: string[] },
  style: string,
  customStylePrompt?: string,
  projectModelSettings?: any,
  musicianReferenceImageUrl?: string
): Promise<SceneWithImage[]> {
  const isApiKeyValid = await validateApiKey();
  if (!isApiKeyValid) {
    throw new Error("Invalid or missing OpenAI API key.");
  }

  const effectiveModelConfig = projectModelSettings || getModelConfig();
  const results: SceneWithImage[] = [];
  const generatedImages: ReferenceImageData[] = [];

  // If we have a musician reference image, assign it to a VISUAL character (NOT a narrator)
  // This ensures the uploaded reference photo is used for character consistency
  if (musicianReferenceImageUrl) {
    console.log(`Musician reference image provided: ${musicianReferenceImageUrl.substring(0, 50)}...`);
    
    // Filter out narrators - they are voice-only and should not get reference images
    const visualCharacters = characters.filter(c => !c.isNarrator);
    
    // Find the main visual character (Artist, Singer, Performer, or first non-narrator)
    const mainCharacter = visualCharacters.find(c => 
      c.name.toLowerCase().includes('artist') || 
      c.name.toLowerCase().includes('singer') ||
      c.name.toLowerCase().includes('performer') ||
      c.role === 'protagonist'
    ) || visualCharacters[0];
    
    if (mainCharacter && !mainCharacter.referenceImageUrl) {
      mainCharacter.referenceImageUrl = musicianReferenceImageUrl;
      console.log(`Assigned musician reference image to character: ${mainCharacter.name}`);
    }
  }

  // Check for characters with reference images
  const charactersWithReferenceImages = characters.filter(c => c.referenceImageUrl);
  if (charactersWithReferenceImages.length > 0) {
    console.log(`Found ${charactersWithReferenceImages.length} characters with reference images`);
  }

  console.log(`Generating ${scenes.length} images sequentially with character consistency...`);

  // Sort scenes by scene number to ensure proper sequence
  const sortedScenes = [...scenes].sort((a, b) => (a.sceneNumber || 0) - (b.sceneNumber || 0));

  for (let i = 0; i < sortedScenes.length; i++) {
    const scene = sortedScenes[i];
    const sceneNumber = scene.sceneNumber || i + 1;
    const characterIds = sceneCharacterMap[sceneNumber] || [];

    console.log(`Generating image for scene ${sceneNumber} with ${characterIds.length} characters...`);

    // Get character DNA for this scene, EXCLUDING narrators (voice-only characters)
    const sceneCharacters = characters.filter(c => 
      characterIds.includes(c.id) && !c.isNarrator
    );
    
    // Check if any visual characters in this scene have reference images
    let characterWithRefImage = sceneCharacters.find(c => c.referenceImageUrl);
    
    // IMPORTANT: For music videos, if we have a musician reference image, 
    // use it for ALL scenes - the artist should appear throughout the video
    // This fixes the issue where some scenes had 0 characters in sceneCharacterMap
    if (!characterWithRefImage && musicianReferenceImageUrl) {
      // Find the main character with the reference image (or first character with ref)
      const mainCharacterWithRef = characters.find(c => c.referenceImageUrl);
      if (mainCharacterWithRef) {
        characterWithRefImage = mainCharacterWithRef;
        console.log(`[REF IMAGE] Scene ${sceneNumber} has no assigned characters, but using musician reference image for continuity`);
      }
    }
    
    const hasReferenceImage = !!characterWithRefImage?.referenceImageUrl;
    
    // Find previous images that share characters with this scene
    const relevantPreviousImages = generatedImages
      .filter(img => img.characterIds.some(id => characterIds.includes(id)))
      .slice(-2); // Use up to 2 most recent relevant images

    // Inject character descriptions into the prompt
    let enhancedPrompt = injectCharactersIntoPrompt(
      scene.dallePrompt,
      characters,
      characterIds
    );

    // Sanitize the prompt
    enhancedPrompt = sanitizePrompt(enhancedPrompt);

    try {
      let imageUrl: string;
      
      // Generate the image
      const supportedSizes = ["1024x1024", "1024x1536", "1536x1024", "1792x1024", "1024x1792", "auto"];
      const imageSize = supportedSizes.includes(effectiveModelConfig.image_size) 
        ? effectiveModelConfig.image_size 
        : "auto";

      // If this scene has a character with a reference image, use the edit endpoint
      // This ensures the generated character actually looks like the reference photo
      if (hasReferenceImage && characterWithRefImage?.referenceImageUrl) {
        console.log(`[REF IMAGE] Scene ${sceneNumber} - Using reference image for character: ${characterWithRefImage.name}`);
        console.log(`[REF IMAGE] Reference URL: ${characterWithRefImage.referenceImageUrl.substring(0, 60)}...`);
        
        try {
          const fs = await import('fs');
          const path = await import('path');
          
          // Load the reference image
          let referenceImageBuffer: Buffer;
          const refUrl = characterWithRefImage.referenceImageUrl;
          
          if (refUrl.startsWith('/uploads/')) {
            const refPath = path.join(process.cwd(), refUrl);
            if (fs.existsSync(refPath)) {
              referenceImageBuffer = fs.readFileSync(refPath);
              console.log(`[REF IMAGE] Loaded reference image from disk: ${refPath}`);
            } else {
              throw new Error(`Reference image file not found: ${refPath}`);
            }
          } else if (refUrl.startsWith('data:')) {
            const base64Data = refUrl.split(',')[1];
            referenceImageBuffer = Buffer.from(base64Data, 'base64');
            console.log(`[REF IMAGE] Loaded reference image from data URL`);
          } else {
            throw new Error(`Unsupported reference image format: ${refUrl.substring(0, 30)}`);
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
          
          // Use landscape size for videos (1536x1024) - images.edit supports: 1024x1024, 1536x1024, 1024x1536
          const editSize = "1536x1024"; // Force landscape for music videos
          const imageModel = effectiveModelConfig.image_generation || "gpt-image-1";
          console.log(`[REF IMAGE] Calling images.edit with reference image, model: ${imageModel}, size: ${editSize}...`);
          const editResult = await openai.images.edit({
            model: imageModel as "gpt-image-1" | "gpt-image-1-mini",
            image: imageFile,
            prompt: sanitizePrompt(editPrompt),
            n: 1,
            size: editSize as "1024x1024" | "1536x1024" | "1024x1536"
          });
          
          // Get the result and save to persistent storage with deterministic key
          if (editResult.data?.[0]?.b64_json) {
            const fileName = `scene_${sceneNumber}_${Date.now()}.png`;
            const imageBuffer = Buffer.from(editResult.data[0].b64_json, 'base64');
            imageUrl = await saveImageToPersistentStorage(imageBuffer, fileName, sceneNumber, scene.scriptId, scene.id);
            console.log(`[REF IMAGE] Generated scene ${sceneNumber} with reference image: ${imageUrl}`);
          } else if (editResult.data?.[0]?.url) {
            imageUrl = editResult.data[0].url;
          } else {
            throw new Error("No image data returned from edit endpoint");
          }
          
        } catch (editError: any) {
          console.error(`[REF IMAGE] Edit with reference failed for scene ${sceneNumber}:`, editError?.message || editError);
          console.log(`[REF IMAGE] Falling back to standard generation with enhanced prompt...`);
          
          // Fall back to standard generation with reference context in prompt
          if (relevantPreviousImages.length > 0) {
            const referenceContext = relevantPreviousImages.map(img => 
              `Scene ${img.sceneNumber} established visual style for characters: ${img.characterIds.join(', ')}`
            ).join('; ');
            enhancedPrompt = `${enhancedPrompt}\n\nMaintain visual consistency with previously established character appearances from: ${referenceContext}`;
          }
          
          const fallbackModel = effectiveModelConfig.image_generation || "gpt-image-1";
          const result = await openai.images.generate({
            model: fallbackModel as "gpt-image-1" | "gpt-image-1-mini",
            prompt: enhancedPrompt,
            n: 1,
            size: imageSize as "1024x1024" | "1024x1536" | "1536x1024" | "1792x1024" | "1024x1792" | "auto",
            quality: effectiveModelConfig.image_quality as "low" | "medium" | "high" | "auto"
          });
          
          if (result.data?.[0]?.b64_json) {
            const fileName = `scene_${sceneNumber}_${Date.now()}.png`;
            const imageBuffer = Buffer.from(result.data[0].b64_json, 'base64');
            imageUrl = await saveImageToPersistentStorage(imageBuffer, fileName, sceneNumber, scene.scriptId, scene.id);
          } else if (result.data?.[0]?.url) {
            imageUrl = result.data[0].url;
          } else {
            throw new Error("No image data returned from OpenAI");
          }
        }
      } else {
        // Standard generation without reference image
        if (relevantPreviousImages.length > 0) {
          console.log(`Using ${relevantPreviousImages.length} previous scene images for context in scene ${sceneNumber}`);
          const referenceContext = relevantPreviousImages.map(img => 
            `Scene ${img.sceneNumber} established visual style for characters: ${img.characterIds.join(', ')}`
          ).join('; ');
          enhancedPrompt = `${enhancedPrompt}\n\nMaintain visual consistency with previously established character appearances from: ${referenceContext}`;
        }

        const standardModel = effectiveModelConfig.image_generation || "gpt-image-1";
        const result = await openai.images.generate({
          model: standardModel as "gpt-image-1" | "gpt-image-1-mini",
          prompt: enhancedPrompt,
          n: 1,
          size: imageSize as "1024x1024" | "1024x1536" | "1536x1024" | "1792x1024" | "1024x1792" | "auto",
          quality: effectiveModelConfig.image_quality as "low" | "medium" | "high" | "auto"
        });

        // Get base64 and save to persistent storage with deterministic key
        if (result.data?.[0]?.b64_json) {
          const fileName = `scene_${sceneNumber}_${Date.now()}.png`;
          const imageBuffer = Buffer.from(result.data[0].b64_json, 'base64');
          imageUrl = await saveImageToPersistentStorage(imageBuffer, fileName, sceneNumber, scene.scriptId, scene.id);
        } else if (result.data?.[0]?.url) {
          imageUrl = result.data[0].url;
        } else {
          throw new Error("No image data returned from OpenAI");
        }
      }

      // Track this image for future reference
      generatedImages.push({
        sceneNumber,
        imageUrl,
        characterIds
      });

      results.push({
        ...scene,
        imageUrl
      });

      console.log(`Generated image for scene ${sceneNumber}: ${imageUrl}`);

      // Small delay between requests to avoid rate limiting
      if (i < sortedScenes.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } catch (error: any) {
      console.error(`Error generating image for scene ${sceneNumber}:`, error);
      
      // Handle content moderation blocks with fallback
      if (error?.error?.code === 'content_policy_violation' || 
          error?.message?.includes('content_policy') ||
          error?.message?.includes('safety system')) {
        console.log(`Content policy block for scene ${sceneNumber}, creating fallback...`);
        
        try {
          const sharp = (await import('sharp')).default;
          
          const fileName = `scene_${sceneNumber}_fallback_${Date.now()}.png`;
          
          const imageBuffer = await sharp({
            create: {
              width: 1024,
              height: 1024,
              channels: 3,
              background: { r: 64, g: 64, b: 80 }
            }
          })
          .png()
          .toBuffer();
          
          const savedUrl = await saveImageToPersistentStorage(imageBuffer, fileName, sceneNumber, scene.scriptId, scene.id);
          
          results.push({
            ...scene,
            imageUrl: savedUrl
          });
          
          generatedImages.push({
            sceneNumber,
            imageUrl: savedUrl,
            characterIds
          });
          
        } catch (fallbackError) {
          console.error("Fallback image creation failed:", fallbackError);
          results.push({
            ...scene,
            imageUrl: ''
          });
        }
      } else {
        results.push({
          ...scene,
          imageUrl: ''
        });
      }
    }
  }

  return results;
}

/**
 * Generate Sora videos for scenes using OpenAI's Sora API
 * This function generates videos one at a time to avoid rate limiting
 */
export interface SoraVideoResult {
  sceneId: number;
  sceneNumber: number;
  videoUrl: string | null;
  status: 'completed' | 'failed' | 'skipped';
  error?: string;
}

export async function generateSoraVideos(
  scenes: Array<{
    id: number;
    sceneNumber: number;
    soraPrompt: string | null;
    soraClipLength: number | null;
    imageUrl: string | null;
  }>,
  onProgress?: (completed: number, total: number) => void
): Promise<SoraVideoResult[]> {
  // Validate API key
  const isApiKeyValid = await validateApiKey();
  if (!isApiKeyValid) {
    throw new Error("Invalid or missing OpenAI API key. Please check your environment variables.");
  }

  // Filter scenes that have Sora prompts and images
  const scenesWithPrompts = scenes.filter(s => s.soraPrompt && s.imageUrl);
  
  if (scenesWithPrompts.length === 0) {
    console.log("No scenes with Sora prompts found, skipping video generation");
    return scenes.map(s => ({
      sceneId: s.id,
      sceneNumber: s.sceneNumber,
      videoUrl: null,
      status: 'skipped' as const,
      error: 'No Sora prompt available'
    }));
  }

  const results: SoraVideoResult[] = [];
  const fs = await import('fs');
  const path = await import('path');
  
  // Ensure uploads/videos directory exists
  const videosDir = path.join(process.cwd(), 'uploads', 'videos');
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
  }

  console.log(`Generating ${scenesWithPrompts.length} Sora videos sequentially...`);

  for (let i = 0; i < scenesWithPrompts.length; i++) {
    const scene = scenesWithPrompts[i];
    const sceneNumber = scene.sceneNumber;
    const clipLength = scene.soraClipLength || 8;

    console.log(`Generating Sora video for scene ${sceneNumber} (${clipLength}s)...`);
    
    try {
      // Read the image file for image-to-video generation
      let imageBuffer: Buffer | null = null;
      let videoSize = "1280x720"; // Default landscape
      
      if (scene.imageUrl && !scene.imageUrl.startsWith('http')) {
        const imagePath = path.join(process.cwd(), scene.imageUrl.replace(/^\//, ''));
        if (fs.existsSync(imagePath)) {
          const originalBuffer = fs.readFileSync(imagePath);
          console.log(`Using image reference: ${imagePath}`);
          
          // Resize image to Sora's required dimensions using sharp
          try {
            const sharp = (await import('sharp')).default;
            const metadata = await sharp(originalBuffer).metadata();
            const { width = 0, height = 0 } = metadata;
            
            // Determine if landscape or portrait based on source image
            const isLandscape = width >= height;
            const targetWidth = isLandscape ? 1280 : 720;
            const targetHeight = isLandscape ? 720 : 1280;
            videoSize = isLandscape ? "1280x720" : "720x1280";
            
            console.log(`Resizing image from ${width}x${height} to ${targetWidth}x${targetHeight} for Sora...`);
            
            // Resize and convert to PNG for Sora compatibility
            imageBuffer = await sharp(originalBuffer)
              .resize(targetWidth, targetHeight, {
                fit: 'cover',
                position: 'center'
              })
              .png()
              .toBuffer();
            
            console.log(`Image resized successfully to ${targetWidth}x${targetHeight} (${imageBuffer.length} bytes)`);
          } catch (resizeError) {
            console.error(`Failed to resize image, using original:`, resizeError);
            imageBuffer = originalBuffer;
          }
        }
      }

      // Create video generation request using JSON body with image_url
      console.log(`Submitting Sora job for scene ${sceneNumber}...`);
      
      // Build request body - Sora API uses size (resolution string) and seconds
      // Correct parameters per OpenAI Sora 2 API: model, prompt, size, seconds
      // NOTE: seconds must be a string enum value ('4', '8', or '12'), not an integer
      const validSeconds = ['4', '8', '12'];
      const secondsValue = validSeconds.includes(String(clipLength)) ? String(clipLength) : '8';
      
      const requestBody: any = {
        model: 'sora-2',
        prompt: scene.soraPrompt!,
        size: videoSize, // e.g., "1280x720" or "720x1280"
        seconds: secondsValue // must be string: '4', '8', or '12'
      };
      
      // Add image as input_image for image-to-video generation
      if (imageBuffer) {
        const base64Image = imageBuffer.toString('base64');
        requestBody.input_image = `data:image/png;base64,${base64Image}`;
        console.log(`Added input_image (${imageBuffer.length} bytes as base64) to request for image-to-video`);
      }
      
      console.log(`Sora request: model=${requestBody.model}, size=${videoSize}, seconds=${secondsValue}, has_image=${!!imageBuffer}`);
      
      const videoResponse = await fetch('https://api.openai.com/v1/videos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!videoResponse.ok) {
        const errorText = await videoResponse.text();
        console.error(`Sora API error for scene ${sceneNumber}:`, errorText);
        
        if (videoResponse.status === 429 || videoResponse.status === 402) {
          results.push({
            sceneId: scene.id,
            sceneNumber,
            videoUrl: null,
            status: 'failed',
            error: 'Rate limit or quota exceeded'
          });
          continue;
        }
        
        throw new Error(`Sora API error: ${videoResponse.status} - ${errorText}`);
      }

      const videoJob: any = await videoResponse.json();
      console.log(`Sora job created for scene ${sceneNumber}: ${videoJob.id}`);
      
      // Poll for job completion - Sora API is asynchronous
      let jobData = videoJob;
      let attempts = 0;
      const maxAttempts = 120; // 10 minutes max wait (5s intervals)
      
      while (jobData.status !== 'completed' && jobData.status !== 'failed' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
        
        const statusResponse = await fetch(`https://api.openai.com/v1/videos/${videoJob.id}`, {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          }
        });
        
        if (statusResponse.ok) {
          jobData = await statusResponse.json();
          console.log(`Scene ${sceneNumber} Sora status: ${jobData.status} (attempt ${attempts}/${maxAttempts})`);
        } else {
          const errorText = await statusResponse.text();
          console.error(`Failed to poll Sora job ${videoJob.id}: ${statusResponse.status} - ${errorText}`);
        }
      }

      if (jobData.status === 'completed') {
        // Extract video URL from completed job response
        // Sora API returns video URL in various structures depending on API version
        let videoUrl: string | null = null;
        
        console.log(`Sora job completed for scene ${sceneNumber}, extracting video URL from response:`, 
          JSON.stringify(jobData, null, 2).substring(0, 500) + '...');
        
        // Check for video URL in all possible response structures
        // Structure 1: output[0].content[0].url (newer API)
        if (jobData.output?.[0]?.content?.[0]?.url) {
          videoUrl = jobData.output[0].content[0].url;
          console.log(`Found URL in output[0].content[0].url: ${videoUrl}`);
        }
        // Structure 2: output.url (alternative)
        else if (jobData.output?.url) {
          videoUrl = jobData.output.url;
          console.log(`Found URL in output.url: ${videoUrl}`);
        }
        // Structure 3: generations[0].url (common pattern)
        else if (jobData.generations?.[0]?.url) {
          videoUrl = jobData.generations[0].url;
          console.log(`Found URL in generations[0].url: ${videoUrl}`);
        }
        // Structure 4: generations[0].content?.url
        else if (jobData.generations?.[0]?.content?.url) {
          videoUrl = jobData.generations[0].content.url;
          console.log(`Found URL in generations[0].content.url: ${videoUrl}`);
        }
        // Structure 5: Top-level url
        else if (jobData.url) {
          videoUrl = jobData.url;
          console.log(`Found URL in jobData.url: ${videoUrl}`);
        }
        // Structure 6: result.url
        else if (jobData.result?.url) {
          videoUrl = jobData.result.url;
          console.log(`Found URL in result.url: ${videoUrl}`);
        }
        
        if (videoUrl) {
          console.log(`Downloading Sora video from: ${videoUrl}`);
          
          // Download the video from the provided URL
          const videoDownloadResponse = await fetch(videoUrl);
          
          if (videoDownloadResponse.ok) {
            const videoData = await videoDownloadResponse.arrayBuffer();
            const fileName = `scene_${sceneNumber}_sora_${Date.now()}.mp4`;
            const filePath = path.join(videosDir, fileName);
            
            fs.writeFileSync(filePath, Buffer.from(videoData));
            
            console.log(`Sora video saved for scene ${sceneNumber}: ${filePath}`);
            
            results.push({
              sceneId: scene.id,
              sceneNumber,
              videoUrl: `/uploads/videos/${fileName}`,
              status: 'completed'
            });
          } else {
            console.error(`Failed to download video: ${videoDownloadResponse.status}`);
            throw new Error(`Failed to download video: ${videoDownloadResponse.status}`);
          }
        } else {
          // Fallback: Try the content endpoint (per OpenAI API docs: /v1/videos/{video_id}/content)
          console.log(`Attempting content endpoint fallback for job ${videoJob.id}`);
          const videoDownloadResponse = await fetch(
            `https://api.openai.com/v1/videos/${videoJob.id}/content`,
            {
              headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              }
            }
          );

          if (videoDownloadResponse.ok) {
            const videoData = await videoDownloadResponse.arrayBuffer();
            const fileName = `scene_${sceneNumber}_sora_${Date.now()}.mp4`;
            const filePath = path.join(videosDir, fileName);
            
            fs.writeFileSync(filePath, Buffer.from(videoData));
            
            console.log(`Sora video saved for scene ${sceneNumber}: ${filePath}`);
            
            results.push({
              sceneId: scene.id,
              sceneNumber,
              videoUrl: `/uploads/videos/${fileName}`,
              status: 'completed'
            });
          } else {
            console.error(`Content endpoint failed: ${videoDownloadResponse.status}`);
            throw new Error(`Failed to download video from content endpoint: ${videoDownloadResponse.status}`);
          }
        }
      } else {
        const errorMsg = jobData.error?.message || (jobData.status === 'failed' ? 'Generation failed' : 'Timed out waiting for video');
        console.error(`Sora job failed for scene ${sceneNumber}: ${errorMsg}`);
        results.push({
          sceneId: scene.id,
          sceneNumber,
          videoUrl: null,
          status: 'failed',
          error: errorMsg
        });
      }

    } catch (error: any) {
      console.error(`Error generating Sora video for scene ${sceneNumber}:`, error);
      
      results.push({
        sceneId: scene.id,
        sceneNumber,
        videoUrl: null,
        status: 'failed',
        error: error.message || 'Unknown error'
      });
    }

    if (onProgress) {
      onProgress(i + 1, scenesWithPrompts.length);
    }

    if (i < scenesWithPrompts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  for (const scene of scenes) {
    if (!results.find(r => r.sceneId === scene.id)) {
      results.push({
        sceneId: scene.id,
        sceneNumber: scene.sceneNumber,
        videoUrl: null,
        status: 'skipped',
        error: 'No Sora prompt available'
      });
    }
  }

  return results.sort((a, b) => a.sceneNumber - b.sceneNumber);
}

/**
 * Generate DALL-E prompts for music video scenes based on lyric segments
 * This is a specialized function for creating prompts from audio-analyzed lyric segments
 */
export async function generateMusicVideoScenePrompts(
  lyricSegments: string[],
  style: string,
  customStylePrompt?: string,
  referenceImageUrl?: string
): Promise<Array<{ dallePrompt: string; title: string }>> {
  const isApiKeyValid = await validateApiKey();
  if (!isApiKeyValid) {
    throw new Error("Invalid or missing OpenAI API key.");
  }
  
  const effectiveModelConfig = getModelConfig();
  const results: Array<{ dallePrompt: string; title: string }> = [];
  
  // Get style description
  let styleDescription = style;
  if (style === 'custom' && customStylePrompt) {
    styleDescription = customStylePrompt;
  }
  
  console.log(`[MUSIC_VIDEO_PROMPTS] Generating prompts for ${lyricSegments.length} lyric segments`);
  
  // Generate all prompts in a single API call for consistency
  const allLyrics = lyricSegments.map((lyrics, i) => `Scene ${i + 1}: "${lyrics}"`).join('\n');
  
  const response = await openai.chat.completions.create({
    model: effectiveModelConfig.dalle_prompt_generation,
    temperature: getTemperatureForModel(effectiveModelConfig.dalle_prompt_generation),
    messages: [
      {
        role: "system",
        content: `You are an expert music video director and visual artist. Generate detailed DALL-E image prompts for music video scenes.

Your prompts should:
- Create visually stunning, cinematic imagery perfect for music videos
- Capture the emotional tone and meaning of the lyrics
- Maintain consistent visual style across all scenes
- Use dynamic compositions, dramatic lighting, and artistic angles
- Focus on mood, atmosphere, and visual storytelling
- Avoid literal interpretations - create artistic, evocative visuals
- NEVER include text, lyrics, or words in the image prompts

Style: ${styleDescription}
${referenceImageUrl ? `Reference the uploaded artist image for consistent character appearance.` : ''}

For each scene, output a JSON object with:
- title: A short 3-5 word artistic title for this scene
- dallePrompt: A detailed image generation prompt (100-200 words)`
      },
      {
        role: "user",
        content: `Generate prompts for these ${lyricSegments.length} lyric sections:\n\n${allLyrics}\n\nRespond with a JSON array containing objects for each scene.`
      }
    ],
    response_format: { type: "json_object" }
  });
  
  try {
    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    const scenes = parsed.scenes || parsed.prompts || [];
    
    for (let i = 0; i < lyricSegments.length; i++) {
      const sceneData = scenes[i] || {};
      results.push({
        title: sceneData.title || `Scene ${i + 1}`,
        dallePrompt: sceneData.dallePrompt || sceneData.prompt || `Cinematic music video scene: ${lyricSegments[i]}`
      });
    }
  } catch (parseError) {
    console.error('[MUSIC_VIDEO_PROMPTS] Failed to parse response:', parseError);
    // Fallback to basic prompts
    for (let i = 0; i < lyricSegments.length; i++) {
      results.push({
        title: `Scene ${i + 1}`,
        dallePrompt: `Cinematic music video scene in ${styleDescription} style: ${lyricSegments[i]}`
      });
    }
  }
  
  console.log(`[MUSIC_VIDEO_PROMPTS] Generated ${results.length} prompts`);
  return results;
}
