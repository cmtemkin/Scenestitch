import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { 
  MoreVertical, Edit, RefreshCw, Pin, PinOff, 
  ChevronDown, ChevronUp, Image, Clock, Pencil,
  ChevronRight, Sparkles, Video, Play
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ImageViewerModal from "./ImageViewerModal";
import PromptEditorModal from "./PromptEditorModal";
import VideoPlayerModal from "./VideoPlayerModal";

interface SceneCardProps {
  id?: number;
  sceneNumber: number;
  title: string;
  scriptExcerpt: string;
  dallePrompt: string;
  soraPrompt?: string;
  imageUrl?: string;
  videoUrl?: string;
  isCompressed?: boolean;
  estimatedDuration?: number;
  isPinned?: boolean;
  isGeneratingImage?: boolean;
  isGeneratingSoraPrompt?: boolean;
  isGeneratingVideo?: boolean;
  overlayText?: string;
  exactStartTime?: number;
  exactEndTime?: number;
  onEdit: (id: number) => void;
  onRegenerate: (id: number) => void;
  onTogglePin: (id: number, pinned: boolean) => void;
  onGenerateImage?: (id: number) => void;
  onEditImage?: (id: number) => void; // Prop for editing an image
  onRegenerateSoraPrompt?: (id: number) => void; // Prop for regenerating Sora prompt
  onGenerateVideo?: (id: number) => void; // Prop for generating Sora video
}

// Helper function to format time in MM:SS.X format with just one decimal place for iMovie compatibility
const formatTime = (milliseconds: number): string => {
  if (!milliseconds && milliseconds !== 0) return 'N/A';
  
  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  // Only keep one decimal place
  const tenthOfSecond = Math.floor((totalSeconds % 1) * 10);
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${tenthOfSecond}`;
};

const SceneCard: React.FC<SceneCardProps> = ({
  id = 0,
  sceneNumber,
  title,
  scriptExcerpt,
  dallePrompt,
  soraPrompt,
  imageUrl,
  videoUrl,
  isCompressed = false,
  estimatedDuration,
  isPinned = false,
  isGeneratingImage: externalGeneratingState,
  isGeneratingSoraPrompt: externalSoraGeneratingState,
  isGeneratingVideo: externalVideoGeneratingState,
  overlayText,
  exactStartTime,
  exactEndTime,
  onEdit,
  onRegenerate,
  onTogglePin,
  onGenerateImage,
  onEditImage,
  onRegenerateSoraPrompt,
  onGenerateVideo,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localGeneratingState, setLocalGeneratingState] = useState(false);
  const [localSoraGeneratingState, setLocalSoraGeneratingState] = useState(false);
  const [localVideoGeneratingState, setLocalVideoGeneratingState] = useState(false);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [isPromptEditorOpen, setIsPromptEditorOpen] = useState(false);
  const [isVideoPlayerOpen, setIsVideoPlayerOpen] = useState(false);
  
  // Use external state if provided, otherwise use local state
  const isGeneratingImage = externalGeneratingState !== undefined ? externalGeneratingState : localGeneratingState;
  const isGeneratingSoraPrompt = externalSoraGeneratingState !== undefined ? externalSoraGeneratingState : localSoraGeneratingState;
  const isGeneratingVideo = externalVideoGeneratingState !== undefined ? externalVideoGeneratingState : localVideoGeneratingState;
  
  // Handle different image sources
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(null);
  // Add cache-busting for storage URLs to prevent stale cached responses
  const baseDisplayUrl = resolvedImageUrl || imageUrl;
  const displayImageUrl = baseDisplayUrl?.startsWith('/storage/') 
    ? `${baseDisplayUrl}?v=2` 
    : baseDisplayUrl;
  const fullImageUrl = isCompressed ? `/api/scene-image/${id}` : imageUrl;

  // Load image from endpoint if imageUrl is an API path
  useEffect(() => {
    if (imageUrl && imageUrl.startsWith('/api/scene-image/')) {
      fetch(imageUrl)
        .then(response => response.json())
        .then(data => {
          if (data.imageUrl) {
            setResolvedImageUrl(data.imageUrl);
          }
        })
        .catch(error => {
          console.error(`Failed to load image from ${imageUrl}:`, error);
          setResolvedImageUrl(null);
        });
    } else if (imageUrl) {
      setResolvedImageUrl(imageUrl);
    } else {
      setResolvedImageUrl(null);
    }
  }, [imageUrl]);
  
  // Debug logging for image data
  if (imageUrl && sceneNumber === 1) {
    console.log(`Scene ${sceneNumber} image debug:`, {
      hasImageUrl: !!imageUrl,
      isCompressed,
      imageUrlLength: imageUrl?.length,
      isDataUrl: imageUrl?.startsWith('data:'),
      isApiEndpoint: imageUrl?.startsWith('/api/'),
      resolvedImageUrl: resolvedImageUrl?.substring(0, 50) + '...',
      displayImageUrl: displayImageUrl?.substring(0, 50) + '...'
    });
  }
  
  return (
    <Card className="bg-card hover:border-neutral-muted transition-colors shadow-lg overflow-hidden h-full flex flex-col">
      <CardHeader className="p-3 sm:p-4 border-b space-y-0">
        <div className="flex flex-col space-y-2">
          <div className="flex flex-wrap justify-between items-start sm:items-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-primary text-primary-foreground text-xs font-medium rounded-full w-6 h-6 flex items-center justify-center shrink-0">
                {sceneNumber}
              </span>
              <span className="text-foreground font-medium break-words">{title}</span>
              
              {/* Timestamp badge */}
              {(exactStartTime !== undefined || exactEndTime !== undefined) && (
                <span className="bg-muted px-1.5 py-0.5 rounded text-xs text-muted-foreground hidden sm:inline-block">
                  {exactStartTime !== undefined ? formatTime(exactStartTime) : "--:--"} 
                  {" - "} 
                  {exactEndTime !== undefined ? formatTime(exactEndTime) : "--:--"}
                </span>
              )}
              
              {/* Sora badge */}
              {soraPrompt && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m22 8-6 4 6 4V8Z"/>
                    <rect x="2" y="6" width="14" height="12" rx="2"/>
                  </svg>
                  <span className="hidden sm:inline">Video prompt</span>
                </span>
              )}
              
              {/* Video ready badge - clickable to play */}
              {videoUrl && (
                <button
                  onClick={() => setIsVideoPlayerOpen(true)}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-600 dark:text-green-400 gap-1 hover:bg-green-500/30 transition-colors cursor-pointer"
                  data-testid={`video-badge-scene-${sceneNumber}`}
                >
                  <Play className="w-3 h-3" fill="currentColor" />
                  <span className="hidden sm:inline">Video ready</span>
                </button>
              )}
            </div>
            
            <div className="flex flex-wrap space-x-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => onEdit(id)}
                    >
                      <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Edit</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => onRegenerate(id)}
                    >
                      <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Regenerate Prompt</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              {onGenerateImage && dallePrompt && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          if (externalGeneratingState === undefined) {
                            setLocalGeneratingState(true);
                            // Reset loading state after 20 seconds (fallback in case of errors)
                            setTimeout(() => setLocalGeneratingState(false), 20000);
                          }
                          onGenerateImage(id);
                        }}
                        disabled={isGeneratingImage}
                      >
                        {isGeneratingImage ? (
                          <span className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        ) : (
                          <Image className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isGeneratingImage ? "Generating..." : "Generate Image"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground"
                  >
                    <MoreVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setIsPromptEditorOpen(true)} data-testid="edit-prompt-ai-button">
                    <Sparkles className="mr-2 h-4 w-4" />
                    <span>Edit Prompt with AI</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(id)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    <span>Edit Scene</span>
                  </DropdownMenuItem>
                  {imageUrl && onEditImage && (
                    <DropdownMenuItem onClick={() => onEditImage(id)}>
                      <Edit className="mr-2 h-4 w-4" />
                      <span>Edit Image</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onTogglePin(id, !isPinned)}>
                    {isPinned ? (
                      <>
                        <PinOff className="mr-2 h-4 w-4" />
                        <span>Unpin Prompt</span>
                      </>
                    ) : (
                      <>
                        <Pin className="mr-2 h-4 w-4" />
                        <span>Pin Prompt</span>
                      </>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </CardHeader>
      
      {/* Scene-specific timestamps & first line */}
      <div className="px-4 py-2 bg-muted/40 border-b text-sm flex flex-col gap-1">
        {exactStartTime !== undefined && exactStartTime !== null && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Time:</span>
            </span>
            <span className="font-mono text-xs bg-accent/50 px-1.5 py-0.5 rounded">
              {formatTime(exactStartTime)}
            </span>
          </div>
        )}
        
        {/* Removed duplicate script excerpt to show only in card content */}
      </div>
      
      {displayImageUrl ? (
        <div className="w-full h-36 sm:h-48 overflow-hidden border-b border-border relative">
          <img 
            src={displayImageUrl}
            alt={title} 
            className="w-full h-full object-cover cursor-pointer"
            loading="lazy"
            onError={(e) => {
              console.error(`Image failed to load for scene ${sceneNumber}:`, {
                isCompressed,
                imageUrlLength: displayImageUrl?.length,
                isDataUrl: displayImageUrl?.startsWith('data:')
              });
            }}
            onLoad={() => {
              if (sceneNumber === 1) {
                console.log(`Image loaded successfully for scene ${sceneNumber}`);
              }
            }}
            onClick={() => setIsImageViewerOpen(true)}
          />
          
          {/* Image viewer modal */}
          {fullImageUrl && (
            <ImageViewerModal
              isOpen={isImageViewerOpen}
              onClose={() => setIsImageViewerOpen(false)}
              imageUrl={fullImageUrl}
              title={title}
            />
          )}
          
          {/* Video player modal */}
          {videoUrl && (
            <VideoPlayerModal
              isOpen={isVideoPlayerOpen}
              onClose={() => setIsVideoPlayerOpen(false)}
              videoUrl={videoUrl}
              title={title}
              sceneNumber={sceneNumber}
            />
          )}
          
          {/* Video play overlay - shown when video exists */}
          {videoUrl && !isGeneratingVideo && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsVideoPlayerOpen(true);
              }}
              className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/50 transition-colors cursor-pointer group"
              data-testid={`play-video-scene-${sceneNumber}`}
            >
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-green-500/90 backdrop-blur-sm flex items-center justify-center group-hover:bg-green-500 transition-colors shadow-lg">
                <Play className="w-7 h-7 sm:w-8 sm:h-8 text-white ml-1" fill="white" />
              </div>
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white text-xs font-medium bg-black/60 px-2 py-1 rounded-full">
                Click to play video
              </span>
            </button>
          )}
          
          {/* Image controls */}
          <div className="absolute top-2 right-2 flex gap-1">
            {onGenerateVideo && imageUrl && soraPrompt && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      className={`h-7 w-7 sm:h-8 sm:w-8 ${videoUrl ? 'bg-green-500/80 hover:bg-green-500 text-white' : 'bg-primary/80 hover:bg-primary text-primary-foreground'}`}
                      onClick={() => {
                        if (externalVideoGeneratingState === undefined) {
                          setLocalVideoGeneratingState(true);
                          setTimeout(() => setLocalVideoGeneratingState(false), 120000);
                        }
                        onGenerateVideo(id);
                      }}
                      disabled={isGeneratingVideo}
                      data-testid={`generate-video-scene-${sceneNumber}`}
                    >
                      {isGeneratingVideo ? (
                        <span className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <Video className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isGeneratingVideo ? "Generating video..." : videoUrl ? "Regenerate Video" : "Generate Sora Video"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {onEditImage && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-7 w-7 sm:h-8 sm:w-8 bg-background/80 hover:bg-background"
                      onClick={() => onEditImage(id)}
                    >
                      <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Edit Image</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          
          {overlayText && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-2 text-xs sm:text-sm">
              <p className="text-center">{overlayText}</p>
            </div>
          )}
        </div>
      ) : isGeneratingImage ? (
        <div className="w-full h-36 sm:h-48 flex flex-col items-center justify-center gap-2 bg-muted border-b border-border">
          <div className="w-6 h-6 sm:w-8 sm:h-8 animate-spin rounded-full border-3 sm:border-4 border-primary border-t-transparent"></div>
          <span className="text-muted-foreground text-xs sm:text-sm">Generating image...</span>
        </div>
      ) : (
        <div className="w-full h-36 sm:h-48 flex items-center justify-center bg-muted border-b border-border">
          <span className="text-muted-foreground text-xs sm:text-sm">No image generated</span>
        </div>
      )}
      
      <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3 flex-1 overflow-y-auto">
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded} className="h-full flex flex-col">
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1">SCRIPT ORIGINAL TEXT</h4>
            <p className="text-xs sm:text-sm text-foreground line-clamp-3">{scriptExcerpt}</p>
          </div>
          
          <Collapsible className="mt-2 sm:mt-3">
            <div className="flex items-center justify-between">
              <CollapsibleTrigger className="flex items-center w-full justify-between">
                <h4 className="text-xs font-medium text-muted-foreground mb-1 flex items-center">
                  <span className="mr-1.5 p-0.5 bg-muted/80 rounded hidden sm:inline-block">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="9" cy="9" r="2"/>
                      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                    </svg>
                  </span>
                  IMAGE PROMPT <ChevronRight className="h-3 w-3 ml-1 transition-transform duration-200 ui-expanded:rotate-90" />
                </h4>
                {isPinned && (
                  <span className="text-xs text-primary-foreground bg-primary px-1.5 py-0.5 rounded-full flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <polyline points="19 12 12 19 5 12"></polyline>
                    </svg>
                    Edited
                  </span>
                )}
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <p className="text-xs sm:text-sm font-mono text-foreground bg-muted p-1.5 sm:p-2 rounded-md line-clamp-3 border border-muted hover:line-clamp-none transition-all duration-300">{dallePrompt}</p>
            </CollapsibleContent>
          </Collapsible>
          
          {soraPrompt && (
            <Collapsible className="mt-2 sm:mt-3">
              <div className="flex items-center justify-between">
                <CollapsibleTrigger className="flex items-center w-full justify-between">
                  <h4 className="text-xs font-medium text-primary mb-1 flex items-center">
                    <span className="mr-1.5 p-0.5 bg-primary/10 rounded">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                        <path d="m22 8-6 4 6 4V8Z"/>
                        <rect x="2" y="6" width="14" height="12" rx="2"/>
                      </svg>
                    </span>
                    IMAGE-TO-VIDEO PROMPT <ChevronRight className="h-3 w-3 ml-1 transition-transform duration-200 ui-expanded:rotate-90" />
                  </h4>
                  <div className="flex items-center gap-1.5">
                    {onRegenerateSoraPrompt && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-primary hover:text-primary hover:bg-primary/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (externalSoraGeneratingState === undefined) {
                                  setLocalSoraGeneratingState(true);
                                  setTimeout(() => setLocalSoraGeneratingState(false), 20000);
                                }
                                onRegenerateSoraPrompt(id);
                              }}
                              disabled={isGeneratingSoraPrompt}
                            >
                              {isGeneratingSoraPrompt ? (
                                <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {isGeneratingSoraPrompt ? "Regenerating..." : "Regenerate video prompt"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                      Sora
                    </span>
                  </div>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <div className="relative">
                  <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-primary/30 rounded-full"></div>
                  <div className="pl-3 border-l-2 border-primary/20">
                    <p className="text-xs sm:text-sm font-mono text-foreground bg-primary/5 p-1.5 sm:p-2 rounded-md border border-primary/10">{soraPrompt}</p>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
          
          {(overlayText || exactStartTime !== undefined || exactEndTime !== undefined) && (
            <div className="mt-2 sm:mt-3">
              <h4 className="text-xs font-medium text-muted-foreground mb-1">VIDEO DETAILS</h4>
              <div className="space-y-1 sm:space-y-2 px-2">
                {overlayText && (
                  <div className="flex items-center">
                    <span className="text-xs font-medium w-20 sm:w-24">Overlay:</span>
                    <span className="text-xs sm:text-sm text-foreground truncate">{overlayText}</span>
                  </div>
                )}
                {exactStartTime !== undefined && (
                  <div className="flex items-center">
                    <span className="text-xs font-medium w-20 sm:w-24">Start:</span>
                    <span className="text-xs sm:text-sm text-foreground">{formatTime(exactStartTime)}</span>
                  </div>
                )}
                {exactEndTime !== undefined && (
                  <div className="flex items-center">
                    <span className="text-xs font-medium w-20 sm:w-24">End:</span>
                    <span className="text-xs sm:text-sm text-foreground">{formatTime(exactEndTime)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="pt-2 mt-auto flex items-center justify-between text-xs text-muted-foreground">
            <span>Duration: {estimatedDuration || 'N/A'}s</span>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CollapsibleTrigger asChild>
                    <Button 
                      variant={soraPrompt ? "outline" : "ghost"} 
                      size="sm" 
                      className={`h-7 transition-all ${soraPrompt ? "border-primary text-primary hover:bg-primary/10" : ""} ${isExpanded ? "bg-muted" : ""}`}
                    >
                      <span className={`mr-1 ${!soraPrompt && "sr-only"}`}>
                        {isExpanded ? "Hide details" : "Show more"}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {isExpanded ? "Hide additional details" : 
                   soraPrompt ? "View image-to-video prompt" : "View additional details"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </Collapsible>
      </CardContent>
      
      {/* Prompt Editor Modal */}
      <PromptEditorModal
        isOpen={isPromptEditorOpen}
        onClose={() => setIsPromptEditorOpen(false)}
        sceneId={id}
        currentPrompt={soraPrompt || dallePrompt}
        promptType={soraPrompt ? "sora" : "dalle"}
      />
    </Card>
  );
};

export default SceneCard;
