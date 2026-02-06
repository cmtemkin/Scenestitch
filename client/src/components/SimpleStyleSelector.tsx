import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface SimpleStyleSelectorProps {
  value: string;
  onChange: (value: string) => void;
  customStylePrompt?: string;
  onCustomStyleChange?: (value: string) => void;
  isDisabled?: boolean;
  useAnimatedStyles?: boolean;
}

const VISUAL_STYLES = [
  { value: "auto", label: "Auto (AI-Generated Style)" },
  { value: "photorealistic", label: "Photorealistic" },
  { value: "anime", label: "Anime Style" },
  { value: "comic", label: "Comic Book Style" },
  { value: "watercolor", label: "Watercolor Painting" },
  { value: "oil-painting", label: "Oil Painting Style" },
  { value: "minimalist", label: "Minimalist Design" },
  { value: "cyberpunk", label: "Cyberpunk Futuristic" },
  { value: "fantasy", label: "Fantasy Art" },
  { value: "sketch", label: "Hand-drawn Sketch" },
  { value: "vintage", label: "Vintage Poster" },
  { value: "custom", label: "Custom Style" },
];

export const ANIMATED_STYLES = [
  { value: "auto", label: "Auto (AI-Analyzed Animated Style)" },
  { value: "anime-music-video", label: "Anime Music Video" },
  { value: "pixar-3d", label: "Pixar/Disney 3D Animation" },
  { value: "studio-ghibli", label: "Studio Ghibli Style" },
  { value: "cel-animation", label: "Classic Cel Animation" },
  { value: "motion-graphics", label: "Motion Graphics / Abstract" },
  { value: "stylized-3d", label: "Stylized 3D Render" },
  { value: "rotoscope", label: "Rotoscope Animation" },
  { value: "lofi-aesthetic", label: "Lo-Fi Aesthetic" },
  { value: "synthwave", label: "Synthwave / Retrowave" },
  { value: "illustrated-music", label: "Illustrated Music Video" },
  { value: "paper-cutout", label: "Paper Cutout Animation" },
  { value: "neon-pop", label: "Neon Pop Art" },
  { value: "custom", label: "Custom Animated Style" },
];

export default function SimpleStyleSelector({ 
  value, 
  onChange, 
  customStylePrompt = "", 
  onCustomStyleChange,
  isDisabled = false,
  useAnimatedStyles = false
}: SimpleStyleSelectorProps) {
  const styles = useAnimatedStyles ? ANIMATED_STYLES : VISUAL_STYLES;
  
  return (
    <div className="space-y-3">
      <Select value={value} onValueChange={onChange} disabled={isDisabled}>
        <SelectTrigger data-testid="style-selector">
          <SelectValue placeholder={useAnimatedStyles ? "Choose an animated style..." : "Choose a visual style..."} />
        </SelectTrigger>
        <SelectContent>
          {styles.map((style) => (
            <SelectItem key={style.value} value={style.value} data-testid={`style-option-${style.value}`}>
              {style.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {value === 'custom' && onCustomStyleChange && (
        <div className="space-y-2">
          <Label htmlFor="customStyle">{useAnimatedStyles ? "Custom Animated Style Description" : "Custom Style Description"}</Label>
          <Textarea
            id="customStyle"
            value={customStylePrompt}
            onChange={(e) => onCustomStyleChange(e.target.value)}
            placeholder={useAnimatedStyles 
              ? "Describe your desired animated style in detail (e.g., 'Anime style with vibrant colors and dynamic motion')..."
              : "Describe your desired visual style in detail..."
            }
            disabled={isDisabled}
            className="min-h-[80px]"
            data-testid="custom-style-input"
          />
        </div>
      )}
    </div>
  );
}