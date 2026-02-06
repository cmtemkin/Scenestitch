import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  Users, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  Loader2, 
  Edit2, 
  Save, 
  X,
  User,
  Palette,
  Eye,
  Upload,
  ImageIcon,
  Trash2
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CharacterDNA {
  id: string;
  name: string;
  aliases?: string[];
  referenceImageUrl?: string; // Uploaded reference image URL for visual consistency
  visualDNA: {
    age?: string;
    gender?: string;
    ethnicity?: string;
    bodyType?: string;
    face?: {
      shape?: string;
      eyes?: string;
      nose?: string;
      mouth?: string;
      distinctiveFeatures?: string[];
    };
    hair?: {
      style?: string;
      color?: string;
      length?: string;
    };
    skin?: string;
    clothing?: {
      typical?: string;
      accessories?: string[];
    };
  };
  personality?: string;
  role?: string;
}

interface CharactersPanelProps {
  scriptId: number | null;
  onCharactersExtracted?: () => void;
}

const CharactersPanel: React.FC<CharactersPanelProps> = ({ scriptId, onCharactersExtracted }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedCharacters, setExpandedCharacters] = useState<Set<string>>(new Set());
  const [editingCharacter, setEditingCharacter] = useState<CharacterDNA | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const { data: characterData, isLoading: isLoadingCharacters, refetch: refetchCharacters } = useQuery<{
    characters: CharacterDNA[];
    sceneCharacterMap: { [sceneNumber: number]: string[] };
  }>({
    queryKey: ['/api/characters', scriptId],
    queryFn: async () => {
      if (!scriptId) throw new Error('No script ID');
      const response = await fetch(`/api/characters/${scriptId}`);
      if (!response.ok) throw new Error('Failed to fetch characters');
      return response.json();
    },
    enabled: !!scriptId,
  });

  const extractCharactersMutation = useMutation({
    mutationFn: async () => {
      if (!scriptId) throw new Error('No script ID');
      const response = await fetch(`/api/extract-characters/${scriptId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to extract characters');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Characters Extracted',
        description: 'Character DNA profiles have been generated for your script.',
      });
      refetchCharacters();
      onCharactersExtracted?.();
    },
    onError: (error: Error) => {
      toast({
        title: 'Extraction Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateCharactersMutation = useMutation({
    mutationFn: async (characters: CharacterDNA[]) => {
      if (!scriptId) throw new Error('No script ID');
      const response = await fetch(`/api/characters/${scriptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characters }),
      });
      if (!response.ok) throw new Error('Failed to update characters');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Character Updated',
        description: 'Character visual DNA has been saved.',
      });
      refetchCharacters();
      setEditDialogOpen(false);
      setEditingCharacter(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const [generationJobId, setGenerationJobId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<{ completed: number; total: number } | null>(null);

  const { data: jobStatus, refetch: refetchJobStatus } = useQuery<{
    id: string;
    status: string;
    progress: { completed: number; total: number };
    error?: string;
  }>({
    queryKey: ['/api/jobs', generationJobId],
    queryFn: async () => {
      if (!generationJobId) throw new Error('No job ID');
      const response = await fetch(`/api/jobs/${generationJobId}`);
      if (!response.ok) throw new Error('Failed to fetch job status');
      return response.json();
    },
    enabled: !!generationJobId,
    refetchInterval: generationJobId ? 2000 : false,
  });

  useEffect(() => {
    if (jobStatus) {
      setGenerationProgress(jobStatus.progress);
      
      if (jobStatus.status === 'completed') {
        setGenerationJobId(null);
        setGenerationProgress(null);
        toast({
          title: 'Images Generated',
          description: `Generated ${jobStatus.progress.completed} images with character consistency.`,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/scenes', scriptId] });
      } else if (jobStatus.status === 'failed') {
        setGenerationJobId(null);
        setGenerationProgress(null);
        toast({
          title: 'Generation Failed',
          description: jobStatus.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    }
  }, [jobStatus, scriptId, queryClient, toast]);

  const generateWithCharactersMutation = useMutation({
    mutationFn: async () => {
      if (!scriptId) throw new Error('No script ID');
      const response = await fetch('/api/generate-images-with-characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate images');
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.jobId) {
        setGenerationJobId(data.jobId);
        setGenerationProgress({ completed: 0, total: data.totalScenes || 0 });
        toast({
          title: 'Generation Started',
          description: `Generating ${data.totalScenes} images with character consistency. This may take a few minutes.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Generation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const uploadCharacterImageMutation = useMutation({
    mutationFn: async ({ characterId, file }: { characterId: string; file: File }) => {
      if (!scriptId) throw new Error('No script ID');
      
      const formData = new FormData();
      formData.append('characterImage', file);

      const response = await fetch(`/api/characters/${scriptId}/${characterId}/upload-image`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload image');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Image Uploaded',
        description: 'Reference image has been saved for this character.',
      });
      // Update the editing character with the new image URL
      if (editingCharacter) {
        setEditingCharacter({
          ...editingCharacter,
          referenceImageUrl: data.imageUrl
        });
      }
      refetchCharacters();
      setIsUploadingImage(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload Failed',
        description: error.message,
        variant: 'destructive',
      });
      setIsUploadingImage(false);
    },
  });

  const deleteCharacterImageMutation = useMutation({
    mutationFn: async (characterId: string) => {
      if (!scriptId) throw new Error('No script ID');
      
      const response = await fetch(`/api/characters/${scriptId}/${characterId}/image`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete image');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Image Deleted',
        description: 'Reference image has been removed.',
      });
      // Update the editing character to remove the image URL
      if (editingCharacter) {
        setEditingCharacter({
          ...editingCharacter,
          referenceImageUrl: undefined
        });
      }
      refetchCharacters();
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingCharacter) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid File',
        description: 'Please select an image file.',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File Too Large',
        description: 'Image must be less than 5MB.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploadingImage(true);
    uploadCharacterImageMutation.mutate({ characterId: editingCharacter.id, file });
    
    // Reset the input
    e.target.value = '';
  };

  const handleDeleteImage = () => {
    if (!editingCharacter) return;
    deleteCharacterImageMutation.mutate(editingCharacter.id);
  };

  const toggleCharacterExpanded = (id: string) => {
    const newExpanded = new Set(expandedCharacters);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCharacters(newExpanded);
  };

  const handleEditCharacter = (character: CharacterDNA) => {
    setEditingCharacter({ ...character });
    setEditDialogOpen(true);
  };

  const handleSaveCharacter = () => {
    if (!editingCharacter || !characterData?.characters) return;
    
    const updatedCharacters = characterData.characters.map(c => 
      c.id === editingCharacter.id ? editingCharacter : c
    );
    
    updateCharactersMutation.mutate(updatedCharacters);
  };

  const characters = characterData?.characters || [];
  const hasCharacters = characters.length > 0;

  const getCharacterDescription = (character: CharacterDNA): string => {
    const dna = character.visualDNA;
    const parts: string[] = [];
    
    if (dna.age) parts.push(dna.age);
    if (dna.ethnicity) parts.push(dna.ethnicity);
    if (dna.gender) parts.push(dna.gender);
    if (dna.hair?.color) parts.push(`${dna.hair.color} hair`);
    if (dna.face?.eyes) parts.push(`${dna.face.eyes} eyes`);
    
    return parts.join(', ') || 'No visual description';
  };

  if (!scriptId) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Characters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Save your project first to extract characters.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border bg-card" data-testid="characters-panel">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Characters
            {hasCharacters && (
              <Badge variant="secondary" className="ml-2">
                {characters.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingCharacters ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : hasCharacters ? (
            <>
              <div className="space-y-2">
                {characters.map((character) => (
                  <Collapsible
                    key={character.id}
                    open={expandedCharacters.has(character.id)}
                    onOpenChange={() => toggleCharacterExpanded(character.id)}
                  >
                    <div className="rounded-lg border border-border bg-background/50 overflow-hidden">
                      <CollapsibleTrigger asChild>
                        <button
                          className="w-full p-3 flex items-center justify-between hover:bg-accent/50 transition-colors"
                          data-testid={`character-${character.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <div className="text-left">
                              <div className="font-medium text-sm">{character.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {character.role || 'Character'}
                              </div>
                            </div>
                          </div>
                          {expandedCharacters.has(character.id) ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border">
                          <p className="text-xs text-muted-foreground">
                            {getCharacterDescription(character)}
                          </p>
                          
                          {character.visualDNA.clothing?.typical && (
                            <div className="flex items-start gap-2">
                              <Palette className="h-3 w-3 mt-0.5 text-muted-foreground" />
                              <p className="text-xs text-muted-foreground">
                                {character.visualDNA.clothing.typical}
                              </p>
                            </div>
                          )}
                          
                          {character.personality && (
                            <div className="flex items-start gap-2">
                              <Eye className="h-3 w-3 mt-0.5 text-muted-foreground" />
                              <p className="text-xs text-muted-foreground italic">
                                {character.personality}
                              </p>
                            </div>
                          )}
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full mt-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditCharacter(character);
                            }}
                            data-testid={`edit-character-${character.id}`}
                          >
                            <Edit2 className="h-3 w-3 mr-2" />
                            Edit Visual DNA
                          </Button>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => extractCharactersMutation.mutate()}
                  disabled={extractCharactersMutation.isPending}
                  data-testid="reextract-characters-button"
                >
                  {extractCharactersMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Re-extract Characters
                </Button>
                
                {generationProgress ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Generating images...</span>
                      <span className="font-medium">{generationProgress.completed}/{generationProgress.total}</span>
                    </div>
                    <Progress 
                      value={(generationProgress.completed / generationProgress.total) * 100} 
                      className="h-2"
                    />
                  </div>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => generateWithCharactersMutation.mutate()}
                    disabled={generateWithCharactersMutation.isPending}
                    data-testid="generate-with-characters-button"
                  >
                    {generateWithCharactersMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Generate Images with Character Consistency
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Extract character profiles from your script to enable consistent character appearance across all generated images.
              </p>
              <Button
                className="w-full"
                onClick={() => extractCharactersMutation.mutate()}
                disabled={extractCharactersMutation.isPending}
                data-testid="extract-characters-button"
              >
                {extractCharactersMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Extract Characters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Character: {editingCharacter?.name}</DialogTitle>
            <DialogDescription>
              Modify the visual DNA to adjust how this character appears in generated images.
            </DialogDescription>
          </DialogHeader>
          
          {editingCharacter && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="char-name">Name</Label>
                  <Input
                    id="char-name"
                    value={editingCharacter.name}
                    onChange={(e) => setEditingCharacter({
                      ...editingCharacter,
                      name: e.target.value
                    })}
                    data-testid="char-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="char-role">Role</Label>
                  <Input
                    id="char-role"
                    value={editingCharacter.role || ''}
                    onChange={(e) => setEditingCharacter({
                      ...editingCharacter,
                      role: e.target.value
                    })}
                    placeholder="e.g., protagonist, mentor"
                    data-testid="char-role-input"
                  />
                </div>
              </div>

              <Separator />

              <h4 className="font-medium text-sm flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Reference Image
              </h4>
              
              <div className="space-y-3">
                {editingCharacter.referenceImageUrl ? (
                  <div className="relative">
                    <img 
                      src={editingCharacter.referenceImageUrl} 
                      alt={`${editingCharacter.name} reference`}
                      className="w-full max-w-[200px] h-auto rounded-lg border border-border object-cover"
                      data-testid="char-reference-image"
                    />
                    <div className="flex gap-2 mt-2">
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                          disabled={isUploadingImage}
                          data-testid="char-image-input"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isUploadingImage}
                          asChild
                        >
                          <span>
                            {isUploadingImage ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4 mr-2" />
                            )}
                            Replace
                          </span>
                        </Button>
                      </label>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={handleDeleteImage}
                        disabled={deleteCharacterImageMutation.isPending}
                        data-testid="char-delete-image-button"
                      >
                        {deleteCharacterImageMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-2" />
                        )}
                        Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                    <ImageIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-3">
                      Upload a reference image for consistent character appearance
                    </p>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        disabled={isUploadingImage}
                        data-testid="char-image-upload-input"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isUploadingImage}
                        asChild
                      >
                        <span>
                          {isUploadingImage ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4 mr-2" />
                          )}
                          Upload Image
                        </span>
                      </Button>
                    </label>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  This image will be used as a visual reference when generating scenes with this character. Max 5MB.
                </p>
              </div>

              <Separator />
              
              <h4 className="font-medium text-sm">Physical Appearance</h4>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="char-age">Age</Label>
                  <Input
                    id="char-age"
                    value={editingCharacter.visualDNA.age || ''}
                    onChange={(e) => setEditingCharacter({
                      ...editingCharacter,
                      visualDNA: { ...editingCharacter.visualDNA, age: e.target.value }
                    })}
                    placeholder="e.g., 32-year-old"
                    data-testid="char-age-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="char-gender">Gender</Label>
                  <Input
                    id="char-gender"
                    value={editingCharacter.visualDNA.gender || ''}
                    onChange={(e) => setEditingCharacter({
                      ...editingCharacter,
                      visualDNA: { ...editingCharacter.visualDNA, gender: e.target.value }
                    })}
                    data-testid="char-gender-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="char-ethnicity">Ethnicity</Label>
                  <Input
                    id="char-ethnicity"
                    value={editingCharacter.visualDNA.ethnicity || ''}
                    onChange={(e) => setEditingCharacter({
                      ...editingCharacter,
                      visualDNA: { ...editingCharacter.visualDNA, ethnicity: e.target.value }
                    })}
                    data-testid="char-ethnicity-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="char-body">Body Type</Label>
                <Input
                  id="char-body"
                  value={editingCharacter.visualDNA.bodyType || ''}
                  onChange={(e) => setEditingCharacter({
                    ...editingCharacter,
                    visualDNA: { ...editingCharacter.visualDNA, bodyType: e.target.value }
                  })}
                  placeholder="e.g., athletic build, head-to-body ratio 1:7"
                  data-testid="char-body-input"
                />
              </div>

              <Separator />
              
              <h4 className="font-medium text-sm">Face Details</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="char-face-shape">Face Shape</Label>
                  <Input
                    id="char-face-shape"
                    value={editingCharacter.visualDNA.face?.shape || ''}
                    onChange={(e) => setEditingCharacter({
                      ...editingCharacter,
                      visualDNA: { 
                        ...editingCharacter.visualDNA, 
                        face: { ...editingCharacter.visualDNA.face, shape: e.target.value }
                      }
                    })}
                    placeholder="e.g., oval with high cheekbones"
                    data-testid="char-face-shape-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="char-eyes">Eyes</Label>
                  <Input
                    id="char-eyes"
                    value={editingCharacter.visualDNA.face?.eyes || ''}
                    onChange={(e) => setEditingCharacter({
                      ...editingCharacter,
                      visualDNA: { 
                        ...editingCharacter.visualDNA, 
                        face: { ...editingCharacter.visualDNA.face, eyes: e.target.value }
                      }
                    })}
                    placeholder="e.g., sapphire blue (#0F52BA)"
                    data-testid="char-eyes-input"
                  />
                </div>
              </div>

              <Separator />
              
              <h4 className="font-medium text-sm">Hair</h4>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="char-hair-style">Style</Label>
                  <Input
                    id="char-hair-style"
                    value={editingCharacter.visualDNA.hair?.style || ''}
                    onChange={(e) => setEditingCharacter({
                      ...editingCharacter,
                      visualDNA: { 
                        ...editingCharacter.visualDNA, 
                        hair: { ...editingCharacter.visualDNA.hair, style: e.target.value }
                      }
                    })}
                    placeholder="e.g., swept back"
                    data-testid="char-hair-style-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="char-hair-color">Color</Label>
                  <Input
                    id="char-hair-color"
                    value={editingCharacter.visualDNA.hair?.color || ''}
                    onChange={(e) => setEditingCharacter({
                      ...editingCharacter,
                      visualDNA: { 
                        ...editingCharacter.visualDNA, 
                        hair: { ...editingCharacter.visualDNA.hair, color: e.target.value }
                      }
                    })}
                    placeholder="e.g., auburn"
                    data-testid="char-hair-color-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="char-hair-length">Length</Label>
                  <Input
                    id="char-hair-length"
                    value={editingCharacter.visualDNA.hair?.length || ''}
                    onChange={(e) => setEditingCharacter({
                      ...editingCharacter,
                      visualDNA: { 
                        ...editingCharacter.visualDNA, 
                        hair: { ...editingCharacter.visualDNA.hair, length: e.target.value }
                      }
                    })}
                    placeholder="e.g., shoulder-length"
                    data-testid="char-hair-length-input"
                  />
                </div>
              </div>

              <Separator />
              
              <h4 className="font-medium text-sm">Clothing</h4>
              
              <div className="space-y-2">
                <Label htmlFor="char-clothing">Typical Outfit</Label>
                <Textarea
                  id="char-clothing"
                  value={editingCharacter.visualDNA.clothing?.typical || ''}
                  onChange={(e) => setEditingCharacter({
                    ...editingCharacter,
                    visualDNA: { 
                      ...editingCharacter.visualDNA, 
                      clothing: { ...editingCharacter.visualDNA.clothing, typical: e.target.value }
                    }
                  })}
                  placeholder="e.g., charcoal three-piece suit, white dress shirt"
                  data-testid="char-clothing-input"
                />
              </div>

              <Separator />
              
              <div className="space-y-2">
                <Label htmlFor="char-personality">Personality/Expression</Label>
                <Textarea
                  id="char-personality"
                  value={editingCharacter.personality || ''}
                  onChange={(e) => setEditingCharacter({
                    ...editingCharacter,
                    personality: e.target.value
                  })}
                  placeholder="e.g., confident, calculating, quiet authority"
                  data-testid="char-personality-input"
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button 
              onClick={handleSaveCharacter}
              disabled={updateCharactersMutation.isPending}
              data-testid="save-character-button"
            >
              {updateCharactersMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CharactersPanel;
