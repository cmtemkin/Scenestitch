import { getNotionClient } from './notionClient';

const PARENT_PAGE_ID = '1dd9dc29993680338035ff32f08f837f';

interface SceneStitchWorkspace {
  mainPageId: string;
  technicalDocsId: string;
  userGuideId: string;
  releaseNotesId: string;
}

let workspaceIds: SceneStitchWorkspace | null = null;

async function findOrCreatePage(client: any, parentId: string, title: string, icon: string): Promise<string> {
  const searchResults = await client.search({
    query: title,
    filter: { property: 'object', value: 'page' }
  });
  
  const existingPage = searchResults.results.find((page: any) => 
    page.parent?.page_id?.replace(/-/g, '') === parentId.replace(/-/g, '') &&
    page.properties?.title?.title?.[0]?.plain_text === title
  );
  
  if (existingPage) {
    return existingPage.id;
  }
  
  const newPage = await client.pages.create({
    parent: { page_id: parentId },
    icon: { type: 'emoji', emoji: icon },
    properties: {
      title: { title: [{ text: { content: title } }] }
    }
  });
  
  return newPage.id;
}

export async function initializeSceneStitchWorkspace(): Promise<SceneStitchWorkspace> {
  const client = await getNotionClient();
  
  const mainPageId = await findOrCreatePage(client, PARENT_PAGE_ID, 'SceneStitch', '🎬');
  const technicalDocsId = await findOrCreatePage(client, mainPageId, 'Technical Documentation', '🔧');
  const userGuideId = await findOrCreatePage(client, mainPageId, 'User Guide', '📖');
  const releaseNotesId = await findOrCreatePage(client, mainPageId, 'Release Notes', '📋');
  
  workspaceIds = { mainPageId, technicalDocsId, userGuideId, releaseNotesId };
  
  await updateTechnicalDocs();
  await updateUserGuide();
  
  return workspaceIds;
}

function h1(text: string) {
  return { object: 'block', type: 'heading_1', heading_1: { rich_text: [{ type: 'text', text: { content: text } }] } };
}

function h2(text: string) {
  return { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: text } }] } };
}

function h3(text: string) {
  return { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: text } }] } };
}

function p(text: string) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: text } }] } };
}

function bullet(text: string) {
  return { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text } }] } };
}

function numbered(text: string) {
  return { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ type: 'text', text: { content: text } }] } };
}

function callout(text: string, emoji: string = '💡') {
  return { object: 'block', type: 'callout', callout: { rich_text: [{ type: 'text', text: { content: text } }], icon: { type: 'emoji', emoji } } };
}

function code(content: string, language: string = 'plain text') {
  return { object: 'block', type: 'code', code: { rich_text: [{ type: 'text', text: { content } }], language } };
}

function divider() {
  return { object: 'block', type: 'divider', divider: {} };
}

function quote(text: string) {
  return { object: 'block', type: 'quote', quote: { rich_text: [{ type: 'text', text: { content: text } }] } };
}

export async function updateTechnicalDocs(): Promise<void> {
  if (!workspaceIds) {
    await initializeSceneStitchWorkspace();
    return;
  }
  
  const client = await getNotionClient();
  
  const blocks = [
    h1('SceneStitch Technical Documentation'),
    p(`Last updated: ${new Date().toISOString().split('T')[0]}`),
    quote('Complete technical reference for SceneStitch - the AI-powered video generation platform'),
    divider(),

    h2('1. System Overview'),
    p('SceneStitch is a full-stack web application that transforms text-based scripts into visual storytelling content using advanced AI services. The platform supports three distinct project types: Standard Video, Music Video, and Animation Mode.'),
    
    h3('1.1 Core Capabilities'),
    bullet('Script-to-video pipeline with AI scene analysis'),
    bullet('Character continuity system for visual consistency'),
    bullet('Multi-scene organization and storyboard management'),
    bullet('AI image generation with DALL-E 3'),
    bullet('AI video generation with OpenAI Sora 2'),
    bullet('Text-to-speech with ElevenLabs'),
    bullet('Lip-sync animation with Wav2Lip'),
    bullet('Music video creation with audio analysis'),
    divider(),

    h2('2. Platform Architecture'),
    
    h3('2.1 Frontend Stack'),
    bullet('React 18 with TypeScript for type-safe UI development'),
    bullet('Vite for fast development builds and HMR'),
    bullet('Tailwind CSS for utility-first styling'),
    bullet('shadcn/ui for accessible component library'),
    bullet('Radix UI primitives for accessibility'),
    bullet('TanStack Query (React Query v5) for server state management'),
    bullet('React Hook Form + Zod for form validation'),
    bullet('Wouter for lightweight client-side routing'),
    bullet('Framer Motion for animations'),
    
    h3('2.2 Backend Stack'),
    bullet('Express.js with TypeScript'),
    bullet('RESTful API design'),
    bullet('WebSocket support for real-time updates'),
    bullet('Multer for file uploads'),
    bullet('FFmpeg for video processing'),
    bullet('Sharp for image optimization'),
    
    h3('2.3 Database'),
    bullet('PostgreSQL (Neon serverless)'),
    bullet('Drizzle ORM for type-safe queries'),
    bullet('Drizzle Kit for schema management'),
    
    h3('2.4 AI Services'),
    bullet('OpenAI GPT-4o/GPT-5.1 for script analysis and prompt generation'),
    bullet('OpenAI DALL-E 3 for image generation'),
    bullet('OpenAI Sora 2 for image-to-video generation'),
    bullet('OpenAI Whisper for audio transcription'),
    bullet('ElevenLabs for text-to-speech'),
    bullet('Anthropic Claude as alternative LLM'),
    divider(),

    h2('3. Database Schema'),
    
    h3('3.1 Core Tables'),
    
    p('scripts - Main project table'),
    code(`id: serial PRIMARY KEY
title: varchar(255)
content: text (script content)
projectType: varchar(50) (standard/music_video/animation)
style: varchar(100) (visual style)
status: varchar(50) (pending/processing/completed)
animationStatus: varchar(50)
thumbnailUrl: text
videoUrl: text
audioFilePath: text
audioDuration: integer
musicAudioUrl: text
referenceImageUrl: text
createdAt: timestamp`, 'sql'),

    p('scenes - Scene data for each project'),
    code(`id: serial PRIMARY KEY
scriptId: integer REFERENCES scripts(id)
title: varchar(255)
description: text
visualDescription: text
dallePrompt: text
soraPrompt: text
imageUrl: text
thumbnailUrl: text
sortOrder: integer
startTime: numeric
endTime: numeric
status: varchar(50)`, 'sql'),

    p('animationCharacters - Characters for animation projects'),
    code(`id: serial PRIMARY KEY
scriptId: integer REFERENCES scripts(id)
name: varchar(100)
displayName: varchar(100)
description: text
voiceId: varchar(100)
voiceName: varchar(100)
color: varchar(20)
isNarrator: boolean
sortOrder: integer`, 'sql'),

    p('animationFrames - Dialogue frames for animation'),
    code(`id: serial PRIMARY KEY
scriptId: integer REFERENCES scripts(id)
characterId: integer REFERENCES animationCharacters(id)
sceneGroupId: integer REFERENCES animationScenes(id)
dialogue: text
emotion: varchar(50)
action: text
setting: text
visualNotes: text
sortOrder: integer
status: varchar(50)`, 'sql'),

    p('animationScenes - Scene groups for multi-scene animations'),
    code(`id: serial PRIMARY KEY
scriptId: integer REFERENCES scripts(id)
title: varchar(255)
setting: text
timeOfDay: varchar(50)
summary: text
sortOrder: integer
status: varchar(50)`, 'sql'),

    p('soraJobs - Video generation job tracking'),
    code(`id: serial PRIMARY KEY
sceneId: integer REFERENCES scenes(id)
scriptId: integer
status: varchar(50)
soraTaskId: varchar(255)
videoUrl: text
duration: integer
error: text
createdAt: timestamp`, 'sql'),
    divider(),

    h2('4. API Reference'),
    
    h3('4.1 Project Management'),
    
    p('GET /api/scripts - List all projects'),
    code(`Response: { scripts: Script[] }`, 'json'),
    
    p('POST /api/scripts - Create new project'),
    code(`Request: {
  title: string,
  content: string,
  projectType: "standard" | "music_video" | "animation",
  style: string
}
Response: { script: Script }`, 'json'),
    
    p('GET /api/scripts/:id - Get project details'),
    code(`Response: { script: Script }`, 'json'),
    
    p('PATCH /api/scripts/:id - Update project'),
    code(`Request: Partial<Script>
Response: { script: Script }`, 'json'),
    
    p('DELETE /api/scripts/:id - Delete project'),
    code(`Response: { success: true }`, 'json'),
    
    h3('4.2 Scene Management'),
    
    p('GET /api/scenes/:scriptId - Get scenes for project'),
    code(`Response: { scenes: Scene[] }`, 'json'),
    
    p('POST /api/scenes - Create scene'),
    code(`Request: {
  scriptId: number,
  title: string,
  description: string,
  sortOrder: number
}
Response: { scene: Scene }`, 'json'),
    
    p('PATCH /api/scenes/:id - Update scene'),
    code(`Request: Partial<Scene>
Response: { scene: Scene }`, 'json'),
    
    h3('4.3 Animation Endpoints'),
    
    p('GET /api/scripts/:id/animation-characters - Get characters'),
    code(`Response: { characters: AnimationCharacter[] }`, 'json'),
    
    p('POST /api/scripts/:id/animation-enhance - AI script parsing'),
    code(`Response: {
  parsed: { characters: [], scenes: [] },
  characterCount: number,
  sceneCount: number
}`, 'json'),
    
    p('POST /api/scripts/:id/animation-apply - Apply parsed data'),
    code(`Request: { characters: [], scenes: [] }
Response: { success: true }`, 'json'),
    
    p('POST /api/scripts/:id/animation-lock-storyboard - Lock storyboard'),
    code(`Response: { success: true }`, 'json'),
    
    h3('4.4 Generation Endpoints'),
    
    p('POST /api/generate-prompts - Generate AI prompts for scenes'),
    code(`Request: { scriptId: number }
Response: { scenes: Scene[] }`, 'json'),
    
    p('POST /api/generate-images - Generate images for scenes'),
    code(`Request: { scriptId: number, sceneIds?: number[] }
Response: { jobId: string }`, 'json'),
    
    p('POST /api/generate-sora-video - Generate Sora video clip'),
    code(`Request: {
  sceneId: number,
  duration: 4 | 8 | 12
}
Response: { job: SoraJob }`, 'json'),
    
    p('POST /api/elevenlabs/generate-tts - Generate TTS audio'),
    code(`Request: {
  text: string,
  voiceId: string,
  characterId?: number
}
Response: { audioUrl: string }`, 'json'),
    
    h3('4.5 Workflow Endpoints'),
    
    p('POST /api/workflows/create-project - Full workflow creation'),
    code(`Request: {
  title: string,
  script: string,
  projectType: string,
  style: string,
  referenceImageUrl?: string,
  musicAudioUrl?: string
}
Response: { workflow: Workflow }`, 'json'),
    divider(),

    h2('5. Processing Pipelines'),
    
    h3('5.1 Standard Video Pipeline'),
    numbered('User submits script with title and style'),
    numbered('GPT-4o analyzes script and extracts scenes'),
    numbered('Character continuity profiles generated (GPT-5.1)'),
    numbered('DALL-E prompts generated for each scene'),
    numbered('Images generated via DALL-E 3 API'),
    numbered('Optional: Sora video clips generated from images'),
    numbered('FFmpeg assembles final video with Ken Burns effects'),
    numbered('Video uploaded and project marked complete'),
    
    h3('5.2 Animation Pipeline'),
    numbered('User enters dialogue script'),
    numbered('Optional: AI enhancement parses script structure'),
    numbered('Characters extracted with voice suggestions'),
    numbered('Dialogue grouped into scenes'),
    numbered('User reviews and locks storyboard'),
    numbered('ElevenLabs generates TTS for each line'),
    numbered('Images generated for scene backgrounds'),
    numbered('Wav2Lip applies lip-sync to character images'),
    numbered('Final video assembled with audio sync'),
    
    h3('5.3 Music Video Pipeline'),
    numbered('User uploads audio track'),
    numbered('Whisper API transcribes audio with timestamps'),
    numbered('GPT-4o aligns lyrics to music beats'),
    numbered('Scenes generated based on lyrics timing'),
    numbered('Reference image applied to artist character'),
    numbered('Images generated for each scene'),
    numbered('Video assembled with audio synchronization'),
    divider(),

    h2('6. Real-Time Features'),
    
    h3('6.1 WebSocket Events'),
    bullet('jobAdded - New generation job created'),
    bullet('jobUpdated - Job status changed'),
    bullet('jobProgress - Scene image generated'),
    bullet('jobCompleted - Job finished successfully'),
    bullet('jobFailed - Job encountered error'),
    bullet('workflowCompleted - Full workflow finished'),
    bullet('workflowFailed - Workflow encountered error'),
    
    h3('6.2 Job Queue System'),
    p('The application uses an in-memory job queue with event emission for real-time progress tracking. Jobs include image generation, video generation, TTS generation, and video assembly.'),
    divider(),

    h2('7. Deployment Configuration'),
    
    h3('7.1 Environment Variables'),
    code(`DATABASE_URL - PostgreSQL connection string
OPENAI_API_KEY - OpenAI API key
ELEVENLABS_API_KEY - ElevenLabs API key
REPLICATE_API_TOKEN - Replicate API token
NOTION_ADMIN_KEY - Admin key for Notion endpoints`, 'bash'),
    
    h3('7.2 Build & Deploy'),
    code(`npm run build - Build frontend and backend
npm run dev - Development server
npm run db:push - Push schema changes`, 'bash'),
    divider(),

    h2('8. Security'),
    bullet('Admin endpoints protected by API key authentication'),
    bullet('File uploads validated for type and size'),
    bullet('SQL injection prevented via Drizzle ORM'),
    bullet('Environment secrets managed via Replit'),
  ];
  
  await clearPageContent(client, workspaceIds!.technicalDocsId);
  
  for (let i = 0; i < blocks.length; i += 100) {
    await client.blocks.children.append({
      block_id: workspaceIds!.technicalDocsId,
      children: blocks.slice(i, i + 100) as any
    });
  }
}

export async function updateUserGuide(): Promise<void> {
  if (!workspaceIds) {
    await initializeSceneStitchWorkspace();
    return;
  }
  
  const client = await getNotionClient();
  
  const blocks = [
    h1('SceneStitch User Guide'),
    p(`Last updated: ${new Date().toISOString().split('T')[0]}`),
    quote('Your complete guide to creating stunning AI-generated videos from scripts'),
    divider(),

    h2('Welcome to SceneStitch'),
    p('SceneStitch transforms your written scripts into professional-quality videos using cutting-edge AI technology. Whether you\'re creating a short film, music video, or animated dialogue, this guide will walk you through every feature step by step.'),
    
    callout('No technical experience required! This guide assumes you\'re new to the platform.', '👋'),
    divider(),

    h2('Quick Start Guide'),
    
    h3('Creating Your First Project'),
    numbered('Navigate to the Create page by clicking "Create" in the navigation'),
    numbered('Choose your project type: Standard Video, Music Video, or Animation'),
    numbered('Enter a title for your project (e.g., "My First Video")'),
    numbered('Write or paste your script in the text area'),
    numbered('Select a visual style from the dropdown (Cinematic, Anime, Photorealistic, etc.)'),
    numbered('Click "Create Project" to begin'),
    
    callout('Tip: Start with a short script (3-5 scenes) for your first project to learn the workflow.', '💡'),
    divider(),

    h2('Project Types Explained'),
    
    h3('Standard Video'),
    p('Best for: Short films, narratives, promotional videos, explainer content'),
    bullet('Write a script describing your scenes'),
    bullet('AI analyzes your script and breaks it into visual scenes'),
    bullet('Images are generated for each scene'),
    bullet('Optional: Generate video clips using Sora AI'),
    bullet('Final video is assembled with smooth transitions'),
    
    h3('Music Video'),
    p('Best for: Music videos, lyric videos, audio visualizations'),
    bullet('Upload your audio track (MP3, WAV, M4A supported)'),
    bullet('AI transcribes lyrics and detects timing'),
    bullet('Scenes are generated to match the music'),
    bullet('Upload an artist reference image for consistency'),
    bullet('Video syncs perfectly to your audio'),
    
    h3('Animation Mode'),
    p('Best for: Animated dialogues, character conversations, storytelling'),
    bullet('Write dialogue scripts with character names'),
    bullet('AI detects characters and their lines'),
    bullet('Voice actors assigned via ElevenLabs'),
    bullet('Lip-sync animation applied to characters'),
    bullet('Full animated video with speaking characters'),
    divider(),

    h2('Step-by-Step: Standard Video Creation'),
    
    h3('Step 1: Write Your Script'),
    p('Your script should describe what happens in each scene. Be descriptive about the visuals you want.'),
    
    p('Example script format:'),
    code(`Scene 1: A quiet morning in a small coastal town. The sun rises over the harbor as fishing boats prepare to set sail.

Scene 2: Inside a cozy cafe, an elderly man reads the newspaper while sipping coffee. The walls are decorated with vintage photos.

Scene 3: A young woman walks along the pier, looking out at the endless ocean with a hopeful expression.`, 'plain text'),
    
    callout('The more descriptive you are, the better your AI-generated images will match your vision.', '✨'),
    
    h3('Step 2: Choose Your Style'),
    p('Select a visual style that matches your project:'),
    bullet('Cinematic - Professional film look with dramatic lighting'),
    bullet('Photorealistic - Ultra-realistic photography style'),
    bullet('Anime - Japanese animation aesthetic'),
    bullet('Watercolor - Soft, artistic painted look'),
    bullet('Comic Book - Bold colors and comic-style shading'),
    bullet('Oil Painting - Classical art style'),
    bullet('Noir - Black and white with high contrast'),
    bullet('Cyberpunk - Futuristic neon-lit aesthetics'),
    
    h3('Step 3: Review Generated Scenes'),
    p('After creation, SceneStitch analyzes your script and creates individual scenes:'),
    numbered('Wait for AI analysis to complete (usually 10-30 seconds)'),
    numbered('Review each scene card showing title and description'),
    numbered('Click on any scene to see detailed prompts'),
    numbered('Edit prompts if you want to adjust the visual direction'),
    
    h3('Step 4: Generate Images'),
    p('Once satisfied with your scenes:'),
    numbered('Click "Generate Images" button'),
    numbered('Watch progress as each scene image is created'),
    numbered('Images appear in real-time as they complete'),
    numbered('Click any image to view full size'),
    
    callout('Image generation typically takes 10-20 seconds per scene.', '⏱️'),
    
    h3('Step 5: Edit & Regenerate (Optional)'),
    p('Not happy with an image? You can easily fix it:'),
    numbered('Click on the scene you want to change'),
    numbered('Select "Edit Prompt" to modify the AI instructions'),
    numbered('Use "Get Variations" for AI-suggested alternatives'),
    numbered('Click "Regenerate" to create a new image'),
    numbered('Repeat until satisfied'),
    
    h3('Step 6: Generate Video'),
    p('Transform your images into video:'),
    numbered('Click "Generate Video" button'),
    numbered('Choose video settings (duration per scene)'),
    numbered('Wait for video assembly (1-3 minutes)'),
    numbered('Preview your completed video'),
    numbered('Download or share your video'),
    divider(),

    h2('Step-by-Step: Animation Mode'),
    
    h3('Understanding the Animation Wizard'),
    p('The Animation Wizard guides you through 4 simple steps to create animated dialogue videos:'),
    
    h3('Step 1 of 4: Script Input'),
    p('Enter your dialogue script in this format:'),
    code(`ALICE: Good morning, Bob! How are you today?
BOB: I'm doing great, Alice. Beautiful day isn't it?
ALICE: Indeed! Want to grab some coffee?
BOB: Sounds perfect. Let's go!

SCENE: COFFEE SHOP

ALICE: Two lattes please!
BARISTA: Coming right up!`, 'plain text'),
    
    p('Key formatting tips:'),
    bullet('Character names in CAPS followed by colon'),
    bullet('Use "SCENE:" to indicate scene changes'),
    bullet('Add emotional cues in parentheses: ALICE: (excited) This is amazing!'),
    bullet('Include stage directions in brackets: [Alice waves goodbye]'),
    
    h3('Option A: AI Enhancement'),
    numbered('Click "Enhance Script with AI" button'),
    numbered('Wait for AI to analyze your script (10-20 seconds)'),
    numbered('AI automatically detects all characters'),
    numbered('AI groups dialogue into logical scenes'),
    numbered('AI adds emotional context and visual notes'),
    
    h3('Option B: Manual Setup'),
    numbered('Click "Skip - Set Up Manually" if you prefer control'),
    numbered('Proceed to add characters yourself'),
    numbered('Define scenes and assign dialogue manually'),
    
    callout('AI Enhancement is recommended for most users - it saves time and catches details you might miss.', '🤖'),
    
    h3('Step 2 of 4: Character Review'),
    p('Review and customize your characters:'),
    numbered('See all detected characters listed'),
    numbered('Click "Edit" to modify character details'),
    numbered('Add descriptions (e.g., "Friendly neighbor, middle-aged, warm smile")'),
    numbered('Mark if character is a narrator (off-screen voice)'),
    numbered('Delete any incorrectly detected characters'),
    numbered('Click "Add" to create new characters manually'),
    
    p('Character description tips:'),
    bullet('Describe physical appearance for visual consistency'),
    bullet('Note personality traits for voice selection'),
    bullet('Specify age range if important'),
    
    h3('Step 3 of 4: Scene Organization'),
    p('Review how your dialogue is grouped into scenes:'),
    numbered('Each scene shows its setting and dialogue lines'),
    numbered('Click "Edit" to modify scene title or setting'),
    numbered('Add setting details (e.g., "Cozy coffee shop, morning light")'),
    numbered('Specify time of day if relevant'),
    numbered('Delete or merge scenes as needed'),
    numbered('Click "Add" to create new scenes'),
    
    h3('Step 4 of 4: Storyboard Preview'),
    numbered('Review complete storyboard with all scenes'),
    numbered('Verify character assignments are correct'),
    numbered('Check scene order and transitions'),
    numbered('Make any final adjustments'),
    numbered('Click "Lock Storyboard & Start Generating"'),
    
    callout('Once locked, the storyboard structure is finalized. You can still edit individual elements later.', '🔒'),
    
    h3('After Locking: Voice & Image Generation'),
    p('The Animation Progress panel shows your generation status:'),
    bullet('Voices Assigned - ElevenLabs voices selected for each character'),
    bullet('TTS Generated - Audio created for all dialogue'),
    bullet('Clips Animated - Images and lip-sync applied'),
    bullet('Video Assembled - Final video compiled'),
    divider(),

    h2('Step-by-Step: Music Video Creation'),
    
    h3('Step 1: Upload Your Audio'),
    numbered('Select "Music Video" as project type'),
    numbered('Click "Upload Audio" button'),
    numbered('Select your audio file (MP3, WAV, M4A, up to 50MB)'),
    numbered('Wait for upload to complete'),
    
    h3('Step 2: AI Lyrics Detection'),
    p('SceneStitch uses OpenAI Whisper to analyze your audio:'),
    numbered('Audio is transcribed automatically'),
    numbered('Word-level timestamps are detected'),
    numbered('Lyrics are aligned to the beat'),
    numbered('Review detected lyrics for accuracy'),
    numbered('Edit any misheard words'),
    
    h3('Step 3: Upload Artist Reference'),
    p('For visual consistency, upload an artist reference image:'),
    numbered('Click "Upload Reference Image"'),
    numbered('Select a photo of the artist/performer'),
    numbered('This image ensures the artist looks consistent across scenes'),
    
    callout('The reference image should clearly show the face and be well-lit.', '📸'),
    
    h3('Step 4: Scene Generation'),
    numbered('AI creates scenes based on lyrics and music'),
    numbered('Each scene corresponds to a lyrical section'),
    numbered('Scene timing syncs with audio'),
    numbered('Review and adjust scene descriptions'),
    numbered('Generate images for each scene'),
    
    h3('Step 5: Final Assembly'),
    numbered('Click "Generate Video"'),
    numbered('Video is assembled with your audio'),
    numbered('Transitions sync to the beat'),
    numbered('Preview the complete music video'),
    numbered('Download your finished video'),
    divider(),

    h2('Advanced Features'),
    
    h3('Character Continuity System'),
    p('SceneStitch uses advanced AI to maintain visual consistency:'),
    bullet('Characters look the same across all scenes'),
    bullet('Reference images are analyzed for key features'),
    bullet('AI extracts "character DNA" for prompt generation'),
    bullet('Works automatically - no configuration needed'),
    
    h3('Sora Video Generation'),
    p('Transform still images into cinematic video clips:'),
    numbered('Navigate to a completed scene with an image'),
    numbered('Click "Generate Video Clip"'),
    numbered('Choose duration: 4, 8, or 12 seconds'),
    numbered('Wait for Sora AI to generate video'),
    numbered('Preview and download the clip'),
    
    callout('Sora generation may take 1-3 minutes per clip. The AI creates smooth, natural motion from your still image.', '🎥'),
    
    h3('Prompt Editing & Variations'),
    p('Customize AI image generation:'),
    numbered('Click on any scene to view its prompt'),
    numbered('Edit the DALL-E prompt directly'),
    numbered('Click "Get AI Variations" for alternative prompts'),
    numbered('Select a variation or write your own'),
    numbered('Regenerate the image with new prompt'),
    
    h3('Multi-Scene Organization'),
    p('For complex projects with many scenes:'),
    bullet('Drag to reorder scenes'),
    bullet('Use scene groups for logical organization'),
    bullet('Add transition notes between scenes'),
    bullet('Export scenes individually or as batch'),
    divider(),

    h2('Voice Generation with ElevenLabs'),
    
    h3('Selecting Voices'),
    numbered('Navigate to the Voices tab in Animation Mode'),
    numbered('View available voice options'),
    numbered('Preview voices by clicking the play button'),
    numbered('Assign voices to each character'),
    numbered('Click "Generate All TTS" to create audio'),
    
    h3('Voice Characteristics'),
    p('Consider these factors when choosing voices:'),
    bullet('Age - Match voice age to character description'),
    bullet('Gender - Select appropriate voice gender'),
    bullet('Tone - Friendly, serious, playful, etc.'),
    bullet('Accent - Choose regional accents if relevant'),
    
    callout('You can regenerate individual lines if the voice doesn\'t sound right.', '🎤'),
    divider(),

    h2('Project Management'),
    
    h3('Viewing Your Projects'),
    numbered('Go to the Projects page'),
    numbered('See all your projects in a grid view'),
    numbered('Filter by status: In Progress, Completed, Archived'),
    numbered('Search by project title'),
    numbered('Sort by date created or modified'),
    
    h3('Continuing an Incomplete Project'),
    numbered('Find your project in the list'),
    numbered('Click to open the project'),
    numbered('Resume from where you left off'),
    numbered('All progress is automatically saved'),
    
    h3('Archiving & Deleting'),
    bullet('Archive: Hides project but keeps it recoverable'),
    bullet('Delete: Permanently removes project and all assets'),
    
    callout('Deleted projects cannot be recovered. Archive first if unsure.', '⚠️'),
    divider(),

    h2('Exporting Your Videos'),
    
    h3('Download Options'),
    bullet('Full Video - Complete assembled video'),
    bullet('Individual Scenes - Download specific scenes'),
    bullet('Images Only - All generated images'),
    bullet('Audio Only - Extracted audio track'),
    
    h3('Video Quality'),
    p('SceneStitch exports in high quality:'),
    bullet('Resolution: 1920x1080 (1080p)'),
    bullet('Format: MP4 (H.264)'),
    bullet('Frame rate: 24fps (cinematic)'),
    divider(),

    h2('Troubleshooting'),
    
    h3('Images Not Generating'),
    bullet('Check your internet connection'),
    bullet('Verify the scene has a valid prompt'),
    bullet('Try regenerating the individual scene'),
    bullet('If persistent, refresh the page and try again'),
    
    h3('Video Assembly Failing'),
    bullet('Ensure all scenes have generated images'),
    bullet('Check that audio file is valid (for music videos)'),
    bullet('Try with fewer scenes to isolate the issue'),
    
    h3('Voice Generation Issues'),
    bullet('Verify ElevenLabs connection in settings'),
    bullet('Check that dialogue text is not empty'),
    bullet('Try a different voice if one fails'),
    
    h3('Getting Help'),
    p('If you encounter issues not covered here:'),
    numbered('Check the error message displayed'),
    numbered('Try refreshing the page'),
    numbered('Clear browser cache if problems persist'),
    numbered('Contact support with project details'),
    divider(),

    h2('Best Practices'),
    
    h3('Writing Effective Scripts'),
    bullet('Be specific about visual details'),
    bullet('Use sensory language (colors, textures, lighting)'),
    bullet('Keep scenes focused on single moments'),
    bullet('Include emotional context for characters'),
    
    h3('Optimizing Image Generation'),
    bullet('Review and edit AI prompts before generating'),
    bullet('Use consistent style descriptors'),
    bullet('Include lighting and mood keywords'),
    bullet('Regenerate until satisfied - it\'s free to iterate'),
    
    h3('Animation Tips'),
    bullet('Keep dialogue concise for better pacing'),
    bullet('Use varied emotions to keep interest'),
    bullet('Add scene descriptions for context'),
    bullet('Test different voices before committing'),
    divider(),

    h2('Keyboard Shortcuts'),
    code(`Ctrl/Cmd + S - Save current work
Ctrl/Cmd + Z - Undo last action
Ctrl/Cmd + Enter - Submit/Generate
Esc - Close modal/dialog
Arrow keys - Navigate between scenes`, 'plain text'),
    divider(),

    h2('Frequently Asked Questions'),
    
    p('Q: How long does video generation take?'),
    p('A: Typically 1-5 minutes depending on the number of scenes and video length.'),
    
    p('Q: Can I use my own images?'),
    p('A: Currently, SceneStitch generates images using AI. Reference images can be uploaded to guide character appearance.'),
    
    p('Q: What audio formats are supported?'),
    p('A: MP3, WAV, M4A, and most common audio formats up to 50MB.'),
    
    p('Q: How many scenes can I have?'),
    p('A: There\'s no hard limit, but 20-30 scenes is optimal for smooth playback.'),
    
    p('Q: Can I collaborate with others?'),
    p('A: Currently, projects are individual. Sharing and collaboration features are planned.'),
    divider(),

    callout('Thank you for using SceneStitch! We\'re constantly improving based on user feedback.', '🎬'),
  ];
  
  await clearPageContent(client, workspaceIds!.userGuideId);
  
  for (let i = 0; i < blocks.length; i += 100) {
    await client.blocks.children.append({
      block_id: workspaceIds!.userGuideId,
      children: blocks.slice(i, i + 100) as any
    });
  }
}

export async function createReleaseNote(version: string, changes: string[]): Promise<string> {
  if (!workspaceIds) {
    await initializeSceneStitchWorkspace();
  }
  
  const client = await getNotionClient();
  const dateStr = new Date().toISOString().split('T')[0];
  
  const changeBlocks = changes.map(change => bullet(change));
  
  const newReleasePage = await client.pages.create({
    parent: { page_id: workspaceIds!.releaseNotesId },
    icon: { type: 'emoji', emoji: '🚀' },
    properties: {
      title: { title: [{ text: { content: `v${version} - ${dateStr}` } }] }
    },
    children: [
      h1(`Release v${version}`),
      p(`Released on ${dateStr}`),
      divider(),
      h2('What\'s New'),
      ...changeBlocks,
      divider(),
      callout('Thank you for using SceneStitch! Your feedback helps us improve.', '💜'),
    ] as any
  });
  
  return newReleasePage.id;
}

async function clearPageContent(client: any, pageId: string): Promise<void> {
  try {
    const existingBlocks = await client.blocks.children.list({ block_id: pageId });
    for (const block of existingBlocks.results) {
      if (block.archived) continue;
      try {
        await client.blocks.delete({ block_id: block.id });
      } catch (e) {
      }
    }
  } catch (e) {
  }
}

export async function onPublish(version: string, changes: string[]): Promise<void> {
  await updateTechnicalDocs();
  await updateUserGuide();
  await createReleaseNote(version, changes);
}
