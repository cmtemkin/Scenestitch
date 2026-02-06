import * as React from "react";
import { cn } from "@/lib/utils";

interface StepsProps {
  activeStep: number;
  children: React.ReactNode;
  className?: string;
}

export const Steps = React.forwardRef<
  HTMLDivElement,
  StepsProps
>(({ activeStep, children, className, ...props }, ref) => {
  const stepsArray = React.Children.toArray(children);

  return (
    <div
      ref={ref}
      className={cn("flex flex-col gap-4", className)}
      {...props}
    >
      <div
        className={cn(
          "relative flex w-full justify-between gap-2"
        )}
      >
        {stepsArray.map((step, index) => {
          return React.cloneElement(step as React.ReactElement, {
            isActive: activeStep === index,
            isCompleted: activeStep > index,
            isLastStep: stepsArray.length === index + 1,
            stepIndex: index,
          });
        })}
      </div>
    </div>
  );
});
Steps.displayName = "Steps";

interface UseStepsProps {
  index?: number;
  count?: number;
}

export const useSteps = (props: UseStepsProps) => {
  const { index = 0, count } = props;
  const [activeStep, setActiveStep] = React.useState(index);

  const nextStep = React.useCallback(() => {
    setActiveStep((prev) => {
      if (count != null && prev >= count - 1) return prev;
      return prev + 1;
    });
  }, [count]);

  const prevStep = React.useCallback(() => {
    setActiveStep((prev) => {
      if (prev <= 0) return prev;
      return prev - 1;
    });
  }, []);

  const reset = React.useCallback(() => {
    setActiveStep(0);
  }, []);

  return {
    activeStep,
    setActiveStep,
    nextStep,
    prevStep,
    reset,
  };
};

interface StepProps {
  isActive?: boolean;
  isCompleted?: boolean;
  isLastStep?: boolean;
  stepIndex?: number;
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
}

export const Step = React.forwardRef<
  HTMLDivElement,
  StepProps
>(
  (
    {
      isActive,
      isCompleted,
      isLastStep,
      stepIndex,
      children,
      className,
      onClick,
      onMouseEnter,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        data-active={isActive}
        data-completed={isCompleted}
        data-last-step={isLastStep}
        data-step-index={stepIndex}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        className={cn(
          "flex-1 relative flex flex-col gap-1 z-10",
          {
            "cursor-pointer": onClick || onMouseEnter,
          },
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Step.displayName = "Step";

interface StepIndicatorProps {
  isActive?: boolean;
  isCompleted?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export const StepIndicator = React.forwardRef<
  HTMLDivElement,
  StepIndicatorProps
>(({ isActive, isCompleted, children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-active={isActive}
      data-completed={isCompleted}
      className={cn(
        "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 bg-background",
        {
          "border-muted-foreground": !isActive && !isCompleted,
          "border-primary": isActive || isCompleted,
        },
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
StepIndicator.displayName = "StepIndicator";

interface StepSeparatorProps {
  isActive?: boolean;
  isCompleted?: boolean;
  isLastStep?: boolean;
  className?: string;
}

export const StepSeparator = React.forwardRef<
  HTMLDivElement,
  StepSeparatorProps
>(({ isActive, isCompleted, isLastStep, className, ...props }, ref) => {
  if (isLastStep) return null;

  return (
    <div
      ref={ref}
      data-active={isActive}
      data-completed={isCompleted}
      className={cn(
        "absolute left-8 right-8 top-4 -z-10 h-[2px]",
        {
          "bg-muted-foreground": !isActive && !isCompleted,
          "bg-primary": isActive || isCompleted,
        },
        className
      )}
      {...props}
    />
  );
});
StepSeparator.displayName = "StepSeparator";

interface StepStatusProps {
  complete: React.ReactNode;
  incomplete: React.ReactNode;
  active: React.ReactNode;
  isActive?: boolean;
  isCompleted?: boolean;
}

export const StepStatus = React.forwardRef<
  HTMLDivElement,
  StepStatusProps
>(({ complete, incomplete, active, isActive, isCompleted, ...props }, ref) => {
  if (isCompleted) {
    return <div ref={ref} {...props}>{complete}</div>;
  }
  
  if (isActive) {
    return <div ref={ref} {...props}>{active}</div>;
  }
  
  return <div ref={ref} {...props}>{incomplete}</div>;
});
StepStatus.displayName = "StepStatus";

interface StepTitleProps {
  children?: React.ReactNode;
  className?: string;
}

export const StepTitle = React.forwardRef<
  HTMLParagraphElement,
  StepTitleProps
>(({ children, className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      className={cn("font-medium", className)}
      {...props}
    >
      {children}
    </p>
  );
});
StepTitle.displayName = "StepTitle";

interface StepDescriptionProps {
  children?: React.ReactNode;
  className?: string;
}

export const StepDescription = React.forwardRef<
  HTMLParagraphElement,
  StepDescriptionProps
>(({ children, className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    >
      {children}
    </p>
  );
});
StepDescription.displayName = "StepDescription";