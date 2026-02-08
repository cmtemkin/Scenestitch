import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  projectProviderConfigSchema,
  updateProjectProviderConfigSchema,
  type ProjectProviderConfig,
} from "@shared/schema";
import { storage } from "../storage";
import { getDefaultProviderConfig, getProviderCatalog } from "../providers/registry";

function readProviderConfig(modelSettings: unknown): ProjectProviderConfig {
  if (!modelSettings || typeof modelSettings !== "object") {
    return getDefaultProviderConfig();
  }

  const settings = modelSettings as Record<string, unknown>;
  const parsed = projectProviderConfigSchema.safeParse(settings.providerConfig);
  if (!parsed.success) {
    return getDefaultProviderConfig();
  }

  return parsed.data;
}

export function registerProviderRoutes(app: Express) {
  app.get("/api/providers", (_req: Request, res: Response) => {
    const catalog = getProviderCatalog();
    return res.status(200).json(catalog);
  });

  app.get("/api/providers/project/:projectId", async (req: Request, res: Response) => {
    try {
      const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
      const script = await storage.getScript(projectId);
      if (!script) {
        return res.status(404).json({ message: "Project not found" });
      }

      const providers = readProviderConfig(script.modelSettings);
      return res.status(200).json({
        projectId,
        providers,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid project ID", errors: error.errors });
      }
      console.error("Failed to fetch provider config:", error);
      return res.status(500).json({ message: "Failed to fetch provider config" });
    }
  });

  app.put("/api/providers/project/:projectId", async (req: Request, res: Response) => {
    try {
      const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
      const payload = updateProjectProviderConfigSchema.parse({
        projectId,
        providers: req.body?.providers ?? req.body,
      });

      const script = await storage.getScript(payload.projectId);
      if (!script) {
        return res.status(404).json({ message: "Project not found" });
      }

      const existingModelSettings =
        script.modelSettings && typeof script.modelSettings === "object"
          ? (script.modelSettings as Record<string, unknown>)
          : {};

      const updatedScript = await storage.updateScript(payload.projectId, {
        modelSettings: {
          ...existingModelSettings,
          providerConfig: payload.providers,
        },
      });

      return res.status(200).json({
        projectId,
        providers: readProviderConfig(updatedScript?.modelSettings),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid provider configuration", errors: error.errors });
      }
      console.error("Failed to update provider config:", error);
      return res.status(500).json({ message: "Failed to update provider config" });
    }
  });

  app.get("/api/providers/project/:projectId/readiness", async (req: Request, res: Response) => {
    try {
      const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
      const script = await storage.getScript(projectId);
      if (!script) {
        return res.status(404).json({ message: "Project not found" });
      }

      const providers = readProviderConfig(script.modelSettings);
      const catalog = getProviderCatalog();
      const byKind = {
        image: catalog.providers.find((provider) => provider.kind === "image" && provider.id === providers.image),
        tts: catalog.providers.find((provider) => provider.kind === "tts" && provider.id === providers.tts),
        imageToVideo: catalog.providers.find(
          (provider) => provider.kind === "image_to_video" && provider.id === providers.imageToVideo
        ),
      };

      return res.status(200).json({
        projectId,
        providers,
        readiness: {
          image: byKind.image?.status ?? "missing_api_key",
          tts: byKind.tts?.status ?? "missing_api_key",
          imageToVideo: byKind.imageToVideo?.status ?? "missing_api_key",
        },
        recommendation:
          byKind.image?.status === "configured" &&
          byKind.tts?.status === "configured" &&
          byKind.imageToVideo?.status === "configured"
            ? "configured"
            : "fallback_recommended",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid project ID", errors: error.errors });
      }
      console.error("Failed to fetch provider readiness:", error);
      return res.status(500).json({ message: "Failed to fetch provider readiness" });
    }
  });
}
