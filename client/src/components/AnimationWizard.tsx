import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { 
  Users, MessageSquare, Layers, Eye, Sparkles, Lock, 
  ChevronRight, ChevronLeft, Check, Loader2, Edit2, Trash2, Plus,
  Wand2, AlertCircle, Play
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
  color: string | null;
  sortOrder: number;
}

interface AnimationFrame {
  id: number;
  scriptId: number;
  characterId: number | null;
  sceneGroupId: number | null;
  dialogue: string;
  emotion: string;
  action: string | null;
  setting: string | null;
  visualNotes: string | null;
  sortOrder: number;
  status: string;
}

interface AnimationScene {
  id: number;
  scriptId: number;
  title: string;
  setting: string | null;
  timeOfDay: string | null;
  summary: string | null;
  sortOrder: number;
  status: string;
}

interface ParsedCharacter {
  name: string;
  displayName?: string;
  description?: string;
  isNarrator: boolean;
  suggestedVoiceType?: string;
}

interface ParsedFrame {
  speaker: string;
  dialogue: string;
  emotion?: string;
  action?: string;
  visualNotes?: string;
}

interface ParsedScene {
  title: string;
  setting?: string;
  timeOfDay?: string;
  summary?: string;
  frames: ParsedFrame[];
}

interface ParsedData {
  characters: ParsedCharacter[];
  scenes: ParsedScene[];
}

interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  category: string;
  description: string;
}

interface AnimationWizardProps {
  scriptId: number;
  scriptContent: string;
  animationStatus: string | null;
  onComplete: () => void;
}

const WIZARD_STEPS = [
  { id: 'script', label: 'Script', icon: MessageSquare, description: 'Review and enhance your script' },
  { id: 'characters', label: 'Characters', icon: Users, description: 'Review detected characters' },
  { id: 'scenes', label: 'Scenes', icon: Layers, description: 'Review scene groupings' },
  { id: 'preview', label: 'Preview', icon: Eye, description: 'Preview storyboard' },
];

export default function AnimationWizard({ 
  scriptId, 
  scriptContent,
  animationStatus,
  onComplete 
}: AnimationWizardProps) {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [editingCharacter, setEditingCharacter] = useState<ParsedCharacter | null>(null);
  const [editingScene, setEditingScene] = useState<{ index: number; scene: ParsedScene } | null>(null);
  const [showAddCharacter, setShowAddCharacter] = useState(false);
  const [showAddScene, setShowAddScene] = useState(false);
  const [newCharacterName, setNewCharacterName] = useState("");
  const [newCharacterDescription, setNewCharacterDescription] = useState("");
  const [newSceneTitle, setNewSceneTitle] = useState("");
  const [newSceneSetting, setNewSceneSetting] = useState("");

  const { data: charactersData } = useQuery<{ characters: AnimationCharacter[] }>({
    queryKey: [`/api/scripts/${scriptId}/animation-characters`],
  });

  const { data: framesData } = useQuery<{ frames: AnimationFrame[] }>({
    queryKey: [`/api/scripts/${scriptId}/animation-frames`],
  });

  const { data: scenesData } = useQuery<{ scenes: AnimationScene[] }>({
    queryKey: [`/api/scripts/${scriptId}/animation-scenes`],
  });

  const { data: voicesData } = useQuery<{ voices: ElevenLabsVoice[] }>({
    queryKey: ['/api/elevenlabs/voices'],
  });

  const characters = charactersData?.characters || [];
  const frames = framesData?.frames || [];
  const scenes = scenesData?.scenes || [];
  const voices = voicesData?.voices || [];

  const enhanceMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/scripts/${scriptId}/animation-enhance`, {
        method: 'POST',
      });
    },
    onSuccess: (data: any) => {
      setParsedData(data.parsed);
      toast({ 
        title: "Script Analyzed", 
        description: `Found ${data.characterCount} characters in ${data.sceneCount} scenes` 
      });
      setCurrentStep(1);
    },
    onError: (err: Error) => {
      toast({ title: "Enhancement Failed", description: err.message, variant: "destructive" });
    }
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!parsedData) throw new Error("No parsed data");
      return await apiRequest(`/api/scripts/${scriptId}/animation-apply`, {
        method: 'POST',
        body: JSON.stringify(parsedData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/scripts/${scriptId}/animation-characters`] });
      queryClient.invalidateQueries({ queryKey: [`/api/scripts/${scriptId}/animation-frames`] });
      queryClient.invalidateQueries({ queryKey: [`/api/scripts/${scriptId}/animation-scenes`] });
      toast({ title: "Data Applied", description: "Characters and scenes have been created" });
    },
    onError: (err: Error) => {
      toast({ title: "Apply Failed", description: err.message, variant: "destructive" });
    }
  });

  const lockMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/scripts/${scriptId}/animation-lock-storyboard`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({ title: "Storyboard Locked", description: "Ready for image and voice generation" });
      onComplete();
    },
    onError: (err: Error) => {
      toast({ title: "Lock Failed", description: err.message, variant: "destructive" });
    }
  });

  const handleEnhance = () => {
    enhanceMutation.mutate();
  };

  const handleApplyAndContinue = async () => {
    await applyMutation.mutateAsync();
    setCurrentStep(2);
  };

  const handleLockStoryboard = () => {
    lockMutation.mutate();
  };

  const updateParsedCharacter = (index: number, updates: Partial<ParsedCharacter>) => {
    if (!parsedData) return;
    const newCharacters = [...parsedData.characters];
    newCharacters[index] = { ...newCharacters[index], ...updates };
    setParsedData({ ...parsedData, characters: newCharacters });
  };

  const deleteCharacter = (index: number) => {
    if (!parsedData) return;
    const newCharacters = parsedData.characters.filter((_, i) => i !== index);
    setParsedData({ ...parsedData, characters: newCharacters });
  };

  const updateParsedScene = (index: number, updates: Partial<ParsedScene>) => {
    if (!parsedData) return;
    const newScenes = [...parsedData.scenes];
    newScenes[index] = { ...newScenes[index], ...updates };
    setParsedData({ ...parsedData, scenes: newScenes });
  };

  const deleteScene = (index: number) => {
    if (!parsedData) return;
    const newScenes = parsedData.scenes.filter((_, i) => i !== index);
    setParsedData({ ...parsedData, scenes: newScenes });
  };

  const addManualCharacter = () => {
    if (!newCharacterName.trim()) return;
    const newChar: ParsedCharacter = {
      name: newCharacterName.trim().toUpperCase(),
      displayName: newCharacterName.trim(),
      description: newCharacterDescription.trim() || undefined,
      isNarrator: false,
    };
    const currentChars = parsedData?.characters || [];
    setParsedData({
      characters: [...currentChars, newChar],
      scenes: parsedData?.scenes || [],
    });
    setNewCharacterName("");
    setNewCharacterDescription("");
    setShowAddCharacter(false);
  };

  const addManualScene = () => {
    if (!newSceneTitle.trim()) return;
    const newScene: ParsedScene = {
      title: newSceneTitle.trim(),
      setting: newSceneSetting.trim() || undefined,
      frames: [],
    };
    const currentScenes = parsedData?.scenes || [];
    setParsedData({
      characters: parsedData?.characters || [],
      scenes: [...currentScenes, newScene],
    });
    setNewSceneTitle("");
    setNewSceneSetting("");
    setShowAddScene(false);
  };

  const getStepProgress = () => {
    return ((currentStep + 1) / WIZARD_STEPS.length) * 100;
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: return !!parsedData;
      case 1: return parsedData && parsedData.characters.length > 0;
      case 2: return parsedData && parsedData.scenes.length > 0;
      case 3: return scenes.length > 0;
      default: return false;
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-4 border">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium">AI Script Enhancement</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Our AI will analyze your script to extract characters, detect scene breaks, 
                    and parse dialogue with emotions. This creates the foundation for your animation.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Your Script</Label>
              <div className="bg-muted rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-sm whitespace-pre-wrap">
                {scriptContent || "No script content yet. Add your dialogue script above."}
              </div>
            </div>

            {parsedData && (
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                  <Check className="w-4 h-4" />
                  <span className="font-medium">Script Analyzed Successfully</span>
                </div>
                <div className="mt-2 text-sm text-green-600 dark:text-green-500">
                  Found {parsedData.characters.length} characters in {parsedData.scenes.length} scenes
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Button 
                onClick={handleEnhance}
                disabled={enhanceMutation.isPending || !scriptContent}
                className="w-full"
                size="lg"
                data-testid="button-enhance-script"
              >
                {enhanceMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing Script...
                  </>
                ) : parsedData ? (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Re-analyze Script
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Enhance Script with AI
                  </>
                )}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">or</span>
                </div>
              </div>

              <Button 
                variant="outline"
                onClick={() => setCurrentStep(1)}
                disabled={enhanceMutation.isPending}
                className="w-full"
                data-testid="button-skip-enhance"
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                Skip - Set Up Manually
              </Button>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">Characters</h4>
                <p className="text-sm text-muted-foreground">
                  {parsedData?.characters.length ? 'Review and edit characters' : 'Add the characters in your animation'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{parsedData?.characters.length || 0} characters</Badge>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowAddCharacter(true)}
                  data-testid="button-add-character"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>
            </div>

            {showAddCharacter && (
              <Card className="p-4 border-primary/50 bg-primary/5">
                <div className="space-y-3">
                  <div>
                    <Label>Character Name</Label>
                    <Input 
                      value={newCharacterName}
                      onChange={(e) => setNewCharacterName(e.target.value)}
                      placeholder="e.g., Alice, Narrator, Professor"
                      data-testid="input-new-character-name"
                    />
                  </div>
                  <div>
                    <Label>Description (optional)</Label>
                    <Textarea 
                      value={newCharacterDescription}
                      onChange={(e) => setNewCharacterDescription(e.target.value)}
                      placeholder="Brief description of the character..."
                      rows={2}
                      data-testid="input-new-character-description"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={addManualCharacter} disabled={!newCharacterName.trim()} data-testid="button-save-new-character">
                      <Check className="w-4 h-4 mr-1" />
                      Add Character
                    </Button>
                    <Button variant="ghost" onClick={() => { setShowAddCharacter(false); setNewCharacterName(""); setNewCharacterDescription(""); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            <ScrollArea className="h-[350px]">
              <div className="space-y-3 pr-4">
                {parsedData?.characters.map((char, index) => (
                  <Card key={index} className="p-4" data-testid={`card-character-${index}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{char.name}</span>
                          {char.isNarrator && (
                            <Badge variant="outline" className="text-xs">Narrator</Badge>
                          )}
                        </div>
                        {char.description && (
                          <p className="text-sm text-muted-foreground mt-1">{char.description}</p>
                        )}
                        {char.suggestedVoiceType && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Suggested voice: {char.suggestedVoiceType}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => setEditingCharacter(char)}
                          data-testid={`button-edit-character-${index}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => deleteCharacter(index)}
                          data-testid={`button-delete-character-${index}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            {(!parsedData?.characters || parsedData.characters.length === 0) && !showAddCharacter && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No characters yet.</p>
                <Button 
                  variant="link" 
                  onClick={() => setShowAddCharacter(true)}
                  className="mt-2"
                >
                  Add your first character
                </Button>
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">Scenes</h4>
                <p className="text-sm text-muted-foreground">
                  {parsedData?.scenes.length ? 'Review scene groupings' : 'Define your animation scenes'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{parsedData?.scenes.length || 0} scenes</Badge>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowAddScene(true)}
                  data-testid="button-add-scene"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>
            </div>

            {showAddScene && (
              <Card className="p-4 border-primary/50 bg-primary/5">
                <div className="space-y-3">
                  <div>
                    <Label>Scene Title</Label>
                    <Input 
                      value={newSceneTitle}
                      onChange={(e) => setNewSceneTitle(e.target.value)}
                      placeholder="e.g., Opening, Coffee Shop, Final Confrontation"
                      data-testid="input-new-scene-title"
                    />
                  </div>
                  <div>
                    <Label>Setting (optional)</Label>
                    <Input 
                      value={newSceneSetting}
                      onChange={(e) => setNewSceneSetting(e.target.value)}
                      placeholder="e.g., Interior office - morning"
                      data-testid="input-new-scene-setting"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={addManualScene} disabled={!newSceneTitle.trim()} data-testid="button-save-new-scene">
                      <Check className="w-4 h-4 mr-1" />
                      Add Scene
                    </Button>
                    <Button variant="ghost" onClick={() => { setShowAddScene(false); setNewSceneTitle(""); setNewSceneSetting(""); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            <ScrollArea className="h-[350px]">
              <div className="space-y-4 pr-4">
                {parsedData?.scenes.map((scene, index) => (
                  <Card key={index} className="overflow-hidden" data-testid={`card-scene-${index}`}>
                    <CardHeader className="py-3 px-4 bg-muted/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-sm font-medium">
                            Scene {index + 1}: {scene.title}
                          </CardTitle>
                          {scene.setting && (
                            <CardDescription className="text-xs mt-1">
                              {scene.setting}
                            </CardDescription>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {scene.frames.length} lines
                          </Badge>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => setEditingScene({ index, scene })}
                            data-testid={`button-edit-scene-${index}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => deleteScene(index)}
                            data-testid={`button-delete-scene-${index}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="py-3 px-4">
                      <div className="space-y-2">
                        {scene.frames.slice(0, 3).map((frame, fIndex) => (
                          <div key={fIndex} className="text-sm">
                            <span className="font-medium text-primary">{frame.speaker}:</span>{' '}
                            <span className="text-muted-foreground">
                              {frame.dialogue.length > 60 
                                ? frame.dialogue.slice(0, 60) + '...' 
                                : frame.dialogue}
                            </span>
                          </div>
                        ))}
                        {scene.frames.length > 3 && (
                          <p className="text-xs text-muted-foreground">
                            +{scene.frames.length - 3} more lines...
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            {(!parsedData?.scenes || parsedData.scenes.length === 0) && !showAddScene && (
              <div className="text-center py-8 text-muted-foreground">
                <Layers className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No scenes yet.</p>
                <Button 
                  variant="link" 
                  onClick={() => setShowAddScene(true)}
                  className="mt-2"
                >
                  Add your first scene
                </Button>
              </div>
            )}

            {parsedData && parsedData.scenes.length > 0 && (
              <Button 
                onClick={handleApplyAndContinue}
                disabled={applyMutation.isPending}
                className="w-full"
                data-testid="button-apply-continue"
              >
                {applyMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Apply & Continue to Preview
                  </>
                )}
              </Button>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">Storyboard Preview</h4>
                <p className="text-sm text-muted-foreground">
                  Final review before locking and generating
                </p>
              </div>
              <Badge variant="secondary">{scenes.length} scenes ready</Badge>
            </div>

            {scenes.length > 0 ? (
              <>
                <ScrollArea className="h-[350px]">
                  <div className="space-y-4 pr-4">
                    {scenes.map((scene, index) => {
                      const sceneFrames = frames.filter(f => f.sceneGroupId === scene.id);
                      return (
                        <Card key={scene.id} className="overflow-hidden" data-testid={`card-preview-scene-${index}`}>
                          <CardHeader className="py-3 px-4 bg-primary/5">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                              <Play className="w-4 h-4" />
                              Scene {index + 1}: {scene.title}
                            </CardTitle>
                            {scene.setting && (
                              <CardDescription className="text-xs">
                                {scene.setting}
                              </CardDescription>
                            )}
                          </CardHeader>
                          <CardContent className="py-3 px-4">
                            <div className="space-y-2">
                              {sceneFrames.map((frame, fIndex) => {
                                const character = characters.find(c => c.id === frame.characterId);
                                return (
                                  <div key={fIndex} className="flex items-start gap-2 text-sm">
                                    <div 
                                      className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0"
                                      style={{ backgroundColor: character?.color || '#888' }}
                                    />
                                    <div>
                                      <span className="font-medium">{character?.name || 'Unknown'}:</span>{' '}
                                      <span className="text-muted-foreground">{frame.dialogue}</span>
                                      {frame.emotion && frame.emotion !== 'neutral' && (
                                        <Badge variant="outline" className="ml-2 text-xs">
                                          {frame.emotion}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>

                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Lock className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-amber-800 dark:text-amber-200">Ready to Lock</h4>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        Locking the storyboard will finalize the scene structure. 
                        You can then generate images and voices for each scene.
                      </p>
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={handleLockStoryboard}
                  disabled={lockMutation.isPending}
                  className="w-full"
                  size="lg"
                  data-testid="button-lock-storyboard"
                >
                  {lockMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Locking Storyboard...
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 mr-2" />
                      Lock Storyboard & Start Generating
                    </>
                  )}
                </Button>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No scenes have been created yet.</p>
                <p className="text-sm mt-1">Go back to apply the parsed data.</p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Animation Wizard
        </CardTitle>
        <CardDescription>
          Transform your script into an animated video with multiple scenes
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Step {currentStep + 1} of {WIZARD_STEPS.length}</span>
            <span>{WIZARD_STEPS[currentStep].label}</span>
          </div>
          <Progress value={getStepProgress()} className="h-2" />
        </div>

        <div className="flex justify-center gap-2">
          {WIZARD_STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            return (
              <button
                key={step.id}
                onClick={() => index <= currentStep && setCurrentStep(index)}
                disabled={index > currentStep}
                className={`flex flex-col items-center p-2 rounded-lg transition-colors ${
                  isActive 
                    ? 'bg-primary text-primary-foreground' 
                    : isCompleted 
                      ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' 
                      : 'bg-muted text-muted-foreground'
                } ${index <= currentStep ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed opacity-50'}`}
                data-testid={`wizard-step-${step.id}`}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
                <span className="text-xs mt-1 font-medium">{step.label}</span>
              </button>
            );
          })}
        </div>

        <Separator />

        {renderStepContent()}

        <div className="flex justify-between pt-4">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            data-testid="button-wizard-back"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          {currentStep < 3 && currentStep !== 2 && (
            <Button
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={!canProceed()}
              data-testid="button-wizard-next"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog open={!!editingScene} onOpenChange={() => setEditingScene(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Scene</DialogTitle>
            <DialogDescription>Modify the scene details</DialogDescription>
          </DialogHeader>
          {editingScene && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Scene Title</Label>
                <Input
                  value={editingScene.scene.title}
                  onChange={(e) => setEditingScene({
                    ...editingScene,
                    scene: { ...editingScene.scene, title: e.target.value }
                  })}
                  data-testid="input-scene-title"
                />
              </div>
              <div className="space-y-2">
                <Label>Setting</Label>
                <Input
                  value={editingScene.scene.setting || ''}
                  onChange={(e) => setEditingScene({
                    ...editingScene,
                    scene: { ...editingScene.scene, setting: e.target.value }
                  })}
                  placeholder="e.g., INT. COFFEE SHOP - DAY"
                  data-testid="input-scene-setting"
                />
              </div>
              <div className="space-y-2">
                <Label>Summary</Label>
                <Textarea
                  value={editingScene.scene.summary || ''}
                  onChange={(e) => setEditingScene({
                    ...editingScene,
                    scene: { ...editingScene.scene, summary: e.target.value }
                  })}
                  placeholder="Brief description of what happens in this scene"
                  data-testid="input-scene-summary"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingScene(null)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (editingScene) {
                  updateParsedScene(editingScene.index, editingScene.scene);
                  setEditingScene(null);
                }
              }}
              data-testid="button-save-scene"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
