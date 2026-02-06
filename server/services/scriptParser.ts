import OpenAI from "openai";
import { estimateSceneDurations } from "./openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "" });

interface ScriptScene {
  content: string;
  title?: string;
  estimatedDuration?: number;
}

/**
 * Fallback manual scene splitting when AI fails
 */
function manualSplitScenes(scenes: ScriptScene[], targetMinimum: number): ScriptScene[] {
  if (scenes.length >= targetMinimum) {
    return scenes;
  }
  
  const result: ScriptScene[] = [];
  const scenesToSplit = targetMinimum - scenes.length;
  
  // Find the longest scenes to split
  const scenesWithLength = scenes.map((scene, index) => ({
    ...scene,
    originalIndex: index,
    wordCount: scene.content.split(/\s+/).length
  })).sort((a, b) => b.wordCount - a.wordCount);
  
  let splitsRemaining = scenesToSplit;
  
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    
    // Determine if this scene should be split
    const shouldSplit = splitsRemaining > 0 && 
      scenesWithLength.slice(0, splitsRemaining).some(s => s.originalIndex === i);
    
    if (shouldSplit && splitsRemaining > 0) {
      // Split this scene roughly in half
      const sentences = scene.content.split(/[.!?]+/).filter(s => s.trim().length > 0);
      
      if (sentences.length >= 2) {
        const midPoint = Math.ceil(sentences.length / 2);
        const firstHalf = sentences.slice(0, midPoint).join('.').trim() + '.';
        const secondHalf = sentences.slice(midPoint).join('.').trim() + '.';
        
        result.push({ ...scene, content: firstHalf });
        result.push({ ...scene, content: secondHalf });
        splitsRemaining--;
      } else {
        // If we can't split by sentences, split by words
        const words = scene.content.split(/\s+/);
        const midPoint = Math.ceil(words.length / 2);
        const firstHalf = words.slice(0, midPoint).join(' ');
        const secondHalf = words.slice(midPoint).join(' ');
        
        result.push({ ...scene, content: firstHalf });
        result.push({ ...scene, content: secondHalf });
        splitsRemaining--;
      }
    } else {
      result.push(scene);
    }
  }
  
  console.log(`Manual split created ${result.length} scenes from ${scenes.length} original scenes`);
  return result;
}



/**
 * Split scenes intelligently to meet minimum count for audio duration
 */
async function splitScenesForAudio(scenes: ScriptScene[], targetMinimum: number): Promise<ScriptScene[]> {
  if (scenes.length >= targetMinimum) {
    return scenes;
  }

  try {
    console.log(`Need to create ${targetMinimum - scenes.length} additional scenes from ${scenes.length} existing scenes`);
    
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: `You are an expert video editor. You need to split existing script scenes to create exactly ${targetMinimum} total scenes for optimal video pacing. 

CRITICAL RULES:
- You must output exactly ${targetMinimum} scenes
- PRESERVE THE EXACT ORIGINAL TEXT - copy it word-for-word, do not rewrite or paraphrase
- Do NOT add visual directions, camera instructions, or scene descriptions
- Simply split the original text at natural break points
- Each scene's "content" must be the EXACT verbatim text from the original script
- Maintain chronological order

Return a JSON object with a "scenes" array containing exactly ${targetMinimum} scene objects, each with a "content" property containing the EXACT original text.`
        },
        {
          role: "user",
          content: `Here are the current ${scenes.length} scenes that need to be split into exactly ${targetMinimum} scenes.

IMPORTANT: Copy the EXACT text from each scene - do NOT rewrite it. Just split the text at natural breaks.

${scenes.map((scene, i) => `Scene ${i + 1}: ${scene.content}`).join('\n\n')}

Split these into exactly ${targetMinimum} scenes. Each scene's content must be the EXACT verbatim original text - no rewrites.`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    });

    const splitResponse = JSON.parse(response.choices[0].message.content || "{}");
    
    if (Array.isArray(splitResponse.scenes) && splitResponse.scenes.length === targetMinimum) {
      console.log(`Successfully split into ${splitResponse.scenes.length} scenes`);
      return splitResponse.scenes;
    } else {
      console.log(`AI split resulted in ${splitResponse.scenes?.length || 0} scenes, falling back to manual split`);
      return manualSplitScenes(scenes, targetMinimum);
    }
  } catch (error) {
    console.error("Error in AI scene splitting:", error);
    return manualSplitScenes(scenes, targetMinimum);
  }
}

/**
 * Parse a script into logical scene chunks
 */
export async function parseScript(script: string, audioDurationSeconds?: number): Promise<ScriptScene[]> {
  
  // Define consolidateScenes function within scope
  async function consolidateScenesLocal(scenes: ScriptScene[], targetCount: number): Promise<ScriptScene[]> {
    if (scenes.length <= targetCount) {
      return scenes;
    }

    try {
      console.log(`Consolidating ${scenes.length} scenes into ${targetCount} scenes`);
      
      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          {
            role: "system",
            content: `You are an expert video editor. You need to consolidate existing script scenes to create exactly ${targetCount} total scenes for optimal video pacing with the available audio duration. 

CRITICAL RULES:
- You must output exactly ${targetCount} scenes
- PRESERVE THE EXACT ORIGINAL TEXT - concatenate the original text verbatim, do not rewrite or paraphrase
- Do NOT add visual directions, camera instructions, or scene descriptions
- Simply combine adjacent scenes by joining their exact text
- Each scene's "content" must be the EXACT verbatim text from the original scenes
- Maintain chronological order

Return a JSON object with a "scenes" array containing exactly ${targetCount} scene objects, each with a "content" property containing the EXACT original text.`
          },
          {
            role: "user",
            content: `Here are the current ${scenes.length} scenes that need to be consolidated into exactly ${targetCount} scenes.

IMPORTANT: Preserve the EXACT text from each scene - do NOT rewrite it. Just combine adjacent scenes by joining their text.

${scenes.map((scene, i) => `Scene ${i + 1}: ${scene.content}`).join('\n\n')}

Combine these into exactly ${targetCount} scenes. Each scene's content must be the EXACT verbatim original text - no rewrites.`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3
      });

      const consolidatedResponse = JSON.parse(response.choices[0].message.content || "{}");
      
      if (Array.isArray(consolidatedResponse.scenes) && consolidatedResponse.scenes.length === targetCount) {
        console.log(`Successfully consolidated into ${consolidatedResponse.scenes.length} scenes`);
        return consolidatedResponse.scenes;
      } else {
        console.log(`AI consolidation resulted in ${consolidatedResponse.scenes?.length || 0} scenes, falling back to manual consolidation`);
        return manualConsolidateScenesLocal(scenes, targetCount);
      }
    } catch (error) {
      console.error("Error in AI scene consolidation:", error);
      return manualConsolidateScenesLocal(scenes, targetCount);
    }
  }

  function manualConsolidateScenesLocal(scenes: ScriptScene[], targetCount: number): ScriptScene[] {
    if (scenes.length <= targetCount) {
      return scenes;
    }
    
    const result: ScriptScene[] = [];
    const scenesPerGroup = Math.ceil(scenes.length / targetCount);
    
    for (let i = 0; i < scenes.length; i += scenesPerGroup) {
      const group = scenes.slice(i, i + scenesPerGroup);
      const combinedContent = group.map(scene => scene.content).join(' ');
      
      result.push({
        content: combinedContent,
        title: group[0].title || `Consolidated Scene ${Math.floor(i / scenesPerGroup) + 1}`,
        estimatedDuration: group.reduce((sum, scene) => sum + (scene.estimatedDuration || 0), 0)
      });
    }
    
    return result.slice(0, targetCount);
  }
  try {
    // Calculate optimal number of scenes based on 10-second intervals
    let sceneCountGuidance = "Break the script into 4-8 scenes depending on its length and complexity.";
    if (audioDurationSeconds) {
      const secondsPerScene = 10;
      const recommendedScenes = Math.ceil(audioDurationSeconds / secondsPerScene);
      const finalScenes = Math.max(recommendedScenes, 2);
      sceneCountGuidance = `Break the script into ${finalScenes} scenes. This ensures 10-second intervals for the ${audioDurationSeconds}-second audio duration (${(audioDurationSeconds / finalScenes).toFixed(1)} seconds per scene on average).`;
      
      console.log(`Audio duration: ${audioDurationSeconds}s, recommending ${finalScenes} scenes for 10-second intervals`);
    }

    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: 
            "You are an expert video editor who breaks down scripts into logical visual scenes. " +
            "Each scene should represent a single visual that could appear in a video. " +
            sceneCountGuidance + " " +
            "Look for natural scene transitions in the narrative. " +
            "CRITICAL: You must preserve the EXACT original script text in each scene. " +
            "Do NOT rewrite, summarize, paraphrase, or add visual directions. " +
            "The 'content' field must contain the EXACT words from the original script, verbatim. " +
            "Return your response as a JSON object."
        },
        {
          role: "user",
          content: `Parse this script into logical scenes for a faceless YouTube video. 

IMPORTANT: Each scene's 'content' must contain the EXACT original text from the script - copy it word-for-word. Do NOT rewrite it into visual descriptions or directions.

Return the result as a JSON object with a "scenes" array. Each scene object should have:
- 'content': the EXACT verbatim text from this section of the script (copy-paste, no changes)
- 'title': a short descriptive title for the scene

Script to parse:

${script}`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const parsedResponse = JSON.parse(response.choices[0].message.content || "{}");
    let scenes: ScriptScene[] = [];
    
    if (Array.isArray(parsedResponse.scenes)) {
      scenes = parsedResponse.scenes;
    } else {
      // Fallback to simple paragraph splitting
      scenes = script.split(/\n\s*\n/).map(paragraph => ({ content: paragraph.trim() }));
    }
    
    // Optimize scene count for audio-driven content using 10-second intervals
    if (audioDurationSeconds && scenes.length > 0) {
      // Use 10-second intervals as the primary logic
      const secondsPerScene = 10;
      
      // Calculate optimal number of scenes based on 10-second intervals
      let targetScenes = Math.ceil(audioDurationSeconds / secondsPerScene);
      
      // Add safety limits to prevent excessive scene generation
      const maxScenes = 20; // Maximum scenes regardless of duration
      const minScenes = 2;
      
      // Apply safety limits
      targetScenes = Math.max(minScenes, Math.min(targetScenes, maxScenes));
      
      // If duration seems unrealistic (over 5 minutes), limit to reasonable count
      if (audioDurationSeconds > 300) {
        console.log(`Warning: Audio duration ${audioDurationSeconds}s seems too long, limiting to 10 scenes`);
        targetScenes = Math.min(targetScenes, 10);
      }
      
      console.log(`Audio: ${audioDurationSeconds}s, Current: ${scenes.length} scenes, Target: ${targetScenes} scenes (~${secondsPerScene}s per scene)`);
      
      if (scenes.length < targetScenes) {
        console.log(`Splitting scenes: need ${targetScenes - scenes.length} more scenes for 10-second intervals`);
        scenes = await splitScenesForAudio(scenes, targetScenes);
        console.log(`After splitting: ${scenes.length} scenes`);
      } else if (scenes.length > targetScenes * 1.5) {
        // If we have way too many scenes, consolidate to match 10-second intervals
        console.log(`Too many scenes (${scenes.length}), consolidating to ${targetScenes} for 10-second intervals`);
        scenes = await consolidateScenesLocal(scenes, targetScenes);
        console.log(`After consolidation: ${scenes.length} scenes`);
      }
    }
    
    // Estimate durations for each scene
    const durations = await estimateSceneDurations(scenes);
    
    return scenes.map((scene, index) => ({
      ...scene,
      estimatedDuration: durations[index] || Math.round((scene.content.split(/\s+/).length / 2))
    }));
  } catch (error) {
    console.error("Error parsing script:", error);
    // Fallback to 10-second interval splitting based on audio duration
    return createSimpleScenes(script, audioDurationSeconds);
  }
}

/**
 * Simple fallback scene creation based on 10-second intervals
 */
function createSimpleScenes(script: string, audioDurationSeconds?: number): ScriptScene[] {
  if (!audioDurationSeconds) {
    // No audio duration - split by paragraphs or sentences
    const paragraphs = script.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    if (paragraphs.length > 1) {
      return paragraphs.map(paragraph => ({ content: paragraph.trim() }));
    }
    
    // Split long single paragraph by sentences
    const sentences = script.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 3) {
      const scenesPerGroup = Math.ceil(sentences.length / 4);
      const scenes: ScriptScene[] = [];
      for (let i = 0; i < sentences.length; i += scenesPerGroup) {
        const group = sentences.slice(i, i + scenesPerGroup);
        scenes.push({ content: group.join('. ').trim() + '.' });
      }
      return scenes;
    }
    
    return [{ content: script.trim() }];
  }
  
  // Create scenes based on 10-second intervals
  const targetScenes = Math.ceil(audioDurationSeconds / 10);
  const words = script.split(/\s+/);
  const wordsPerScene = Math.ceil(words.length / targetScenes);
  
  const scenes: ScriptScene[] = [];
  for (let i = 0; i < targetScenes; i++) {
    const startIndex = i * wordsPerScene;
    const endIndex = Math.min((i + 1) * wordsPerScene, words.length);
    const sceneWords = words.slice(startIndex, endIndex);
    
    if (sceneWords.length > 0) {
      scenes.push({
        content: sceneWords.join(' '),
        estimatedDuration: 10
      });
    }
  }
  
  console.log(`Created ${scenes.length} simple scenes for ${audioDurationSeconds}s audio (10-second intervals)`);
  return scenes;
}

/**
 * Generate appropriate titles for each scene
 */
export async function generateSceneTitles(scenes: ScriptScene[]): Promise<ScriptScene[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: "You are an expert at creating compelling, descriptive titles for video scenes. Create a short, engaging title (3-8 words) for each scene that captures its main visual or narrative focus."
        },
        {
          role: "user",
          content: `Generate titles for these scenes:\n\n${scenes.map((scene, i) => `Scene ${i + 1}: ${scene.content}`).join('\n\n')}\n\nReturn as JSON with "scenes" array, each object having "title" and "content" properties.`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const titledResponse = JSON.parse(response.choices[0].message.content || "{}");
    
    if (Array.isArray(titledResponse.scenes) && titledResponse.scenes.length === scenes.length) {
      console.log(`Added titles to ${titledResponse.scenes.length} scenes`);
      return titledResponse.scenes;
    } else {
      // Fallback: generate simple titles
      return scenes.map((scene, index) => ({
        ...scene,
        title: `Scene ${index + 1}`
      }));
    }
  } catch (error) {
    console.error("Error generating scene titles:", error);
    // Fallback: generate simple titles
    return scenes.map((scene, index) => ({
      ...scene,
      title: `Scene ${index + 1}`
    }));
  }
}