import React, { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  FileEdit, 
  FilePlus, 
  Trash2, 
  Calendar, 
  Layout, 
  Film,
  FileText,
  Presentation,
  File,
  Palette,
  Loader2,
  MoreVertical,
  Pencil,
  Copy,
  Archive,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

// Define the Project type
interface Project {
  id: number;
  title: string;
  content?: string;
  style?: string;
  description?: string;
  projectType?: string;
  createdAt: string;
  updatedAt: string;
  sceneCount?: number;
  archived?: boolean;
}

function Projects() {
  const { toast } = useToast();
  const [projectToDelete, setProjectToDelete] = useState<number | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  
  const { data: allProjects, isLoading, isError, error } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
    refetchOnWindowFocus: true,
  });

  // Archive project mutation
  const archiveProjectMutation = useMutation({
    mutationFn: async ({ projectId, archived }: { projectId: number; archived: boolean }) => {
      return apiRequest(`/api/projects/${projectId}/archive`, {
        method: 'PATCH',
        body: JSON.stringify({ archived }),
      });
    },
    onMutate: async ({ projectId, archived }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['/api/projects'] });

      // Snapshot the previous value
      const previousProjects = queryClient.getQueryData<Project[]>(['/api/projects']);

      // Optimistically update to the new value
      if (previousProjects) {
        const updatedProjects = previousProjects.map(project =>
          project.id === projectId ? { ...project, archived } : project
        );
        queryClient.setQueryData(['/api/projects'], updatedProjects);
        
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
        queryClient.setQueryData(['/api/projects'], context.previousProjects);
      }
    },
    onSuccess: ({ projectId, archived }) => {
      // Only invalidate on success, not on settled, to prevent flickering
      // The optimistic update handles the immediate UI change
    },
  });

  // Separate active and archived projects
  const activeProjects = allProjects?.filter(project => !project.archived) || [];
  const archivedProjects = allProjects?.filter(project => project.archived) || [];
  const projects = activeProjects;
  
  const handleRenameProject = () => {
    if (!editingProject) return;
    
    if (!projectTitle.trim()) {
      toast({
        title: "Error",
        description: "Project name cannot be empty.",
        variant: "destructive",
      });
      return;
    }
    
    const updateProject = async () => {
      try {
        // First get the full project details to ensure we have all required fields
        const getResponse = await fetch(`/api/projects/${editingProject.id}`);
        if (!getResponse.ok) {
          throw new Error("Failed to fetch project details");
        }
        
        const fullProject = await getResponse.json();
        
        // Immediately update the UI with the new project name before server response
        // This provides instant feedback to the user
        if (projects) {
          const updatedProjects = projects.map(p => 
            p.id === editingProject.id ? { ...p, title: projectTitle } : p
          );
          
          // Update the cache directly for immediate UI update
          queryClient.setQueryData(['/api/projects'], updatedProjects);
        }
        
        // Now update with the full project + new title
        const response = await fetch(`/api/projects/${editingProject.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...fullProject,
            title: projectTitle,
          }),
        });
        
        if (!response.ok) {
          throw new Error("Failed to update project");
        }
        
        toast({
          title: "Project updated",
          description: "Project name has been updated successfully.",
        });
        
        // Also invalidate the query to refetch fresh data
        queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
        
        // If we're currently viewing this project, update the document title
        if (window.location.pathname === `/project/${editingProject.id}`) {
          document.title = `${projectTitle} - SceneStitch`;
        }
        
        setEditDialogOpen(false);
        setEditingProject(null);
        setProjectTitle("");
      } catch (err) {
        console.error("Error updating project:", err);
        toast({
          title: "Error",
          description: "Failed to update the project. Please try again.",
          variant: "destructive",
        });
        
        // Revert the optimistic update if it failed
        queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      }
    };
    
    updateProject();
  };
  
  const handleOpenEditDialog = (project: Project) => {
    setEditingProject(project);
    setProjectTitle(project.title || "");
    setEditDialogOpen(true);
  };
  
  const handleDuplicateProject = async (project: Project) => {
    try {
      // Get the full project details first
      const getResponse = await fetch(`/api/projects/${project.id}`);
      if (!getResponse.ok) {
        throw new Error("Failed to fetch project details");
      }
      
      const fullProject = await getResponse.json();
      
      // Create a new project with the same content but different name
      // Include sourceProjectId to enable server-side scene duplication with proper numbering
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...fullProject,
          title: `${project.title} (Copy)`,
          id: undefined, // Ensure we don't try to update the existing project
          sourceProjectId: project.id, // Add source project ID for scene copying
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to duplicate project");
      }
      
      // Get the newly created project from the response
      const newProject = await response.json();
      
      toast({
        title: "Project duplicated",
        description: "A copy of the project has been created.",
      });
      
      // Add the new project to the projects list in the cache for immediate UI update
      if (projects && newProject) {
        const updatedProjects = [...projects, newProject];
        queryClient.setQueryData(['/api/projects'], updatedProjects);
      }
      
      // Also invalidate the query to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      
      // Navigate to the new project
      window.location.href = `/project/${newProject.id}`;
    } catch (err) {
      console.error("Error duplicating project:", err);
      toast({
        title: "Error",
        description: "Failed to duplicate the project. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    
    try {
      const response = await fetch(`/api/projects/${projectToDelete}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete project");
      }
      
      toast({
        title: "Project deleted",
        description: "Your project has been deleted successfully.",
      });
      
      // Update cache directly to immediately remove the project from the UI
      if (projects) {
        const updatedProjects = projects.filter(p => p.id !== projectToDelete);
        queryClient.setQueryData(['/api/projects'], updatedProjects);
      }
      
      // Also invalidate the query to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      
      // Reset the projectToDelete state
      setProjectToDelete(null);
    } catch (err) {
      console.error("Error deleting project:", err);
      toast({
        title: "Error",
        description: "Failed to delete the project. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  // Helper functions for project type icons and names
  const getProjectTypeIcon = (projectType?: string) => {
    switch (projectType) {
      case 'video':
        return <Film className="h-3.5 w-3.5 mr-1.5" />;
      case 'blog':
        return <FileText className="h-3.5 w-3.5 mr-1.5" />;
      case 'presentation':
        return <Presentation className="h-3.5 w-3.5 mr-1.5" />;
      default:
        return <File className="h-3.5 w-3.5 mr-1.5" />;
    }
  };

  const getProjectTypeName = (projectType?: string) => {
    switch (projectType) {
      case 'video':
        return 'Video';
      case 'blog':
        return 'Blog';
      case 'presentation':
        return 'Presentation';
      default:
        return 'General';
    }
  };

  // Format date to a readable string
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-lg text-muted-foreground">Loading projects...</span>
      </div>
    );
  }
  
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <div className="text-destructive text-lg mb-4">Error loading projects</div>
        <p className="text-muted-foreground">{(error as Error)?.message || "An unknown error occurred"}</p>
        <Button 
          onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/projects'] })}
          variant="secondary"
          className="mt-4"
        >
          Try Again
        </Button>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-4 sm:py-6 px-3 sm:px-4 mobile-scroll-container">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Your Projects</h1>
          <p className="text-muted-foreground mt-1 text-xs sm:text-sm md:text-base">
            Manage your SceneStitch storyboards and video assets
          </p>
        </div>
        <Link href="/project/new">
          <Button size="lg" className="gap-2 w-full sm:w-auto h-10 sm:h-11">
            <FilePlus className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>Create New Project</span>
          </Button>
        </Link>
      </div>
      
      <Separator className="mb-8" />
      
      {/* Edit Project Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
            <DialogDescription>
              Enter a new name for your project.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="projectTitle">Project Name</Label>
              <Input
                id="projectTitle"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                placeholder="Enter project name"
                className="w-full"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameProject}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {projects && projects.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
          {projects.map((project) => (
            <Card key={project.id} className="relative flex flex-col overflow-hidden bg-card/80 backdrop-blur-sm hover:bg-card/95 transition-colors">
              {/* Archive Checkbox */}
              <div className="absolute top-2 sm:top-3 left-2 sm:left-3 z-10">
                <Checkbox
                  checked={false}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      archiveProjectMutation.mutate({
                        projectId: project.id,
                        archived: true,
                      });
                    }
                  }}
                  className="bg-white shadow-sm border-2 w-4 h-4 sm:w-5 sm:h-5"
                  title="Mark as completed and archive"
                />
              </div>
              
              <CardHeader className="pb-2 flex justify-between items-start pl-8 sm:pl-10 pr-2 sm:pr-6 pt-2 sm:pt-6">
                <div className="overflow-hidden flex-1 mr-1 sm:mr-2">
                  <CardTitle className="text-base sm:text-lg md:text-xl break-words leading-tight">{project.title}</CardTitle>
                  <CardDescription className="break-words mt-1 text-xs sm:text-sm">
                    {project.description || "No description provided"}
                  </CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 -mr-1 sm:-mr-2 flex-shrink-0">
                      <MoreVertical className="h-4 w-4" />
                      <span className="sr-only">Actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => handleOpenEditDialog(project)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDuplicateProject(project)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="text-destructive focus:text-destructive"
                      onClick={() => setProjectToDelete(project.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="flex-1 py-2 px-3 sm:px-6">
                <div className="grid grid-cols-2 sm:flex sm:flex-col sm:space-y-2 text-xs sm:text-sm text-muted-foreground gap-2 sm:gap-0">
                  <div className="flex items-center">
                    <Layout className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 flex-shrink-0" />
                    <span>Scenes: {project.sceneCount}</span>
                  </div>
                  
                  {/* Project Type */}
                  <div className="flex items-center">
                    {(project.projectType || 'video') === 'video' ? (
                      <Film className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 flex-shrink-0" />
                    ) : (project.projectType || 'video') === 'blog' ? (
                      <FileText className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 flex-shrink-0" />
                    ) : (project.projectType || 'video') === 'presentation' ? (
                      <Presentation className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 flex-shrink-0" />
                    ) : (
                      <Layout className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 flex-shrink-0" />
                    )}
                    <span className="break-words capitalize truncate">Type: {project.projectType || 'video'}</span>
                  </div>
                  
                  {project.style && (
                    <div className="flex items-center col-span-2 sm:col-span-1">
                      <Palette className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 flex-shrink-0" />
                      <span className="break-words truncate">Style: {project.style}</span>
                    </div>
                  )}
                  <div className="flex items-center col-span-2 sm:col-span-1">
                    <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 flex-shrink-0" />
                    <span className="break-words truncate">Updated: {formatDate(project.updatedAt)}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-2 px-3 sm:px-6 pb-3 sm:pb-6">
                <Link href={`/project/${project.id}`} className="w-full">
                  <Button variant="default" className="w-full h-10 sm:h-9 text-sm gap-1 sm:gap-2">
                    <FileEdit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    Open Project
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-center">
          <div className="text-muted-foreground mb-4 sm:mb-6">
            <FilePlus className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-3 sm:mb-4 opacity-30" />
            <h3 className="text-lg sm:text-xl font-medium">No projects found</h3>
            <p className="mt-2 text-sm sm:text-base">Get started by creating your first project</p>
          </div>
          <Link href="/project/new">
            <Button className="w-full sm:w-auto">Create New Project</Button>
          </Link>
        </div>
      )}

      {/* Archived Projects */}
      {archivedProjects && archivedProjects.length > 0 && (
        <div className="mt-8 sm:mt-12">
          <Collapsible open={showArchived} onOpenChange={setShowArchived}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 hover:bg-transparent mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl md:text-2xl font-semibold flex items-center gap-2">
                  <Archive className="h-4 w-4 sm:h-5 sm:w-5" />
                  Archived Projects ({archivedProjects.length})
                </h2>
                {showArchived ? (
                  <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5" />
                ) : (
                  <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
                {archivedProjects.map((project) => (
                  <Card key={project.id} className="relative flex flex-col overflow-hidden bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-colors opacity-75">
                    {/* Unarchive Checkbox */}
                    <div className="absolute top-2 sm:top-3 left-2 sm:left-3 z-10">
                      <Checkbox
                        checked={true}
                        onCheckedChange={(checked) => {
                          if (!checked) {
                            archiveProjectMutation.mutate({
                              projectId: project.id,
                              archived: false,
                            });
                          }
                        }}
                        className="bg-white shadow-sm border-2 w-4 h-4 sm:w-5 sm:h-5"
                        title="Unarchive project"
                      />
                    </div>
                    
                    <CardHeader className="pb-2 flex justify-between items-start pl-8 sm:pl-10 pr-2 sm:pr-6 pt-2 sm:pt-6">
                      <div className="overflow-hidden flex-1 mr-1 sm:mr-2">
                        <CardTitle className="text-base sm:text-lg md:text-xl break-words leading-tight">{project.title}</CardTitle>
                        <CardDescription className="break-words mt-1 text-xs sm:text-sm">
                          {project.description || "No description provided"}
                        </CardDescription>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 -mr-1 sm:-mr-2 flex-shrink-0">
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => handleOpenEditDialog(project)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicateProject(project)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => setProjectToDelete(project.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardHeader>
                    <CardContent className="flex-1 py-2 px-3 sm:px-6">
                      <div className="grid grid-cols-2 sm:flex sm:flex-col sm:space-y-2 text-xs sm:text-sm text-muted-foreground gap-2 sm:gap-0">
                        <div className="flex items-center">
                          <Layout className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 flex-shrink-0" />
                          <span>Scenes: {project.sceneCount}</span>
                        </div>
                        
                        {/* Project Type */}
                        <div className="flex items-center">
                          {getProjectTypeIcon(project.projectType)}
                          <span className="truncate">Type: {getProjectTypeName(project.projectType)}</span>
                        </div>
                        
                        {/* Style */}
                        <div className="flex items-center col-span-2 sm:col-span-1">
                          <Palette className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 flex-shrink-0" />
                          <span className="truncate">Style: {project.style || 'auto'}</span>
                        </div>
                        
                        {/* Date */}
                        <div className="flex items-center col-span-2 sm:col-span-1">
                          <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 flex-shrink-0" />
                          <span className="truncate">Updated: {formatDate(project.updatedAt)}</span>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-2 px-3 sm:px-6 pb-3 sm:pb-6">
                      <Link href={`/project/${project.id}`} className="w-full">
                        <Button variant="default" className="w-full h-10 sm:h-9 text-sm gap-1 sm:gap-2">
                          <FileEdit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          Open Project
                        </Button>
                      </Link>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              project and all of its scenes and assets.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setProjectToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default Projects;