import { useJobQueue } from '@/hooks/useJobQueue';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, Wifi, WifiOff, Image, Video, Square } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface JobStatusIndicatorProps {
  scriptId: number;
  className?: string;
}

export function JobStatusIndicator({ scriptId, className = "" }: JobStatusIndicatorProps) {
  const { 
    connectionStatus, 
    hasActiveImageJobs,
    hasActiveVideoJobs,
    getActiveImageJobs,
    getActiveVideoJobs,
    getImageJobProgress,
    getVideoJobProgress
  } = useJobQueue();
  
  const hasImageJobs = hasActiveImageJobs(scriptId);
  const hasVideoJobs = hasActiveVideoJobs(scriptId);
  const isGenerating = hasImageJobs || hasVideoJobs;
  
  const imageProgress = getImageJobProgress(scriptId);
  const videoProgress = getVideoJobProgress(scriptId);
  const activeImageJobs = getActiveImageJobs(scriptId);
  const activeVideoJobs = getActiveVideoJobs(scriptId);

  const cancelMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/scripts/${scriptId}/cancel-jobs`, {
        method: 'POST'
      });
    }
  });

  if (!isGenerating && connectionStatus === 'connected') {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {connectionStatus !== 'connected' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {connectionStatus === 'connecting' ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Connecting to live updates...</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3" />
              <span>Reconnecting...</span>
            </>
          )}
        </div>
      )}

      {hasImageJobs && (
        <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image className="h-4 w-4 text-blue-500" />
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span className="text-sm font-medium">Generating Images</span>
              <Badge variant="secondary" className="text-xs">
                {connectionStatus === 'connected' ? (
                  <Wifi className="h-3 w-3 mr-1" />
                ) : (
                  <WifiOff className="h-3 w-3 mr-1" />
                )}
                Live
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {imageProgress && (
                <span className="text-xs text-muted-foreground">
                  {imageProgress.completed} / {imageProgress.total} scenes
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="h-6 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
                data-testid="button-cancel-generation"
              >
                <Square className="h-3 w-3 mr-1" />
                {cancelMutation.isPending ? 'Stopping...' : 'Stop'}
              </Button>
            </div>
          </div>

          {imageProgress && (
            <div className="space-y-1">
              <Progress value={imageProgress.percentage} className="h-2" />
              <div className="text-xs text-muted-foreground text-center">
                {imageProgress.percentage}% complete
              </div>
            </div>
          )}

          {activeImageJobs.length > 0 && (
            <div className="space-y-1">
              {activeImageJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between text-xs">
                  <span className="truncate max-w-[200px]">
                    {job.style} style
                  </span>
                  <div className="flex items-center gap-1">
                    {job.status === 'processing' && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    <span className="text-muted-foreground">
                      {job.progress.completed}/{job.progress.total}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Images are being generated in the background. You can close this window and return later.
          </div>
        </div>
      )}

      {hasVideoJobs && (
        <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border border-purple-500/30 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-purple-500" />
              <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
              <span className="text-sm font-medium">Generating Sora Videos</span>
              <Badge variant="secondary" className="text-xs bg-purple-500/20 text-purple-300 border-purple-500/30">
                {connectionStatus === 'connected' ? (
                  <Wifi className="h-3 w-3 mr-1" />
                ) : (
                  <WifiOff className="h-3 w-3 mr-1" />
                )}
                Live
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {videoProgress && (
                <span className="text-xs text-muted-foreground">
                  {videoProgress.completed} / {videoProgress.total} videos
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="h-6 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
                data-testid="button-cancel-video-generation"
              >
                <Square className="h-3 w-3 mr-1" />
                {cancelMutation.isPending ? 'Stopping...' : 'Stop'}
              </Button>
            </div>
          </div>

          {videoProgress && (
            <div className="space-y-1">
              <Progress value={videoProgress.percentage} className="h-2 [&>*]:bg-purple-500" />
              <div className="text-xs text-muted-foreground text-center">
                {videoProgress.percentage}% complete
              </div>
            </div>
          )}

          {activeVideoJobs.length > 0 && (
            <div className="space-y-1">
              {activeVideoJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between text-xs">
                  <span className="truncate max-w-[200px]">
                    Sora video generation
                  </span>
                  <div className="flex items-center gap-1">
                    {job.status === 'processing' && (
                      <Loader2 className="h-3 w-3 animate-spin text-purple-500" />
                    )}
                    <span className="text-muted-foreground">
                      {job.progress.completed}/{job.progress.total}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Videos are being generated with Sora AI. This may take 2-3 minutes per video. You can close this window and return later.
          </div>
        </div>
      )}
    </div>
  );
}
