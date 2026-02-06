import fetch from "node-fetch";
import { objectStorage } from "../objectStorage";
import { v4 as uuidv4 } from "uuid";

const REPLICATE_API_URL = "https://api.replicate.com/v1";

interface Wav2LipResult {
  videoUrl: string;
  storagePath: string;
}

interface ReplicateResponse {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: string;
  logs?: string;
}

export class Wav2LipService {
  private apiKey: string;
  private modelVersion: string;

  constructor() {
    const apiKey = process.env.REPLICATE_API_TOKEN;
    if (!apiKey) {
      console.warn("[WAV2LIP] Replicate API token not found. Lip-sync features will be disabled.");
    }
    this.apiKey = apiKey || "";
    // Wav2Lip model on Replicate - using a popular public model
    this.modelVersion = "devxpy/cog-wav2lip:8d65e3f4f4298520e079198b493c25adfc43c058ffec924f2aefc8010ed25eef";
  }

  private getHeaders(): Record<string, string> {
    return {
      "Authorization": `Token ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async generateLipSync(
    faceImageUrl: string,
    audioUrl: string,
    options?: {
      sceneId?: number;
      fps?: number;
      padTop?: number;
      padBottom?: number;
      padLeft?: number;
      padRight?: number;
      smooth?: boolean;
      resize_factor?: number;
    }
  ): Promise<Wav2LipResult> {
    if (!this.isConfigured()) {
      throw new Error("Replicate API token not configured");
    }

    console.log(`[WAV2LIP] Starting lip-sync generation for scene ${options?.sceneId}`);
    console.log(`[WAV2LIP] Face image: ${faceImageUrl}`);
    console.log(`[WAV2LIP] Audio: ${audioUrl}`);

    // Start the prediction
    const response = await fetch(`${REPLICATE_API_URL}/predictions`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        version: this.modelVersion.split(":")[1],
        input: {
          face: faceImageUrl,
          audio: audioUrl,
          fps: options?.fps || 25,
          pads: `${options?.padTop || 0} ${options?.padBottom || 10} ${options?.padLeft || 0} ${options?.padRight || 0}`,
          smooth: options?.smooth !== false,
          resize_factor: options?.resize_factor || 1,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[WAV2LIP] Replicate API error:`, error);
      throw new Error(`Replicate API error: ${error}`);
    }

    const prediction = (await response.json()) as ReplicateResponse;
    console.log(`[WAV2LIP] Prediction started: ${prediction.id}`);

    // Poll for completion
    const result = await this.pollForCompletion(prediction.id);
    
    if (result.status === "failed") {
      throw new Error(`Wav2Lip generation failed: ${result.error || "Unknown error"}`);
    }

    if (result.status === "canceled") {
      throw new Error("Wav2Lip generation was canceled");
    }

    // Get the output video URL
    const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;
    if (!outputUrl) {
      throw new Error("No output video URL returned from Wav2Lip");
    }

    console.log(`[WAV2LIP] Generation complete: ${outputUrl}`);

    // Download and save to object storage
    const videoBuffer = await this.downloadVideo(outputUrl);
    const filename = `wav2lip_${options?.sceneId || uuidv4()}_${Date.now()}.mp4`;
    const storagePath = `video/wav2lip/${filename}`;

    await objectStorage.uploadBuffer(videoBuffer, storagePath, "video/mp4");

    console.log(`[WAV2LIP] Video saved to storage: ${storagePath}`);

    return {
      videoUrl: `/api/object-storage/${storagePath}`,
      storagePath,
    };
  }

  private async pollForCompletion(predictionId: string, maxWaitMs = 300000): Promise<ReplicateResponse> {
    const startTime = Date.now();
    const pollInterval = 2000; // Poll every 2 seconds

    while (Date.now() - startTime < maxWaitMs) {
      const response = await fetch(`${REPLICATE_API_URL}/predictions/${predictionId}`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to poll prediction status: ${error}`);
      }

      const prediction = (await response.json()) as ReplicateResponse;

      if (prediction.status === "succeeded" || prediction.status === "failed" || prediction.status === "canceled") {
        return prediction;
      }

      console.log(`[WAV2LIP] Prediction ${predictionId} status: ${prediction.status}`);
      
      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Wav2Lip generation timed out after ${maxWaitMs / 1000} seconds`);
  }

  private async downloadVideo(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async generateLipSyncBatch(
    items: Array<{
      sceneId: number;
      faceImageUrl: string;
      audioUrl: string;
    }>
  ): Promise<Array<{ sceneId: number; result?: Wav2LipResult; error?: string }>> {
    const results: Array<{ sceneId: number; result?: Wav2LipResult; error?: string }> = [];

    // Process sequentially to avoid overwhelming Replicate API
    for (const item of items) {
      try {
        const result = await this.generateLipSync(item.faceImageUrl, item.audioUrl, {
          sceneId: item.sceneId,
        });
        results.push({ sceneId: item.sceneId, result });
      } catch (error: any) {
        console.error(`[WAV2LIP] Error processing scene ${item.sceneId}:`, error);
        results.push({ sceneId: item.sceneId, error: error.message });
      }
    }

    return results;
  }
}

export const wav2lipService = new Wav2LipService();
