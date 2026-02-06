import React, { useState } from 'react';
import { FileUpload } from '@/components/ui/file-upload';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { apiRequest } from '@/lib/queryClient';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Music, ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface AudioUploadProps {
  onAudioAnalyzed: (timestamps: Array<{ sceneId: number, startTime: number, endTime: number }>) => void;
  scriptId: number;
  disabled?: boolean;
  preloadedAudio?: { url: string; filename: string; duration: number } | null;
  hasExistingAudioProcessing?: boolean;
}

export function AudioUpload({ onAudioAnalyzed, scriptId, disabled = false, preloadedAudio = null, hasExistingAudioProcessing = false }: AudioUploadProps) {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      // Create a multipart form data object
      const formData = new FormData();
      formData.append('audioFile', file);
      
      // Use fetch directly for multipart form data instead of apiRequest
      const response = await fetch(`/api/upload-audio/${scriptId}`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to upload audio file');
      }
      
      return await response.json();
    },
    onSuccess: (data: { 
      audioUrl: string, 
      timestamps: Array<{ sceneId: number, startTime: number, endTime: number }>,
      message: string
    }) => {
      toast({
        title: 'Audio uploaded successfully',
        description: 'Timestamps have been extracted and applied to scenes',
      });
      
      // Pass the timestamps back to the parent component
      onAudioAnalyzed(data.timestamps);
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Using a basic file input for simplicity and better browser compatibility
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setAudioFile(event.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (audioFile) {
      uploadMutation.mutate(audioFile);
    }
  };

  const preloadedAudioMutation = useMutation({
    mutationFn: async () => {
      if (!preloadedAudio) throw new Error('No preloaded audio available');
      
      const response = await fetch(`/api/upload-audio/${scriptId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl: preloadedAudio.url })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to process audio');
      }
      
      return await response.json();
    },
    onSuccess: (data: { 
      audioUrl: string, 
      timestamps: Array<{ sceneId: number, startTime: number, endTime: number }>,
      message: string
    }) => {
      toast({
        title: 'Audio processed successfully',
        description: 'Timestamps have been extracted and applied to scenes',
      });
      onAudioAnalyzed(data.timestamps);
    },
    onError: (error: Error) => {
      toast({
        title: 'Processing failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handlePreloadedAudioProcess = () => {
    if (!preloadedAudio || preloadedAudioMutation.isPending) return;
    
    toast({
      title: 'Processing audio...',
      description: 'Extracting timestamps from the audio file',
    });
    
    preloadedAudioMutation.mutate();
  };

  return (
    <div className="relative">
      <Collapsible 
        open={isOpen} 
        onOpenChange={setIsOpen} 
        className="border rounded-md bg-card/50 backdrop-blur-sm shadow-sm"
      >
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <Music className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">Audio Processing</h3>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              {isOpen ? 
                <ChevronUp className="h-4 w-4" /> : 
                <ChevronDown className="h-4 w-4" />
              }
              <span className="sr-only">Toggle audio processing</span>
            </Button>
          </CollapsibleTrigger>
        </div>
        
        <CollapsibleContent className="px-3 pb-3 space-y-3">
          {/* Show existing audio processing status */}
          {hasExistingAudioProcessing ? (
            <div className="bg-green-50 border border-green-200 rounded-md p-3">
              <div className="flex items-center gap-2 mb-2">
                <Music className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">Audio Processing Complete</span>
              </div>
              <div className="text-sm text-green-700">
                Audio timestamps have been successfully applied to all scenes. Audio processing is complete for this project.
              </div>
            </div>
          ) : (
            <>
              {!preloadedAudio && (
                <p className="text-sm text-muted-foreground">
                  Upload a narration audio file to automatically set timestamps for each scene.
                </p>
              )}
              
              {preloadedAudio && (
                <p className="text-sm text-muted-foreground">
                  Process the associated TTS audio file to automatically set timestamps for each scene.
                </p>
              )}
              
              {/* Show preloaded audio info for audio-driven projects */}
              {preloadedAudio ? (
                <div className="bg-primary/10 border border-primary/20 rounded-md p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Music className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-primary">Audio file from selected TTS</span>
                  </div>
                  <div className="text-sm text-muted-foreground mb-3">
                    <div>{preloadedAudio.filename}</div>
                    <div>Duration: {Math.floor(preloadedAudio.duration / 60)}:{(preloadedAudio.duration % 60).toFixed(0).padStart(2, '0')}</div>
                  </div>
                  <Button 
                    onClick={handlePreloadedAudioProcess}
                    className="w-full"
                    disabled={disabled || preloadedAudioMutation.isPending}
                  >
                    {preloadedAudioMutation.isPending ? 'Processing...' : 'Process Audio'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleFileChange}
                      disabled={uploadMutation.isPending || disabled}
                      className="text-sm w-full max-w-xs cursor-pointer"
                    />
                    
                    {audioFile && (
                      <div className="text-xs text-muted-foreground">
                        {audioFile.name} ({(audioFile.size / (1024 * 1024)).toFixed(1)} MB)
                      </div>
                    )}
                    
                    <div className="ml-auto">
                      <Button 
                        onClick={handleUpload} 
                        disabled={!audioFile || uploadMutation.isPending || disabled}
                        variant="default"
                        size="sm"
                      >
                        {uploadMutation.isPending ? 'Processing...' : 'Process Audio'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          
          {(uploadMutation.isPending || preloadedAudioMutation.isPending) && (
            <div className="space-y-2">
              <Progress value={50} className="h-1.5" />
              <p className="text-xs text-center text-muted-foreground">Processing audio...</p>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}