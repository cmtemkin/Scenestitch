import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { 
  Users, MessageSquare, Layers, Eye, Plus, Trash2, 
  GripVertical, Edit2, Volume2, Sparkles, Lock, 
  ChevronRight, ChevronLeft, Save, AlertCircle, Check, Upload
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AnimationCharacter {
  id: number;
  scriptId: number;
  name: string;
  displayName: string | null;
  description: string | null;
  isNarrator: boolean;
  voiceId: string | null;
  voiceName: string | null;
  voiceSettings: unknown;
  referenceImageUrl: string | null;
  color: string | null;
  sortOrder: number;
}

interface AnimationFrame {
  id: number;
  scriptId: number;
  characterId: number | null;
  dialogue: string;
  emotion: string;
  action: string | null;
  setting: string | null;
  visualNotes: string | null;
  estimatedDuration: string | null;
  sortOrder: number;
  status: string;
  suggestedSceneId: number | null;
}

interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  category: string;
  description: string;
  previewUrl: string;
  labels: Record<string, string>;
}

interface ManualDialogueBuilderProps {
  scriptId: number;
  scriptContent: string;
  onStoryboardLocked: () => void;
}

const EMOTION_OPTIONS = [
  'neutral', 'happy', 'sad', 'angry', 'surprised', 
  'thoughtful', 'excited', 'worried', 'confused', 'determined'
];

const CHARACTER_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

export default function ManualDialogueBuilder({ 
  scriptId, 
  scriptContent,
  onStoryboardLocked 
}: ManualDialogueBuilderProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("characters");
  const [editingCharacter, setEditingCharacter] = useState<AnimationCharacter | null>(null);
  const [newCharacterDialog, setNewCharacterDialog] = useState(false);
  const [newFrameDialog, setNewFrameDialog] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState("");

  const [newCharacterForm, setNewCharacterForm] = useState({
    name: "",
    displayName: "",
    description: "",
    isNarrator: false,
    voiceId: "",
    voiceName: "",
    color: CHARACTER_COLORS[0]
  });

  const [newFrameForm, setNewFrameForm] = useState({
    characterId: "",
    dialogue: "",
    emotion: "neutral",
    action: "",
    setting: "",
    visualNotes: ""
  });

  const { data: charactersData, isLoading: loadingChars } = useQuery<{ characters: AnimationCharacter[] }>({
    queryKey: [`/api/scripts/${scriptId}/animation-characters`],
  });

  const { data: framesData, isLoading: loadingFrames } = useQuery<{ frames: AnimationFrame[] }>({
    queryKey: [`/api/scripts/${scriptId}/animation-frames`],
  });

  const { data: voicesData } = useQuery<{ voices: ElevenLabsVoice[] }>({
    queryKey: ['/api/elevenlabs/voices'],
  });

  const characters = charactersData?.characters || [];
  const frames = framesData?.frames || [];
  const voices = voicesData?.voices || [];

  const createCharacterMutation = useMutation({
    mutationFn: async (data: typeof newCharacterForm) => {
      return apiRequest(`/api/scripts/${scriptId}/animation-characters`, {
        method: 'POST',
        body: JSON.stringify({
          name: data.name,
          displayName: data.displayName || data.name,
          description: data.description || null,
          isNarrator: data.isNarrator,
          voiceId: data.voiceId || null,
          voiceName: data.voiceName || null,
          color: data.color
        }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/scripts/${scriptId}/animation-characters`] });
      setNewCharacterDialog(false);
      setNewCharacterForm({
        name: "",
        displayName: "",
        description: "",
        isNarrator: false,
        voiceId: "",
        voiceName: "",
        color: CHARACTER_COLORS[characters.length % CHARACTER_COLORS.length]
      });
      toast({ title: "Character Added", description: "New character created successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const updateCharacterMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<AnimationCharacter> }) => {
      return apiRequest(`/api/animation-characters/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/scripts/${scriptId}/animation-characters`] });
      setEditingCharacter(null);
      toast({ title: "Character Updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const deleteCharacterMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/animation-characters/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/scripts/${scriptId}/animation-characters`] });
      toast({ title: "Character Deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const createFrameMutation = useMutation({
    mutationFn: async (data: typeof newFrameForm) => {
      return apiRequest(`/api/scripts/${scriptId}/animation-frames`, {
        method: 'POST',
        body: JSON.stringify({
          characterId: data.characterId ? parseInt(data.characterId) : null,
          dialogue: data.dialogue,
          emotion: data.emotion,
          action: data.action || null,
          setting: data.setting || null,
          visualNotes: data.visualNotes || null
        }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/scripts/${scriptId}/animation-frames`] });
      setNewFrameDialog(false);
      setNewFrameForm({
        characterId: "",
        dialogue: "",
        emotion: "neutral",
        action: "",
        setting: "",
        visualNotes: ""
      });
      toast({ title: "Frame Added" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const updateFrameMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<AnimationFrame> }) => {
      return apiRequest(`/api/animation-frames/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/scripts/${scriptId}/animation-frames`] });
    }
  });

  const deleteFrameMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/animation-frames/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/scripts/${scriptId}/animation-frames`] });
      toast({ title: "Frame Deleted" });
    }
  });

  const importFramesMutation = useMutation({
    mutationFn: async (dialogueText: string) => {
      const parseResult = await apiRequest(`/api/scripts/${scriptId}/parse-dialogue-to-frames`, {
        method: 'POST',
        body: JSON.stringify({ dialogueText }),
        headers: { 'Content-Type': 'application/json' },
      }) as { parsedFrames: Array<{ speaker: string; dialogue: string; emotion: string; isNarrator: boolean }>; uniqueSpeakers: string[] };

      const speakerToCharacter: Record<string, number> = {};
      for (const speaker of parseResult.uniqueSpeakers) {
        const existingChar = characters.find(c => 
          c.name.toLowerCase() === speaker.toLowerCase() ||
          c.displayName?.toLowerCase() === speaker.toLowerCase()
        );
        if (existingChar) {
          speakerToCharacter[speaker] = existingChar.id;
        }
      }

      const framesToCreate = parseResult.parsedFrames.map(pf => ({
        characterId: speakerToCharacter[pf.speaker] || null,
        dialogue: pf.dialogue,
        emotion: pf.emotion,
      }));

      return apiRequest(`/api/scripts/${scriptId}/animation-frames/batch`, {
        method: 'POST',
        body: JSON.stringify({ frames: framesToCreate }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/scripts/${scriptId}/animation-frames`] });
      setImportDialogOpen(false);
      setImportText("");
      toast({ title: "Import Complete", description: "Dialogue frames imported successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    }
  });

  const getCharacterById = (id: number | null) => {
    if (!id) return null;
    return characters.find(c => c.id === id);
  };

  const getCharacterColor = (characterId: number | null) => {
    const char = getCharacterById(characterId);
    return char?.color || '#6B7280';
  };

  const framesComplete = frames.length > 0;
  const charactersComplete = characters.length > 0;
  const allFramesHaveCharacters = frames.every(f => f.characterId !== null);

  const getStepStatus = (step: string) => {
    switch (step) {
      case 'characters':
        return charactersComplete ? 'complete' : 'active';
      case 'frames':
        return !charactersComplete ? 'locked' : framesComplete ? 'complete' : 'active';
      case 'scenes':
        return !framesComplete ? 'locked' : 'active';
      case 'preview':
        return !framesComplete ? 'locked' : 'active';
      default:
        return 'locked';
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Manual Dialogue Builder</CardTitle>
              <CardDescription>
                Build your animation storyboard step by step
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {charactersComplete && framesComplete && allFramesHaveCharacters && (
                <Button onClick={onStoryboardLocked} className="gap-2">
                  <Lock className="h-4 w-4" />
                  Lock Storyboard
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full grid grid-cols-4 rounded-none border-b">
              <TabsTrigger 
                value="characters" 
                className="gap-2 data-[state=active]:bg-background"
                data-testid="tab-characters"
              >
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Characters</span>
                {charactersComplete && <Check className="h-3 w-3 text-green-500" />}
              </TabsTrigger>
              <TabsTrigger 
                value="frames" 
                className="gap-2 data-[state=active]:bg-background"
                disabled={!charactersComplete}
                data-testid="tab-frames"
              >
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">Frames</span>
                {framesComplete && <Check className="h-3 w-3 text-green-500" />}
              </TabsTrigger>
              <TabsTrigger 
                value="scenes" 
                className="gap-2 data-[state=active]:bg-background"
                disabled={!framesComplete}
                data-testid="tab-scenes"
              >
                <Layers className="h-4 w-4" />
                <span className="hidden sm:inline">Scenes</span>
              </TabsTrigger>
              <TabsTrigger 
                value="preview" 
                className="gap-2 data-[state=active]:bg-background"
                disabled={!framesComplete}
                data-testid="tab-preview"
              >
                <Eye className="h-4 w-4" />
                <span className="hidden sm:inline">Preview</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="characters" className="p-4 mt-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Define the characters in your script and assign voices
                  </p>
                  <Button 
                    size="sm" 
                    onClick={() => setNewCharacterDialog(true)}
                    className="gap-2"
                    data-testid="button-add-character"
                  >
                    <Plus className="h-4 w-4" />
                    Add Character
                  </Button>
                </div>

                {loadingChars ? (
                  <div className="text-center py-8 text-muted-foreground">Loading characters...</div>
                ) : characters.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed rounded-lg">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground mb-4">No characters yet</p>
                    <Button 
                      onClick={() => setNewCharacterDialog(true)}
                      data-testid="button-create-first-character"
                    >
                      Create Your First Character
                    </Button>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {characters.map((char) => (
                        <Card 
                          key={char.id} 
                          className="p-3"
                          style={{ borderLeftColor: char.color || '#6B7280', borderLeftWidth: 4 }}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                                style={{ backgroundColor: char.color || '#6B7280' }}
                              >
                                {char.displayName?.[0] || char.name[0]}
                              </div>
                              <div>
                                <div className="font-medium flex items-center gap-2">
                                  {char.displayName || char.name}
                                  {char.isNarrator && (
                                    <Badge variant="secondary" className="text-xs">Narrator</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {char.description || 'No description'}
                                </p>
                                {char.voiceName && (
                                  <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                                    <Volume2 className="h-3 w-3" />
                                    {char.voiceName}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button 
                                size="icon" 
                                variant="ghost"
                                onClick={() => setEditingCharacter(char)}
                                data-testid={`button-edit-character-${char.id}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost"
                                onClick={() => deleteCharacterMutation.mutate(char.id)}
                                data-testid={`button-delete-character-${char.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                {characters.length > 0 && (
                  <div className="flex justify-end">
                    <Button 
                      onClick={() => setActiveTab("frames")}
                      className="gap-2"
                      data-testid="button-next-to-frames"
                    >
                      Next: Add Dialogue Frames
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="frames" className="p-4 mt-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm text-muted-foreground">
                    Add dialogue frames one by one or import from script
                  </p>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        setImportText(scriptContent);
                        setImportDialogOpen(true);
                      }}
                      className="gap-2"
                      data-testid="button-import-from-script"
                    >
                      <Upload className="h-4 w-4" />
                      Import from Script
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => setNewFrameDialog(true)}
                      className="gap-2"
                      data-testid="button-add-frame"
                    >
                      <Plus className="h-4 w-4" />
                      Add Frame
                    </Button>
                  </div>
                </div>

                {loadingFrames ? (
                  <div className="text-center py-8 text-muted-foreground">Loading frames...</div>
                ) : frames.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed rounded-lg">
                    <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground mb-4">No dialogue frames yet</p>
                    <div className="flex justify-center gap-3">
                      <Button 
                        variant="outline"
                        onClick={() => {
                          setImportText(scriptContent);
                          setImportDialogOpen(true);
                        }}
                        data-testid="button-import-dialogue"
                      >
                        Import from Script
                      </Button>
                      <Button 
                        onClick={() => setNewFrameDialog(true)}
                        data-testid="button-create-first-frame"
                      >
                        Add Manually
                      </Button>
                    </div>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {frames.map((frame, idx) => {
                        const char = getCharacterById(frame.characterId);
                        return (
                          <Card 
                            key={frame.id}
                            className="p-3"
                            style={{ borderLeftColor: getCharacterColor(frame.characterId), borderLeftWidth: 4 }}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-xs text-muted-foreground font-mono">
                                  {String(idx + 1).padStart(2, '0')}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    {char ? (
                                      <Badge 
                                        variant="outline"
                                        style={{ borderColor: char.color || undefined, color: char.color || undefined }}
                                      >
                                        {char.displayName || char.name}
                                      </Badge>
                                    ) : (
                                      <Badge variant="destructive" className="text-xs">
                                        <AlertCircle className="h-3 w-3 mr-1" />
                                        No speaker
                                      </Badge>
                                    )}
                                    <Badge variant="secondary" className="text-xs">
                                      {frame.emotion}
                                    </Badge>
                                  </div>
                                  <p className="text-sm truncate">"{frame.dialogue}"</p>
                                  {frame.action && (
                                    <p className="text-xs text-muted-foreground italic mt-1">
                                      Action: {frame.action}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <Select
                                  value={frame.characterId?.toString() || ""}
                                  onValueChange={(val) => {
                                    updateFrameMutation.mutate({
                                      id: frame.id,
                                      updates: { characterId: val ? parseInt(val) : null }
                                    });
                                  }}
                                >
                                  <SelectTrigger className="w-28 h-8 text-xs">
                                    <SelectValue placeholder="Speaker" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {characters.map(c => (
                                      <SelectItem key={c.id} value={c.id.toString()}>
                                        {c.displayName || c.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button 
                                  size="icon" 
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => deleteFrameMutation.mutate(frame.id)}
                                  data-testid={`button-delete-frame-${frame.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}

                <div className="flex justify-between">
                  <Button 
                    variant="outline"
                    onClick={() => setActiveTab("characters")}
                    className="gap-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back: Characters
                  </Button>
                  {frames.length > 0 && (
                    <Button 
                      onClick={() => setActiveTab("scenes")}
                      className="gap-2"
                      data-testid="button-next-to-scenes"
                    >
                      Next: Group into Scenes
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="scenes" className="p-4 mt-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    AI will suggest how to group frames into visual scenes
                  </p>
                  <Button 
                    size="sm" 
                    className="gap-2"
                    disabled={frames.length === 0}
                    data-testid="button-suggest-scenes"
                  >
                    <Sparkles className="h-4 w-4" />
                    Suggest Scene Groupings
                  </Button>
                </div>

                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                  <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground mb-2">Scene grouping coming soon</p>
                  <p className="text-xs text-muted-foreground">
                    For now, each dialogue frame will become its own scene
                  </p>
                </div>

                <div className="flex justify-between">
                  <Button 
                    variant="outline"
                    onClick={() => setActiveTab("frames")}
                    className="gap-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back: Frames
                  </Button>
                  <Button 
                    onClick={() => setActiveTab("preview")}
                    className="gap-2"
                    data-testid="button-next-to-preview"
                  >
                    Next: Preview
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="p-4 mt-0">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Review your storyboard before generating images
                </p>

                <ScrollArea className="h-[400px]">
                  <div className="grid gap-4">
                    {frames.map((frame, idx) => {
                      const char = getCharacterById(frame.characterId);
                      return (
                        <Card key={frame.id} className="p-4">
                          <div className="flex gap-4">
                            <div 
                              className="w-24 h-24 bg-muted rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ borderColor: getCharacterColor(frame.characterId), borderWidth: 2 }}
                            >
                              <span className="text-2xl font-bold text-muted-foreground">
                                {String(idx + 1).padStart(2, '0')}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                {char && (
                                  <Badge 
                                    style={{ backgroundColor: char.color || undefined }}
                                    className="text-white"
                                  >
                                    {char.displayName || char.name}
                                  </Badge>
                                )}
                                <Badge variant="outline">{frame.emotion}</Badge>
                                <span className="text-xs text-muted-foreground ml-auto">
                                  ~{frame.estimatedDuration || 3}s
                                </span>
                              </div>
                              <p className="text-sm mb-2">"{frame.dialogue}"</p>
                              {frame.action && (
                                <p className="text-xs text-muted-foreground">
                                  <strong>Action:</strong> {frame.action}
                                </p>
                              )}
                              {frame.setting && (
                                <p className="text-xs text-muted-foreground">
                                  <strong>Setting:</strong> {frame.setting}
                                </p>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>

                <Separator />

                <div className="flex items-center justify-between bg-muted/50 p-4 rounded-lg">
                  <div>
                    <p className="font-medium">Ready to Generate</p>
                    <p className="text-sm text-muted-foreground">
                      {frames.length} frames • {characters.length} characters • 
                      ~{frames.reduce((acc, f) => acc + parseInt(f.estimatedDuration || '3'), 0)}s total
                    </p>
                  </div>
                  <Button 
                    onClick={onStoryboardLocked}
                    className="gap-2"
                    disabled={!allFramesHaveCharacters || frames.length === 0}
                    data-testid="button-lock-storyboard"
                  >
                    <Lock className="h-4 w-4" />
                    Lock & Generate
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={newCharacterDialog} onOpenChange={setNewCharacterDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Character</DialogTitle>
            <DialogDescription>Define a character for your animation</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="char-name">Character Name *</Label>
              <Input
                id="char-name"
                value={newCharacterForm.name}
                onChange={(e) => setNewCharacterForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., NARRATOR, JOHN, SARAH"
                data-testid="input-character-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="char-display">Display Name</Label>
              <Input
                id="char-display"
                value={newCharacterForm.displayName}
                onChange={(e) => setNewCharacterForm(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder="How the name appears on screen"
                data-testid="input-character-display-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="char-desc">Description</Label>
              <Textarea
                id="char-desc"
                value={newCharacterForm.description}
                onChange={(e) => setNewCharacterForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description for visual consistency"
                rows={2}
                data-testid="input-character-description"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="is-narrator"
                checked={newCharacterForm.isNarrator}
                onCheckedChange={(checked) => setNewCharacterForm(prev => ({ ...prev, isNarrator: checked }))}
                data-testid="switch-is-narrator"
              />
              <Label htmlFor="is-narrator">This is a narrator (off-screen voice)</Label>
            </div>
            <div className="space-y-2">
              <Label>Voice</Label>
              <Select
                value={newCharacterForm.voiceId}
                onValueChange={(val) => {
                  const voice = voices.find(v => v.voiceId === val);
                  setNewCharacterForm(prev => ({ 
                    ...prev, 
                    voiceId: val,
                    voiceName: voice?.name || ""
                  }));
                }}
              >
                <SelectTrigger data-testid="select-character-voice">
                  <SelectValue placeholder="Select a voice" />
                </SelectTrigger>
                <SelectContent>
                  {voices.map(v => (
                    <SelectItem key={v.voiceId} value={v.voiceId}>
                      {v.name} ({v.category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {CHARACTER_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${
                      newCharacterForm.color === color ? 'scale-110 border-foreground' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewCharacterForm(prev => ({ ...prev, color }))}
                    data-testid={`button-color-${color}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCharacterDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => createCharacterMutation.mutate(newCharacterForm)}
              disabled={!newCharacterForm.name || createCharacterMutation.isPending}
              data-testid="button-save-character"
            >
              {createCharacterMutation.isPending ? "Creating..." : "Create Character"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingCharacter !== null} onOpenChange={(open) => !open && setEditingCharacter(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Character</DialogTitle>
          </DialogHeader>
          {editingCharacter && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input
                  value={editingCharacter.displayName || editingCharacter.name}
                  onChange={(e) => setEditingCharacter(prev => prev ? { ...prev, displayName: e.target.value } : null)}
                  data-testid="input-edit-character-display-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editingCharacter.description || ""}
                  onChange={(e) => setEditingCharacter(prev => prev ? { ...prev, description: e.target.value } : null)}
                  rows={2}
                  data-testid="input-edit-character-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Voice</Label>
                <Select
                  value={editingCharacter.voiceId || ""}
                  onValueChange={(val) => {
                    const voice = voices.find(v => v.voiceId === val);
                    setEditingCharacter(prev => prev ? { 
                      ...prev, 
                      voiceId: val,
                      voiceName: voice?.name || null
                    } : null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a voice" />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.map(v => (
                      <SelectItem key={v.voiceId} value={v.voiceId}>
                        {v.name} ({v.category})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCharacter(null)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (editingCharacter) {
                  updateCharacterMutation.mutate({
                    id: editingCharacter.id,
                    updates: {
                      displayName: editingCharacter.displayName,
                      description: editingCharacter.description,
                      voiceId: editingCharacter.voiceId,
                      voiceName: editingCharacter.voiceName
                    }
                  });
                }
              }}
              disabled={updateCharacterMutation.isPending}
              data-testid="button-update-character"
            >
              {updateCharacterMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newFrameDialog} onOpenChange={setNewFrameDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Dialogue Frame</DialogTitle>
            <DialogDescription>Add a single line of dialogue to your animation</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Speaker</Label>
              <Select
                value={newFrameForm.characterId}
                onValueChange={(val) => setNewFrameForm(prev => ({ ...prev, characterId: val }))}
              >
                <SelectTrigger data-testid="select-frame-speaker">
                  <SelectValue placeholder="Select a character" />
                </SelectTrigger>
                <SelectContent>
                  {characters.map(c => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.displayName || c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Dialogue *</Label>
              <Textarea
                value={newFrameForm.dialogue}
                onChange={(e) => setNewFrameForm(prev => ({ ...prev, dialogue: e.target.value }))}
                placeholder="What does the character say?"
                rows={3}
                data-testid="input-frame-dialogue"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Emotion</Label>
                <Select
                  value={newFrameForm.emotion}
                  onValueChange={(val) => setNewFrameForm(prev => ({ ...prev, emotion: val }))}
                >
                  <SelectTrigger data-testid="select-frame-emotion">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMOTION_OPTIONS.map(e => (
                      <SelectItem key={e} value={e}>
                        {e.charAt(0).toUpperCase() + e.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Action</Label>
                <Input
                  value={newFrameForm.action}
                  onChange={(e) => setNewFrameForm(prev => ({ ...prev, action: e.target.value }))}
                  placeholder="e.g., walks away"
                  data-testid="input-frame-action"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Visual Notes</Label>
              <Textarea
                value={newFrameForm.visualNotes}
                onChange={(e) => setNewFrameForm(prev => ({ ...prev, visualNotes: e.target.value }))}
                placeholder="Notes for image generation..."
                rows={2}
                data-testid="input-frame-visual-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFrameDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => createFrameMutation.mutate(newFrameForm)}
              disabled={!newFrameForm.dialogue || createFrameMutation.isPending}
              data-testid="button-save-frame"
            >
              {createFrameMutation.isPending ? "Adding..." : "Add Frame"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Import Dialogue from Script</DialogTitle>
            <DialogDescription>
              Paste dialogue in format "CHARACTER: dialogue text" (one per line)
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={`NARRATOR: Once upon a time...
JOHN: Hello, how are you?
SARAH: I'm doing great, thanks!`}
              rows={15}
              className="font-mono text-sm"
              data-testid="textarea-import-dialogue"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => importFramesMutation.mutate(importText)}
              disabled={!importText.trim() || importFramesMutation.isPending}
              data-testid="button-import-frames"
            >
              {importFramesMutation.isPending ? "Importing..." : "Import Frames"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
