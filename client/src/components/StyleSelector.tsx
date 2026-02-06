import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Search, Check } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";

const VISUAL_STYLES = [
  { value: "auto", label: "Auto (AI-Generated Style)" },
  { value: "adventure-time", label: "Adventure Time Whimsical Style" },
  { value: "anime-epic", label: "Anime Epic Style" },
  { value: "art-deco", label: "Art Deco Elegance" },
  { value: "art-nouveau", label: "Art Nouveau Floral Style" },
  { value: "bauhaus", label: "Bauhaus Geometric Style" },
  { value: "blueprint", label: "Blueprint" },
  { value: "cel-shaded", label: "Cel-Shaded Animation Style" },
  { value: "chalkboard", label: "Chalkboard Classroom Style" },
  { value: "chibi-cute", label: "Chibi Cute Style" },
  { value: "claymation", label: "Claymation Stop-Motion Style" },
  { value: "comic", label: "Comic Pane" },
  { value: "comic-book-pop-art", label: "Comic Book Pop-Art Style" },
  { value: "constructivist", label: "Constructivist Propaganda Style" },
  { value: "crayon-children", label: "Crayon Children's Drawing Style" },
  { value: "cyberpunk-neon", label: "Cyberpunk Neon Style" },
  { value: "disney-princess", label: "Disney Princess Style" },
  { value: "doodle", label: "Doodle Sketch" },
  { value: "engraving", label: "Victorian Engraving Style" },
  { value: "expressionist", label: "German Expressionist Style" },
  { value: "fairy-tale", label: "Fairy Tale Illustration Style" },
  { value: "finding-nemo", label: "Finding Nemo Underwater Style" },
  { value: "flat-infographic", label: "Flat Design Infographic Style" },
  { value: "futuristic-hud", label: "Futuristic HUD Style" },
  { value: "gothic-horror", label: "Gothic Horror Style" },
  { value: "graffiti", label: "Street Graffiti Style" },
  { value: "impressionist", label: "Impressionist Painting Style" },
  { value: "incredibles", label: "The Incredibles Superhero Style" },
  { value: "inside-out", label: "Inside Out Emotional Style" },
  { value: "isometric", label: "Isometric Technical Style" },
  { value: "japanese-ukiyo-e", label: "Japanese Ukiyo-e Style" },
  { value: "lego-brick", label: "LEGO Brick Animation Style" },
  { value: "letterpress", label: "Letterpress Vintage Type Style" },
  { value: "low-poly-3d", label: "Low-Poly 3D Style" },
  { value: "medieval-illuminated", label: "Medieval Illuminated Manuscript" },
  { value: "memphis-design", label: "Memphis Design 80s Style" },
  { value: "mid-century-modern", label: "Mid-Century Modern Style" },
  { value: "mixed-media-collage", label: "Mixed-Media Collage Style" },
  { value: "monsters-inc", label: "Monsters Inc. Style" },
  { value: "mosaic-tile", label: "Mosaic Tile Art Style" },
  { value: "neue-sachlichkeit", label: "New Objectivity Style" },
  { value: "new-yorker-cartoon", label: "New Yorker Cartoon" },
  { value: "nintendo-universe", label: "Nintendo Universe Style" },
  { value: "noir-film", label: "Film Noir Dramatic Style" },
  { value: "paper-cut-out", label: "Paper Cut-Out Style" },
  { value: "photorealistic", label: "Photorealistic Style" },
  { value: "pixel-art", label: "Pixel Art Retro Style" },
  { value: "pixar-general", label: "Pixar General Animation Style" },
  { value: "pop-surrealism", label: "Pop Surrealism Style" },
  { value: "puppet-theater", label: "Puppet Theater Style" },
  { value: "ratatouille", label: "Ratatouille Culinary Style" },
  { value: "retro", label: "Retro Tech" },
  { value: "risograph", label: "Risograph Print Style" },
  { value: "russian-constructivism", label: "Russian Constructivism Style" },
  { value: "shrek", label: "Shrek Fairy Tale Style" },
  { value: "simpsons", label: "Simpsons-Inspired Cartoon Style" },
  { value: "sketchbook", label: "Sketchbook Doodle Style" },
  { value: "soul", label: "Soul Jazz Aesthetic Style" },
  { value: "south-park", label: "South Park Cut-Out Style" },
  { value: "stick-figure", label: "Stick Figure / Line Art Style" },
  { value: "super-mario", label: "Super Mario Style" },
  { value: "toy-story", label: "Toy Story Animation Style" },
  { value: "up", label: "Up Adventure Style" },
  { value: "vintage-1930s", label: "Vintage 1930s Cartoon Style" },
  { value: "vhs", label: "VHS Horror" },
  { value: "voxel-minecraft", label: "Voxel/Minecraft Style" },
  { value: "wall-e", label: "WALL-E Post-Apocalyptic Style" },
  { value: "watercolor", label: "Watercolor Poster" },
  { value: "whiteboard", label: "Whiteboard Animation Style" },
  { value: "woodcut", label: "Woodcut Print Style" }
];

interface StyleSelectorProps {
  value: string;
  onChange: (value: string) => void;
  customStylePrompt?: string;
  onCustomStyleChange?: (value: string) => void;
  isDisabled?: boolean;
}

const StyleSelector: React.FC<StyleSelectorProps> = ({ 
  value, 
  onChange,
  customStylePrompt = "",
  onCustomStyleChange = () => {},
  isDisabled = false 
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Get the current style label
  const currentStyleLabel = useMemo(() => {
    const style = VISUAL_STYLES.find(s => s.value === value);
    return style ? style.label : "Select a visual style";
  }, [value]);

  // Handle style change
  const handleStyleChange = (newValue: string) => {
    onChange(newValue);
    setOpen(false);
  };
  
  // Filter styles based on search query
  const filteredStyles = useMemo(() => {
    if (!searchQuery) return VISUAL_STYLES;
    
    return VISUAL_STYLES.filter(style => 
      style.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  // Click outside to close dropdown
  useEffect(() => {
    if (!open) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.style-search-container')) {
        setOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="mb-6 space-y-4">
      <div>
        <Label htmlFor="style" className="block text-foreground font-medium mb-2">
          Visual Style
        </Label>
        
        <div className="relative style-search-container">
          <Command className="border rounded-md overflow-visible bg-background">
            <div className="flex items-center px-3 border-b">
              <CommandInput 
                placeholder="Search styles..."
                className="flex-1 outline-none h-9"
                value={searchQuery}
                onValueChange={setSearchQuery}
                onFocus={() => setOpen(true)}
                disabled={isDisabled}
              />
            </div>
            
            <div 
              className={cn(
                "px-3 py-2.5 flex items-center justify-between cursor-pointer border-t",
                value ? "text-primary font-medium" : "text-muted-foreground"
              )}
              onClick={() => setOpen(!open)}
            >
              <span className="truncate flex items-center">
                {currentStyleLabel}
              </span>
              <span className={cn(
                "ml-2 h-4 w-4 shrink-0",
                open ? "rotate-180 transform transition-transform duration-200" : ""
              )}>
                {!open && "▾"}
              </span>
            </div>
            
            {open && (
              <div className="absolute w-full top-[100%] z-50 bg-background border rounded-md mt-1 overflow-hidden shadow-md">
                {filteredStyles.length === 0 ? (
                  <div className="py-6 text-center text-muted-foreground">No styles found</div>
                ) : (
                  <ScrollArea className="h-72">
                    {filteredStyles
                      .filter(style => style.value !== value) // Don't show currently selected style in dropdown
                      .map((style) => (
                        <CommandItem
                          key={style.value}
                          onSelect={() => handleStyleChange(style.value)}
                          className="cursor-pointer flex items-center justify-between px-3 py-2.5 hover:bg-accent/20"
                        >
                          <span>{style.label}</span>
                        </CommandItem>
                      ))}
                  </ScrollArea>
                )}
              </div>
            )}
          </Command>
        </div>
      </div>
    </div>
  );
};

export default StyleSelector;
