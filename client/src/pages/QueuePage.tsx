import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, CheckCircle, XCircle, Loader2, RefreshCw, Trash2, Image, Video } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Job {
  id: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  scriptId: number;
  projectTitle?: string;
  totalScenes: number;
  completedScenes: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
  progress?: number;
  jobType?: 'standard' | 'character-aware' | 'sora-video';
  style?: string;
}

export default function QueuePage() {
  const { toast } = useToast();
  const [wsConnected, setWsConnected] = useState(false);
  const [liveJobs, setLiveJobs] = useState<Job[]>([]);

  // Fetch initial job data
  const { data: jobs = [], refetch, isLoading } = useQuery<Job[]>({
    queryKey: ['/api/jobs'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // WebSocket connection for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      setWsConnected(true);
      console.log('Queue page WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'jobAdded' || message.type === 'jobUpdated') {
          setLiveJobs(prev => {
            const existing = prev.findIndex(job => job.id === message.data.id);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = message.data;
              return updated;
            } else {
              return [...prev, message.data];
            }
          });
        }
        
        if (message.type === 'jobProgress') {
          setLiveJobs(prev => {
            const updated = [...prev];
            const jobIndex = updated.findIndex(job => job.id === message.data.job.id);
            if (jobIndex >= 0) {
              updated[jobIndex] = message.data.job;
            }
            return updated;
          });
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      console.log('Queue page WebSocket disconnected');
    };

    ws.onerror = (error) => {
      console.error('Queue page WebSocket error:', error);
      setWsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  // Merge API data with live updates
  const allJobs = [...(jobs || []), ...liveJobs.filter(liveJob => 
    !jobs?.some(apiJob => apiJob.id === liveJob.id)
  )];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: "secondary",
      processing: "default",
      completed: "default",
      failed: "destructive"
    } as const;

    const colors = {
      pending: "bg-yellow-100 text-yellow-800",
      processing: "bg-blue-100 text-blue-800",
      completed: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800"
    };

    return (
      <Badge variant={variants[status as keyof typeof variants]} className={colors[status as keyof typeof colors]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const filterJobsByStatus = (status: string) => {
    return allJobs.filter(job => job.status === status);
  };

  const getProgress = (job: Job) => {
    if (job.totalScenes === 0) return 0;
    return Math.round((job.completedScenes / job.totalScenes) * 100);
  };

  const clearCompletedJobs = async () => {
    try {
      const response = await fetch('/api/jobs/clear-completed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Completed jobs cleared successfully"
        });
        refetch(); // Refresh the job list
      } else {
        throw new Error('Failed to clear completed jobs');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear completed jobs",
        variant: "destructive"
      });
    }
  };

  const getJobTypeInfo = (job: Job) => {
    if (job.jobType === 'sora-video') {
      return {
        icon: <Video className="h-4 w-4 text-purple-500" />,
        title: 'Sora Video Generation',
        progressLabel: 'videos',
        progressColor: '[&>*]:bg-purple-500',
        borderColor: 'border-purple-500/30',
        description: 'AI videos generated with OpenAI Sora'
      };
    }
    return {
      icon: <Image className="h-4 w-4 text-blue-500" />,
      title: job.jobType === 'character-aware' ? 'Character-Aware Image Generation' : 'Image Generation',
      progressLabel: 'scenes',
      progressColor: '',
      borderColor: '',
      description: job.style ? `${job.style} style` : 'AI-generated images'
    };
  };

  const JobCard = ({ job }: { job: Job }) => {
    const typeInfo = getJobTypeInfo(job);
    
    return (
      <Card className={`mb-4 ${typeInfo.borderColor}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              {typeInfo.icon}
              {getStatusIcon(job.status)}
              {typeInfo.title}
            </CardTitle>
            {getStatusBadge(job.status)}
          </div>
          <div className="text-sm text-muted-foreground">
            Project: {job.projectTitle || `Script ${job.scriptId}`} • Job ID: {job.id.slice(0, 20)}...
          </div>
          {typeInfo.description && (
            <div className="text-xs text-muted-foreground mt-1">
              {typeInfo.description}
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Progress: {job.completedScenes}/{job.totalScenes} {typeInfo.progressLabel}</span>
              <span>{getProgress(job)}%</span>
            </div>
            <Progress value={getProgress(job)} className={`h-2 ${typeInfo.progressColor}`} />
            
            <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div>
                <span className="font-medium">Created:</span> {formatTimestamp(job.createdAt)}
              </div>
              <div>
                <span className="font-medium">Updated:</span> {formatTimestamp(job.updatedAt)}
              </div>
            </div>
            
            {job.error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md dark:bg-red-900/20 dark:border-red-800">
                <div className="text-sm font-medium text-red-800 dark:text-red-400">Error:</div>
                <div className="text-sm text-red-700 dark:text-red-300 mt-1">{job.error}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Job Queue</h1>
          <p className="text-muted-foreground mt-1">
            Monitor background tasks and job progress
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            {wsConnected ? 'Connected' : 'Disconnected'}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={clearCompletedJobs}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear Completed
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Jobs ({allJobs.length})</TabsTrigger>
          <TabsTrigger value="processing">
            Processing ({filterJobsByStatus('processing').length})
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pending ({filterJobsByStatus('pending').length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({filterJobsByStatus('completed').length})
          </TabsTrigger>
          <TabsTrigger value="failed">
            Failed ({filterJobsByStatus('failed').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <ScrollArea className="h-[600px]">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">Loading jobs...</span>
              </div>
            ) : allJobs.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">No jobs in queue</h3>
                <p className="text-gray-500 dark:text-gray-500">Jobs will appear here when you start generating images or Sora videos.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {allJobs
                  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                  .map((job) => (
                    <JobCard key={job.id} job={job} />
                  ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {['processing', 'pending', 'completed', 'failed'].map((status) => (
          <TabsContent key={status} value={status}>
            <ScrollArea className="h-[600px]">
              {filterJobsByStatus(status).length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-600 mb-2">
                    No {status} jobs
                  </h3>
                  <p className="text-gray-500">
                    {status.charAt(0).toUpperCase() + status.slice(1)} jobs will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filterJobsByStatus(status)
                    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                    .map((job) => (
                      <JobCard key={job.id} job={job} />
                    ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}