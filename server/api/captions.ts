import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";

type CaptionFormat = "srt" | "vtt";

interface CaptionCue {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

export function registerCaptionRoutes(app: Express) {
  app.get("/api/captions/:projectId.:format", async (req: Request, res: Response) => {
    try {
      const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
      const format = z.enum(["srt", "vtt"]).parse(req.params.format) as CaptionFormat;

      const script = await storage.getScript(projectId);
      if (!script) {
        return res.status(404).json({ message: "Project not found" });
      }

      const scenes = (await storage.getScenesByScriptId(projectId)).sort((a, b) => a.sceneNumber - b.sceneNumber);
      if (!scenes.length) {
        return res.status(404).json({ message: "No scenes found for project" });
      }

      const cues = buildCues(scenes);
      const body = format === "srt" ? toSrt(cues) : toVtt(cues);

      res.setHeader("Content-Type", format === "srt" ? "application/x-subrip; charset=utf-8" : "text/vtt; charset=utf-8");
      res.setHeader("Content-Disposition", `inline; filename=project-${projectId}-captions.${format}`);
      return res.status(200).send(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid caption request", errors: error.errors });
      }
      console.error("Failed to generate captions:", error);
      return res.status(500).json({ message: "Failed to generate captions" });
    }
  });
}

function buildCues(
  scenes: Array<{
    sceneNumber: number;
    scriptExcerpt: string;
    overlayText: string | null;
    exactStartTime: number | null;
    exactEndTime: number | null;
    estimatedDuration: number | null;
  }>
): CaptionCue[] {
  let cursor = 0;
  const cues: CaptionCue[] = [];

  for (let index = 0; index < scenes.length; index++) {
    const scene = scenes[index];
    const explicitStart = normalizeTimestamp(scene.exactStartTime);
    const explicitEnd = normalizeTimestamp(scene.exactEndTime);
    const duration = Math.max(1, scene.estimatedDuration || 4);

    const startSec = explicitStart ?? cursor;
    const endSec = explicitEnd && explicitEnd > startSec ? explicitEnd : startSec + duration;
    cursor = endSec;

    const text = (scene.overlayText || scene.scriptExcerpt || "").trim();
    if (!text) {
      continue;
    }

    cues.push({
      index: cues.length + 1,
      startSec,
      endSec,
      text: text.replace(/\s+/g, " "),
    });
  }

  return cues;
}

function normalizeTimestamp(value: number | null): number | null {
  if (value === null || value === undefined) return null;
  // Values above 1000 are treated as milliseconds.
  return value > 1000 ? value / 1000 : value;
}

function toSrt(cues: CaptionCue[]): string {
  return cues
    .map((cue) => `${cue.index}\n${formatTimestamp(cue.startSec, "srt")} --> ${formatTimestamp(cue.endSec, "srt")}\n${cue.text}\n`)
    .join("\n");
}

function toVtt(cues: CaptionCue[]): string {
  const body = cues
    .map((cue) => `${formatTimestamp(cue.startSec, "vtt")} --> ${formatTimestamp(cue.endSec, "vtt")}\n${cue.text}\n`)
    .join("\n");
  return `WEBVTT\n\n${body}`;
}

function formatTimestamp(seconds: number, format: CaptionFormat): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hrs = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  const separator = format === "srt" ? "," : ".";
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}${separator}${pad(ms, 3)}`;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}
