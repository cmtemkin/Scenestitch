import React, { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Maximize2, Info, ChevronLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import ImageViewerModal from '@/components/ImageViewerModal';

interface ProjectImage {
  id: number;
  sceneNumber: number;
  title: string;
  imageUrl: string;
  overlayText: string;
}

interface ProjectDetail {
  id: number;
  title: string;
  createdAt: string;
}

interface ProjectAlbumData {
  project: ProjectDetail;
  images: ProjectImage[];
}

const ProjectAlbum: React.FC = () => {
  const [, params] = useRoute<{ id: string }>('/library/:id');
  const projectId = params?.id ? parseInt(params.id) : 0;
  
  const [selectedImage, setSelectedImage] = useState<ProjectImage | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [loadedImages, setLoadedImages] = useState<{[key: number]: boolean}>({});
  
  // Use the optimizeLoading parameter for large albums
  const { data, isLoading, error } = useQuery<ProjectAlbumData>({
    queryKey: [`/api/library/${projectId}`],
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!projectId,
  });

  const handleImageClick = (image: ProjectImage) => {
    setSelectedImage(image);
    setIsViewerOpen(true);
  };
  
  // Set up Intersection Observer for lazy loading
  const imageObserver = useCallback(() => {
    return new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const imgElement = entry.target.querySelector('img');
          const imageId = entry.target.getAttribute('data-image-id');
          
          if (imgElement && imageId) {
            // Mark this image as loaded/loading
            setLoadedImages(prev => ({
              ...prev,
              [imageId]: true
            }));
            
            // Stop observing once handled
            observer.unobserve(entry.target);
          }
        }
      });
    }, { 
      rootMargin: '200px', // Start loading when within 200px of viewport
      threshold: 0.1 
    });
  }, []);
  
  // Ensure iOS Safari scrolling works properly and set up image observers
  useEffect(() => {
    // Add overflow-y-auto to body for iOS Safari scrolling
    document.body.classList.add('overflow-y-auto');
    document.documentElement.classList.add('overflow-y-auto');
    
    // Set up lazy loading for images
    const observer = imageObserver();
    
    // Need to wait for data to be available and component to render
    if (data && data.images) {
      const imageContainers = document.querySelectorAll('.image-container');
      
      imageContainers.forEach(container => {
        observer.observe(container);
      });
    }
    
    return () => {
      document.body.classList.remove('overflow-y-auto');
      document.documentElement.classList.remove('overflow-y-auto');
      observer.disconnect();
    };
  }, [data, imageObserver]);

  return (
    <div className="min-h-[calc(100vh-80px)] md:min-h-0">
      <div className="container max-w-screen-2xl mx-auto px-4 py-6 pb-32 md:pb-6">
        {/* Desktop header */}
        <div className="hidden md:flex items-center mb-2">
          <Button asChild variant="ghost" size="sm" className="mr-4">
            <Link href="/library">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Library
            </Link>
          </Button>
          
          {data && (
            <div>
              <h1 className="text-2xl font-bold">{data.project.title}</h1>
              <p className="text-sm text-muted-foreground">
                Created {formatDistanceToNow(new Date(data.project.createdAt), { addSuffix: true })} (EST)
              </p>
            </div>
          )}
        </div>
        
        {/* Mobile iOS-style header */}
        <div className="md:hidden flex flex-col mb-4">
          <div className="flex items-center mb-2">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8 mr-2">
              <Link href="/library">
                <ChevronLeft className="h-5 w-5" />
              </Link>
            </Button>
            
            {data && (
              <div className="flex-1 text-center">
                <h1 className="text-xl font-bold">{data.project.title}</h1>
              </div>
            )}
            
            <div className="w-8 h-8">
              {/* Placeholder for symmetry */}
            </div>
          </div>
        </div>
        
        {/* Divider */}
        <div className="h-px bg-border my-4"></div>
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 border-4 border-t-primary border-r-primary border-b-primary border-l-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-muted-foreground">Loading images...</p>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-6 text-center">
            <p className="text-destructive font-medium">Failed to load album</p>
            <p className="text-sm text-muted-foreground mt-2">Please try again later</p>
          </div>
        ) : data && data.images.length > 0 ? (
          <>
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-muted-foreground">{data.images.length} images</p>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
              {data.images.map((image, index) => (
                <div 
                  key={image.id} 
                  className="aspect-square rounded-md overflow-hidden group relative cursor-pointer border border-border/50 hover:border-primary transition-colors image-container"
                  data-image-id={image.id}
                  onClick={() => handleImageClick(image)}
                >
                  {/* Only load images that are in view or first 8 */}
                  {(loadedImages[image.id] || index < 8) ? (
                    <img 
                      src={image.imageUrl} 
                      alt={image.title} 
                      className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
                      loading={index < 4 ? "eager" : "lazy"}
                      fetchPriority={index < 4 ? "high" : "auto"}
                      onLoad={() => {
                        // Mark this image as loaded
                        setLoadedImages(prev => ({...prev, [image.id]: true}));
                      }}
                    />
                  ) : (
                    // Placeholder while image is loading
                    <div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">
                      <div className="w-8 h-8 border-4 border-t-primary border-r-primary border-b-primary border-l-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                  
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 md:group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                    <div className="bg-black/40 backdrop-blur-sm rounded p-1.5 text-white text-xs">
                      <p className="font-medium text-sm truncate">{image.title}</p>
                      <p className="text-white/80 mt-0.5">Scene {image.sceneNumber}</p>
                    </div>
                    <div className="absolute top-2 right-2">
                      <div className="p-1.5 rounded-full bg-black/40 backdrop-blur-sm text-white">
                        <Maximize2 size={14} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Image Viewer Modal */}
            {selectedImage && data && (
              <ImageViewerModal
                isOpen={isViewerOpen}
                onClose={() => setIsViewerOpen(false)}
                imageUrl={selectedImage.imageUrl}
                title={selectedImage.title}
                hasNext={data.images.findIndex(img => img.id === selectedImage.id) < data.images.length - 1}
                hasPrevious={data.images.findIndex(img => img.id === selectedImage.id) > 0}
                onNext={() => {
                  const currentIndex = data.images.findIndex(img => img.id === selectedImage.id);
                  if (currentIndex < data.images.length - 1) {
                    setSelectedImage(data.images[currentIndex + 1]);
                  }
                }}
                onPrevious={() => {
                  const currentIndex = data.images.findIndex(img => img.id === selectedImage.id);
                  if (currentIndex > 0) {
                    setSelectedImage(data.images[currentIndex - 1]);
                  }
                }}
              />
            )}
          </>
        ) : (
          <div className="bg-muted rounded-lg p-8 md:p-12 text-center">
            <Info className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No images found</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              This project doesn't have any generated images
            </p>
            <Button asChild>
              <Link href={`/project/${projectId}`}>
                Go to Project
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectAlbum;