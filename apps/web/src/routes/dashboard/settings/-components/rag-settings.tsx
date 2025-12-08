import { useTRPC } from "@raypx/trpc/client";
import { Button } from "@raypx/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { Input } from "@raypx/ui/components/input";
import { Label } from "@raypx/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components/select";
import { toast } from "@raypx/ui/components/toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Brain, Eye, EyeOff, Loader2, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const RAG_NAMESPACE_NAME = "rag";
const CONFIG_KEYS = {
  PROVIDER: "embedding_provider",
  API_KEY: "embedding_api_key",
  API_URL: "embedding_api_url",
  MODEL: "embedding_model",
  DIMENSIONS: "embedding_dimensions",
  CHUNK_SIZE: "chunk_size",
  CHUNK_OVERLAP: "chunk_overlap",
} as const;

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "huggingface", label: "Hugging Face" },
  { value: "cohere", label: "Cohere" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "aliyun", label: "Alibaba Cloud (阿里云)" },
] as const;

/**
 * Provider-specific recommended chunking defaults
 * Based on common practices and provider capabilities
 */
const PROVIDER_CHUNKING_DEFAULTS: Record<string, { chunkSize: number; chunkOverlap: number }> = {
  openai: { chunkSize: 1000, chunkOverlap: 200 }, // OpenAI supports larger chunks well
  huggingface: { chunkSize: 512, chunkOverlap: 100 }, // Hugging Face models often work better with smaller chunks
  cohere: { chunkSize: 512, chunkOverlap: 100 }, // Cohere recommends smaller chunks
  deepseek: { chunkSize: 1000, chunkOverlap: 200 }, // Similar to OpenAI
  aliyun: { chunkSize: 1000, chunkOverlap: 200 }, // Similar to OpenAI (OpenAI-compatible)
} as const;

export function RAGSettings() {
  const trpc = useTRPC();
  const [showApiKey, setShowApiKey] = useState(false);
  const initialProvider = "openai";
  const initialDefaults = PROVIDER_CHUNKING_DEFAULTS[initialProvider] || {
    chunkSize: 1000,
    chunkOverlap: 200,
  };
  const [formData, setFormData] = useState({
    provider: initialProvider,
    apiKey: "",
    apiUrl: "",
    model: "",
    dimensions: "",
    chunkSize: String(initialDefaults.chunkSize),
    chunkOverlap: String(initialDefaults.chunkOverlap),
  });
  // Track if user has manually modified chunking values
  const [chunkingManuallySet, setChunkingManuallySet] = useState(false);
  // Track if initial load from database is complete
  const isInitialLoadComplete = useRef(false);

  // Get or create RAG namespace
  const namespaceQuery = useQuery({
    ...trpc.configs.listNamespaces.queryOptions({ page: 1, pageSize: 100 }),
  });

  const ragNamespace = namespaceQuery.data?.items.find((ns) => ns.name === RAG_NAMESPACE_NAME);

  // Get existing configs if namespace exists
  const configsQuery = useQuery({
    ...trpc.configs.list.queryOptions(
      {
        namespaceId: ragNamespace?.id ?? "",
        page: 1,
        pageSize: 100,
      },
      { enabled: !!ragNamespace?.id },
    ),
  });

  // Get API key value separately (since it's a secret and hidden in list)
  const apiKeyQuery = useQuery({
    ...trpc.configs.getValue.queryOptions(
      {
        namespaceId: ragNamespace?.id ?? "",
        key: CONFIG_KEYS.API_KEY,
      },
      { enabled: !!ragNamespace?.id },
    ),
  });

  // Create namespace mutation (without onSuccess to avoid duplicate toasts)
  const createNamespaceMutation = useMutation({
    ...trpc.configs.createNamespace.mutationOptions(),
  });

  // Update or create config mutations (without onSuccess to avoid duplicate toasts)
  const updateConfigMutation = useMutation({
    ...trpc.configs.update.mutationOptions(),
  });

  const createConfigMutation = useMutation({
    ...trpc.configs.create.mutationOptions(),
  });

  // Initialize form data from existing configs
  useEffect(() => {
    if (configsQuery.data?.items) {
      const configs = configsQuery.data.items;
      const loadedProvider =
        (configs.find((c) => c.key === CONFIG_KEYS.PROVIDER)?.value as string) || "openai";
      const loadedChunkSize =
        String(configs.find((c) => c.key === CONFIG_KEYS.CHUNK_SIZE)?.value || "1000") || "1000";
      const loadedChunkOverlap =
        String(configs.find((c) => c.key === CONFIG_KEYS.CHUNK_OVERLAP)?.value || "200") || "200";

      // Check if chunking values match the default for the loaded provider
      const providerDefaults = PROVIDER_CHUNKING_DEFAULTS[loadedProvider] || {
        chunkSize: 1000,
        chunkOverlap: 200,
      };
      const isUsingDefaults =
        loadedChunkSize === String(providerDefaults.chunkSize) &&
        loadedChunkOverlap === String(providerDefaults.chunkOverlap);

      setFormData((prev) => ({
        provider: loadedProvider,
        apiKey: prev.apiKey, // Will be updated separately from apiKeyQuery
        apiUrl:
          (configs.find((c) => c.key === CONFIG_KEYS.API_URL)?.value as string) || prev.apiUrl,
        model: (configs.find((c) => c.key === CONFIG_KEYS.MODEL)?.value as string) || prev.model,
        dimensions:
          String(configs.find((c) => c.key === CONFIG_KEYS.DIMENSIONS)?.value || "") ||
          prev.dimensions,
        chunkSize: loadedChunkSize,
        chunkOverlap: loadedChunkOverlap,
      }));

      // Mark chunking as manually set if values don't match defaults
      setChunkingManuallySet(!isUsingDefaults);
      isInitialLoadComplete.current = true;
    } else if (!ragNamespace) {
      // No namespace exists yet, mark as initialized
      isInitialLoadComplete.current = true;
    }
  }, [configsQuery.data, ragNamespace]);

  // Update API key separately when apiKeyQuery data is available
  useEffect(() => {
    const apiKeyData = apiKeyQuery.data;
    if (apiKeyData && apiKeyData.value !== null && apiKeyData.value !== undefined) {
      setFormData((prev) => ({
        ...prev,
        apiKey: String(apiKeyData.value) || "",
      }));
    }
  }, [apiKeyQuery.data]);

  const handleSave = async () => {
    try {
      let namespaceId = ragNamespace?.id;

      // Create namespace first if it doesn't exist
      if (!namespaceId) {
        const createdNamespace = await createNamespaceMutation.mutateAsync({
          name: RAG_NAMESPACE_NAME,
          description: "RAG (Retrieval-Augmented Generation) configuration",
          icon: "brain",
        });
        namespaceId = createdNamespace.id;
        // Refetch to get the new namespace and configs
        await Promise.all([
          namespaceQuery.refetch(),
          configsQuery.refetch(),
          apiKeyQuery.refetch(),
        ]);
      }

      if (!namespaceId) {
        toast.error("Failed to create namespace");
        return;
      }

      // Refetch configs to get latest data
      const latestConfigs = await configsQuery.refetch();
      const configs = latestConfigs.data?.items || [];

      // Save all configs
      const configsToSave = [
        {
          key: CONFIG_KEYS.PROVIDER,
          value: formData.provider,
          valueType: "string" as const,
          isSecret: false,
        },
        {
          key: CONFIG_KEYS.API_KEY,
          value: formData.apiKey,
          valueType: "string" as const,
          isSecret: true,
        },
        {
          key: CONFIG_KEYS.API_URL,
          value: formData.apiUrl,
          valueType: "string" as const,
          isSecret: false,
        },
        {
          key: CONFIG_KEYS.MODEL,
          value: formData.model,
          valueType: "string" as const,
          isSecret: false,
        },
        {
          key: CONFIG_KEYS.DIMENSIONS,
          value: formData.dimensions ? String(formData.dimensions) : null,
          valueType: "number" as const,
          isSecret: false,
        },
        {
          key: CONFIG_KEYS.CHUNK_SIZE,
          value: formData.chunkSize,
          valueType: "number" as const,
          isSecret: false,
        },
        {
          key: CONFIG_KEYS.CHUNK_OVERLAP,
          value: formData.chunkOverlap,
          valueType: "number" as const,
          isSecret: false,
        },
      ];

      // Update or create each config
      const savePromises = configsToSave
        .filter((config) => {
          // For API key, skip if value is empty and it already exists (user didn't change it)
          if (
            config.key === CONFIG_KEYS.API_KEY &&
            !config.value &&
            configs.find((c) => c.key === CONFIG_KEYS.API_KEY)
          ) {
            return false;
          }
          return true;
        })
        .map(async (config) => {
          const existing = configs.find((c) => c.key === config.key);
          if (existing) {
            return updateConfigMutation.mutateAsync({
              id: existing.id,
              value: config.value || "",
              valueType: config.valueType,
            });
          } else {
            if (!namespaceId) {
              throw new Error("Namespace ID is required");
            }
            return createConfigMutation.mutateAsync({
              namespaceId,
              key: config.key,
              value: config.value || "",
              valueType: config.valueType,
              description: getConfigDescription(config.key),
              isSecret: config.isSecret,
            });
          }
        });

      await Promise.all(savePromises);
      toast.success("Configuration saved successfully!");
      void Promise.all([configsQuery.refetch(), apiKeyQuery.refetch()]);
    } catch (error) {
      console.error("Failed to save configuration:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save configuration");
    }
  };

  const isLoading =
    createNamespaceMutation.isPending ||
    updateConfigMutation.isPending ||
    createConfigMutation.isPending;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            <CardTitle>Embedding Provider</CardTitle>
          </div>
          <CardDescription>
            Configure your embedding provider and API credentials for document vectorization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select
              onValueChange={(value) => {
                const defaults = PROVIDER_CHUNKING_DEFAULTS[value] || {
                  chunkSize: 1000,
                  chunkOverlap: 200,
                };
                setFormData((prev) => ({
                  ...prev,
                  provider: value,
                  // Auto-update chunking values if user hasn't manually set them
                  ...(isInitialLoadComplete.current && !chunkingManuallySet
                    ? {
                        chunkSize: String(defaults.chunkSize),
                        chunkOverlap: String(defaults.chunkOverlap),
                      }
                    : {}),
                }));
              }}
              value={formData.provider}
            >
              <SelectTrigger id="provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <div className="relative">
              <Input
                id="apiKey"
                onChange={(e) => setFormData((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder="Enter your API key"
                type={showApiKey ? "text" : "password"}
                value={formData.apiKey}
              />
              <Button
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowApiKey(!showApiKey)}
                size="icon"
                type="button"
                variant="ghost"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Your API key is stored securely and will be used for embedding generation
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiUrl">API URL (Optional)</Label>
            <Input
              id="apiUrl"
              onChange={(e) => setFormData((prev) => ({ ...prev, apiUrl: e.target.value }))}
              placeholder="Leave empty to use default endpoint"
              type="url"
              value={formData.apiUrl}
            />
            <p className="text-sm text-muted-foreground">
              Custom API endpoint URL. Default URLs are used if not specified.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Model (Optional)</Label>
            <Input
              id="model"
              onChange={(e) => setFormData((prev) => ({ ...prev, model: e.target.value }))}
              placeholder="e.g., text-embedding-3-small, text-embedding-v3"
              value={formData.model}
            />
            <p className="text-sm text-muted-foreground">
              Model name for embedding generation. Provider default is used if not specified.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dimensions">Dimensions (Optional)</Label>
            <Input
              id="dimensions"
              onChange={(e) => setFormData((prev) => ({ ...prev, dimensions: e.target.value }))}
              placeholder="e.g., 1536, 1024"
              type="number"
              value={formData.dimensions}
            />
            <p className="text-sm text-muted-foreground">
              Embedding vector dimensions. Provider default is used if not specified.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Text Chunking</CardTitle>
          <CardDescription>
            Configure how documents are split into chunks for processing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="chunkSize">Chunk Size</Label>
            <Input
              id="chunkSize"
              onChange={(e) => {
                setChunkingManuallySet(true);
                setFormData((prev) => ({ ...prev, chunkSize: e.target.value }));
              }}
              placeholder="1000"
              type="number"
              value={formData.chunkSize}
            />
            <p className="text-sm text-muted-foreground">
              Maximum number of characters per chunk (default for {formData.provider}:{" "}
              {PROVIDER_CHUNKING_DEFAULTS[formData.provider]?.chunkSize || 1000})
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="chunkOverlap">Chunk Overlap</Label>
            <Input
              id="chunkOverlap"
              onChange={(e) => {
                setChunkingManuallySet(true);
                setFormData((prev) => ({ ...prev, chunkOverlap: e.target.value }));
              }}
              placeholder="200"
              type="number"
              value={formData.chunkOverlap}
            />
            <p className="text-sm text-muted-foreground">
              Number of overlapping characters between chunks (default for {formData.provider}:{" "}
              {PROVIDER_CHUNKING_DEFAULTS[formData.provider]?.chunkOverlap || 200})
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button disabled={isLoading} onClick={handleSave}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Configuration
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function getConfigDescription(key: string): string {
  const descriptions: Record<string, string> = {
    [CONFIG_KEYS.PROVIDER]: "Embedding provider (OpenAI, Hugging Face, Cohere, DeepSeek, Aliyun)",
    [CONFIG_KEYS.API_KEY]: "API key for the embedding provider",
    [CONFIG_KEYS.API_URL]: "Custom API endpoint URL",
    [CONFIG_KEYS.MODEL]: "Model name for embedding generation",
    [CONFIG_KEYS.DIMENSIONS]: "Embedding vector dimensions",
    [CONFIG_KEYS.CHUNK_SIZE]: "Maximum characters per text chunk",
    [CONFIG_KEYS.CHUNK_OVERLAP]: "Overlapping characters between chunks",
  };
  return descriptions[key] || "";
}
