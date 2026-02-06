import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { LucideImageDown, LucideVideo, Download, Wand2, Image, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { EarlyAudioUpload } from "./EarlyAudioUpload";
import ThumbnailConfigModal, { ThumbnailConfig } from "./ThumbnailConfigModal";

interface ActionButtonsProps {
  projectId?: number;
  onGenerateScenePrompts: () => void;
  onGenerateImages: () => void;
  onGenerateSoraPrompts: () => void;
  onGenerateSoraVideos?: () => void;
  onGenerateThumbnail: (config?: ThumbnailConfig) => void;
  onExportAssets: () => void;
  onAudioUploaded?: (audioInfo: { duration: number; url: string }) => void;
  onForceRegenerateImages?: () => void;
  disablePrompts?: boolean;
  disableImages?: boolean;
  disableSora?: boolean;
  disableSoraVideos?: boolean;
  disableThumbnail?: boolean;
  disableExport?: boolean;
  isProcessing?: boolean;
  hasAudio?: boolean;
  projectType?: string;
  selectedAudioData?: any;
  projectTitle?: string;
  currentStyle?: string;
  scenes?: any[];
}

const ActionButtons: React.FC<ActionButtonsProps> = ({
  projectId,
  onGenerateScenePrompts,
  onGenerateImages,
  onGenerateSoraPrompts,
  onGenerateSoraVideos,
  onGenerateThumbnail,
  onExportAssets,
  onAudioUploaded,
  onForceRegenerateImages,
  disablePrompts = false,
  disableImages = true,
  disableSora = true,
  disableSoraVideos = true,
  disableThumbnail = true,
  disableExport = true,
  isProcessing = false,
  hasAudio = false,
  projectType = "video",
  selectedAudioData = null,
  projectTitle = "",
  currentStyle = "cinematic",
  scenes = [],
}) => {
  const [showThumbnailConfig, setShowThumbnailConfig] = useState(false);
  // Determine which button should be highlighted based on the workflow state
  const isPromptActive = !disablePrompts;
  const isImagesActive = !disableImages;
  const isSoraActive = !disableSora;
  const isSoraVideosActive = !disableSoraVideos;
  const isThumbnailActive = !disableThumbnail;
  const isExportActive = !disableExport;

  return (
    <>
    <div className="space-y-3">
      {/* Early Audio Upload - Optional step before scene generation */}
      <EarlyAudioUpload
        projectId={projectId}
        onAudioUploaded={onAudioUploaded}
        hasAudio={hasAudio}
        disabled={isProcessing}
      />

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isPromptActive ? "default" : "outline"}
              className={cn(
                "w-full transition-all duration-200", 
                isPromptActive 
                  ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                  : "text-muted-foreground hover:text-foreground opacity-80 border-dashed"
              )}
              onClick={onGenerateScenePrompts}
              disabled={disablePrompts || isProcessing}
            >
              <Wand2 className="mr-2 h-4 w-4" />
              <span>Generate Scene Prompts</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            {disablePrompts 
              ? <p className="text-muted-foreground">You need to add a script before generating scene prompts. <span className="text-primary font-medium">Write or paste a script in the text area.</span></p>
              : <p>Analyzes your script to create scene divisions and AI-optimized prompts for image generation.</p>
            }
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isImagesActive ? "default" : "outline"}
              className={cn(
                "w-full transition-all duration-200", 
                isImagesActive 
                  ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                  : "text-muted-foreground hover:text-foreground opacity-80 border-dashed"
              )}
              onClick={onGenerateImages}
              disabled={disableImages || isProcessing}
            >
              <LucideImageDown className="mr-2 h-4 w-4" />
              <span>Generate Images</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            {disableImages 
              ? <p className="text-muted-foreground">You need to generate scene prompts first. <span className="text-primary font-medium">Click the "Generate Scene Prompts" button above to proceed.</span></p>
              : <p>Creates images based on your scene prompts. Required before generating image-to-video prompts.</p>
            }
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Force Regenerate Images - Show when scenes have corrupted/failed states */}
      {onForceRegenerateImages && scenes && scenes.length > 0 && (
        (() => {
          const corruptedScenes = scenes.filter(scene => 
            !scene.dallePrompt || 
            scene.dallePrompt === 'Temporary prompt' ||
            scene.dallePrompt.length < 50 ||
            scene.imageUrl === 'generating' ||
            scene.imageUrl === 'placeholder' ||
            scene.imageUrl === 'failed'
          );
          
          if (corruptedScenes.length > 0) {
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="destructive"
                      className="w-full transition-all duration-200"
                      onClick={onForceRegenerateImages}
                      disabled={isProcessing}
                    >
                      <Image className="mr-2 h-4 w-4" />
                      <span>Fix Failed Images ({corruptedScenes.length})</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p>Detected {corruptedScenes.length} scenes with corrupted or failed image generation. This will regenerate all problematic images automatically.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          }
          return null;
        })()
      )}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isSoraActive ? "default" : "outline"}
              className={cn(
                "w-full transition-all duration-200", 
                isSoraActive 
                  ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                  : "text-muted-foreground hover:text-foreground opacity-80 border-dashed"
              )}
              onClick={onGenerateSoraPrompts}
              disabled={disableSora || isProcessing}
            >
              <LucideVideo className="mr-2 h-4 w-4" />
              <span>Generate Video Prompts</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            {disableSora 
              ? <p className="text-muted-foreground">You need to generate images first. <span className="text-primary font-medium">Click the "Generate Images" button above to create images before generating video prompts.</span></p>
              : <p>Creates prompts for Sora AI to animate your static images into videos. Each prompt is optimized for image-to-video conversion.</p>
            }
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {onGenerateSoraVideos && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isSoraVideosActive ? "default" : "outline"}
                className={cn(
                  "w-full transition-all duration-200", 
                  isSoraVideosActive 
                    ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700" 
                    : "text-muted-foreground hover:text-foreground opacity-80 border-dashed"
                )}
                onClick={onGenerateSoraVideos}
                disabled={disableSoraVideos || isProcessing}
                data-testid="button-generate-sora-videos"
              >
                <Play className="mr-2 h-4 w-4" />
                <span>Generate Sora Videos</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">
              {disableSoraVideos 
                ? <p className="text-muted-foreground">You need to generate video prompts first. <span className="text-primary font-medium">Click the "Generate Video Prompts" button above to create prompts for Sora.</span></p>
                : <p>Uses OpenAI's Sora AI to generate videos from your scene images. Videos are generated in the background - you can close this page and check back later.</p>
              }
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isThumbnailActive ? "default" : "outline"}
              className={cn(
                "w-full transition-all duration-200", 
                isThumbnailActive 
                  ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                  : "text-muted-foreground hover:text-foreground opacity-80 border-dashed"
              )}
              onClick={() => setShowThumbnailConfig(true)}
              disabled={disableThumbnail || isProcessing}
            >
              <Image className="mr-2 h-4 w-4" />
              <span>Generate Thumbnail</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            {disableThumbnail 
              ? <p className="text-muted-foreground">You need to generate scene prompts first. <span className="text-primary font-medium">Click the "Generate Scene Prompts" button to create a thumbnail.</span></p>
              : <p>Creates a high-resolution, compelling thumbnail in the same visual style as your content using the script and title.</p>
            }
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isExportActive ? "default" : "outline"}
              className={cn(
                "w-full transition-all duration-200", 
                isExportActive 
                  ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                  : "text-muted-foreground hover:text-foreground opacity-80 border-dashed"
              )}
              onClick={onExportAssets}
              disabled={disableExport || isProcessing}
            >
              <Download className="mr-2 h-4 w-4" />
              <span>Export Assets</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            {disableExport 
              ? <p className="text-muted-foreground">You need to generate at least scene prompts before exporting. <span className="text-primary font-medium">Complete the first step by generating scene prompts.</span></p>
              : <p>Downloads a ZIP file with all generated assets including images, scene prompts, and precise timing files for video editing.</p>
            }
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <ThumbnailConfigModal
      isOpen={showThumbnailConfig}
      onClose={() => setShowThumbnailConfig(false)}
      onGenerate={(config) => {
        setShowThumbnailConfig(false);
        onGenerateThumbnail(config);
      }}
      projectTitle={projectTitle}
      currentStyle={currentStyle}
      isGenerating={isProcessing}
    />
    </>
  );
};

export default ActionButtons;
