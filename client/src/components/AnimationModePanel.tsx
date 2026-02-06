import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Play, Pause, Film, Download, Loader2, 
  Volume2, Video, Check, AlertCircle, FileVideo, RefreshCw
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AnimationSceneCard from "./AnimationSceneCard";
import VoiceAssignmentPanel from "./VoiceAssignmentPanel";
import { Scene } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface AnimationProjectData {
  id: number;
  characterVoices?: unknown;
  finalAnimatedVideoUrl?: string | null;
}

interface AnimationModePanelProps {
  script: AnimationProjectData;
  scenes: Scene[];
  onSceneUpdate: (sceneId: number, updates: Partial<Scene>) => void;
}

const AnimationModePanel: React.FC<AnimationModePanelProps> = ({
  script,
  scenes,
  onSceneUpdate,
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("scenes");
  const [generatingTTS, setGeneratingTTS] = useState<Set<number>>(new Set());
  const [generatingLipSync, setGeneratingLipSync] = useState<Set<number>>(new Set());
  const [audioPlayer, setAudioPlayer] = useState<HTMLAudioElement | null>(null);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const characterVoices = (script.characterVoices as Record<string, { voiceId: string; voiceName: string }>) || {};
  
  const uniqueCharacters = Array.from(new Set(
    scenes
      .filter(s => s.dialogueSpeaker && !s.isNarrator)
      .map(s => s.dialogueSpeaker as string)
  ));

  const scenesWithAudio = scenes.filter(s => s.dialogueAudioUrl).length;
  const scenesWithClips = scenes.filter(s => s.animatedClipUrl).length;
  const totalDialogueScenes = scenes.filter(s => !s.isNarrator).length;
  const allVoicesAssigned = uniqueCharacters.every(char => characterVoices[char]);
  const allTTSGenerated = scenes.filter(s => !s.isNarrator).every(s => s.dialogueAudioUrl);
  const allClipsGenerated = scenes.filter(s => !s.isNarrator && s.imageUrl).every(s => s.animatedClipUrl);

  const generateTTSMutation = useMutation({
    mutationFn: async (sceneId: number) => {
      const scene = scenes.find(s => s.id === sceneId);
      if (!scene?.dialogueSpeaker || !characterVoices[scene.dialogueSpeaker]) {
        throw new Error("Voice not assigned for this character");
      }
      
      const voice = characterVoices[scene.dialogueSpeaker];
      return apiRequest('/api/elevenlabs/generate-speech', {
        method: 'POST',
        body: JSON.stringify({
          text: scene.dialogueLine || scene.scriptExcerpt,
          voiceId: voice.voiceId,
          sceneId: scene.id,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onMutate: (sceneId) => {
      setGeneratingTTS(prev => new Set(prev).add(sceneId));
    },
    onSuccess: (data: { audioUrl: string }, sceneId) => {
      onSceneUpdate(sceneId, { dialogueAudioUrl: data.audioUrl });
      queryClient.invalidateQueries({ queryKey: ['/api/scenes', script.id] });
      toast({
        title: "Voice Generated",
        description: "TTS audio created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: (_, __, sceneId) => {
      setGeneratingTTS(prev => {
        const next = new Set(prev);
        next.delete(sceneId);
        return next;
      });
    },
  });

  const generateLipSyncMutation = useMutation({
    mutationFn: async (sceneId: number) => {
      return apiRequest(`/api/scenes/${sceneId}/generate-lipsync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onMutate: (sceneId) => {
      setGeneratingLipSync(prev => new Set(prev).add(sceneId));
    },
    onSuccess: (data: { animatedClipUrl: string }, sceneId) => {
      onSceneUpdate(sceneId, { animatedClipUrl: data.animatedClipUrl });
      queryClient.invalidateQueries({ queryKey: ['/api/scenes', script.id] });
      toast({
        title: "Lip-Sync Complete",
        description: "Animated clip created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Lip-Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: (_, __, sceneId) => {
      setGeneratingLipSync(prev => {
        const next = new Set(prev);
        next.delete(sceneId);
        return next;
      });
    },
  });

  const generateAllTTSMutation = useMutation({
    mutationFn: async () => {
      const scenesNeedingTTS = scenes.filter(
        s => !s.isNarrator && !s.dialogueAudioUrl && s.dialogueSpeaker && characterVoices[s.dialogueSpeaker]
      );
      
      for (const scene of scenesNeedingTTS) {
        await generateTTSMutation.mutateAsync(scene.id);
      }
    },
    onSuccess: () => {
      toast({
        title: "All Voices Generated",
        description: "TTS audio created for all scenes",
      });
    },
  });

  const generateAllLipSyncMutation = useMutation({
    mutationFn: async () => {
      const scenesNeedingLipSync = scenes.filter(
        s => !s.isNarrator && s.dialogueAudioUrl && s.imageUrl && !s.animatedClipUrl
      );
      
      for (const scene of scenesNeedingLipSync) {
        await generateLipSyncMutation.mutateAsync(scene.id);
      }
    },
    onSuccess: () => {
      toast({
        title: "All Clips Animated",
        description: "Lip-sync complete for all scenes",
      });
    },
  });

  const assembleVideoMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/projects/${script.id}/assemble-animation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/scripts', script.id] });
      toast({
        title: "Video Assembled",
        description: "Final animation is ready for download",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Assembly Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePlayAudio = (audioUrl: string) => {
    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
    }
    const audio = new Audio(audioUrl);
    audio.play();
    setAudioPlayer(audio);
  };

  const handlePlayClip = (clipUrl: string) => {
    setCurrentVideoUrl(clipUrl);
    setVideoModalOpen(true);
  };

  const handleDownloadClip = async (sceneId: number) => {
    try {
      const response = await fetch(`/api/scenes/${sceneId}/download-clip`);
      if (!response.ok) throw new Error("Download failed");
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scene_${sceneId}_animated.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Download Started",
        description: "Clip download initiated",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Could not download clip",
        variant: "destructive",
      });
    }
  };

  const handleVoiceAssigned = (characterName: string, voiceId: string, voiceName: string) => {
    queryClient.invalidateQueries({ queryKey: ['/api/scripts', script.id] });
  };

  const getOverallProgress = () => {
    const steps = [
      { label: "Voices Assigned", done: allVoicesAssigned },
      { label: "TTS Generated", done: allTTSGenerated },
      { label: "Clips Animated", done: allClipsGenerated },
      { label: "Video Assembled", done: !!script.finalAnimatedVideoUrl },
    ];
    const completed = steps.filter(s => s.done).length;
    return { steps, completed, total: steps.length };
  };

  const progress = getOverallProgress();

  return (
    <div className="space-y-4" data-testid="animation-mode-panel">
      {/* Progress Overview */}
      <Card className="bg-gradient-to-r from-primary/10 to-purple-500/10 border border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Film className="w-5 h-5 text-primary" />
              Animation Progress
            </CardTitle>
            <Badge variant="outline" className="text-primary border-primary/30">
              {progress.completed}/{progress.total} Steps
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={(progress.completed / progress.total) * 100} className="h-2" />
          <div className="flex flex-wrap gap-2">
            {progress.steps.map((step, idx) => (
              <Badge 
                key={idx}
                variant="secondary"
                className={step.done ? "bg-green-500/20 text-green-300" : "bg-gray-500/20 text-gray-400"}
              >
                {step.done ? <Check className="w-3 h-3 mr-1" /> : null}
                {step.label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 bg-black/20">
          <TabsTrigger value="voices" className="data-[state=active]:bg-primary/20" data-testid="tab-voices">
            <Volume2 className="w-4 h-4 mr-2" />
            Voices
          </TabsTrigger>
          <TabsTrigger value="scenes" className="data-[state=active]:bg-primary/20" data-testid="tab-scenes">
            <Video className="w-4 h-4 mr-2" />
            Scenes
          </TabsTrigger>
          <TabsTrigger value="export" className="data-[state=active]:bg-primary/20" data-testid="tab-export">
            <FileVideo className="w-4 h-4 mr-2" />
            Export
          </TabsTrigger>
        </TabsList>

        {/* Voices Tab */}
        <TabsContent value="voices" className="space-y-4">
          <VoiceAssignmentPanel
            scriptId={script.id}
            characters={uniqueCharacters}
            characterVoices={characterVoices}
            onVoiceAssigned={handleVoiceAssigned}
          />
          
          {!allVoicesAssigned && uniqueCharacters.length > 0 && (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0" />
              <p className="text-sm text-yellow-300">
                Assign voices to all {uniqueCharacters.length} characters before generating audio
              </p>
            </div>
          )}
          
          {allVoicesAssigned && (
            <Button 
              onClick={() => generateAllTTSMutation.mutate()}
              disabled={generateAllTTSMutation.isPending || allTTSGenerated}
              className="w-full"
              data-testid="button-generate-all-tts"
            >
              {generateAllTTSMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating All Voices...
                </>
              ) : allTTSGenerated ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  All Voices Generated
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 mr-2" />
                  Generate All TTS ({scenesWithAudio}/{totalDialogueScenes})
                </>
              )}
            </Button>
          )}
        </TabsContent>

        {/* Scenes Tab */}
        <TabsContent value="scenes" className="space-y-4">
          {/* Show guidance based on current workflow step */}
          {!allVoicesAssigned && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center gap-3">
              <Volume2 className="w-5 h-5 text-blue-400 shrink-0" />
              <p className="text-sm text-blue-300">
                Step 1: Go to the Voices tab to assign voices to each character
              </p>
            </div>
          )}
          
          {allVoicesAssigned && !allTTSGenerated && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center gap-3">
              <Volume2 className="w-5 h-5 text-blue-400 shrink-0" />
              <p className="text-sm text-blue-300">
                Step 2: Generate TTS audio for each scene using the buttons below, or use "Generate All TTS" in the Voices tab
              </p>
            </div>
          )}
          
          {allTTSGenerated && !allClipsGenerated && (
            <Button 
              onClick={() => generateAllLipSyncMutation.mutate()}
              disabled={generateAllLipSyncMutation.isPending}
              className="w-full mb-4"
              data-testid="button-generate-all-lipsync"
            >
              {generateAllLipSyncMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Animating All Clips...
                </>
              ) : (
                <>
                  <Video className="w-4 h-4 mr-2" />
                  Generate All Lip-Sync ({scenesWithClips}/{totalDialogueScenes})
                </>
              )}
            </Button>
          )}
          
          <div className="space-y-3">
            {scenes.map((scene) => (
              <AnimationSceneCard
                key={scene.id}
                scene={scene}
                characterVoices={characterVoices}
                isGeneratingTTS={generatingTTS.has(scene.id)}
                isGeneratingLipSync={generatingLipSync.has(scene.id)}
                onGenerateTTS={(id) => generateTTSMutation.mutate(id)}
                onGenerateLipSync={(id) => generateLipSyncMutation.mutate(id)}
                onDownloadClip={handleDownloadClip}
                onPlayAudio={handlePlayAudio}
                onPlayClip={handlePlayClip}
              />
            ))}
          </div>
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="space-y-4">
          <Card className="bg-card/50 backdrop-blur-sm border border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileVideo className="w-5 h-5 text-primary" />
                Final Video Assembly
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!allClipsGenerated ? (
                <div className="text-center py-6">
                  <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    Generate all animated clips before assembling the final video
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {scenesWithClips}/{totalDialogueScenes} clips ready
                  </p>
                </div>
              ) : script.finalAnimatedVideoUrl ? (
                <div className="text-center py-4">
                  <Check className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="text-green-400 font-medium mb-4">Video Ready!</p>
                  <div className="flex gap-3 justify-center">
                    <Button 
                      onClick={() => {
                        setCurrentVideoUrl(script.finalAnimatedVideoUrl!);
                        setVideoModalOpen(true);
                      }}
                      data-testid="button-preview-final"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Preview
                    </Button>
                    <Button 
                      variant="default"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => window.open(`/api/projects/${script.id}/download-animation`, '_blank')}
                      data-testid="button-download-final"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <Button 
                    onClick={() => assembleVideoMutation.mutate()}
                    disabled={assembleVideoMutation.isPending}
                    size="lg"
                    className="bg-gradient-to-r from-primary to-purple-600 hover:from-primary/80 hover:to-purple-700"
                    data-testid="button-assemble-video"
                  >
                    {assembleVideoMutation.isPending ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Assembling Video...
                      </>
                    ) : (
                      <>
                        <Film className="w-5 h-5 mr-2" />
                        Assemble Final Video
                      </>
                    )}
                  </Button>
                  <p className="text-sm text-muted-foreground mt-3">
                    This will stitch all {scenesWithClips} animated clips into a single video
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Video Player Modal */}
      <Dialog open={videoModalOpen} onOpenChange={setVideoModalOpen}>
        <DialogContent className="max-w-4xl bg-black/95 border-border/50">
          <DialogHeader>
            <DialogTitle className="text-white">Video Preview</DialogTitle>
          </DialogHeader>
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            {currentVideoUrl && (
              <video 
                ref={videoRef}
                src={currentVideoUrl}
                controls
                autoPlay
                className="w-full h-full"
                data-testid="video-player"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AnimationModePanel;
