import OpenAI from "openai";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "",
  dangerouslyAllowBrowser: true 
});

interface PromptVariation {
  prompt: string;
  explanation: string;
}

export async function generatePromptVariations(
  currentPrompt: string,
  promptType: "dalle" | "sora"
): Promise<{ variations: PromptVariation[] }> {
  try {
    const promptTypeDescription = promptType === "dalle" ? "image generation" : "text-to-video (Sora)";
    
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      temperature: 1.0,
      messages: [
        {
          role: "system",
          content: `You are an expert prompt engineer specializing in AI ${promptTypeDescription} prompts.
Your task is to analyze a given prompt and generate 3 improved variations that:
1. Maintain the core concept and style
2. Add more specific visual details
3. Improve clarity and specificity
4. Enhance the likelihood of generating high-quality results

Each variation should be meaningfully different while staying true to the original intent.
${promptType === "sora" ? "Remember: Sora prompts should include camera movements, scene details, dialogue, and comprehensive visual descriptions for 10-15 second videos." : "Remember: Image prompts should be detailed but concise, focusing on composition, style, lighting, and subject matter."}

Return a JSON object with a "variations" array, where each variation has:
- "prompt": The improved prompt text
- "explanation": A brief explanation (1-2 sentences) of what was improved`
        },
        {
          role: "user",
          content: `Generate 3 improved variations of this ${promptTypeDescription} prompt:\n\n${currentPrompt}`
        }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    if (!Array.isArray(result.variations) || result.variations.length === 0) {
      throw new Error("Failed to generate prompt variations");
    }

    return { variations: result.variations.slice(0, 3) }; // Ensure max 3 variations
  } catch (error) {
    console.error("Error generating prompt variations:", error);
    throw error;
  }
}
