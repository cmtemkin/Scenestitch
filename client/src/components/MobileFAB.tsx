import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Plus,
  X,
  Image as ImageIcon,
  Film,
  Download,
  Sparkles,
  FileText,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileFABAction {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
  variant?: "default" | "primary" | "destructive";
  disabled?: boolean;
}

interface MobileFABProps {
  actions: MobileFABAction[];
  className?: string;
}

export function MobileFAB({ actions, className }: MobileFABProps) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);

  if (!isMobile) {
    return null;
  }

  return (
    <div 
      className={cn(
        "fixed right-4 z-40",
        "bottom-[calc(80px+env(safe-area-inset-bottom,0px))]",
        className
      )}
    >
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            size="lg"
            className={cn(
              "h-14 w-14 rounded-full shadow-lg",
              "bg-primary hover:bg-primary/90",
              "transition-transform duration-200",
              isOpen && "rotate-45"
            )}
            data-testid="fab-trigger"
          >
            {isOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Plus className="h-6 w-6" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="w-auto p-2 mb-2 bg-card/95 backdrop-blur-sm border border-border rounded-xl"
          sideOffset={8}
        >
          <div className="flex flex-col gap-1">
            {actions.map((action, index) => (
              <Button
                key={index}
                variant="ghost"
                className={cn(
                  "justify-start gap-3 h-12 px-4 min-w-[180px]",
                  "text-sm font-medium",
                  action.variant === "primary" && "text-primary",
                  action.variant === "destructive" && "text-destructive"
                )}
                onClick={() => {
                  action.onClick();
                  setIsOpen(false);
                }}
                disabled={action.disabled}
                data-testid={`fab-action-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <action.icon className="h-5 w-5" />
                {action.label}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ProjectMobileFAB({
  onGenerateImages,
  onGenerateSoraVideos,
  onExport,
  onGeneratePrompts,
  onExtractCharacters,
  hasScenes,
  hasImages,
  hasSoraPrompts,
}: {
  onGenerateImages?: () => void;
  onGenerateSoraVideos?: () => void;
  onExport?: () => void;
  onGeneratePrompts?: () => void;
  onExtractCharacters?: () => void;
  hasScenes?: boolean;
  hasImages?: boolean;
  hasSoraPrompts?: boolean;
}) {
  const actions: MobileFABAction[] = [];

  if (onGeneratePrompts && hasScenes) {
    actions.push({
      icon: Sparkles,
      label: "Generate Prompts",
      onClick: onGeneratePrompts,
      variant: "primary",
    });
  }

  if (onExtractCharacters && hasScenes) {
    actions.push({
      icon: Users,
      label: "Extract Characters",
      onClick: onExtractCharacters,
    });
  }

  if (onGenerateImages && hasScenes) {
    actions.push({
      icon: ImageIcon,
      label: "Generate Images",
      onClick: onGenerateImages,
      variant: "primary",
    });
  }

  if (onGenerateSoraVideos && hasSoraPrompts && hasImages) {
    actions.push({
      icon: Film,
      label: "Generate Sora Videos",
      onClick: onGenerateSoraVideos,
      variant: "primary",
    });
  }

  if (onExport && hasScenes) {
    actions.push({
      icon: Download,
      label: "Export Project",
      onClick: onExport,
    });
  }

  if (actions.length === 0) {
    return null;
  }

  return <MobileFAB actions={actions} />;
}
