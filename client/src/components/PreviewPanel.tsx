import React, { useState } from "react";
import SceneCard from "./SceneCard";
import SceneCardSkeleton from "./SceneCardSkeleton";
import ThumbnailPreview from "./ThumbnailPreview";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Grid, List, FlagTriangleRight, Image as ImageIcon } from "lucide-react";
import { Scene } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ThumbnailConfig } from "./ThumbnailConfigModal";

interface PreviewPanelProps {
  scenes: Scene[];
  onUpdateScene: (id: number, updates: Partial<Scene>) => void;
  onRegenerateScene: (id: number) => void;
  onGenerateImage?: (id: number) => void;
  onEditImage?: (id: number) => void;
  onRegenerateSoraPrompt?: (id: number) => void;
  onGenerateVideo?: (id: number) => void;
  isLoading?: boolean;
  // Thumbnail props
  thumbnailUrl?: string | null;
  projectTitle?: string;
  currentStyle?: string;
  onGenerateThumbnail?: (config?: ThumbnailConfig) => void;
  isGeneratingThumbnail?: boolean;
  // Tab state props
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

const PreviewPanel: React.FC<PreviewPanelProps> = ({
  scenes,
  onUpdateScene,
  onRegenerateScene,
  onGenerateImage,
  onEditImage,
  onRegenerateSoraPrompt,
  onGenerateVideo,
  isLoading = false,
  thumbnailUrl,
  projectTitle = "",
  currentStyle = "",
  onGenerateThumbnail,
  isGeneratingThumbnail = false,
  activeTab: externalActiveTab,
  onTabChange,
}) => {
  // Use all available scenes since progressive loading is handled by useScenes hook
  const scenesToShow = scenes;
  
  // Debug logging for production
  console.log(`PreviewPanel: Received ${scenes.length} scenes`);
  console.log(`PreviewPanel: scenesToShow length: ${scenesToShow.length}`);
  console.log(`PreviewPanel: isLoading: ${isLoading}`);
  console.log(`PreviewPanel: First scene sample:`, scenes[0]);
  
  // Debug image data in first scene
  if (scenes.length > 0 && scenes[0]) {
    const firstScene = scenes[0] as any;
    console.log(`PreviewPanel: First scene image debug:`, {
      id: firstScene.id,
      hasImageUrl: !!firstScene.imageUrl,
      imageUrlType: typeof firstScene.imageUrl,
      imageUrlLength: firstScene.imageUrl?.length,
      isCompressed: firstScene.isCompressed,
      isDataUrl: firstScene.imageUrl?.startsWith?.('data:')
    });
  }
  const { toast } = useToast();
  const [viewType, setViewType] = useState<'grid' | 'list' | 'timeline'>('grid');
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [activeTab, setActiveTab] = useState<string>(externalActiveTab || "storyboard");
  
  // Update internal tab state when external state changes
  React.useEffect(() => {
    if (externalActiveTab) {
      setActiveTab(externalActiveTab);
    }
  }, [externalActiveTab]);
  
  // Handle tab change and notify parent
  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab);
    if (onTabChange) {
      onTabChange(newTab);
    }
  };
  
  const handleEdit = (id: number) => {
    const scene = scenes.find(s => s.id === id);
    if (scene) {
      setEditingScene(scene);
    }
  };
  
  const handleSaveEdit = () => {
    if (editingScene && editingScene.id) {
      onUpdateScene(editingScene.id, {
        title: editingScene.title,
        dallePrompt: editingScene.dallePrompt,
        scriptExcerpt: editingScene.scriptExcerpt,
        overlayText: editingScene.overlayText,
        exactStartTime: editingScene.exactStartTime,
        exactEndTime: editingScene.exactEndTime,
      });
      
      toast({
        title: "Prompt Updated",
        description: "Your changes will be used for future image generations."
      });
      
      setEditingScene(null);
    }
  };
  
  const handleRegenerate = (id: number) => {
    onRegenerateScene(id);
  };
  
  const handleTogglePin = (id: number, pinned: boolean) => {
    onUpdateScene(id, { isPinned: pinned });
    
    // Toast notification for better user feedback
    toast({
      title: pinned ? "Prompt Locked" : "Prompt Unlocked",
      description: pinned 
        ? "This prompt will be preserved during regenerations" 
        : "This prompt will be replaced during regenerations"
    });
  };
  
  const handleGenerateImage = (id: number) => {
    if (onGenerateImage) {
      onGenerateImage(id);
    }
  };
  
  const handleEditImage = (id: number) => {
    if (onEditImage) {
      onEditImage(id);
    }
  };
  
  const handleRegenerateSoraPrompt = (id: number) => {
    if (onRegenerateSoraPrompt) {
      onRegenerateSoraPrompt(id);
    }
  };
  
  const handleGenerateVideo = (id: number) => {
    if (onGenerateVideo) {
      onGenerateVideo(id);
    }
  };
  
  const getViewClasses = () => {
    switch (viewType) {
      case 'list':
        return 'grid grid-cols-1 gap-6';
      case 'timeline':
        return 'grid grid-cols-1 gap-6';
      case 'grid':
      default:
        return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5 lg:gap-6';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-52px)]">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col">
        <div className="bg-secondary border-b border-border p-4 flex justify-between items-center flex-shrink-0 sticky top-0 z-10">
          <TabsList className="h-10 w-auto min-w-fit">
            <TabsTrigger value="storyboard" className="text-sm px-4 py-2 flex items-center gap-2">
              <Grid className="h-4 w-4" />
              <span>Storyboard</span>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{scenes.length}</span>
            </TabsTrigger>
            <TabsTrigger value="thumbnail" className="text-sm px-4 py-2 flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              <span>Thumbnail</span>
            </TabsTrigger>
          </TabsList>
          
          {activeTab === "storyboard" && (
            <div className="flex items-center space-x-1">
              <Button
                variant={viewType === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewType('grid')}
                title="Grid View"
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewType === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewType('list')}
                title="List View"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewType === 'timeline' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewType('timeline')}
                title="Timeline View"
              >
                <FlagTriangleRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="storyboard" className="flex-1 overflow-y-auto p-6 bg-background storyboard-container ios-scroll mobile-scroll-container mt-0" style={{WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain'}}>
          <div className={getViewClasses()}>
            {isLoading ? (
              // Display skeleton cards when loading
              Array.from({ length: 8 }).map((_, index) => (
                <SceneCardSkeleton key={`skeleton-${index}`} />
              ))
            ) : (
              // Display progressively loaded scenes
              scenesToShow.map((scene) => (
                <SceneCard
                  key={scene.id || scene.sceneNumber}
                  id={scene.id || scene.sceneNumber}
                  sceneNumber={scene.sceneNumber || 0}
                  title={scene.title || `Scene ${scene.sceneNumber}`}
                  scriptExcerpt={scene.scriptExcerpt || ''}
                  dallePrompt={scene.dallePrompt || ''}
                  soraPrompt={scene.soraPrompt?.toString() || undefined}
                  imageUrl={scene.imageUrl || undefined}
                  videoUrl={scene.videoUrl || undefined}
                  isCompressed={!!(scene as any).isCompressed}
                  estimatedDuration={typeof scene.estimatedDuration === 'number' ? scene.estimatedDuration : undefined}
                  exactStartTime={typeof scene.exactStartTime === 'number' ? scene.exactStartTime : undefined}
                  exactEndTime={typeof scene.exactEndTime === 'number' ? scene.exactEndTime : undefined}
                  isPinned={!!scene.isPinned}
                  isGeneratingImage={!!(scene as any).isGeneratingImage}
                  isGeneratingSoraPrompt={!!(scene as any).isGeneratingSoraPrompt}
                  isGeneratingVideo={!!(scene as any).isGeneratingVideo}
                  overlayText={scene.overlayText?.toString() || undefined}
                  onEdit={handleEdit}
                  onRegenerate={handleRegenerate}
                  onTogglePin={handleTogglePin}
                  onGenerateImage={onGenerateImage ? handleGenerateImage : undefined}
                  onEditImage={onEditImage ? handleEditImage : undefined}
                  onRegenerateSoraPrompt={onRegenerateSoraPrompt ? handleRegenerateSoraPrompt : undefined}
                  onGenerateVideo={onGenerateVideo ? handleGenerateVideo : undefined}
                />
              ))
            )}
          </div>
          

        </TabsContent>

        <TabsContent value="thumbnail" className="flex-1 overflow-y-auto p-6 bg-background mt-0">
          <div className="max-w-4xl mx-auto">
            {onGenerateThumbnail && (
              <ThumbnailPreview
                thumbnailUrl={thumbnailUrl || null}
                projectTitle={projectTitle}
                currentStyle={currentStyle}
                onRegenerate={(config?: ThumbnailConfig) => {
                  // Convert the interface to match the expected type
                  onGenerateThumbnail(config);
                }}
                isGenerating={isGeneratingThumbnail}
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Edit Dialog */}
      <Dialog open={!!editingScene} onOpenChange={(open) => !open && setEditingScene(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Scene {editingScene?.sceneNumber}</DialogTitle>
          </DialogHeader>
          
          {editingScene && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="scene-title">Scene Title</Label>
                <Input
                  id="scene-title"
                  value={editingScene.title || ''}
                  onChange={(e) => setEditingScene({...editingScene, title: e.target.value})}
                />
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-1">
                  <Label htmlFor="scene-excerpt">Original Script Text</Label>
                  <span className="text-xs text-muted-foreground">Should contain the exact text from the script</span>
                </div>
                <Textarea
                  id="scene-excerpt"
                  value={editingScene.scriptExcerpt || ''}
                  onChange={(e) => setEditingScene({...editingScene, scriptExcerpt: e.target.value})}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This should be the original script text, not a description of the image.
                </p>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-1">
                  <Label htmlFor="scene-prompt">DALL·E Prompt</Label>
                  <span className="text-xs text-muted-foreground">Edits will be used for future image generations</span>
                </div>
                <Textarea
                  id="scene-prompt"
                  value={editingScene.dallePrompt || ''}
                  onChange={(e) => setEditingScene({...editingScene, dallePrompt: e.target.value})}
                  rows={6}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Edit the prompt to customize the image generation. Changes will be saved and used when you generate a new image.
                </p>
              </div>
              
              <div>
                <Label htmlFor="scene-overlay">Overlay Text</Label>
                <Input
                  id="scene-overlay"
                  value={editingScene.overlayText || ''}
                  onChange={(e) => setEditingScene({...editingScene, overlayText: e.target.value})}
                  placeholder="Text to display over the image"
                />
                <p className="text-xs text-muted-foreground mt-1">This text will be overlaid on the image when exported</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="scene-start-time">Start Time (ms)</Label>
                  <Input
                    id="scene-start-time"
                    type="number"
                    value={editingScene.exactStartTime ?? ''}
                    onChange={(e) => {
                      let value: number | null = null;
                      if (e.target.value) {
                        value = parseInt(e.target.value);
                      }
                      setEditingScene({...editingScene, exactStartTime: value});
                    }}
                    placeholder="0"
                  />
                </div>
                
                <div>
                  <Label htmlFor="scene-end-time">End Time (ms)</Label>
                  <Input
                    id="scene-end-time"
                    type="number"
                    value={editingScene.exactEndTime ?? ''}
                    onChange={(e) => {
                      let value: number | null = null;
                      if (e.target.value) {
                        value = parseInt(e.target.value);
                      }
                      setEditingScene({...editingScene, exactEndTime: value});
                    }}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingScene(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PreviewPanel;
