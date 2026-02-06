import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Wand2, Type, Palette } from "lucide-react";

interface ThumbnailConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: ThumbnailConfig) => void;
  projectTitle: string;
  currentStyle: string;
  isGenerating: boolean;
}

export interface ThumbnailConfig {
  style: string;
  customText: string;
  textPlacement: string;
  emphasizeText: boolean;
  imageSize?: string;
  imageQuality?: string;
}

const thumbnailStyles = [
  { id: "auto", name: "Auto (AI-Generated Style)", preview: "🤖" },
  { id: "adventure-time", name: "Adventure Time Whimsical Style", preview: "🏰" },
  { id: "anime-epic", name: "Anime Epic Style", preview: "⚔️" },
  { id: "art-deco", name: "Art Deco Elegance", preview: "🏛️" },
  { id: "art-nouveau", name: "Art Nouveau Floral Style", preview: "🌸" },
  { id: "bauhaus", name: "Bauhaus Geometric Style", preview: "📐" },
  { id: "blueprint", name: "Blueprint", preview: "📋" },
  { id: "cel-shaded", name: "Cel-Shaded Animation Style", preview: "🎭" },
  { id: "chalkboard", name: "Chalkboard Classroom Style", preview: "📝" },
  { id: "chibi-cute", name: "Chibi Cute Style", preview: "😊" },
  { id: "claymation", name: "Claymation Stop-Motion Style", preview: "🏺" },
  { id: "comic", name: "Comic Pane", preview: "💥" },
  { id: "comic-book-pop-art", name: "Comic Book Pop-Art Style", preview: "🦸" },
  { id: "constructivist", name: "Constructivist Propaganda Style", preview: "⚙️" },
  { id: "crayon-children", name: "Crayon Children's Drawing Style", preview: "🖍️" },
  { id: "cyberpunk-neon", name: "Cyberpunk Neon Style", preview: "🔮" },
  { id: "disney-princess", name: "Disney Princess Style", preview: "👑" },
  { id: "doodle", name: "Doodle Sketch", preview: "✏️" },
  { id: "engraving", name: "Victorian Engraving Style", preview: "🖋️" },
  { id: "expressionist", name: "German Expressionist Style", preview: "🎨" },
  { id: "fairy-tale", name: "Fairy Tale Illustration Style", preview: "🧚" },
  { id: "finding-nemo", name: "Finding Nemo Underwater Style", preview: "🐠" },
  { id: "flat-infographic", name: "Flat Design Infographic Style", preview: "📊" },
  { id: "futuristic-hud", name: "Futuristic HUD Style", preview: "🔬" },
  { id: "gothic-horror", name: "Gothic Horror Style", preview: "🦇" },
  { id: "graffiti", name: "Street Graffiti Style", preview: "🎨" },
  { id: "impressionist", name: "Impressionist Painting Style", preview: "🌅" },
  { id: "incredibles", name: "The Incredibles Superhero Style", preview: "🦸‍♂️" },
  { id: "inside-out", name: "Inside Out Emotional Style", preview: "😭" },
  { id: "isometric", name: "Isometric Technical Style", preview: "📐" },
  { id: "japanese-ukiyo-e", name: "Japanese Ukiyo-e Style", preview: "🎋" },
  { id: "lego-brick", name: "LEGO Brick Animation Style", preview: "🧱" },
  { id: "letterpress", name: "Letterpress Vintage Type Style", preview: "📰" },
  { id: "low-poly-3d", name: "Low-Poly 3D Style", preview: "🔷" },
  { id: "medieval-illuminated", name: "Medieval Illuminated Manuscript", preview: "📜" },
  { id: "memphis-design", name: "Memphis Design 80s Style", preview: "📼" },
  { id: "mid-century-modern", name: "Mid-Century Modern Style", preview: "🪑" },
  { id: "mixed-media-collage", name: "Mixed-Media Collage Style", preview: "📎" },
  { id: "monsters-inc", name: "Monsters Inc. Style", preview: "👹" },
  { id: "mosaic-tile", name: "Mosaic Tile Art Style", preview: "🏺" },
  { id: "neue-sachlichkeit", name: "New Objectivity Style", preview: "🏭" },
  { id: "new-yorker-cartoon", name: "New Yorker Cartoon", preview: "🗞️" },
  { id: "nintendo-universe", name: "Nintendo Universe Style", preview: "🍄" },
  { id: "noir-film", name: "Film Noir Dramatic Style", preview: "🎬" },
  { id: "paper-cut-out", name: "Paper Cut-Out Style", preview: "✂️" },
  { id: "photorealistic", name: "Photorealistic Style", preview: "📸" },
  { id: "pixel-art", name: "Pixel Art Retro Style", preview: "👾" },
  { id: "pixar-general", name: "Pixar General Animation Style", preview: "🎥" },
  { id: "pop-surrealism", name: "Pop Surrealism Style", preview: "🎪" },
  { id: "puppet-theater", name: "Puppet Theater Style", preview: "🎭" },
  { id: "ratatouille", name: "Ratatouille Culinary Style", preview: "🐭" },
  { id: "retro", name: "Retro Tech", preview: "📺" },
  { id: "risograph", name: "Risograph Print Style", preview: "🖨️" },
  { id: "russian-constructivism", name: "Russian Constructivism Style", preview: "🏗️" },
  { id: "shrek", name: "Shrek Fairy Tale Style", preview: "🧌" },
  { id: "simpsons", name: "Simpsons-Inspired Cartoon Style", preview: "🍩" },
  { id: "sketchbook", name: "Sketchbook Doodle Style", preview: "📖" },
  { id: "soul", name: "Soul Jazz Aesthetic Style", preview: "🎷" },
  { id: "south-park", name: "South Park Cut-Out Style", preview: "❄️" },
  { id: "stick-figure", name: "Stick Figure / Line Art Style", preview: "🔄" },
  { id: "super-mario", name: "Super Mario Style", preview: "🍄" },
  { id: "toy-story", name: "Toy Story Animation Style", preview: "🤠" },
  { id: "up", name: "Up Adventure Style", preview: "🎈" },
  { id: "vintage-1930s", name: "Vintage 1930s Cartoon Style", preview: "🎭" },
  { id: "vhs", name: "VHS Horror", preview: "📼" },
  { id: "voxel-minecraft", name: "Voxel/Minecraft Style", preview: "⛏️" },
  { id: "wall-e", name: "WALL-E Post-Apocalyptic Style", preview: "🤖" },
  { id: "watercolor", name: "Watercolor Poster", preview: "🎨" },
  { id: "whiteboard", name: "Whiteboard Animation Style", preview: "📋" },
  { id: "woodcut", name: "Woodcut Print Style", preview: "🪓" }
];

const textPlacements = [
  { id: "center", name: "Center", description: "Text prominently centered" },
  { id: "top", name: "Top", description: "Text at the top of thumbnail" },
  { id: "bottom", name: "Bottom", description: "Text at the bottom" },
  { id: "left", name: "Left Side", description: "Text on the left side" },
  { id: "right", name: "Right Side", description: "Text on the right side" },
  { id: "overlay", name: "Dynamic Overlay", description: "Text intelligently placed for maximum impact" }
];

const ThumbnailConfigModal: React.FC<ThumbnailConfigModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
  projectTitle,
  currentStyle,
  isGenerating
}) => {
  const [config, setConfig] = useState<ThumbnailConfig>({
    style: currentStyle || "cinematic",
    customText: "",
    textPlacement: "overlay",
    emphasizeText: true
  });

  const handleGenerate = () => {
    onGenerate(config);
  };

  const selectedStyle = thumbnailStyles.find(s => s.id === config.style);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Generate YouTube Thumbnail
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Style Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Thumbnail Style
            </Label>
            <Select 
              value={config.style} 
              onValueChange={(value) => setConfig(prev => ({ ...prev, style: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a style" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {thumbnailStyles.map((style) => (
                  <SelectItem key={style.id} value={style.id}>
                    <div className="flex items-center gap-2">
                      <span>{style.preview}</span>
                      <span>{style.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedStyle && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm">
                  <strong>Selected:</strong> {selectedStyle.name}
                </p>
              </div>
            )}
          </div>

          {/* Custom Text */}
          <div className="space-y-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Type className="h-4 w-4" />
              Custom Text (Optional)
            </Label>
            <Textarea
              placeholder="Enter text to display on thumbnail (leave empty for AI-generated text)"
              value={config.customText}
              onChange={(e) => setConfig(prev => ({ ...prev, customText: e.target.value }))}
              className="min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">
              Add compelling text that will appear on your thumbnail. If left empty, AI will generate 
              clickbait text based on your content.
            </p>
          </div>

          {/* Text Placement */}
          {config.customText && (
            <div className="space-y-3">
              <Label className="text-base font-semibold">Text Placement</Label>
              <Select 
                value={config.textPlacement} 
                onValueChange={(value) => setConfig(prev => ({ ...prev, textPlacement: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {textPlacements.map((placement) => (
                    <SelectItem key={placement.id} value={placement.id}>
                      <div className="flex flex-col">
                        <span>{placement.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {placement.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Project Preview */}
          <div className="p-3 bg-muted/30 rounded-lg">
            <Label className="text-sm font-medium">Project: {projectTitle}</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Thumbnail will be optimized with high-impact visuals and compelling appeal
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="flex-1"
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleGenerate}
              className="flex-1"
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Generate Thumbnail
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ThumbnailConfigModal;