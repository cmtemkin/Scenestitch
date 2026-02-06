import { ProjectType } from '@shared/schema';
import { modelConfig } from '../config';

/**
 * Generate scene prompts specialized for different project types
 */
export async function generateProjectTypePrompts(
  projectType: ProjectType,
  content: string,
  style: string,
  customStylePrompt?: string
): Promise<{
  specializedPrompt: string;
  parseInstructions: string;
  toneInstructions: string;
  imageFormats: { type: string; description: string; aspectRatio: string; resolution: string }[];
}> {
  // Base style instructions that apply to all project types
  const styleInstructions = style === 'custom' 
    ? `Apply this custom style: ${customStylePrompt}` 
    : `Apply this style: ${style}`;
  
  // Default image formats for explainer videos
  const defaultImageFormats = [
    { 
      type: 'scene', 
      description: 'Standard scene image for video', 
      aspectRatio: '16:9',
      resolution: '1024x576'
    }
  ];
  
  // Project type specific settings
  switch (projectType) {
    case 'blog':
      return {
        specializedPrompt: `
You are a professional visual designer for blog content.
${styleInstructions}
The tone should be witty and engaging while maintaining visual appeal.
        `,
        parseInstructions: `
Parse the blog post into logical sections. For each section:
1. Create a thumbnail image for the blog post (square format)
2. Create a hero image for the top of the blog (wide format)
3. Create an Instagram story image for social promotion (vertical format)
4. Create a section header image for each main heading in the post
        `,
        toneInstructions: 'Witty and engaging while maintaining professional appeal',
        imageFormats: [
          { 
            type: 'thumbnail', 
            description: 'Square thumbnail for blog listings', 
            aspectRatio: '1:1',
            resolution: '1024x1024'
          },
          { 
            type: 'hero', 
            description: 'Wide hero image for blog header', 
            aspectRatio: '16:9',
            resolution: '1024x576'
          },
          { 
            type: 'instagram', 
            description: 'Vertical image for Instagram story', 
            aspectRatio: '9:16',
            resolution: '576x1024'
          },
          { 
            type: 'section', 
            description: 'Section header image', 
            aspectRatio: '16:9',
            resolution: '1024x576'
          }
        ]
      };
    
    case 'presentation':
      return {
        specializedPrompt: `
You are a professional business presentation designer.
${styleInstructions}
The tone should be professional, informative, and business-appropriate.
        `,
        parseInstructions: `
Parse the content into logical presentation slides. For each slide:
1. Create a title slide for the presentation
2. Create a section divider slide for each main section 
3. Create appropriate visuals for key slide content
4. Create a conclusion/summary slide
        `,
        toneInstructions: 'Professional, informative, and business-appropriate',
        imageFormats: [
          { 
            type: 'title', 
            description: 'Title slide for presentation', 
            aspectRatio: '16:9',
            resolution: '1024x576'
          },
          { 
            type: 'section', 
            description: 'Section divider slide', 
            aspectRatio: '16:9',
            resolution: '1024x576'
          },
          { 
            type: 'content', 
            description: 'Content slide with visuals', 
            aspectRatio: '16:9',
            resolution: '1024x576'
          },
          { 
            type: 'conclusion', 
            description: 'Conclusion slide', 
            aspectRatio: '16:9',
            resolution: '1024x576'
          }
        ]
      };
    
    case 'sora':
      return {
        specializedPrompt: `
You are a world-class video director and cinematographer creating detailed prompts for OpenAI's Sora text-to-video model.
${styleInstructions}
Your prompts should be comprehensive and include: dialogue, camera movements, lighting, character actions, environment details, narrative beats, and all visual elements needed for 10-15 second video clips.
        `,
        parseInstructions: `
Break this script into 10-15 second video scenes optimized for Sora text-to-video generation.
Each scene should:
- Be a complete narrative moment (10-15 seconds when performed)
- Include any dialogue that occurs
- Have clear beginning, middle, and end
- Flow naturally into the next scene
- Be suitable for direct video generation (not just static images)
        `,
        toneInstructions: 'Cinematic, detailed, and comprehensive for AI video generation',
        imageFormats: [
          { 
            type: 'video-prompt', 
            description: 'Detailed text-to-video prompt for Sora', 
            aspectRatio: '16:9',
            resolution: '1920x1080'
          }
        ]
      };
    
    case 'video':
    default:
      return {
        specializedPrompt: `
You are a professional storyboard artist for explainer videos.
${styleInstructions}
        `,
        parseInstructions: `
Parse the script into logical scenes for an explainer video.
Each scene should have distinct visuals that help convey the information being shared.
Keep scenes concise and visually focused.
        `,
        toneInstructions: 'Informative and visually engaging',
        imageFormats: defaultImageFormats
      };
  }
}

/**
 * Get example/template content for each project type
 */
export function getProjectTypeTemplate(projectType: ProjectType): string {
  switch (projectType) {
    case 'blog':
      return `# The Future of AI in Everyday Life

## Introduction
Artificial intelligence is no longer just a sci-fi concept. It's in our phones, homes, and workplaces. But how will it shape our daily routines in the coming years?

## AI in the Kitchen
Smart refrigerators that track expiration dates and suggest recipes based on what's inside are just the beginning. Soon, AI cooking assistants will help you perfect techniques and customize meals to your nutritional needs.

## The AI Work Companion
Forget simple spell-check. Next-generation AI tools will help you draft emails that hit the right tone, summarize lengthy documents, and even suggest strategic approaches to complex problems.

## Privacy Concerns
As AI collects more data about our habits, where do we draw the line? The balance between convenience and privacy will be the defining tech challenge of the decade.

## Conclusion
The AI revolution isn't coming—it's already here. The question isn't whether AI will transform our lives, but how we'll adapt and thrive alongside our increasingly intelligent tools.`;

    case 'presentation':
      return `# Q4 Sales Performance Analysis

## Executive Summary
• Exceeded Q4 revenue targets by 12.3%
• New customer acquisition up 18% from previous quarter
• Product line expansion driving 28% of new revenue

## Regional Performance
• North America: 115% of target
• Europe: 108% of target
• Asia-Pacific: 97% of target
• Latin America: 124% of target (highest growth region)

## Product Performance
• Enterprise Suite: 132% of target
• Small Business Solutions: 105% of target
• Consumer Products: 88% of target (below expectations)

## Q1 2026 Outlook
• Projected 15% YoY growth
• New product launches in Enterprise and SMB categories
• Expanded sales team in APAC to address performance gap

## Strategic Initiatives
• Customer retention program implementation
• Digital marketing channel optimization
• Sales enablement training refresh

## Next Steps
• Department-level goal setting by January 15
• Q1 campaign launch January 30
• Mid-quarter performance review February 28`;

    case 'sora':
      return `A young woman walks through a bustling Tokyo street at twilight, neon signs reflecting off puddles from recent rain.

WOMAN (voiceover): "I used to think magic only existed in stories."

She pauses at a corner, looking up at the glowing cityscape. The camera slowly circles around her as she smiles.

WOMAN (voiceover): "But then I discovered that every moment is its own kind of magic."

She continues walking, passing by a street vendor selling yakitori. Steam rises from the grill, catching the neon light.

Cut to her entering a small café, the warm interior contrasting with the cool night outside.

WOMAN (to barista): "The usual, please."

The barista nods and begins preparing her drink. The woman sits by the window, watching the city flow past.

WOMAN (voiceover): "In the quiet moments between chaos, that's where you find it."

Close-up of her hands wrapping around the warm cup, steam rising. Her reflection in the window shows the busy street behind her.

WOMAN (voiceover): "The magic of simply being alive."

She takes a sip, eyes closed, savoring the moment as the city lights twinkle outside.`;

    case 'video':
    default:
      return `Today, we're exploring how coral reefs support marine biodiversity.

Coral reefs cover less than 1% of the ocean floor, but they support about 25% of all marine species!

These vibrant underwater ecosystems are formed by colonies of tiny animals called coral polyps that secrete calcium carbonate to build their protective homes.

Reefs provide shelter, food, and breeding grounds for thousands of species - from microscopic plankton to enormous whale sharks.

They act as natural barriers, protecting coastlines from storms and erosion, while also supporting human economies through tourism and fisheries.

Unfortunately, climate change, pollution, and destructive fishing practices threaten these delicate ecosystems. When water temperatures rise, corals expel the colorful algae living in their tissues, causing "coral bleaching" that can lead to coral death.

Conservation efforts include establishing marine protected areas, developing heat-resistant coral varieties, and reducing carbon emissions to combat ocean acidification.

By protecting coral reefs, we're not just saving beautiful underwater landscapes - we're preserving vital habitats that support the health of our entire ocean ecosystem.`;
  }
}

/**
 * Get specialized scene parsing instructions for handling different project types
 */
export function getSceneParsingInstructions(projectType: ProjectType): string {
  switch (projectType) {
    case 'blog':
      return `
Parse this blog post into distinct sections that require images. 
Identify:
1. A thumbnail image that captures the essence of the entire post
2. A hero image for the top of the blog
3. An Instagram story image for promotion
4. Each main section that needs its own header image

For each section, extract:
- The title/heading of the section
- A brief excerpt of the key content
- A concise description of what the image should contain
`;
    
    case 'presentation':
      return `
Parse this presentation content into distinct slides.
Identify:
1. A title slide
2. Each main section slide
3. Key content slides that need supporting visuals
4. A conclusion/summary slide

For each slide, extract:
- The slide title/heading
- The key content points
- A concise description of what the visual should contain
`;
    
    case 'sora':
      return `
Parse this script into 10-15 second video scenes optimized for Sora text-to-video generation.
For each scene:
- Identify complete narrative moments (10-15 seconds when performed)
- Extract ALL dialogue that occurs in this time window
- Include character actions, camera movements, and environmental details
- Ensure each scene has a clear beginning, middle, and end
- Create scenes that flow naturally into each other
- Focus on moments suitable for direct video generation

Each scene should be a self-contained cinematic moment with enough detail for AI video generation.
`;
    
    case 'video':
    default:
      return `
Parse this video script into distinct scenes.
For each scene:
- Identify the natural break points in the narrative
- Extract the specific lines of dialogue or narration
- Create a clear description of what should be visualized
`;
  }
}