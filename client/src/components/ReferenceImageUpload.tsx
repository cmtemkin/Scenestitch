import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { FileUpload } from "@/components/ui/file-upload";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ReferenceImageUploadProps {
  onImageUploaded: (imageUrl: string) => void;
  isDisabled?: boolean;
}

const ReferenceImageUpload: React.FC<ReferenceImageUploadProps> = ({ 
  onImageUploaded, 
  isDisabled = false 
}) => {
  const { toast } = useToast();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("referenceImage", file);
      
      const response = await fetch("/api/upload-reference-image", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.imageUrl) {
        setPreviewUrl(data.imageUrl);
        onImageUploaded(data.imageUrl);
        toast({
          title: "Image uploaded",
          description: "Reference image has been uploaded successfully.",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message || "Could not upload image. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFilesAccepted = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      
      // Create a preview URL
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      
      // Upload the file
      uploadMutation.mutate(file);
      
      return () => {
        URL.revokeObjectURL(objectUrl);
      };
    }
  };

  return (
    <div className="mb-6">
      <Label className="block text-foreground font-medium mb-2">
        Style Reference Image (Optional)
      </Label>
      {previewUrl ? (
        <div className="relative">
          <img 
            src={previewUrl.startsWith('blob:') || previewUrl.startsWith('http') ? previewUrl : previewUrl} 
            alt="Reference" 
            className="w-full h-32 object-cover rounded-lg border border-border" 
          />
          <button
            className="absolute top-2 right-2 bg-background/80 p-1 rounded-full hover:bg-background"
            onClick={() => {
              setPreviewUrl(null);
              onImageUploaded("");
            }}
            disabled={isDisabled}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <FileUpload
          accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.gif'] }}
          maxSize={5 * 1024 * 1024} // 5MB
          multiple={false}
          onFilesAccepted={handleFilesAccepted}
          disabled={isDisabled || uploadMutation.isPending}
        >
          <div className="space-y-2 text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mx-auto h-10 w-10 text-muted-foreground"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
            <p className="text-sm text-muted-foreground">
              Drag & drop a reference image<br />
              or <span className="text-primary">browse files</span>
            </p>
            <p className="text-xs text-muted-foreground">
              For consistent style anchoring across scenes
            </p>
            {uploadMutation.isPending && (
              <p className="text-xs text-muted-foreground">Uploading...</p>
            )}
          </div>
        </FileUpload>
      )}
    </div>
  );
};

export default ReferenceImageUpload;
