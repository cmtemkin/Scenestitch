import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  generateHookVariantsSchema,
  generateComedyTimingSchema,
  repurposeShortsSchema,
} from "@shared/schema";
import { storage } from "../storage";
import { generateComedyTiming, generateHookVariants } from "../services/contentIntelligence";

export function registerIntelligenceRoutes(app: Express) {
  app.post("/api/intelligence/hooks", async (req: Request, res: Response) => {
    try {
      const input = generateHookVariantsSchema.parse(req.body);
      const hooks = await generateHookVariants(input);
      return res.status(200).json({ hooks });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid hook generation request", errors: error.errors });
      }
      console.error("Failed to generate hooks:", error);
      return res.status(500).json({ message: "Failed to generate hooks" });
    }
  });

  app.post("/api/intelligence/comedy-timing", async (req: Request, res: Response) => {
    try {
      const input = generateComedyTimingSchema.parse(req.body);
      const timing = generateComedyTiming(input);
      return res.status(200).json({ timing });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid comedy timing request", errors: error.errors });
      }
      console.error("Failed to generate comedy timing:", error);
      return res.status(500).json({ message: "Failed to generate comedy timing" });
    }
  });

  app.post("/api/intelligence/repurpose-shorts", async (req: Request, res: Response) => {
    try {
      const input = repurposeShortsSchema.parse(req.body);
      const scenes = await storage.getScenesByScriptId(input.projectId);
      if (!scenes.length) {
        return res.status(404).json({ message: "No scenes found for project" });
      }

      const targetCount = Math.min(input.maxClips, scenes.length);
      const chunkSize = Math.max(1, Math.ceil(scenes.length / targetCount));
      const clips = [];

      for (let index = 0; index < targetCount; index++) {
        const chunk = scenes.slice(index * chunkSize, index * chunkSize + chunkSize);
        if (!chunk.length) {
          continue;
        }

        const startScene = chunk[0];
        const endScene = chunk[chunk.length - 1];
        const scriptExcerpt = chunk.map((scene) => scene.scriptExcerpt).join(" ").slice(0, 300);
        clips.push({
          clipNumber: index + 1,
          projectId: input.projectId,
          sceneRange: [startScene.sceneNumber, endScene.sceneNumber],
          targetDurationSec: input.targetDurationSec,
          hook: scriptExcerpt.split(/[.!?]/)[0] || scriptExcerpt,
          captionSeed: scriptExcerpt,
          sourceSceneIds: chunk.map((scene) => scene.id),
        });
      }

      return res.status(200).json({
        projectId: input.projectId,
        clips,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid repurpose request", errors: error.errors });
      }
      console.error("Failed to repurpose shorts:", error);
      return res.status(500).json({ message: "Failed to repurpose shorts" });
    }
  });
}
