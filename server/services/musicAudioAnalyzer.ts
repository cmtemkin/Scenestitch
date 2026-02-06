import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MUSIC_AUDIO_DIR = path.join(process.cwd(), 'uploads', 'music');

async function ensureMusicDirExists() {
  try {
    await fs.access(MUSIC_AUDIO_DIR);
  } catch (error) {
    await fs.mkdir(MUSIC_AUDIO_DIR, { recursive: true });
  }
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface LyricsAlignment {
  words: WordTimestamp[];
  segments: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
  }>;
  duration: number;
}

export interface SceneTiming {
  sceneNumber: number;
  lyricText: string;
  startTime: number;
  endTime: number;
  soraClipLength: 4 | 8;
}

export async function saveMusicAudioFile(buffer: Buffer, originalFilename: string): Promise<string> {
  await ensureMusicDirExists();
  
  const fileExtension = path.extname(originalFilename);
  const filename = `music-${uuidv4()}${fileExtension}`;
  const filePath = path.join(MUSIC_AUDIO_DIR, filename);
  
  await fs.writeFile(filePath, buffer);
  
  return `/uploads/music/${filename}`;
}

export async function transcribeWithTimestamps(audioFilePath: string): Promise<LyricsAlignment> {
  console.log(`[MUSIC_ANALYZER] Transcribing audio with word timestamps: ${audioFilePath}`);
  
  // Check if it's already a full path (starts with workspace dir)
  const workspaceDir = process.cwd();
  let fullPath: string;
  
  if (audioFilePath.startsWith(workspaceDir)) {
    // Already a full path
    fullPath = audioFilePath;
  } else if (audioFilePath.startsWith('/uploads/')) {
    // URL path - convert to file system path
    fullPath = path.join(workspaceDir, audioFilePath.slice(1));
  } else if (audioFilePath.startsWith('/')) {
    // Other absolute path
    fullPath = path.join(workspaceDir, audioFilePath.slice(1));
  } else {
    // Relative path
    fullPath = path.join(workspaceDir, audioFilePath);
  }
  
  console.log(`[MUSIC_ANALYZER] Resolved audio path: ${fullPath}`);
  
  if (!fsSync.existsSync(fullPath)) {
    throw new Error(`Audio file not found at path: ${fullPath}`);
  }
  
  const audioStream = fsSync.createReadStream(fullPath);
  
  const transcription = await openai.audio.transcriptions.create({
    file: audioStream,
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
    language: "en",
  });
  
  console.log(`[MUSIC_ANALYZER] Transcription completed with ${transcription.words?.length || 0} words`);
  
  const words: WordTimestamp[] = (transcription.words || []).map((w: any) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  }));
  
  const segments = (transcription.segments || []).map((s: any) => ({
    id: s.id,
    start: s.start,
    end: s.end,
    text: s.text,
  }));
  
  return {
    words,
    segments,
    duration: transcription.duration || 0,
  };
}

function parseLyricsIntoSections(lyrics: string): Array<{ type: string; text: string; lines: string[] }> {
  const lines = lyrics.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const sections: Array<{ type: string; text: string; lines: string[] }> = [];
  
  let currentSection: { type: string; text: string; lines: string[] } | null = null;
  
  for (const line of lines) {
    const sectionMatch = line.match(/^\[(.*?)\]$/);
    
    if (sectionMatch) {
      if (currentSection && currentSection.lines.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        type: sectionMatch[1].toLowerCase(),
        text: '',
        lines: [],
      };
    } else if (currentSection) {
      currentSection.lines.push(line);
      currentSection.text += (currentSection.text ? ' ' : '') + line;
    } else {
      currentSection = {
        type: 'verse',
        text: line,
        lines: [line],
      };
    }
  }
  
  if (currentSection && currentSection.lines.length > 0) {
    sections.push(currentSection);
  }
  
  return sections;
}

function findBestSoraClipLength(duration: number): 4 | 8 {
  // Only use 4 or 8 second clips (no 12 second clips)
  if (duration <= 6) return 4;
  return 8;
}

function splitSectionIntoClips(
  section: { type: string; text: string; lines: string[] },
  startTime: number,
  endTime: number
): SceneTiming[] {
  const duration = endTime - startTime;
  const scenes: SceneTiming[] = [];
  
  // For sections 8 seconds or less, create a single clip
  if (duration <= 8) {
    scenes.push({
      sceneNumber: 0,
      lyricText: section.text,
      startTime,
      endTime,
      soraClipLength: findBestSoraClipLength(duration),
    });
    return scenes;
  }
  
  // For longer sections, split into 8-second clips (or 4-second for short remainders)
  const targetClipLength = 8;
  const numClips = Math.ceil(duration / targetClipLength);
  const linesPerClip = Math.ceil(section.lines.length / numClips);
  
  let currentTime = startTime;
  for (let i = 0; i < numClips; i++) {
    const clipLines = section.lines.slice(i * linesPerClip, (i + 1) * linesPerClip);
    const clipText = clipLines.join(' ');
    
    const isLastClip = i === numClips - 1;
    const clipDuration = isLastClip ? endTime - currentTime : Math.min(targetClipLength, endTime - currentTime);
    const clipEndTime = currentTime + clipDuration;
    
    if (clipText.trim().length > 0) {
      scenes.push({
        sceneNumber: 0,
        lyricText: clipText,
        startTime: currentTime,
        endTime: clipEndTime,
        soraClipLength: findBestSoraClipLength(clipDuration),
      });
    }
    
    currentTime = clipEndTime;
  }
  
  return scenes;
}

export async function analyzeMusicAudio(
  audioFilePath: string,
  lyrics: string
): Promise<SceneTiming[]> {
  console.log(`[MUSIC_ANALYZER] Starting music audio analysis`);
  
  const alignment = await transcribeWithTimestamps(audioFilePath);
  console.log(`[MUSIC_ANALYZER] Audio duration: ${alignment.duration}s`);
  console.log(`[MUSIC_ANALYZER] Transcribed ${alignment.words.length} words, ${alignment.segments.length} segments`);
  
  // Use AI to intelligently create scenes that span the FULL audio duration
  const sceneTimings = await createFullDurationScenes(lyrics, alignment);
  
  let sceneNumber = 1;
  for (const scene of sceneTimings) {
    scene.sceneNumber = sceneNumber++;
  }
  
  console.log(`[MUSIC_ANALYZER] Generated ${sceneTimings.length} scene timings covering full ${alignment.duration}s`);
  return sceneTimings;
}

async function createFullDurationScenes(
  lyrics: string,
  alignment: LyricsAlignment
): Promise<SceneTiming[]> {
  const totalDuration = alignment.duration;
  
  console.log(`[MUSIC_ANALYZER] Creating scenes for full ${totalDuration}s duration using AI`);
  
  const systemPrompt = `You are an expert music video director who creates scene timings for music videos.
Your task is to analyze song lyrics and audio transcription to create scene breakdowns that cover the ENTIRE song duration.

CRITICAL REQUIREMENTS:
1. The song is ${totalDuration.toFixed(1)} seconds long - your scenes MUST cover from 0 to ${totalDuration.toFixed(1)} seconds
2. Each scene should be either 4 or 8 seconds long (no other lengths allowed)
3. Scenes must be consecutive with no gaps
4. The last scene MUST end at exactly ${totalDuration.toFixed(1)} seconds
5. Include intro/outro scenes even if they have no lyrics (mark as instrumental)
6. Distribute lyrics meaningfully across scenes - don't cram all lyrics into early scenes

SCENE LENGTH GUIDELINES:
- Use 8-second scenes for verses, choruses, and lyric-heavy sections
- Use 4-second scenes for transitions, bridges, or short phrases
- Aim for roughly ${Math.ceil(totalDuration / 8)} to ${Math.ceil(totalDuration / 6)} total scenes

Return JSON in this exact format:
{
  "scenes": [
    {
      "startTime": 0,
      "endTime": 8,
      "clipLength": 8,
      "lyrics": "First line of lyrics here",
      "sceneType": "intro|verse|chorus|bridge|outro|instrumental"
    }
  ]
}`;

  const userMessage = `
SONG DURATION: ${totalDuration.toFixed(1)} seconds

LYRICS PROVIDED BY USER:
${lyrics}

AUDIO TRANSCRIPTION WITH TIMESTAMPS:
${alignment.segments.map(s => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s]: "${s.text}"`).join('\n')}

WORD TIMESTAMPS (showing distribution across song):
- First words: ${alignment.words.slice(0, 10).map(w => `"${w.word}"@${w.start.toFixed(1)}s`).join(', ')}
- Middle words: ${alignment.words.length > 20 ? alignment.words.slice(Math.floor(alignment.words.length/2) - 5, Math.floor(alignment.words.length/2) + 5).map(w => `"${w.word}"@${w.start.toFixed(1)}s`).join(', ') : 'N/A'}
- Last words: ${alignment.words.slice(-10).map(w => `"${w.word}"@${w.start.toFixed(1)}s`).join(', ')}

Create scenes that:
1. Start at 0 seconds
2. End at exactly ${totalDuration.toFixed(1)} seconds  
3. Use 4 or 8 second clips only
4. Cover ALL lyrics distributed naturally across the song
5. Include instrumental sections where transcription shows no lyrics`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    if (!result.scenes || !Array.isArray(result.scenes) || result.scenes.length === 0) {
      console.log('[MUSIC_ANALYZER] AI returned invalid response, using fallback');
      return createEvenlyDistributedScenes(lyrics, totalDuration);
    }

    console.log(`[MUSIC_ANALYZER] AI created ${result.scenes.length} scenes`);
    
    // Validate and fix the scenes to ensure full coverage
    const validatedScenes = validateAndFixScenes(result.scenes, totalDuration, lyrics);
    
    return validatedScenes;
    
  } catch (error) {
    console.error('[MUSIC_ANALYZER] AI scene creation error:', error);
    return createEvenlyDistributedScenes(lyrics, totalDuration);
  }
}

function validateAndFixScenes(
  aiScenes: Array<{ startTime: number; endTime: number; clipLength: number; lyrics: string; sceneType?: string }>,
  totalDuration: number,
  originalLyrics: string
): SceneTiming[] {
  const scenes: SceneTiming[] = [];
  
  // Sort scenes by start time
  aiScenes.sort((a, b) => a.startTime - b.startTime);
  
  let currentTime = 0;
  
  for (let i = 0; i < aiScenes.length; i++) {
    const scene = aiScenes[i];
    
    // Ensure no gaps - adjust start time if needed
    const startTime = currentTime;
    
    // Validate clip length (must be 4 or 8)
    let clipLength: 4 | 8 = scene.clipLength === 4 ? 4 : 8;
    
    // Calculate end time
    let endTime = startTime + clipLength;
    
    // If this is the last scene, extend or adjust to reach total duration
    if (i === aiScenes.length - 1) {
      const remaining = totalDuration - startTime;
      if (remaining > 10) {
        // Need to add more scenes
        clipLength = 8;
        endTime = startTime + clipLength;
      } else if (remaining > 6) {
        clipLength = 8;
        endTime = totalDuration;
      } else if (remaining > 2) {
        clipLength = 4;
        endTime = totalDuration;
      } else {
        endTime = totalDuration;
      }
    }
    
    // Don't exceed total duration
    if (endTime > totalDuration) {
      endTime = totalDuration;
    }
    
    const lyricText = scene.lyrics || scene.sceneType || 'Instrumental';
    
    scenes.push({
      sceneNumber: 0,
      lyricText: lyricText,
      startTime: Math.round(startTime * 10) / 10,
      endTime: Math.round(endTime * 10) / 10,
      soraClipLength: clipLength,
    });
    
    currentTime = endTime;
    
    // If we've reached the end, stop
    if (currentTime >= totalDuration - 0.5) break;
  }
  
  // If we still haven't covered the full duration, add more scenes
  while (currentTime < totalDuration - 1) {
    const remaining = totalDuration - currentTime;
    const clipLength: 4 | 8 = remaining > 6 ? 8 : 4;
    const endTime = Math.min(currentTime + clipLength, totalDuration);
    
    scenes.push({
      sceneNumber: 0,
      lyricText: 'Instrumental / Outro',
      startTime: Math.round(currentTime * 10) / 10,
      endTime: Math.round(endTime * 10) / 10,
      soraClipLength: clipLength,
    });
    
    currentTime = endTime;
  }
  
  console.log(`[MUSIC_ANALYZER] Validated ${scenes.length} scenes from ${scenes[0]?.startTime || 0}s to ${scenes[scenes.length - 1]?.endTime || 0}s`);
  
  return scenes;
}

function createEvenlyDistributedScenes(lyrics: string, totalDuration: number): SceneTiming[] {
  console.log(`[MUSIC_ANALYZER] Creating evenly distributed scenes for ${totalDuration}s`);
  
  const scenes: SceneTiming[] = [];
  const lines = lyrics.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.match(/^\[.*\]$/));
  
  // Calculate ideal number of scenes (prefer 8-second clips)
  const numScenes = Math.max(Math.ceil(totalDuration / 8), lines.length > 0 ? Math.min(lines.length, Math.ceil(totalDuration / 4)) : 4);
  const sceneDuration = totalDuration / numScenes;
  
  // Distribute lyrics across scenes
  const linesPerScene = lines.length > 0 ? Math.ceil(lines.length / numScenes) : 0;
  
  let currentTime = 0;
  for (let i = 0; i < numScenes; i++) {
    const isLast = i === numScenes - 1;
    const endTime = isLast ? totalDuration : currentTime + sceneDuration;
    const clipLength: 4 | 8 = (endTime - currentTime) > 6 ? 8 : 4;
    
    // Get lyrics for this scene
    const sceneLines = lines.slice(i * linesPerScene, (i + 1) * linesPerScene);
    const lyricText = sceneLines.length > 0 ? sceneLines.join(' ') : `Scene ${i + 1}`;
    
    scenes.push({
      sceneNumber: 0,
      lyricText,
      startTime: Math.round(currentTime * 10) / 10,
      endTime: Math.round(endTime * 10) / 10,
      soraClipLength: clipLength,
    });
    
    currentTime = endTime;
  }
  
  return scenes;
}

export async function getAudioDuration(audioFilePath: string): Promise<number> {
  // Check if it's already a full path (starts with workspace dir)
  const workspaceDir = process.cwd();
  let fullPath: string;
  
  if (audioFilePath.startsWith(workspaceDir)) {
    // Already a full path
    fullPath = audioFilePath;
  } else if (audioFilePath.startsWith('/uploads/')) {
    // URL path - convert to file system path
    fullPath = path.join(workspaceDir, audioFilePath.slice(1));
  } else if (audioFilePath.startsWith('/')) {
    // Other absolute path
    fullPath = path.join(workspaceDir, audioFilePath.slice(1));
  } else {
    // Relative path
    fullPath = path.join(workspaceDir, audioFilePath);
  }
  
  try {
    const { getAudioDurationInSeconds } = await import('get-audio-duration');
    return await getAudioDurationInSeconds(fullPath);
  } catch (error) {
    console.error('[MUSIC_ANALYZER] Error getting audio duration:', error);
    return 180;
  }
}
