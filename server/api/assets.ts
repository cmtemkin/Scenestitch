import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";

type AssetKind = "image" | "audio" | "video" | "caption";

interface ProjectAsset {
  id: string;
  projectId: number;
  kind: AssetKind;
  url: string;
  sceneId?: number;
  sceneNumber?: number;
  createdAt?: Date;
  metadata?: Record<string, unknown>;
}

function normalizeSceneImageAsset(projectId: number, scene: any): ProjectAsset | null {
  if (!scene.imageUrl) {
    return null;
  }

  return {
    id: `img-${scene.id}`,
    projectId,
    kind: "image",
    url: scene.imageUrl,
    sceneId: scene.id,
    sceneNumber: scene.sceneNumber,
    metadata: {
      title: scene.title,
      prompt: scene.dallePrompt,
      storageKey: scene.imageStorageKey ?? null,
      checksum: scene.imageChecksum ?? null,
      verified: scene.imageVerified ?? null,
    },
  };
}

export function registerAssetRoutes(app: Express) {
  app.get("/api/assets", async (req: Request, res: Response) => {
    try {
      const projectId = z.coerce.number().int().positive().parse(req.query.projectId);
      const script = await storage.getScript(projectId);

      if (!script) {
        return res.status(404).json({ message: "Project not found" });
      }

      const scenes = await storage.getScenesByScriptId(projectId);
      const videoJobs = await storage.getVideoJobsByProject(projectId);

      const assets: ProjectAsset[] = [];

      for (const scene of scenes) {
        const imageAsset = normalizeSceneImageAsset(projectId, scene);
        if (imageAsset) {
          assets.push(imageAsset);
        }
      }

      if (script.audioTTSId) {
        const audio = await storage.getAudioTTS(script.audioTTSId);
        if (audio?.audioUrl) {
          assets.push({
            id: `audio-${audio.id}`,
            projectId,
            kind: "audio",
            url: audio.audioUrl,
            createdAt: audio.createdAt,
            metadata: {
              title: audio.title,
              voice: audio.voice,
              model: audio.model,
              duration: audio.duration,
              fileSize: audio.fileSize,
              status: audio.status,
            },
          });
        }
      }

      for (const job of videoJobs) {
        if (!job.videoUrl) {
          continue;
        }

        assets.push({
          id: `video-${job.id}`,
          projectId,
          kind: "video",
          url: job.videoUrl,
          createdAt: job.createdAt,
          metadata: {
            status: job.status,
            progress: job.progress,
            duration: job.duration,
            fileSize: job.fileSize,
            completedAt: job.completedAt,
            settings: job.settings,
          },
        });
      }

      return res.status(200).json({
        projectId,
        count: assets.length,
        assets,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid project ID", errors: error.errors });
      }
      console.error("Failed to fetch assets:", error);
      return res.status(500).json({ message: "Failed to fetch assets" });
    }
  });
}
