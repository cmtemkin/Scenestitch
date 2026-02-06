import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic, Check, AlertCircle, Loader2, Volume2, User } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Voice {
  voice_id: string;
  name: string;
  labels?: {
    accent?: string;
    age?: string;
    gender?: string;
    description?: string;
  };
  preview_url?: string;
}

interface VoiceAssignment {
  voiceId: string;
  voiceName: string;
}

interface VoiceAssignmentPanelProps {
  scriptId: number;
  characters: string[];
  characterVoices: Record<string, VoiceAssignment>;
  onVoiceAssigned: (characterName: string, voiceId: string, voiceName: string) => void;
}

const VoiceAssignmentPanel: React.FC<VoiceAssignmentPanelProps> = ({
  scriptId,
  characters,
  characterVoices,
  onVoiceAssigned,
}) => {
  const { toast } = useToast();
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  const { data: voicesData, isLoading: isLoadingVoices, error: voicesError } = useQuery<{ voices: Voice[] }>({
    queryKey: ['/api/elevenlabs/voices'],
  });

  const { data: statusData } = useQuery<{ configured: boolean }>({
    queryKey: ['/api/elevenlabs/status'],
  });

  const assignVoiceMutation = useMutation({
    mutationFn: async ({ characterName, voiceId, voiceName }: { characterName: string; voiceId: string; voiceName: string }) => {
      return apiRequest(`/api/projects/${scriptId}/assign-voice`, {
        method: 'POST',
        body: JSON.stringify({ characterName, voiceId, voiceName }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (_, variables) => {
      onVoiceAssigned(variables.characterName, variables.voiceId, variables.voiceName);
      queryClient.invalidateQueries({ queryKey: ['/api/scripts', scriptId] });
      toast({
        title: "Voice Assigned",
        description: `${variables.voiceName} assigned to ${variables.characterName}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Assignment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleVoiceChange = (characterName: string, voiceId: string) => {
    const voice = voicesData?.voices.find(v => v.voice_id === voiceId);
    if (voice) {
      assignVoiceMutation.mutate({ 
        characterName, 
        voiceId, 
        voiceName: voice.name 
      });
    }
  };

  const handlePreviewVoice = (voice: Voice) => {
    if (previewAudio) {
      previewAudio.pause();
      previewAudio.currentTime = 0;
    }

    if (playingVoiceId === voice.voice_id) {
      setPlayingVoiceId(null);
      return;
    }

    if (voice.preview_url) {
      const audio = new Audio(voice.preview_url);
      audio.onended = () => setPlayingVoiceId(null);
      audio.play();
      setPreviewAudio(audio);
      setPlayingVoiceId(voice.voice_id);
    }
  };

  useEffect(() => {
    return () => {
      if (previewAudio) {
        previewAudio.pause();
      }
    };
  }, [previewAudio]);

  const isConfigured = statusData?.configured;
  const voices = voicesData?.voices || [];
  const allAssigned = characters.every(char => characterVoices[char]);

  if (!isConfigured) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border border-yellow-500/30" data-testid="voice-panel-not-configured">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            ElevenLabs Not Configured
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            To use voice generation, please add your ElevenLabs API key to the environment variables.
          </p>
          <code className="text-xs bg-black/30 px-2 py-1 rounded">ELEVENLABS_API_KEY</code>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 backdrop-blur-sm border border-border/50" data-testid="voice-assignment-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mic className="w-5 h-5 text-primary" />
            Voice Assignment
          </CardTitle>
          {allAssigned && (
            <Badge variant="secondary" className="bg-green-500/20 text-green-300 border-green-500/30">
              <Check className="w-3 h-3 mr-1" />
              All Set
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Assign ElevenLabs voices to each character
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoadingVoices ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Loading voices...</span>
          </div>
        ) : voicesError ? (
          <div className="text-center py-4 text-red-400">
            <AlertCircle className="w-6 h-6 mx-auto mb-2" />
            <p className="text-sm">Failed to load voices</p>
          </div>
        ) : (
          characters.map((character) => (
            <div 
              key={character}
              className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/30"
              data-testid={`voice-assignment-row-${character}`}
            >
              <div className="flex items-center gap-2 min-w-[120px]">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium text-sm truncate" data-testid={`character-name-${character}`}>
                  {character}
                </span>
              </div>

              <Select
                value={characterVoices[character]?.voiceId || ""}
                onValueChange={(value) => handleVoiceChange(character, value)}
                disabled={assignVoiceMutation.isPending}
              >
                <SelectTrigger className="flex-1 bg-black/20" data-testid={`voice-select-${character}`}>
                  <SelectValue placeholder="Select voice..." />
                </SelectTrigger>
                <SelectContent>
                  {voices.map((voice) => (
                    <SelectItem 
                      key={voice.voice_id} 
                      value={voice.voice_id}
                      data-testid={`voice-option-${voice.voice_id}`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{voice.name}</span>
                        {voice.labels?.gender && (
                          <span className="text-xs text-muted-foreground">
                            ({voice.labels.gender})
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {characterVoices[character] && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const voice = voices.find(v => v.voice_id === characterVoices[character].voiceId);
                    if (voice) handlePreviewVoice(voice);
                  }}
                  className="shrink-0"
                  data-testid={`preview-voice-${character}`}
                >
                  <Volume2 className={`w-4 h-4 ${playingVoiceId === characterVoices[character]?.voiceId ? 'text-primary animate-pulse' : ''}`} />
                </Button>
              )}

              {characterVoices[character] && (
                <Check className="w-4 h-4 text-green-500 shrink-0" />
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default VoiceAssignmentPanel;
