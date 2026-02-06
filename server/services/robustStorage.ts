import { createHash } from 'crypto';
import { objectStorage } from '../objectStorage';
import { db } from '../db';
import { scenes } from '@shared/schema';
import { eq } from 'drizzle-orm';

const sceneLocks = new Map<number, Promise<void>>();

export interface StorageResult {
  url: string;
  storageKey: string;
  checksum: string;
  byteLength: number;
  verified: boolean;
}

export interface ImageUploadOptions {
  sceneId: number;
  projectId: number;
  sceneNumber: number;
  imageBuffer: Buffer;
  forceRegenerate?: boolean;
}

export interface VideoUploadOptions {
  sceneId: number;
  projectId: number;
  sceneNumber: number;
  videoBuffer: Buffer;
  forceRegenerate?: boolean;
}

function computeChecksum(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function generateDeterministicImageKey(projectId: number, sceneNumber: number): string {
  return `projects/${projectId}/scenes/${sceneNumber}/image.png`;
}

function generateDeterministicVideoKey(projectId: number, sceneNumber: number): string {
  return `projects/${projectId}/scenes/${sceneNumber}/video.mp4`;
}

function generateThumbnailKey(projectId: number): string {
  return `projects/${projectId}/thumbnail.png`;
}

function generateMusicianImageKey(projectId: number): string {
  return `projects/${projectId}/musician_reference.png`;
}

function generateAudioKey(projectId: number, ext: string = 'mp3'): string {
  return `projects/${projectId}/audio.${ext}`;
}

async function acquireSceneLock(sceneId: number): Promise<() => void> {
  while (sceneLocks.has(sceneId)) {
    await sceneLocks.get(sceneId);
  }
  
  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  
  sceneLocks.set(sceneId, lockPromise);
  
  return () => {
    sceneLocks.delete(sceneId);
    releaseLock!();
  };
}

export async function uploadSceneImage(options: ImageUploadOptions): Promise<StorageResult> {
  const { sceneId, projectId, sceneNumber, imageBuffer, forceRegenerate = false } = options;
  
  const releaseLock = await acquireSceneLock(sceneId);
  
  try {
    if (!forceRegenerate) {
      const existingScene = await db.query.scenes.findFirst({
        where: eq(scenes.id, sceneId)
      });
      
      if (existingScene?.imageVerified && existingScene.imageStorageKey && existingScene.imageChecksum) {
        console.log(`[RobustStorage] Scene ${sceneId} already has verified image, skipping upload`);
        return {
          url: existingScene.imageUrl!,
          storageKey: existingScene.imageStorageKey,
          checksum: existingScene.imageChecksum,
          byteLength: existingScene.imageByteLength!,
          verified: true
        };
      }
    }
    
    const checksum = computeChecksum(imageBuffer);
    const byteLength = imageBuffer.length;
    const storageKey = generateDeterministicImageKey(projectId, sceneNumber);
    
    console.log(`[RobustStorage] Uploading image for scene ${sceneId}: ${storageKey} (${byteLength} bytes, checksum: ${checksum.substring(0, 8)}...)`);
    
    const isConfigured = await objectStorage.isConfigured();
    if (!isConfigured) {
      throw new Error('Object storage is not configured. Cannot save images reliably.');
    }
    
    const url = await objectStorage.uploadBuffer(imageBuffer, storageKey);
    
    const downloadedBuffer = await objectStorage.downloadToBuffer(storageKey);
    const verifyChecksum = computeChecksum(downloadedBuffer);
    
    if (verifyChecksum !== checksum || downloadedBuffer.length !== byteLength) {
      throw new Error(`Upload verification failed: checksum mismatch (expected ${checksum}, got ${verifyChecksum})`);
    }
    
    await db.update(scenes)
      .set({
        imageUrl: url,
        imageStorageKey: storageKey,
        imageChecksum: checksum,
        imageByteLength: byteLength,
        imageVerified: true
      })
      .where(eq(scenes.id, sceneId));
    
    console.log(`[RobustStorage] Image verified and saved for scene ${sceneId}: ${url}`);
    
    return {
      url,
      storageKey,
      checksum,
      byteLength,
      verified: true
    };
  } finally {
    releaseLock();
  }
}

export async function uploadSceneVideo(options: VideoUploadOptions): Promise<StorageResult> {
  const { sceneId, projectId, sceneNumber, videoBuffer, forceRegenerate = false } = options;
  
  const releaseLock = await acquireSceneLock(sceneId);
  
  try {
    if (!forceRegenerate) {
      const existingScene = await db.query.scenes.findFirst({
        where: eq(scenes.id, sceneId)
      });
      
      if (existingScene?.videoVerified && existingScene.videoStorageKey && existingScene.videoChecksum) {
        console.log(`[RobustStorage] Scene ${sceneId} already has verified video, skipping upload`);
        return {
          url: existingScene.videoUrl!,
          storageKey: existingScene.videoStorageKey,
          checksum: existingScene.videoChecksum,
          byteLength: existingScene.videoByteLength!,
          verified: true
        };
      }
    }
    
    const checksum = computeChecksum(videoBuffer);
    const byteLength = videoBuffer.length;
    const storageKey = generateDeterministicVideoKey(projectId, sceneNumber);
    
    console.log(`[RobustStorage] Uploading video for scene ${sceneId}: ${storageKey} (${byteLength} bytes, checksum: ${checksum.substring(0, 8)}...)`);
    
    const isConfigured = await objectStorage.isConfigured();
    if (!isConfigured) {
      throw new Error('Object storage is not configured. Cannot save videos reliably.');
    }
    
    const url = await objectStorage.uploadBuffer(videoBuffer, storageKey, 'video/mp4');
    
    await db.update(scenes)
      .set({
        videoUrl: url,
        videoStorageKey: storageKey,
        videoChecksum: checksum,
        videoByteLength: byteLength,
        videoVerified: true
      })
      .where(eq(scenes.id, sceneId));
    
    console.log(`[RobustStorage] Video saved for scene ${sceneId}: ${url}`);
    
    return {
      url,
      storageKey,
      checksum,
      byteLength,
      verified: true
    };
  } finally {
    releaseLock();
  }
}

export async function uploadThumbnail(projectId: number, imageBuffer: Buffer): Promise<StorageResult> {
  const checksum = computeChecksum(imageBuffer);
  const byteLength = imageBuffer.length;
  const storageKey = generateThumbnailKey(projectId);
  
  console.log(`[RobustStorage] Uploading thumbnail for project ${projectId}: ${storageKey}`);
  
  const isConfigured = await objectStorage.isConfigured();
  if (!isConfigured) {
    throw new Error('Object storage is not configured. Cannot save thumbnails reliably.');
  }
  
  const url = await objectStorage.uploadBuffer(imageBuffer, storageKey);
  
  return {
    url,
    storageKey,
    checksum,
    byteLength,
    verified: true
  };
}

export async function uploadMusicianReference(projectId: number, imageBuffer: Buffer): Promise<StorageResult> {
  const checksum = computeChecksum(imageBuffer);
  const byteLength = imageBuffer.length;
  const storageKey = generateMusicianImageKey(projectId);
  
  console.log(`[RobustStorage] Uploading musician reference for project ${projectId}: ${storageKey}`);
  
  const isConfigured = await objectStorage.isConfigured();
  if (!isConfigured) {
    throw new Error('Object storage is not configured. Cannot save musician reference reliably.');
  }
  
  const url = await objectStorage.uploadBuffer(imageBuffer, storageKey);
  
  return {
    url,
    storageKey,
    checksum,
    byteLength,
    verified: true
  };
}

export async function uploadAudio(projectId: number, audioBuffer: Buffer, originalFilename: string): Promise<StorageResult> {
  const checksum = computeChecksum(audioBuffer);
  const byteLength = audioBuffer.length;
  const ext = originalFilename.split('.').pop() || 'mp3';
  const storageKey = generateAudioKey(projectId, ext);
  
  console.log(`[RobustStorage] Uploading audio for project ${projectId}: ${storageKey}`);
  
  const isConfigured = await objectStorage.isConfigured();
  if (!isConfigured) {
    throw new Error('Object storage is not configured. Cannot save audio reliably.');
  }
  
  const contentType = ext === 'mp3' ? 'audio/mpeg' : ext === 'wav' ? 'audio/wav' : 'audio/mp4';
  const url = await objectStorage.uploadBuffer(audioBuffer, storageKey, contentType);
  
  return {
    url,
    storageKey,
    checksum,
    byteLength,
    verified: true
  };
}

export async function verifySceneImage(sceneId: number): Promise<boolean> {
  const scene = await db.query.scenes.findFirst({
    where: eq(scenes.id, sceneId)
  });
  
  if (!scene?.imageStorageKey || !scene.imageChecksum) {
    return false;
  }
  
  try {
    const buffer = await objectStorage.downloadToBuffer(scene.imageStorageKey);
    const checksum = computeChecksum(buffer);
    
    if (checksum === scene.imageChecksum && buffer.length === scene.imageByteLength) {
      if (!scene.imageVerified) {
        await db.update(scenes)
          .set({ imageVerified: true })
          .where(eq(scenes.id, sceneId));
      }
      return true;
    }
    
    console.warn(`[RobustStorage] Image verification failed for scene ${sceneId}: checksum mismatch`);
    return false;
  } catch (error) {
    console.warn(`[RobustStorage] Image verification failed for scene ${sceneId}:`, error);
    return false;
  }
}

export async function checkStorageHealth(): Promise<{ healthy: boolean; message: string }> {
  try {
    const isConfigured = await objectStorage.isConfigured();
    if (!isConfigured) {
      return { healthy: false, message: 'Object storage not configured' };
    }
    
    const testKey = '__health_check__/test.txt';
    const testData = Buffer.from(`health-check-${Date.now()}`);
    
    await objectStorage.uploadBuffer(testData, testKey, 'text/plain');
    const downloaded = await objectStorage.downloadToBuffer(testKey);
    
    if (downloaded.toString() !== testData.toString()) {
      return { healthy: false, message: 'Upload/download verification failed' };
    }
    
    await objectStorage.deleteFile(testKey);
    
    return { healthy: true, message: 'Object storage is healthy' };
  } catch (error: any) {
    return { healthy: false, message: `Storage health check failed: ${error.message}` };
  }
}

export async function saveImageToObjectStorage(
  imageBuffer: Buffer,
  filename: string,
  sceneId?: number,
  projectId?: number,
  sceneNumber?: number
): Promise<string> {
  if (sceneId && projectId && sceneNumber) {
    const result = await uploadSceneImage({
      sceneId,
      projectId,
      sceneNumber,
      imageBuffer,
      forceRegenerate: true
    });
    return result.url;
  }
  
  const isConfigured = await objectStorage.isConfigured();
  if (!isConfigured) {
    throw new Error('Object storage is not configured. Cannot save images reliably.');
  }
  
  const checksum = computeChecksum(imageBuffer);
  const storageKey = `images/${checksum.substring(0, 16)}_${filename}`;
  
  const url = await objectStorage.uploadBuffer(imageBuffer, storageKey);
  console.log(`[RobustStorage] Saved image to object storage: ${url}`);
  
  return url;
}
