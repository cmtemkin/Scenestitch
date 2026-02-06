import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface TTSOptions {
  model: "gpt-4o-mini-tts" | "tts-1" | "tts-1-hd";
  voice: "alloy" | "ash" | "ballad" | "coral" | "echo" | "fable" | "nova" | "onyx" | "sage" | "shimmer";
  input: string;
  response_format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
  instructions?: string;
}

interface TTSResult {
  audioUrl: string;
  duration: number;
  fileSize: number;
}

/**
 * Generate audio from text using OpenAI's TTS API
 */
export async function generateTTS(options: TTSOptions): Promise<TTSResult> {
  try {
    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), "uploads", "audio");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Generate unique filename
    const filename = `tts_${uuidv4()}.mp3`;
    const filepath = path.join(uploadsDir, filename);

    console.log(`Generating TTS audio with voice: ${options.voice}, model: ${options.model}`);

    // Generate audio using OpenAI TTS API
    const speechOptions: any = {
      model: options.model,
      voice: options.voice,
      input: options.input,
      response_format: options.response_format || "mp3",
    };

    // Add instructions for gpt-4o-mini-tts model
    if (options.model === "gpt-4o-mini-tts" && options.instructions) {
      speechOptions.instructions = options.instructions;
    }

    const response = await openai.audio.speech.create(speechOptions);

    // Save the audio file
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filepath, buffer);

    // Get file stats
    const stats = fs.statSync(filepath);
    const fileSize = stats.size;

    // Estimate duration based on text length (~150 words per minute)
    const wordCount = options.input.split(/\s+/).filter(word => word.length > 0).length;
    const estimatedDuration = Math.max(1, Math.round((wordCount / 150) * 60));
    
    console.log(`Word count: ${wordCount}, estimated duration: ${estimatedDuration}s`);

    const audioUrl = `/uploads/audio/${filename}`;

    console.log(`TTS audio generated successfully: ${audioUrl}`);
    console.log(`File size: ${fileSize} bytes, estimated duration: ${estimatedDuration}s`);

    return {
      audioUrl,
      duration: estimatedDuration,
      fileSize,
    };
  } catch (error) {
    console.error("Error generating TTS audio:", error);
    throw error;
  }
}

/**
 * Get actual audio duration using a more accurate method if available
 */
export async function getActualAudioDuration(audioPath: string): Promise<number> {
  try {
    // Try to use get-audio-duration if available
    const { getAudioDurationInSeconds } = await import('get-audio-duration');
    const duration = await getAudioDurationInSeconds(audioPath);
    return Math.round(duration);
  } catch (error) {
    console.warn("Could not get actual audio duration, using estimate:", error);
    // Fallback to file size estimation
    const stats = fs.statSync(audioPath);
    return Math.round(stats.size / 125);
  }
}

/**
 * Delete an audio file
 */
export async function deleteAudioFile(audioUrl: string): Promise<void> {
  try {
    const filename = path.basename(audioUrl);
    const filepath = path.join(process.cwd(), "uploads", "audio", filename);
    
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      console.log(`Deleted audio file: ${filepath}`);
    }
  } catch (error) {
    console.error("Error deleting audio file:", error);
  }
}