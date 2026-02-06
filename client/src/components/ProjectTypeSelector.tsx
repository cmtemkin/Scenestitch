import React from 'react';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectType, PROJECT_TYPES } from '@shared/schema';
import { Film, Layout, FileText, Volume2, Clapperboard, Music } from 'lucide-react';

interface ProjectTypeSelectorProps {
  value: ProjectType;
  onChange: (value: ProjectType) => void;
  disabled?: boolean;
}

const ProjectTypeSelector: React.FC<ProjectTypeSelectorProps> = ({ 
  value, 
  onChange,
  disabled = false 
}) => {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="project-type" className="text-lg font-medium">
          Project Type
        </Label>
        <CardDescription className="text-sm mt-1">
          Choose what type of content you're creating
        </CardDescription>
      </div>

      <RadioGroup 
        value={value} 
        onValueChange={value => onChange(value as ProjectType)} 
        className="grid grid-cols-1 gap-3 pt-1"
        disabled={disabled}
      >
        {PROJECT_TYPES.map((type) => (
          <div key={type.id} className="relative">
            <RadioGroupItem
              value={type.id}
              id={`project-type-${type.id}`}
              className="peer sr-only"
              disabled={disabled}
            />
            <Label
              htmlFor={`project-type-${type.id}`}
              className="flex flex-col h-full"
            >
              <Card className={`cursor-pointer border-2 h-full transition-all peer-aria-checked:border-primary peer-aria-checked:bg-primary/5 hover:bg-accent/50 ${
                value === type.id ? 'border-primary bg-primary/5' : ''
              }`}>
                <CardHeader className="pb-2">
                  <div className="w-full flex justify-between items-start">
                    <div>
                      <CardTitle className="text-base">{type.name}</CardTitle>
                    </div>
                    {type.id === 'video' && <Film className="h-5 w-5 text-muted-foreground" />}
                    {type.id === 'blog' && <FileText className="h-5 w-5 text-muted-foreground" />}
                    {type.id === 'presentation' && <Layout className="h-5 w-5 text-muted-foreground" />}
                    {type.id === 'audio-driven' && <Volume2 className="h-5 w-5 text-muted-foreground" />}
                    {type.id === 'sora' && <Clapperboard className="h-5 w-5 text-muted-foreground" />}
                    {type.id === 'music-video' && <Music className="h-5 w-5 text-muted-foreground" />}
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-xs">
                    {type.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
};

export default ProjectTypeSelector;