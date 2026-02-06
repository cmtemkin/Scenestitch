import React, { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { UnifiedProjectCreator } from "@/components/UnifiedProjectCreator";
import { ProjectReviewFlow } from "@/components/ProjectReviewFlow";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Eye, Clock, CheckCircle, ArrowRight, Plus, Download, ChevronDown, ChevronRight, Archive, Play, Pause, RefreshCw, AlertCircle, X } from "lucide-react";
import { analyzeProjectWorkflowStatus, getNextStepDescription, getResumeActionUrl } from "@/utils/projectWorkflowStatus";

const UnifiedHome: React.FC = () => {
  const [location, navigate] = useLocation();
  const [matched, params] = useRoute<{ id: string }>("/project/:id");
  const [showArchived, setShowArchived] = useState(false);
  const [resumingProjects, setResumingProjects] = useState<Set<number>>(new Set());
  const [deletingProjects, setDeletingProjects] = useState<Set<number>>(new Set());
  
  const projectId = params?.id ? parseInt(params.id) : null;
  const isReviewMode = location.includes('/review');

  // Fetch all projects for the landing page
  const { data: allProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiRequest<any[]>('/api/projects'),
    enabled: !projectId,
  });

  // Fetch incomplete projects
  const { data: incompleteProjects } = useQuery({
    queryKey: ['incomplete-projects'],
    queryFn: () => apiRequest<{projects: any[]}>('/api/projects/incomplete'),
    enabled: !projectId,
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const projectsPerPage = 6; // Show 6 projects per page for better performance
  
  // Get paginated projects
  const paginatedProjects = allProjects ? 
    allProjects.slice((currentPage - 1) * projectsPerPage, currentPage * projectsPerPage) : [];
  
  const totalPages = allProjects ? Math.ceil(allProjects.length / projectsPerPage) : 0;

  // Resume project mutation with enhanced feedback
  const resumeProjectMutation = useMutation({
    mutationFn: async (scriptId: number) => {
      setResumingProjects(prev => new Set(prev).add(scriptId));
      return apiRequest(`/api/workflows/resume/${scriptId}`, {
        method: 'POST',
      });
    },
    onSuccess: (data, scriptId) => {
      // Keep the project in resuming state for user feedback
      setTimeout(() => {
        setResumingProjects(prev => {
          const newSet = new Set(prev);
          newSet.delete(scriptId);
          return newSet;
        });
      }, 3000);
      
      queryClient.invalidateQueries({ queryKey: ['incomplete-projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error, scriptId) => {
      setResumingProjects(prev => {
        const newSet = new Set(prev);
        newSet.delete(scriptId);
        return newSet;
      });
    },
  });

  // Dismiss project from resume list mutation
  const dismissProjectMutation = useMutation({
    mutationFn: async (projectId: number) => {
      setDeletingProjects(prev => new Set(prev).add(projectId));
      return apiRequest(`/api/projects/${projectId}/dismiss-from-resume`, {
        method: 'PATCH',
      });
    },
    onSuccess: (data, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['incomplete-projects'] });
      setDeletingProjects(prev => {
        const newSet = new Set(prev);
        newSet.delete(projectId);
        return newSet;
      });
    },
    onError: (error, projectId) => {
      setDeletingProjects(prev => {
        const newSet = new Set(prev);
        newSet.delete(projectId);
        return newSet;
      });
    },
  });

  // Fetch scenes for visible projects
  const { data: visibleProjectScenes } = useQuery({
    queryKey: ['visible-project-scenes', currentPage],
    queryFn: async () => {
      if (!paginatedProjects?.length) return {};
      
      const sceneData: Record<number, any[]> = {};
      
      for (const project of paginatedProjects) {
        try {
          const response = await fetch(`/api/scenes/${project.id}`);
          if (response.ok) {
            const data = await response.json();
            sceneData[project.id] = data.scenes || [];
          } else {
            sceneData[project.id] = [];
          }
        } catch (error) {
          sceneData[project.id] = [];
        }
      }
      
      return sceneData;
    },
    enabled: !!paginatedProjects?.length,
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes since we're only loading visible projects
  });

  // Archive project mutation with optimistic updates
  const archiveProjectMutation = useMutation({
    mutationFn: async ({ projectId, archived }: { projectId: number; archived: boolean }) => {
      return apiRequest(`/api/projects/${projectId}/archive`, {
        method: 'PATCH',
        body: JSON.stringify({ archived }),
      });
    },
    onMutate: async ({ projectId, archived }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['projects'] });

      // Snapshot the previous value
      const previousProjects = queryClient.getQueryData<any[]>(['projects']);

      // Optimistically update to the new value
      if (previousProjects) {
        const updatedProjects = previousProjects.map(project =>
          project.id === projectId ? { ...project, archived } : project
        );
        queryClient.setQueryData(['projects'], updatedProjects);
        
        // Auto-expand archived section when archiving a project
        if (archived) {
          setShowArchived(true);
        }
      }

      // Return a context object with the snapshotted value
      return { previousProjects };
    },
    onError: (err, { projectId, archived }, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousProjects) {
        queryClient.setQueryData(['projects'], context.previousProjects);
      }
    },
    onSuccess: () => {
      // Only invalidate incomplete projects since the main projects cache is handled optimistically
      queryClient.invalidateQueries({ queryKey: ['incomplete-projects'] });
    },
  });

  // Separate active and archived projects
  const activeProjects = paginatedProjects?.filter(project => !project.archived) || [];
  const archivedProjects = allProjects?.filter(project => project.archived) || [];
  const recentProjects = activeProjects;

  // Project Card Component with Resume Functionality
  const ProjectCard = ({ project, isArchived = false }: { project: any; isArchived?: boolean }) => {
    const projectScenes = visibleProjectScenes?.[project.id] || [];
    const workflowStatus = analyzeProjectWorkflowStatus(project, projectScenes);
    
    return (
      <Card key={project.id} className={`relative cursor-pointer hover:shadow-md transition-shadow ${isArchived ? 'opacity-75' : ''}`}>
        {/* Archive/Unarchive Checkbox */}
        <div className="absolute top-3 right-3 z-10">
          <Checkbox
            checked={isArchived}
            onCheckedChange={(checked) => {
              archiveProjectMutation.mutate({
                projectId: project.id,
                archived: !!checked,
              });
            }}
            className="bg-white shadow-sm border-2"
            title={isArchived ? "Unarchive project" : "Mark as completed and archive"}
          />
        </div>
        
        <CardHeader>
          <CardTitle className="text-lg truncate pr-8">{project.title}</CardTitle>
          <CardDescription className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {project.style || 'Auto'}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(project.createdAt).toLocaleDateString()}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                {project.sceneCount || 0} scenes
              </span>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const audioResponse = await fetch('/api/audio');
                      const audioFiles = await audioResponse.json();
                      
                      const projectAudio = audioFiles.find((audio: any) => 
                        audio.title.toLowerCase().includes(project.title.toLowerCase()) ||
                        project.title.toLowerCase().includes(audio.title.toLowerCase())
                      );
                      
                      if (projectAudio && projectAudio.audioUrl) {
                        const link = document.createElement('a');
                        link.href = projectAudio.audioUrl;
                        link.download = `${project.title}.mp3`;
                        link.click();
                      } else {
                        alert('No audio file found for this project');
                      }
                    } catch (error) {
                      console.error('Error downloading audio:', error);
                      alert('Failed to download audio file');
                    }
                  }}
                >
                  <Download className="h-3 w-3" />
                </Button>
                
                {workflowStatus.isComplete ? (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => navigate(`/project/${project.id}/review`)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button 
                    variant="default" 
                    size="sm"
                    onClick={() => navigate(getResumeActionUrl(project.id, workflowStatus.nextStep))}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Resume
                  </Button>
                )}
              </div>
            </div>
            
            {/* Progress Bar and Status */}
            {!workflowStatus.isComplete && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">
                    {getNextStepDescription(workflowStatus.nextStep)}
                  </span>
                  <span className="text-muted-foreground">
                    {Math.round(workflowStatus.completionPercentage)}%
                  </span>
                </div>
                <Progress value={workflowStatus.completionPercentage} className="h-1.5" />
                <div className="text-xs text-muted-foreground">
                  {workflowStatus.hasScenes && `${workflowStatus.sceneCount} scenes`}
                  {workflowStatus.hasImages && `, ${workflowStatus.imageCount} images`}
                  {workflowStatus.hasAudio && `, audio ready`}
                </div>
              </div>
            )}
            
            {workflowStatus.isComplete && (
              <div className="flex items-center gap-2 text-green-600 text-xs">
                <CheckCircle className="h-3 w-3" />
                <span>Project complete</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Show project review flow
  if (projectId && isReviewMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <ProjectReviewFlow 
          projectId={projectId}
          onNavigateToThumbnail={() => navigate(`/project/${projectId}/thumbnail`)}
        />
      </div>
    );
  }

  // Show project creator or landing page
  if (location === '/create' || location === '/') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              SceneStitch AI
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Transform your scripts into stunning visual storyboards automatically. 
              Just provide your content and style preferences - we handle the rest.
            </p>
          </div>

          {location === '/create' ? (
            <div className="space-y-8">
              {/* Incomplete Projects Section */}
              {incompleteProjects?.projects?.length > 0 && (
                <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                      <AlertCircle className="h-5 w-5" />
                      Resume Incomplete Projects
                    </CardTitle>
                    <CardDescription className="text-amber-700 dark:text-amber-300">
                      {incompleteProjects.projects.length} project{incompleteProjects.projects.length > 1 ? 's' : ''} need completion. Resume generation to finish missing images and thumbnails. Delete projects you no longer need.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {incompleteProjects.projects
                        .map((project: any) => (
                        <div key={project.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border">
                          <div className="flex-1">
                            <h4 className="font-medium text-sm">{project.title}</h4>
                            <p className="text-xs text-muted-foreground">
                              {!project.thumbnailUrl && "Missing thumbnail"} 
                              {!project.thumbnailUrl && " • "}
                              Project ID: {project.id}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => dismissProjectMutation.mutate(project.id)}
                              disabled={dismissProjectMutation.isPending || deletingProjects.has(project.id)}
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-gray-500 hover:bg-gray-500/10"
                              title="Dismiss this project from resume list"
                              data-testid={`button-dismiss-incomplete-${project.id}`}
                            >
                              {deletingProjects.has(project.id) ? (
                                <RefreshCw className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => resumeProjectMutation.mutate(project.id)}
                              disabled={resumeProjectMutation.isPending || resumingProjects.has(project.id)}
                              data-testid={`button-resume-incomplete-${project.id}`}
                            >
                              {(resumeProjectMutation.isPending || resumingProjects.has(project.id)) ? (
                                <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Play className="h-3 w-3 mr-1" />
                              )}
                              {resumingProjects.has(project.id) ? 'Resuming...' : 'Resume'}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              
              <UnifiedProjectCreator />
            </div>
          ) : (
            <div className="max-w-6xl mx-auto space-y-8">
              {/* Quick Start Section */}
              <div className="text-center space-y-4">
                <Button 
                  onClick={() => navigate('/create')} 
                  size="lg"
                  className="text-lg px-8 py-4"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Create New Project
                </Button>
                <p className="text-sm text-muted-foreground">
                  Get started in seconds - just paste your script and choose a style
                </p>
              </div>

              {/* Feature Highlights */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Automatic Generation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      AI analyzes your script and automatically generates scene breakdowns, 
                      image prompts, and stunning visuals in your chosen style.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="h-5 w-5 text-primary" />
                      Review & Refine
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      Review your complete storyboard, regenerate any images you want 
                      to improve, then proceed to thumbnail generation.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-primary" />
                      Ready to Use
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      Export your complete storyboard and thumbnail, ready for 
                      video production or content creation workflows.
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Active Projects */}
              {activeProjects && activeProjects.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-2xl font-semibold">Active Projects</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeProjects.map((project) => (
                      <ProjectCard key={project.id} project={project} isArchived={false} />
                    ))}
                  </div>
                  
                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex justify-center items-center gap-4 mt-6">
                      <Button
                        variant="outline"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        size="sm"
                      >
                        Previous
                      </Button>
                      
                      <div className="flex items-center gap-2">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                          <Button
                            key={page}
                            variant={currentPage === page ? "default" : "outline"}
                            onClick={() => setCurrentPage(page)}
                            size="sm"
                            className="w-8 h-8 p-0"
                          >
                            {page}
                          </Button>
                        ))}
                      </div>
                      
                      <Button
                        variant="outline"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        size="sm"
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Archived Projects */}
              {archivedProjects && archivedProjects.length > 0 && (
                <div className="space-y-4">
                  <Collapsible open={showArchived} onOpenChange={setShowArchived}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between p-0 hover:bg-transparent">
                        <h2 className="text-2xl font-semibold flex items-center gap-2">
                          <Archive className="h-5 w-5" />
                          Archived Projects ({archivedProjects.length})
                        </h2>
                        {showArchived ? (
                          <ChevronDown className="h-5 w-5" />
                        ) : (
                          <ChevronRight className="h-5 w-5" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {archivedProjects.map((project) => (
                          <ProjectCard key={project.id} project={project} isArchived={true} />
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}

              {/* How it Works */}
              <div className="space-y-4 mt-16">
                <h2 className="text-2xl font-semibold text-center">How It Works</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <span className="text-primary font-bold">1</span>
                    </div>
                    <h3 className="font-medium">Paste Script</h3>
                    <p className="text-sm text-muted-foreground">
                      Add your video script or content
                    </p>
                  </div>
                  
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <span className="text-primary font-bold">2</span>
                    </div>
                    <h3 className="font-medium">Choose Style</h3>
                    <p className="text-sm text-muted-foreground">
                      Select visual style and preferences
                    </p>
                  </div>
                  
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <span className="text-primary font-bold">3</span>
                    </div>
                    <h3 className="font-medium">AI Creates</h3>
                    <p className="text-sm text-muted-foreground">
                      Automatic storyboard generation
                    </p>
                  </div>
                  
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <span className="text-primary font-bold">4</span>
                    </div>
                    <h3 className="font-medium">Review & Export</h3>
                    <p className="text-sm text-muted-foreground">
                      Refine and export your assets
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback - redirect to home
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <Clock className="h-12 w-12 mx-auto text-muted-foreground animate-spin" />
        <p>Loading...</p>
      </div>
    </div>
  );
};

export default UnifiedHome;