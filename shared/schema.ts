import { pgTable, text, serial, integer, boolean, jsonb, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Define project types enum
export const PROJECT_TYPES = [
  { id: "video", name: "Explainer Video", description: "Create storyboards for explainer and faceless videos" },
  { id: "blog", name: "Blog Post", description: "Generate images for blog posts including thumbnails, hero images, and section graphics" },
  { id: "presentation", name: "PowerPoint Presentation", description: "Create slides and visuals for professional presentations" },
  { id: "audio-driven", name: "Audio-Driven Project", description: "Create project from existing audio file with auto-populated script content" },
  { id: "sora", name: "Sora Video", description: "Generate detailed 10-15 second text-to-video prompts for OpenAI Sora with dialogue, camera movements, and visual details" },
  { id: "music-video", name: "Music Video", description: "Generate a high-quality music video from song lyrics with consistent artist appearance across all scenes" },
  { id: "animation", name: "Animation Mode", description: "Create animated talking-head videos with AI-generated dialogue, character voices, and lip-sync animation" }
] as const;

// Music video specific styles
export const MUSIC_VIDEO_STYLES = [
  // ANIMATED STYLES (Recommended for video generation - avoids photorealistic people)
  { value: "anime-music-video", label: "🎨 Anime Music Video", description: "Animated - Japanese anime style with dynamic action and expressive characters" },
  { value: "pixar-3d", label: "🎨 Pixar 3D Animation", description: "Animated - Stylized 3D cartoon characters like Disney/Pixar films" },
  { value: "studio-ghibli", label: "🎨 Studio Ghibli", description: "Animated - Hand-drawn style with soft watercolors and whimsical characters" },
  { value: "lofi-aesthetic", label: "🎨 Lo-Fi Aesthetic", description: "Animated - Cozy anime-influenced visuals, pastel colors, relaxed mood" },
  { value: "synthwave", label: "🎨 Synthwave/Retrowave", description: "Animated - 80s neon grids, chrome elements, retro-futuristic style" },
  { value: "cel-animation", label: "🎨 Classic Cel Animation", description: "Animated - Traditional 2D animation with bold outlines and flat colors" },
  { value: "motion-graphics", label: "🎨 Motion Graphics", description: "Animated - Abstract geometric shapes, particles, and dynamic typography" },
  { value: "illustrated-music", label: "🎨 Illustrated Style", description: "Animated - Artistic brushstrokes, painterly textures, hand-drawn quality" },
  { value: "paper-cutout", label: "🎨 Paper Cutout", description: "Animated - Layered paper textures, stop-motion crafty aesthetic" },
  { value: "neon-pop", label: "🎨 Neon Pop Art", description: "Animated - Bold fluorescent colors, high contrast, graphic design style" },
  { value: "rotoscope", label: "🎨 Rotoscope Animation", description: "Animated - Traced movement style with artistic color treatment" },
  { value: "stylized-3d", label: "🎨 Stylized 3D Render", description: "Animated - Non-realistic 3D with artistic lighting and exaggerated features" },
  
  // STYLIZED REALISTIC (May include stylized people - use with caution for video)
  { value: "neon-concert", label: "Neon Concert", description: "Stylized - Vibrant neon lights, concert stage energy" },
  { value: "moody-indie", label: "Moody Indie", description: "Stylized - Soft lighting, intimate atmosphere, artistic shots" },
  { value: "cinematic-performance", label: "Cinematic Performance", description: "Stylized - Film-quality visuals, dramatic lighting" },
  { value: "retro-mtv", label: "Retro MTV", description: "Stylized - 80s/90s music video aesthetic with vintage effects" },
  { value: "abstract-visualizer", label: "Abstract Visualizer", description: "Abstract - Artistic abstract visuals synced to mood" },
  { value: "urban-streetwear", label: "Urban Streetwear", description: "Stylized - Street style, urban environments, fashion-forward" },
  { value: "dreamy-ethereal", label: "Dreamy Ethereal", description: "Stylized - Soft focus, pastel colors, dreamlike atmosphere" },
  { value: "high-energy-edm", label: "High Energy EDM", description: "Stylized - Dynamic visuals, light shows, festival vibes" },
  { value: "acoustic-intimate", label: "Acoustic Intimate", description: "Stylized - Warm lighting, close-ups, emotional connection" },
  { value: "psychedelic-trip", label: "Psychedelic Trip", description: "Abstract - Colorful, trippy visuals, surreal imagery" },
  { value: "black-and-white-classic", label: "Black & White Classic", description: "Stylized - Timeless monochrome, classic film style" },
  { value: "glitch-digital", label: "Glitch Digital", description: "Stylized - Digital artifacts, glitch effects, futuristic" },
  { value: "nature-landscape", label: "Nature Landscape", description: "Scenic - Beautiful outdoor settings, natural lighting" },
  { value: "studio-performance", label: "Studio Performance", description: "Stylized - Professional studio setting, clean production" }
] as const;

export type MusicVideoStyle = typeof MUSIC_VIDEO_STYLES[number]['value'];

// Animation Mode specific styles (optimized for talking head / lip-sync animation)
export const ANIMATION_STYLES = [
  // CARTOON/ANIMATED STYLES (Recommended - works best with Wav2Lip)
  { value: "south-park", label: "🎭 South Park Style", description: "Simple cutout animation with bold colors, ideal for comedy" },
  { value: "pixar-talking", label: "🎭 Pixar Character", description: "3D animated character with expressive face, great for lip-sync" },
  { value: "anime-dialogue", label: "🎭 Anime Dialogue", description: "Japanese anime style with expressive eyes and clear facial features" },
  { value: "cartoon-podcast", label: "🎭 Cartoon Podcast", description: "Clean animated character, perfect for explainer content" },
  { value: "rick-morty", label: "🎭 Adult Animation", description: "Adult swim style animation, good for comedy sketches" },
  { value: "simpsons-style", label: "🎭 Classic Cartoon", description: "Classic American cartoon style with yellow tones" },
  { value: "clay-animation", label: "🎭 Claymation", description: "Stop-motion clay figure style, quirky and charming" },
  { value: "flat-vector", label: "🎭 Flat Vector Art", description: "Modern minimalist vector characters, clean lines" },
  { value: "comic-book", label: "🎭 Comic Book", description: "Bold ink lines, dramatic expressions, panel-style framing" },
  { value: "chibi-cute", label: "🎭 Chibi Cute", description: "Adorable oversized head characters, kawaii style" },
  
  // REALISTIC STYLES (Use with caution - may have lip-sync quality issues)
  { value: "hyperreal-portrait", label: "Photorealistic Portrait", description: "Realistic human face, challenging for lip-sync" },
  { value: "oil-painting", label: "Oil Painting Portrait", description: "Classical oil painting style, artistic expression" },
  { value: "digital-illustration", label: "Digital Illustration", description: "Modern digital art style with clear facial features" },
] as const;

export type AnimationStyle = typeof ANIMATION_STYLES[number]['value'];

export type ProjectType = typeof PROJECT_TYPES[number]['id'];

// Character DNA schema for consistent character generation
export const characterDNASchema = z.object({
  id: z.string(), // Unique identifier for the character
  name: z.string(), // Character name as identified in script
  aliases: z.array(z.string()).optional(), // Alternative names/references
  referenceImageUrl: z.string().optional(), // Uploaded reference image URL for visual consistency
  visualDNA: z.object({
    age: z.string().optional(), // e.g., "32-year-old"
    gender: z.string().optional(),
    ethnicity: z.string().optional(),
    bodyType: z.string().optional(), // e.g., "athletic build, head-to-body ratio 1:7"
    face: z.object({
      shape: z.string().optional(), // e.g., "oval-shaped with high cheekbones"
      eyes: z.string().optional(), // e.g., "almond-shaped, sapphire blue (#0F52BA)"
      nose: z.string().optional(),
      mouth: z.string().optional(),
      distinctiveFeatures: z.array(z.string()).optional(), // e.g., ["light freckles across nose bridge"]
    }).optional(),
    hair: z.object({
      style: z.string().optional(), // e.g., "shoulder-length, natural waves"
      color: z.string().optional(), // e.g., "auburn"
      length: z.string().optional(),
    }).optional(),
    skin: z.string().optional(), // e.g., "fair with light freckles"
    clothing: z.object({
      typical: z.string().optional(), // Default outfit description
      accessories: z.array(z.string()).optional(),
    }).optional(),
  }),
  personality: z.string().optional(), // Brief personality for expression consistency
  role: z.string().optional(), // e.g., "protagonist", "mentor", "antagonist"
});

export type CharacterDNA = z.infer<typeof characterDNASchema>;

// Script schema
export const scripts = pgTable("scripts", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  title: text("title").notNull().default("Untitled Project"),
  description: text("description"),
  projectType: text("project_type").default("video").notNull(), // New field for project type
  style: text("style"),
  customStylePrompt: text("custom_style_prompt"), // New field for custom style instructions
  maintainContinuity: boolean("maintain_continuity").default(true),
  referenceImageUrl: text("reference_image_url"),
  status: text("status").default("draft"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  userId: integer("user_id").references(() => users.id),
  archived: boolean("archived").default(false).notNull(),
  // Project-specific model settings
  image_size: text("image_size"),
  image_quality: text("image_quality"),
  image_style: text("image_style"),
  image_model: text("image_model"),
  prompt_model: text("prompt_model"),
  modelSettings: jsonb("model_settings"), // For storing complete model settings as JSON
  audioDuration: integer("audio_duration"), // Audio duration in seconds
  audioFilePath: text("audio_file_path"), // Path to uploaded audio file
  audioTTSId: integer("audio_tts_id").references(() => audioTTS.id), // Reference to TTS audio file
  thumbnailUrl: text("thumbnail_url"), // Generated YouTube thumbnail URL
  characters: jsonb("characters"), // Array of CharacterDNA objects for consistent character generation
  // Music video specific fields
  musicAudioFilePath: text("music_audio_file_path"), // Path to uploaded music audio file
  musicAudioDuration: numeric("music_audio_duration"), // Music audio duration in seconds (decimal for precision)
  musicAudioAnalysisStatus: text("music_audio_analysis_status"), // pending, analyzing, completed, failed
  lyricsAlignment: jsonb("lyrics_alignment"), // Word-level timestamps from Whisper analysis
  musicSceneTimings: jsonb("music_scene_timings"), // Array of SceneTiming objects from audio analysis
  // Animation Mode specific fields
  animationSettings: jsonb("animation_settings"), // AnimationSettings object
  animationStatus: text("animation_status"), // pending, generating_dialogue, generating_audio, lip_syncing, assembling, completed, failed
  finalAnimatedVideoUrl: text("final_animated_video_url"), // Path to final stitched video
  finalAnimatedVideoStorageKey: text("final_animated_video_storage_key"), // Object storage key
  characterVoices: jsonb("character_voices"), // Map of character name to ElevenLabs voice assignment { voiceId, voiceName }
  hiddenFromResume: boolean("hidden_from_resume").default(false).notNull(), // Marks project as dismissed from resume list
});

// Workflow persistence table for async processing
export const workflows = pgTable("workflows", {
  id: text("id").primaryKey(), // workflow_scriptId_timestamp format
  scriptId: integer("script_id").references(() => scripts.id).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  style: text("style").notNull(),
  customStylePrompt: text("custom_style_prompt"),
  maintainContinuity: boolean("maintain_continuity").default(true),
  referenceImageUrl: text("reference_image_url"),
  voice: text("voice").default("alloy"),
  audioModel: text("audio_model").default("gpt-4o-mini-tts"),
  currentStep: integer("current_step").default(0),
  status: text("status").default("pending"), // pending, processing, completed, failed
  steps: jsonb("steps").notNull(), // Array of workflow steps with status/progress
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  error: text("error"), // Error message if workflow failed
  // Music video specific fields
  projectType: text("project_type").default("video"), // video or music-video
  musicAudioFilePath: text("music_audio_file_path"), // Path to uploaded music audio file
});

// Define relations between tables (consolidated)
export const usersRelations = relations(users, ({ many }) => ({
  scripts: many(scripts)
}));

export const workflowsRelations = relations(workflows, ({ one }) => ({
  script: one(scripts, {
    fields: [workflows.scriptId],
    references: [scripts.id]
  })
}));

export const insertScriptSchema = createInsertSchema(scripts).pick({
  content: true,
  title: true,
  description: true,
  projectType: true,
  style: true,
  customStylePrompt: true,
  maintainContinuity: true,
  referenceImageUrl: true,
  status: true,
  userId: true,
  archived: true,
  image_size: true,
  image_quality: true,
  image_style: true,
  image_model: true,
  prompt_model: true,
  modelSettings: true,
  audioDuration: true,
  audioFilePath: true,
  audioTTSId: true,
  thumbnailUrl: true,
  characters: true,
  musicAudioFilePath: true,
  musicAudioDuration: true,
  musicAudioAnalysisStatus: true,
  lyricsAlignment: true,
  musicSceneTimings: true,
  // Animation Mode fields
  animationSettings: true,
  animationStatus: true,
  finalAnimatedVideoUrl: true,
  finalAnimatedVideoStorageKey: true,
});

export type InsertScript = z.infer<typeof insertScriptSchema>;
export type Script = typeof scripts.$inferSelect;

// Workflow schema types
export const insertWorkflowSchema = createInsertSchema(workflows).pick({
  id: true,
  scriptId: true,
  title: true,
  content: true,
  style: true,
  customStylePrompt: true,
  maintainContinuity: true,
  referenceImageUrl: true,
  voice: true,
  audioModel: true,
  currentStep: true,
  status: true,
  steps: true,
  error: true,
  projectType: true,
  musicAudioFilePath: true,
});

export type InsertWorkflow = z.infer<typeof insertWorkflowSchema>;
export type Workflow = typeof workflows.$inferSelect;

// Model settings schema
export const modelSettingsSchema = z.object({
  dalle_prompt_generation: z.string().optional(),  // Will be renamed to image_prompt_generation in future
  sora_prompt_generation: z.string().optional(),
  scene_duration_estimation: z.string().optional(),
  image_generation: z.string().optional(),
  image_size: z.enum(["1024x1024", "1024x1536", "1536x1024", "auto"]).optional(),
  image_quality: z.enum(["standard", "hd", "low", "medium", "high", "auto"]).optional(),
  image_style: z.enum(["vivid", "natural"]).optional(),
});

export type ModelSettings = z.infer<typeof modelSettingsSchema>;

// Scene schema
export const scenes = pgTable("scenes", {
  id: serial("id").primaryKey(),
  scriptId: integer("script_id").references(() => scripts.id),
  sceneNumber: integer("scene_number").notNull(),
  title: text("title"),
  scriptExcerpt: text("script_excerpt").notNull(),
  dallePrompt: text("dalle_prompt").notNull(), // Consider renaming to "image_prompt" in future migration
  soraPrompt: text("sora_prompt"),
  imageUrl: text("image_url"),
  videoUrl: text("video_url"), // Sora-generated video URL
  estimatedDuration: integer("estimated_duration"),
  metadata: jsonb("metadata"),
  isPinned: boolean("is_pinned").default(false),
  overlayText: text("overlay_text"),
  exactStartTime: integer("exact_start_time"),
  exactEndTime: integer("exact_end_time"),
  soraClipLength: integer("sora_clip_length"), // Sora clip duration: 4, 8, or 12 seconds only
  charactersInScene: text("characters_in_scene").array(), // Array of character IDs present in this scene
  // Music video specific timing fields
  lyricStartTime: numeric("lyric_start_time"), // Precise timing from audio analysis
  lyricEndTime: numeric("lyric_end_time"), // Precise timing from audio analysis
  // Storage integrity fields for crash recovery
  imageStorageKey: text("image_storage_key"), // Object storage key for image
  imageChecksum: text("image_checksum"), // SHA256 hash for validation
  imageByteLength: integer("image_byte_length"), // Size in bytes for validation
  imageVerified: boolean("image_verified").default(false), // True if upload was verified
  videoStorageKey: text("video_storage_key"), // Object storage key for video
  videoChecksum: text("video_checksum"), // SHA256 hash for video validation
  videoByteLength: integer("video_byte_length"), // Video size in bytes
  videoVerified: boolean("video_verified").default(false), // True if video upload was verified
  // Animation Mode dialogue fields
  dialogueSpeaker: text("dialogue_speaker"), // Character name for this dialogue line
  dialogueLine: text("dialogue_line"), // The actual dialogue text
  dialogueAudioUrl: text("dialogue_audio_url"), // URL to ElevenLabs generated audio
  animatedClipUrl: text("animated_clip_url"), // URL to Wav2Lip generated video clip
  isNarrator: boolean("is_narrator").default(false), // True if this is narrator (no image gen)
});

export const insertSceneSchema = createInsertSchema(scenes).pick({
  scriptId: true,
  sceneNumber: true,
  title: true,
  scriptExcerpt: true,
  dallePrompt: true,
  soraPrompt: true,
  imageUrl: true,
  videoUrl: true,
  estimatedDuration: true,
  metadata: true,
  isPinned: true,
  overlayText: true,
  exactStartTime: true,
  exactEndTime: true,
  soraClipLength: true,
  charactersInScene: true,
  lyricStartTime: true,
  lyricEndTime: true,
  imageStorageKey: true,
  imageChecksum: true,
  imageByteLength: true,
  imageVerified: true,
  videoStorageKey: true,
  videoChecksum: true,
  videoByteLength: true,
  videoVerified: true,
  dialogueSpeaker: true,
  dialogueLine: true,
  dialogueAudioUrl: true,
  animatedClipUrl: true,
  isNarrator: true,
});

// Update existing scripts relations to include workflows
export const scriptsRelations = relations(scripts, ({ one, many }) => ({
  user: one(users, {
    fields: [scripts.userId],
    references: [users.id]
  }),
  scenes: many(scenes),
  workflows: many(workflows),
  audioTTS: one(audioTTS, {
    fields: [scripts.audioTTSId],
    references: [audioTTS.id]
  })
}));

// Define relations for scenes
export const scenesRelations = relations(scenes, ({ one }) => ({
  script: one(scripts, {
    fields: [scenes.scriptId],
    references: [scripts.id]
  })
}));

export type InsertScene = z.infer<typeof insertSceneSchema>;
export type Scene = typeof scenes.$inferSelect;

// Additional types for frontend-backend communication
export const generatePromptsSchema = z.object({
  script: z.string().min(1, "Script content is required"),
  style: z.string(),
  customStylePrompt: z.string().optional(),
  maintainContinuity: z.boolean().default(true),
  referenceImageUrl: z.string().optional(),
  title: z.string().default("Untitled Project"),
  description: z.string().optional(),
  scriptId: z.number().optional(), // Adding scriptId for existing script regeneration
  projectType: z.string().default("video"), // Default to video content type if not specified
});

export type GeneratePromptsRequest = z.infer<typeof generatePromptsSchema>;

export const generateImagesSchema = z.object({
  scenes: z.array(
    z.object({
      id: z.number().optional(),
      scriptId: z.number(),
      sceneNumber: z.number(),
      dallePrompt: z.string(),
      title: z.string().optional(),
      scriptExcerpt: z.string(),
      imageUrl: z.string().nullable().optional(), // For regeneration
    })
  ),
  style: z.string(),
  customStylePrompt: z.string().optional(),
  maintainContinuity: z.boolean().default(true),
  referenceImageUrl: z.string().optional(),
  isRegenerating: z.boolean().optional().default(false),
});

export type GenerateImagesRequest = z.infer<typeof generateImagesSchema>;

export const generateSoraPromptsSchema = z.object({
  scriptId: z.number(),
  style: z.string(),
  customStylePrompt: z.string().optional(),
});

export type GenerateSoraPromptsRequest = z.infer<typeof generateSoraPromptsSchema>;

// Project operations schemas
export const saveProjectSchema = z.object({
  id: z.number().nullable().optional(), // Allow null for creating new projects via Save As
  title: z.string().min(1, "Project title is required"),
  description: z.string().nullable().optional(),
  content: z.string().default(""), // Allow empty content for new projects
  style: z.string(),
  customStylePrompt: z.string().nullable().optional(),
  maintainContinuity: z.boolean().default(true),
  referenceImageUrl: z.string().nullable().optional(),
  status: z.string().default("draft"),
  projectType: z.string().default("video"), // Default to video content type
  animationSettings: z.object({
    style: z.string().optional(),
    comedyLevel: z.number().optional(),
    absurdityLevel: z.number().optional(),
  }).nullable().optional(), // Animation mode settings
});

export type SaveProjectRequest = z.infer<typeof saveProjectSchema>;

export const projectListResponseSchema = z.array(
  z.object({
    id: z.number(),
    title: z.string(),
    description: z.string().optional(),
    style: z.string().optional(),
    status: z.string(),
    sceneCount: z.number(),
    updatedAt: z.string(),
    createdAt: z.string(),
  })
);

export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;

// Project-specific model settings update schema
export const projectModelSettingsSchema = z.object({
  scriptId: z.number(),
  modelSettings: modelSettingsSchema
});

export type ProjectModelSettingsRequest = z.infer<typeof projectModelSettingsSchema>;

// Global configuration schema for admin settings
export const globalConfig = pgTable("global_config", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // e.g., "model_config"
  value: jsonb("value").notNull(), // JSON configuration data
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGlobalConfigSchema = createInsertSchema(globalConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGlobalConfig = z.infer<typeof insertGlobalConfigSchema>;
export type GlobalConfig = typeof globalConfig.$inferSelect;

// Audio TTS schema
export const audioTTS = pgTable("audio_tts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(), // The script text
  voice: text("voice").notNull().default("coral"), // OpenAI voice
  model: text("model").notNull().default("gpt-4o-mini-tts"), // OpenAI TTS model
  speed: text("speed").notNull().default("1.0"), // Speech speed (0.25 to 4.0)
  audioUrl: text("audio_url"), // Path to generated audio file
  duration: integer("duration"), // Duration in seconds
  fileSize: integer("file_size"), // File size in bytes
  status: text("status").default("pending"), // pending, generating, completed, failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAudioTTSSchema = createInsertSchema(audioTTS).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Update schema allows partial updates to all fields except id and timestamps
export const updateAudioTTSSchema = insertAudioTTSSchema.partial();

export type InsertAudioTTS = z.infer<typeof insertAudioTTSSchema>;
export type UpdateAudioTTS = z.infer<typeof updateAudioTTSSchema>;
export type AudioTTS = typeof audioTTS.$inferSelect;

// TTS generation request schema
export const generateTTSSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required").max(4096, "Content must be 4096 characters or less"),
  voice: z.enum(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"]).default("coral"),
  model: z.enum(["gpt-4o-mini-tts", "tts-1", "tts-1-hd"]).default("gpt-4o-mini-tts"),
});

export type GenerateTTSRequest = z.infer<typeof generateTTSSchema>;

// ElevenLabs voice generation schema
export const elevenLabsGenerateSpeechSchema = z.object({
  text: z.string().min(1, "Text is required").max(5000, "Text must be 5000 characters or less"),
  voiceId: z.string().min(1, "Voice ID is required"),
  sceneId: z.number().int().positive().optional(),
  settings: z.object({
    stability: z.number().min(0).max(1).optional(),
    similarityBoost: z.number().min(0).max(1).optional(),
    style: z.number().min(0).max(1).optional(),
    speakerBoost: z.boolean().optional(),
  }).optional(),
});

export type ElevenLabsGenerateSpeechRequest = z.infer<typeof elevenLabsGenerateSpeechSchema>;

// Character voice assignment schema
export const assignVoiceSchema = z.object({
  characterName: z.string().min(1, "Character name is required"),
  voiceId: z.string().min(1, "Voice ID is required"),
  voiceName: z.string().min(1, "Voice name is required"),
});

export type AssignVoiceRequest = z.infer<typeof assignVoiceSchema>;

// Video Jobs schema for video generation tracking
export const videoJobs = pgTable("video_jobs", {
  id: text("id").primaryKey(), // UUID for job tracking
  projectId: integer("project_id").notNull().references(() => scripts.id),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  progress: integer("progress").notNull().default(0), // 0-100 percentage
  videoUrl: text("video_url"), // Path to generated video file
  duration: integer("duration"), // Video duration in seconds
  fileSize: integer("file_size"), // File size in bytes
  settings: jsonb("settings"), // Video generation settings (resolution, fps, etc.)
  error: text("error"), // Error message if failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertVideoJobSchema = createInsertSchema(videoJobs).omit({
  createdAt: true,
  completedAt: true,
});

export const updateVideoJobSchema = insertVideoJobSchema.partial();

export type InsertVideoJob = z.infer<typeof insertVideoJobSchema>;
export type UpdateVideoJob = z.infer<typeof updateVideoJobSchema>;
export type VideoJob = typeof videoJobs.$inferSelect;

// Video generation request schema
export const generateVideoSchema = z.object({
  projectId: z.number().min(1, "Project ID is required"),
  settings: z.object({
    resolution: z.enum(["720p", "1080p", "1440p"]).default("1080p"),
    fps: z.number().min(24).max(60).default(30),
    quality: z.enum(["low", "medium", "high"]).default("high"),
    kenBurnsIntensity: z.enum(["subtle", "moderate", "dramatic"]).default("moderate"),
  }).optional()
});

export type GenerateVideoRequest = z.infer<typeof generateVideoSchema>;

// Persona and brand kits (reusable creator presets)
export const personaKits = pgTable("persona_kits", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  defaultVoice: text("default_voice"),
  defaultStyle: text("default_style"),
  tone: text("tone"),
  humorLevel: integer("humor_level").default(50),
  hookStyle: text("hook_style"),
  promptDirectives: text("prompt_directives"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const brandKits = pgTable("brand_kits", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  primaryColor: text("primary_color"),
  secondaryColor: text("secondary_color"),
  accentColor: text("accent_color"),
  fontFamily: text("font_family"),
  logoUrl: text("logo_url"),
  introText: text("intro_text"),
  outroText: text("outro_text"),
  ctaText: text("cta_text"),
  captionPreset: text("caption_preset"),
  promptDirectives: text("prompt_directives"),
  watermarkEnabled: boolean("watermark_enabled").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPersonaKitSchema = createInsertSchema(personaKits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updatePersonaKitSchema = insertPersonaKitSchema.partial();

export type InsertPersonaKit = z.infer<typeof insertPersonaKitSchema>;
export type UpdatePersonaKit = z.infer<typeof updatePersonaKitSchema>;
export type PersonaKit = typeof personaKits.$inferSelect;

export const insertBrandKitSchema = createInsertSchema(brandKits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateBrandKitSchema = insertBrandKitSchema.partial();

export type InsertBrandKit = z.infer<typeof insertBrandKitSchema>;
export type UpdateBrandKit = z.infer<typeof updateBrandKitSchema>;
export type BrandKit = typeof brandKits.$inferSelect;

export const applyProjectKitsSchema = z.object({
  projectId: z.number().int().positive(),
  personaKitId: z.number().int().positive().nullable().optional(),
  brandKitId: z.number().int().positive().nullable().optional(),
});

export type ApplyProjectKitsRequest = z.infer<typeof applyProjectKitsSchema>;

// Provider-agnostic configuration schemas (Rebuild v1)
export const imageProviderSchema = z.enum(["openai", "nanabanana-pro"]);
export const ttsProviderSchema = z.enum(["openai", "elevenlabs"]);
export const imageToVideoProviderSchema = z.enum(["sora-2", "veo-3.1"]);

export const projectProviderConfigSchema = z.object({
  image: imageProviderSchema.default("openai"),
  tts: ttsProviderSchema.default("openai"),
  imageToVideo: imageToVideoProviderSchema.default("sora-2"),
  enableFallbacks: z.boolean().default(true),
});

export const updateProjectProviderConfigSchema = z.object({
  projectId: z.number().int().positive(),
  providers: projectProviderConfigSchema,
});

export type ProjectProviderConfig = z.infer<typeof projectProviderConfigSchema>;
export type UpdateProjectProviderConfigRequest = z.infer<typeof updateProjectProviderConfigSchema>;

export const createRenderSchema = z.object({
  projectId: z.number().int().positive(),
  format: z.enum(["landscape-16-9", "portrait-9-16"]).default("landscape-16-9"),
  contentType: z.enum(["explainer", "tiktok"]).default("explainer"),
  includeCaptions: z.boolean().default(true),
  settings: z.object({
    resolution: z.enum(["720p", "1080p", "1440p"]).default("1080p"),
    fps: z.number().min(24).max(60).default(30),
    quality: z.enum(["low", "medium", "high"]).default("high"),
  }).optional(),
});

export type CreateRenderRequest = z.infer<typeof createRenderSchema>;

export const createShortRendersSchema = z.object({
  projectId: z.number().int().positive(),
  maxClips: z.number().int().min(1).max(10).default(3),
  targetDurationSec: z.number().int().min(10).max(90).default(30),
});

export type CreateShortRendersRequest = z.infer<typeof createShortRendersSchema>;

// Content intelligence schemas (hooks, comedy timing, repurpose)
export const generateHookVariantsSchema = z.object({
  script: z.string().min(20),
  style: z.enum(["explainer", "tiktok", "comedy"]).default("explainer"),
  count: z.number().int().min(1).max(5).default(3),
});

export const generateComedyTimingSchema = z.object({
  scenes: z.array(
    z.object({
      sceneNumber: z.number().int().positive(),
      text: z.string().min(1),
      estimatedDurationSec: z.number().positive().optional(),
    })
  ).min(1),
});

export const repurposeShortsSchema = z.object({
  projectId: z.number().int().positive(),
  maxClips: z.number().int().min(1).max(10).default(3),
  targetDurationSec: z.number().int().min(10).max(90).default(30),
});

export type GenerateHookVariantsRequest = z.infer<typeof generateHookVariantsSchema>;
export type GenerateComedyTimingRequest = z.infer<typeof generateComedyTimingSchema>;
export type RepurposeShortsRequest = z.infer<typeof repurposeShortsSchema>;

// ===== ANIMATION MODE TABLES =====

// Animation Characters - user-defined characters for dialogue builder
export const animationCharacters = pgTable("animation_characters", {
  id: serial("id").primaryKey(),
  scriptId: integer("script_id").references(() => scripts.id).notNull(),
  name: text("name").notNull(),
  displayName: text("display_name"), // Optional friendly name for UI
  description: text("description"), // Visual description for image generation
  isNarrator: boolean("is_narrator").default(false), // Narrators don't get character images
  voiceId: text("voice_id"), // ElevenLabs voice ID
  voiceName: text("voice_name"), // Friendly voice name for display
  voiceSettings: jsonb("voice_settings"), // ElevenLabs voice settings
  referenceImageUrl: text("reference_image_url"), // Optional reference image
  color: text("color"), // UI color for identification (hex)
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAnimationCharacterSchema = createInsertSchema(animationCharacters).omit({
  id: true,
  createdAt: true,
});

export type InsertAnimationCharacter = z.infer<typeof insertAnimationCharacterSchema>;
export type AnimationCharacter = typeof animationCharacters.$inferSelect;

// Animation Frames - individual dialogue entries before scene grouping
export const animationFrames = pgTable("animation_frames", {
  id: serial("id").primaryKey(),
  scriptId: integer("script_id").references(() => scripts.id).notNull(),
  characterId: integer("character_id").references(() => animationCharacters.id),
  sceneGroupId: integer("scene_group_id"), // Set after AI scene grouping (references scene ID)
  sortOrder: integer("sort_order").notNull().default(0),
  dialogue: text("dialogue").notNull(),
  emotion: text("emotion"), // happy, sad, angry, neutral, excited, etc.
  action: text("action"), // Stage direction: "leans forward", "crosses arms"
  setting: text("setting"), // Scene setting description
  visualNotes: text("visual_notes"), // Additional notes for image generation
  estimatedDuration: numeric("estimated_duration"), // Calculated from dialogue length
  audioUrl: text("audio_url"), // Generated TTS audio
  audioStorageKey: text("audio_storage_key"),
  status: text("status").default("draft"), // draft, audio_generated, grouped, completed
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAnimationFrameSchema = createInsertSchema(animationFrames).omit({
  id: true,
  createdAt: true,
});

export type InsertAnimationFrame = z.infer<typeof insertAnimationFrameSchema>;
export type AnimationFrame = typeof animationFrames.$inferSelect;

// Animation Scenes - grouped frames forming a visual scene
export const animationScenes = pgTable("animation_scenes", {
  id: serial("id").primaryKey(),
  scriptId: integer("script_id").references(() => scripts.id).notNull(),
  title: text("title").notNull(),
  setting: text("setting"), // "INT. COFFEE SHOP - DAY"
  timeOfDay: text("time_of_day"), // morning, afternoon, evening, night
  visualStyle: text("visual_style"), // Style overrides for this scene
  transitionNote: text("transition_note"), // "FADE TO:", "CUT TO:", etc.
  summary: text("summary"), // Brief summary for storyboard preview
  sortOrder: integer("sort_order").notNull().default(0),
  imagePrompt: text("image_prompt"), // Generated DALL-E prompt for scene
  imageUrl: text("image_url"), // Generated scene image
  imageStorageKey: text("image_storage_key"),
  status: text("status").default("pending"), // pending, image_generated, audio_generated, completed
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAnimationSceneSchema = createInsertSchema(animationScenes).omit({
  id: true,
  createdAt: true,
});

export type InsertAnimationScene = z.infer<typeof insertAnimationSceneSchema>;
export type AnimationScene = typeof animationScenes.$inferSelect;

// Animation storyboard status enum
export const ANIMATION_STORYBOARD_STATUS = [
  'draft',           // Initial state - user is building characters/frames
  'frames_ready',    // All frames have been entered
  'scenes_suggested', // AI has suggested scene groupings
  'storyboard_locked', // User approved scene groupings, ready for generation
  'generating',      // Image/audio generation in progress
  'completed',       // All assets generated
] as const;

export type AnimationStoryboardStatus = typeof ANIMATION_STORYBOARD_STATUS[number];

// Relations for animation tables
export const animationCharactersRelations = relations(animationCharacters, ({ one, many }) => ({
  script: one(scripts, {
    fields: [animationCharacters.scriptId],
    references: [scripts.id]
  }),
  frames: many(animationFrames)
}));

export const animationScenesRelations = relations(animationScenes, ({ one, many }) => ({
  script: one(scripts, {
    fields: [animationScenes.scriptId],
    references: [scripts.id]
  }),
  frames: many(animationFrames)
}));

export const animationFramesRelations = relations(animationFrames, ({ one }) => ({
  script: one(scripts, {
    fields: [animationFrames.scriptId],
    references: [scripts.id]
  }),
  character: one(animationCharacters, {
    fields: [animationFrames.characterId],
    references: [animationCharacters.id]
  }),
  scene: one(animationScenes, {
    fields: [animationFrames.sceneGroupId],
    references: [animationScenes.id]
  })
}));

// Animation script parsing schema - used by AI enhance for animation projects
export const parsedAnimationScriptSchema = z.object({
  characters: z.array(z.object({
    name: z.string(),
    displayName: z.string().optional(),
    description: z.string().optional(),
    isNarrator: z.boolean().default(false),
    suggestedVoiceType: z.string().optional(), // "male_deep", "female_young", etc.
  })),
  scenes: z.array(z.object({
    title: z.string(),
    setting: z.string().optional(),
    timeOfDay: z.string().optional(),
    summary: z.string().optional(),
    frames: z.array(z.object({
      speaker: z.string(), // Character name
      dialogue: z.string(),
      emotion: z.string().optional(),
      action: z.string().optional(),
      visualNotes: z.string().optional(),
    })),
  })),
});

export type ParsedAnimationScript = z.infer<typeof parsedAnimationScriptSchema>;

// Voice Profiles for ElevenLabs TTS (reusable across projects)
export const voiceProfiles = pgTable("voice_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(), // e.g., "Sarcastic Narrator", "Nerdy Professor"
  description: text("description"), // Personality description for the voice
  elevenLabsVoiceId: text("elevenlabs_voice_id"), // ElevenLabs voice ID or cloned voice ID
  isCloned: boolean("is_cloned").default(false), // True if this is a cloned voice
  voiceSettings: jsonb("voice_settings"), // { stability, similarityBoost, style, speakerBoost }
  promptDescription: text("prompt_description"), // "Gruff, 50s male, Brooklyn accent, sarcastic"
  gender: text("gender"), // male, female, neutral
  ageRange: text("age_range"), // young, adult, elderly
  accent: text("accent"), // american, british, etc.
  isPublic: boolean("is_public").default(false), // Allow others to use this voice
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVoiceProfileSchema = createInsertSchema(voiceProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVoiceProfile = z.infer<typeof insertVoiceProfileSchema>;
export type VoiceProfile = typeof voiceProfiles.$inferSelect;

// Voice settings schema for ElevenLabs
export const voiceSettingsSchema = z.object({
  stability: z.number().min(0).max(1).default(0.5),
  similarityBoost: z.number().min(0).max(1).default(0.75),
  style: z.number().min(0).max(1).default(0),
  speakerBoost: z.boolean().default(true),
});

export type VoiceSettings = z.infer<typeof voiceSettingsSchema>;

// Dialogue Lines for Animation Mode (linked to scenes)
export const dialogueLines = pgTable("dialogue_lines", {
  id: serial("id").primaryKey(),
  sceneId: integer("scene_id").references(() => scenes.id).notNull(),
  characterId: text("character_id").notNull(), // References character DNA id
  characterName: text("character_name").notNull(), // Display name
  voiceProfileId: integer("voice_profile_id").references(() => voiceProfiles.id),
  lineNumber: integer("line_number").notNull(), // Order within scene
  dialogueText: text("dialogue_text").notNull(), // The spoken text
  emotion: text("emotion"), // happy, sad, angry, neutral, etc.
  estimatedDuration: numeric("estimated_duration"), // Estimated seconds
  actualDuration: numeric("actual_duration"), // Actual duration after TTS
  audioUrl: text("audio_url"), // Path to generated TTS audio
  audioStorageKey: text("audio_storage_key"), // Object storage key
  status: text("status").default("pending"), // pending, generating, completed, failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDialogueLineSchema = createInsertSchema(dialogueLines).omit({
  id: true,
  createdAt: true,
});

export type InsertDialogueLine = z.infer<typeof insertDialogueLineSchema>;
export type DialogueLine = typeof dialogueLines.$inferSelect;

// Lip Sync Jobs for Wav2Lip processing
export const lipSyncJobs = pgTable("lip_sync_jobs", {
  id: text("id").primaryKey(), // UUID for job tracking
  sceneId: integer("scene_id").references(() => scenes.id).notNull(),
  projectId: integer("project_id").references(() => scripts.id).notNull(),
  inputImageUrl: text("input_image_url").notNull(), // DALL-E generated image
  inputAudioUrl: text("input_audio_url").notNull(), // Combined audio for scene
  outputVideoUrl: text("output_video_url"), // Animated video output
  outputStorageKey: text("output_storage_key"), // Object storage key
  status: text("status").notNull().default("pending"), // pending, queued, processing, completed, failed
  progress: integer("progress").default(0), // 0-100
  duration: numeric("duration"), // Video duration in seconds
  fileSize: integer("file_size"), // Output file size in bytes
  processingService: text("processing_service").default("replicate"), // replicate, modal, runpod
  error: text("error"), // Error message if failed
  retryCount: integer("retry_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const insertLipSyncJobSchema = createInsertSchema(lipSyncJobs).omit({
  createdAt: true,
  startedAt: true,
  completedAt: true,
});

export const updateLipSyncJobSchema = insertLipSyncJobSchema.partial();

export type InsertLipSyncJob = z.infer<typeof insertLipSyncJobSchema>;
export type UpdateLipSyncJob = z.infer<typeof updateLipSyncJobSchema>;
export type LipSyncJob = typeof lipSyncJobs.$inferSelect;

// Animation project settings schema
export const animationSettingsSchema = z.object({
  comedyLevel: z.number().min(1).max(10).default(5), // 1=serious, 10=absurd comedy
  absurdityLevel: z.number().min(1).max(10).default(5), // How surreal/absurd
  targetDuration: z.number().min(10).max(120).default(45), // Target total video length in seconds
  maxScenes: z.number().min(1).max(20).default(5), // Maximum number of scenes
  pacing: z.enum(["slow", "moderate", "fast"]).default("moderate"),
  dialogueStyle: z.enum(["casual", "formal", "comedic", "dramatic"]).default("casual"),
});

export type AnimationSettings = z.infer<typeof animationSettingsSchema>;

// Relations for new tables
export const voiceProfilesRelations = relations(voiceProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [voiceProfiles.userId],
    references: [users.id]
  }),
  dialogueLines: many(dialogueLines)
}));

export const dialogueLinesRelations = relations(dialogueLines, ({ one }) => ({
  scene: one(scenes, {
    fields: [dialogueLines.sceneId],
    references: [scenes.id]
  }),
  voiceProfile: one(voiceProfiles, {
    fields: [dialogueLines.voiceProfileId],
    references: [voiceProfiles.id]
  })
}));

export const lipSyncJobsRelations = relations(lipSyncJobs, ({ one }) => ({
  scene: one(scenes, {
    fields: [lipSyncJobs.sceneId],
    references: [scenes.id]
  }),
  project: one(scripts, {
    fields: [lipSyncJobs.projectId],
    references: [scripts.id]
  })
}));
