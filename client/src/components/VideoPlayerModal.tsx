import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download, Play, Pause, Volume2, VolumeX, Maximize, RotateCcw } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

interface VideoPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string;
  title: string;
  sceneNumber?: number;
}

const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  isOpen,
  onClose,
  videoUrl,
  title,
  sceneNumber
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (isOpen && videoRef.current) {
      setIsLoading(true);
      setHasError(false);
      videoRef.current.load();
    }
  }, [isOpen, videoUrl]);

  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
      if (e.key === ' ' && isOpen) {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [isOpen, onClose]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const progressPercent = (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setProgress(progressPercent);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setIsLoading(false);
    }
  };

  const handleSeek = (value: number[]) => {
    if (videoRef.current) {
      const seekTime = (value[0] / 100) * videoRef.current.duration;
      videoRef.current.currentTime = seekTime;
      setProgress(value[0]);
    }
  };

  const handleRestart = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const handleDownload = () => {
    const anchor = document.createElement('a');
    anchor.href = videoUrl;
    const filename = `scene-${sceneNumber || 'video'}-${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.mp4`;
    anchor.download = filename;
    anchor.click();
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleError = () => {
    setHasError(true);
    setIsLoading(false);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setProgress(100);
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="video-player-modal"
    >
      <div className="relative w-[95vw] max-w-4xl max-h-[90vh] bg-black rounded-xl flex flex-col shadow-2xl overflow-hidden border border-white/10">
        <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-10">
          <div className="flex items-center gap-3">
            {sceneNumber && (
              <span className="bg-primary text-primary-foreground text-sm font-medium rounded-full w-7 h-7 flex items-center justify-center">
                {sceneNumber}
              </span>
            )}
            <h2 className="text-lg font-medium text-white truncate pr-4">{title}</h2>
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
            onClick={onClose}
            data-testid="close-video-modal"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 relative flex items-center justify-center bg-black min-h-[300px]">
          {isLoading && !hasError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 border-4 border-t-primary border-r-primary/50 border-b-primary/25 border-l-transparent rounded-full animate-spin"></div>
                <span className="text-white/70 text-sm">Loading video...</span>
              </div>
            </div>
          )}

          {hasError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
              <div className="flex flex-col items-center gap-3 text-center px-4">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                  <X className="w-8 h-8 text-red-400" />
                </div>
                <span className="text-white/70 text-sm">Failed to load video</span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setHasError(false);
                    setIsLoading(true);
                    videoRef.current?.load();
                  }}
                  className="text-white border-white/30 hover:bg-white/10"
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}

          <video
            ref={videoRef}
            src={videoUrl}
            className="max-h-[calc(90vh-160px)] max-w-full object-contain"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            onError={handleError}
            onCanPlay={() => setIsLoading(false)}
            onClick={togglePlay}
            playsInline
            data-testid="video-element"
          />

          {!isPlaying && !isLoading && !hasError && (
            <button
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors cursor-pointer"
              data-testid="play-overlay"
            >
              <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors">
                <Play className="w-10 h-10 text-white ml-1" fill="white" />
              </div>
            </button>
          )}
        </div>

        <div className="p-4 bg-gradient-to-t from-black via-black/90 to-transparent">
          <div className="mb-3">
            <Slider
              value={[progress]}
              max={100}
              step={0.1}
              onValueChange={handleSeek}
              className="cursor-pointer"
              data-testid="video-progress"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-white hover:bg-white/20 rounded-full"
                onClick={togglePlay}
                data-testid="play-pause-button"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" fill="white" />
                ) : (
                  <Play className="h-5 w-5 ml-0.5" fill="white" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-white hover:bg-white/20 rounded-full"
                onClick={handleRestart}
                data-testid="restart-button"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-white hover:bg-white/20 rounded-full"
                onClick={toggleMute}
                data-testid="mute-button"
              >
                {isMuted ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </Button>

              <span className="text-white/70 text-sm font-mono ml-2">
                {formatTime((progress / 100) * duration)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-white hover:bg-white/20 rounded-full"
                onClick={handleDownload}
                data-testid="download-video-button"
              >
                <Download className="h-5 w-5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-white hover:bg-white/20 rounded-full"
                onClick={handleFullscreen}
                data-testid="fullscreen-button"
              >
                <Maximize className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayerModal;
