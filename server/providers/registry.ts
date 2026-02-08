import { projectProviderConfigSchema, type ProjectProviderConfig } from "@shared/schema";
import type { ProviderCatalog, ProviderDescriptor, ProviderStatus } from "./types";

const DEFAULT_PROVIDER_CONFIG: ProjectProviderConfig = projectProviderConfigSchema.parse({
  image: "openai",
  tts: "openai",
  imageToVideo: "sora-2",
  enableFallbacks: true,
});

function resolveStatus(requiredEnvVars: string[], fallback: ProviderStatus = "planned"): ProviderStatus {
  if (requiredEnvVars.length === 0) {
    return fallback;
  }

  const hasAnyKey = requiredEnvVars.some((envVar) => {
    const value = process.env[envVar];
    return typeof value === "string" && value.trim().length > 0;
  });

  return hasAnyKey ? "configured" : "missing_api_key";
}

const CATALOG_PROVIDERS: ProviderDescriptor[] = [
  {
    id: "openai",
    label: "OpenAI Images",
    kind: "image",
    requiredEnvVars: ["OPENAI_API_KEY", "VITE_OPENAI_API_KEY"],
    status: resolveStatus(["OPENAI_API_KEY", "VITE_OPENAI_API_KEY"]),
    capabilities: [
      { key: "image.generate", description: "Generate scene images from prompts" },
    ],
  },
  {
    id: "nanabanana-pro",
    label: "Nana Banana Pro",
    kind: "image",
    requiredEnvVars: ["NANABANANA_API_KEY"],
    status: resolveStatus(["NANABANANA_API_KEY"], "planned"),
    capabilities: [
      { key: "image.generate", description: "Alternative image model provider" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI TTS",
    kind: "tts",
    requiredEnvVars: ["OPENAI_API_KEY", "VITE_OPENAI_API_KEY"],
    status: resolveStatus(["OPENAI_API_KEY", "VITE_OPENAI_API_KEY"]),
    capabilities: [
      { key: "tts.generate", description: "Generate narration audio tracks" },
    ],
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs TTS",
    kind: "tts",
    requiredEnvVars: ["ELEVENLABS_API_KEY"],
    status: resolveStatus(["ELEVENLABS_API_KEY"]),
    capabilities: [
      { key: "tts.generate", description: "Generate expressive voice narration" },
    ],
  },
  {
    id: "sora-2",
    label: "Sora 2 (Image-to-Video)",
    kind: "image_to_video",
    requiredEnvVars: ["OPENAI_API_KEY", "VITE_OPENAI_API_KEY"],
    status: resolveStatus(["OPENAI_API_KEY", "VITE_OPENAI_API_KEY"]),
    capabilities: [
      { key: "video.image_to_video", description: "Convert scene images into clips" },
    ],
  },
  {
    id: "veo-3.1",
    label: "Veo 3.1 (Image-to-Video)",
    kind: "image_to_video",
    requiredEnvVars: ["VEO_API_KEY", "VEO_API_URL"],
    status: resolveStatus(["VEO_API_KEY", "VEO_API_URL"], "planned"),
    capabilities: [
      { key: "video.image_to_video", description: "Alternative image-to-video provider" },
    ],
  },
];

export function getProviderCatalog(): ProviderCatalog {
  return {
    providers: CATALOG_PROVIDERS,
    defaultConfig: DEFAULT_PROVIDER_CONFIG,
  };
}

export function getDefaultProviderConfig(): ProjectProviderConfig {
  return DEFAULT_PROVIDER_CONFIG;
}
