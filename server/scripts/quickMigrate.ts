import { db } from '../db';
import { scenes } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { objectStorage } from '../objectStorage';
import * as crypto from 'crypto';

const BATCH_SIZE = 10;
const DELAY_MS = 100;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function quickMigrate() {
  console.log('Quick migration starting...');
  console.log('Waiting for object storage to initialize...');
  await sleep(2000);
  
  let totalMigrated = 0;
  let totalFailed = 0;
  let hasMore = true;
  
  while (hasMore) {
    try {
      const batch = await db.execute(sql`
        SELECT id, script_id, scene_number FROM scenes 
        WHERE image_url LIKE 'data:%' 
        AND (image_verified = false OR image_verified IS NULL)
        LIMIT ${BATCH_SIZE}
      `);
      
      if (batch.rows.length === 0) {
        hasMore = false;
        console.log('No more scenes to migrate');
        break;
      }
      
      console.log(`\nProcessing batch of ${batch.rows.length} scenes...`);
      
      for (const row of batch.rows) {
        const id = row.id as number;
        const scriptId = row.script_id as number;
        const sceneNumber = row.scene_number as number;
        
        try {
          const sceneData = await db.execute(sql`
            SELECT image_url FROM scenes WHERE id = ${id}
          `);
          
          if (sceneData.rows.length === 0) continue;
          
          const imageUrl = sceneData.rows[0].image_url as string;
          
          if (!imageUrl?.startsWith('data:image')) {
            console.log(`  Scene ${id}: Skipping - not base64`);
            continue;
          }
          
          const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
          if (!matches) {
            console.log(`  Scene ${id}: Invalid format`);
            totalFailed++;
            continue;
          }
          
          const buffer = Buffer.from(matches[2], 'base64');
          const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
          const key = `projects/${scriptId}/scenes/${sceneNumber}/image.png`;
          
          const url = await objectStorage.uploadBuffer(buffer, key);
          
          await db.execute(sql`
            UPDATE scenes SET
              image_url = ${url},
              image_storage_key = ${key},
              image_checksum = ${checksum},
              image_byte_length = ${buffer.length},
              image_verified = true
            WHERE id = ${id}
          `);
          
          totalMigrated++;
          console.log(`  ✓ Scene ${id} (${(buffer.length/1024).toFixed(0)}KB) -> ${url}`);
          
        } catch (e: any) {
          totalFailed++;
          console.log(`  ✗ Scene ${id}: ${e.message}`);
        }
        
        await sleep(DELAY_MS);
      }
      
      await sleep(500);
      
    } catch (e: any) {
      console.error('Batch error:', e.message);
      await sleep(2000);
    }
  }
  
  console.log('\n========================================');
  console.log(`Migration Complete: ${totalMigrated} migrated, ${totalFailed} failed`);
  console.log('========================================\n');
}

quickMigrate()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
