import React from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface ContinuityToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  isDisabled?: boolean;
}

const ContinuityToggle: React.FC<ContinuityToggleProps> = ({ 
  value, 
  onChange, 
  isDisabled = false 
}) => {
  return (
    <div className="mb-6 flex items-center justify-between">
      <Label 
        htmlFor="continuity" 
        className="text-foreground font-medium"
      >
        Maintain Visual Continuity
      </Label>
      <Switch
        id="continuity"
        checked={value}
        onCheckedChange={onChange}
        disabled={isDisabled}
      />
    </div>
  );
};

export default ContinuityToggle;
