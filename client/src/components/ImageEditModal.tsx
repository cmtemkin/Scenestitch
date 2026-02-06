import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { apiRequest } from '@/lib/queryClient';
import { toast } from "@/hooks/use-toast";
import { type Scene } from "@shared/schema";

interface ImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  scene: Scene | null;
  onSuccess: (scene: Scene) => void;
}

export function ImageEditModal({ isOpen, onClose, scene, onSuccess }: ImageEditModalProps) {
  const [editPrompt, setEditPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!scene) return;
    
    // Enhanced validation
    const trimmedPrompt = editPrompt.trim();
    if (!trimmedPrompt) {
      toast({
        title: "Error",
        description: "Please enter an edit prompt",
        variant: "destructive",
      });
      return;
    }
    
    if (trimmedPrompt.length < 5) {
      toast({
        title: "Error",
        description: "Please provide a more detailed edit prompt",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Log the request we're about to make for debugging
      console.log('Sending edit request with prompt:', trimmedPrompt);
      
      const response = await apiRequest(`/api/edit-image/${scene.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          editPrompt: trimmedPrompt 
        }),
      });
      
      if (response.scene) {
        // Success - close the modal and notify parent
        toast({
          title: "Success",
          description: "Image edited successfully",
        });
        onSuccess(response.scene);
        handleClose();
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error: any) {
      console.error("Error editing image:", error);
      
      // Enhanced error handling
      let errorMessage = "Failed to edit image";
      
      if (error.message) {
        errorMessage = error.message;
      } else if (error.response?.message) {
        errorMessage = error.response.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleClose = () => {
    setEditPrompt('');
    onClose();
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Image</DialogTitle>
          <DialogDescription>
            Provide instructions on how to edit the image
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {scene?.imageUrl && (
            <div className="flex justify-center mb-4">
              <img 
                src={scene.imageUrl} 
                alt={`Scene ${scene.sceneNumber}`} 
                className="max-h-[200px] object-contain rounded-md border border-gray-200" 
              />
            </div>
          )}
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="edit-prompt">Edit Instructions</Label>
              <span className="text-xs text-muted-foreground">
                {editPrompt.trim().length} / 5 characters minimum
              </span>
            </div>
            <Textarea
              id="edit-prompt"
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              placeholder="Describe how you want to edit this image. For example: 'Make the background blue' or 'Add a cat to the left side'. Be specific and detailed."
              rows={5}
              disabled={isSubmitting}
              className={`resize-none ${editPrompt.trim().length > 0 && editPrompt.trim().length < 5 ? 'border-orange-400 focus-visible:ring-orange-400' : ''}`}
            />
            <div className="text-xs text-muted-foreground mt-1">
              <p>Tips for effective edits:</p>
              <ul className="list-disc pl-4 mt-1 space-y-1">
                <li>Be specific about what to change and how</li>
                <li>Mention colors, styles, and positioning clearly</li>
                <li>Use descriptive language for best results</li>
              </ul>
            </div>
          </div>
          
          <DialogFooter className="flex justify-between">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleClose} 
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || !editPrompt.trim()}
              className={!editPrompt.trim() ? "cursor-not-allowed opacity-50" : ""}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Edit Image"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}