import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { objectStorage } from '../objectStorage';
import { db } from '../db';
import { scenes, scripts } from '@shared/schema';
import { eq, and, like, sql, isNull, or, not } from 'drizzle-orm';

export interface MigrationResult {
  totalScenes: number;
  migratedScenes: number;
  skippedScenes: number;
  failedScenes: number;
  missingFiles: string[];
  errors: string[];
}

const BATCH_SIZE = 10;
const DELAY_BETWEEN_SCENES = 50;
const MAX_RETRIES = 2;

let migrationInProgress = false;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function migrateLocalImagesToObjectStorage(): Promise<MigrationResult> {
  const result: MigrationResult = {
    totalScenes: 0,
    migratedScenes: 0,
    skippedScenes: 0,
    failedScenes: 0,
    missingFiles: [],
    errors: []
  };
  
  if (migrationInProgress) {
    result.errors.push('Migration already in progress');
    return result;
  }
  
  migrationInProgress = true;
  
  const isConfigured = await objectStorage.isConfigured();
  if (!isConfigured) {
    result.errors.push('Object storage is not configured. Please enable App Storage in Replit Tools.');
    migrationInProgress = false;
    return result;
  }
  
  console.log('[Migration] Starting migration of images to object storage...');
  
  try {
    let offset = 0;
    let hasMoreBase64 = true;
    
    while (hasMoreBase64) {
      const base64Batch = await db.execute(sql`
        SELECT s.id, s.script_id, s.scene_number, s.image_storage_key, s.image_verified
        FROM scenes s
        JOIN scripts sc ON s.script_id = sc.id
        WHERE sc.archived = false 
        AND s.image_url LIKE 'data:image%'
        AND (s.image_verified = false OR s.image_verified IS NULL)
        ORDER BY s.script_id, s.scene_number
        LIMIT ${BATCH_SIZE} OFFSET ${offset}
      `);
      
      if (base64Batch.rows.length === 0) {
        hasMoreBase64 = false;
        break;
      }
      
      console.log(`[Migration] Processing batch of ${base64Batch.rows.length} base64 scenes (offset ${offset})`);
      result.totalScenes += base64Batch.rows.length;
      
      for (const row of base64Batch.rows) {
        const sceneId = row.id as number;
        const scriptId = row.script_id as number;
        const sceneNumber = row.scene_number as number;
        const existingKey = row.image_storage_key as string | null;
        
        if (existingKey && row.image_verified) {
          result.skippedScenes++;
          continue;
        }
        
        let retries = 0;
        let success = false;
        
        while (retries < MAX_RETRIES && !success) {
          try {
            const scene = await db.query.scenes.findFirst({
              where: eq(scenes.id, sceneId),
              columns: { id: true, imageUrl: true }
            });
            
            if (!scene?.imageUrl?.startsWith('data:image')) {
              result.skippedScenes++;
              success = true;
              break;
            }
            
            const matches = scene.imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
            if (!matches) {
              result.errors.push(`Scene ${sceneId}: Invalid base64 format`);
              result.failedScenes++;
              success = true;
              break;
            }
            
            const imageBuffer = Buffer.from(matches[2], 'base64');
            const checksum = crypto.createHash('sha256').update(imageBuffer).digest('hex');
            const storageKey = `projects/${scriptId}/scenes/${sceneNumber}/image.png`;
            
            const storageUrl = await objectStorage.uploadBuffer(imageBuffer, storageKey);
            
            await db.update(scenes)
              .set({
                imageUrl: storageUrl,
                imageStorageKey: storageKey,
                imageChecksum: checksum,
                imageByteLength: imageBuffer.length,
                imageVerified: true
              })
              .where(eq(scenes.id, sceneId));
            
            result.migratedScenes++;
            console.log(`[Migration] ✓ Scene ${sceneId} (${(imageBuffer.length / 1024).toFixed(0)}KB) -> ${storageUrl}`);
            success = true;
            
          } catch (error: any) {
            retries++;
            if (retries >= MAX_RETRIES) {
              result.errors.push(`Scene ${sceneId}: ${error.message} (after ${MAX_RETRIES} retries)`);
              result.failedScenes++;
              console.error(`[Migration] ✗ Scene ${sceneId} failed:`, error.message);
            } else {
              console.log(`[Migration] Retry ${retries} for scene ${sceneId}`);
              await sleep(1000);
            }
          }
        }
        
        await sleep(DELAY_BETWEEN_SCENES);
      }
      
      offset += BATCH_SIZE;
      await sleep(200);
    }
    
    offset = 0;
    let hasMoreLocal = true;
    
    while (hasMoreLocal) {
      const localBatch = await db.execute(sql`
        SELECT s.id, s.script_id, s.scene_number, s.image_url, s.image_storage_key, s.image_verified
        FROM scenes s
        JOIN scripts sc ON s.script_id = sc.id
        WHERE sc.archived = false 
        AND s.image_url LIKE '/uploads/%'
        AND (s.image_verified = false OR s.image_verified IS NULL)
        ORDER BY s.script_id, s.scene_number
        LIMIT ${BATCH_SIZE} OFFSET ${offset}
      `);
      
      if (localBatch.rows.length === 0) {
        hasMoreLocal = false;
        break;
      }
      
      console.log(`[Migration] Processing batch of ${localBatch.rows.length} local file scenes`);
      result.totalScenes += localBatch.rows.length;
      
      for (const row of localBatch.rows) {
        const sceneId = row.id as number;
        const scriptId = row.script_id as number;
        const sceneNumber = row.scene_number as number;
        const imageUrl = row.image_url as string;
        const existingKey = row.image_storage_key as string | null;
        
        if (existingKey && row.image_verified) {
          result.skippedScenes++;
          continue;
        }
        
        const localPath = path.join(process.cwd(), imageUrl.replace(/^\//, ''));
        
        if (!fs.existsSync(localPath)) {
          result.missingFiles.push(`Scene ${sceneId}: ${imageUrl}`);
          result.failedScenes++;
          continue;
        }
        
        try {
          const imageBuffer = fs.readFileSync(localPath);
          const checksum = crypto.createHash('sha256').update(imageBuffer).digest('hex');
          const storageKey = `projects/${scriptId}/scenes/${sceneNumber}/image.png`;
          
          const storageUrl = await objectStorage.uploadBuffer(imageBuffer, storageKey);
          
          await db.update(scenes)
            .set({
              imageUrl: storageUrl,
              imageStorageKey: storageKey,
              imageChecksum: checksum,
              imageByteLength: imageBuffer.length,
              imageVerified: true
            })
            .where(eq(scenes.id, sceneId));
          
          result.migratedScenes++;
          console.log(`[Migration] ✓ Scene ${sceneId}: ${imageUrl} -> ${storageUrl}`);
          
        } catch (error: any) {
          result.errors.push(`Scene ${sceneId}: ${error.message}`);
          result.failedScenes++;
          console.error(`[Migration] ✗ Scene ${sceneId}:`, error.message);
        }
        
        await sleep(DELAY_BETWEEN_SCENES);
      }
      
      offset += BATCH_SIZE;
      await sleep(200);
    }
    
    console.log('[Migration] Migration complete:', result);
    return result;
    
  } catch (error: any) {
    result.errors.push(`Migration failed: ${error.message}`);
    console.error('[Migration] Migration failed:', error);
    return result;
  } finally {
    migrationInProgress = false;
  }
}

export async function getStorageStatus(): Promise<{
  objectStorageConfigured: boolean;
  localImagesCount: number;
  base64ImagesCount: number;
  objectStorageImagesCount: number;
  missingImagesCount: number;
  migrationInProgress: boolean;
}> {
  const isConfigured = await objectStorage.isConfigured();
  
  const localImagesResult = await db.execute(sql`
    SELECT COUNT(*) as count FROM scenes 
    WHERE image_url LIKE '/uploads/%'
  `);
  const localImagesCount = parseInt(localImagesResult.rows[0]?.count as string || '0');
  
  const base64ImagesResult = await db.execute(sql`
    SELECT COUNT(*) as count FROM scenes 
    WHERE image_url LIKE 'data:image%'
  `);
  const base64ImagesCount = parseInt(base64ImagesResult.rows[0]?.count as string || '0');
  
  const objectStorageResult = await db.execute(sql`
    SELECT COUNT(*) as count FROM scenes 
    WHERE image_url LIKE '/storage/%'
  `);
  const objectStorageImagesCount = parseInt(objectStorageResult.rows[0]?.count as string || '0');
  
  let missingCount = 0;
  if (localImagesCount > 0 && localImagesCount < 100) {
    const localImages = await db.select({ imageUrl: scenes.imageUrl })
      .from(scenes)
      .where(like(scenes.imageUrl, '/uploads/%'));
    
    for (const scene of localImages) {
      if (scene.imageUrl) {
        const localPath = path.join(process.cwd(), scene.imageUrl.replace(/^\//, ''));
        if (!fs.existsSync(localPath)) {
          missingCount++;
        }
      }
    }
  }
  
  return {
    objectStorageConfigured: isConfigured,
    localImagesCount,
    base64ImagesCount,
    objectStorageImagesCount,
    missingImagesCount: missingCount,
    migrationInProgress
  };
}
