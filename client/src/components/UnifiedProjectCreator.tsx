import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CheckCircle, Clock, AlertCircle, ArrowRight, Wand2, Image, FileText, Sparkles, Volume2, Music, User, Upload, X, Film, MessageSquare } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import StyleSelector from "./StyleSelector";
import SimpleReferenceImageUpload from "./SimpleReferenceImageUpload";
import { ProjectType, MUSIC_VIDEO_STYLES, ANIMATION_STYLES } from "@shared/schema";

interface WorkflowStep {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
}

interface ProjectWorkflow {
  id: string;
  scriptId: number;
  steps: WorkflowStep[];
  currentStep: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export function UnifiedProjectCreator() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  // Form state
  const [projectType, setProjectType] = useState<ProjectType>("video");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [style, setStyle] = useState("auto");
  const [customStylePrompt, setCustomStylePrompt] = useState("");
  const [maintainContinuity, setMaintainContinuity] = useState(true);
  const [referenceImageUrl, setReferenceImageUrl] = useState("");
  const [musicianReferenceImageUrl, setMusicianReferenceImageUrl] = useState("");
  const [voice, setVoice] = useState("alloy");
  const [audioModel, setAudioModel] = useState("gpt-4o-mini-tts");
  
  // Music video audio state
  const [musicAudioUrl, setMusicAudioUrl] = useState("");
  const [musicAudioDuration, setMusicAudioDuration] = useState<number>(0);
  const [musicAudioFilename, setMusicAudioFilename] = useState("");
  const [isUploadingMusicAudio, setIsUploadingMusicAudio] = useState(false);
  
  // Animation Mode state
  const [animationStyle, setAnimationStyle] = useState("south-park");
  const [comedyLevel, setComedyLevel] = useState(50);
  const [absurdityLevel, setAbsurdityLevel] = useState(30);
  
  // Workflow state
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [currentWorkflow, setCurrentWorkflow] = useState<ProjectWorkflow | null>(null);

  // Reset style when project type changes
  useEffect(() => {
    if (projectType === "music-video") {
      setStyle("anime-music-video"); // Default to animated style (recommended for video generation)
    } else if (projectType === "animation") {
      setStyle(animationStyle); // Use the selected animation style
    } else {
      setStyle("auto");
    }
  }, [projectType, animationStyle]);

  // Script enhancement mutation
  const enhanceScriptMutation = useMutation({
    mutationFn: async (data: { title: string; content: string }) => {
      return apiRequest<{ enhancedScript: string }>('/api/enhance-script', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (response) => {
      setContent(response.enhancedScript);
      toast({
        title: "Script Enhanced",
        description: "Your script has been optimized for YouTube explainer videos!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Enhancement Failed",
        description: error.message || "Failed to enhance script",
        variant: "destructive",
      });
    },
  });

  // Create project workflow mutation
  const createWorkflowMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      content: string;
      style: string;
      customStylePrompt?: string;
      maintainContinuity: boolean;
      referenceImageUrl?: string;
      voice?: string;
      audioModel?: string;
      projectType?: string;
      musicAudioFilePath?: string;
      animationSettings?: {
        style: string;
        comedyLevel: number;
        absurdityLevel: number;
      };
    }) => {
      return apiRequest<{ workflowId: string; message: string }>('/api/workflows/create-project', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (response) => {
      setWorkflowId(response.workflowId);
      toast({
        title: "Project Started",
        description: "Your project is being created automatically. You can sit back and relax!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start project creation",
        variant: "destructive",
      });
    },
  });

  // Poll for workflow status
  const { data: workflow } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => workflowId ? apiRequest<ProjectWorkflow>(`/api/workflows/${workflowId}`) : null,
    enabled: !!workflowId,
    refetchInterval: workflowId && currentWorkflow?.status === 'processing' ? 2000 : false,
  });

  // WebSocket connection for real-time workflow notifications
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Workflow WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'workflowCompleted' && message.data.workflowId === workflowId) {
          // Request notification permission if not already granted
          if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
          }
          
          // Show browser notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Project Complete!', {
              body: message.data.message,
              icon: '/favicon.ico',
              tag: `workflow-${workflowId}`,
            });
          }
          
          // Show toast notification
          toast({
            title: "Project Complete!",
            description: message.data.message,
          });
          
          // Refresh workflow data
          if (workflowId) {
            // The regular polling will pick up the completion
          }
        }
        
        if (message.type === 'workflowFailed' && message.data.workflowId === workflowId) {
          // Show browser notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Project Failed', {
              body: message.data.message,
              icon: '/favicon.ico',
              tag: `workflow-${workflowId}`,
            });
          }
          
          // Show toast notification
          toast({
            title: "Project Failed",
            description: message.data.message,
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('Workflow WebSocket disconnected');
    };

    ws.onerror = (error) => {
      console.error('Workflow WebSocket error:', error);
    };

    return () => {
      ws.close();
    };
  }, [workflowId, toast]);

  useEffect(() => {
    if (workflow) {
      setCurrentWorkflow(workflow);
      
      // Navigate to project when workflow is completed
      if (workflow.status === 'completed') {
        setTimeout(() => {
          navigate(`/project/${workflow.scriptId}`);
        }, 2000);
      }
    }
  }, [workflow, navigate]);

  const resetForm = () => {
    setProjectType("video");
    setTitle("");
    setContent("");
    setStyle("auto");
    setCustomStylePrompt("");
    setMaintainContinuity(true);
    setReferenceImageUrl("");
    setMusicianReferenceImageUrl("");
    setVoice("alloy");
    setAudioModel("gpt-4o-mini-tts");
    setMusicAudioUrl("");
    setMusicAudioDuration(0);
    setMusicAudioFilename("");
    setWorkflowId(null);
    setCurrentWorkflow(null);
  };

  // Handle music audio file upload
  const handleMusicAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an audio file smaller than 100MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingMusicAudio(true);
    
    try {
      const formData = new FormData();
      formData.append("musicAudio", file);
      
      const response = await fetch("/api/upload-music-audio", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      
      const data = await response.json();
      setMusicAudioUrl(data.audioUrl);
      setMusicAudioDuration(data.duration);
      setMusicAudioFilename(data.filename);
      
      toast({
        title: "Audio uploaded successfully",
        description: `Duration: ${Math.floor(data.duration / 60)}:${String(Math.floor(data.duration % 60)).padStart(2, '0')}`,
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Failed to upload audio file",
        variant: "destructive",
      });
    } finally {
      setIsUploadingMusicAudio(false);
    }
  };

  const removeMusicAudio = () => {
    setMusicAudioUrl("");
    setMusicAudioDuration(0);
    setMusicAudioFilename("");
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !content.trim()) {
      toast({
        title: "Missing Information",
        description: projectType === "music-video" 
          ? "Please provide both a song title and lyrics"
          : "Please provide both a title and script content",
        variant: "destructive",
      });
      return;
    }

    // For music video, musician reference is highly recommended
    if (projectType === "music-video" && !musicianReferenceImageUrl) {
      toast({
        title: "Recommendation",
        description: "For best results, upload a reference image of the musician to ensure consistent appearance across all scenes.",
      });
    }

    // Build the mutation data
    const mutationData: any = {
      title: title.trim(),
      content: content.trim(),
      style: projectType === "animation" ? animationStyle : style,
      customStylePrompt: style === 'custom' ? customStylePrompt : undefined,
      maintainContinuity: true,
      referenceImageUrl: projectType === "music-video" ? musicianReferenceImageUrl : referenceImageUrl || undefined,
      voice,
      audioModel,
      projectType,
      musicAudioFilePath: projectType === "music-video" ? musicAudioUrl : undefined,
    };

    // Add animation settings if animation mode
    if (projectType === "animation") {
      mutationData.animationSettings = {
        style: animationStyle,
        comedyLevel,
        absurdityLevel,
      };
    }

    createWorkflowMutation.mutate(mutationData);
  };

  const getStepIcon = (step: WorkflowStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'processing':
        return <Clock className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
    }
  };

  const getOverallProgress = () => {
    if (!currentWorkflow) return 0;
    const completedSteps = currentWorkflow.steps.filter(step => step.status === 'completed').length;
    return Math.round((completedSteps / currentWorkflow.steps.length) * 100);
  };

  // Show workflow progress if workflow is started
  if (workflowId && currentWorkflow) {
    return (
      <div className="w-full max-w-2xl mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
        <Card>
          <CardHeader className="text-center pb-4 sm:pb-6">
            <CardTitle className="flex items-center justify-center gap-2 text-lg sm:text-xl">
              <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              Creating Your Project
            </CardTitle>
            <CardDescription className="text-sm sm:text-base px-2 sm:px-0">
              Sit back and relax while we automatically generate your storyboard and images
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6 px-3 sm:px-6">
            {/* Overall Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Overall Progress</span>
                <span>{getOverallProgress()}%</span>
              </div>
              <Progress value={getOverallProgress()} className="h-2" />
            </div>

            {/* Step Details */}
            <div className="space-y-3 sm:space-y-4">
              {currentWorkflow.steps.map((step, index) => (
                <div key={step.id} className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg border">
                  {getStepIcon(step)}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm sm:text-base truncate">{step.name}</div>
                    {step.status === 'processing' && step.progress !== undefined && (
                      <div className="mt-1">
                        <Progress value={step.progress} className="h-1" />
                        <span className="text-xs text-muted-foreground">
                          {step.progress}% complete
                        </span>
                      </div>
                    )}
                    {step.error && (
                      <div className="text-xs sm:text-sm text-red-500 mt-1">{step.error}</div>
                    )}
                  </div>
                  {step.status === 'completed' && index < currentWorkflow.steps.length - 1 && (
                    <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>

            {/* Background Processing Notice */}
            {currentWorkflow.status === 'processing' && (
              <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-start gap-2 sm:gap-3">
                  <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h4 className="font-medium text-blue-900 text-sm sm:text-base">Processing in Background</h4>
                    <p className="text-xs sm:text-sm text-blue-700 mt-1">
                      Your project is being created. Feel free to navigate away - we'll notify you when it's complete. 
                      This process can take 2-5 minutes depending on complexity.
                    </p>
                    <div className="mt-3 flex flex-col sm:flex-row gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => navigate('/projects')}
                        className="text-blue-700 border-blue-300 hover:bg-blue-100 w-full sm:w-auto"
                      >
                        View All Projects
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={resetForm}
                        className="text-blue-700 border-blue-300 hover:bg-blue-100 w-full sm:w-auto"
                      >
                        Start Another Project
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Completion Message */}
            {currentWorkflow.status === 'completed' && (
              <div className="text-center space-y-3 sm:space-y-4 pt-4 border-t">
                <CheckCircle className="h-10 w-10 sm:h-12 sm:w-12 text-green-500 mx-auto" />
                <div>
                  <h3 className="font-semibold text-base sm:text-lg">Project Created Successfully!</h3>
                  <p className="text-muted-foreground text-sm sm:text-base">
                    Your storyboard and images have been generated
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-4">
                  <Button 
                    onClick={() => navigate(`/project/${currentWorkflow.scriptId}`)}
                    className="w-full sm:flex-1"
                  >
                    View Project
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={resetForm}
                    className="w-full sm:flex-1"
                  >
                    Create Another
                  </Button>
                </div>
              </div>
            )}

            {/* Failure Message */}
            {currentWorkflow.status === 'failed' && (
              <div className="text-center space-y-3 sm:space-y-4 pt-4 border-t">
                <AlertCircle className="h-10 w-10 sm:h-12 sm:w-12 text-red-500 mx-auto" />
                <div>
                  <h3 className="font-semibold text-base sm:text-lg">Something went wrong</h3>
                  <p className="text-muted-foreground text-sm sm:text-base px-2 sm:px-0">
                    Please try creating your project again or contact support if the issue persists.
                  </p>
                  <Button 
                    onClick={() => {
                      setWorkflowId(null);
                      setCurrentWorkflow(null);
                    }}
                    variant="outline"
                    className="w-full sm:w-auto"
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show project creation form
  return (
    <div className="w-full max-w-2xl mx-auto p-3 sm:p-6">
      <Card>
        <CardHeader className="text-center pb-4 sm:pb-6">
          <CardTitle className="flex items-center justify-center gap-2 text-lg sm:text-xl">
            {projectType === "music-video" ? (
              <Music className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            ) : projectType === "animation" ? (
              <Film className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            ) : (
              <Wand2 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            )}
            {projectType === "music-video" 
              ? "Create Music Video" 
              : projectType === "animation" 
                ? "Create Animated Video" 
                : "Create Your Project"}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base px-2 sm:px-0">
            {projectType === "music-video" 
              ? "Upload your song lyrics and artist reference to generate a stunning music video"
              : projectType === "animation"
                ? "Write dialogue and create animated videos with AI-generated voices and lip-sync"
                : "Just provide your script and style preferences. We'll handle the rest automatically!"}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
            {/* Project Type Selection */}
            <div className="space-y-3">
              <Label className="text-sm sm:text-base">Project Type</Label>
              <div className="grid grid-cols-3 gap-2">
                <div 
                  onClick={() => setProjectType("video")}
                  className={`cursor-pointer p-3 rounded-lg border-2 transition-all ${
                    projectType === "video" 
                      ? "border-primary bg-primary/5" 
                      : "border-muted hover:border-muted-foreground/50"
                  }`}
                  data-testid="project-type-standard"
                >
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4" />
                    <span className="font-medium text-sm">Standard</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Videos & blogs</p>
                </div>
                <div 
                  onClick={() => setProjectType("music-video")}
                  className={`cursor-pointer p-3 rounded-lg border-2 transition-all ${
                    projectType === "music-video" 
                      ? "border-primary bg-primary/5" 
                      : "border-muted hover:border-muted-foreground/50"
                  }`}
                  data-testid="project-type-music-video"
                >
                  <div className="flex items-center gap-2">
                    <Music className="h-4 w-4" />
                    <span className="font-medium text-sm">Music Video</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Lyrics to video</p>
                </div>
                <div 
                  onClick={() => setProjectType("animation")}
                  className={`cursor-pointer p-3 rounded-lg border-2 transition-all ${
                    projectType === "animation" 
                      ? "border-primary bg-primary/5" 
                      : "border-muted hover:border-muted-foreground/50"
                  }`}
                  data-testid="project-type-animation"
                >
                  <div className="flex items-center gap-2">
                    <Film className="h-4 w-4" />
                    <span className="font-medium text-sm">Animation</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Dialogue + lip-sync</p>
                </div>
              </div>
            </div>

            {/* Project/Song/Episode Title */}
            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm sm:text-base">
                {projectType === "music-video" 
                  ? "Song Title" 
                  : projectType === "animation" 
                    ? "Episode Title" 
                    : "Project Title"}
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  projectType === "music-video" 
                    ? "Enter your song title..." 
                    : projectType === "animation"
                      ? "Enter your episode title..."
                      : "Enter your project title..."
                }
                className="text-sm sm:text-base"
                required
                data-testid="input-title"
              />
            </div>

            {/* Animation Mode: Style and Settings */}
            {projectType === "animation" && (
              <div className="space-y-4 p-4 border-2 border-dashed border-primary/30 rounded-lg bg-primary/5">
                <div className="space-y-2">
                  <Label className="text-sm sm:text-base flex items-center gap-2">
                    <Film className="h-4 w-4" />
                    Animation Style
                  </Label>
                  <Select value={animationStyle} onValueChange={setAnimationStyle}>
                    <SelectTrigger data-testid="select-animation-style">
                      <SelectValue placeholder="Select animation style" />
                    </SelectTrigger>
                    <SelectContent>
                      {ANIMATION_STYLES.map((style) => (
                        <SelectItem key={style.value} value={style.value}>
                          <span>{style.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {ANIMATION_STYLES.find(s => s.value === animationStyle)?.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-2">
                      Comedy Level: {comedyLevel}%
                    </Label>
                    <Slider
                      value={[comedyLevel]}
                      onValueChange={(value) => setComedyLevel(value[0])}
                      min={0}
                      max={100}
                      step={10}
                      className="w-full"
                      data-testid="slider-comedy"
                    />
                    <p className="text-xs text-muted-foreground">
                      How funny should the dialogue be?
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-2">
                      Absurdity Level: {absurdityLevel}%
                    </Label>
                    <Slider
                      value={[absurdityLevel]}
                      onValueChange={(value) => setAbsurdityLevel(value[0])}
                      min={0}
                      max={100}
                      step={10}
                      className="w-full"
                      data-testid="slider-absurdity"
                    />
                    <p className="text-xs text-muted-foreground">
                      How surreal/unexpected?
                    </p>
                  </div>
                </div>

                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    <strong>Animation Mode:</strong> Your script will be analyzed for dialogue, 
                    characters will get unique AI voices, images will be optimized for lip-sync, 
                    and your final video will feature animated talking characters.
                  </p>
                </div>
              </div>
            )}

            {/* Music Video: Musician Reference Image (Prominent placement) */}
            {projectType === "music-video" && (
              <div className="space-y-2 p-4 border-2 border-dashed border-primary/30 rounded-lg bg-primary/5">
                <Label className="text-sm sm:text-base flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Artist Reference Image
                  <span className="text-xs text-muted-foreground">(Highly Recommended)</span>
                </Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Upload a clear photo of the musician/artist to ensure consistent appearance across all scenes
                </p>
                <SimpleReferenceImageUpload
                  onImageUploaded={setMusicianReferenceImageUrl}
                  isDisabled={false}
                />
              </div>
            )}

            {/* Music Video: Song Audio Upload */}
            {projectType === "music-video" && (
              <div className="space-y-2 p-4 border-2 border-dashed border-primary/30 rounded-lg bg-primary/5">
                <Label className="text-sm sm:text-base flex items-center gap-2">
                  <Music className="h-4 w-4" />
                  Song Audio File
                  <span className="text-xs text-muted-foreground">(Optional - for precise timing)</span>
                </Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Upload your song's audio file to intelligently sync scene timing with the music (4-12s per scene)
                </p>
                
                {musicAudioUrl ? (
                  <div className="flex items-center gap-3 p-3 bg-background rounded-lg border">
                    <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <Music className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{musicAudioFilename}</p>
                      <p className="text-xs text-muted-foreground">Duration: {formatDuration(musicAudioDuration)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={removeMusicAudio}
                      className="flex-shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 bg-background rounded-lg border border-dashed">
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleMusicAudioUpload}
                      disabled={isUploadingMusicAudio}
                      className="hidden"
                      id="music-audio-upload"
                      data-testid="input-music-audio"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('music-audio-upload')?.click()}
                      disabled={isUploadingMusicAudio}
                      className="gap-2"
                      data-testid="button-upload-music-audio"
                    >
                      {isUploadingMusicAudio ? (
                        <>
                          <Upload className="h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Upload Audio File
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      MP3, WAV, M4A, AAC up to 100MB
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Script/Lyrics/Dialogue Content */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                <Label htmlFor="content" className="text-sm sm:text-base">
                  {projectType === "music-video" 
                    ? "Song Lyrics" 
                    : projectType === "animation" 
                      ? "Dialogue Script" 
                      : "Script Content"}
                </Label>
                {projectType !== "music-video" && projectType !== "animation" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!title.trim()) {
                        toast({
                          title: "Title Required",
                          description: "Please enter a project title first to enhance your script",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (!content.trim()) {
                        toast({
                          title: "Script Required",
                          description: "Please enter some script content to enhance",
                          variant: "destructive",
                        });
                        return;
                      }
                      enhanceScriptMutation.mutate({ title: title.trim(), content: content.trim() });
                    }}
                    disabled={enhanceScriptMutation.isPending}
                    className="gap-2 w-full sm:w-auto"
                  >
                    <Sparkles className="h-3 w-3" />
                    {enhanceScriptMutation.isPending ? "Enhancing..." : "AI Enhance"}
                  </Button>
                )}
              </div>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={projectType === "music-video" 
                  ? "Paste your song lyrics here...\n\n[Verse 1]\nYour lyrics go here...\n\n[Chorus]\nChorus lyrics..." 
                  : projectType === "animation"
                    ? "Write your dialogue script here...\n\nJOHN: Hey, what's going on?\nSARA: Not much, just working on this project.\nNARRATOR: The two friends continued their conversation..."
                    : "Paste your script here..."}
                className="min-h-[150px] sm:min-h-[200px] text-sm sm:text-base"
                required
                data-testid="input-content"
              />
            </div>

            {/* Visual Style - Show music video styles or regular styles */}
            {projectType === "music-video" ? (
              <div className="space-y-2">
                <Label className="text-sm sm:text-base">Music Video Style</Label>
                <RadioGroup
                  value={style}
                  onValueChange={setStyle}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                >
                  {MUSIC_VIDEO_STYLES.map((s) => (
                    <div key={s.value} className="flex items-start space-x-2">
                      <RadioGroupItem value={s.value} id={`style-${s.value}`} className="mt-1" />
                      <Label htmlFor={`style-${s.value}`} className="cursor-pointer flex-1">
                        <span className="font-medium text-sm">{s.label}</span>
                        <p className="text-xs text-muted-foreground">{s.description}</p>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            ) : (
              <StyleSelector
                value={style}
                onChange={setStyle}
                customStylePrompt={customStylePrompt}
                onCustomStyleChange={setCustomStylePrompt}
                isDisabled={false}
              />
            )}

            {/* Reference Image - Only for non-music-video projects */}
            {projectType !== "music-video" && (
              <div className="space-y-2">
                <Label>Reference Image (Optional)</Label>
                <SimpleReferenceImageUpload
                  onImageUploaded={setReferenceImageUrl}
                  isDisabled={false}
                />
              </div>
            )}

            {/* Audio Settings */}
            <div className="space-y-3 sm:space-y-4 p-3 sm:p-4 border rounded-lg">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                <h4 className="font-medium flex items-center gap-2 text-sm sm:text-base">
                  <Volume2 className="h-4 w-4" />
                  Audio Generation Settings
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/audio')}
                  type="button"
                  className="w-full sm:w-auto"
                >
                  <Volume2 className="h-3 w-3 mr-1" />
                  Audio Library
                </Button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {/* Voice Selection */}
                <div className="space-y-2">
                  <Label htmlFor="voice" className="text-sm sm:text-base">Voice</Label>
                  <Select value={voice} onValueChange={setVoice}>
                    <SelectTrigger className="text-sm sm:text-base">
                      <SelectValue placeholder="Choose voice..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alloy">Alloy (Neutral)</SelectItem>
                      <SelectItem value="echo">Echo (Male)</SelectItem>
                      <SelectItem value="fable">Fable (British)</SelectItem>
                      <SelectItem value="onyx">Onyx (Deep)</SelectItem>
                      <SelectItem value="nova">Nova (Female)</SelectItem>
                      <SelectItem value="shimmer">Shimmer (Soft)</SelectItem>
                      <SelectItem value="coral">Coral (Warm)</SelectItem>
                      <SelectItem value="sage">Sage (Calm)</SelectItem>
                      <SelectItem value="ballad">Ballad (Smooth)</SelectItem>
                      <SelectItem value="ash">Ash (Clear)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Audio Model */}
                <div className="space-y-2">
                  <Label htmlFor="audioModel" className="text-sm sm:text-base">Audio Quality</Label>
                  <Select value={audioModel} onValueChange={setAudioModel}>
                    <SelectTrigger className="text-sm sm:text-base">
                      <SelectValue placeholder="Choose quality..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o-mini-tts">High Quality (GPT-4o Mini TTS)</SelectItem>
                      <SelectItem value="tts-1">Standard Quality (TTS-1)</SelectItem>
                      <SelectItem value="tts-1-hd">Premium Quality (TTS-1 HD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* What happens next */}
            <div className="p-3 sm:p-4 bg-muted rounded-lg space-y-3">
              <h4 className="font-medium flex items-center gap-2 text-sm sm:text-base">
                {projectType === "music-video" ? <Music className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                What happens next:
              </h4>
              {projectType === "music-video" ? (
                <div className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span>Parse your lyrics into visual scenes and transitions</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span>Create the artist character profile for consistent appearance</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span>Generate cinematic image prompts for each scene</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span>Create stunning visuals with your chosen music video style</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span>Generate Sora video prompts for dynamic video clips</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span>Present your complete music video storyboard</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span>Generate high-quality audio using your selected voice</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span>Analyze your script and break it into timed scenes</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span>Create detailed image prompts for each scene</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span>Generate all images automatically with your chosen style</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span>Present your complete storyboard with audio for review</span>
                  </div>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-12 sm:h-10 text-sm sm:text-base"
              disabled={createWorkflowMutation.isPending}
              data-testid="button-create-project"
            >
              {createWorkflowMutation.isPending ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  {projectType === "music-video" ? "Creating Music Video..." : "Starting Project..."}
                </>
              ) : (
                <>
                  {projectType === "music-video" ? <Music className="h-4 w-4 mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  {projectType === "music-video" ? "Create Music Video" : "Create Project Automatically"}
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}