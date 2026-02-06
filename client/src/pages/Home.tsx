import React, { useState, useEffect } from "react";
import { useLocation, useParams, useRoute, useRouter, Link } from "wouter";
import Sidebar from "@/components/Sidebar";
import PreviewPanel from "@/components/PreviewPanel";
import AnimationModePanel from "@/components/AnimationModePanel";
import ManualDialogueBuilder from "@/components/ManualDialogueBuilder";
import AnimationWizard from "@/components/AnimationWizard";
import ProcessingModal from "@/components/ProcessingModal";
import { AudioUpload } from "@/components/AudioUpload";
import { AudioSelector } from "@/components/AudioSelector";
import { ImageEditModal } from "@/components/ImageEditModal";
import OnboardingGuide from "@/components/OnboardingGuide";

import { ThumbnailConfig } from "@/components/ThumbnailConfigModal";
import ProjectTypeSelector from "@/components/ProjectTypeSelector";
import ProjectTitleBar from "@/components/ProjectTitleBar";
import { JobStatusIndicator } from "@/components/JobStatusIndicator";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ProjectType, Scene, Script } from "@shared/schema";
import { ChevronDown, Lightbulb, Music, Pencil, Plus, Save, Eye, EyeOff } from "lucide-react";
import { demoScript } from "@/lib/demoScript";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useScenes } from "@/hooks/useScenes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const Home: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Router
  const [location, navigate] = useLocation();
  const [matched, params] = useRoute<{ id: string }>("/project/:id");
  
  // Extract project ID from URL parameters or path
  const getProjectIdFromUrl = () => {
    if (params?.id) {
      return parseInt(params.id);
    }
    
    // Alternative way to get ID from path for debugging
    const pathParts = location.split('/');
    if (pathParts[1] === 'project' && pathParts[2]) {
      console.log("Found project ID in path:", pathParts[2]);
      return parseInt(pathParts[2]);
    }
    
    return null;
  };
  
  const projectId = getProjectIdFromUrl();
  
  // Log router state for debugging
  useEffect(() => {
    console.log("Router state:", { 
      location, 
      matched, 
      params, 
      projectId 
    });
  }, [location, matched, params, projectId]);
  
  // State
  const [script, setScript] = useState<string>("");
  const [projectType, setProjectType] = useState<ProjectType>("video");
  const [style, setStyle] = useState<string>("auto");
  const [customStylePrompt, setCustomStylePrompt] = useState<string>("");
  const [maintainContinuity, setMaintainContinuity] = useState<boolean>(true);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string>("");
  const [scriptId, setScriptId] = useState<number | null>(null);
  const [projectTitle, setProjectTitle] = useState<string>("");
  const [projectDescription, setProjectDescription] = useState<string>("");
  const [selectedAudioId, setSelectedAudioId] = useState<number | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState<boolean>(false);
  const [editingImageScene, setEditingImageScene] = useState<Scene | null>(null);
  const [isSaveAsMode, setIsSaveAsMode] = useState<boolean>(false);
  const [processingModalOpen, setProcessingModalOpen] = useState<boolean>(false);
  const [isManualMode, setIsManualMode] = useState<boolean>(false);
  const [manualSceneInput, setManualSceneInput] = useState<string>("");
  const [showAddManualSceneDialog, setShowAddManualSceneDialog] = useState<boolean>(false);
  const [isManualSceneProcessing, setIsManualSceneProcessing] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState({
    scenePrompts: { completed: 0, total: 0 },
    images: { completed: 0, total: 0 },
    soraPrompts: { completed: 0, total: 0 },
  });
  
  // Track which scenes are currently having images generated
  const [generatingSceneIds, setGeneratingSceneIds] = useState<number[]>([]);
  const [regeneratingSoraPromptIds, setRegeneratingSoraPromptIds] = useState<number[]>([]);
  
  // First-time experience state
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  
  // Mobile editor visibility state
  const [mobileEditorVisible, setMobileEditorVisible] = useState<boolean>(true);
  
  // Desktop sidebar collapsed state (for maximizing preview space)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  
  // Audio upload state
  const [hasAudio, setHasAudio] = useState<boolean>(false);
  const [audioInfo, setAudioInfo] = useState<{ duration: number; url: string } | null>(null);
  
  // Thumbnail state
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  
  // Active tab state to control audio upload visibility
  const [activePreviewTab, setActivePreviewTab] = useState<string>("storyboard");
  
  // Fetch project data if editing an existing project - with enhanced reliability
  const { data: projectData, isLoading: isLoadingProject, refetch: refetchProject, error: projectError } = useQuery<{
    id: number;
    title: string;
    description: string;
    content: string;
    projectType: ProjectType;
    style: string;
    customStylePrompt?: string;
    maintainContinuity: boolean;
    referenceImageUrl: string;
    status: string;
    updatedAt: string;
    createdAt: string;
    audioFilePath?: string;
    audioDuration?: number;
    animationStatus?: string;
    storyboardVersion?: number;
  }>({
    queryKey: ['/api/projects', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('No project ID provided');
      
      console.log(`Fetching project data for ID: ${projectId}`);
      
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) {
        throw new Error(`Failed to load project ${projectId}: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`Successfully loaded project ${projectId}: "${data.title}"`);
      
      return data;
    },
    enabled: !!projectId,
    refetchOnWindowFocus: false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 2 * 60 * 1000, // 2 minutes cache for better responsiveness
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  // Get scenes for the current script
  const { scenes, isLoading: isLoadingScenes, error, refetch: refetchScenes } = useScenes(scriptId);
  
  // Fetch selected audio data for audio-driven projects
  const { data: selectedAudioData } = useQuery({
    queryKey: ['/api/audio', selectedAudioId],
    queryFn: async () => {
      if (!selectedAudioId) return null;
      const response = await fetch(`/api/audio/${selectedAudioId}`);
      if (!response.ok) throw new Error('Failed to fetch audio data');
      return response.json();
    },
    enabled: !!selectedAudioId,
  });

  // Effect to refetch scenes when scriptId changes - with validation
  useEffect(() => {
    if (scriptId) {
      console.log("Refetching scenes for scriptId:", scriptId);
      
      // Validate that project data is loaded before fetching scenes
      const fetchScenesWithValidation = async () => {
        // If we have a projectId but no projectData yet, wait for it
        if (projectId && !projectData && isLoadingProject) {
          console.log("Waiting for project data to load before fetching scenes...");
          return;
        }
        
        // Ensure scenes are fetched
        try {
          await refetchScenes();
        } catch (error) {
          console.error("Error fetching scenes:", error);
          // Retry once after a delay if initial fetch fails
          setTimeout(() => {
            refetchScenes();
          }, 1000);
        }
      };
      
      fetchScenesWithValidation();
    }
  }, [scriptId, refetchScenes, projectId, projectData, isLoadingProject]);

  // Check onboarding status when component mounts
  useEffect(() => {
    // Only show onboarding for new projects
    if (!projectId && !localStorage.getItem('onboardingComplete')) {
      setShowOnboarding(true);
    }
  }, [projectId]);
  
  // Log scenes when they change
  useEffect(() => {
    if (scenes.length > 0) {
      console.log(`Loaded ${scenes.length} scenes for project`);
    }
  }, [scenes]);

  // Fetch associated audio data for projects that have TTS audio
  const { data: projectAudioData } = useQuery({
    queryKey: ['/api/audio/by-project', projectId],
    queryFn: async () => {
      if (!projectData) {
        return null;
      }
      
      // For audio-driven projects, find by content/file path matching
      if (projectData.projectType === 'audio-driven') {
        const response = await fetch('/api/audio');
        if (!response.ok) throw new Error('Failed to fetch audio data');
        const audioFiles = await response.json();
        
        // Find audio file that matches the project's script content or audio file path
        const matchingAudio = audioFiles.find((audio: any) => {
          const contentMatch = audio.content === projectData.content;
          const filePathMatch = projectData.audioFilePath && audio.audioUrl && 
           projectData.audioFilePath.includes(audio.audioUrl.split('/').pop());
          
          return contentMatch || filePathMatch;
        });
        
        return matchingAudio || null;
      }
      
      // For any project with audioTTSId (including video projects), fetch the TTS audio
      if ((projectData as any).audioTTSId) {
        const response = await fetch(`/api/audio/${(projectData as any).audioTTSId}`);
        if (!response.ok) return null;
        return response.json();
      }
      
      return null;
    },
    enabled: !!projectData,
  });
  
  // Effect to refetch project when projectId changes
  useEffect(() => {
    if (projectId) {
      console.log("Refetching project for projectId:", projectId);
      refetchProject();
    }
  }, [projectId, refetchProject]);
  
  // Initialize script with empty string to avoid undefined.trim() errors
  useEffect(() => {
    setScript(script || "");
  }, []);
  
  // Auto-populate content when audio is selected for audio-driven projects
  useEffect(() => {
    if (projectType === "audio-driven" && selectedAudioData) {
      setScript(selectedAudioData.content || "");
      setProjectTitle(selectedAudioData.title || "");
      
      // Auto-populate audio processing with the selected audio file
      if (selectedAudioData.audioUrl && selectedAudioData.duration) {
        setHasAudio(true);
        setAudioInfo({
          duration: selectedAudioData.duration,
          url: selectedAudioData.audioUrl
        });
      }
    }
  }, [projectType, selectedAudioData]);

  // Check if project already has audio processing completed
  const hasExistingAudioProcessing = Boolean(projectType === "audio-driven" && 
    projectId && 
    scenes.length > 0 && 
    scenes.some(scene => scene.exactStartTime !== null && scene.exactEndTime !== null));
  
  // Load project data immediately when available - progressive loading
  useEffect(() => {
    if (projectData) {
      console.log("Project data loaded:", projectData);
      
      const project = projectData;
      console.log("Setting script to:", project.content?.substring(0, 50) + "...");
      
      // Set data immediately for instant UI updates
      setProjectType(project.projectType || "video");
      setStyle(project.style || "retro");
      setCustomStylePrompt((project as any).customStylePrompt || "");
      setMaintainContinuity(project.maintainContinuity !== undefined ? project.maintainContinuity : true);
      setReferenceImageUrl(project.referenceImageUrl || "");
      setProjectTitle(project.title || "");
      setProjectDescription(project.description || "");
      setThumbnailUrl((project as any).thumbnailUrl || null);
      setScript(project.content || "");
      
      // Set script ID to trigger scene loading - ensure it's set properly
      if (project.id) {
        console.log("Setting scriptId to:", project.id);
        setScriptId(project.id);
      }
      
      // Update mobile title asynchronously 
      const mobileTitleElement = document.getElementById('mobile-project-title');
      if (mobileTitleElement) {
        mobileTitleElement.textContent = project.title || '';
      }
    }
  }, [projectData]);
  
  // Handle project loading errors
  useEffect(() => {
    if (projectError) {
      console.error("Project loading error:", projectError);
      toast({
        title: "Error Loading Project",
        description: "Failed to load project data. Please try refreshing the page.",
        variant: "destructive",
      });
    }
  }, [projectError]);
  
  // Mutations
  const generatePromptsMutation = useMutation({
    mutationFn: async () => {
      setProcessingStatus({
        scenePrompts: { completed: 0, total: 1 },
        images: { completed: 0, total: 0 },
        soraPrompts: { completed: 0, total: 0 },
      });
      setProcessingModalOpen(true);
      
      const payload = {
        script,
        style,
        customStylePrompt: style === 'custom' ? customStylePrompt : undefined,
        maintainContinuity,
        referenceImageUrl,
      };
      
      const response = await fetch("/api/generate-prompts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate prompts");
      }
      
      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      setScriptId(data.scriptId);
      setProcessingStatus({
        ...processingStatus,
        scenePrompts: { completed: data.scenes.length, total: data.scenes.length },
      });
      
      // Invalidate scenes query to refetch
      queryClient.invalidateQueries({ queryKey: [`/api/scenes/${data.scriptId}`] });
      
      toast({
        title: "Success",
        description: `Generated ${data.scenes.length} scene prompts`,
      });
      
      setTimeout(() => {
        setProcessingModalOpen(false);
      }, 1000);
    },
    onError: (error) => {
      console.error("Error generating prompts:", error);
      toast({
        title: "Error",
        description: "Failed to generate prompts. Please try again.",
        variant: "destructive",
      });
      setProcessingModalOpen(false);
    }
  });
  
  const generateImagesMutation = useMutation({
    mutationFn: async () => {
      if (!scriptId || !scenes.length) {
        throw new Error("No script or scenes available");
      }
      
      const scenesToProcess = scenes.filter((scene) => !scene.imageUrl);
      if (scenesToProcess.length === 0) {
        throw new Error("All scenes already have images");
      }
      
      setProcessingStatus({
        ...processingStatus,
        images: { completed: 0, total: scenesToProcess.length },
      });
      setProcessingModalOpen(true);
      
      const payload = {
        scenes: scenesToProcess.map(scene => ({
          ...scene,
          scriptId: scriptId
        })),
        style,
        customStylePrompt: style === 'custom' ? customStylePrompt : undefined,
        maintainContinuity,
        referenceImageUrl,
      };
      
      const response = await fetch("/api/generate-images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate images");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setProcessingStatus({
        ...processingStatus,
        images: { completed: data.scenes.length, total: data.scenes.length },
      });
      
      // Invalidate scenes query to refetch
      queryClient.invalidateQueries({ queryKey: [`/api/scenes/${scriptId}`] });
      
      toast({
        title: "Success",
        description: `Generated ${data.scenes.length} images`,
      });
      
      setTimeout(() => {
        setProcessingModalOpen(false);
      }, 1000);
    },
    onError: (error) => {
      console.error("Error generating images:", error);
      toast({
        title: "Error",
        description: "Failed to generate images. Please try again.",
        variant: "destructive",
      });
      setProcessingModalOpen(false);
    }
  });
  
  const generateSoraPromptsMutation = useMutation({
    mutationFn: async () => {
      if (!scriptId || !scenes.length) {
        throw new Error("No script or scenes available");
      }
      
      // Only process scenes that have images but no Sora prompts
      const scenesToProcess = scenes.filter(
        (scene) => scene.imageUrl && !scene.soraPrompt
      );
      
      if (scenesToProcess.length === 0) {
        throw new Error("All scenes already have Sora prompts");
      }
      
      setProcessingStatus({
        ...processingStatus,
        soraPrompts: { completed: 0, total: scenesToProcess.length },
      });
      setProcessingModalOpen(true);
      
      const payload = {
        scriptId,
        style,
        customStylePrompt: style === 'custom' ? customStylePrompt : undefined,
      };
      
      const response = await fetch("/api/generate-sora-prompts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate Sora prompts");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setProcessingStatus({
        ...processingStatus,
        soraPrompts: { completed: data.scenes.length, total: data.scenes.length },
      });
      
      // Invalidate scenes query to refetch
      queryClient.invalidateQueries({ queryKey: [`/api/scenes/${scriptId}`] });
      
      toast({
        title: "Success",
        description: `Generated ${data.scenes.length} Sora prompts`,
      });
      
      setTimeout(() => {
        setProcessingModalOpen(false);
      }, 1000);
    },
    onError: (error) => {
      console.error("Error generating Sora prompts:", error);
      toast({
        title: "Error",
        description: "Failed to generate Sora prompts. Please try again.",
        variant: "destructive",
      });
      setProcessingModalOpen(false);
    }
  });
  
  const generateThumbnailMutation = useMutation({
    mutationFn: async (config?: ThumbnailConfig) => {
      if (!scriptId || !script) {
        throw new Error("No script available");
      }
      
      // Map thumbnail style to video style if using video style, otherwise use thumbnail-specific style
      const thumbnailStyle = config?.style || style;
      
      const payload = {
        scriptId,
        script,
        style: thumbnailStyle,
        customStylePrompt: thumbnailStyle === 'custom' ? customStylePrompt : undefined,
        title: projectTitle || `Video ${scriptId}`,
        // Enhanced configuration options
        thumbnailConfig: config ? {
          customText: config.customText,
          textPlacement: config.textPlacement,
          emphasizeText: config.emphasizeText,
          thumbnailStyle: config.style
        } : undefined
      };
      
      const response = await fetch("/api/generate-thumbnail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || "Failed to generate thumbnail");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Thumbnail generated",
        description: "Your YouTube thumbnail has been created successfully.",
      });
      
      // Update the thumbnail URL in state immediately
      if (data.thumbnailUrl) {
        setThumbnailUrl(data.thumbnailUrl);
      }
      
      // Refresh the project data to show the new thumbnail
      if (scriptId) {
        queryClient.invalidateQueries({ queryKey: ['/api/projects', scriptId] });
      }
    },
    onError: (error: any) => {
      console.error("Error generating thumbnail:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate thumbnail. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  const exportAssetsMutation = useMutation({
    mutationFn: async () => {
      if (!scriptId || !scenes.length) {
        throw new Error("No script or scenes available");
      }
      
      const response = await fetch(`/api/export-assets/${scriptId}`);
      
      if (!response.ok) {
        throw new Error("Failed to export assets");
      }
      
      return response.blob();
    },
    onSuccess: (blob) => {
      // Create a URL for the blob
      const url = window.URL.createObjectURL(blob);
      
      // Create a temporary link and trigger download
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      const sanitizedTitle = projectTitle ? projectTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase() : `script-${scriptId}`;
      a.download = `scenestitch-${sanitizedTitle}.zip`;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      a.remove();
      
      toast({
        title: "Export complete",
        description: "Your assets have been downloaded.",
      });
    },
    onError: (error) => {
      console.error("Error exporting assets:", error);
      toast({
        title: "Error",
        description: "Failed to export assets. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  const saveProjectMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        id: isSaveAsMode ? null : scriptId, // If Save As, always use null to create a new project
        title: projectTitle,
        description: projectDescription || null, // Allow null for empty description
        content: script,
        projectType, // Include project type 
        style,
        customStylePrompt: style === 'custom' ? customStylePrompt : null, // Only send if style is custom, otherwise null
        maintainContinuity,
        referenceImageUrl: referenceImageUrl || null, // Allow null for empty reference image
        status: "draft",
        audioTTSId: projectType === "audio-driven" ? selectedAudioId : null, // Link to audio file for audio-driven projects
        // For Save As, include the source project ID to properly copy scenes with correct numbering
        sourceProjectId: isSaveAsMode ? scriptId : undefined,
      };
      
      // For Save As, always use POST to create a new project
      // For regular Save, use PUT if it exists, POST if it's new
      const method = (scriptId && !isSaveAsMode) ? 'PUT' : 'POST';
      const url = (scriptId && !isSaveAsMode) ? `/api/projects/${scriptId}` : '/api/projects';
      
      console.log("Saving project with payload:", payload);
      console.log("Method:", method, "URL:", url);
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Save project error:", errorText);
        throw new Error(`Failed to save project: ${errorText}`);
      }
      
      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      // Always update the scriptId to the returned ID (important for Save As)
      setScriptId(data.id);
      
      // Update document title to match project title for better user experience
      document.title = `${projectTitle} - SceneStitch`;
      
      toast({
        title: isSaveAsMode ? "Project saved as copy" : "Project saved",
        description: isSaveAsMode 
          ? "A new copy of your project has been created."
          : "Your project has been saved successfully.",
      });
      setSaveDialogOpen(false);
      setIsSaveAsMode(false); // Reset Save As mode
      
      // If this is a new project or Save As, update the URL
      if ((isSaveAsMode || !scriptId) && data.id) {
        navigate(`/project/${data.id}`);
      }
      
      // Update the global project list immediately for a responsive UI
      try {
        const currentProjects = queryClient.getQueryData<any[]>(['/api/projects']);
        if (currentProjects) {
          // For existing project updates
          if (!isSaveAsMode && scriptId) {
            const updatedProjects = currentProjects.map(p => 
              p.id === data.id ? { ...p, title: projectTitle } : p
            );
            queryClient.setQueryData(['/api/projects'], updatedProjects);
          } 
          // For new projects, add to the list
          else {
            const newProject = {
              ...data,
              sceneCount: 0, // New project won't have scenes yet
              updatedAt: new Date().toISOString(),
              createdAt: new Date().toISOString()
            };
            queryClient.setQueryData(['/api/projects'], [...currentProjects, newProject]);
          }
        }
      } catch (err) {
        console.error("Error updating project cache:", err);
      }
      
      // Also invalidate the query to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
    },
    onError: (error) => {
      console.error("Error saving project:", error);
      toast({
        title: "Error",
        description: "Failed to save project. Please try again.",
        variant: "destructive",
      });
      setSaveDialogOpen(false);  // Close the dialog on error too
      setIsSaveAsMode(false);    // Reset Save As mode
    },
  });
  
  // Handle generating scene prompts
  const handleGenerateScenePrompts = () => {
    // Don't allow generating prompts if script is empty
    if (!script || script.trim().length === 0) {
      toast({
        title: "Script Required",
        description: "Please enter a script before generating prompts.",
        variant: "destructive",
      });
      return;
    }
    
    setProcessingStatus({
      ...processingStatus,
      scenePrompts: { completed: 0, total: 1 },
    });
    setProcessingModalOpen(true);
    
    const payload = {
      script,
      style,
      maintainContinuity,
      referenceImageUrl,
      customStylePrompt: style === 'custom' ? customStylePrompt : undefined,
      // Add scriptId if we're working with an existing project
      scriptId: scriptId || undefined,
      // Include the project title, especially important for audio-driven projects
      title: projectTitle || undefined,
      projectType: projectType,
    };
    
    fetch("/api/generate-prompts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to generate prompts");
        }
        return response.json();
      })
      .then((data) => {
        setScriptId(data.scriptId);
        setProcessingStatus({
          ...processingStatus,
          scenePrompts: { completed: data.scenes.length, total: data.scenes.length },
        });
        
        // Check for pinned (edited) prompts that were preserved
        const pinnedCount = data.scenes.filter((scene: any) => scene.isPinned).length;
        if (pinnedCount > 0 && scriptId) {
          toast({
            title: `${pinnedCount} edited prompt${pinnedCount > 1 ? 's' : ''} preserved`,
            description: "Your manually edited prompts were kept unchanged",
          });
        }
        
        // Invalidate scenes query to refetch
        queryClient.invalidateQueries({ queryKey: [`/api/scenes/${data.scriptId}`] });
        
        toast({
          title: "Success",
          description: `Generated ${data.scenes.length} scene prompts`,
        });
      })
      .catch((error) => {
        console.error("Error generating prompts:", error);
        toast({
          title: "Error",
          description: "Failed to generate prompts. Please try again.",
          variant: "destructive",
        });
      })
      .finally(() => {
        setTimeout(() => {
          setProcessingModalOpen(false);
        }, 1000);
      });
  };
  
  // Handle generating images using async job queue
  const handleGenerateImages = async () => {
    if (!scriptId || !scenes.length) return;
    
    // When regenerating, we need to process all scenes
    // Check if we're regenerating (all scenes already have images) or generating first time
    const isRegenerating = scenes.every(scene => scene.imageUrl);
    const scenesToProcess = isRegenerating 
      ? scenes // Include all scenes when regenerating
      : scenes.filter((scene) => !scene.imageUrl); // Only new scenes when first generating
    
    if (scenesToProcess.length === 0) {
      toast({
        title: "No images to generate",
        description: "All scenes already have images. Change settings and try again.",
      });
      return;
    }
    
    try {
      console.log("Current scriptId:", scriptId);
      console.log("Scenes to process:", scenesToProcess.length);
      
      const payload = {
        scenes: scenesToProcess.map(scene => ({
          ...scene,
          scriptId: scriptId
        })),
        style,
        maintainContinuity,
        referenceImageUrl,
        customStylePrompt: style === 'custom' ? customStylePrompt : undefined,
        isRegenerating
      };
      
      console.log("Payload being sent:", JSON.stringify(payload, null, 2));
      
      const response = await fetch("/api/generate-images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error("Failed to start image generation");
      }
      
      const data = await response.json();
      
      toast({
        title: "Image generation started",
        description: `Processing ${scenesToProcess.length} scenes in the background. Watch the progress indicator.`,
      });
      
      console.log(`Started async image generation job: ${data.jobId}`);
      
    } catch (error) {
      console.error("Error starting image generation:", error);
      toast({
        title: "Error",
        description: "Failed to start image generation. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle force regenerating all images (for corrupted/failed workflows)
  const handleForceRegenerateImages = async () => {
    if (!scriptId || !scenes.length) return;
    
    try {
      console.log("Force regenerating images for script:", scriptId);
      
      const payload = {
        scriptId,
        style,
        maintainContinuity,
        referenceImageUrl,
        customStylePrompt: style === 'custom' ? customStylePrompt : undefined,
        forceRegenerate: true
      };
      
      const response = await fetch("/api/generate-images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error("Failed to start force image regeneration");
      }
      
      const data = await response.json();
      
      toast({
        title: "Force image regeneration started",
        description: "Regenerating all problematic images. This will fix corrupted scenes from failed workflows.",
      });
      
      console.log(`Started force regeneration job: ${data.jobId}`);
      
    } catch (error) {
      console.error("Error starting force image regeneration:", error);
      toast({
        title: "Error",
        description: "Failed to start force image regeneration. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  // Handle generating Sora prompts (image-to-video animation)
  const handleGenerateSoraPrompts = () => {
    if (!scriptId || !scenes.length) return;
    
    // Check for scenes with images
    const scenesWithImages = scenes.filter(scene => scene.imageUrl);
    if (scenesWithImages.length === 0) {
      toast({
        title: "No images available",
        description: "Please generate images first before creating Sora prompts.",
        variant: "destructive",
      });
      return;
    }
    
    // Count scenes that need Sora prompts (have images but no Sora prompt)
    const scenesToProcess = scenesWithImages.filter(scene => !scene.soraPrompt);
    if (scenesToProcess.length === 0) {
      toast({
        title: "No scenes to process",
        description: "All scenes with images already have Sora prompts.",
      });
      return;
    }
    
    setProcessingStatus({
      ...processingStatus,
      soraPrompts: { completed: 0, total: scenesToProcess.length },
    });
    setProcessingModalOpen(true);
    
    // We only need to send the scriptId, style and customStylePrompt now
    // The server will fetch all scenes and process only those with images
    const payload = {
      scriptId,
      style,
      customStylePrompt: style === 'custom' ? customStylePrompt : undefined,
    };
    
    fetch("/api/generate-sora-prompts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then((response) => {
        if (!response.ok) {
          // Try to get error message from response
          return response.json().then(data => {
            throw new Error(data.message || "Failed to generate Sora prompts");
          }).catch(() => {
            throw new Error("Failed to generate Sora prompts");
          });
        }
        return response.json();
      })
      .then((data) => {
        setProcessingStatus({
          ...processingStatus,
          soraPrompts: { completed: data.scenes.length, total: data.scenes.length },
        });
        
        // Invalidate scenes query to refetch
        queryClient.invalidateQueries({ queryKey: [`/api/scenes/${scriptId}`] });
        
        toast({
          title: "Success",
          description: `Generated ${data.scenes.length} Sora image-to-video prompts`,
        });
      })
      .catch((error) => {
        console.error("Error generating Sora prompts:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to generate Sora prompts. Please try again.",
          variant: "destructive",
        });
      })
      .finally(() => {
        setTimeout(() => {
          setProcessingModalOpen(false);
        }, 1000);
      });
  };

  // Handle generating Sora videos
  const handleGenerateSoraVideos = () => {
    if (!scriptId || !scenes.length) return;
    
    // Check for scenes with Sora prompts
    const scenesWithSoraPrompts = scenes.filter(scene => scene.soraPrompt && scene.imageUrl);
    if (scenesWithSoraPrompts.length === 0) {
      toast({
        title: "No Sora prompts available",
        description: "Please generate video prompts first before creating Sora videos.",
        variant: "destructive",
      });
      return;
    }
    
    toast({
      title: "Starting video generation",
      description: `Generating ${scenesWithSoraPrompts.length} Sora videos. This runs in the background - you can close this page.`,
    });
    
    fetch(`/api/generate-sora-videos/${scriptId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().then(data => {
            throw new Error(data.message || "Failed to start Sora video generation");
          }).catch(() => {
            throw new Error("Failed to start Sora video generation");
          });
        }
        return response.json();
      })
      .then((data) => {
        toast({
          title: "Video generation started",
          description: `Job ${data.jobId} is processing ${data.scenesCount} videos. Estimated time: ${data.estimatedTime}`,
        });
      })
      .catch((error) => {
        console.error("Error starting Sora video generation:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to start Sora video generation. Please try again.",
          variant: "destructive",
        });
      });
  };
  
  // Handle generating Sora video for a single scene
  const handleGenerateSceneVideo = (sceneId: number) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    
    if (!scene.soraPrompt) {
      toast({
        title: "No video prompt available",
        description: "Please generate a Sora video prompt for this scene first.",
        variant: "destructive",
      });
      return;
    }
    
    if (!scene.imageUrl) {
      toast({
        title: "No image available",
        description: "Please generate an image for this scene first.",
        variant: "destructive",
      });
      return;
    }
    
    toast({
      title: "Starting video generation",
      description: `Generating Sora video for Scene ${scene.sceneNumber}. This runs in the background.`,
    });
    
    fetch(`/api/generate-sora-video/scene/${sceneId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().then(data => {
            throw new Error(data.message || "Failed to start video generation");
          }).catch(() => {
            throw new Error("Failed to start video generation");
          });
        }
        return response.json();
      })
      .then((data) => {
        toast({
          title: "Video generation started",
          description: `Job ${data.jobId} is processing. Estimated time: ${data.estimatedTime}`,
        });
      })
      .catch((error) => {
        console.error("Error starting scene video generation:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to start video generation. Please try again.",
          variant: "destructive",
        });
      });
  };
  
  // Handle generating thumbnail
  const handleGenerateThumbnail = async (config?: ThumbnailConfig) => {
    if (!scriptId || !script) {
      toast({
        title: "No content available",
        description: "Please add a script before generating a thumbnail.",
        variant: "destructive",
      });
      return;
    }
    
    generateThumbnailMutation.mutate(config);
  };
  
  // Handle exporting assets
  const handleExportAssets = () => {
    if (!scriptId || !scenes.length) return;
    
    toast({
      title: "Exporting assets",
      description: "Preparing your assets for download...",
    });
    
    // Check if all scenes have valid image URLs
    const hasImagesCount = scenes.filter(scene => scene.imageUrl).length;
    if (hasImagesCount === 0) {
      toast({
        title: "No images to export",
        description: "Please generate images for at least one scene before exporting.",
        variant: "destructive",
      });
      return;
    }
    
    // If not all scenes have images, warn the user
    if (hasImagesCount < scenes.length) {
      toast({
        title: "Warning",
        description: `Only ${hasImagesCount} of ${scenes.length} scenes have images. Continuing with export...`,
        variant: "default",
      });
    }
    
    // Use a direct browser download approach
    const downloadWindow = window.open(`/api/export-assets/${scriptId}`, '_blank');
    
    // If pop-up was blocked or failed, fallback to iframe
    if (!downloadWindow) {
      toast({
        title: "Download initiated",
        description: "If the download doesn't start automatically, check your pop-up blocker settings.",
      });
      
      // Create an invisible iframe for download
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = `/api/export-assets/${scriptId}`;
      document.body.appendChild(iframe);
      
      // Remove iframe after a reasonable timeout
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 5000);
    } else {
      toast({
        title: "Export complete",
        description: "Your download should begin shortly.",
      });
    }
  };
  
  // Handle updating a scene
  const handleUpdateScene = (id: number, updates: Partial<Scene>) => {
    if (!scriptId) return;
    
    fetch(`/api/scenes/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to update scene");
        }
        return response.json();
      })
      .then((data) => {
        // Update the scene in the cache
        const updatedScenes = scenes.map((scene) => {
          if (scene.id === id) {
            return { ...scene, ...updates };
          }
          return scene;
        });
        
        // Update the cache directly
        queryClient.setQueryData([`/api/scenes/${scriptId}`], {
          scenes: updatedScenes
        });
        
        toast({
          title: "Success",
          description: "Scene updated successfully.",
        });
      })
      .catch((error) => {
        console.error("Error updating scene:", error);
        toast({
          title: "Error",
          description: "Failed to update scene. Please try again.",
          variant: "destructive",
        });
      });
  };
  
  // Handle regenerating a scene prompt
  const handleRegenerateScene = (id: number) => {
    if (!scriptId) return;
    
    toast({
      title: "Regenerating scene",
      description: "Please wait...",
    });
    
    fetch(`/api/regenerate-scene/${id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scriptId,
        style,
        maintainContinuity,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to regenerate scene");
        }
        return response.json();
      })
      .then((data) => {
        // Invalidate scenes query to refetch
        queryClient.invalidateQueries({ queryKey: [`/api/scenes/${scriptId}`] });
        
        toast({
          title: "Success",
          description: "Scene regenerated successfully.",
        });
      })
      .catch((error) => {
        console.error("Error regenerating scene:", error);
        toast({
          title: "Error",
          description: "Failed to regenerate scene. Please try again.",
          variant: "destructive",
        });
      });
  };
  
  // Generate an image for a specific scene
  const generateImageMutation = useMutation({
    mutationFn: async (sceneId: number) => {
      const response = await fetch(`/api/generate-image/${sceneId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ style }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate image");
      }
      
      return response.json();
    }
  });
  
  // Regenerate a Sora prompt for a specific scene
  const regenerateSoraPromptMutation = useMutation({
    mutationFn: async (sceneId: number) => {
      const response = await fetch(`/api/regenerate-sora-prompt/${sceneId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ style }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to regenerate Sora prompt");
      }
      
      return response.json();
    }
  });
  
  // Handle generating an image for a specific scene
  const handleGenerateImage = (id: number) => {
    if (!scriptId) return;
    
    // Add this scene ID to the list of currently generating scenes
    setGeneratingSceneIds((prev) => [...prev, id]);
    
    generateImageMutation.mutate(id, {
      onSuccess: (data) => {
        // Invalidate scenes query to refetch
        queryClient.invalidateQueries({ queryKey: [`/api/scenes/${scriptId}`] });
        
        toast({
          title: "Success",
          description: "Image generated successfully.",
        });
        
        // Remove this scene ID from the list of currently generating scenes
        setGeneratingSceneIds((prev) => prev.filter((sceneId) => sceneId !== id));
      },
      onError: (error) => {
        console.error("Error generating image:", error);
        toast({
          title: "Error",
          description: "Failed to generate image. Please try again.",
          variant: "destructive",
        });
        
        // Remove this scene ID from the list of currently generating scenes
        setGeneratingSceneIds((prev) => prev.filter((sceneId) => sceneId !== id));
      }
    });
  };
  
  // Function to handle regenerating Sora prompt for a specific scene
  const handleRegenerateSoraPrompt = (id: number) => {
    if (!scriptId) return;
    
    // Add this scene ID to the list of currently regenerating Sora prompts
    setRegeneratingSoraPromptIds((prev) => [...prev, id]);
    
    regenerateSoraPromptMutation.mutate(id, {
      onSuccess: (data) => {
        // Invalidate scenes query to refetch
        queryClient.invalidateQueries({ queryKey: [`/api/scenes/${scriptId}`] });
        
        toast({
          title: "Success",
          description: "Sora prompt regenerated successfully.",
        });
        
        // Remove this scene ID from the list of currently regenerating Sora prompts
        setRegeneratingSoraPromptIds((prev) => prev.filter((sceneId) => sceneId !== id));
      },
      onError: (error) => {
        console.error("Error regenerating Sora prompt:", error);
        toast({
          title: "Error",
          description: "Failed to regenerate Sora prompt. Please try again.",
          variant: "destructive",
        });
        
        // Remove this scene ID from the list of currently regenerating Sora prompts
        setRegeneratingSoraPromptIds((prev) => prev.filter((sceneId) => sceneId !== id));
      }
    });
  };
  
  // Function to handle image editing
  const handleEditImage = (sceneId: number) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (scene && scene.imageUrl) {
      setEditingImageScene(scene);
    }
  };
  
  // Function to handle successful image edit
  const handleImageEditSuccess = (updatedScene: Scene) => {
    // Update the local state with the edited scene
    const updatedScenes = scenes.map((scene) => {
      if (scene.id === updatedScene.id) {
        return { ...scene, imageUrl: updatedScene.imageUrl };
      }
      return scene;
    });
    
    // Update the query cache
    queryClient.setQueryData([`/api/scenes/${scriptId}`], {
      scenes: updatedScenes
    });
    
    // Invalidate scenes query to ensure we have the latest data
    queryClient.invalidateQueries({ queryKey: [`/api/scenes/${scriptId}`] });
    
    toast({
      title: "Success",
      description: "Image edited successfully.",
    });
    
    // Close the modal
    setEditingImageScene(null);
  };
  
  // Helper function to check if all scenes have images
  const hasAllImages = (scenes: Scene[]) => {
    return scenes.every((scene) => scene.imageUrl);
  };
  
  // Handle early audio upload (before scene generation)
  const handleAudioUploaded = (uploadedAudioInfo: { duration: number; url: string }) => {
    setHasAudio(true);
    setAudioInfo(uploadedAudioInfo);
    
    toast({
      title: "Audio uploaded",
      description: `Audio file uploaded successfully. Duration: ${uploadedAudioInfo.duration.toFixed(1)}s`,
    });
  };

  // Handle applying selected audio to project
  const handleApplyAudio = (audioData: { title: string; script: string; audioUrl: string; duration: number }) => {
    // Apply the audio data to the project
    setProjectTitle(audioData.title);
    setScript(audioData.script);
    
    toast({
      title: "Audio Applied",
      description: "Project title, script, and audio file have been automatically populated",
    });
  };

  // Handle audio processing
  const handleAudioProcessed = (timestamps: Array<{ sceneId: number, startTime: number, endTime: number }>) => {
    if (!scriptId || !scenes.length || !timestamps.length) return;
    
    // Update each scene with its timestamps
    const updatePromises = timestamps.map(({ sceneId, startTime, endTime }) => {
      return fetch(`/api/scenes/${sceneId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          exactStartTime: startTime,
          exactEndTime: endTime,
        }),
      }).then(res => res.json());
    });
    
    Promise.all(updatePromises)
      .then(() => {
        // Update the scenes in the cache with the new timestamps
        const updatedScenes = scenes.map((scene) => {
          const timestamp = timestamps.find(t => t.sceneId === scene.id);
          if (timestamp) {
            return {
              ...scene,
              exactStartTime: timestamp.startTime,
              exactEndTime: timestamp.endTime,
            };
          }
          return scene;
        });
        
        // Update the cache directly
        queryClient.setQueryData([`/api/scenes/${scriptId}`], {
          scenes: updatedScenes
        });
        
        // Also invalidate to ensure we get the latest from the server
        queryClient.invalidateQueries({ queryKey: [`/api/scenes/${scriptId}`] });
        
        toast({
          title: "Audio processed successfully",
          description: `Added timestamps to ${timestamps.length} scenes.`,
        });
      }
    );
  };
  
  // Manual mode functions  
  const handleManualModeToggle = (enabled: boolean) => {
    setIsManualMode(enabled);
  };
  
  const handleAddManualScene = () => {
    setManualSceneInput("");
    setShowAddManualSceneDialog(true);
  };
  
  const handleCreateManualScene = async () => {
    if (!scriptId || !manualSceneInput.trim()) return;
    
    try {
      setIsManualSceneProcessing(true);
      
      // Create a single scene with the manual input text
      console.log("Creating manual scene", manualSceneInput);
      const response = await fetch(`/api/scenes/${scriptId}`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scriptExcerpt: manualSceneInput,
          title: manualSceneInput.split('\n')[0] || `Scene ${scenes.length + 1}`,
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to create scene");
      }
      
      const newSceneResponse = await response.json();
      
      // Generate prompt for this scene
      console.log("Generating prompt for scene", newSceneResponse);
      
      await fetch('/api/generate-prompts', {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scenes: [newSceneResponse.scene],
          style,
          customStylePrompt: style === 'custom' ? customStylePrompt : undefined,
          maintainContinuity,
          referenceImageUrl,
          projectType
        }),
      });
      
      toast({
        title: "Scene created",
        description: `New scene has been added and prompt generated.`,
      });
      
      // Close dialog and refresh scenes
      setShowAddManualSceneDialog(false);
      refetchScenes();
    } catch (error: any) {
      console.error("Error creating manual scene:", error);
      toast({
        title: "Error creating scene",
        description: error.message || "Failed to create manual scene",
        variant: "destructive",
      });
    } finally {
      setIsManualSceneProcessing(false);
    }
  };

  const isProcessing = 
    generatePromptsMutation.isPending || 
    generateImagesMutation.isPending || 
    generateSoraPromptsMutation.isPending ||
    generateImageMutation.isPending ||
    exportAssetsMutation.isPending ||
    saveProjectMutation.isPending ||
    isManualSceneProcessing;
  
  // Handle regular save (no dialog if already saved once)
  const handleSave = () => {
    // If project already has an ID (exists in database), just save without opening dialog
    if (scriptId) {
      saveProjectMutation.mutate();
    } else {
      // If it's a new project, need to open dialog for title/description
      // If project doesn't have a title yet, use a default title with timestamp
      if (!projectTitle) {
        setProjectTitle(`Untitled Project - ${new Date().toLocaleString()}`);
      }
      setIsSaveAsMode(false);
      setSaveDialogOpen(true);
    }
  };
  
  // Handle Save As (always show dialog for new name)
  const handleSaveAs = () => {
    // Create a suggested name based on the current title
    const currentTitle = projectTitle || `Untitled Project`;
    const suggestedTitle = currentTitle.includes(" (Copy)") 
      ? currentTitle // If already has (Copy), don't add another one
      : `${currentTitle} (Copy)`;
    
    // Update the title with our suggestion
    setProjectTitle(suggestedTitle);
    
    // Set save as mode to true so we know to create a new project
    setIsSaveAsMode(true);
    setSaveDialogOpen(true);
  };
  
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden fixed-container" style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}}>
      {/* Save Project Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md w-[95%] max-h-[90vh] top-[45%] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isSaveAsMode 
                ? "Save Project As" 
                : scriptId 
                  ? "Edit Project Details" 
                  : "Save Project"
              }
            </DialogTitle>
            <DialogDescription>
              {isSaveAsMode
                ? "Create a new copy of your project with a different name."
                : scriptId
                  ? "Edit your project name and description."
                  : "Give your project a name and optional description."
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="projectTitle">Project Name</Label>
              <Input
                id="projectTitle"
                placeholder="My Awesome Video"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="w-full"
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="projectDescription">Description (optional)</Label>
              <Textarea
                id="projectDescription"
                placeholder="Add a description of this project..."
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                className="w-full h-20"
              />
            </div>
            
            <div className="grid gap-2 pt-2">
              <ProjectTypeSelector 
                value={projectType}
                onChange={setProjectType}
                disabled={!!scriptId && !isSaveAsMode} // Only allow changing project type for new projects or when using "Save As"
              />
            </div>
            
            {/* Audio selector in project settings - only show for audio-driven projects */}
            {projectType === "audio-driven" && (
              <div className="grid gap-2 pt-2 border-t">
                <Label className="text-sm font-medium">Audio File Selection</Label>
                <div className="text-xs text-muted-foreground mb-2">
                  Choose or change the audio file for this project
                </div>
                <AudioSelector
                  selectedAudioId={selectedAudioId}
                  onSelect={setSelectedAudioId}
                  onApplyAudio={handleApplyAudio}
                  disabled={saveProjectMutation.isPending}
                />
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => saveProjectMutation.mutate()}
              disabled={!projectTitle || saveProjectMutation.isPending}
            >
              {saveProjectMutation.isPending ? (
                <>
                  <span className="mr-2">Saving...</span>
                  <span className="animate-spin">⏳</span>
                </>
              ) : (
                isSaveAsMode 
                  ? 'Save Copy' 
                  : scriptId 
                    ? 'Update Project' 
                    : 'Save Project'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Project toolbar - visible for all projects (new and existing) */}
      <div className="relative z-10">
        <div className="border-b border-border bg-blue-600 text-white py-4 px-6 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-white hover:bg-blue-700/50 h-9 px-3"
              onClick={() => navigate("/projects")}
            >
              Projects
            </Button>
            <span className="text-white/60 text-lg">{'/'}</span>
            <h1 className="text-lg md:text-xl font-medium truncate max-w-[200px] md:max-w-[400px] lg:max-w-[500px]">
              {projectTitle || "Untitled Project"}
            </h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-blue-700/50 h-9 px-3"
            onClick={() => {
              setSaveDialogOpen(true);
              setIsSaveAsMode(false);
            }}
          >
            <Pencil className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Edit</span>
          </Button>
        </div>
      </div>
      
      {/* Main editor toolbar */}
      <div className="border-b border-border bg-background px-4 py-3 flex justify-between items-center flex-shrink-0 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          {/* Mobile editor toggle button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 lg:hidden"
            onClick={() => setMobileEditorVisible(!mobileEditorVisible)}
            title={mobileEditorVisible ? "Hide editor" : "Show editor"}
          >
            {mobileEditorVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          
          {/* Project title visible in toolbar */}
          <div className="flex items-center min-w-0 flex-1 gap-3">
            <h2 className="text-sm xl:text-base font-medium hidden sm:block truncate max-w-sm md:max-w-lg lg:max-w-xl xl:max-w-2xl 2xl:max-w-4xl">
              {projectTitle || "Untitled Project"}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 xl:h-9 xl:w-9 flex-shrink-0 ml-auto"
              onClick={() => {
                setSaveDialogOpen(true);
                setIsSaveAsMode(false);
              }}
              title="Edit project title"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 px-4 h-9"
            onClick={handleSave}
          >
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">Save</span>
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 px-4 h-9"
            onClick={handleSaveAs}
          >
            <span className="hidden md:inline">Save As...</span>
            <span className="md:hidden">As...</span>
          </Button>
        </div>
      </div>
      
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Job Status Indicator - Shows async image generation progress */}
        {scriptId && (
          <JobStatusIndicator 
            scriptId={scriptId} 
            className="fixed top-16 right-4 z-50 max-w-sm"
          />
        )}
        
        {/* Mobile Sidebar - Toggleable visibility with bottom padding for audio panel */}
        {mobileEditorVisible && (
          <div className="lg:hidden bg-secondary border-b border-border p-3 flex-shrink-0 pb-32">
            <Sidebar
              projectId={scriptId || undefined}
              script={script}
              style={style}
              customStylePrompt={customStylePrompt}
              maintainContinuity={maintainContinuity}
              isManualMode={isManualMode}
              projectType={projectType}
              selectedAudioId={selectedAudioId}
              isNewProject={!projectId}
              hasExistingAudioProcessing={hasExistingAudioProcessing}
              scenes={scenes}
              onScriptChange={setScript}
              onStyleChange={setStyle}
              onCustomStyleChange={setCustomStylePrompt}
              onContinuityChange={setMaintainContinuity}
              onReferenceImageChange={setReferenceImageUrl}
              onManualModeChange={handleManualModeToggle}
              onAddManualScene={handleAddManualScene}
              onProjectTypeChange={(value) => setProjectType(value as any)}
              onAudioSelect={setSelectedAudioId}
              onGenerateScenePrompts={handleGenerateScenePrompts}
              onGenerateImages={handleGenerateImages}
              onGenerateSoraPrompts={handleGenerateSoraPrompts}
              onGenerateSoraVideos={handleGenerateSoraVideos}
              onGenerateThumbnail={handleGenerateThumbnail}
              onExportAssets={handleExportAssets}
              onAudioUploaded={handleAudioUploaded}
              onForceRegenerateImages={handleForceRegenerateImages}
              disablePrompts={!script || script.trim().length === 0 || isProcessing}
              disableImages={!scenes.length || isProcessing}
              disableSora={!scenes.length || isProcessing}
              disableSoraVideos={!scenes.some(s => s.soraPrompt && s.imageUrl) || isProcessing}
              disableThumbnail={!scenes.length || isProcessing}
              disableExport={!scenes.length || isProcessing}
              isProcessing={isProcessing}
              hasAudio={hasAudio}
            />
          </div>
        )}
        
        {/* Sidebar Toggle Button - Desktop Only */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden lg:flex fixed left-0 top-1/2 -translate-y-1/2 z-30 items-center justify-center w-6 h-16 bg-card/90 backdrop-blur-sm border border-border/50 rounded-r-lg shadow-lg hover:bg-primary/10 hover:border-primary/50 transition-all duration-300"
          style={{ left: sidebarCollapsed ? 0 : 'calc(25% - 0.75rem)' }}
          data-testid="toggle-sidebar-button"
        >
          <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${sidebarCollapsed ? 'rotate-[-90deg]' : 'rotate-90'}`} />
        </button>
        
        {/* Desktop Sidebar - Fixed, with internal scrolling and collapsible */}
        <div className={`hidden lg:block border-r border-border/40 overflow-y-auto h-[calc(100vh-52px)] flex-shrink-0 transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'lg:w-1/3 xl:w-1/4'
        }`}>
          <Sidebar
            projectId={scriptId || undefined}
            script={script}
            style={style}
            customStylePrompt={customStylePrompt}
            maintainContinuity={maintainContinuity}
            isManualMode={isManualMode}
            projectType={projectType}
            selectedAudioId={selectedAudioId}
            isNewProject={!projectId}
            hasExistingAudioProcessing={hasExistingAudioProcessing}
            scenes={scenes}
            onScriptChange={setScript}
            onStyleChange={setStyle}
            onCustomStyleChange={setCustomStylePrompt}
            onContinuityChange={setMaintainContinuity}
            onReferenceImageChange={setReferenceImageUrl}
            onManualModeChange={handleManualModeToggle}
            onAddManualScene={handleAddManualScene}
            onProjectTypeChange={(value) => setProjectType(value as any)}
            onAudioSelect={setSelectedAudioId}
            onApplyAudio={handleApplyAudio}
            onGenerateScenePrompts={handleGenerateScenePrompts}
            onGenerateImages={handleGenerateImages}
            onGenerateSoraPrompts={handleGenerateSoraPrompts}
            onGenerateSoraVideos={handleGenerateSoraVideos}
            onGenerateThumbnail={handleGenerateThumbnail}
            onExportAssets={handleExportAssets}
            onAudioUploaded={handleAudioUploaded}
            onForceRegenerateImages={handleForceRegenerateImages}
            disablePrompts={(!script || script.trim().length === 0 || isProcessing) && !isManualMode}
            disableImages={!scenes.length || isProcessing}
            disableSora={!scenes.length || isProcessing}
            disableSoraVideos={!scenes.some(s => s.soraPrompt && s.imageUrl) || isProcessing}
            disableThumbnail={!scenes.length || isProcessing}
            disableExport={!scenes.length || isProcessing}
            isProcessing={isProcessing}
            hasAudio={hasAudio}
          />
        </div>
        
        {/* Main content area with proper spacing for fixed audio panel */}
        {(scenes.length > 0 || isLoadingScenes || isLoadingProject || (projectData && scriptId)) ? (
          <div className="flex-1 flex flex-col relative">
            {/* Preview panel container with bottom padding when audio is visible */}
            <div className={`flex-1 overflow-y-auto ${scriptId && activePreviewTab === "storyboard" ? "pb-32" : ""}`}>
              {/* Show loading skeleton while project or scenes are loading */}
              {(isLoadingProject && !projectData) || (isLoadingScenes && scenes.length === 0 && scriptId) ? (
                <div className="p-6 space-y-6">
                  {/* Tab skeleton */}
                  <div className="flex gap-2 mb-6">
                    <div className="h-10 w-32 bg-muted rounded animate-pulse"></div>
                    <div className="h-10 w-24 bg-muted rounded animate-pulse"></div>
                  </div>
                  {/* Scene skeletons */}
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-card border rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-muted rounded animate-pulse"></div>
                        <div className="h-6 bg-muted rounded w-48 animate-pulse"></div>
                      </div>
                      <div className="flex gap-4">
                        <div className="w-64 h-40 bg-muted rounded animate-pulse"></div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-muted rounded w-full animate-pulse"></div>
                          <div className="h-4 bg-muted rounded w-3/4 animate-pulse"></div>
                          <div className="h-4 bg-muted rounded w-1/2 animate-pulse"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : projectType === "animation" && projectData ? (
                <div className="p-4 md:p-6">
                  {/* Animation Wizard for new projects; AnimationModePanel for locked storyboards */}
                  {(
                    !projectData.animationStatus || 
                    projectData.animationStatus === 'pending' ||
                    projectData.animationStatus === 'draft' || 
                    projectData.animationStatus === 'dialogue_parsed' ||
                    projectData.animationStatus === 'frames_ready' ||
                    projectData.animationStatus === 'scenes_suggested'
                  ) ? (
                    <AnimationWizard
                      scriptId={projectData.id}
                      scriptContent={script}
                      animationStatus={projectData.animationStatus}
                      onComplete={async () => {
                        await refetchProject();
                        await refetchScenes();
                        toast({
                          title: "Storyboard Locked",
                          description: "Your scenes are ready for image and voice generation"
                        });
                      }}
                    />
                  ) : (
                    <AnimationModePanel 
                      script={projectData}
                      scenes={scenes}
                      onSceneUpdate={handleUpdateScene}
                    />
                  )}
                </div>
              ) : (
                <PreviewPanel 
                  scenes={scenes.map(scene => ({
                    ...scene,
                    isGeneratingImage: generatingSceneIds.includes(scene.id || 0),
                    isGeneratingSoraPrompt: regeneratingSoraPromptIds.includes(scene.id || 0)
                  }))}
                  onUpdateScene={handleUpdateScene}
                  onRegenerateScene={handleRegenerateScene}
                  onGenerateImage={handleGenerateImage}
                  onEditImage={handleEditImage}
                  onRegenerateSoraPrompt={handleRegenerateSoraPrompt}
                  onGenerateVideo={handleGenerateSceneVideo}
                  isLoading={isLoadingScenes}
                  thumbnailUrl={thumbnailUrl}
                  projectTitle={projectTitle}
                  currentStyle={style}
                  onGenerateThumbnail={handleGenerateThumbnail}
                  isGeneratingThumbnail={generateThumbnailMutation.isPending}
                  activeTab={activePreviewTab}
                  onTabChange={setActivePreviewTab}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-4">
            {showOnboarding ? (
              <OnboardingGuide 
                onDismiss={() => {
                  setShowOnboarding(false);
                  localStorage.setItem('onboardingComplete', 'true');
                }}
                onInsertDemoScript={() => {
                  setScript(demoScript);
                  setShowOnboarding(false);
                  localStorage.setItem('onboardingComplete', 'true');
                }}
              />
            ) : (
              <div className="text-center max-w-md mx-auto">
                <h3 className="text-xl font-semibold mb-2">No Scenes Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Enter your script in the editor and click "Generate Scene Prompts" to
                  create storyboard scenes.
                </p>
                <div className="flex flex-col items-center gap-3">
                  {script && script.trim().length > 0 && (
                    <Button 
                      onClick={handleGenerateScenePrompts} 
                      disabled={isProcessing}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Generate Scene Prompts
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      setScript(demoScript);
                    }}
                    className="gap-1"
                  >
                    <Lightbulb className="h-4 w-4" />
                    Try with a demo script
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setShowOnboarding(true)}
                  >
                    Show tutorial
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Fixed Audio Processing Panel - only show on storyboard tab, positioned to not block sidebar on desktop */}
        {scriptId && activePreviewTab === "storyboard" && (
          <div className="fixed bottom-0 left-0 right-0 lg:left-80 xl:left-96 z-40 bg-background border-t border-border shadow-lg" id="audio-section">
            <AudioUpload
              onAudioAnalyzed={handleAudioProcessed}
              scriptId={scriptId}
              disabled={isProcessing}
              hasExistingAudioProcessing={hasExistingAudioProcessing}
              preloadedAudio={(() => {
                const audioData = selectedAudioData || projectAudioData;
                return audioData ? {
                  url: audioData.audioUrl,
                  filename: audioData.title,
                  duration: audioData.duration
                } : null;
              })()}
            />
          </div>
        )}
      </main>
      
      {/* Processing Modal */}
      <ProcessingModal
        isOpen={processingModalOpen}
        onCancel={() => setProcessingModalOpen(false)}
        status={processingStatus}
      />
      
      {/* Image Edit Modal */}
      <ImageEditModal
        isOpen={!!editingImageScene}
        onClose={() => setEditingImageScene(null)}
        scene={editingImageScene}
        onSuccess={handleImageEditSuccess}
      />
      
      {/* Manual Scene Creation Dialog */}
      <Dialog open={showAddManualSceneDialog} onOpenChange={setShowAddManualSceneDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Add New Scene</DialogTitle>
            <DialogDescription>
              Create a new scene by entering the text content. This will be used to generate an image.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="scene-content" className="text-base font-medium">Scene Content</Label>
              <Textarea
                id="scene-content"
                placeholder="Enter the content for this scene/slide/section..."
                value={manualSceneInput}
                onChange={(e) => setManualSceneInput(e.target.value)}
                rows={6}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                For slides: Enter a brief description of the slide content.<br />
                For blog posts: Enter a paragraph or section heading.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddManualSceneDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleCreateManualScene} 
              disabled={!manualSceneInput.trim() || isProcessing}
            >
              {isProcessing ? "Creating..." : "Create Scene"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Home;
