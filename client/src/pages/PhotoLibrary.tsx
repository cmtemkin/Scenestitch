import React, { useEffect, useState, useCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Image, ChevronRight, Loader2 } from 'lucide-react';

interface ProjectAlbum {
  projectId: number;
  projectTitle: string;
  createdAt: string;
  imageCount: number;
  previewImage: string | null;
}

interface LibraryResponse {
  projects: ProjectAlbum[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalProjects: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    limit: number;
  };
}

const PhotoLibrary: React.FC = () => {
  const [location] = useLocation();
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error
  } = useInfiniteQuery({
    queryKey: ['/api/library'],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await fetch(`/api/library?page=${pageParam}&limit=12`);
      if (!response.ok) {
        throw new Error('Failed to fetch library data');
      }
      const result: LibraryResponse = await response.json();
      return result;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage: LibraryResponse) => {
      return lastPage.pagination.hasNextPage ? lastPage.pagination.currentPage + 1 : undefined;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Flatten all pages into a single array
  const albums = data?.pages.flatMap((page: LibraryResponse) => page.projects) || [];
  
  // Track which images have been loaded
  const [loadedImages, setLoadedImages] = useState<{[key: number]: boolean}>({});
  
  // Set up Intersection Observer to lazy load images when they come into view
  const imageObserver = useCallback(() => {
    return new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        // When image container is in view
        if (entry.isIntersecting) {
          const imgElement = entry.target.querySelector('img');
          const projectId = entry.target.getAttribute('data-project-id');
          
          if (imgElement && projectId) {
            // Update loading status
            setLoadedImages(prev => ({
              ...prev,
              [projectId]: true
            }));
            
            // Stop observing once loaded
            observer.unobserve(entry.target);
          }
        }
      });
    }, { 
      rootMargin: '200px', // Start loading when within 200px of viewport
      threshold: 0.1 
    });
  }, []);
  
  // Ensure iOS Safari scrolling works properly
  useEffect(() => {
    // Add overflow-y-auto to body for iOS Safari scrolling
    document.body.classList.add('overflow-y-auto');
    document.documentElement.classList.add('overflow-y-auto');
    
    // Set up intersection observer for lazy loading
    const observer = imageObserver();
    const imageContainers = document.querySelectorAll('.album-image-container');
    
    imageContainers.forEach(container => {
      observer.observe(container);
    });
    
    return () => {
      document.body.classList.remove('overflow-y-auto');
      document.documentElement.classList.remove('overflow-y-auto');
      observer.disconnect();
    };
  }, [albums, imageObserver]); // Re-initialize observer when albums data changes

  return (
    <div className="min-h-[calc(100vh-80px)] md:min-h-0">
      <div className="container max-w-screen-2xl mx-auto px-4 py-6 pb-32 md:pb-6">
        {/* Desktop header */}
        <div className="hidden md:flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Photo Library</h1>
        </div>
        
        {/* Mobile iOS-style header - only show when not using tab bar navigation */}
        <div className="md:hidden mb-4">
          <h1 className="text-2xl font-bold text-center">Photo Library</h1>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 border-4 border-t-primary border-r-primary border-b-primary border-l-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-muted-foreground">Loading photo albums...</p>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-6 text-center">
            <p className="text-destructive font-medium">Failed to load photo library</p>
            <p className="text-sm text-muted-foreground mt-2">Please try again later</p>
          </div>
        ) : albums && albums.length > 0 ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">
              {albums.map((album: ProjectAlbum) => (
                <Link key={album.projectId} href={`/library/${album.projectId}`}>
                  <div className="rounded-lg md:rounded-xl overflow-hidden group hover:shadow-lg transition-all duration-300 h-full flex flex-col border border-border/50">
                    <div 
                      className="aspect-square w-full relative bg-muted overflow-hidden album-image-container" 
                      data-project-id={album.projectId}
                    >
                      {album.previewImage ? (
                        <>
                          {/* Load first image eagerly, others lazily */}
                          <img 
                            src={album.previewImage} 
                            alt={album.projectTitle} 
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading={album.projectId === albums[0]?.projectId ? "eager" : "lazy"}
                          />
                          
                          {/* Display skeleton while image loads */}
                          {!loadedImages[album.projectId] && (
                            <div className="absolute inset-0 bg-muted animate-pulse"></div>
                          )}
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                          <Image className="h-16 w-16 text-muted-foreground opacity-30" />
                        </div>
                      )}
                    </div>
                    <div className="p-3 md:p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="font-medium truncate">{album.projectTitle}</h3>
                        <p className="text-muted-foreground text-sm mt-1">
                          {album.imageCount} {album.imageCount === 1 ? 'image' : 'images'}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 md:mt-4 hidden md:block">
                        Created {formatDistanceToNow(new Date(album.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            
            {/* Load More Button */}
            {hasNextPage && (
              <div className="flex justify-center mt-8">
                <Button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  variant="outline"
                  size="lg"
                  className="min-w-[140px]"
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      Load More
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            )}
            
            {/* Show total count */}
            {data?.pages[0]?.pagination && (
              <div className="text-center mt-6 text-sm text-muted-foreground">
                Showing {albums.length} of {data.pages[0].pagination.totalProjects} projects
              </div>
            )}
          </>
        ) : (
          <div className="bg-muted rounded-lg p-8 md:p-12 text-center">
            <Image className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No images found</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Generate images in your projects to see them in your photo library
            </p>
            <Button asChild>
              <Link href="/projects">
                Go to Projects
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PhotoLibrary;