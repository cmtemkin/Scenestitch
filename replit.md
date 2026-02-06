# SceneStitch

## Overview
SceneStitch is a full-stack web application designed to transform text-based scripts into visual storytelling content. It utilizes AI services for generating scene prompts, creating images, and producing videos, offering a complete workflow from script input to final video output. The platform supports project management, scene editing, and advanced features like character continuity and Sora video generation, aiming to simplify and accelerate video production for various creative endeavors, including music videos.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Full-Stack Architecture
- **Frontend**: React with TypeScript, using Vite for build tooling. Employs Tailwind CSS with shadcn/ui for styling, React Query for state management, React Hook Form with Zod for form handling, and Radix UI for accessibility.
- **Backend**: Express.js server with TypeScript, providing a RESTful API.
- **Database**: PostgreSQL with Drizzle ORM for type-safe operations.
- **Development Environment**: Node.js 20, npm for package management, Vite for frontend builds, esbuild for backend bundling, and tsx for development execution.
- **File Processing**: FFmpeg for video manipulation and image processing. Sharp/Canvas for image optimization.

### Key Technical Implementations & Features
- **AI Integration**: Leverages Anthropic Claude and OpenAI GPT-5/GPT-4o for script analysis, prompt generation, character extraction, and music audio analysis.
- **Character Continuity System**: Uses GPT-5.1 to extract detailed character DNA from scripts, ensuring visual consistency across scenes by injecting profiles into image generation prompts. For music video projects, the uploaded musician reference image is automatically assigned to the main "Artist" character and propagated through the entire image generation pipeline.
- **Sora Video Generation System**: Integrates OpenAI Sora 2 API for image-to-video generation, supporting specific clip lengths (4, 8, 12 seconds) and image-aware prompting for optimal results. Includes individual scene video generation and a video player modal.
- **Music Video Creation Mode**: Dedicated project type for music videos, featuring audio analysis via OpenAI Whisper API for word-level timestamps, GPT-4o alignment for lyrics, and scene timing synchronization with audio. Supports specific visual styles for music videos.
- **Image Optimization**: Implements thumbnail compression and separate endpoints for full vs. thumbnail images to enhance loading performance.
- **Video Generation Pipeline**: Processes scene images through FFmpeg, applies Ken Burns effects, generates individual clips, and concatenates them into a final video.
- **Deployment**: Configured for Replit deployment with autoscale, external port mapping, and build processes.

### UI/UX Decisions
- **Responsive Design**: Mobile-first approach with optimized components for various screen sizes, including MacBook and iPhone, incorporating iOS safe area support and custom Tailwind breakpoints.
- **Interactive Prompt Editing**: Allows users to edit prompts with AI assistance, offering multiple GPT-5 generated variations.

### Animation Wizard
- **4-Stage Workflow**: Script → Characters → Scenes → Preview storyboard lock
- **Optional AI Enhancement**: Users can either use GPT-4o to auto-parse scripts or manually add characters/scenes
- **Multi-Scene Support**: Organize dialogue into logical scene groups with settings and transitions

### Notion Documentation Integration
- **Automatic Documentation**: Creates and maintains documentation in Notion workspace
- **Three Documentation Types**:
  - Technical Documentation (architecture, APIs, database schema)
  - User Guide (feature tutorials, how-to guides)
  - Release Notes (versioned changelog per publish)
- **Publish Hook**: When the app is published, automatically updates all documentation and creates a new release note
- **Admin Protected**: Notion endpoints require admin authentication (NOTION_ADMIN_KEY or REPLIT_DEPLOYMENT_ID)
- **Endpoints**:
  - POST /api/notion/initialize - Create SceneStitch workspace
  - POST /api/notion/update-docs - Update technical docs and user guide
  - POST /api/notion/release - Create release note
  - POST /api/notion/publish-hook - Full publish workflow

## External Dependencies
- **AI Services**: Anthropic Claude, OpenAI (GPT-5, GPT-4o, GPT-5.1, Whisper API, Sora 2 API for video generation).
- **Media Processing**: FFmpeg, Archiver, Sharp/Canvas.
- **Database & Infrastructure**: PostgreSQL, Neon Database (serverless hosting), Drizzle ORM, Drizzle Kit (migrations).
- **Documentation**: Notion API for automated documentation management.