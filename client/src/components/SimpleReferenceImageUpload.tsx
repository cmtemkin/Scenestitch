import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, X, Image as ImageIcon } from "lucide-react";

interface SimpleReferenceImageUploadProps {
  onImageUploaded: (url: string) => void;
  isDisabled?: boolean;
}

export default function SimpleReferenceImageUpload({ 
  onImageUploaded, 
  isDisabled = false 
}: SimpleReferenceImageUploadProps) {
  const { toast } = useToast();
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string>("");

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("referenceImage", file);
      
      const response = await fetch("/api/upload-reference-image", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setUploadedImageUrl(data.imageUrl);
      onImageUploaded(data.imageUrl);
      toast({
        title: "Image uploaded successfully",
        description: "Your reference image will help guide the visual style.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload image",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          title: "File too large",
          description: "Please select an image smaller than 10MB",
          variant: "destructive",
        });
        return;
      }
      
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file",
          variant: "destructive",
        });
        return;
      }
      
      uploadMutation.mutate(file);
    }
  };

  const removeImage = () => {
    setUploadedImageUrl("");
    onImageUploaded("");
  };

  if (uploadedImageUrl) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <img
              src={uploadedImageUrl}
              alt="Reference"
              className="w-full h-32 object-cover rounded-lg"
            />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="absolute top-2 right-2"
              onClick={removeImage}
              disabled={isDisabled}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Reference image uploaded successfully
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dashed">
      <CardContent className="p-6">
        <div className="text-center space-y-4">
          <div className="mx-auto w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
            {uploadMutation.isPending ? (
              <Upload className="h-5 w-5 animate-pulse" />
            ) : (
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          
          <div>
            <h3 className="font-medium">Upload Reference Image</h3>
            <p className="text-sm text-muted-foreground">
              Optional: Upload an image to guide the visual style
            </p>
          </div>
          
          <div>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              disabled={isDisabled || uploadMutation.isPending}
              className="hidden"
              id="reference-upload"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById('reference-upload')?.click()}
              disabled={isDisabled || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <>
                  <Upload className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Choose Image
                </>
              )}
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground">
            PNG, JPG up to 10MB
          </p>
        </div>
      </CardContent>
    </Card>
  );
}