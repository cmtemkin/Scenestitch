import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Music, Upload, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";

interface EarlyAudioUploadProps {
  projectId?: number;
  onAudioUploaded?: (audioInfo: { duration: number; url: string }) => void;
  hasAudio?: boolean;
  disabled?: boolean;
}

export function EarlyAudioUpload({ 
  projectId, 
  onAudioUploaded, 
  hasAudio = false,
  disabled = false 
}: EarlyAudioUploadProps) {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!audioFile || !projectId) {
        throw new Error("Audio file and project ID are required");
      }

      const formData = new FormData();
      formData.append("audioFile", audioFile);

      return apiRequest(`/api/upload-audio/${projectId}`, {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: (data) => {
      const isEarlyUpload = data.isEarlyUpload;
      const duration = data.totalDuration || 0;
      
      toast({
        title: "Audio uploaded successfully",
        description: isEarlyUpload 
          ? `Audio duration: ${duration.toFixed(1)}s. Recommended ${data.recommendedScenes} scenes for optimal timing.`
          : `Audio duration: ${duration.toFixed(1)}s. Scene timing has been optimized.`,
      });
      
      onAudioUploaded?.({
        duration: duration,
        url: data.audioUrl || ""
      });
      
      setIsOpen(false);
      setAudioFile(null);
    },
    onError: (error: any) => {
      console.error("Audio upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload audio file",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['audio/mp3', 'audio/wav', 'audio/m4a', 'audio/aac', 'audio/mpeg'];
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|aac)$/i)) {
        toast({
          title: "Invalid file type",
          description: "Please select an audio file (MP3, WAV, M4A, or AAC)",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (50MB limit)
      if (file.size > 50 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Audio file must be smaller than 50MB",
          variant: "destructive",
        });
        return;
      }

      setAudioFile(file);
    }
  };

  const handleUpload = () => {
    uploadMutation.mutate();
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button
                variant={hasAudio ? "secondary" : "outline"}
                className={cn(
                  "w-full transition-all duration-200",
                  hasAudio 
                    ? "bg-green-100 text-green-800 border-green-300 hover:bg-green-200" 
                    : "text-muted-foreground hover:text-foreground opacity-80 border-dashed"
                )}
                disabled={disabled || !projectId}
              >
                {hasAudio ? (
                  <CheckCircle className="mr-2 h-4 w-4" />
                ) : (
                  <Music className="mr-2 h-4 w-4" />
                )}
                <span>{hasAudio ? "Audio Uploaded" : "Upload Audio (Optional)"}</span>
              </Button>
            </DialogTrigger>
            
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Upload Audio File</DialogTitle>
                <DialogDescription>
                  Upload your narration or background audio to help optimize scene timing and duration.
                  This is optional but recommended for better scene pacing.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="grid w-full max-w-sm items-center gap-1.5">
                  <label htmlFor="audio-upload" className="text-sm font-medium">
                    Audio File
                  </label>
                  <input
                    id="audio-upload"
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.aac"
                    onChange={handleFileChange}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-foreground file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={uploadMutation.isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Supported formats: MP3, WAV, M4A, AAC (max 50MB)
                  </p>
                </div>

                {audioFile && (
                  <div className="p-3 bg-secondary rounded-md">
                    <div className="text-sm font-medium">{audioFile.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {(audioFile.size / (1024 * 1024)).toFixed(1)} MB
                    </div>
                  </div>
                )}

                {uploadMutation.isPending && (
                  <div className="space-y-2">
                    <Progress value={50} className="h-2" />
                    <p className="text-sm text-center text-muted-foreground">
                      Processing audio file...
                    </p>
                  </div>
                )}

                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsOpen(false)}
                    disabled={uploadMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUpload}
                    disabled={!audioFile || uploadMutation.isPending}
                  >
                    {uploadMutation.isPending ? (
                      <>
                        <Upload className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Audio
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          {!projectId ? (
            <p className="text-muted-foreground">Save your project first to enable audio upload.</p>
          ) : hasAudio ? (
            <p>Audio file uploaded. Scene generation will use this for optimal timing.</p>
          ) : (
            <p>Upload your narration or background audio to help optimize scene timing. This step is optional but recommended for better pacing.</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}