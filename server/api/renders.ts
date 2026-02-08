import type { Express, Request, Response } from "express";
import { z } from "zod";
import { createRenderSchema, type VideoJob } from "@shared/schema";
import { storage } from "../storage";
import { renderQueue } from "../services/renderQueue";

function mapVideoJobToRender(job: VideoJob) {
  return {
    id: job.id,
    projectId: job.projectId,
    status: job.status,
    progress: job.progress,
    outputUrl: job.videoUrl,
    duration: job.duration,
    fileSize: job.fileSize,
    settings: job.settings,
    error: job.error,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  };
}

export function registerRenderRoutes(app: Express) {
  app.get("/api/renders", async (req: Request, res: Response) => {
    try {
      const projectIdRaw = req.query.projectId;
      if (projectIdRaw) {
        const projectId = z.coerce.number().int().positive().parse(projectIdRaw);
        const projectJobs = await storage.getVideoJobsByProject(projectId);
        return res.status(200).json(projectJobs.map(mapVideoJobToRender));
      }

      const jobs = await storage.getAllVideoJobs();
      return res.status(200).json(jobs.map(mapVideoJobToRender));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid project ID", errors: error.errors });
      }
      console.error("Failed to fetch renders:", error);
      return res.status(500).json({ message: "Failed to fetch renders" });
    }
  });

  app.get("/api/renders/:renderId", async (req: Request, res: Response) => {
    try {
      const renderId = z.string().min(1).parse(req.params.renderId);
      const job = await storage.getVideoJob(renderId);
      if (!job) {
        return res.status(404).json({ message: "Render not found" });
      }
      return res.status(200).json(mapVideoJobToRender(job));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid render ID", errors: error.errors });
      }
      console.error("Failed to fetch render:", error);
      return res.status(500).json({ message: "Failed to fetch render" });
    }
  });

  app.post("/api/renders", async (req: Request, res: Response) => {
    try {
      const data = createRenderSchema.parse(req.body);

      const project = await storage.getScript(data.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const scenes = await storage.getScenesByScriptId(data.projectId);
      const scenesWithImages = scenes.filter((scene) => !!scene.imageUrl);
      if (scenesWithImages.length === 0) {
        return res.status(400).json({
          message: "Project must have at least one generated image before rendering",
        });
      }

      if (!project.audioTTSId) {
        return res.status(400).json({
          message: "Project must have a narration track before rendering",
        });
      }

      const jobId = await renderQueue.enqueue(data.projectId, {
        ...(data.settings ?? {}),
        format: data.format,
        contentType: data.contentType,
        includeCaptions: data.includeCaptions,
      });

      const createdJob = await storage.getVideoJob(jobId);
      return res.status(202).json({
        message: "Render started",
        render: createdJob ? mapVideoJobToRender(createdJob) : { id: jobId },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid render request", errors: error.errors });
      }
      console.error("Failed to start render:", error);
      return res.status(500).json({
        message: "Failed to start render",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
