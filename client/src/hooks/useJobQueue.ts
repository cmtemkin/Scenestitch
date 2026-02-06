import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface GenerationJob {
  id: string;
  scriptId: number;
  scenes: any[];
  style?: string;
  customStylePrompt?: string;
  maintainContinuity?: boolean;
  referenceImageUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    completed: number;
    total: number;
  };
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  jobType?: 'standard' | 'character-aware' | 'sora-video';
}

export type ImageGenerationJob = GenerationJob;

export interface JobProgress {
  job: ImageGenerationJob;
  sceneId: number;
  imageUrl: string;
}

export function useJobQueue() {
  const [jobs, setJobs] = useState<ImageGenerationJob[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Initialize WebSocket connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const connect = () => {
      setConnectionStatus('connecting');
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setConnectionStatus('connected');
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          switch (message.type) {
            case 'connected':
              console.log('WebSocket connection confirmed');
              break;
              
            case 'jobAdded':
              setJobs(prev => [...prev, message.data]);
              break;
              
            case 'jobUpdated':
              setJobs(prev => prev.map(job => 
                job.id === message.data.id ? message.data : job
              ));
              break;
              
            case 'jobProgress':
              const { job, sceneId, imageUrl } = message.data;
              setJobs(prev => prev.map(j => 
                j.id === job.id ? job : j
              ));
              
              // Invalidate scene data to trigger refetch with new image
              queryClient.invalidateQueries({ 
                queryKey: [`/api/scenes/${job.scriptId}`] 
              });
              break;
              
            case 'jobCompleted':
              setJobs(prev => prev.map(job => 
                job.id === message.data.id ? message.data : job
              ));
              
              // Invalidate all related queries to refresh UI
              queryClient.invalidateQueries({ 
                queryKey: [`/api/scenes/${message.data.scriptId}`] 
              });
              queryClient.invalidateQueries({ 
                queryKey: [`/api/projects/${message.data.scriptId}`] 
              });
              break;
              
            case 'jobFailed':
              setJobs(prev => prev.map(job => 
                job.id === message.data.id ? message.data : job
              ));
              break;
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected');
        setConnectionStatus('disconnected');
        
        // Attempt to reconnect after 3 seconds
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.CLOSED) {
            connect();
          }
        }, 3000);
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('disconnected');
      };
    };

    connect();

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [queryClient]);

  const getJobsForScript = (scriptId: number) => {
    return jobs.filter(job => job.scriptId === scriptId);
  };

  const getActiveJobsForScript = (scriptId: number) => {
    return jobs.filter(job => 
      job.scriptId === scriptId && 
      (job.status === 'pending' || job.status === 'processing')
    );
  };

  const hasActiveJobs = (scriptId: number) => {
    return getActiveJobsForScript(scriptId).length > 0;
  };

  const getJobProgress = (scriptId: number) => {
    const activeJobs = getActiveJobsForScript(scriptId);
    if (activeJobs.length === 0) return null;
    
    const totalCompleted = activeJobs.reduce((sum, job) => sum + job.progress.completed, 0);
    const totalScenes = activeJobs.reduce((sum, job) => sum + job.progress.total, 0);
    
    return {
      completed: totalCompleted,
      total: totalScenes,
      percentage: totalScenes > 0 ? Math.round((totalCompleted / totalScenes) * 100) : 0
    };
  };

  const getActiveImageJobs = (scriptId: number) => {
    return getActiveJobsForScript(scriptId).filter(job => job.jobType !== 'sora-video');
  };

  const getActiveVideoJobs = (scriptId: number) => {
    return getActiveJobsForScript(scriptId).filter(job => job.jobType === 'sora-video');
  };

  const hasActiveImageJobs = (scriptId: number) => {
    return getActiveImageJobs(scriptId).length > 0;
  };

  const hasActiveVideoJobs = (scriptId: number) => {
    return getActiveVideoJobs(scriptId).length > 0;
  };

  const getImageJobProgress = (scriptId: number) => {
    const activeJobs = getActiveImageJobs(scriptId);
    if (activeJobs.length === 0) return null;
    
    const totalCompleted = activeJobs.reduce((sum, job) => sum + job.progress.completed, 0);
    const totalScenes = activeJobs.reduce((sum, job) => sum + job.progress.total, 0);
    
    return {
      completed: totalCompleted,
      total: totalScenes,
      percentage: totalScenes > 0 ? Math.round((totalCompleted / totalScenes) * 100) : 0
    };
  };

  const getVideoJobProgress = (scriptId: number) => {
    const activeJobs = getActiveVideoJobs(scriptId);
    if (activeJobs.length === 0) return null;
    
    const totalCompleted = activeJobs.reduce((sum, job) => sum + job.progress.completed, 0);
    const totalScenes = activeJobs.reduce((sum, job) => sum + job.progress.total, 0);
    
    return {
      completed: totalCompleted,
      total: totalScenes,
      percentage: totalScenes > 0 ? Math.round((totalCompleted / totalScenes) * 100) : 0
    };
  };

  return {
    jobs,
    connectionStatus,
    getJobsForScript,
    getActiveJobsForScript,
    hasActiveJobs,
    getJobProgress,
    getActiveImageJobs,
    getActiveVideoJobs,
    hasActiveImageJobs,
    hasActiveVideoJobs,
    getImageJobProgress,
    getVideoJobProgress
  };
}