import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sparkles, Video, Wand2, RefreshCw, Save } from "lucide-react";

type ProviderStatus = "configured" | "missing_api_key" | "planned";

type ProviderResponse = {
  providers: Array<{
    id: string;
    label: string;
    kind: "image" | "tts" | "image_to_video";
    status: ProviderStatus;
    capabilities: Array<{ key: string; description: string }>;
    requiredEnvVars: string[];
  }>;
  defaultConfig: {
    image: string;
    tts: string;
    imageToVideo: string;
    enableFallbacks: boolean;
  };
};

type WorkflowResponse = {
  id: string;
  scriptId: number;
  status: "pending" | "processing" | "completed" | "failed";
  currentStep: number;
  steps: Array<{ id: string; name: string; status: string }>;
  error?: string;
};

type Scene = {
  id: number;
  sceneNumber: number;
  title: string | null;
  scriptExcerpt: string;
  dallePrompt: string;
  overlayText: string | null;
  imageUrl: string | null;
  soraPrompt: string | null;
};

type SceneResponse = {
  scenes: Scene[];
};

type ProjectAssetsResponse = {
  projectId: number;
  count: number;
  assets: Array<{
    id: string;
    kind: "image" | "audio" | "video" | "caption";
    url: string;
    sceneNumber?: number;
    metadata?: Record<string, unknown>;
  }>;
};

type HookResponse = { hooks: string[] };
type ComedyTimingResponse = {
  timing: Array<{
    sceneNumber: number;
    wordCount: number;
    suggestedDurationSec: number;
    punchlinePauseMs: number;
    emphasisWords: string[];
    pacing: string;
  }>;
};
type ShortsResponse = {
  clips: Array<{
    clipNumber: number;
    sceneRange: [number, number];
    targetDurationSec: number;
    hook: string;
    captionSeed: string;
    sourceSceneIds: number[];
  }>;
};

const statusVariant: Record<ProviderStatus, "default" | "secondary" | "outline"> = {
  configured: "default",
  missing_api_key: "secondary",
  planned: "outline",
};

const RebuildStudio = () => {
  const [title, setTitle] = useState("New Explainer");
  const [content, setContent] = useState(
    "Explain how a startup can validate product-market fit in 3 clear steps."
  );
  const [style, setStyle] = useState("cinematic");
  const [projectType, setProjectType] = useState("video");
  const [selectedImageProvider, setSelectedImageProvider] = useState("openai");
  const [selectedTtsProvider, setSelectedTtsProvider] = useState("openai");
  const [selectedImageToVideoProvider, setSelectedImageToVideoProvider] = useState("sora-2");
  const [workflowId, setWorkflowId] = useState("");
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [manualProjectId, setManualProjectId] = useState("");
  const [renderProjectId, setRenderProjectId] = useState("");
  const [renderFormat, setRenderFormat] = useState("landscape-16-9");
  const [renderContentType, setRenderContentType] = useState("explainer");
  const [sceneDrafts, setSceneDrafts] = useState<
    Record<number, { scriptExcerpt: string; dallePrompt: string; overlayText: string }>
  >({});

  const providersQuery = useQuery<ProviderResponse>({
    queryKey: ["/api/providers"],
  });

  const workflowStatusQuery = useQuery<WorkflowResponse>({
    queryKey: ["/api/workflows", workflowId],
    queryFn: () => apiRequest<WorkflowResponse>(`/api/workflows/${workflowId}`),
    enabled: Boolean(workflowId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 2500;
    },
  });

  const resolvedProjectId = activeProjectId ?? (manualProjectId ? Number(manualProjectId) : null);

  const scenesQuery = useQuery<SceneResponse>({
    queryKey: ["/api/scenes", resolvedProjectId],
    queryFn: () => apiRequest<SceneResponse>(`/api/scenes/${resolvedProjectId}`),
    enabled: Boolean(resolvedProjectId),
    refetchInterval: 4000,
  });

  const rendersQuery = useQuery({
    queryKey: ["/api/renders", resolvedProjectId],
    queryFn: () => apiRequest<Array<{ id: string; status: string; progress: number; outputUrl?: string }>>(
      `/api/renders?projectId=${resolvedProjectId}`
    ),
    enabled: Boolean(resolvedProjectId),
    refetchInterval: 4000,
  });

  const assetsQuery = useQuery<ProjectAssetsResponse>({
    queryKey: ["/api/assets", resolvedProjectId],
    queryFn: () => apiRequest<ProjectAssetsResponse>(`/api/assets?projectId=${resolvedProjectId}`),
    enabled: Boolean(resolvedProjectId),
    refetchInterval: 7000,
  });

  const createWorkflowMutation = useMutation({
    mutationFn: async () =>
      apiRequest<{ workflowId: string; scriptId?: number; message: string }>("/api/workflows/create-project", {
        method: "POST",
        body: JSON.stringify({
          title,
          content,
          style,
          projectType,
          maintainContinuity: true,
          voice: "alloy",
          audioModel: "gpt-4o-mini-tts",
          providers: {
            image: selectedImageProvider,
            tts: selectedTtsProvider,
            imageToVideo: selectedImageToVideoProvider,
            enableFallbacks: true,
          },
        }),
      }),
    onSuccess: (result) => {
      setWorkflowId(result.workflowId);
      if (result.scriptId) {
        setActiveProjectId(result.scriptId);
        setRenderProjectId(String(result.scriptId));
        setManualProjectId(String(result.scriptId));
      }
    },
  });

  const createRenderMutation = useMutation({
    mutationFn: async () =>
      apiRequest<{ render: { id: string }; message: string }>("/api/renders", {
        method: "POST",
        body: JSON.stringify({
          projectId: Number(renderProjectId || resolvedProjectId),
          format: renderFormat,
          contentType: renderContentType,
          includeCaptions: true,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/renders", resolvedProjectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets", resolvedProjectId] });
    },
  });

  const updateSceneMutation = useMutation({
    mutationFn: async ({ sceneId, payload }: { sceneId: number; payload: Record<string, unknown> }) =>
      apiRequest(`/api/scenes/${sceneId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenes", resolvedProjectId] });
    },
  });

  const regeneratePromptMutation = useMutation({
    mutationFn: async (sceneId: number) =>
      apiRequest(`/api/regenerate-scene/${sceneId}`, {
        method: "POST",
        body: JSON.stringify({ style, maintainContinuity: true }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenes", resolvedProjectId] });
    },
  });

  const regenerateImageMutation = useMutation({
    mutationFn: async (sceneId: number) =>
      apiRequest(`/api/generate-image/${sceneId}`, {
        method: "POST",
        body: JSON.stringify({ style }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenes", resolvedProjectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets", resolvedProjectId] });
    },
  });

  const hookMutation = useMutation({
    mutationFn: async () =>
      apiRequest<HookResponse>("/api/intelligence/hooks", {
        method: "POST",
        body: JSON.stringify({
          script: content,
          style: projectType === "sora" ? "tiktok" : "explainer",
          count: 3,
        }),
      }),
  });

  const comedyTimingMutation = useMutation({
    mutationFn: async () =>
      apiRequest<ComedyTimingResponse>("/api/intelligence/comedy-timing", {
        method: "POST",
        body: JSON.stringify({
          scenes: (scenesQuery.data?.scenes ?? []).map((scene) => ({
            sceneNumber: scene.sceneNumber,
            text: scene.scriptExcerpt,
            estimatedDurationSec: 8,
          })),
        }),
      }),
  });

  const repurposeMutation = useMutation({
    mutationFn: async () =>
      apiRequest<ShortsResponse>("/api/intelligence/repurpose-shorts", {
        method: "POST",
        body: JSON.stringify({
          projectId: resolvedProjectId,
          maxClips: 3,
          targetDurationSec: 30,
        }),
      }),
  });

  const providerSummary = useMemo(() => {
    const providers = providersQuery.data?.providers ?? [];
    return {
      configured: providers.filter((p) => p.status === "configured").length,
      missing: providers.filter((p) => p.status === "missing_api_key").length,
      planned: providers.filter((p) => p.status === "planned").length,
    };
  }, [providersQuery.data]);

  const onCreateProject = (event: FormEvent) => {
    event.preventDefault();
    createWorkflowMutation.mutate();
  };

  const onCreateRender = (event: FormEvent) => {
    event.preventDefault();
    createRenderMutation.mutate();
  };

  useEffect(() => {
    const workflowScriptId = workflowStatusQuery.data?.scriptId;
    if (workflowScriptId && !activeProjectId) {
      setActiveProjectId(workflowScriptId);
      setRenderProjectId(String(workflowScriptId));
    }
  }, [workflowStatusQuery.data?.scriptId, activeProjectId]);

  useEffect(() => {
    const scenes = scenesQuery.data?.scenes ?? [];
    if (!scenes.length) {
      return;
    }
    setSceneDrafts((previous) => {
      const next = { ...previous };
      for (const scene of scenes) {
        if (!next[scene.id]) {
          next[scene.id] = {
            scriptExcerpt: scene.scriptExcerpt || "",
            dallePrompt: scene.dallePrompt || "",
            overlayText: scene.overlayText || "",
          };
        }
      }
      return next;
    });
  }, [scenesQuery.data?.scenes]);

  const saveScene = (sceneId: number) => {
    const draft = sceneDrafts[sceneId];
    if (!draft) return;
    updateSceneMutation.mutate({
      sceneId,
      payload: {
        scriptExcerpt: draft.scriptExcerpt,
        dallePrompt: draft.dallePrompt,
        overlayText: draft.overlayText || null,
      },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30 px-4 py-8 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <Card className="border-primary/30 bg-card/70 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-3xl">
              <Sparkles className="h-7 w-7 text-primary" />
              Rebuild Studio
            </CardTitle>
            <CardDescription>
              New platform surface for faceless explainers and short-form skits. This page uses the new
              provider and render APIs added in the rebuild.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Badge variant="default">{providerSummary.configured} configured</Badge>
            <Badge variant="secondary">{providerSummary.missing} missing keys</Badge>
            <Badge variant="outline">{providerSummary.planned} planned</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Provider Catalog</CardTitle>
            <CardDescription>
              Capability-first provider inventory for image, TTS, and image-to-video.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {providersQuery.isLoading && <p className="text-sm text-muted-foreground">Loading providers...</p>}
            {providersQuery.isError && (
              <p className="text-sm text-destructive">Failed to load provider catalog.</p>
            )}
            {(providersQuery.data?.providers ?? []).map((provider) => (
              <div key={`${provider.kind}-${provider.id}`} className="rounded-lg border p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{provider.label}</h3>
                    <Badge variant="outline" className="uppercase">
                      {provider.kind.replace("_", " ")}
                    </Badge>
                  </div>
                  <Badge variant={statusVariant[provider.status]}>
                    {provider.status.replaceAll("_", " ")}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {provider.capabilities.map((c) => c.key).join(" • ")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="h-5 w-5" />
                Kickoff Workflow
              </CardTitle>
              <CardDescription>
                Start a new project using the unified workflow while rebuild APIs are phased in.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={onCreateProject}>
                <div className="space-y-2">
                  <Label htmlFor="title">Project Title</Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="script">Script</Label>
                  <Textarea
                    id="script"
                    rows={6}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="style">Style</Label>
                    <Input id="style" value={style} onChange={(e) => setStyle(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="projectType">Project Type</Label>
                    <select
                      id="projectType"
                      value={projectType}
                      onChange={(e) => setProjectType(e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="video">Explainer (16:9)</option>
                      <option value="sora">Short Skit (9:16)</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="providerImage">Image Provider</Label>
                    <select
                      id="providerImage"
                      value={selectedImageProvider}
                      onChange={(e) => setSelectedImageProvider(e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="nanabanana-pro">Nana Banana Pro</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="providerTts">Narration Provider</Label>
                    <select
                      id="providerTts"
                      value={selectedTtsProvider}
                      onChange={(e) => setSelectedTtsProvider(e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="elevenlabs">ElevenLabs</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="providerVideo">Image-to-Video Provider</Label>
                    <select
                      id="providerVideo"
                      value={selectedImageToVideoProvider}
                      onChange={(e) => setSelectedImageToVideoProvider(e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="sora-2">Sora 2</option>
                      <option value="veo-3.1">Veo 3.1</option>
                    </select>
                  </div>
                </div>
                <Button type="submit" disabled={createWorkflowMutation.isPending}>
                  {createWorkflowMutation.isPending ? "Starting..." : "Start Workflow"}
                </Button>
              </form>
              {createWorkflowMutation.data?.workflowId && (
                <p className="mt-3 text-sm text-primary">
                  Workflow started: <code>{createWorkflowMutation.data.workflowId}</code>
                </p>
              )}
              {workflowStatusQuery.data && (
                <div className="mt-4 rounded-md border p-3">
                  <p className="text-sm font-medium">Workflow Status: {workflowStatusQuery.data.status}</p>
                  <p className="text-xs text-muted-foreground">
                    Step {workflowStatusQuery.data.currentStep} of {workflowStatusQuery.data.steps.length}
                  </p>
                </div>
              )}
              {createWorkflowMutation.error && (
                <p className="mt-3 text-sm text-destructive">
                  {(createWorkflowMutation.error as Error).message}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5" />
                Start Render
              </CardTitle>
              <CardDescription>
                Use new `/api/renders` endpoint for long-form or TikTok render kickoff.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={onCreateRender}>
                <div className="space-y-2">
                  <Label htmlFor="projectId">Project ID</Label>
                  <Input
                    id="projectId"
                    value={renderProjectId || manualProjectId}
                    onChange={(e) => {
                      setRenderProjectId(e.target.value);
                      setManualProjectId(e.target.value);
                    }}
                    placeholder="Example: 12"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="renderFormat">Format</Label>
                    <select
                      id="renderFormat"
                      value={renderFormat}
                      onChange={(e) => setRenderFormat(e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="landscape-16-9">Landscape 16:9</option>
                      <option value="portrait-9-16">Portrait 9:16</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="renderType">Content Type</Label>
                    <select
                      id="renderType"
                      value={renderContentType}
                      onChange={(e) => setRenderContentType(e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="explainer">Explainer</option>
                      <option value="tiktok">TikTok</option>
                    </select>
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={createRenderMutation.isPending || (!renderProjectId && !resolvedProjectId)}
                >
                  {createRenderMutation.isPending ? "Starting Render..." : "Start Render"}
                </Button>
              </form>
              <div className="mt-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (manualProjectId) {
                      const id = Number(manualProjectId);
                      if (!Number.isNaN(id) && id > 0) {
                        setActiveProjectId(id);
                      }
                    }
                  }}
                  disabled={!manualProjectId}
                >
                  Load Project Context
                </Button>
              </div>
              {createRenderMutation.data?.render?.id && (
                <p className="mt-3 text-sm text-primary">
                  Render job: <code>{createRenderMutation.data.render.id}</code>
                </p>
              )}
              {createRenderMutation.error && (
                <p className="mt-3 text-sm text-destructive">
                  {(createRenderMutation.error as Error).message}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Growth Features</CardTitle>
            <CardDescription>
              Auto-hooks, comedy pacing, and long-to-short repurposing from the rebuild intelligence layer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => hookMutation.mutate()} disabled={hookMutation.isPending}>
                Generate Hooks
              </Button>
              <Button
                variant="outline"
                onClick={() => comedyTimingMutation.mutate()}
                disabled={comedyTimingMutation.isPending || !scenesQuery.data?.scenes?.length}
              >
                Comedy Timing
              </Button>
              <Button
                variant="outline"
                onClick={() => repurposeMutation.mutate()}
                disabled={repurposeMutation.isPending || !resolvedProjectId}
              >
                Repurpose to Shorts
              </Button>
            </div>

            {!!hookMutation.data?.hooks?.length && (
              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">Hook Variants</p>
                {hookMutation.data.hooks.map((hook, index) => (
                  <p key={`${hook}-${index}`} className="text-sm text-muted-foreground">
                    {index + 1}. {hook}
                  </p>
                ))}
              </div>
            )}

            {!!comedyTimingMutation.data?.timing?.length && (
              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">Comedy Timing Suggestions</p>
                {comedyTimingMutation.data.timing.slice(0, 6).map((row) => (
                  <p key={row.sceneNumber} className="text-sm text-muted-foreground">
                    Scene {row.sceneNumber}: {row.pacing}, pause {row.punchlinePauseMs}ms, emphasis{" "}
                    {row.emphasisWords.join(", ")}
                  </p>
                ))}
              </div>
            )}

            {!!repurposeMutation.data?.clips?.length && (
              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">Suggested Short Clips</p>
                {repurposeMutation.data.clips.map((clip) => (
                  <p key={clip.clipNumber} className="text-sm text-muted-foreground">
                    Clip {clip.clipNumber} (Scenes {clip.sceneRange[0]}-{clip.sceneRange[1]}): {clip.hook}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {resolvedProjectId && (
          <Card>
            <CardHeader>
              <CardTitle>Guided Scene Editor</CardTitle>
              <CardDescription>
                Rebuild flow: review scene copy, prompt, and regenerate targeted assets per scene.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {scenesQuery.isLoading && <p className="text-sm text-muted-foreground">Loading scenes...</p>}
              {scenesQuery.data?.scenes?.map((scene) => (
                <div key={scene.id} className="rounded-lg border p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h4 className="font-semibold">
                      Scene {scene.sceneNumber}: {scene.title || "Untitled"}
                    </h4>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => regeneratePromptMutation.mutate(scene.id)}
                        disabled={regeneratePromptMutation.isPending}
                      >
                        <RefreshCw className="mr-1 h-4 w-4" />
                        Prompt
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => regenerateImageMutation.mutate(scene.id)}
                        disabled={regenerateImageMutation.isPending}
                      >
                        <RefreshCw className="mr-1 h-4 w-4" />
                        Image
                      </Button>
                      <Button size="sm" onClick={() => saveScene(scene.id)} disabled={updateSceneMutation.isPending}>
                        <Save className="mr-1 h-4 w-4" />
                        Save
                      </Button>
                    </div>
                  </div>
                  {scene.imageUrl && (
                    <img
                      src={scene.imageUrl}
                      alt={`Scene ${scene.sceneNumber}`}
                      className="mb-3 max-h-64 w-full rounded-md border object-cover"
                    />
                  )}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label>Script Excerpt</Label>
                      <Textarea
                        value={sceneDrafts[scene.id]?.scriptExcerpt ?? scene.scriptExcerpt ?? ""}
                        onChange={(e) =>
                          setSceneDrafts((current) => ({
                            ...current,
                            [scene.id]: {
                              ...(current[scene.id] ?? {
                                scriptExcerpt: scene.scriptExcerpt || "",
                                dallePrompt: scene.dallePrompt || "",
                                overlayText: scene.overlayText || "",
                              }),
                              scriptExcerpt: e.target.value,
                            },
                          }))
                        }
                        rows={3}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Image Prompt</Label>
                      <Textarea
                        value={sceneDrafts[scene.id]?.dallePrompt ?? scene.dallePrompt ?? ""}
                        onChange={(e) =>
                          setSceneDrafts((current) => ({
                            ...current,
                            [scene.id]: {
                              ...(current[scene.id] ?? {
                                scriptExcerpt: scene.scriptExcerpt || "",
                                dallePrompt: scene.dallePrompt || "",
                                overlayText: scene.overlayText || "",
                              }),
                              dallePrompt: e.target.value,
                            },
                          }))
                        }
                        rows={4}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Caption Overlay</Label>
                      <Input
                        value={sceneDrafts[scene.id]?.overlayText ?? scene.overlayText ?? ""}
                        onChange={(e) =>
                          setSceneDrafts((current) => ({
                            ...current,
                            [scene.id]: {
                              ...(current[scene.id] ?? {
                                scriptExcerpt: scene.scriptExcerpt || "",
                                dallePrompt: scene.dallePrompt || "",
                                overlayText: scene.overlayText || "",
                              }),
                              overlayText: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {resolvedProjectId && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Renders</CardTitle>
                <CardDescription>DB-backed render jobs for this project.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(rendersQuery.data ?? []).map((render) => (
                  <div key={render.id} className="rounded-md border p-3">
                    <p className="text-sm font-medium">{render.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {render.status} • {render.progress}%
                    </p>
                    {render.outputUrl && (
                      <a
                        href={render.outputUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary underline"
                      >
                        Open Output
                      </a>
                    )}
                  </div>
                ))}
                {!rendersQuery.data?.length && (
                  <p className="text-sm text-muted-foreground">No renders yet.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Assets</CardTitle>
                <CardDescription>Aggregated project assets from images, audio, and video.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(assetsQuery.data?.assets ?? []).slice(0, 12).map((asset) => (
                  <div key={asset.id} className="rounded-md border p-3">
                    <p className="text-sm font-medium">
                      {asset.kind.toUpperCase()} • {asset.id}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{asset.url}</p>
                  </div>
                ))}
                {!assetsQuery.data?.assets?.length && (
                  <p className="text-sm text-muted-foreground">No assets indexed yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default RebuildStudio;
