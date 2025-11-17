import { cn } from "@raypx/ui/lib/utils";
import { Link, useParams } from "@tanstack/react-router";
import { getTemplateNames } from "../lib/emails";

// Get all email templates
const templates = getTemplateNames();

export function Sidebar() {
  const params = useParams({ strict: false });
  const templateName = params.templateName as string | undefined;

  return (
    <aside className="w-[280px] min-w-[280px] max-w-[280px] shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col shadow-lg">
      <div className="p-5 border-b border-sidebar-border">
        <h1 className="text-lg font-semibold mb-1 text-sidebar-foreground">Email Preview</h1>
        <p className="text-sm text-muted-foreground">{templates.length} templates</p>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {templates.map((name) => {
          const isActive = templateName === name;
          return (
            <Link
              className={cn(
                "block w-full px-3 py-2 rounded-md text-sm transition-colors mb-1.5",
                "hover:bg-accent hover:text-accent-foreground",
                isActive && "bg-accent text-accent-foreground",
              )}
              key={name}
              params={{ templateName: name }}
              to="/email/$templateName"
            >
              {name}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border text-xs text-muted-foreground">
        <p className="text-sidebar-foreground">⚡ TanStack Start</p>
        <p className="mt-1">Development Only</p>
      </div>
    </aside>
  );
}
