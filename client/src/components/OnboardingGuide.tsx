import React from "react";
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  Steps,
  Step,
  StepDescription,
  StepIndicator,
  StepSeparator,
  StepStatus,
  StepTitle,
  useSteps,
} from "@/components/ui/steps";
import { Lightbulb, Edit, Palette, ArrowRight, PlayCircle } from "lucide-react";

interface OnboardingGuideProps {
  onDismiss: () => void;
  onInsertDemoScript: () => void;
}

export function OnboardingGuide({ onDismiss, onInsertDemoScript }: OnboardingGuideProps) {
  const { activeStep, setActiveStep } = useSteps({
    index: 0,
    count: 3,
  });

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-lg border border-border/60 animate-in fade-in duration-300">
      <CardHeader className="bg-card">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Lightbulb className="h-5 w-5 text-primary" />
          Welcome to SceneStitch
        </CardTitle>
        <CardDescription>
          Turn your script into compelling visual assets in three simple steps
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 pb-2">
        <Steps activeStep={activeStep} className="mb-4">
          <Step onMouseEnter={() => setActiveStep(0)} className="cursor-pointer">
            <StepIndicator>
              <StepStatus
                complete={<Edit className="h-4 w-4" />}
                incomplete={<Edit className="h-4 w-4" />}
                active={<Edit className="h-4 w-4" />}
              />
            </StepIndicator>
            <StepSeparator />
            <StepTitle>Add Script</StepTitle>
            <StepDescription>Write or paste your script</StepDescription>
          </Step>
          
          <Step onMouseEnter={() => setActiveStep(1)} className="cursor-pointer">
            <StepIndicator>
              <StepStatus
                complete={<Palette className="h-4 w-4" />}
                incomplete={<Palette className="h-4 w-4" />}
                active={<Palette className="h-4 w-4" />}
              />
            </StepIndicator>
            <StepSeparator />
            <StepTitle>Choose Style</StepTitle>
            <StepDescription>Select a visual style</StepDescription>
          </Step>
          
          <Step onMouseEnter={() => setActiveStep(2)} className="cursor-pointer">
            <StepIndicator>
              <StepStatus
                complete={<PlayCircle className="h-4 w-4" />}
                incomplete={<PlayCircle className="h-4 w-4" />}
                active={<PlayCircle className="h-4 w-4" />}
              />
            </StepIndicator>
            <StepTitle>Generate</StepTitle>
            <StepDescription>Create your scenes</StepDescription>
          </Step>
        </Steps>

        <div className="p-4 my-4 bg-secondary/30 rounded-lg">
          {activeStep === 0 && (
            <div className="space-y-3">
              <h3 className="font-medium">1. Add Your Script</h3>
              <p className="text-sm text-muted-foreground">
                Paste your script into the text editor on the left panel. Your script will be automatically
                split into logical scenes.
              </p>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={onInsertDemoScript}
                className="gap-1"
              >
                <Lightbulb className="h-4 w-4" />
                Try with a demo script
              </Button>
            </div>
          )}
          
          {activeStep === 1 && (
            <div className="space-y-3">
              <h3 className="font-medium">2. Choose a Visual Style</h3>
              <p className="text-sm text-muted-foreground">
                Select a visual style from the "Style" tab to define how your scenes will look.
                Each style creates a different visual aesthetic for your storyboard.
              </p>
              <div className="flex gap-2 text-xs">
                <span className="bg-primary/10 text-primary px-2 py-1 rounded">Comic Pane</span>
                <span className="bg-primary/10 text-primary px-2 py-1 rounded">Low Poly</span>
                <span className="bg-primary/10 text-primary px-2 py-1 rounded">Flat Design</span>
                <span className="bg-primary/10 text-primary px-2 py-1 rounded">+25 more</span>
              </div>
            </div>
          )}
          
          {activeStep === 2 && (
            <div className="space-y-3">
              <h3 className="font-medium">3. Generate Your Scenes</h3>
              <p className="text-sm text-muted-foreground">
                Click "Generate Scene Prompts" to create scene descriptions, then "Generate Images" 
                to visualize each scene. You can edit any scene or regenerate specific images after creation.
              </p>
              <div className="flex items-center gap-2 text-sm">
                <ArrowRight className="h-4 w-4 text-primary" />
                <span>Each step builds on the previous one</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between pt-2">
        <Button variant="outline" size="sm" onClick={onDismiss}>
          Skip tutorial
        </Button>
        <Button 
          size="sm"
          onClick={() => {
            if (activeStep < 2) {
              setActiveStep(activeStep + 1);
            } else {
              onDismiss();
            }
          }}
        >
          {activeStep < 2 ? "Next" : "Get Started"}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default OnboardingGuide;