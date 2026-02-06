import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Download, ExternalLink, Settings, Sliders } from "lucide-react";
import ThumbnailConfigModal, { ThumbnailConfig } from "./ThumbnailConfigModal";

interface ThumbnailPreviewProps {
  thumbnailUrl: string | null;
  projectTitle: string;
  currentStyle: string;
  onRegenerate: (config?: ThumbnailConfig) => void;
  isGenerating: boolean;
}

const ThumbnailPreview: React.FC<ThumbnailPreviewProps> = ({
  thumbnailUrl,
  projectTitle,
  currentStyle,
  onRegenerate,
  isGenerating
}) => {
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState("auto");
  const [selectedQuality, setSelectedQuality] = useState("auto");

  const handleDownload = () => {
    if (!thumbnailUrl) return;
    
    // Create a temporary link and trigger download
    const a = document.createElement("a");
    a.href = thumbnailUrl;
    a.download = `${projectTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-thumbnail.jpg`;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenInNewTab = () => {
    if (!thumbnailUrl) return;
    window.open(thumbnailUrl, '_blank');
  };

  const handleCustomRegenerate = (config: ThumbnailConfig) => {
    setIsConfigModalOpen(false);
    // Include size and quality settings in the config
    onRegenerate({
      ...config,
      imageSize: selectedSize,
      imageQuality: selectedQuality
    });
  };

  const handleQuickRegenerate = () => {
    // Include size and quality settings for quick regeneration
    onRegenerate({
      style: currentStyle,
      customText: "",
      textPlacement: "overlay",
      emphasizeText: true,
      imageSize: selectedSize,
      imageQuality: selectedQuality
    });
  };

  if (!thumbnailUrl && !isGenerating) {
    return null;
  }

  return (
    <>
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">YouTube Thumbnail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Image Quality & Size Controls */}
          <div className="flex flex-col sm:flex-row gap-4 p-4 bg-muted/30 rounded-lg">
            <div className="flex-1">
              <Label htmlFor="image-size" className="text-xs font-medium text-muted-foreground mb-1 block">
                Image Size
              </Label>
              <Select value={selectedSize} onValueChange={setSelectedSize}>
                <SelectTrigger id="image-size" className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (Default)</SelectItem>
                  <SelectItem value="1024x1024">1024×1024 (Square)</SelectItem>
                  <SelectItem value="1024x1536">1024×1536 (Portrait)</SelectItem>
                  <SelectItem value="1536x1024">1536×1024 (Landscape)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex-1">
              <Label htmlFor="image-quality" className="text-xs font-medium text-muted-foreground mb-1 block">
                Image Quality
              </Label>
              <Select value={selectedQuality} onValueChange={setSelectedQuality}>
                <SelectTrigger id="image-quality" className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (Default)</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleQuickRegenerate}
                disabled={isGenerating}
                className="h-8"
              >
                <Sliders className="w-3 h-3 mr-1" />
                Apply
              </Button>
            </div>
          </div>
          
          {isGenerating ? (
            <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                <p className="text-sm text-muted-foreground">Generating thumbnail...</p>
              </div>
            </div>
          ) : thumbnailUrl ? (
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              <img
                src={thumbnailUrl}
                alt="YouTube Thumbnail"
                className="w-full h-full object-cover"
                onError={(e) => {
                  console.error("Error loading thumbnail image:", e);
                }}
              />
            </div>
          ) : null}
          
          {thumbnailUrl && (
            <p className="text-xs text-muted-foreground">
              High-resolution YouTube thumbnail optimized for maximum click-through rate
            </p>
          )}

          {/* Mobile-optimized button layout */}
          <div className="flex flex-col sm:flex-row gap-2">
            {thumbnailUrl && (
              <div className="flex gap-2 flex-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenInNewTab}
                  className="flex-1 sm:flex-none"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  className="flex-1 sm:flex-none"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleQuickRegenerate}
                disabled={isGenerating}
                className="flex-1 sm:flex-none"
              >
                {isGenerating ? "Generating..." : "Regenerate"}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsConfigModalOpen(true)}
                disabled={isGenerating}
                className="flex-1 sm:flex-none"
              >
                <Settings className="h-4 w-4 mr-2" />
                Customize
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ThumbnailConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        onGenerate={handleCustomRegenerate}
        projectTitle={projectTitle}
        currentStyle={currentStyle}
        isGenerating={isGenerating}
      />
    </>
  );
};

export default ThumbnailPreview;