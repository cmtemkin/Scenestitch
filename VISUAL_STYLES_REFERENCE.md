# Visual Styles Reference Guide

## Overview
SceneStitch supports multiple visual style systems for generating AI images and videos. This document describes all available styles, their descriptions, and how they're used in AI prompts.

---

## 1. Basic Visual Styles (User Interface)

These are the primary styles shown in the Simple Style Selector dropdown:

| Style Value | Label | Description |
|------------|-------|-------------|
| `auto` | Auto (AI-Generated Style) | AI analyzes the script content and generates the most appropriate style automatically |
| `photorealistic` | Photorealistic | Ultra-realistic details with professional photography quality |
| `anime` | Anime Style | Japanese animation aesthetic with dramatic poses and vibrant colors |
| `comic` | Comic Book Style | Comic panel style with speech bubbles, action words, and halftone patterns |
| `watercolor` | Watercolor Painting | Fluid paint effects with artistic brushstrokes and organic color blending |
| `oil-painting` | Oil Painting Style | Traditional oil painting techniques with rich textures |
| `minimalist` | Minimalist Design | Clean, simple design with essential elements only |
| `cyberpunk` | Cyberpunk Futuristic | Neon lights, dark urban environments, and futuristic technology |
| `fantasy` | Fantasy Art | Magical creatures, enchanted settings, and fantastical imagery |
| `sketch` | Hand-drawn Sketch | Pencil or pen drawings with artistic sketching techniques |
| `vintage` | Vintage Poster | Retro poster aesthetics with nostalgic design elements |
| `custom` | Custom Style | User provides their own detailed style description |

---

## 2. Advanced Visual Style Library (70+ Styles)

The system includes an extensive library of specialized styles for advanced use cases:

### Animation & Cartoon Styles
- **adventure-time**: Adventure Time whimsical cartoon style with rounded characters, bright colors, and playful fantasy elements
- **anime-epic**: Epic anime style with dramatic poses, dynamic action lines, detailed character designs, and vibrant effects
- **cel-shaded**: Cel-shaded animation style with flat colors, bold outlines, and cartoon-like rendering
- **chibi-cute**: Chibi cute style with oversized heads, small bodies, kawaii aesthetics, and adorable expressions
- **claymation**: Claymation stop-motion style with textured clay characters, handmade appearance, and tactile quality
- **comic**: Comic panel style with speech bubbles, action words, halftone patterns, and sequential art layout
- **comic-book-pop-art**: Comic book pop-art style with bold colors, Ben-Day dots, dramatic shadows, and superhero aesthetics
- **crayon-children**: Crayon children's drawing style with waxy textures, bright colors, and innocent artistic expression
- **doodle**: Doodle sketch style with hand-drawn lines, casual artistic expression, and spontaneous creativity
- **new-yorker-cartoon**: New Yorker cartoon style with sophisticated humor, minimalist line art, and witty social commentary
- **simpsons**: Simpsons-inspired cartoon style with yellow characters, satirical humor, and iconic animation design
- **south-park**: South Park cut-out style with simple paper craft characters, crude animation, and satirical comedy
- **stick-figure**: Stick figure/line art style with minimalist drawings, simple characters, and basic artistic expression
- **vintage-1930s**: Vintage 1930s cartoon style with rubber hose animation, black and white or sepia tones, classic Disney aesthetics

### Pixar & Disney Styles
- **disney-princess**: Disney Princess style with magical kingdoms, elegant characters, fairy tale romance, and enchanting atmosphere
- **finding-nemo**: Finding Nemo underwater style with colorful coral reefs, ocean life, and Pixar's aquatic world
- **incredibles**: The Incredibles superhero style with retro-futuristic design, family dynamics, and mid-century modern aesthetics
- **inside-out**: Inside Out emotional style with colorful abstract representations of feelings and psychological landscapes
- **monsters-inc**: Monsters Inc. style with furry creatures, colorful monsters, industrial settings, and Pixar's creature design
- **pixar-general**: Pixar general animation style with emotional storytelling, detailed 3D rendering, and heartwarming character design
- **ratatouille**: Ratatouille culinary style with French cuisine, cooking scenes, restaurant environments, and food-focused storytelling
- **shrek**: Shrek fairy tale style with ogre characters, medieval fantasy settings, and DreamWorks' subversive humor
- **soul**: Soul jazz aesthetic style with musical themes, New York City settings, and spiritual artistic expression
- **toy-story**: Toy Story animation style with plastic toys, bedroom adventures, and Pixar's pioneering 3D animation
- **up**: Up adventure style with balloons, elderly protagonist, heartwarming journey, and Pixar's emotional storytelling
- **wall-e**: WALL-E post-apocalyptic style with robot characters, environmental themes, and Pixar's dystopian future vision

### Art Movement & Historical Styles
- **art-deco**: Art Deco elegance with geometric patterns, luxury aesthetics, gold accents, and streamlined designs
- **art-nouveau**: Art Nouveau floral style with organic curves, botanical motifs, elegant typography, and decorative elements
- **bauhaus**: Bauhaus geometric style with clean lines, primary colors, functional design, and modernist principles
- **constructivist**: Constructivist propaganda style with bold typography, geometric shapes, revolutionary themes
- **engraving**: Victorian engraving style with fine line work, cross-hatching, classical illustrations, and vintage elegance
- **expressionist**: German Expressionist style with distorted forms, intense emotions, bold brushstrokes, and psychological themes
- **impressionist**: Impressionist painting style with soft brushstrokes, natural lighting, outdoor scenes, and artistic atmosphere
- **japanese-ukiyo-e**: Japanese Ukiyo-e style with woodblock print aesthetics, traditional motifs, and classical Japanese art
- **letterpress**: Letterpress vintage type style with pressed typography, textured paper, and classic printing techniques
- **medieval-illuminated**: Medieval illuminated manuscript style with ornate borders, gold leaf, religious imagery, and classical calligraphy
- **memphis-design**: Memphis Design 80s style with bold patterns, bright colors, geometric shapes, and postmodern aesthetics
- **mid-century-modern**: Mid-century modern style with clean lines, atomic age design, retro furniture, and sophisticated minimalism
- **mosaic-tile**: Mosaic tile art style with small colored pieces, ancient Roman aesthetics, and decorative patterns
- **neue-sachlichkeit**: New Objectivity style with precise realism, clinical observation, and German artistic movement aesthetics
- **pop-surrealism**: Pop surrealism style with dream-like imagery, contemporary themes, and fantastical artistic expression
- **risograph**: Risograph print style with unique color palettes, textured printing effects, and independent publication aesthetics
- **russian-constructivism**: Russian Constructivism style with revolutionary graphics, bold typography, geometric compositions
- **watercolor**: Watercolor poster style with fluid paint effects, artistic brushstrokes, and organic color blending
- **woodcut**: Woodcut print style with carved textures, traditional printing techniques, and historical artistic methods

### Modern & Digital Styles
- **blueprint**: Technical blueprint style with white lines on blue background, engineering drawings, and precise annotations
- **chalkboard**: Chalkboard classroom style with white chalk drawings on dark background, educational diagrams
- **cyberpunk-neon**: Cyberpunk neon style with glowing lights, dark urban environments, futuristic technology, electric colors
- **flat-infographic**: Flat design infographic style with simple icons, clean layouts, data visualization, and modern graphics
- **futuristic-hud**: Futuristic HUD style with holographic interfaces, digital displays, sci-fi technology, and glowing elements
- **graffiti**: Street graffiti style with spray paint effects, urban art, bold letters, and rebellious expression
- **isometric**: Isometric technical style with 3D perspective, geometric precision, architectural drawings, and technical illustrations
- **low-poly-3d**: Low-poly 3D style with geometric shapes, faceted surfaces, modern digital art, and angular designs
- **photorealistic**: Photorealistic style with ultra-realistic details, professional photography quality, and lifelike rendering
- **pixel-art**: Pixel art retro style with 8-bit graphics, video game aesthetics, blocky characters, and nostalgic digital art
- **retro**: Retro tech style with vintage electronics, old-school computers, analog devices, and nostalgic technology aesthetics
- **vhs**: VHS horror style with analog video effects, grain, distortion, and retro horror movie aesthetics
- **whiteboard**: Whiteboard animation style with hand-drawn markers, educational diagrams, and clean presentation graphics

### Gaming & Interactive Styles
- **lego-brick**: LEGO brick animation style with blocky characters, plastic textures, and modular construction aesthetics
- **nintendo-universe**: Nintendo Universe style with colorful game worlds, iconic characters, power-ups, and video game aesthetics
- **super-mario**: Super Mario style with colorful platformer worlds, power-ups, mushroom kingdoms, and Nintendo game aesthetics
- **voxel-minecraft**: Voxel/Minecraft style with blocky 3D worlds, cubic characters, and sandbox game aesthetics

### Specialty & Craft Styles
- **fairy-tale**: Fairy tale illustration style with magical creatures, enchanted forests, storybook aesthetics
- **gothic-horror**: Gothic horror style with dark atmospheres, medieval architecture, supernatural elements, and ominous mood
- **mixed-media-collage**: Mixed-media collage style with layered textures, diverse materials, artistic experimentation, and eclectic composition
- **noir-film**: Film noir dramatic style with high contrast lighting, shadows, urban settings, and classic Hollywood atmosphere
- **paper-cut-out**: Paper cut-out style with layered paper effects, craft aesthetics, handmade appearance, and dimensional depth
- **puppet-theater**: Puppet theater style with handmade marionettes, stage settings, and traditional performance art aesthetics
- **sketchbook**: Sketchbook doodle style with pencil drawings, artistic sketches, and creative exploration

---

## 3. System Prompt Templates

### Image Prompt Generation (DALL-E)

**Template Structure:**
```
Generate a detailed image prompt for the following {content_type} content in {style_description} style:

Content excerpt: "{scene_content}"

This is {unit} {current_position} of {total_scenes} in the overall {content_type} ({story_position} of the content).

IMPORTANT REQUIREMENTS:
- Create a vivid, specific visual description
- Include composition, lighting, and mood
- Specify camera angles and framing
- Add details about colors, textures, and atmosphere
- Ensure the prompt works well for AI image generation
- Maintain visual continuity with previous scenes
- Keep the style consistent throughout

{continuity_context}
{content_type_specific_guidance}
```

**Project Type Variations:**

The system adapts terminology based on project type:

| Project Type | Content Unit | Flow Description | Use Case |
|--------------|--------------|------------------|----------|
| `video` | "scene" | "narrative flow" | Standard video content with scenes |
| `blog` | "section" | "written content flow" | Blog posts with text sections |
| `presentation` | "slide" | "structured flow" | Presentations with slides |
| `audio-driven` | "scene" | "audio narrative flow" | Audio-driven videos synced to narration |
| `sora` | "scene" | "narrative flow" | Direct text-to-video (10-15 sec clips) |

**Example for blog project:**
```
Generate a detailed image prompt for the following blog post content in watercolor style:

Content excerpt: "Introduction to sustainable gardening practices"

This is section 2 of 8 in the overall blog post (beginning of the content).
```

**Example for presentation project:**
```
Generate a detailed image prompt for the following presentation content in minimalist style:

Content excerpt: "Key metrics for Q4 2024"

This is slide 5 of 12 in the overall presentation (middle of the content).
```

**Example for "incredibles" style:**
```
Generate a detailed image prompt for the following video content in The Incredibles superhero style with retro-futuristic design, family dynamics, and mid-century modern aesthetics:

Content excerpt: "A hero stands in a city street at sunset"

This is scene 5 of 12 in the overall video (middle of the content).

Previous prompts for continuity:
- Scene 3: Retro-futuristic cityscape with bold geometric buildings...
- Scene 4: Character in mid-century modern interior...
```

### Sora Video Prompt Generation (Image-to-Video)

**Template Structure:**
```
Generate a detailed Sora image-to-video animation prompt based on this script excerpt in {style_description} style:

{script_content}

An image has been generated using this DALL-E prompt: {dalle_prompt}

Your Sora prompt should:
- Describe smooth, natural camera movements
- Specify how elements should animate
- Include timing and pacing details
- Maintain the visual style from the image
- Create cinematic, engaging motion
- Duration: {duration} seconds

{audio_timing_context}
```

### Sora Text-to-Video Prompt Generation (Direct Video)

**Template Structure:**
```
Create an extremely detailed Sora text-to-video prompt for scene {current} of {total} ({story_position} of the video).

SCENE CONTENT:
{scene_content}

VISUAL STYLE:
{style_description}

TARGET DURATION: {duration} seconds

Your prompt must include ALL of these elements in rich detail:

1. SETTING & ENVIRONMENT
   - Specific location and atmosphere
   - Lighting conditions and time of day
   - Environmental details and props
   - Weather, ambiance, mood

2. CHARACTERS & SUBJECTS
   - Physical descriptions
   - Clothing and appearance details
   - Positioning and spatial relationships
   - Expressions and body language

3. CAMERA WORK
   - Initial camera position and framing
   - Camera movements (pan, tilt, zoom, track, etc.)
   - Shot type (wide, medium, close-up, etc.)
   - Perspective and angles

4. ACTION & MOTION
   - What moves and how it moves
   - Timing and pacing of actions
   - Choreography and blocking
   - Dynamics and energy level

5. VISUAL STYLE & AESTHETICS
   - Color palette and grading
   - Texture and materials
   - Artistic treatment matching: {style_description}
   - Overall visual coherence

6. NARRATIVE BEATS
   - Story moment being captured
   - Emotional tone and atmosphere
   - Dialogue or sound cues (if any)
   - Transition hints to next scene
```

### Auto Style Generation System Prompt

**For "auto" style, the AI analyzes the script using this prompt:**

```
You are a visual style expert analyzing scripts to determine the most appropriate artistic style for consistent video imagery.

CRITICAL: Your response must NEVER suggest photorealistic styles. Always recommend stylized, artistic, or illustrated approaches.

Analyze the script content and determine:
1. Genre and tone (horror, comedy, drama, sci-fi, fantasy, etc.)
2. Time period and setting
3. Target audience and content type
4. Emotional atmosphere
5. Key visual themes

Based on your analysis, recommend ONE specific artistic style that would work consistently throughout the entire video. Choose from styles like:
- Hand-drawn illustration styles (cartoon, anime, comic book)
- Digital art styles (cyberpunk, retro-futuristic, minimalist)
- Traditional art styles (watercolor, oil painting, sketch, woodcut)
- Stylized 3D rendering (low-poly, cel-shaded, voxel)
- Unique artistic movements (art deco, bauhaus, expressionist)

Provide a detailed description of the recommended style including:
- Visual characteristics (colors, textures, shapes)
- Reference points (similar works or artists)
- How it enhances the narrative
- Why it works for this specific content

Format your response as a concise, detailed style description that can be used directly in image generation prompts.
```

**Example Auto Style Response:**
```
Stylized digital illustration with bold colors and clean lines, avoiding photorealistic elements. Uses a retro-futuristic aesthetic with geometric shapes, vibrant color palette of teals and oranges, and mid-century modern design sensibilities. Think vintage travel posters meets contemporary flat design.
```

### Thumbnail Generation System Prompt

**For project thumbnails:**

```
Create a high-impact thumbnail image for: "{title}"

Content: {script_excerpt}...

Style: {style_description}

CRITICAL TEXT PLACEMENT - MUST INCLUDE TITLE:
Title "{title}" with these STRICT requirements:
- EXACTLY {horizontal_buffer}+ pixels from left/right edges, {vertical_buffer}+ pixels from top/bottom
- Thick black outlines (4-6px) with white text fill
- Font size minimum 72pt, bold weight
- High contrast against background
- Perfectly readable and never truncated
- Professional, eye-catching design

COMPOSITION REQUIREMENTS:
- 1536x1024 landscape format (YouTube thumbnail standard)
- Clear focal point with dramatic visual interest
- Vibrant colors that pop in small sizes
- Professional, polished appearance
- Maintains {style_description} aesthetic
- Balanced composition with title integration
```

**Buffer Zone Calculations:**

The system automatically calculates safe zones to prevent text cutoff:

```javascript
// Base buffer is 12% of the smaller dimension
const baseBuffer = Math.min(width, height) * 0.12;
const minBuffer = Math.max(baseBuffer, 100); // Minimum 100px

// Adjust for aspect ratio
const safeZone = {
  horizontal: Math.round(minBuffer),
  vertical: Math.round(minBuffer * (isPortrait ? 0.8 : 1.2))
};
```

**Text Placement Options:**

| Placement | Description | Safe Zone Requirements |
|-----------|-------------|----------------------|
| `center` | Centered in middle | {horizontal_buffer}+ px from all edges |
| `top` | Upper third | {vertical_buffer}+ px from top, {horizontal_buffer}+ px from sides |
| `bottom` | Lower third | {vertical_buffer}+ px from bottom, {horizontal_buffer}+ px from sides |
| `left` | Left side | {horizontal_buffer}+ px from left, vertically centered |
| `right` | Right side | {horizontal_buffer}+ px from right, vertically centered |
| `overlay` | Smart placement | Minimal interference, all buffers maintained |

**Custom Text Emphasis:**

When `emphasizeText: true`:
- Text gets maximum prominence
- Backgrounds adjusted for contrast
- Bold, thick outlines (4-6px)
- Minimum 72pt font size

When `emphasizeText: false`:
- Text integrated more subtly
- Can be smaller and less prominent
- Style-appropriate typography

---

## 4. Style Application Flow

### How Styles Are Applied in the System

1. **User Selection** → User chooses a style from dropdown or enters custom description
2. **Style Resolution** → System resolves the style:
   - If `auto`: AI analyzes script and generates custom style description
   - If `custom`: Uses user-provided description verbatim
   - If preset: Maps to detailed description from style library
3. **Prompt Enhancement** → Style description is injected into AI prompt templates
4. **Image Generation** → GPT-Image-1 or DALL-E 3 generates images using enhanced prompts
5. **Video Generation** → Sora uses style-consistent prompts for animation
6. **Continuity Maintenance** → Previous prompts are referenced to maintain visual consistency

### Example Flow for "incredibles" Style:

```
User Selection: "incredibles"
    ↓
Style Resolution: "The Incredibles superhero style with retro-futuristic design, 
                   family dynamics, and mid-century modern aesthetics"
    ↓
Prompt Template: "Generate a detailed image prompt for the following video content 
                 in The Incredibles superhero style with retro-futuristic design..."
    ↓
Image Generation: GPT-Image-1 creates image matching the enhanced prompt
    ↓
Sora Animation: "Generate a detailed Sora image-to-video animation prompt...
                maintaining The Incredibles superhero style..."
```

---

## 5. Best Practices

### Basic vs Advanced Styles

**When to use Basic Styles (11 UI options):**
- Quick prototyping and experimentation
- Simple projects with standard visual needs
- When users want easy, understandable choices
- General-purpose content without specific aesthetic requirements

**When to use Advanced Styles (70+ options):**
- Branded content requiring specific aesthetics (e.g., Pixar-style corporate video)
- Highly specialized content (e.g., educational blueprint diagrams)
- Projects where visual style is a key differentiator
- When recreating or matching existing visual brands
- Advanced users who know exactly what aesthetic they want

**Pro Tip:** Start with basic styles to find a general direction, then explore advanced styles for fine-tuning.

### Continuity Toggle Impact

The `maintainContinuity` parameter significantly affects prompt generation:

**With Continuity ON (maintainContinuity: true):**
- System injects previous scene prompts into new prompts
- Maintains consistent color palettes, lighting, and composition
- Ensures characters and environments look the same across scenes
- Best for: Narrative videos, stories, sequential content
- Trade-off: Less variation between scenes

**With Continuity OFF (maintainContinuity: false):**
- Each scene generated independently
- More visual variety and experimentation
- Each scene optimized individually without reference to others
- Best for: Collection-style content, variety shows, anthologies
- Trade-off: Visual inconsistency between scenes

**Example Impact:**

*With continuity:*
```
Scene 1: Red-haired character in blue jacket, sunny park
Scene 2: Same red-haired character, same blue jacket, now indoors
```

*Without continuity:*
```
Scene 1: Red-haired character in blue jacket, sunny park
Scene 2: Different character style, different colors, different mood
```

### Choosing the Right Style by Content Type

- **Educational Content**: blueprint, chalkboard, whiteboard, flat-infographic
- **Children's Content**: disney-princess, pixar-general, adventure-time, chibi-cute
- **Tech/Sci-Fi**: cyberpunk-neon, futuristic-hud, retro, blueprint
- **Historical Content**: engraving, medieval-illuminated, vintage-1930s, japanese-ukiyo-e
- **Gaming Content**: pixel-art, nintendo-universe, voxel-minecraft, super-mario
- **Artistic Projects**: watercolor, impressionist, expressionist, pop-surrealism
- **Professional/Corporate**: minimalist, flat-infographic, mid-century-modern
- **Horror/Dark**: gothic-horror, noir-film, vhs, expressionist
- **Retro/Vintage**: vintage-1930s, retro, art-deco, letterpress
- **Fantasy/Magic**: fairy-tale, disney-princess, fantasy (basic style)
- **Comedy**: simpsons, south-park, doodle, new-yorker-cartoon

### Custom Style Tips

When using "custom" style, provide detailed descriptions including:
- Overall aesthetic (realistic, cartoon, painted, etc.)
- Color palette preferences
- Texture and material qualities
- Lighting style (dramatic, soft, neon, etc.)
- Reference examples if helpful
- Mood and atmosphere

**Example Custom Style:**
```
"Dreamy pastel watercolor aesthetic with soft pink and lavender hues, 
ethereal lighting, gentle brush strokes, romantic and whimsical mood, 
inspired by Impressionist painters and modern cottagecore aesthetics"
```

---

## 6. Technical Notes

### Model Usage
- **Prompt Generation**: GPT-5 (for all scene breakdowns and prompt creation)
- **Image Generation**: GPT-Image-1 or DALL-E 3
- **Video Generation**: Sora (both image-to-video and text-to-video)
- **Style Analysis**: GPT-5 (for auto-style determination)

### Content Safety
All prompts are sanitized to remove potentially problematic content while preserving artistic intent. Celebrity names and specific brand references are kept intact per project requirements.

### Continuity System
The system maintains visual continuity by:
- Storing previous prompts (last 2-3 scenes)
- Injecting continuity context into new prompts
- Tracking story position (beginning, middle, end)
- Maintaining consistent style descriptions throughout
- Using `maintainContinuity` flag in API calls

---

## 7. API Integration

### Style Parameter Format

When calling image generation APIs:

```javascript
{
  style: "incredibles",  // or "auto", "custom", etc.
  customStylePrompt: "...", // only if style === "custom"
  maintainContinuity: true,
  projectType: "video" // affects prompt templates
}
```

### Style Validation

Valid style values:
- Any key from the Advanced Style Library (70+ options)
- "auto" - triggers AI analysis
- "custom" - requires customStylePrompt parameter
- Basic styles: photorealistic, anime, comic, watercolor, oil-painting, minimalist, cyberpunk, fantasy, sketch, vintage

### Project Types & Their Impact

Different project types use different terminology in prompts:

- **video**: Standard video scenes with narrative flow
- **blog**: Blog post sections with written content flow
- **presentation**: Presentation slides with structured flow
- **audio-driven**: Audio-driven video with audio narrative flow
- **sora**: Direct text-to-video generation (10-15 second clips)

---

## 8. Style Continuity Examples

### Scene-to-Scene Continuity

When generating multiple scenes, the system references previous prompts:

**Scene 1 (incredibles style):**
```
Retro-futuristic cityscape at dusk, mid-century modern architecture with 
clean geometric lines, warm orange and teal color palette, sleek hovercars, 
atomic age design elements...
```

**Scene 2 (continuing):**
```
Generate a detailed image prompt for the following video content in The 
Incredibles superhero style...

Previous prompts for continuity:
- Scene 1: Retro-futuristic cityscape at dusk, mid-century modern 
  architecture with clean geometric lines...

Ensure visual elements match: same color palette (warm orange and teal), 
same architectural style (mid-century modern, atomic age), same overall 
aesthetic (retro-futuristic)...
```

This ensures visual consistency across the entire project.

---

## 9. Fallback Behavior

### When Style Generation Fails

If AI prompt generation fails, the system uses fallback prompts:

```javascript
// Fallback for image prompts
`A {story_position} scene that {develops/introduces/concludes} the narrative, 
clearly showing {content_excerpt} in {style} style. The image should have 
high contrast, clear subject focus, and professional composition suitable 
for an educational YouTube video.`

// Fallback for Sora video prompts
`{style_description} style video. {scene_content}. The scene shows this 
narrative moment in detail with cinematic camera work, expressive performances, 
and rich environmental details. Duration: {duration} seconds.`
```

---

## 10. Quick Reference Table

| Use Case | Recommended Styles |
|----------|-------------------|
| YouTube Education | blueprint, whiteboard, flat-infographic, chalkboard |
| Kids Animation | pixar-general, disney-princess, adventure-time, toy-story |
| Tech Tutorial | cyberpunk-neon, futuristic-hud, isometric, blueprint |
| Historical Documentary | engraving, medieval-illuminated, vintage-1930s |
| Gaming Content | pixel-art, voxel-minecraft, nintendo-universe |
| Art/Creative | watercolor, impressionist, pop-surrealism, mixed-media-collage |
| Corporate/Business | minimalist, mid-century-modern, flat-infographic |
| Horror/Thriller | gothic-horror, noir-film, vhs, expressionist |
| Comedy/Humor | simpsons, south-park, doodle, comic |
| Fantasy/Adventure | fairy-tale, fantasy, art-nouveau, disney-princess |

---

## 11. Code Examples

### Using Styles in Frontend

```typescript
// Simple style selection
<SimpleStyleSelector 
  value={selectedStyle}
  onChange={setSelectedStyle}
  customStylePrompt={customPrompt}
  onCustomStyleChange={setCustomPrompt}
/>

// Available values:
// "auto", "photorealistic", "anime", "comic", "watercolor", 
// "oil-painting", "minimalist", "cyberpunk", "fantasy", 
// "sketch", "vintage", "custom"
```

### Using Styles in API Calls

```typescript
// Generate scenes with specific style
const response = await apiRequest('/api/generate-scenes', {
  method: 'POST',
  body: {
    script: scriptContent,
    style: 'incredibles',
    maintainContinuity: true,
    projectType: 'video'
  }
});

// Generate with custom style
const customResponse = await apiRequest('/api/generate-scenes', {
  method: 'POST',
  body: {
    script: scriptContent,
    style: 'custom',
    customStylePrompt: 'Dreamy pastel watercolor with soft lighting...',
    maintainContinuity: true
  }
});

// Generate with auto style (AI-determined)
const autoResponse = await apiRequest('/api/generate-scenes', {
  method: 'POST',
  body: {
    script: scriptContent,
    style: 'auto',  // AI will analyze and choose
    maintainContinuity: true
  }
});
```

---

## 12. Troubleshooting

### Common Issues

**Problem**: Inconsistent visual style across scenes
**Solution**: Ensure `maintainContinuity: true` is set in API calls

**Problem**: Style not matching expectations
**Solution**: Use `custom` style with detailed description or try `auto` for AI analysis

**Problem**: Images look too realistic when stylized was requested
**Solution**: Check that style is not "photorealistic" - auto-style system specifically avoids this

**Problem**: Custom style not applying
**Solution**: Verify `customStylePrompt` is provided when `style: "custom"`

---

*Last Updated: November 2025*  
*SceneStitch AI - Visual Style System Documentation*  
*Version 1.0*
