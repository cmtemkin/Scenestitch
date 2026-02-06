import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Play, Pause, Download, Plus, Mic, Volume2, ArrowRight, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AudioTTS } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";

const AudioPage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newAudio, setNewAudio] = useState({
    title: "",
    content: "",
    voice: "alloy" as const,
    model: "gpt-4o-mini-tts" as const,
    speed: 1.0
  });

  const { data: audioList = [], isLoading } = useQuery<AudioTTS[]>({
    queryKey: ["/api/audio"],
  });

  const createMutation = useMutation({
    mutationFn: async (audioData: typeof newAudio) => {
      return apiRequest("/api/audio/generate", {
        method: "POST",
        body: JSON.stringify(audioData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/audio"] });
      setNewAudio({
        title: "",
        content: "",
        voice: "alloy",
        model: "gpt-4o-mini-tts",
        speed: 1.0
      });
      toast({
        title: "Success",
        description: "Audio generated successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate audio",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/audio/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/audio"] });
      toast({
        title: "Success",
        description: "Audio deleted successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete audio",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAudio.title.trim() || !newAudio.content.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(newAudio);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <div className="mobile-container max-w-7xl mx-auto">
        {/* Hero Section with Audio-First Workflow */}
        <div className="text-center mb-8 md:mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-primary to-yellow-400 rounded-xl flex items-center justify-center shadow-lg">
              <Mic className="h-5 w-5 md:h-6 md:w-6 text-black" />
            </div>
            <h1 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
              Audio Studio
            </h1>
          </div>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto px-4">
            Transform your ideas into voice with AI-powered text-to-speech technology. 
            Start your creative journey here, then build stunning video projects.
          </p>
        </div>

        {/* Workflow Progress Indicator */}
        <div className="glass-card p-4 md:p-6 mb-6 md:mb-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-0">
            <div className="workflow-step completed flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                <Mic className="h-4 w-4 text-black" />
              </div>
              <span className="font-medium text-sm md:text-base">1. Create Audio</span>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground hidden sm:block" />
            <Link href="/projects">
              <div className="workflow-step flex items-center gap-2 md:gap-3 cursor-pointer hover:text-primary transition-colors">
                <div className="w-8 h-8 border-2 border-muted-foreground rounded-full flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-4 w-4" />
                </div>
                <span className="font-medium text-sm md:text-base">2. Build Video Project</span>
              </div>
            </Link>
          </div>
        </div>

        {/* Create New Audio Form */}
        <Card className="glass-card mb-6 md:mb-8">
          <CardHeader className="pb-4 px-4 md:px-6">
            <CardTitle className="flex items-center gap-2 md:gap-3 text-lg md:text-xl">
              <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-primary to-yellow-400 rounded-lg flex items-center justify-center flex-shrink-0">
                <Plus className="h-4 w-4 md:h-5 md:w-5 text-black" />
              </div>
              <span className="truncate">Generate New Audio</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 md:px-6">
            <form onSubmit={handleSubmit} className="mobile-form-spacing">
              <div className="responsive-grid">
                <div className="space-y-2 md:space-y-3">
                  <Label htmlFor="title" className="text-sm font-semibold">Title</Label>
                  <Input
                    id="title"
                    value={newAudio.title}
                    onChange={(e) => setNewAudio({ ...newAudio, title: e.target.value })}
                    placeholder="Enter a descriptive title..."
                    className="glass-card border-border/50 min-h-[44px]"
                    required
                  />
                </div>
                
                <div className="space-y-2 md:space-y-3">
                  <Label htmlFor="voice" className="text-sm font-semibold">Voice Character</Label>
                  <Select
                    value={newAudio.voice}
                    onValueChange={(value) => setNewAudio({ ...newAudio, voice: value as any })}
                  >
                    <SelectTrigger className="glass-card border-border/50 min-h-[44px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-card">
                      <SelectItem value="alloy">Alloy - Balanced & Clear</SelectItem>
                      <SelectItem value="echo">Echo - Deep & Resonant</SelectItem>
                      <SelectItem value="fable">Fable - Warm & Expressive</SelectItem>
                      <SelectItem value="onyx">Onyx - Strong & Confident</SelectItem>
                      <SelectItem value="nova">Nova - Crisp & Modern</SelectItem>
                      <SelectItem value="shimmer">Shimmer - Bright & Energetic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="responsive-grid">
                <div className="space-y-2 md:space-y-3">
                  <Label htmlFor="model" className="text-sm font-semibold">AI Model</Label>
                  <Select
                    value={newAudio.model}
                    onValueChange={(value) => setNewAudio({ ...newAudio, model: value as any })}
                  >
                    <SelectTrigger className="glass-card border-border/50 min-h-[44px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-card">
                      <SelectItem value="gpt-4o-mini-tts">GPT-4o Mini TTS (Latest)</SelectItem>
                      <SelectItem value="tts-1">TTS-1 (Standard)</SelectItem>
                      <SelectItem value="tts-1-hd">TTS-1-HD (High Quality)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2 md:space-y-3">
                  <Label htmlFor="speed" className="text-sm font-semibold">Speed ({newAudio.speed}x)</Label>
                  <Input
                    id="speed"
                    type="number"
                    min="0.25"
                    max="4.0"
                    step="0.25"
                    value={newAudio.speed}
                    onChange={(e) => setNewAudio({ ...newAudio, speed: parseFloat(e.target.value) })}
                    className="glass-card border-border/50 min-h-[44px]"
                  />
                </div>
              </div>

              <div className="space-y-2 md:space-y-3">
                <Label htmlFor="content" className="text-sm font-semibold">Script Content</Label>
                <Textarea
                  id="content"
                  value={newAudio.content}
                  onChange={(e) => setNewAudio({ ...newAudio, content: e.target.value })}
                  placeholder="Enter your script or text content to convert to speech..."
                  rows={6}
                  className="glass-card border-border/50 resize-none min-h-[120px]"
                  required
                />
                <div className="flex justify-between items-center text-xs md:text-sm text-muted-foreground px-1">
                  <span>Maximum 4096 characters</span>
                  <span className={newAudio.content.length > 4000 ? "text-yellow-500" : ""}>
                    {newAudio.content.length}/4096
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="btn-primary btn-mobile-full md:w-auto md:px-8 md:py-3"
                >
                  {createMutation.isPending ? (
                    <>
                      <Volume2 className="mr-2 h-4 w-4 animate-pulse" />
                      Generating Audio...
                    </>
                  ) : (
                    <>
                      <Mic className="mr-2 h-4 w-4" />
                      Generate Audio
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Audio Library Section */}
        <div className="space-y-4 md:space-y-6">
          <div className="flex items-center gap-2 md:gap-3 px-1">
            <div className="w-7 h-7 md:w-8 md:h-8 bg-gradient-to-br from-primary to-yellow-400 rounded-lg flex items-center justify-center flex-shrink-0">
              <Volume2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-black" />
            </div>
            <h2 className="text-xl md:text-2xl font-bold truncate">Your Audio Library</h2>
          </div>
          
          {isLoading ? (
            <div className="responsive-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="glass-card animate-pulse">
                  <CardHeader className="px-4 md:px-6">
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                  </CardHeader>
                  <CardContent className="px-4 md:px-6">
                    <div className="space-y-2">
                      <div className="h-3 bg-muted rounded"></div>
                      <div className="h-3 bg-muted rounded w-2/3"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : audioList.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="p-8 md:p-12 text-center">
                <div className="w-12 h-12 md:w-16 md:h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mic className="h-6 w-6 md:h-8 md:w-8 text-muted-foreground" />
                </div>
                <h3 className="text-base md:text-lg font-medium mb-2">No audio files yet</h3>
                <p className="text-sm md:text-base text-muted-foreground px-4">
                  Create your first audio file using the form above to get started with your video projects.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="responsive-grid">
              {audioList.map((audio: AudioTTS) => (
                <Card key={audio.id} className="scene-card">
                  <CardHeader className="px-4 md:px-6 pb-3">
                    <CardTitle className="text-base md:text-lg leading-tight break-words hyphens-auto" 
                               style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                      {audio.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 md:px-6">
                    <div className="space-y-3 md:space-y-4">
                      <div className="text-xs md:text-sm text-muted-foreground space-y-1">
                        <div className="flex justify-between items-start gap-2">
                          <span className="shrink-0">Voice:</span>
                          <span className="font-medium text-right break-words" style={{ wordBreak: 'break-word' }}>{audio.voice}</span>
                        </div>
                        <div className="flex justify-between items-start gap-2">
                          <span className="shrink-0">Model:</span>
                          <span className="font-medium text-right break-words" style={{ wordBreak: 'break-word' }}>{audio.model}</span>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <span className="shrink-0">Speed:</span>
                          <span className="font-medium">{audio.speed}x</span>
                        </div>
                        {audio.duration && (
                          <div className="flex justify-between items-center gap-2">
                            <span className="shrink-0">Duration:</span>
                            <span className="font-medium">
                              {Math.floor(audio.duration / 60)}:{(audio.duration % 60).toFixed(0).padStart(2, '0')}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="text-xs md:text-sm">
                        <p className="text-muted-foreground leading-relaxed break-words hyphens-auto" 
                           style={{ 
                             display: '-webkit-box',
                             WebkitLineClamp: 4,
                             WebkitBoxOrient: 'vertical',
                             overflow: 'hidden',
                             wordBreak: 'break-word',
                             overflowWrap: 'break-word'
                           }}>
                          {audio.content}
                        </p>
                      </div>

                      {audio.audioUrl && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="btn-secondary flex-1 text-xs md:text-sm min-h-[44px] touch-target"
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = audio.audioUrl!;
                              link.download = `${audio.title}.mp3`;
                              link.click();
                            }}
                          >
                            <Download className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                            <span className="hidden sm:inline">Download Audio</span>
                            <span className="sm:hidden">Download</span>
                          </Button>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:bg-destructive hover:text-destructive-foreground min-h-[44px] min-w-[44px] touch-target px-2 md:px-3"
                            onClick={() => deleteMutation.mutate(audio.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-3 w-3 md:h-4 md:w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioPage;