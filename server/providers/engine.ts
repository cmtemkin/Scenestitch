import { generateDalleImages, generateSoraVideos, saveImageToPersistentStorage } from "../services/openai";
import { generateTTS } from "../services/ttsService";
import { ElevenLabsService } from "../services/elevenLabsService";
import type { ProjectProviderConfig } from "@shared/schema";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const elevenLabsService = new ElevenLabsService();

export interface ImageGenerationInput {
  scriptId: number;
  style: string;
  customStylePrompt?: string;
  maintainContinuity?: boolean;
  referenceImageUrl?: string;
  scenes: Array<{
    id?: number;
    sceneNumber?: number;
    scriptId?: number;
    title?: string;
    content: string;
    dallePrompt: string;
  }>;
  modelSettings?: unknown;
}

export interface NarrationInput {
  text: string;
  voice?: string;
  model?: "gpt-4o-mini-tts" | "tts-1" | "tts-1-hd";
  elevenLabsVoiceId?: string;
}

export interface ImageToVideoInput {
  scenes: Array<{
    id: number;
    sceneNumber: number;
    soraPrompt: string | null;
    soraClipLength: number | null;
    imageUrl: string | null;
  }>;
}

interface VeoSceneResult {
  sceneId: number;
  sceneNumber: number;
  videoUrl: string | null;
  status: "completed" | "failed" | "skipped";
  error?: string;
}

function resolveImageProvider(config: ProjectProviderConfig): "openai" | "nanabanana-pro" {
  return config.image === "nanabanana-pro" ? "nanabanana-pro" : "openai";
}

function resolveTtsProvider(config: ProjectProviderConfig): "openai" | "elevenlabs" {
  return config.tts === "elevenlabs" ? "elevenlabs" : "openai";
}

function resolveImageToVideoProvider(config: ProjectProviderConfig): "sora-2" | "veo-3.1" {
  return config.imageToVideo === "veo-3.1" ? "veo-3.1" : "sora-2";
}

export async function generateImagesWithProvider(
  providerConfig: ProjectProviderConfig,
  input: ImageGenerationInput
) {
  const imageProvider = resolveImageProvider(providerConfig);
  const openAiFallback = () =>
    generateDalleImages(
      input.scenes.map((scene) => ({
        content: scene.content,
        dallePrompt: scene.dallePrompt,
        title: scene.title,
        id: scene.id,
        sceneNumber: scene.sceneNumber,
        scriptId: scene.scriptId ?? input.scriptId,
      })),
      input.style,
      input.maintainContinuity ?? true,
      input.referenceImageUrl,
      input.customStylePrompt,
      input.modelSettings
    );

  if (imageProvider !== "nanabanana-pro") {
    return openAiFallback();
  }

  const apiKey = process.env.NANABANANA_API_KEY;
  const apiUrl = process.env.NANABANANA_API_URL || "https://api.nanabanana.ai/v1/images/generate";
  if (!apiKey) {
    if (providerConfig.enableFallbacks) {
      console.warn("[providers] NANABANANA_API_KEY missing, falling back to OpenAI image generation");
      return openAiFallback();
    }
    throw new Error("NANABANANA_API_KEY is required when image provider is nanabanana-pro");
  }

  try {
    const results = await Promise.all(
      input.scenes.map(async (scene) => {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            prompt: scene.dallePrompt,
            style: input.style,
            customStylePrompt: input.customStylePrompt,
            referenceImageUrl: input.referenceImageUrl,
            size: getImageSize(input.modelSettings),
            quality: getImageQuality(input.modelSettings),
          }),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Nana Banana API error (${response.status}): ${body}`);
        }

        const payload = (await response.json()) as any;
        const directUrl =
          payload?.url ||
          payload?.imageUrl ||
          payload?.image_url ||
          payload?.output?.[0]?.url ||
          payload?.data?.[0]?.url ||
          null;
        const imageBase64 =
          payload?.b64_json ||
          payload?.image_base64 ||
          payload?.data?.[0]?.b64_json ||
          null;

        let imageUrl: string | null = directUrl;
        if (!imageUrl && imageBase64) {
          const imageBuffer = Buffer.from(imageBase64, "base64");
          const filename = `nanabanana_scene_${scene.sceneNumber || "x"}_${Date.now()}.png`;
          imageUrl = await saveImageToPersistentStorage(
            imageBuffer,
            filename,
            scene.sceneNumber,
            scene.scriptId ?? input.scriptId,
            scene.id
          );
        }

        if (!imageUrl) {
          throw new Error("Nana Banana response did not include an image url or base64 payload");
        }

        return {
          ...scene,
          imageUrl,
        };
      })
    );

    return results;
  } catch (error) {
    if (providerConfig.enableFallbacks) {
      console.warn("[providers] Nana Banana request failed, falling back to OpenAI:", error);
      return openAiFallback();
    }
    throw error;
  }
}

export async function generateNarrationWithProvider(
  providerConfig: ProjectProviderConfig,
  input: NarrationInput
) {
  const ttsProvider = resolveTtsProvider(providerConfig);

  if (ttsProvider === "elevenlabs") {
    if (!input.elevenLabsVoiceId) {
      throw new Error("ElevenLabs provider selected but no voice ID provided");
    }
    if (!elevenLabsService.isConfigured()) {
      throw new Error("ElevenLabs provider selected but ELEVENLABS_API_KEY is missing");
    }

    const response = await elevenLabsService.generateSpeech(input.text, input.elevenLabsVoiceId);
    const uploadsDir = path.join(process.cwd(), "uploads", "audio");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const filename = `tts_${uuidv4()}.mp3`;
    const filepath = path.join(uploadsDir, filename);
    fs.writeFileSync(filepath, response.audioBuffer);

    const fileSize = fs.statSync(filepath).size;
    const wordCount = input.text.split(/\s+/).filter(Boolean).length;
    const estimatedDuration = Math.max(1, Math.round((wordCount / 150) * 60));

    return {
      provider: "elevenlabs" as const,
      audioUrl: `/uploads/audio/${filename}`,
      duration: estimatedDuration,
      fileSize,
      contentType: response.contentType,
    };
  }

  const result = await generateTTS({
    model: input.model ?? "gpt-4o-mini-tts",
    voice: (input.voice as
      | "alloy"
      | "ash"
      | "ballad"
      | "coral"
      | "echo"
      | "fable"
      | "nova"
      | "onyx"
      | "sage"
      | "shimmer") ?? "alloy",
    input: input.text,
  });

  return {
    provider: "openai" as const,
    audioUrl: result.audioUrl,
    duration: result.duration,
    fileSize: result.fileSize,
  };
}

export async function generateImageToVideoWithProvider(
  providerConfig: ProjectProviderConfig,
  input: ImageToVideoInput
) {
  const videoProvider = resolveImageToVideoProvider(providerConfig);
  const soraFallback = () => generateSoraVideos(input.scenes);

  if (videoProvider !== "veo-3.1") {
    return soraFallback();
  }

  const apiKey = process.env.VEO_API_KEY;
  const apiUrl = process.env.VEO_API_URL;

  if (!apiKey || !apiUrl) {
    if (providerConfig.enableFallbacks) {
      console.warn("[providers] VEO_API_KEY or VEO_API_URL missing, falling back to Sora image-to-video");
      return soraFallback();
    }
    throw new Error("VEO_API_KEY and VEO_API_URL are required when imageToVideo provider is veo-3.1");
  }

  try {
    const results: VeoSceneResult[] = [];

    for (const scene of input.scenes) {
      if (!scene.soraPrompt || !scene.imageUrl) {
        results.push({
          sceneId: scene.id,
          sceneNumber: scene.sceneNumber,
          videoUrl: null,
          status: "skipped",
          error: "Missing prompt or source image",
        });
        continue;
      }

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          prompt: scene.soraPrompt,
          imageUrl: scene.imageUrl,
          durationSeconds: scene.soraClipLength || 8,
          aspectRatio: scene.imageUrl.includes("1024x1536") ? "9:16" : "16:9",
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Veo API error (${response.status}): ${body}`);
      }

      const payload = (await response.json()) as any;
      const videoUrl =
        payload?.videoUrl ||
        payload?.video_url ||
        payload?.output?.video_url ||
        payload?.data?.[0]?.video_url ||
        payload?.data?.[0]?.url ||
        null;

      if (!videoUrl) {
        throw new Error("Veo response did not include a video url");
      }

      results.push({
        sceneId: scene.id,
        sceneNumber: scene.sceneNumber,
        videoUrl,
        status: "completed",
      });
    }

    return results;
  } catch (error) {
    if (providerConfig.enableFallbacks) {
      console.warn("[providers] Veo request failed, falling back to Sora:", error);
      return soraFallback();
    }
    throw error;
  }
}

function getImageSize(modelSettings: unknown): string {
  if (!modelSettings || typeof modelSettings !== "object") {
    return "1536x1024";
  }
  const value = (modelSettings as Record<string, unknown>).image_size;
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return "1536x1024";
}

function getImageQuality(modelSettings: unknown): string {
  if (!modelSettings || typeof modelSettings !== "object") {
    return "high";
  }
  const value = (modelSettings as Record<string, unknown>).image_quality;
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return "high";
}
