export interface ProjectWorkflowStatus {
  isComplete: boolean;
  nextStep: 'scenes' | 'images' | 'audio' | 'completed';
  completionPercentage: number;
  hasScenes: boolean;
  hasImages: boolean;
  hasAudio: boolean;
  sceneCount: number;
  imageCount: number;
}

export function analyzeProjectWorkflowStatus(project: any, scenes?: any[]): ProjectWorkflowStatus {
  const sceneCount = scenes?.length || project.sceneCount || 0;
  const hasScenes = sceneCount > 0;
  
  // Count scenes with images
  const imageCount = scenes?.filter(scene => scene.imageUrl).length || 0;
  const hasImages = imageCount > 0;
  
  // Check if project has audio (either TTS audio or uploaded audio)
  const hasAudio = Boolean(
    project.audioTTSId || 
    project.audioFilePath || 
    project.audioDuration
  );
  
  // Determine completion status and next step
  let isComplete = false;
  let nextStep: 'scenes' | 'images' | 'audio' | 'completed' = 'scenes';
  let completionPercentage = 0;
  
  if (!hasScenes) {
    nextStep = 'scenes';
    completionPercentage = 0;
  } else if (!hasImages) {
    nextStep = 'images';
    completionPercentage = 25;
  } else if (!hasAudio) {
    nextStep = 'audio';
    completionPercentage = 75;
  } else {
    nextStep = 'completed';
    completionPercentage = 100;
    isComplete = true;
  }
  
  // Adjust completion percentage based on actual progress
  if (hasScenes && hasImages) {
    const imageProgress = sceneCount > 0 ? (imageCount / sceneCount) * 50 : 0;
    completionPercentage = 25 + imageProgress;
    
    if (hasAudio) {
      completionPercentage = 100;
    }
  }
  
  return {
    isComplete,
    nextStep,
    completionPercentage,
    hasScenes,
    hasImages,
    hasAudio,
    sceneCount,
    imageCount
  };
}

export function getNextStepDescription(nextStep: string): string {
  switch (nextStep) {
    case 'scenes':
      return 'Generate scene prompts';
    case 'images':
      return 'Generate images';
    case 'audio':
      return 'Add audio/TTS';
    case 'completed':
      return 'Project complete';
    default:
      return 'Continue project';
  }
}

export function getResumeActionUrl(projectId: number, nextStep: string): string {
  switch (nextStep) {
    case 'scenes':
    case 'images':
    case 'audio':
      return `/project/${projectId}`;
    case 'completed':
      return `/project/${projectId}/review`;
    default:
      return `/project/${projectId}`;
  }
}