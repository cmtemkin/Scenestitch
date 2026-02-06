import React, { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Scene } from "@shared/schema";
import { CheckCircle, Clock, ArrowRight, RefreshCw, Eye, Sparkles, ImageIcon, Edit3, Video, Wand2 } from "lucide-react";
// import { ImageEditModal } from "./ImageEditModal";

interface ProjectReviewFlowProps {
  projectId: number;
  onNavigateToThumbnail: () => void;
}

interface WorkflowStep {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
}

interface ThumbnailWorkflow {
  id: string;
  scriptId: number;
  steps: WorkflowStep[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export function ProjectReviewFlow({ projectId, onNavigateToThumbnail }: ProjectReviewFlowProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  
  // State
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [thumbnailWorkflowId, setThumbnailWorkflowId] = useState<string | null>(null);
  const [showSoraStep, setShowSoraStep] = useState(false);

  // Fetch project scenes
  const { data: scenesData, isLoading: scenesLoading } = useQuery({
    queryKey: ['scenes', projectId],
    queryFn: () => apiRequest<{ scenes: Scene[] }>(`/api/scenes/${projectId}`),
    enabled: !!projectId,
  });

  // Fetch project data
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => apiRequest(`/api/projects/${projectId}`),
    enabled: !!projectId,
  });

  // Poll thumbnail workflow if active
  const { data: thumbnailWorkflow } = useQuery({
    queryKey: ['thumbnailWorkflow', thumbnailWorkflowId],
    queryFn: () => thumbnailWorkflowId ? apiRequest<ThumbnailWorkflow>(`/api/workflows/${thumbnailWorkflowId}`) : null,
    enabled: !!thumbnailWorkflowId,
    refetchInterval: thumbnailWorkflowId ? 2000 : false,
  });

  // Regenerate image mutation
  const regenerateImageMutation = useMutation({
    mutationFn: async (sceneId: number) => {
      return apiRequest(`/api/generate-image/${sceneId}`, {
        method: 'POST',
        body: JSON.stringify({ 
          style: project?.style || 'auto',
          customStylePrompt: project?.customStylePrompt || undefined,
          referenceImageUrl: project?.referenceImageUrl || undefined
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenes', projectId] });
      toast({
        title: "Image Regenerated",
        description: "The scene image has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Regeneration Failed",
        description: error.message || "Failed to regenerate image",
        variant: "destructive",
      });
    },
  });

  // Generate Sora prompts mutation
  const generateSoraPromptsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/generate-sora-prompts', {
        method: 'POST',
        body: JSON.stringify({ 
          scriptId: projectId,
          style: project?.style || 'auto',
          customStylePrompt: project?.customStylePrompt || undefined
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenes', projectId] });
      toast({
        title: "Sora Prompts Generated",
        description: "Video animation prompts have been created for your scenes.",
      });
      setShowSoraStep(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate Sora prompts",
        variant: "destructive",
      });
    },
  });

  // Create thumbnail workflow mutation
  const createThumbnailMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<{ workflowId: string }>('/api/workflows/create-thumbnail', {
        method: 'POST',
        body: JSON.stringify({ scriptId: projectId }),
      });
    },
    onSuccess: (response) => {
      setThumbnailWorkflowId(response.workflowId);
      toast({
        title: "Thumbnail Generation Started",
        description: "Your thumbnail is being generated automatically.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start thumbnail generation",
        variant: "destructive",
      });
    },
  });

  const scenes = scenesData?.scenes || [];
  const completedScenes = scenes.filter(scene => scene.imageUrl);
  const scenesWithSoraPrompts = scenes.filter(scene => scene.soraPrompt);
  const progressPercentage = scenes.length > 0 ? Math.round((completedScenes.length / scenes.length) * 100) : 0;
  const soraProgressPercentage = completedScenes.length > 0 ? Math.round((scenesWithSoraPrompts.length / completedScenes.length) * 100) : 0;

  const handleRegenerateImage = (sceneId: number) => {
    regenerateImageMutation.mutate(sceneId);
  };

  const handleGenerateSoraPrompts = () => {
    if (completedScenes.length === 0) {
      toast({
        title: "No Images Ready",
        description: "Please wait for images to be generated before creating Sora prompts.",
        variant: "destructive",
      });
      return;
    }
    generateSoraPromptsMutation.mutate();
  };

  const handleProceedToThumbnail = () => {
    if (completedScenes.length === scenes.length) {
      createThumbnailMutation.mutate();
    } else {
      toast({
        title: "Not Ready",
        description: "Please wait for all images to be generated before proceeding to thumbnail creation.",
        variant: "destructive",
      });
    }
  };

  const handleSkipSoraAndProceed = () => {
    setShowSoraStep(false);
    handleProceedToThumbnail();
  };

  // Show thumbnail generation progress
  if (thumbnailWorkflowId && thumbnailWorkflow) {
    const isCompleted = thumbnailWorkflow.status === 'completed';
    
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              {isCompleted ? "Thumbnail Generated!" : "Generating Your Thumbnail"}
            </CardTitle>
            <CardDescription>
              {isCompleted 
                ? "Your project thumbnail has been created successfully"
                : "Creating your YouTube thumbnail automatically"
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Thumbnail workflow steps */}
            <div className="space-y-4">
              {thumbnailWorkflow.steps.map((step) => (
                <div key={step.id} className="flex items-center gap-3 p-3 rounded-lg border">
                  {step.status === 'completed' ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : step.status === 'processing' ? (
                    <Clock className="h-5 w-5 text-blue-500 animate-spin" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{step.name}</div>
                    {step.status === 'processing' && step.progress !== undefined && (
                      <div className="mt-1">
                        <Progress value={step.progress} className="h-1" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {isCompleted && (
              <div className="text-center space-y-4 pt-4 border-t">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                <div>
                  <h3 className="font-semibold text-lg">All Done!</h3>
                  <p className="text-muted-foreground mb-4">
                    Your project is complete with storyboard and thumbnail ready.
                  </p>
                  <Button onClick={() => navigate(`/project/${projectId}`)}>
                    <Eye className="h-4 w-4 mr-2" />
                    View Complete Project
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show storyboard review
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Progress Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Eye className="h-6 w-6 text-primary" />
              Review Your Storyboard
            </span>
            <Badge variant={progressPercentage === 100 ? "default" : "secondary"}>
              {completedScenes.length} of {scenes.length} images ready
            </Badge>
          </CardTitle>
          <CardDescription>
            Review your automatically generated storyboard. You can regenerate any images you'd like to improve.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{progressPercentage}% complete</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
            
            {progressPercentage === 100 && !showSoraStep && (
              <div className="flex justify-end gap-3 pt-4">
                <Button 
                  onClick={() => setShowSoraStep(true)}
                  variant="outline"
                  size="lg"
                >
                  <Video className="h-4 w-4 mr-2" />
                  Create Sora Prompts
                </Button>
                <Button 
                  onClick={handleProceedToThumbnail}
                  disabled={createThumbnailMutation.isPending}
                  size="lg"
                >
                  {createThumbnailMutation.isPending ? (
                    <>
                      <Clock className="h-4 w-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Generate Thumbnail
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sora Prompts Step */}
      {showSoraStep && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
              <Video className="h-5 w-5" />
              Create Video Animation Prompts
            </CardTitle>
            <CardDescription className="text-blue-700 dark:text-blue-300">
              Generate Sora prompts to animate your static images into videos. This step is optional but enhances your project for video creation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span>Sora Prompts Progress</span>
                <span>{scenesWithSoraPrompts.length} of {completedScenes.length} scenes</span>
              </div>
              <Progress value={soraProgressPercentage} className="h-2" />
              
              <div className="flex justify-between pt-4">
                <Button 
                  onClick={() => setShowSoraStep(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
                <div className="flex gap-3">
                  <Button 
                    onClick={handleSkipSoraAndProceed}
                    variant="outline"
                  >
                    Skip & Continue
                  </Button>
                  <Button 
                    onClick={handleGenerateSoraPrompts}
                    disabled={generateSoraPromptsMutation.isPending}
                  >
                    {generateSoraPromptsMutation.isPending ? (
                      <>
                        <Clock className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4 mr-2" />
                        Generate Sora Prompts
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scenes Grid */}
      {scenesLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="aspect-video bg-muted rounded-lg mb-3" />
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scenes.map((scene) => (
            <Card key={scene.id} className="overflow-hidden">
              <CardContent className="p-0">
                {/* Image */}
                <div className="aspect-video relative bg-muted">
                  {scene.imageUrl ? (
                    <>
                      <img
                        src={scene.imageUrl}
                        alt={`Scene ${scene.sceneNumber}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2 right-2">
                        <Badge variant="secondary" className="bg-green-500/20 text-green-700">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Ready
                        </Badge>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center space-y-2">
                        <Clock className="h-8 w-8 mx-auto text-muted-foreground animate-spin" />
                        <p className="text-sm text-muted-foreground">Generating...</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="font-medium text-sm">Scene {scene.sceneNumber}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {scene.scriptExcerpt}
                      </p>
                    </div>
                    {scene.soraPrompt && (
                      <Badge variant="secondary" className="bg-blue-500/20 text-blue-700 shrink-0">
                        <Video className="h-3 w-3 mr-1" />
                        Sora
                      </Badge>
                    )}
                  </div>
                  
                  {scene.imageUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRegenerateImage(scene.id)}
                      disabled={regenerateImageMutation.isPending}
                      className="w-full"
                    >
                      {regenerateImageMutation.isPending ? (
                        <>
                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                          Regenerating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Regenerate Image
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* TODO: Add image editing modal when needed */}
    </div>
  );
}