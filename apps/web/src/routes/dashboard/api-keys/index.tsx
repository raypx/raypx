import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@raypx/ui/components";
import { toast } from "@raypx/ui/components/toast";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, Key, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/dashboard/api-keys/")({
  component: ApiKeysPage,
});

type ApiKey = {
  id: string;
  name: string;
  key: string;
  prefix: string;
  created: string;
  lastUsed: string;
  requests: number;
  enabled: boolean;
};

// Mock data - replace with real API call
const mockApiKeys: ApiKey[] = [
  {
    id: "1",
    name: "Production API",
    key: "sk_live_••••••••••••4d2f",
    prefix: "sk_live_",
    created: "2025-01-15",
    lastUsed: "2 hours ago",
    requests: 12453,
    enabled: true,
  },
  {
    id: "2",
    name: "Development API",
    key: "sk_test_••••••••••••8a9b",
    prefix: "sk_test_",
    created: "2025-01-10",
    lastUsed: "5 minutes ago",
    requests: 3421,
    enabled: true,
  },
  {
    id: "3",
    name: "Staging API",
    key: "sk_test_••••••••••••1c3e",
    prefix: "sk_test_",
    created: "2025-01-05",
    lastUsed: "Never",
    requests: 0,
    enabled: false,
  },
];

function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState(mockApiKeys);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  const handleCreateKey = () => {
    // In real app, call API to create key
    const newKey = `sk_live_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;

    const newApiKey: ApiKey = {
      id: String(apiKeys.length + 1),
      name: newKeyName || "Untitled Key",
      key: `${newKey.substring(0, 15)}••••••••••••${newKey.slice(-4)}`,
      prefix: "sk_live_",
      created: new Date().toISOString().split("T")[0] || "",
      lastUsed: "Never",
      requests: 0,
      enabled: true,
    };

    setApiKeys([...apiKeys, newApiKey]);
    setNewlyCreatedKey(newKey);
    setNewKeyName("");
    toast.success("API key created successfully!");
  };

  const handleDeleteKey = (id: string) => {
    setApiKeys(apiKeys.filter((key) => key.id !== id));
    toast.success("API key deleted successfully!");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground">Manage your API keys for programmatic access</p>
        </div>

        <Dialog onOpenChange={setIsCreateDialogOpen} open={isCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create New Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New API Key</DialogTitle>
              <DialogDescription>Generate a new API key for your application</DialogDescription>
            </DialogHeader>

            {newlyCreatedKey ? (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg border border-green-500/50">
                  <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
                    ✓ API Key Created Successfully
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Make sure to copy your API key now. You won't be able to see it again!
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-background rounded text-xs border font-mono">
                      {newlyCreatedKey}
                    </code>
                    <Button
                      onClick={() => copyToClipboard(newlyCreatedKey)}
                      size="sm"
                      variant="outline"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    setNewlyCreatedKey(null);
                    setIsCreateDialogOpen(false);
                  }}
                >
                  Done
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="key-name">Key Name</Label>
                    <Input
                      id="key-name"
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g., Production API"
                      value={newKeyName}
                    />
                    <p className="text-xs text-muted-foreground">
                      A descriptive name to identify this key
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => setIsCreateDialogOpen(false)} variant="outline">
                    Cancel
                  </Button>
                  <Button onClick={handleCreateKey}>Create Key</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Active API Keys
          </CardTitle>
          <CardDescription>
            {apiKeys.length} active key{apiKeys.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <div className="text-center py-12">
              <Key className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No API Keys</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first API key to get started
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create API Key
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead>Requests</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((apiKey) => (
                    <TableRow key={apiKey.id}>
                      <TableCell className="font-medium">{apiKey.name}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{apiKey.key}</code>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {apiKey.created}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {apiKey.lastUsed}
                      </TableCell>
                      <TableCell className="text-sm">{apiKey.requests.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={apiKey.enabled ? "default" : "secondary"}>
                          {apiKey.enabled ? "Active" : "Disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            onClick={() => copyToClipboard(apiKey.key)}
                            size="sm"
                            variant="ghost"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete API Key?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. Applications using this key will no
                                  longer be able to access the API.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => handleDeleteKey(apiKey.id)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Usage</CardTitle>
          <CardDescription>Monitor your API usage and rate limits</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total Requests</p>
              <p className="text-2xl font-bold">
                {apiKeys.reduce((sum, key) => sum + key.requests, 0).toLocaleString()}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Rate Limit</p>
              <p className="text-2xl font-bold">1,000/min</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Monthly Quota</p>
              <p className="text-2xl font-bold">Unlimited</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
