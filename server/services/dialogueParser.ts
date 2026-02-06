import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface DialogueLine {
  speaker: string;
  dialogue: string;
  isNarrator: boolean;
  emotion?: string;
  action?: string;
}

export interface DialogueScene {
  sceneNumber: number;
  title?: string;
  lines: DialogueLine[];
  setting?: string;
  visualDescription?: string;
}

export interface ParsedDialogue {
  scenes: DialogueScene[];
  characters: string[];
  narrators: string[];
}

const NARRATOR_NAMES = ['NARRATOR', 'NARRATION', 'VO', 'V.O.', 'VOICEOVER', 'VOICE OVER'];

function isNarratorLine(speaker: string): boolean {
  return NARRATOR_NAMES.some(n => speaker.toUpperCase().includes(n));
}

export async function parseDialogueScript(
  dialogueContent: string,
  animationStyle: string,
  comedyLevel: number = 50,
  absurdityLevel: number = 30
): Promise<ParsedDialogue> {
  try {
    const styleInfluence = getStyleInfluence(animationStyle, comedyLevel, absurdityLevel);
    
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: `You are an expert dialogue script parser for animated content in the style of ${animationStyle}.

Your task is to parse a dialogue script into structured scenes with speakers and their lines.

RULES:
1. Identify all unique speakers/characters from the script
2. Parse dialogue in the format "SPEAKER: dialogue text" or natural conversation
3. Mark narrators/voiceovers (they won't appear visually, only voice)
4. Group dialogue into logical scenes based on setting changes or natural breaks
5. Add emotional context and visual descriptions for each scene
6. Consider the comedy level (${comedyLevel}/100) and absurdity level (${absurdityLevel}/100) when describing scenes

${styleInfluence}

Return a JSON object with:
{
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "Scene title",
      "setting": "Description of where this takes place",
      "visualDescription": "What should be shown visually (for image generation)",
      "lines": [
        {
          "speaker": "CHARACTER_NAME",
          "dialogue": "What they say",
          "isNarrator": false,
          "emotion": "happy/sad/angry/etc",
          "action": "optional physical action"
        }
      ]
    }
  ],
  "characters": ["List of unique character names who appear visually"],
  "narrators": ["List of narrator/voiceover names who don't appear visually"]
}`
        },
        {
          role: "user",
          content: `Parse this dialogue script:\n\n${dialogueContent}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    });

    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    
    if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
      console.log("AI parsing failed, using fallback parser");
      return fallbackDialogueParser(dialogueContent);
    }

    const scenes: DialogueScene[] = parsed.scenes.map((scene: any, index: number) => ({
      sceneNumber: scene.sceneNumber || index + 1,
      title: scene.title || `Scene ${index + 1}`,
      setting: scene.setting || "Unspecified location",
      visualDescription: scene.visualDescription || "",
      lines: (scene.lines || []).map((line: any) => ({
        speaker: line.speaker || "Unknown",
        dialogue: line.dialogue || "",
        isNarrator: line.isNarrator || isNarratorLine(line.speaker || ""),
        emotion: line.emotion,
        action: line.action
      }))
    }));

    const characters = parsed.characters || extractUniqueCharacters(scenes, false);
    const narrators = parsed.narrators || extractUniqueCharacters(scenes, true);

    console.log(`Parsed ${scenes.length} scenes with ${characters.length} characters and ${narrators.length} narrators`);

    return {
      scenes,
      characters,
      narrators
    };

  } catch (error) {
    console.error("Error parsing dialogue script:", error);
    return fallbackDialogueParser(dialogueContent);
  }
}

function getStyleInfluence(style: string, comedyLevel: number, absurdityLevel: number): string {
  const styleGuides: Record<string, string> = {
    'south-park': `
      Style influence: South Park - crude, satirical, topical humor
      - Characters should have simple designs with big heads
      - Dialogue can be edgy and irreverent
      - Visual gags and absurd situations are encouraged`,
    'family-guy': `
      Style influence: Family Guy - pop culture references, cutaway gags
      - Include setup for visual cutaway jokes
      - Characters can break the fourth wall
      - Reference pop culture and current events`,
    'rick-morty': `
      Style influence: Rick & Morty - sci-fi, nihilistic humor, dimension hopping
      - Include pseudo-scientific jargon
      - Existential themes mixed with crude humor
      - Characters can be aware of show conventions`,
    'pixar': `
      Style influence: Pixar 3D - heartwarming, family-friendly, emotional depth
      - Emotional moments should be genuine
      - Visual humor should be accessible to all ages
      - Character expressions should be highly expressive`,
    'anime': `
      Style influence: Anime - dramatic reactions, visual effects, expressive
      - Include dramatic pauses and reactions
      - Characters can have exaggerated emotions
      - Action scenes should be dynamic`,
    'ghibli': `
      Style influence: Studio Ghibli - serene, nature-focused, magical realism
      - Scenes should have peaceful, contemplative moments
      - Nature and environment are characters too
      - Subtle magic woven into everyday life`,
    'claymation': `
      Style influence: Claymation - tactile, stop-motion feel, quirky
      - Movement should feel deliberate and slightly jerky
      - Textures and surfaces are important
      - Physical comedy works well`,
    'simpsons': `
      Style influence: Simpsons - yellow characters, satirical, episodic
      - Social commentary through humor
      - Running gags and callbacks
      - Characters in everyday situations with absurd twists`
  };

  return styleGuides[style] || `Style influence: ${style} - create appropriate visual descriptions for this animation style`;
}

function fallbackDialogueParser(content: string): ParsedDialogue {
  const lines = content.split('\n').filter(l => l.trim());
  const dialoguePattern = /^([A-Z][A-Z0-9\s]*(?:\([^)]*\))?)\s*:\s*(.+)$/;
  
  const parsedLines: DialogueLine[] = [];
  const characters = new Set<string>();
  const narrators = new Set<string>();
  
  for (const line of lines) {
    const match = line.match(dialoguePattern);
    if (match) {
      const speaker = match[1].replace(/\([^)]*\)/, '').trim();
      const dialogue = match[2].trim();
      const isNarrator = isNarratorLine(speaker);
      
      parsedLines.push({
        speaker,
        dialogue,
        isNarrator
      });
      
      if (isNarrator) {
        narrators.add(speaker);
      } else {
        characters.add(speaker);
      }
    }
  }

  const linesPerScene = 5;
  const scenes: DialogueScene[] = [];
  
  for (let i = 0; i < parsedLines.length; i += linesPerScene) {
    const sceneLines = parsedLines.slice(i, i + linesPerScene);
    scenes.push({
      sceneNumber: scenes.length + 1,
      title: `Scene ${scenes.length + 1}`,
      lines: sceneLines
    });
  }

  if (scenes.length === 0) {
    scenes.push({
      sceneNumber: 1,
      title: "Scene 1",
      lines: [{
        speaker: "NARRATOR",
        dialogue: content.trim(),
        isNarrator: true
      }]
    });
    narrators.add("NARRATOR");
  }

  return {
    scenes,
    characters: Array.from(characters),
    narrators: Array.from(narrators)
  };
}

function extractUniqueCharacters(scenes: DialogueScene[], narratorsOnly: boolean): string[] {
  const speakers = new Set<string>();
  
  for (const scene of scenes) {
    for (const line of scene.lines) {
      if (narratorsOnly && line.isNarrator) {
        speakers.add(line.speaker);
      } else if (!narratorsOnly && !line.isNarrator) {
        speakers.add(line.speaker);
      }
    }
  }
  
  return Array.from(speakers);
}

export async function generateAnimationDallePrompt(
  scene: DialogueScene,
  animationStyle: string,
  characterProfiles?: Record<string, string>,
  sceneIndex: number = 0,
  totalScenes: number = 1
): Promise<string> {
  try {
    const visibleCharacters = scene.lines
      .filter(l => !l.isNarrator)
      .map(l => l.speaker)
      .filter((v, i, a) => a.indexOf(v) === i);

    const characterDescriptions = visibleCharacters.map(char => {
      if (characterProfiles && characterProfiles[char]) {
        return `${char}: ${characterProfiles[char]}`;
      }
      return char;
    }).join('\n');

    const emotions = scene.lines
      .filter(l => !l.isNarrator && l.emotion)
      .map(l => `${l.speaker} is ${l.emotion}`)
      .join(', ');

    const stylePromptBase = getAnimationStylePrompt(animationStyle);

    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: `You are an expert at creating DALL-E prompts for animated content.

CRITICAL FOR LIP-SYNC ANIMATION:
- Characters MUST have clear, visible faces facing the camera or at 3/4 angle
- Mouths must be clearly visible and well-defined (not obscured by hands, objects, or shadows)
- Character faces should be in sharp focus
- Avoid extreme angles, profile views, or faces turned away from camera
- Characters should be in the foreground with good lighting on their faces

Style: ${stylePromptBase}

Generate a detailed DALL-E prompt that:
1. Shows the specified characters in frame with CLEAR VISIBLE FACES
2. Captures the setting and mood
3. Uses the ${animationStyle} visual style
4. Ensures faces are well-lit and unobstructed for lip-sync
5. Is under 1000 characters`
        },
        {
          role: "user",
          content: `Create a DALL-E prompt for this animated scene:

Scene ${sceneIndex + 1} of ${totalScenes}: "${scene.title || 'Untitled'}"
Setting: ${scene.setting || 'Unspecified'}
Visual description: ${scene.visualDescription || 'None provided'}

Characters in scene (MUST have clear visible faces):
${characterDescriptions || 'No visible characters - show setting only'}

Emotional context: ${emotions || 'Neutral'}

Sample dialogue:
${scene.lines.slice(0, 3).map(l => `${l.speaker}: "${l.dialogue}"`).join('\n')}`
        }
      ],
      temperature: 0.8
    });

    return response.choices[0].message.content || generateFallbackAnimationPrompt(scene, animationStyle);

  } catch (error) {
    console.error("Error generating animation DALL-E prompt:", error);
    return generateFallbackAnimationPrompt(scene, animationStyle);
  }
}

function getAnimationStylePrompt(style: string): string {
  const stylePrompts: Record<string, string> = {
    'south-park': 'South Park animated style with flat 2D construction paper cutout aesthetic, simple shapes, black outlines',
    'family-guy': 'Family Guy animation style with bold outlines, simple shading, exaggerated character proportions',
    'rick-morty': 'Rick and Morty style with thick black outlines, vibrant colors, sci-fi aesthetic',
    'pixar': 'Pixar 3D animation style with detailed textures, subsurface scattering on skin, expressive eyes',
    'anime': 'Japanese anime style with large expressive eyes, dynamic poses, cel shading',
    'ghibli': 'Studio Ghibli watercolor style with soft colors, detailed backgrounds, gentle lighting',
    'claymation': 'Claymation stop-motion style with visible clay textures, slightly imperfect surfaces',
    'simpsons': 'Simpsons animation style with yellow skin tones, overbites, bulging eyes'
  };

  return stylePrompts[style] || `${style} animation style`;
}

function generateFallbackAnimationPrompt(scene: DialogueScene, style: string): string {
  const visibleCharacters = scene.lines
    .filter(l => !l.isNarrator)
    .map(l => l.speaker)
    .filter((v, i, a) => a.indexOf(v) === i);

  const stylePrompt = getAnimationStylePrompt(style);
  
  return `${stylePrompt}, ${visibleCharacters.length > 0 
    ? `showing ${visibleCharacters.join(' and ')} with clear visible faces facing the camera` 
    : 'establishing shot of the scene'}, ${scene.setting || 'interior setting'}, well-lit, high quality animation frame, character faces clearly visible for lip-sync`;
}
