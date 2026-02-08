import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  insertBrandKitSchema,
  insertPersonaKitSchema,
  updateBrandKitSchema,
  updatePersonaKitSchema,
  applyProjectKitsSchema,
} from "@shared/schema";
import { storage } from "../storage";

type ProjectKitConfig = {
  personaKitId: number | null;
  brandKitId: number | null;
};

function readProjectKitConfig(modelSettings: unknown): ProjectKitConfig {
  if (!modelSettings || typeof modelSettings !== "object") {
    return { personaKitId: null, brandKitId: null };
  }
  const kits = (modelSettings as any).kits;
  if (!kits || typeof kits !== "object") {
    return { personaKitId: null, brandKitId: null };
  }
  return {
    personaKitId: typeof kits.personaKitId === "number" ? kits.personaKitId : null,
    brandKitId: typeof kits.brandKitId === "number" ? kits.brandKitId : null,
  };
}

export function registerKitRoutes(app: Express) {
  app.get("/api/kits/personas", async (_req: Request, res: Response) => {
    try {
      const kits = await storage.getPersonaKits();
      return res.status(200).json(kits);
    } catch (error) {
      console.error("Failed to fetch persona kits:", error);
      return res.status(500).json({ message: "Failed to fetch persona kits" });
    }
  });

  app.post("/api/kits/personas", async (req: Request, res: Response) => {
    try {
      const input = insertPersonaKitSchema.parse(req.body);
      const created = await storage.createPersonaKit(input);
      return res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid persona kit payload", errors: error.errors });
      }
      console.error("Failed to create persona kit:", error);
      return res.status(500).json({ message: "Failed to create persona kit" });
    }
  });

  app.put("/api/kits/personas/:id", async (req: Request, res: Response) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const input = updatePersonaKitSchema.parse(req.body);
      const updated = await storage.updatePersonaKit(id, input);
      if (!updated) {
        return res.status(404).json({ message: "Persona kit not found" });
      }
      return res.status(200).json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid persona kit update payload", errors: error.errors });
      }
      console.error("Failed to update persona kit:", error);
      return res.status(500).json({ message: "Failed to update persona kit" });
    }
  });

  app.delete("/api/kits/personas/:id", async (req: Request, res: Response) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const deleted = await storage.deletePersonaKit(id);
      if (!deleted) {
        return res.status(404).json({ message: "Persona kit not found" });
      }
      return res.status(200).json({ message: "Persona kit deleted" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid persona kit ID", errors: error.errors });
      }
      console.error("Failed to delete persona kit:", error);
      return res.status(500).json({ message: "Failed to delete persona kit" });
    }
  });

  app.get("/api/kits/brands", async (_req: Request, res: Response) => {
    try {
      const kits = await storage.getBrandKits();
      return res.status(200).json(kits);
    } catch (error) {
      console.error("Failed to fetch brand kits:", error);
      return res.status(500).json({ message: "Failed to fetch brand kits" });
    }
  });

  app.post("/api/kits/brands", async (req: Request, res: Response) => {
    try {
      const input = insertBrandKitSchema.parse(req.body);
      const created = await storage.createBrandKit(input);
      return res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid brand kit payload", errors: error.errors });
      }
      console.error("Failed to create brand kit:", error);
      return res.status(500).json({ message: "Failed to create brand kit" });
    }
  });

  app.put("/api/kits/brands/:id", async (req: Request, res: Response) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const input = updateBrandKitSchema.parse(req.body);
      const updated = await storage.updateBrandKit(id, input);
      if (!updated) {
        return res.status(404).json({ message: "Brand kit not found" });
      }
      return res.status(200).json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid brand kit update payload", errors: error.errors });
      }
      console.error("Failed to update brand kit:", error);
      return res.status(500).json({ message: "Failed to update brand kit" });
    }
  });

  app.delete("/api/kits/brands/:id", async (req: Request, res: Response) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const deleted = await storage.deleteBrandKit(id);
      if (!deleted) {
        return res.status(404).json({ message: "Brand kit not found" });
      }
      return res.status(200).json({ message: "Brand kit deleted" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid brand kit ID", errors: error.errors });
      }
      console.error("Failed to delete brand kit:", error);
      return res.status(500).json({ message: "Failed to delete brand kit" });
    }
  });

  app.get("/api/kits/project/:projectId", async (req: Request, res: Response) => {
    try {
      const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
      const script = await storage.getScript(projectId);
      if (!script) {
        return res.status(404).json({ message: "Project not found" });
      }

      const { personaKitId, brandKitId } = readProjectKitConfig(script.modelSettings);
      const personaKit = personaKitId ? await storage.getPersonaKit(personaKitId) : null;
      const brandKit = brandKitId ? await storage.getBrandKit(brandKitId) : null;

      return res.status(200).json({
        projectId,
        kits: {
          personaKitId,
          brandKitId,
        },
        personaKit,
        brandKit,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid project ID", errors: error.errors });
      }
      console.error("Failed to fetch project kits:", error);
      return res.status(500).json({ message: "Failed to fetch project kits" });
    }
  });

  app.put("/api/kits/project/:projectId", async (req: Request, res: Response) => {
    try {
      const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
      const payload = applyProjectKitsSchema.parse({
        ...req.body,
        projectId,
      });

      const script = await storage.getScript(projectId);
      if (!script) {
        return res.status(404).json({ message: "Project not found" });
      }

      if (payload.personaKitId) {
        const persona = await storage.getPersonaKit(payload.personaKitId);
        if (!persona) {
          return res.status(404).json({ message: "Persona kit not found" });
        }
      }
      if (payload.brandKitId) {
        const brand = await storage.getBrandKit(payload.brandKitId);
        if (!brand) {
          return res.status(404).json({ message: "Brand kit not found" });
        }
      }

      const current = (script.modelSettings as Record<string, unknown> | null) ?? {};
      const next = {
        ...current,
        kits: {
          personaKitId: payload.personaKitId ?? null,
          brandKitId: payload.brandKitId ?? null,
        },
      };
      await storage.updateScript(projectId, { modelSettings: next });

      return res.status(200).json({
        projectId,
        kits: next.kits,
        message: "Project kits updated",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid project kit payload", errors: error.errors });
      }
      console.error("Failed to update project kits:", error);
      return res.status(500).json({ message: "Failed to update project kits" });
    }
  });
}
