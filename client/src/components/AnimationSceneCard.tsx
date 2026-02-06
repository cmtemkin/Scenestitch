import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Mic, Volume2, Video, Download, Play, Pause, 
  User, RefreshCw, Loader2, Check, X, AlertCircle
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { Scene } from "@shared/schema";

interface AnimationSceneCardProps {
  scene: Scene;
  characterVoices: Record<string, { voiceId: string; voiceName: string }>;
  isGeneratingTTS?: boolean;
  isGeneratingLipSync?: boolean;
  onGenerateTTS: (sceneId: number) => void;
  onGenerateLipSync: (sceneId: number) => void;
  onDownloadClip: (sceneId: number) => void;
  onPlayAudio: (audioUrl: string) => void;
  onPlayClip: (clipUrl: string) => void;
}

const AnimationSceneCard: React.FC<AnimationSceneCardProps> = ({
  scene,
  characterVoices,
  isGeneratingTTS = false,
  isGeneratingLipSync = false,
  onGenerateTTS,
  onGenerateLipSync,
  onDownloadClip,
  onPlayAudio,
  onPlayClip,
}) => {
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  const hasVoiceAssigned = scene.dialogueSpeaker && characterVoices[scene.dialogueSpeaker];
  const hasTTSAudio = !!scene.dialogueAudioUrl;
  const hasAnimatedClip = !!scene.animatedClipUrl;
  const hasImage = !!scene.imageUrl;

  const getStatusBadge = () => {
    if (scene.isNarrator) {
      return <Badge variant="secondary" className="bg-purple-500/20 text-purple-300 border-purple-500/30" data-testid={`badge-narrator-${scene.id}`}>Narrator</Badge>;
    }
    if (hasAnimatedClip) {
      return <Badge variant="secondary" className="bg-green-500/20 text-green-300 border-green-500/30" data-testid={`badge-animated-${scene.id}`}><Check className="w-3 h-3 mr-1" />Animated</Badge>;
    }
    if (hasTTSAudio) {
      return <Badge variant="secondary" className="bg-blue-500/20 text-blue-300 border-blue-500/30" data-testid={`badge-audio-ready-${scene.id}`}><Volume2 className="w-3 h-3 mr-1" />Audio Ready</Badge>;
    }
    if (hasVoiceAssigned) {
      return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30" data-testid={`badge-voice-assigned-${scene.id}`}><Mic className="w-3 h-3 mr-1" />Voice Set</Badge>;
    }
    return <Badge variant="secondary" className="bg-gray-500/20 text-gray-300 border-gray-500/30" data-testid={`badge-pending-${scene.id}`}>Pending Voice</Badge>;
  };

  const handlePlayAudio = () => {
    if (scene.dialogueAudioUrl) {
      setIsAudioPlaying(!isAudioPlaying);
      onPlayAudio(scene.dialogueAudioUrl);
    }
  };

  const handlePlayClip = () => {
    if (scene.animatedClipUrl) {
      setIsVideoPlaying(!isVideoPlaying);
      onPlayClip(scene.animatedClipUrl);
    }
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/30 transition-all duration-200 overflow-hidden" data-testid={`animation-scene-card-${scene.id}`}>
      <CardHeader className="p-3 border-b border-border/30 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-foreground" data-testid={`scene-number-${scene.id}`}>
            Scene {scene.sceneNumber}
          </span>
          {getStatusBadge()}
        </div>
        <div className="flex items-center gap-1">
          {scene.dialogueSpeaker && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <User className="w-3 h-3" />
                    <span data-testid={`speaker-name-${scene.id}`}>{scene.dialogueSpeaker}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Character: {scene.dialogueSpeaker}</p>
                  {hasVoiceAssigned && (
                    <p className="text-xs text-muted-foreground">
                      Voice: {characterVoices[scene.dialogueSpeaker]?.voiceName}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        {/* Image Section */}
        <div className="relative aspect-video bg-black/20 border-r border-border/30">
          {hasImage ? (
            <img 
              src={scene.imageUrl || ''} 
              alt={`Scene ${scene.sceneNumber}`}
              className="w-full h-full object-cover"
              data-testid={`scene-image-${scene.id}`}
            />
          ) : scene.isNarrator ? (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/30 to-purple-800/20">
              <div className="text-center">
                <Mic className="w-12 h-12 text-purple-400 mx-auto mb-2" />
                <span className="text-sm text-purple-300">Narrator (No Image)</span>
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-900/50 to-gray-800/30">
              <div className="text-center text-muted-foreground">
                <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                <span className="text-sm">Image pending</span>
              </div>
            </div>
          )}
          
          {/* Animated clip overlay */}
          {hasAnimatedClip && (
            <div 
              className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
              onClick={handlePlayClip}
              data-testid={`play-clip-overlay-${scene.id}`}
            >
              <Play className="w-16 h-16 text-white" />
            </div>
          )}
        </div>

        {/* Dialogue & Controls Section */}
        <CardContent className="p-3 flex flex-col gap-3">
          {/* Dialogue Text */}
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Dialogue</p>
            <p className="text-sm text-foreground leading-relaxed" data-testid={`dialogue-line-${scene.id}`}>
              "{scene.dialogueLine || scene.scriptExcerpt}"
            </p>
          </div>

          {/* Voice Assignment Status */}
          {scene.dialogueSpeaker && (
            <div className="flex items-center gap-2 py-2 px-3 rounded-md bg-black/20 border border-border/30">
              <Mic className="w-4 h-4 text-primary" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Assigned Voice</p>
                <p className="text-sm font-medium" data-testid={`assigned-voice-${scene.id}`}>
                  {hasVoiceAssigned 
                    ? characterVoices[scene.dialogueSpeaker]?.voiceName 
                    : <span className="text-yellow-400">Not assigned</span>
                  }
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {/* Generate TTS Button */}
            {!scene.isNarrator && hasVoiceAssigned && !hasTTSAudio && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onGenerateTTS(scene.id)}
                disabled={isGeneratingTTS}
                className="flex-1 min-w-[120px]"
                data-testid={`button-generate-tts-${scene.id}`}
              >
                {isGeneratingTTS ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4 mr-2" />
                    Generate Voice
                  </>
                )}
              </Button>
            )}

            {/* Play Audio Button */}
            {hasTTSAudio && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={handlePlayAudio}
                className="flex-1 min-w-[100px]"
                data-testid={`button-play-audio-${scene.id}`}
              >
                {isAudioPlaying ? (
                  <>
                    <Pause className="w-4 h-4 mr-2" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Play Audio
                  </>
                )}
              </Button>
            )}

            {/* Generate Lip-Sync Button */}
            {hasTTSAudio && hasImage && !hasAnimatedClip && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onGenerateLipSync(scene.id)}
                disabled={isGeneratingLipSync}
                className="flex-1 min-w-[120px]"
                data-testid={`button-generate-lipsync-${scene.id}`}
              >
                {isGeneratingLipSync ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Animating...
                  </>
                ) : (
                  <>
                    <Video className="w-4 h-4 mr-2" />
                    Lip-Sync
                  </>
                )}
              </Button>
            )}

            {/* Download Clip Button */}
            {hasAnimatedClip && (
              <Button 
                size="sm" 
                variant="default"
                onClick={() => onDownloadClip(scene.id)}
                className="flex-1 min-w-[100px] bg-green-600 hover:bg-green-700"
                data-testid={`button-download-clip-${scene.id}`}
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            )}
          </div>

          {/* Progress indicator for ongoing operations */}
          {(isGeneratingTTS || isGeneratingLipSync) && (
            <div className="space-y-2">
              <Progress value={undefined} className="h-1 animate-pulse" data-testid={`progress-${scene.id}`} />
              <p className="text-xs text-center text-muted-foreground animate-pulse">
                {isGeneratingTTS ? "Generating voice audio..." : "Creating lip-sync animation..."}
              </p>
            </div>
          )}
        </CardContent>
      </div>
    </Card>
  );
};

export default AnimationSceneCard;
