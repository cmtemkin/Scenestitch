import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Volume2, Play, Pause, Clock, HardDrive, Loader2 } from "lucide-react";
import type { AudioTTS } from "@shared/schema";

interface AudioSelectorProps {
  selectedAudioId: number | null;
  onSelect: (audioId: number | null) => void;
  onApplyAudio?: (audioData: { title: string; script: string; audioUrl: string; duration: number }) => void;
  onAudioApplied?: () => void;
  disabled?: boolean;
}

export function AudioSelector({ selectedAudioId, onSelect, onApplyAudio, onAudioApplied, disabled = false }: AudioSelectorProps) {
  const [playingAudio, setPlayingAudio] = useState<{ id: number; audio: HTMLAudioElement } | null>(null);

  // Fetch completed audio items
  const { data: audioItems = [], isLoading } = useQuery<AudioTTS[]>({
    queryKey: ["/api/audio"],
    select: (data) => data.filter(audio => audio.status === "completed" && audio.audioUrl),
  });

  const handlePlayAudio = (audio: AudioTTS) => {
    if (!audio.audioUrl) return;

    // Stop currently playing audio
    if (playingAudio) {
      playingAudio.audio.pause();
      playingAudio.audio.currentTime = 0;
      if (playingAudio.id === audio.id) {
        setPlayingAudio(null);
        return;
      }
    }

    // Play new audio
    const audioElement = new Audio(audio.audioUrl);
    audioElement.play();
    audioElement.onended = () => setPlayingAudio(null);
    setPlayingAudio({ id: audio.id, audio: audioElement });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "Unknown";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "Unknown";
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading audio files...
        </CardContent>
      </Card>
    );
  }

  if (audioItems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Select Audio File
          </CardTitle>
          <CardDescription>
            Choose an existing audio file to use for this project
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <div className="text-gray-400 mb-2">
              <Volume2 className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No audio files available</h3>
            <p className="text-gray-500 mb-4">Create some audio files first in the Audio tab</p>
            <Button variant="outline" onClick={() => window.open('/audio', '_blank')}>
              Go to Audio Tab
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          Select Audio File
        </CardTitle>
        <CardDescription>
          Choose an existing audio file to use for this project. The script content and title will be automatically populated.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={selectedAudioId?.toString() || ""}
          onValueChange={(value) => onSelect(value ? parseInt(value) : null)}
          disabled={disabled}
          className="space-y-3"
        >
          {audioItems.map((audio) => (
            <div key={audio.id} className="relative">
              <RadioGroupItem
                value={audio.id.toString()}
                id={`audio-${audio.id}`}
                className="peer sr-only"
                disabled={disabled}
              />
              <Label
                htmlFor={`audio-${audio.id}`}
                className="flex flex-col h-full"
              >
                <Card className={`cursor-pointer border-2 transition-all peer-aria-checked:border-primary peer-aria-checked:bg-primary/5 hover:bg-accent/50 ${
                  selectedAudioId === audio.id ? 'border-primary bg-primary/5' : ''
                }`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">{audio.title}</h3>
                          <Badge variant="secondary">
                            {audio.voice}
                          </Badge>
                        </div>
                        
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                          {audio.content}
                        </p>
                        
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDuration(audio.duration)}
                          </span>
                          <span className="flex items-center gap-1">
                            <HardDrive className="h-3 w-3" />
                            {formatFileSize(audio.fileSize)}
                          </span>
                          <span>Model: {audio.model}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            handlePlayAudio(audio);
                          }}
                          disabled={disabled}
                        >
                          {playingAudio?.id === audio.id ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Label>
            </div>
          ))}
        </RadioGroup>
        
        {selectedAudioId && onApplyAudio && (
          <div className="mt-6 pt-4 border-t">
            <Button
              onClick={() => {
                const selectedAudio = audioItems.find(audio => audio.id === selectedAudioId);
                if (selectedAudio && selectedAudio.audioUrl) {
                  onApplyAudio?.({
                    title: selectedAudio.title,
                    script: selectedAudio.content,
                    audioUrl: selectedAudio.audioUrl,
                    duration: selectedAudio.duration || 0
                  });
                  onAudioApplied?.();
                }
              }}
              disabled={disabled}
              className="w-full"
              size="lg"
            >
              Apply Selected Audio to Project
            </Button>
            <p className="text-sm text-muted-foreground mt-2 text-center">
              This will populate the project title, script content, and audio file automatically
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}