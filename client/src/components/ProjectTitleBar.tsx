import React from 'react';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';

interface ProjectTitleBarProps {
  title: string;
  onEditClick: () => void;
  isLoading?: boolean;
}

const ProjectTitleBar: React.FC<ProjectTitleBarProps> = ({ title, onEditClick, isLoading = false }) => {
  return (
    <div className="bg-blue-600 text-white py-3 px-4 flex items-center justify-between w-full z-50 shadow-sm sticky top-0">
      <div className="flex items-center">
        {isLoading ? (
          <div className="h-6 w-48 bg-blue-500/50 rounded animate-pulse"></div>
        ) : (
          <h1 className="text-base sm:text-lg font-medium truncate max-w-[240px] sm:max-w-[400px]">
            {title || "Untitled Project"}
          </h1>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-white hover:bg-blue-700/50 h-8 flex items-center"
        onClick={onEditClick}
        disabled={isLoading}
      >
        <Pencil className="h-4 w-4 mr-1" />
        <span className="hidden sm:inline">Edit</span>
      </Button>
    </div>
  );
};

export default ProjectTitleBar;