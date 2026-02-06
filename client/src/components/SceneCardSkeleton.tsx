import React from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function SceneCardSkeleton() {
  return (
    <Card className="bg-card border hover:border-neutral-muted transition-colors shadow-lg overflow-hidden h-full flex flex-col">
      <CardHeader className="p-3 sm:p-4 border-b space-y-0">
        <div className="flex flex-col space-y-2">
          <div className="flex flex-wrap justify-between items-start sm:items-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-5 w-36" />
            </div>
          </div>
        </div>
      </CardHeader>
      
      <div className="w-full h-36 sm:h-48 overflow-hidden border-b border-border">
        <Skeleton className="w-full h-full" />
      </div>
      
      <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3 flex-1 overflow-y-auto">
        <div>
          <Skeleton className="h-3 w-32 mb-2" />
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        
        <div className="mt-2 sm:mt-3">
          <Skeleton className="h-3 w-32 mb-2" />
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </CardContent>
    </Card>
  );
}

export default SceneCardSkeleton;