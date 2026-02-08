import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { storage } from '../storage';

const execAsync = promisify(exec);

export class BasicVideoGenerator {
  static async generateVideo(projectId: number, existingJobId?: string): Promise<string> {
    const jobId = existingJobId ?? `basic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tmpDir = path.join(process.cwd(), 'uploads', 'videos', `tmp_${jobId}`);
    
    try {
      if (!existingJobId) {
        await storage.createVideoJob({
          id: jobId,
          projectId,
          status: 'processing',
          progress: 0,
          settings: { type: 'basic', quality: 'standard' }
        });
      } else {
        await storage.updateVideoJob(jobId, {
          projectId,
          status: 'processing',
          progress: 0,
          error: null
        });
      }

      console.log(`Starting basic video generation for project ${projectId}`);
      await storage.updateVideoJob(jobId, { progress: 10 });
      const jobRecord = await storage.getVideoJob(jobId);
      const settings = (jobRecord?.settings as Record<string, unknown>) || {};

      // Get project and audio info
      const project = await storage.getScript(projectId);
      if (!project?.audioTTSId) {
        throw new Error('Project missing audio');
      }

      const audioRecord = await storage.getAudioTTS(project.audioTTSId);
      if (!audioRecord?.audioUrl) {
        throw new Error('Audio file not found');
      }

      const allScenes = await storage.getScenesByScriptId(projectId);
      const sceneRange = parseSceneRange(settings.sceneRange);
      const scenes = allScenes
        .filter((scene) => !!scene.imageUrl)
        .filter((scene) => {
          if (!sceneRange) return true;
          return scene.sceneNumber >= sceneRange.start && scene.sceneNumber <= sceneRange.end;
        })
        .sort((a, b) => a.sceneNumber - b.sceneNumber);

      if (!scenes.length) {
        throw new Error('No scene images found');
      }

      const audioPath = path.join(process.cwd(), audioRecord.audioUrl.replace(/^\//, ''));
      const outputPath = `./uploads/videos/video_${jobId}.mp4`;

      const dimensions = getRenderDimensions(settings);
      const fps = getFps(settings);
      const durations = buildSceneDurations(scenes, audioRecord.duration || undefined);

      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.mkdir(tmpDir, { recursive: true });

      console.log(`Creating multi-scene video: ${scenes.length} scenes + audio`);
      await storage.updateVideoJob(jobId, { progress: 30 });

      // Check if files exist
      try {
        await fs.access(audioPath);
      } catch (error) {
        throw new Error('Audio file not accessible');
      }

      const normalizedImagePaths: string[] = [];
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const framePath = path.join(tmpDir, `frame_${String(i + 1).padStart(4, '0')}.jpg`);
        await normalizeSceneImage({
          sourceUrl: scene.imageUrl!,
          outputPath: framePath,
          width: dimensions.width,
          height: dimensions.height,
        });
        normalizedImagePaths.push(framePath);
      }

      const concatFilePath = path.join(tmpDir, 'concat.txt');
      await fs.writeFile(
        concatFilePath,
        buildConcatManifest(normalizedImagePaths, durations),
        'utf8'
      );

      await storage.updateVideoJob(jobId, { progress: 50 });

      const quality = getQuality(settings);
      const ffmpegCmd = [
        'ffmpeg -y',
        `-f concat -safe 0 -i "${concatFilePath}"`,
        `-i "${audioPath}"`,
        `-r ${fps}`,
        `-c:v libx264 -crf ${quality.crf} -preset ${quality.preset}`,
        '-c:a aac',
        '-b:a 192k -pix_fmt yuv420p',
        '-movflags +faststart',
        '-shortest',
        `"${outputPath}"`
      ].join(' ');

      console.log('Executing FFmpeg...');
      const { stdout, stderr } = await execAsync(ffmpegCmd);
      
      if (stderr && !stderr.includes('time=')) {
        console.log('FFmpeg stderr:', stderr);
      }

      await storage.updateVideoJob(jobId, { progress: 90 });

      // Verify output file
      const stats = await fs.stat(outputPath);
      if (stats.size === 0) {
        throw new Error('Generated video file is empty');
      }

      await storage.updateVideoJob(jobId, { 
        status: 'completed', 
        progress: 100,
        videoUrl: `/uploads/videos/video_${jobId}.mp4`,
        fileSize: stats.size
      });

      await fs.rm(tmpDir, { recursive: true, force: true });
      console.log(`Basic video completed: ${stats.size} bytes`);
      return jobId;

    } catch (error) {
      console.error('Basic video generation error:', error);
      await storage.updateVideoJob(jobId, { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      await fs.rm(tmpDir, { recursive: true, force: true });
      throw error;
    }
  }
}

function getRenderDimensions(settings: Record<string, unknown>) {
  const format = settings.format === 'portrait-9-16' ? 'portrait' : 'landscape';
  const resolution = typeof settings.resolution === 'string' ? settings.resolution : '1080p';

  if (format === 'portrait') {
    if (resolution === '720p') return { width: 720, height: 1280 };
    if (resolution === '1440p') return { width: 1440, height: 2560 };
    return { width: 1080, height: 1920 };
  }

  if (resolution === '720p') return { width: 1280, height: 720 };
  if (resolution === '1440p') return { width: 2560, height: 1440 };
  return { width: 1920, height: 1080 };
}

function getFps(settings: Record<string, unknown>) {
  const fps = settings.fps;
  if (typeof fps === 'number' && fps >= 24 && fps <= 60) {
    return fps;
  }
  return 30;
}

function getQuality(settings: Record<string, unknown>) {
  const quality = settings.quality;
  if (quality === 'low') return { crf: 28, preset: 'veryfast' };
  if (quality === 'medium') return { crf: 24, preset: 'faster' };
  return { crf: 20, preset: 'medium' };
}

function normalizeTimeValue(value: number | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  // Heuristic: scene timestamps beyond 1000 are likely stored as milliseconds.
  return value > 1000 ? value / 1000 : value;
}

function buildSceneDurations(
  scenes: Array<{ exactStartTime: number | null; exactEndTime: number | null; estimatedDuration: number | null }>,
  audioDurationSec?: number
): number[] {
  const rawDurations = scenes.map((scene) => {
    const start = normalizeTimeValue(scene.exactStartTime);
    const end = normalizeTimeValue(scene.exactEndTime);
    if (start !== null && end !== null && end > start) {
      return Math.max(0.8, end - start);
    }
    if (scene.estimatedDuration && scene.estimatedDuration > 0) {
      return Math.max(0.8, scene.estimatedDuration);
    }
    return 4;
  });

  const total = rawDurations.reduce((sum, duration) => sum + duration, 0);
  if (!audioDurationSec || total <= 0) {
    return rawDurations;
  }

  const scaleFactor = audioDurationSec / total;
  return rawDurations.map((duration) => Math.max(0.8, duration * scaleFactor));
}

async function normalizeSceneImage(params: {
  sourceUrl: string;
  outputPath: string;
  width: number;
  height: number;
}) {
  const imageBuffer = await loadImageBuffer(params.sourceUrl);
  const sharp = (await import('sharp')).default;
  const processed = await sharp(imageBuffer)
    .resize(params.width, params.height, {
      fit: 'cover',
      position: 'center',
    })
    .jpeg({ quality: 92 })
    .toBuffer();

  await fs.writeFile(params.outputPath, processed);
}

async function loadImageBuffer(sourceUrl: string): Promise<Buffer> {
  if (sourceUrl.startsWith('data:image/')) {
    const payload = sourceUrl.split(',')[1] || '';
    return Buffer.from(payload, 'base64');
  }

  if (sourceUrl.startsWith('/')) {
    const localPath = path.join(process.cwd(), sourceUrl.replace(/^\//, ''));
    if (fsSync.existsSync(localPath)) {
      return fs.readFile(localPath);
    }
  }

  const remoteUrl = sourceUrl.startsWith('http') ? sourceUrl : `http://localhost:5000${sourceUrl}`;
  const response = await fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(`Failed to load image source: ${sourceUrl}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function buildConcatManifest(imagePaths: string[], durations: number[]): string {
  if (!imagePaths.length) {
    throw new Error('No image frames available for concat manifest');
  }

  const lines: string[] = [];
  for (let i = 0; i < imagePaths.length; i++) {
    const normalizedPath = imagePaths[i].replace(/'/g, "'\\''");
    lines.push(`file '${normalizedPath}'`);
    lines.push(`duration ${durations[i].toFixed(3)}`);
  }

  const lastPath = imagePaths[imagePaths.length - 1].replace(/'/g, "'\\''");
  lines.push(`file '${lastPath}'`);
  return lines.join('\n');
}

function parseSceneRange(raw: unknown): { start: number; end: number } | null {
  if (!Array.isArray(raw) || raw.length !== 2) {
    return null;
  }
  const start = Number(raw[0]);
  const end = Number(raw[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  const normalizedStart = Math.max(1, Math.floor(start));
  const normalizedEnd = Math.max(normalizedStart, Math.floor(end));
  return { start: normalizedStart, end: normalizedEnd };
}
