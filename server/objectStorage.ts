import { Client } from "@replit/object-storage";
import { Response } from "express";
import { randomUUID } from "crypto";

let storageClient: Client | null = null;
let isStorageAvailable: boolean | null = null;

async function getClient(): Promise<Client | null> {
  if (storageClient !== null) {
    return storageClient;
  }
  
  if (isStorageAvailable === false) {
    return null;
  }
  
  try {
    const client = new Client();
    const testResult = await client.list({ prefix: "__test__" });
    if (testResult.ok) {
      storageClient = client;
      isStorageAvailable = true;
      console.log("Object storage initialized successfully");
      return client;
    }
    isStorageAvailable = false;
    console.warn("Object storage list test failed - storage not available");
    return null;
  } catch (error) {
    isStorageAvailable = false;
    console.warn("Object storage not configured or unavailable:", error);
    return null;
  }
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  async isConfigured(): Promise<boolean> {
    const client = await getClient();
    return client !== null;
  }

  async uploadBuffer(
    buffer: Buffer,
    objectPath: string,
    contentType: string = "image/png"
  ): Promise<string> {
    const client = await getClient();
    if (!client) {
      throw new Error("Object storage not configured");
    }
    
    try {
      await client.uploadFromBytes(objectPath, buffer);
      console.log(`Uploaded to object storage: ${objectPath}`);
      return `/storage/${objectPath}`;
    } catch (error) {
      console.error("Failed to upload to object storage:", error);
      throw error;
    }
  }

  async uploadBase64(
    base64Data: string,
    objectPath: string,
    contentType: string = "image/png"
  ): Promise<string> {
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    return this.uploadBuffer(buffer, objectPath, contentType);
  }

  async downloadToBuffer(objectPath: string): Promise<Buffer> {
    const client = await getClient();
    if (!client) {
      throw new ObjectNotFoundError();
    }
    
    try {
      const result = await client.downloadAsBytes(objectPath);
      if (!result.ok) {
        throw new ObjectNotFoundError();
      }
      // The API returns an array where the first element contains the actual buffer
      const bytes = result.value as unknown as any;
      if (Array.isArray(bytes) && bytes[0]) {
        return Buffer.from(bytes[0]);
      }
      // Fallback for direct Uint8Array/Buffer response
      return Buffer.from(bytes);
    } catch (error) {
      console.error("Failed to download from object storage:", error);
      throw new ObjectNotFoundError();
    }
  }

  async exists(objectPath: string): Promise<boolean> {
    const client = await getClient();
    if (!client) {
      return false;
    }
    
    try {
      const result = await client.exists(objectPath);
      return result.ok && result.value;
    } catch (error) {
      return false;
    }
  }

  async streamToResponse(objectPath: string, res: Response): Promise<void> {
    try {
      const buffer = await this.downloadToBuffer(objectPath);
      
      const ext = objectPath.split('.').pop()?.toLowerCase() || 'png';
      const contentTypes: Record<string, string> = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'm4a': 'audio/mp4',
        'mp4': 'video/mp4',
      };
      
      res.set({
        "Content-Type": contentTypes[ext] || "application/octet-stream",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=31536000",
      });
      
      res.send(buffer);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "File not found" });
      } else {
        console.error("Error streaming from object storage:", error);
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  async deleteFile(objectPath: string): Promise<void> {
    const client = await getClient();
    if (!client) {
      return;
    }
    
    try {
      await client.delete(objectPath);
    } catch (error) {
      console.error("Failed to delete from object storage:", error);
    }
  }

  generateSceneImagePath(sceneNumber: number, projectId?: number): string {
    const timestamp = Date.now();
    const uuid = randomUUID().slice(0, 8);
    const prefix = projectId ? `project_${projectId}` : "scene";
    return `scenes/${prefix}_scene_${sceneNumber}_${timestamp}_${uuid}.png`;
  }

  generateThumbnailPath(projectId?: number): string {
    const timestamp = Date.now();
    const uuid = randomUUID().slice(0, 8);
    const prefix = projectId ? `project_${projectId}` : "thumbnail";
    return `thumbnails/${prefix}_${timestamp}_${uuid}.png`;
  }

  generateMusicianImagePath(projectId?: number): string {
    const timestamp = Date.now();
    const uuid = randomUUID().slice(0, 8);
    const prefix = projectId ? `project_${projectId}` : "musician";
    return `musicians/${prefix}_${timestamp}_${uuid}.png`;
  }

  generateAudioPath(filename: string, projectId?: number): string {
    const timestamp = Date.now();
    const uuid = randomUUID().slice(0, 8);
    const ext = filename.split('.').pop() || 'mp3';
    const prefix = projectId ? `project_${projectId}` : "audio";
    return `audio/${prefix}_${timestamp}_${uuid}.${ext}`;
  }
}

export const objectStorage = new ObjectStorageService();
