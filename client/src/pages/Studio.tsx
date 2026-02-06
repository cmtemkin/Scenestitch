import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Download, Clock, CheckCircle2, AlertCircle, Video } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Project {
  id: number;
  content: string;
  title?: string;
  thumbnailUrl?: string;
  createdAt: string;
  audioId?: number;
}

interface VideoJob {
  id: string;
  projectId: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  videoUrl?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export default function Studio() {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const { toast } = useToast();

  // Fetch completed projects
  const { data: projects = [], isLoading: loadingProjects } = useQuery<Project[]>({
    queryKey: ['/api/projects/completed'],
  });

  // Fetch video jobs
  const { data: videoJobs = [], isLoading: loadingJobs } = useQuery<VideoJob[]>({
    queryKey: ['/api/video-jobs'],
  });

  // Generate video mutation
  const generateVideoMutation = useMutation({
    mutationFn: async (projectId: number) => {
      return apiRequest(`/api/generate-video`, {
        method: 'POST',
        body: JSON.stringify({ projectId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/video-jobs'] });
      toast({
        title: "Video Generation Started",
        description: "Your video is being generated. This may take several minutes.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to start video generation",
        variant: "destructive",
      });
    },
  });

  const handleGenerateVideo = (project: Project) => {
    if (!project.audioId) {
      toast({
        title: "Audio Required",
        description: "This project needs an audio track to generate a video.",
        variant: "destructive",
      });
      return;
    }
    generateVideoMutation.mutate(project.id);
  };

  const getJobForProject = (projectId: number) => {
    return videoJobs.find(job => job.projectId === projectId);
  };

  const formatDuration = (start: string, end?: string) => {
    const startTime = new Date(start);
    if (!end) return `Started ${startTime.toLocaleTimeString()}`;
    
    const endTime = new Date(end);
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    return `${duration}s`;
  };

  if (loadingProjects) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading projects...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Video Studio</h1>
        <p className="text-muted-foreground">
          Generate high-quality videos from your completed projects with synchronized audio and Ken Burns effects.
        </p>
      </div>

      <Tabs defaultValue="projects" className="space-y-6">
        <TabsList>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="queue">Video Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const job = getJobForProject(project.id);
              const hasAudio = project.audioId;
              
              return (
                <Card key={project.id} className="relative overflow-hidden">
                  {project.thumbnailUrl && (
                    <div className="aspect-video bg-muted relative">
                      <img
                        src={project.thumbnailUrl}
                        alt={project.title || "Project thumbnail"}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/20" />
                    </div>
                  )}
                  
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg line-clamp-2">
                          {project.title || `Project ${project.id}`}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Created {new Date(project.createdAt).toLocaleDateString()}
                        </CardDescription>
                      </div>
                      <div className="flex gap-1 ml-2">
                        {hasAudio && (
                          <Badge variant="secondary" className="text-xs">
                            Audio Ready
                          </Badge>
                        )}
                        {job && (
                          <Badge 
                            variant={job.status === 'completed' ? 'default' : 
                                   job.status === 'failed' ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            {job.status === 'completed' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                            {job.status === 'failed' && <AlertCircle className="w-3 h-3 mr-1" />}
                            {job.status === 'processing' && <Clock className="w-3 h-3 mr-1" />}
                            {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0">
                    {job?.status === 'processing' && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between text-sm mb-2">
                          <span className="text-muted-foreground">Generating video...</span>
                          <span className="font-medium">{job.progress}%</span>
                        </div>
                        <Progress value={job.progress} className="h-2" />
                      </div>
                    )}

                    {job?.status === 'completed' && job.videoUrl && (
                      <div className="flex gap-2 mb-4">
                        <Button 
                          size="sm" 
                          className="flex-1"
                          onClick={() => {
                            if (job.videoUrl) {
                              console.log('Opening video from projects tab:', job.videoUrl);
                              window.open(job.videoUrl, '_blank');
                            }
                          }}
                        >
                          <Play className="w-4 h-4 mr-2" />
                          Preview
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            if (job.videoUrl) {
                              console.log('Downloading video from projects tab:', job.videoUrl);
                              const link = document.createElement('a');
                              link.href = job.videoUrl;
                              const fileName = (project.title || `project_${job.projectId}`).replace(/[^a-zA-Z0-9\s]/g, '_');
                              link.download = `video_${fileName}.mp4`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }
                          }}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </Button>
                      </div>
                    )}

                    {job?.status === 'failed' && (
                      <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                        <p className="text-sm text-destructive">
                          {job.error || "Video generation failed"}
                        </p>
                      </div>
                    )}

                    {(!job || job.status === 'failed') && (
                      <Button
                        onClick={() => handleGenerateVideo(project)}
                        disabled={!hasAudio || (generateVideoMutation.isPending && generateVideoMutation.variables === project.id)}
                        className="w-full"
                      >
                        <Video className="w-4 h-4 mr-2" />
                        {(generateVideoMutation.isPending && generateVideoMutation.variables === project.id) ? "Starting..." : "Generate Video"}
                      </Button>
                    )}

                    {!hasAudio && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Audio track required for video generation
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {projects.length === 0 && (
            <div className="text-center py-12">
              <Video className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Completed Projects</h3>
              <p className="text-muted-foreground">
                Complete some projects with audio to start generating videos.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="queue" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Video Generation Queue</CardTitle>
              <CardDescription>
                Monitor the progress of your video generation jobs
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingJobs ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : videoJobs.length > 0 ? (
                <div className="space-y-4">
                  {videoJobs.map((job) => {
                    const project = projects.find(p => p.id === job.projectId);
                    return (
                      <div key={job.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h4 className="font-medium">
                              {project?.title || `Project ${job.projectId}`}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {formatDuration(job.createdAt, job.completedAt)}
                            </p>
                          </div>
                          <Badge 
                            variant={job.status === 'completed' ? 'default' : 
                                   job.status === 'failed' ? 'destructive' : 'secondary'}
                          >
                            {job.status}
                          </Badge>
                        </div>
                        
                        {job.status === 'processing' && (
                          <div className="mt-3">
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span>Progress</span>
                              <span>{job.progress}%</span>
                            </div>
                            <Progress value={job.progress} className="h-2" />
                          </div>
                        )}

                        {job.status === 'completed' && job.videoUrl && (
                          <div className="flex gap-2 mt-3">
                            <Button 
                              size="sm" 
                              onClick={() => {
                                if (job.videoUrl) {
                                  console.log('Opening video:', job.videoUrl);
                                  window.open(job.videoUrl, '_blank');
                                }
                              }}
                            >
                              <Play className="w-4 h-4 mr-2" />
                              Preview
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                if (job.videoUrl) {
                                  console.log('Downloading video:', job.videoUrl);
                                  const link = document.createElement('a');
                                  link.href = job.videoUrl;
                                  const fileName = (project?.title || `project_${job.projectId}`).replace(/[^a-zA-Z0-9\s]/g, '_');
                                  link.download = `video_${fileName}.mp4`;
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                }
                              }}
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Download
                            </Button>
                          </div>
                        )}

                        {job.status === 'failed' && job.error && (
                          <div className="mt-3 p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
                            {job.error}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No video generation jobs yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}