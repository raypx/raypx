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
              className={`
                block w-full px-3 py-2.5 mb-1.5 rounded-lg text-left text-sm font-medium
                transition-all duration-200
                ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90 hover:text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }
              `}
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
