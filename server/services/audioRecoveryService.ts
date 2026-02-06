import fs from "fs";
import path from "path";
import { storage } from "../storage";
import { generateTTS } from "./ttsService";

/**
 * Check if an audio file exists on the filesystem
 */
export function audioFileExists(audioUrl: string): boolean {
  if (!audioUrl) return false;
  
  const audioPath = path.join(process.cwd(), audioUrl.replace(/^\//, ''));
  return fs.existsSync(audioPath);
}

/**
 * Validate and recover missing audio files for a script
 */
export async function validateAndRecoverAudio(scriptId: number): Promise<{
  audioExists: boolean;
  audioUrl?: string;
  regenerated?: boolean;
  error?: string;
}> {
  try {
    // Get script data
    const script = await storage.getScript(scriptId);
    if (!script) {
      return { audioExists: false, error: "Script not found" };
    }

    // Check if script has audio TTS ID
    if (!script.audioTTSId) {
      return { audioExists: false, error: "No audio associated with script" };
    }

    // Get audio TTS record
    const audioTTS = await storage.getAudioTTS(script.audioTTSId);
    if (!audioTTS) {
      return { audioExists: false, error: "Audio TTS record not found" };
    }

    // Check if audio file exists
    if (!audioTTS.audioUrl || !audioFileExists(audioTTS.audioUrl)) {
      console.log(`Audio file missing for script ${scriptId}, attempting to regenerate...`);
      
      // Regenerate the audio file
      try {
        const result = await generateTTS({
          model: (audioTTS.model as any) || 'gpt-4o-mini-tts',
          voice: (audioTTS.voice as any) || 'alloy',
          input: audioTTS.content,
        });

        // Update the audio TTS record with new file info
        await storage.updateAudioTTS(audioTTS.id, {
          audioUrl: result.audioUrl,
          duration: result.duration,
          fileSize: result.fileSize,
          status: "completed",
        });

        // Update script with new audio file path
        await storage.updateScript(scriptId, {
          audioFilePath: result.audioUrl,
          audioDuration: result.duration,
        });

        console.log(`Successfully regenerated audio for script ${scriptId}: ${result.audioUrl}`);
        
        return { 
          audioExists: true, 
          audioUrl: result.audioUrl, 
          regenerated: true 
        };
      } catch (regenerationError) {
        console.error(`Failed to regenerate audio for script ${scriptId}:`, regenerationError);
        
        // Update status to failed
        await storage.updateAudioTTS(audioTTS.id, {
          status: "failed",
        });
        
        return { 
          audioExists: false, 
          error: `Audio regeneration failed: ${regenerationError instanceof Error ? regenerationError.message : 'Unknown error'}` 
        };
      }
    }

    return { audioExists: true, audioUrl: audioTTS.audioUrl };
  } catch (error) {
    console.error(`Error validating audio for script ${scriptId}:`, error);
    return { 
      audioExists: false, 
      error: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

/**
 * Batch validate and recover missing audio files for multiple scripts
 */
export async function batchValidateAndRecoverAudio(scriptIds: number[]): Promise<{
  results: Array<{
    scriptId: number;
    audioExists: boolean;
    audioUrl?: string;
    regenerated?: boolean;
    error?: string;
  }>;
  summary: {
    total: number;
    existing: number;
    regenerated: number;
    failed: number;
  };
}> {
  const results = [];
  const summary = {
    total: scriptIds.length,
    existing: 0,
    regenerated: 0,
    failed: 0,
  };

  for (const scriptId of scriptIds) {
    const result = await validateAndRecoverAudio(scriptId);
    results.push({ scriptId, ...result });

    if (result.audioExists) {
      if (result.regenerated) {
        summary.regenerated++;
      } else {
        summary.existing++;
      }
    } else {
      summary.failed++;
    }
  }

  return { results, summary };
}