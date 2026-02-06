import fetch from "node-fetch";
import { VoiceSettings } from "@shared/schema";

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  description?: string;
  preview_url?: string;
  labels?: Record<string, string>;
}

interface TTSResponse {
  audioBuffer: Buffer;
  contentType: string;
}

interface VoiceListResponse {
  voices: ElevenLabsVoice[];
}

export class ElevenLabsService {
  private apiKey: string;

  constructor() {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      console.warn("[ELEVENLABS] API key not found. TTS features will be disabled.");
    }
    this.apiKey = apiKey || "";
  }

  private getHeaders(): Record<string, string> {
    return {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "xi-api-key": this.apiKey,
    };
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async listVoices(): Promise<ElevenLabsVoice[]> {
    if (!this.isConfigured()) {
      throw new Error("ElevenLabs API key not configured");
    }

    const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list voices: ${error}`);
    }

    const data = (await response.json()) as VoiceListResponse;
    return data.voices;
  }

  async getVoice(voiceId: string): Promise<ElevenLabsVoice | null> {
    if (!this.isConfigured()) {
      throw new Error("ElevenLabs API key not configured");
    }

    const response = await fetch(`${ELEVENLABS_API_URL}/voices/${voiceId}`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const error = await response.text();
      throw new Error(`Failed to get voice: ${error}`);
    }

    return (await response.json()) as ElevenLabsVoice;
  }

  async generateSpeech(
    text: string,
    voiceId: string,
    settings?: VoiceSettings
  ): Promise<TTSResponse> {
    if (!this.isConfigured()) {
      throw new Error("ElevenLabs API key not configured");
    }

    const defaultSettings: VoiceSettings = {
      stability: 0.5,
      similarityBoost: 0.75,
      style: 0,
      speakerBoost: true,
    };

    const voiceSettings = { ...defaultSettings, ...settings };

    const response = await fetch(
      `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          ...this.getHeaders(),
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5", // Fast, high-quality model
          voice_settings: {
            stability: voiceSettings.stability,
            similarity_boost: voiceSettings.similarityBoost,
            style: voiceSettings.style,
            use_speaker_boost: voiceSettings.speakerBoost,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to generate speech: ${error}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "audio/mpeg";

    return { audioBuffer, contentType };
  }

  async generateSpeechWithTimestamps(
    text: string,
    voiceId: string,
    settings?: VoiceSettings
  ): Promise<{ audioBuffer: Buffer; duration: number; alignment?: any }> {
    if (!this.isConfigured()) {
      throw new Error("ElevenLabs API key not configured");
    }

    const defaultSettings: VoiceSettings = {
      stability: 0.5,
      similarityBoost: 0.75,
      style: 0,
      speakerBoost: true,
    };

    const voiceSettings = { ...defaultSettings, ...settings };

    const response = await fetch(
      `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}/with-timestamps`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: voiceSettings.stability,
            similarity_boost: voiceSettings.similarityBoost,
            style: voiceSettings.style,
            use_speaker_boost: voiceSettings.speakerBoost,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to generate speech with timestamps: ${error}`);
    }

    const data = (await response.json()) as {
      audio_base64: string;
      alignment: {
        characters: string[];
        character_start_times_seconds: number[];
        character_end_times_seconds: number[];
      };
    };

    const audioBuffer = Buffer.from(data.audio_base64, "base64");
    
    // Calculate duration from alignment data
    const endTimes = data.alignment.character_end_times_seconds;
    const duration = endTimes.length > 0 ? endTimes[endTimes.length - 1] : 0;

    return {
      audioBuffer,
      duration,
      alignment: data.alignment,
    };
  }

  async cloneVoice(
    name: string,
    description: string,
    audioFiles: Buffer[]
  ): Promise<ElevenLabsVoice> {
    if (!this.isConfigured()) {
      throw new Error("ElevenLabs API key not configured");
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);

    audioFiles.forEach((file, index) => {
      const blob = new Blob([file], { type: "audio/mpeg" });
      formData.append("files", blob, `sample_${index}.mp3`);
    });

    const response = await fetch(`${ELEVENLABS_API_URL}/voices/add`, {
      method: "POST",
      headers: {
        "xi-api-key": this.apiKey,
      },
      body: formData as any,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to clone voice: ${error}`);
    }

    return (await response.json()) as ElevenLabsVoice;
  }

  async deleteVoice(voiceId: string): Promise<boolean> {
    if (!this.isConfigured()) {
      throw new Error("ElevenLabs API key not configured");
    }

    const response = await fetch(`${ELEVENLABS_API_URL}/voices/${voiceId}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });

    return response.ok;
  }

  // Get recommended voices for animation (good for lip-sync)
  getRecommendedVoices(): { id: string; name: string; description: string }[] {
    return [
      { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", description: "Young American female, clear and expressive" },
      { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", description: "Young American female, strong and assertive" },
      { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", description: "Young American female, soft and warm" },
      { id: "ErXwobaYiN019PkySvjV", name: "Antoni", description: "Young American male, well-rounded and calm" },
      { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", description: "Young American female, clear and friendly" },
      { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", description: "Young American male, deep and confident" },
      { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", description: "Middle-aged American male, gruff and authoritative" },
      { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Middle-aged American male, deep and mature" },
      { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", description: "Young American male, raspy and dynamic" },
    ];
  }

  // Estimate audio duration based on text length (rough estimate)
  estimateDuration(text: string): number {
    // Average speaking rate is about 150 words per minute
    // Average word length is about 5 characters
    const words = text.length / 5;
    const minutes = words / 150;
    return minutes * 60; // Return seconds
  }

  // Calculate cost based on character count
  estimateCost(text: string): { characters: number; estimatedCost: number } {
    const characters = text.length;
    // ElevenLabs pricing: approximately $0.30 per 1000 characters for standard voices
    const estimatedCost = (characters / 1000) * 0.30;
    return { characters, estimatedCost };
  }
}

// Singleton instance
export const elevenLabsService = new ElevenLabsService();
