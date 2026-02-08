import { storage } from "../storage";
import { BasicVideoGenerator } from "./basicVideoGenerator";
import type { InsertVideoJob } from "@shared/schema";

class RenderQueueService {
  private isProcessing = false;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    await this.recoverInterruptedJobs();
    this.processNext().catch((error) => {
      console.error("[render-queue] Initial processing failed:", error);
    });
  }

  async enqueue(projectId: number, settings?: Record<string, unknown>): Promise<string> {
    const jobId = `render_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const job: InsertVideoJob = {
      id: jobId,
      projectId,
      status: "pending",
      progress: 0,
      settings: settings ?? { type: "basic", quality: "standard" },
    };

    await storage.createVideoJob(job);
    await this.processNext();
    return jobId;
  }

  private async recoverInterruptedJobs(): Promise<void> {
    const jobs = await storage.getAllVideoJobs();
    const interrupted = jobs.filter((job) => job.status === "processing");
    for (const job of interrupted) {
      await storage.updateVideoJob(job.id, {
        status: "pending",
        progress: 0,
        error: "Recovered after restart",
      });
    }
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    try {
      while (true) {
        const jobs = await storage.getAllVideoJobs();
        const pending = jobs
          .filter((job) => job.status === "pending")
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        const next = pending[0];
        if (!next) {
          return;
        }

        await storage.updateVideoJob(next.id, {
          status: "processing",
          progress: 1,
          error: null,
        });

        try {
          await BasicVideoGenerator.generateVideo(next.projectId, next.id);
        } catch (error) {
          console.error("[render-queue] Render failed:", next.id, error);
          await storage.updateVideoJob(next.id, {
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown render error",
          });
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

export const renderQueue = new RenderQueueService();
