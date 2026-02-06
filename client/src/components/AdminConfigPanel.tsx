import React, { useState, useEffect } from 'react';
import { Button } from "./ui/button";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from '@/lib/queryClient';
import { toast } from "@/hooks/use-toast";

// Type for the model configuration
interface ModelConfig {
  dalle_prompt_generation: string;  // Image prompt generation model
  sora_prompt_generation: string;
  scene_duration_estimation: string;
  image_generation: string;
  image_size: "1024x1024" | "1024x1536" | "1536x1024" | "1792x1024" | "1024x1792" | "auto";
  image_quality: "standard" | "hd" | "low" | "medium" | "high" | "auto";
  image_style: "vivid" | "natural";
}

// OpenAI models available for text generation
const TEXT_MODELS = [
  { id: "gpt-5.1", name: "GPT-5.1 (Latest & Best)" },
  { id: "gpt-4o", name: "GPT-4o (Most Capable)" },
  { id: "gpt-4.1", name: "GPT-4.1 (Advanced)" },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini (Balanced)" },
  { id: "gpt-4.1-nano", name: "GPT-4.1 Nano (Efficient)" },
  { id: "gpt-4.5", name: "GPT-4.5 (Latest)" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo (Fastest)" }
];

// OpenAI models available for image generation
const IMAGE_MODELS = [
  { id: "gpt-image-1", name: "GPT Image 1 (Best Quality)" },
  { id: "gpt-image-1-mini", name: "GPT Image 1 Mini (Faster & Cheaper)" }
];

// Quality options per model
const QUALITY_OPTIONS = {
  'gpt-image-1': [
    { id: "low", name: "Low" },
    { id: "medium", name: "Medium" },
    { id: "high", name: "High" },
    { id: "auto", name: "Auto (Let AI decide)" }
  ],
  'gpt-image-1-mini': [
    { id: "low", name: "Low" },
    { id: "medium", name: "Medium" },
    { id: "high", name: "High" },
    { id: "auto", name: "Auto (Let AI decide)" }
  ]
};

// Size options per model
const SIZE_OPTIONS = {
  'gpt-image-1': [
    { id: "auto", name: "Auto (Let AI decide)" },
    { id: "1024x1024", name: "1024x1024 (Square)" },
    { id: "1024x1536", name: "1024x1536 (Portrait)" },
    { id: "1536x1024", name: "1536x1024 (Landscape)" },
    { id: "1792x1024", name: "1792x1024 (Wide)" },
    { id: "1024x1792", name: "1024x1792 (Tall)" }
  ],
  'gpt-image-1-mini': [
    { id: "auto", name: "Auto (Let AI decide)" },
    { id: "1024x1024", name: "1024x1024 (Square)" },
    { id: "1024x1536", name: "1024x1536 (Portrait)" },
    { id: "1536x1024", name: "1536x1024 (Landscape)" },
    { id: "1792x1024", name: "1792x1024 (Wide)" },
    { id: "1024x1792", name: "1024x1792 (Tall)" }
  ]
};

export function AdminConfigPanel() {
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);

  // Fetch current configuration
  const fetchConfig = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest<ModelConfig>('/api/config/models');
      setConfig(response);
    } catch (error) {
      console.error('Failed to load model configuration:', error);
      toast({
        title: "Error",
        description: "Failed to load model configuration",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Save configuration
  const saveConfig = async () => {
    if (!config) return;
    
    setIsLoading(true);
    try {
      const response = await apiRequest<ModelConfig>('/api/config/models', {
        method: 'POST',
        body: JSON.stringify(config),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      setConfig(response);
      toast({
        title: "Success",
        description: "Model configuration updated successfully",
      });
    } catch (error) {
      console.error('Failed to update model configuration:', error);
      toast({
        title: "Error",
        description: "Failed to update model configuration",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Reset configuration to defaults
  const resetConfig = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest<ModelConfig>('/api/config/models/reset', {
        method: 'POST'
      });
      setConfig(response);
      toast({
        title: "Reset Complete",
        description: "Model configuration reset to defaults",
      });
    } catch (error) {
      console.error('Failed to reset model configuration:', error);
      toast({
        title: "Error",
        description: "Failed to reset model configuration",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load config on component mount
  useEffect(() => {
    fetchConfig();
  }, []);

  // Handle model change
  const handleModelChange = (settingKey: keyof ModelConfig, value: string) => {
    if (!config) return;
    
    let updatedConfig = { ...config };
    
    if (settingKey === 'image_generation') {
      // When image model is changed, we need to also update the quality to a valid value for the new model
      let updatedQuality = config.image_quality;
      
      // If changing to gpt-image-1 or gpt-image-1-mini
      if (value === 'gpt-image-1' || value === 'gpt-image-1-mini') {
        // If current quality is for legacy model, set a default for GPT Image
        if (config.image_quality === 'standard' || config.image_quality === 'hd') {
          updatedQuality = config.image_quality === 'standard' ? 'medium' : 'high';
        }
      }
      // If changing to legacy image model
      else if (value === 'dall-e-3') {
        // If current quality is for GPT Image, set a default for legacy model
        if (['low', 'medium', 'high', 'auto'].includes(config.image_quality)) {
          updatedQuality = config.image_quality === 'high' ? 'hd' : 'standard';
        }
      }
      
      updatedConfig = {
        ...config,
        [settingKey]: value,
        image_quality: updatedQuality
      };
    } else {
      // For all other settings, just update the specific value
      updatedConfig = {
        ...config,
        [settingKey]: value
      };
    }
    
    setConfig(updatedConfig);
    
    // Auto-save the configuration immediately
    saveConfigSilently(updatedConfig);
  };

  // Silent save function that doesn't show toast notifications
  const saveConfigSilently = async (configToSave: ModelConfig) => {
    try {
      await apiRequest<ModelConfig>('/api/config/models', {
        method: 'POST',
        body: JSON.stringify(configToSave),
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Failed to auto-save model configuration:', error);
      // Show error toast only if auto-save fails
      toast({
        title: "Auto-save failed",
        description: "Configuration changes may not be persisted",
        variant: "destructive"
      });
    }
  };

  if (isLoading && !config) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>AI Model Configuration</CardTitle>
          <CardDescription>Loading configuration...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>AI Model Configuration</CardTitle>
          <CardDescription>Failed to load configuration</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={fetchConfig}>Retry</Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>AI Model Configuration</CardTitle>
        <CardDescription>
          Configure the AI models used for different processes
        </CardDescription>
        <div className="flex items-center space-x-2 pt-2">
          <Switch 
            id="advanced-mode"
            checked={isAdvancedMode}
            onCheckedChange={setIsAdvancedMode}
          />
          <Label htmlFor="advanced-mode">Advanced Mode</Label>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Simple Mode */}
        {!isAdvancedMode && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="global-model">Global Text Model</Label>
              <Select 
                value={config.dalle_prompt_generation}
                onValueChange={(value) => {
                  // Update all text models at once in simple mode
                  setConfig({
                    ...config,
                    dalle_prompt_generation: value,
                    sora_prompt_generation: value,
                    scene_duration_estimation: value
                  });
                }}
              >
                <SelectTrigger id="global-model">
                  <SelectValue placeholder="Select Model" />
                </SelectTrigger>
                <SelectContent>
                  {TEXT_MODELS.map(model => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500 mt-1">
                This will be used for all text generation tasks including prompt creation
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="image-model-simple">Image Generation Model</Label>
              <Select 
                value={config.image_generation}
                onValueChange={(value) => handleModelChange('image_generation', value)}
              >
                <SelectTrigger id="image-model-simple">
                  <SelectValue placeholder="Select Model" />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_MODELS.map(model => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500 mt-1">
                Select which image generation model to use for creating visuals
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="image-quality">Image Quality</Label>
                <Select 
                  value={config.image_quality}
                  onValueChange={(value) => handleModelChange('image_quality', value as any)}
                >
                  <SelectTrigger id="image-quality">
                    <SelectValue placeholder="Select Quality" />
                  </SelectTrigger>
                  <SelectContent>
                    {QUALITY_OPTIONS[config.image_generation as keyof typeof QUALITY_OPTIONS]?.map(option => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-500 mt-1">
                  {config.image_generation === 'gpt-image-1' ? 
                    'GPT Image 1 supports: Low, Medium, High, and Auto quality.' :
                    'DALL-E 3 supports: Standard and HD quality.'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="image-size">Image Size</Label>
                <Select 
                  value={config.image_size}
                  onValueChange={(value) => handleModelChange('image_size', value as any)}
                >
                  <SelectTrigger id="image-size">
                    <SelectValue placeholder="Select Size" />
                  </SelectTrigger>
                  <SelectContent>
                    {SIZE_OPTIONS[config.image_generation as keyof typeof SIZE_OPTIONS]?.map(option => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-500 mt-1">
                  {config.image_generation === 'gpt-image-1' ? 
                    'Auto lets AI choose best size. Fixed sizes provide consistent dimensions.' :
                    'DALL-E 3 supports square, portrait, and landscape sizes.'}
                </p>
              </div>
            </div>

            {config.image_generation === 'dall-e-3' && (
              <div className="space-y-2">
                <Label htmlFor="image-style">Image Style</Label>
                <Select 
                  value={config.image_style}
                  onValueChange={(value: "vivid" | "natural") => handleModelChange('image_style', value)}
                >
                  <SelectTrigger id="image-style">
                    <SelectValue placeholder="Select Style" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vivid">Vivid (More vibrant colors)</SelectItem>
                    <SelectItem value="natural">Natural (More realistic)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-500 mt-1">
                  Style setting only applies to legacy image model
                </p>
              </div>
            )}
          </div>
        )}

        {/* Advanced Mode */}
        {isAdvancedMode && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="image-prompt-model">Image Prompt Generation Model</Label>
              <Select 
                value={config.dalle_prompt_generation}
                onValueChange={(value) => handleModelChange('dalle_prompt_generation', value)}
              >
                <SelectTrigger id="image-prompt-model">
                  <SelectValue placeholder="Select Model" />
                </SelectTrigger>
                <SelectContent>
                  {TEXT_MODELS.map(model => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sora-prompt-model">Sora Prompt Generation Model</Label>
              <Select 
                value={config.sora_prompt_generation}
                onValueChange={(value) => handleModelChange('sora_prompt_generation', value)}
              >
                <SelectTrigger id="sora-prompt-model">
                  <SelectValue placeholder="Select Model" />
                </SelectTrigger>
                <SelectContent>
                  {TEXT_MODELS.map(model => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="image-model">Image Generation Model</Label>
              <Select 
                value={config.image_generation}
                onValueChange={(value) => handleModelChange('image_generation', value)}
              >
                <SelectTrigger id="image-model">
                  <SelectValue placeholder="Select Model" />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_MODELS.map(model => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500 mt-1">
                GPT Image 1 is the latest model with improved image quality
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration-model">Duration Estimation Model</Label>
              <Select 
                value={config.scene_duration_estimation}
                onValueChange={(value) => handleModelChange('scene_duration_estimation', value)}
              >
                <SelectTrigger id="duration-model">
                  <SelectValue placeholder="Select Model" />
                </SelectTrigger>
                <SelectContent>
                  {TEXT_MODELS.map(model => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="image-size-advanced">Image Size</Label>
                <Select 
                  value={config.image_size}
                  onValueChange={(value) => handleModelChange('image_size', value as any)}
                >
                  <SelectTrigger id="image-size-advanced">
                    <SelectValue placeholder="Select Size" />
                  </SelectTrigger>
                  <SelectContent>
                    {SIZE_OPTIONS[config.image_generation as keyof typeof SIZE_OPTIONS]?.map(option => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-500 mt-1">
                  {config.image_generation === 'gpt-image-1' ? 
                    'Auto lets AI choose best size. Fixed sizes provide consistent dimensions.' :
                    'DALL-E 3 supports square, portrait, and landscape sizes.'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="image-quality-advanced">Image Quality</Label>
                <Select 
                  value={config.image_quality}
                  onValueChange={(value) => handleModelChange('image_quality', value as any)}
                >
                  <SelectTrigger id="image-quality-advanced">
                    <SelectValue placeholder="Select Quality" />
                  </SelectTrigger>
                  <SelectContent>
                    {QUALITY_OPTIONS[config.image_generation as keyof typeof QUALITY_OPTIONS]?.map(option => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-500 mt-1">
                  {config.image_generation === 'gpt-image-1' ? 
                    'GPT Image 1 supports: Low, Medium, High, and Auto quality.' :
                    'DALL-E 3 supports: Standard and HD quality.'}
                </p>
              </div>
            </div>


          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={resetConfig} disabled={isLoading}>
          Reset to Defaults
        </Button>
        <Button onClick={saveConfig} disabled={isLoading}>
          Save Changes
        </Button>
      </CardFooter>
    </Card>
  );
}