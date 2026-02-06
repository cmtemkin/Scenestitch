import { db } from '../db';
import { scenes, scripts } from '@shared/schema';
import { eq, and, like, sql } from 'drizzle-orm';
import { objectStorage } from '../objectStorage';
import * as crypto from 'crypto';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function migrateImagesToObjectStorage() {
  console.log('Starting image migration to object storage...');
  console.log('Target: Non-archived projects with base64 images\n');
  
  // First, get just the IDs of scenes that need migration (without fetching full base64 data)
  const scenesToMigrate = await db.execute(sql`
    SELECT s.id, s.script_id, s.scene_number 
    FROM scenes s
    JOIN scripts sc ON s.script_id = sc.id
    WHERE sc.archived = false 
    AND s.image_url LIKE 'data:image%'
    ORDER BY s.script_id, s.scene_number
  `);
  
  console.log(`Found ${scenesToMigrate.rows.length} scenes to migrate\n`);
  
  let migrated = 0;
  let failed = 0;
  
  // Process one at a time to avoid memory issues
  for (const row of scenesToMigrate.rows) {
    const sceneId = row.id as number;
    const scriptId = row.script_id as number;
    const sceneNumber = row.scene_number as number;
    
    try {
      // Fetch just this one scene's image data
      const scene = await db.query.scenes.findFirst({
        where: eq(scenes.id, sceneId),
        columns: { id: true, imageUrl: true }
      });
      
      if (!scene?.imageUrl?.startsWith('data:image')) {
        console.log(`  Scene ${sceneId}: Skipped (not base64)`);
        continue;
      }
      
      const matches = scene.imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) {
        console.log(`  Scene ${sceneId}: Invalid format`);
        failed++;
        continue;
      }
      
      const imageBuffer = Buffer.from(matches[2], 'base64');
      const checksum = crypto.createHash('sha256').update(imageBuffer).digest('hex');
      const storageKey = `projects/${scriptId}/scenes/${sceneNumber}/image.png`;
      
      // Upload to object storage
      const url = await objectStorage.uploadBuffer(imageBuffer, storageKey);
      
      // Update database (clear the base64 data)
      await db.update(scenes)
        .set({
          imageUrl: url,
          imageStorageKey: storageKey,
          imageChecksum: checksum,
          imageByteLength: imageBuffer.length,
          imageVerified: true
        })
        .where(eq(scenes.id, sceneId));
      
      console.log(`✓ Project ${scriptId} Scene ${sceneNumber} → ${url} (${(imageBuffer.length / 1024).toFixed(0)}KB)`);
      migrated++;
      
      // Small delay to be nice to the system
      await sleep(100);
      
    } catch (error) {
      console.log(`✗ Scene ${sceneId}: ${error}`);
      failed++;
    }
  }
  
  console.log('\n========================================');
  console.log(`Migration Complete: ${migrated} migrated, ${failed} failed`);
  console.log('========================================\n');
}

migrateImagesToObjectStorage()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
