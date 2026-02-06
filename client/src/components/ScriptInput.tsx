import React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface ScriptInputProps {
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
}

const ScriptInput: React.FC<ScriptInputProps> = ({ 
  value, 
  onChange, 
  isDisabled = false 
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="mb-6">
      <Label htmlFor="script" className="block text-foreground font-medium mb-2">
        Video Script
      </Label>
      <Textarea
        id="script"
        className="w-full h-40 resize-y"
        placeholder="Paste your full video script here..."
        value={value}
        onChange={handleChange}
        disabled={isDisabled}
      />
    </div>
  );
};

export default ScriptInput;
