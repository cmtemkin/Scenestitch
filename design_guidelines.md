# SceneStitch Design Guidelines

## Design Approach
**Reference-Based System Hybrid**: Drawing from Linear's precision, Figma's creative workflow UX, and Vercel's dark mode sophistication. Using shadcn/ui components with dark theme as the foundation.

## Typography System
- **Primary Font**: Inter (via Google Fonts) - clean, modern, excellent readability
- **Monospace**: JetBrains Mono - for technical elements, timestamps, parameters
- **Hierarchy**:
  - H1: text-3xl font-bold tracking-tight
  - H2: text-xl font-semibold
  - H3: text-lg font-medium
  - Body: text-sm
  - Caption: text-xs text-muted-foreground

## Layout System
**Spacing Units**: Tailwind units of 2, 4, 6, 8, 12, 16 (p-2, h-8, gap-6, etc.)

**Application Structure**:
- Fixed sidebar: w-80 (320px) with configuration panels
- Main content area: flex-1 with preview panel
- Top bar: h-14 for breadcrumbs, actions, user menu
- Component padding: p-6 for panels, p-4 for cards

## Core Components

### Sidebar Configuration Panel
- Collapsible sections with smooth transitions
- Form groups with clear labels and helper text
- Slider controls for parameters (duration, quality, etc.)
- Dropdown selectors for model/style choices
- Toggle switches for boolean options
- Preset quick-access buttons at top
- Generate button: Large, prominent at bottom (sticky)

### Preview Panel
- 16:9 aspect ratio viewport (centered, max-w-5xl)
- Timeline scrubber below preview
- Playback controls: Play/pause, frame-by-frame navigation
- Quality indicator badge (top-right of preview)
- Download/export actions (top-right toolbar)
- Frame counter and timestamp display
- Loading states with progress indicators

### Top Navigation Bar
- Project name/breadcrumb (left)
- Quick actions: Save, Export, Share (center-right)
- User avatar + settings dropdown (far right)
- AI status indicator: "GPT-4 Connected" badge

### Generation History Panel
- Collapsible bottom drawer (h-48 collapsed, h-96 expanded)
- Thumbnail grid of previous generations
- Click to load into preview
- Metadata: timestamp, parameters, duration
- Batch operations: Delete, compare, export multiple

## Component Patterns

**Cards**: border border-border bg-card rounded-lg with subtle shadow-sm
**Inputs**: Dark backgrounds with border-input, focus:ring-2 ring-ring
**Buttons**: 
- Primary: Large, high contrast
- Secondary: Subtle with border
- Ghost: Minimal for tertiary actions
**Badges**: Rounded-full with muted backgrounds for status indicators
**Separators**: border-border subtle dividers between sections

## Interactive States
- Hover: Subtle brightness increase (hover:bg-accent)
- Active generation: Pulsing indicator on Generate button
- Processing: Shimmer effect on preview area
- Error states: Subtle red border with inline error message

## Images
**Hero Section**: No traditional hero - this is an application interface
**Application Assets**:
1. **Empty State Illustration**: Center of preview panel when no scene generated - minimalist graphic of film strip/clapperboard (400x300px)
2. **Generation Thumbnails**: AI-generated scene previews in history panel (192x108px thumbnails)
3. **Preset Icons**: Small 24x24 icons for configuration presets (cinematic, documentary, action, etc.)

## Visual Enhancements
- Subtle grid pattern background in preview area (very low opacity)
- Gradient accent on Generate button (primary to primary/90)
- Micro-animations: Form inputs scale on focus (scale-[1.01])
- Progress rings for generation status
- Frosted glass effect (backdrop-blur-md) on floating panels/modals

## Information Architecture
**Left Sidebar Sections** (top to bottom):
1. Scene Configuration
2. Visual Style Settings
3. AI Model Selection
4. Advanced Parameters (collapsed by default)
5. Generate Button (sticky bottom)

**Main Content Layout**:
1. Top bar with project controls
2. Preview panel (primary focus)
3. Timeline/scrubber controls
4. Generation history drawer (bottom)

This creates a professional, focused workspace optimized for iterative AI content generation with clear visual hierarchy and efficient workflow patterns.