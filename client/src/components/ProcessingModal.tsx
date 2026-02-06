import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle2, 
  AlertCircle, 
  LoaderCircle, 
  ChevronDown, 
  RefreshCw
} from "lucide-react";
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

// Task status constants
const PENDING = 'pending';
const PROCESSING = 'processing';
const COMPLETED = 'completed';
const FAILED = 'failed';

// Define individual task status
interface TaskStatus {
  id: number;
  name: string;
  status: typeof PENDING | typeof PROCESSING | typeof COMPLETED | typeof FAILED;
  message?: string;
}

interface ProcessingStatus {
  scenePrompts: {
    completed: number;
    total: number;
    tasks?: TaskStatus[];
  };
  images: {
    completed: number;
    total: number;
    tasks?: TaskStatus[];
  };
  soraPrompts: {
    completed: number;
    total: number;
    tasks?: TaskStatus[];
  };
}

interface ProcessingModalProps {
  isOpen: boolean;
  onCancel: () => void;
  status: ProcessingStatus;
}

const ProcessingModal: React.FC<ProcessingModalProps> = ({
  isOpen,
  onCancel,
  status,
}) => {
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [expandedSection, setExpandedSection] = useState<string | undefined>(undefined);
  
  // Start timer when modal is opened
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isOpen) {
      timer = setInterval(() => {
        setTimeElapsed(prev => prev + 1);
      }, 1000);
    }
    
    return () => {
      if (timer) clearInterval(timer);
      setTimeElapsed(0);
    };
  }, [isOpen]);
  
  // Format time for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Calculate the overall progress as a percentage
  const getProgressPercentage = (completed: number, total: number) => {
    if (total === 0) return 0;
    return (completed / total) * 100;
  };
  
  // Calculate the overall process status
  const getOverallStatus = () => {
    const totalTasks = 
      status.scenePrompts.total + 
      status.images.total + 
      status.soraPrompts.total;
      
    const completedTasks = 
      status.scenePrompts.completed + 
      status.images.completed + 
      status.soraPrompts.completed;
      
    if (totalTasks === 0) return { percent: 0, text: "Initializing..." };
    
    const percent = Math.round((completedTasks / totalTasks) * 100);
    let text = `${percent}% complete`;
    
    if (percent === 100) {
      text = "All tasks completed!";
    } else if (totalTasks > 0 && completedTasks === 0) {
      text = "Starting...";
    }
    
    return { percent, text };
  };
  
  // Generate task list for detailed view
  const generateTaskList = (
    category: 'scenePrompts' | 'images' | 'soraPrompts', 
    label: string
  ) => {
    const tasks = status[category].tasks || [];
    const total = status[category].total;
    const completed = status[category].completed;
    
    // If no detailed tasks are provided, create placeholder based on counts
    const displayTasks = tasks.length > 0 ? tasks : 
      Array.from({ length: total }).map((_, i) => ({
        id: i + 1,
        name: `${label} ${i + 1}`,
        status: i < completed ? COMPLETED : PENDING
      }));
      
    return (
      <div className="mt-2 space-y-1">
        {displayTasks.map((task, index) => (
          <div 
            key={task.id} 
            className={cn(
              "px-3 py-2 rounded-md text-sm flex items-center justify-between",
              {
                "bg-secondary/30": task.status === PENDING,
                "bg-primary/10 animate-pulse": task.status === PROCESSING,
                "bg-green-500/10": task.status === COMPLETED,
                "bg-red-500/10": task.status === FAILED
              }
            )}
          >
            <div className="flex items-center gap-2">
              {task.status === PENDING && <div className="w-4 h-4 rounded-full bg-secondary" />}
              {task.status === PROCESSING && <LoaderCircle className="w-4 h-4 text-primary animate-spin" />}
              {task.status === COMPLETED && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              {task.status === FAILED && <AlertCircle className="w-4 h-4 text-red-500" />}
              <span>{task.name}</span>
            </div>
            
            {task.status === FAILED && (
              <Button 
                variant="ghost" 
                size="sm"
                className="h-6 px-2"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            )}
          </div>
        ))}
      </div>
    );
  };
  
  // Current overall status
  const overall = getOverallStatus();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogTitle className="text-center text-xl font-semibold">Generating Assets</DialogTitle>
        <DialogDescription className="text-center">
          <span className="block">This may take a few moments...</span>
          <span className="text-xs text-muted-foreground">Time elapsed: {formatTime(timeElapsed)}</span>
        </DialogDescription>
        
        <div className="text-center mb-4">
          <div className="w-16 h-16 mx-auto mb-2 border-4 border-t-primary border-r-primary border-b-primary border-l-secondary rounded-full animate-spin"></div>
          <div className="text-sm font-medium">{overall.text}</div>
        </div>
        
        <Accordion 
          type="single" 
          collapsible 
          value={expandedSection}
          onValueChange={setExpandedSection}
          className="w-full"
        >
          <AccordionItem value="scenes" className="border-b">
            <AccordionTrigger className="py-2">
              <div className="flex-1">
                <div className="flex justify-between mb-1 w-full">
                  <span className="text-sm font-medium">Scene Prompts</span>
                  <span className="text-sm">
                    {status.scenePrompts.completed}/{status.scenePrompts.total}
                  </span>
                </div>
                <Progress 
                  value={getProgressPercentage(
                    status.scenePrompts.completed, 
                    status.scenePrompts.total
                  )} 
                  className="h-2 w-full"
                />
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {generateTaskList('scenePrompts', 'Scene')}
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="images" className="border-b">
            <AccordionTrigger className="py-2">
              <div className="flex-1">
                <div className="flex justify-between mb-1 w-full">
                  <span className="text-sm font-medium">AI Images</span>
                  <span className="text-sm">
                    {status.images.completed}/{status.images.total}
                  </span>
                </div>
                <Progress 
                  value={getProgressPercentage(
                    status.images.completed, 
                    status.images.total
                  )} 
                  className="h-2 w-full"
                />
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {generateTaskList('images', 'Image')}
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="sora" className="border-0">
            <AccordionTrigger className="py-2">
              <div className="flex-1">
                <div className="flex justify-between mb-1 w-full">
                  <span className="text-sm font-medium">Sora Prompts</span>
                  <span className="text-sm">
                    {status.soraPrompts.completed}/{status.soraPrompts.total}
                  </span>
                </div>
                <Progress 
                  value={getProgressPercentage(
                    status.soraPrompts.completed, 
                    status.soraPrompts.total
                  )} 
                  className="h-2 w-full"
                />
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {generateTaskList('soraPrompts', 'Sora Prompt')}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setExpandedSection(expandedSection ? undefined : 'scenes')} 
            className="text-xs"
          >
            <ChevronDown className="h-3 w-3 mr-1" />
            {expandedSection ? 'Hide Details' : 'Show Details'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProcessingModal;
