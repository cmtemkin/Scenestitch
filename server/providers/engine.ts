import { generateDalleImages, generateSoraVideos } from "../services/openai";
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

  // Nana Banana adapter is intentionally routed to OpenAI until API credentials and SDK are finalized.
  if (imageProvider === "nanabanana-pro" && !process.env.NANABANANA_API_KEY) {
    console.warn("[providers] NANABANANA_API_KEY missing, falling back to OpenAI image generation");
  }

  return generateDalleImages(
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

  // Veo adapter placeholder. Until API integration is completed, we route through Sora.
  if (videoProvider === "veo-3.1" && !process.env.VEO_API_KEY) {
    console.warn("[providers] VEO_API_KEY missing, falling back to Sora image-to-video");
  }

  return generateSoraVideos(input.scenes);
}
