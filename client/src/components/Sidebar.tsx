import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ScriptInput from "./ScriptInput";
import StyleSelector from "./StyleSelector";
import ContinuityToggle from "./ContinuityToggle";
import ReferenceImageUpload from "./ReferenceImageUpload";
import ActionButtons from "./ActionButtons";
import { ProjectConfigPanel } from "./ProjectConfigPanel";
import ProjectTypeSelector from "./ProjectTypeSelector";
import { AudioSelector } from "./AudioSelector";
import CharactersPanel from "./CharactersPanel";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { PlusCircle, Sparkles, Film, FileText, Layout, Volume2, Users } from "lucide-react";

interface SidebarProps {
  projectId?: number;
  script: string;
  style: string;
  customStylePrompt?: string;
  maintainContinuity: boolean;
  isManualMode?: boolean;
  projectType?: string;
  selectedAudioId?: number | null;
  isNewProject?: boolean;
  hasExistingAudioProcessing?: boolean;
  scenes?: any[];
  onScriptChange: (value: string) => void;
  onStyleChange: (value: string) => void;
  onCustomStyleChange?: (value: string) => void;
  onContinuityChange: (value: boolean) => void;
  onReferenceImageChange: (imageUrl: string) => void;
  onManualModeChange?: (value: boolean) => void;
  onAddManualScene?: () => void;
  onProjectTypeChange?: (value: string) => void;
  onAudioSelect?: (audioId: number | null) => void;
  onApplyAudio?: (audioData: { title: string; script: string; audioUrl: string; duration: number }) => void;
  onGenerateScenePrompts: () => void;
  onGenerateImages: () => void;
  onGenerateSoraPrompts: () => void;
  onGenerateSoraVideos?: () => void;
  onGenerateThumbnail: (config?: any) => void;
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
}

const Sidebar: React.FC<SidebarProps> = ({
  projectId,
  hasExistingAudioProcessing = false,
  scenes = [],
  script,
  style,
  customStylePrompt = "",
  maintainContinuity,
  isManualMode = false,
  projectType = "video",
  selectedAudioId = null,
  isNewProject = false,
  onScriptChange,
  onStyleChange,
  onCustomStyleChange = () => {},
  onContinuityChange,
  onReferenceImageChange,
  onManualModeChange = () => {},
  onAddManualScene = () => {},
  onProjectTypeChange = () => {},
  onAudioSelect = () => {},
  onApplyAudio = () => {},
  onGenerateScenePrompts,
  onGenerateImages,
  onGenerateSoraPrompts,
  onGenerateSoraVideos,
  onGenerateThumbnail,
  onExportAssets,
  onAudioUploaded,
  onForceRegenerateImages = () => {},
  disablePrompts = false,
  disableImages = true,
  disableSora = true,
  disableSoraVideos = true,
  disableThumbnail = true,
  disableExport = true,
  isProcessing = false,
  hasAudio = false,
}) => {
  const [audioApplied, setAudioApplied] = useState(false);

  // Check if audio has been applied for this project type and persist the state
  useEffect(() => {
    if (projectType === "audio-driven") {
      const audioAppliedKey = `audioApplied_${projectId || 'new'}`;
      const savedAudioApplied = localStorage.getItem(audioAppliedKey) === 'true';
      
      // If we have a script and it's audio-driven, or if project has existing audio processing, audio has been applied
      const hasScriptContent = script && script.trim().length > 0;
      
      if (savedAudioApplied || hasScriptContent || hasExistingAudioProcessing) {
        setAudioApplied(true);
      }
    } else {
      // Reset audio applied state for non-audio-driven projects
      setAudioApplied(false);
    }
  }, [projectType, projectId, script, hasExistingAudioProcessing]);

  // Save audio applied state when it changes
  const handleAudioApplied = () => {
    setAudioApplied(true);
    const audioAppliedKey = `audioApplied_${projectId || 'new'}`;
    localStorage.setItem(audioAppliedKey, 'true');
  };
  return (
    <div className="w-full lg:w-80 bg-secondary border-r border-border flex flex-col h-full min-h-0 overflow-hidden">
      <Tabs defaultValue="editor" className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
        <TabsList className="grid grid-cols-4 border-b border-border rounded-none shrink-0">
          <TabsTrigger value="editor">Script</TabsTrigger>
          <TabsTrigger value="settings">Style</TabsTrigger>
          <TabsTrigger value="characters" className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            <span className="hidden sm:inline">Cast</span>
          </TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
        </TabsList>
        
        <TabsContent 
          value="editor" 
          className="flex-1 overflow-y-auto p-4 space-y-6 min-h-0"
          style={{ 
            maxHeight: 'calc(100vh - 8rem)', 
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            paddingBottom: '8rem' // Extra space for mobile audio panel
          }}
        >
          <div className="space-y-6">
            {/* Project Type Selector - Only show for new projects and hide for audio-driven after audio is applied */}
            {isNewProject && !projectId && !(projectType === "audio-driven" && audioApplied) && (
              <ProjectTypeSelector
                value={projectType as any}
                onChange={onProjectTypeChange as any}
                disabled={isProcessing}
              />
            )}

            {/* Audio Selector for Audio-Driven Projects - Hide after audio is applied or for existing projects with audio processing */}
            {projectType === "audio-driven" && !audioApplied && !hasExistingAudioProcessing && (
              <AudioSelector
                selectedAudioId={selectedAudioId}
                onSelect={onAudioSelect}
                onApplyAudio={onApplyAudio}
                onAudioApplied={handleAudioApplied}
                disabled={isProcessing}
              />
            )}

            {/* Project Type Badge for existing projects */}
            {!isNewProject && projectId && (
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-md border">
                <div className="flex items-center gap-2">
                  {projectType === 'video' && <Film className="h-4 w-4 text-primary" />}
                  {projectType === 'blog' && <FileText className="h-4 w-4 text-primary" />}
                  {projectType === 'presentation' && <Layout className="h-4 w-4 text-primary" />}
                  {projectType === 'audio-driven' && <Volume2 className="h-4 w-4 text-primary" />}
                  <span className="text-sm font-medium capitalize">
                    {projectType === 'audio-driven' ? 'Audio-Driven' : projectType} Project
                  </span>
                </div>
              </div>
            )}

            {/* Manual/Auto mode toggle - Show for all projects except audio-driven before audio is applied */}
            {!(projectType === "audio-driven" && !audioApplied) && (
              <div className="flex items-center justify-between space-x-2 bg-background/50 p-3 rounded-md border border-border">
                <div className="space-y-0.5">
                  <Label className="text-base">Creation Mode</Label>
                  <p className="text-xs text-muted-foreground">
                    {isManualMode 
                      ? "Manual: Add scenes individually" 
                      : "Auto: Parse entire script into scenes"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className={`h-4 w-4 ${!isManualMode ? "text-primary" : "text-muted-foreground"}`} />
                  <Switch 
                    checked={isManualMode}
                    onCheckedChange={onManualModeChange}
                    disabled={isProcessing}
                  />
                  <PlusCircle className={`h-4 w-4 ${isManualMode ? "text-primary" : "text-muted-foreground"}`} />
                </div>
              </div>
            )}

            {/* Script Input and Manual Mode - Show for all projects except audio-driven before audio is applied */}
            {!(projectType === "audio-driven" && !audioApplied) && (
              isManualMode ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base">Manual Scene Creation</Label>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={onAddManualScene}
                      disabled={isProcessing}
                    >
                      <PlusCircle className="h-4 w-4 mr-2" /> Add Scene
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    In manual mode, create scenes one by one. Each scene can have individual text, which is useful for presentation slides and blog sections.
                  </p>
                </div>
              ) : (
                <ScriptInput 
                  value={script} 
                  onChange={onScriptChange} 
                  isDisabled={isProcessing}
                />
              )
            )}
            
            <ActionButtons 
              projectId={projectId}
              onGenerateScenePrompts={onGenerateScenePrompts}
              onGenerateImages={onGenerateImages}
              onGenerateSoraPrompts={onGenerateSoraPrompts}
              onGenerateSoraVideos={onGenerateSoraVideos}
              onGenerateThumbnail={onGenerateThumbnail}
              onExportAssets={onExportAssets}
              onAudioUploaded={onAudioUploaded}
              onForceRegenerateImages={onForceRegenerateImages}
              disablePrompts={disablePrompts}
              disableImages={disableImages}
              disableSora={disableSora}
              disableSoraVideos={disableSoraVideos}
              disableThumbnail={disableThumbnail}
              disableExport={disableExport}
              isProcessing={isProcessing}
              hasAudio={hasAudio}
              projectType={projectType}
              selectedAudioData={selectedAudioId ? { audioUrl: '', title: '', duration: 0 } : null}
              projectTitle={script.split('\n')[0] || 'Untitled Project'}
              currentStyle={style}
              scenes={scenes}
            />
          </div>
        </TabsContent>
        
        <TabsContent value="settings" className="p-4 flex-1 overflow-y-auto space-y-6 min-h-0"
          style={{ 
            maxHeight: 'calc(100vh - 8rem)', 
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            paddingBottom: '8rem'
          }}
        >
          <div className="space-y-6">
            <StyleSelector 
              value={style} 
              onChange={onStyleChange}
              customStylePrompt={customStylePrompt}
              onCustomStyleChange={onCustomStyleChange}
              isDisabled={isProcessing}
            />
            
            <ContinuityToggle 
              value={maintainContinuity} 
              onChange={onContinuityChange} 
              isDisabled={isProcessing}
            />
            
            <ReferenceImageUpload 
              onImageUploaded={onReferenceImageChange} 
              isDisabled={isProcessing}
            />
          </div>
        </TabsContent>
        
        <TabsContent value="models" className="p-4 flex-1 overflow-y-auto space-y-6 min-h-0"
          style={{ 
            maxHeight: 'calc(100vh - 8rem)', 
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            paddingBottom: '8rem'
          }}
        >
          {projectId ? (
            <ProjectConfigPanel projectId={projectId} />
          ) : (
            <div className="text-center p-4">
              <p className="text-muted-foreground">
                Please save the project first to enable project-specific model settings.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="characters" className="p-4 flex-1 overflow-y-auto space-y-6 min-h-0"
          style={{ 
            maxHeight: 'calc(100vh - 8rem)', 
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            paddingBottom: '8rem'
          }}
        >
          <CharactersPanel 
            scriptId={projectId || null} 
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Sidebar;
