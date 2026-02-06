import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';

interface ImageViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title: string;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
}

const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  title,
  onNext,
  onPrevious,
  hasNext = false,
  hasPrevious = false
}) => {
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  
  // Reset image loaded state when the image URL changes
  useEffect(() => {
    setIsImageLoaded(false);
  }, [imageUrl]);
  
  const handleDownload = () => {
    // Create a temporary anchor element
    const anchor = document.createElement('a');
    anchor.href = imageUrl;
    
    // Name the file with the title
    const filename = title 
      ? `${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`
      : 'image.png';
    
    anchor.download = filename;
    anchor.click();
  };
  
  // Listen for Escape key to close the modal
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;
  
  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center" 
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-[95vw] max-h-[95vh] bg-black/90 rounded-lg flex flex-col shadow-xl overflow-hidden">
        {/* Custom Header - only one X button */}
        <div className="flex items-center justify-between p-4 text-white">
          <h2 className="text-lg font-medium truncate pr-4">{title}</h2>
          <Button 
            variant="ghost" 
            size="icon"
            className="h-8 w-8 text-white hover:bg-white/20"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        
        {/* Image Container */}
        <div className="flex-1 relative flex items-center justify-center p-2 overflow-hidden">
          {/* Loading indicator */}
          {!isImageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 border-4 border-t-primary border-r-primary border-b-primary border-l-transparent rounded-full animate-spin"></div>
            </div>
          )}
          
          {/* Main image */}
          <img 
            src={imageUrl} 
            alt={title}
            className={`max-h-[calc(95vh-128px)] max-w-[95vw] object-contain transition-opacity duration-300 ${isImageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setIsImageLoaded(true)}
          />
          
          {/* Navigation buttons */}
          {hasPrevious && onPrevious && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute left-4 h-10 w-10 rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70"
              onClick={onPrevious}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          )}
          
          {hasNext && onNext && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute right-4 h-10 w-10 rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70"
              onClick={onNext}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          )}
        </div>
        
        {/* iOS-style toolbar */}
        <div className="p-4 flex justify-center gap-10 bg-black/50 backdrop-blur-sm">
          <Button 
            variant="ghost" 
            size="sm"
            className="text-white hover:bg-white/20 flex flex-col items-center gap-1 p-2"
            onClick={handleDownload}
          >
            <Download className="h-5 w-5" />
            <span className="text-xs">Download</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ImageViewerModal;