import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PromptEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  sceneId: number;
  currentPrompt: string;
  promptType: "dalle" | "sora";
}

interface PromptVariation {
  prompt: string;
  explanation: string;
}

interface SuggestionsResponse {
  variations: PromptVariation[];
}

const PromptEditorModal: React.FC<PromptEditorModalProps> = ({
  isOpen,
  onClose,
  sceneId,
  currentPrompt,
  promptType,
}) => {
  const { toast } = useToast();
  const [editedPrompt, setEditedPrompt] = useState(currentPrompt);
  const [selectedVariation, setSelectedVariation] = useState<number | null>(null);

  const { data: suggestions, isLoading: isFetchingSuggestions } = useQuery<SuggestionsResponse>({
    queryKey: [`/api/scenes/${sceneId}/suggestions`],
    enabled: isOpen,
    staleTime: Infinity,
  });

  const updatePromptMutation = useMutation({
    mutationFn: async (newPrompt: string) => {
      return apiRequest(`/api/scenes/${sceneId}/update-prompt`, {
        method: "PATCH",
        body: JSON.stringify({
          promptType,
          prompt: newPrompt,
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Prompt updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/scenes/${sceneId}`] });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update prompt",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updatePromptMutation.mutate(editedPrompt);
  };

  const handleSelectVariation = (variation: PromptVariation) => {
    setEditedPrompt(variation.prompt);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {promptType === "dalle" ? "Image" : "Video"} Prompt</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current/Edited Prompt */}
          <div>
            <label className="text-sm font-medium">Current Prompt</label>
            <Textarea
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              className="min-h-24 mt-2"
              placeholder="Edit your prompt here..."
              data-testid="prompt-editor-textarea"
            />
          </div>

          {/* AI Suggestions */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-medium">AI Suggestions</h3>
              {isFetchingSuggestions && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {!isFetchingSuggestions && suggestions && suggestions.variations && suggestions.variations.length > 0 ? (
              <div className="space-y-3">
                {suggestions.variations.map((variation: PromptVariation, idx: number) => (
                  <div
                    key={idx}
                    className="border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleSelectVariation(variation)}
                    data-testid={`prompt-variation-${idx}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <p className="text-sm text-foreground mb-1">{variation.prompt}</p>
                        <p className="text-xs text-muted-foreground">{variation.explanation}</p>
                      </div>
                      {editedPrompt === variation.prompt && (
                        <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : isFetchingSuggestions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No suggestions available
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={updatePromptMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updatePromptMutation.isPending || editedPrompt === currentPrompt}
            data-testid="prompt-save-button"
          >
            {updatePromptMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save Prompt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PromptEditorModal;
