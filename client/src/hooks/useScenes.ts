import { useQuery } from "@tanstack/react-query";
import { Scene } from "@shared/schema";

interface ScenesResponse {
  scenes: Scene[];
}

export function useScenes(scriptId: number | null) {
  const queryResult = useQuery<ScenesResponse, Error>({
    queryKey: scriptId ? [`/api/scenes/${scriptId}`] : ['scenes'],
    enabled: !!scriptId,
    refetchOnWindowFocus: false,
  });

  return {
    ...queryResult,
    scenes: queryResult.data?.scenes || [],
  };
}