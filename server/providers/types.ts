import type { ProjectProviderConfig } from "@shared/schema";

export type ProviderKind = "image" | "tts" | "image_to_video";
export type ProviderStatus = "configured" | "missing_api_key" | "planned";

export interface ProviderCapability {
  key: "image.generate" | "tts.generate" | "video.image_to_video";
  description: string;
}

export interface ProviderDescriptor {
  id: string;
  label: string;
  kind: ProviderKind;
  status: ProviderStatus;
  requiredEnvVars: string[];
  capabilities: ProviderCapability[];
}

export interface ProviderCatalog {
  providers: ProviderDescriptor[];
  defaultConfig: ProjectProviderConfig;
}
