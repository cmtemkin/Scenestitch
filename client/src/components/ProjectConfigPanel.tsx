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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Type for the model configuration
interface ModelConfig {
  dalle_prompt_generation: string;  // Will rename to image_prompt_generation in future update
  sora_prompt_generation: string;
  scene_duration_estimation: string;
  image_generation: string;
  image_size: "1024x1024" | "1024x1536" | "1536x1024" | "1792x1024" | "1024x1792" | "auto";
  image_quality: "standard" | "hd" | "low" | "medium" | "high" | "auto";
  image_style: "vivid" | "natural";
}

// OpenAI models available for text generation
const TEXT_MODELS = [
  { id: "gpt-4o", name: "GPT-4o (Most Capable)" },
  { id: "gpt-4.1", name: "GPT-4.1 (Advanced)" },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini (Balanced)" },
  { id: "gpt-4.1-nano", name: "GPT-4.1 Nano (Efficient)" },
  { id: "gpt-4.5", name: "GPT-4.5 (Latest)" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo (Fastest)" }
];

// OpenAI models available for image generation
const IMAGE_MODELS = [
  { id: "gpt-image-1", name: "GPT Image 1 (Latest & Best)" },
  { id: "dall-e-3", name: "DALL-E 3 (Legacy)" }
];

// Quality options per model
const QUALITY_OPTIONS = {
  'gpt-image-1': [
    { id: "low", name: "Low" },
    { id: "medium", name: "Medium" },
    { id: "high", name: "High" },
    { id: "auto", name: "Auto (Let AI decide)" }
  ],
  'dall-e-3': [
    { id: "standard", name: "Standard" },
    { id: "hd", name: "HD (Higher Quality)" }
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
  'dall-e-3': [
    { id: "1024x1024", name: "1024x1024 (Square)" },
    { id: "1024x1792", name: "1024x1792 (Portrait)" },
    { id: "1792x1024", name: "1792x1024 (Landscape)" }
  ]
};

// Style options per model
const STYLE_OPTIONS = {
  'gpt-image-1': [
    { id: "natural", name: "Natural" },
    { id: "vivid", name: "Vivid" }
  ],
  'dall-e-3': [
    { id: "natural", name: "Natural" },
    { id: "vivid", name: "Vivid" }
  ]
};

interface ProjectConfigPanelProps {
  projectId: number;
}

export function ProjectConfigPanel({ projectId }: ProjectConfigPanelProps) {
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [globalConfig, setGlobalConfig] = useState<ModelConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("project");

  // Fetch the project's model settings
  const fetchProjectConfig = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest<{ modelSettings: ModelConfig | null }>(`/api/projects/${projectId}/model-settings`);
      setConfig(response.modelSettings);
    } catch (error) {
      console.error('Failed to fetch project model settings:', error);
      toast({
        title: "Error",
        description: "Failed to load project model settings",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch global model configuration for reference
  const fetchGlobalConfig = async () => {
    try {
      const response = await apiRequest<ModelConfig>('/api/config/models');
      setGlobalConfig(response);
    } catch (error) {
      console.error('Failed to fetch global model configuration:', error);
    }
  };

  // Update project configuration
  const updateConfig = async () => {
    if (!config) return;
    
    setIsLoading(true);
    try {
      const response = await apiRequest<ModelConfig>(`/api/projects/${projectId}/model-settings`, {
        method: 'POST',
        body: JSON.stringify({ modelSettings: config })
      });
      
      setConfig(response);
      toast({
        title: "Success",
        description: "Project model settings updated successfully",
      });
    } catch (error) {
      console.error('Failed to update project model settings:', error);
      toast({
        title: "Error",
        description: "Failed to update project model settings",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Reset project configuration to use global settings
  const resetToGlobal = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest<{ modelSettings: ModelConfig | null }>(`/api/projects/${projectId}/model-settings`, {
        method: 'POST',
        body: JSON.stringify({ modelSettings: null })
      });
      
      setConfig(response.modelSettings);
      toast({
        title: "Reset Complete",
        description: "Project will now use global model settings",
      });
    } catch (error) {
      console.error('Failed to reset project model settings:', error);
      toast({
        title: "Error",
        description: "Failed to reset project model settings",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load configs on component mount
  useEffect(() => {
    fetchProjectConfig();
    fetchGlobalConfig();
  }, [projectId]);

  // Handle model change
  const handleModelChange = (settingKey: keyof ModelConfig, value: string) => {
    if (!config) return;
    
    if (settingKey === 'image_generation') {
      // When image generation model changes, update quality and size options to match
      const newConfig = { 
        ...config, 
        [settingKey]: value,
        image_quality: QUALITY_OPTIONS[value as keyof typeof QUALITY_OPTIONS][0].id as any,
        image_size: SIZE_OPTIONS[value as keyof typeof SIZE_OPTIONS][0].id as any
      };
      setConfig(newConfig);
    } else {
      // Normal setting update
      setConfig({ ...config, [settingKey]: value });
    }
  };

  // Create configuration if it doesn't exist
  const createProjectConfig = () => {
    if (globalConfig) {
      setConfig({...globalConfig});
    }
  };

  if (isLoading && !config && !globalConfig) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Project Model Settings</CardTitle>
          <CardDescription>Loading settings...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Handle the case where the project doesn't have custom settings yet
  if (!config && globalConfig) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Project Model Settings</CardTitle>
          <CardDescription>
            This project is using global model settings. Create project-specific settings to customize.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-wrap gap-2 justify-between">
          <Button variant="outline" onClick={fetchProjectConfig}>
            Refresh
          </Button>
          <Button onClick={createProjectConfig} className="whitespace-nowrap">
            Create Project Settings
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!config && !globalConfig) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Project Model Settings</CardTitle>
          <CardDescription>Failed to load settings</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={() => {
            fetchProjectConfig();
            fetchGlobalConfig();
          }}>Retry</Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Project Model Settings</CardTitle>
        <CardDescription>
          Configure AI models for this specific project
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
              <Label htmlFor="image-generation-model">Image Generation Model</Label>
              <Select 
                value={config?.image_generation}
                onValueChange={(value) => handleModelChange('image_generation', value)}
              >
                <SelectTrigger id="image-generation-model">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_MODELS.map(model => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="image-quality">Image Quality</Label>
              <Select 
                value={config?.image_quality}
                onValueChange={(value) => handleModelChange('image_quality', value)}
              >
                <SelectTrigger id="image-quality">
                  <SelectValue placeholder="Select quality" />
                </SelectTrigger>
                <SelectContent>
                  {config && QUALITY_OPTIONS[config.image_generation as keyof typeof QUALITY_OPTIONS]?.map(option => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="image-size">Image Size</Label>
              <Select 
                value={config?.image_size}
                onValueChange={(value) => handleModelChange('image_size', value as any)}
              >
                <SelectTrigger id="image-size">
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  {config && SIZE_OPTIONS[config.image_generation as keyof typeof SIZE_OPTIONS]?.map(option => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="image-style">Image Style</Label>
              <Select 
                value={config?.image_style}
                onValueChange={(value) => handleModelChange('image_style', value as any)}
              >
                <SelectTrigger id="image-style">
                  <SelectValue placeholder="Select style" />
                </SelectTrigger>
                <SelectContent>
                  {config && STYLE_OPTIONS[config.image_generation as keyof typeof STYLE_OPTIONS]?.map(option => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Advanced Mode */}
        {isAdvancedMode && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dalle-prompt-generation">Image Prompt Generation Model</Label>
              <Select 
                value={config?.dalle_prompt_generation}
                onValueChange={(value) => handleModelChange('dalle_prompt_generation', value)}
              >
                <SelectTrigger id="image-prompt-generation">
                  <SelectValue placeholder="Select model" />
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
              <Label htmlFor="sora-prompt-generation">Sora Prompt Generation Model</Label>
              <Select 
                value={config?.sora_prompt_generation}
                onValueChange={(value) => handleModelChange('sora_prompt_generation', value)}
              >
                <SelectTrigger id="sora-prompt-generation">
                  <SelectValue placeholder="Select model" />
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
              <Label htmlFor="scene-duration-estimation">Scene Duration Estimation Model</Label>
              <Select 
                value={config?.scene_duration_estimation}
                onValueChange={(value) => handleModelChange('scene_duration_estimation', value)}
              >
                <SelectTrigger id="scene-duration-estimation">
                  <SelectValue placeholder="Select model" />
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
              <Label htmlFor="image-generation-model-adv">Image Generation Model</Label>
              <Select 
                value={config?.image_generation}
                onValueChange={(value) => handleModelChange('image_generation', value)}
              >
                <SelectTrigger id="image-generation-model-adv">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_MODELS.map(model => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="image-quality-adv">Image Quality</Label>
              <Select 
                value={config?.image_quality}
                onValueChange={(value) => handleModelChange('image_quality', value)}
              >
                <SelectTrigger id="image-quality-adv">
                  <SelectValue placeholder="Select quality" />
                </SelectTrigger>
                <SelectContent>
                  {config && QUALITY_OPTIONS[config.image_generation as keyof typeof QUALITY_OPTIONS]?.map(option => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="image-size-adv">Image Size</Label>
              <Select 
                value={config?.image_size}
                onValueChange={(value) => handleModelChange('image_size', value as any)}
              >
                <SelectTrigger id="image-size-adv">
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  {config && SIZE_OPTIONS[config.image_generation as keyof typeof SIZE_OPTIONS]?.map(option => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="image-style-adv">Image Style</Label>
              <Select 
                value={config?.image_style}
                onValueChange={(value) => handleModelChange('image_style', value as any)}
              >
                <SelectTrigger id="image-style-adv">
                  <SelectValue placeholder="Select style" />
                </SelectTrigger>
                <SelectContent>
                  {config && STYLE_OPTIONS[config.image_generation as keyof typeof STYLE_OPTIONS]?.map(option => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button 
          variant="destructive" 
          onClick={resetToGlobal}
          disabled={isLoading}
        >
          {isLoading ? "Processing..." : "Reset to Global Settings"}
        </Button>
        <Button 
          onClick={updateConfig}
          disabled={isLoading}
        >
          {isLoading ? "Saving..." : "Save Settings"}
        </Button>
      </CardFooter>
    </Card>
  );
}