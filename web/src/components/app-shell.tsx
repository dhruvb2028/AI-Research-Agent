"use client";

import {
  Compass,
  Database,
  FlaskConical,
  History,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Research", icon: Compass, hint: "Run the agent" },
  { href: "/library", label: "Library", icon: History, hint: "Past runs, from trace logs" },
  { href: "/evaluation", label: "Evaluation", icon: FlaskConical, hint: "Measured quality reports" },
  { href: "/corpus", label: "Project docs", icon: Database, hint: "Documents the agent can search" },
];

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const [dark, setDark] = useState(false);

  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      className={cn("w-full justify-start gap-3 text-muted-foreground", collapsed && "justify-center px-0")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <Sun className="size-4 shrink-0" /> : <Moon className="size-4 shrink-0" />}
      {!collapsed && <span className="text-sm">{dark ? "Light" : "Dark"} mode</span>}
    </Button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <TooltipProvider delay={300}>
      <div className="flex min-h-screen">
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 md:flex",
            collapsed ? "w-[68px]" : "w-60",
          )}
        >
          <div className={cn("flex h-14 items-center gap-2 px-4", collapsed && "justify-center px-0")}>
            <div className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
              <Compass className="size-4" />
            </div>
            {!collapsed && (
              <span className="truncate font-semibold tracking-tight">ResearchPilot</span>
            )}
          </div>

          <nav className="flex-1 space-y-1 px-3 py-2">
            {NAV.map(({ href, label, icon: Icon, hint }) => {
              const active = pathname === href;
              const link = (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    collapsed && "justify-center px-0",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </Link>
              );
              return collapsed ? (
                <Tooltip key={href}>
                  <TooltipTrigger render={link} />
                  <TooltipContent side="right">{hint}</TooltipContent>
                </Tooltip>
              ) : (
                link
              );
            })}
          </nav>

          <div className="space-y-1 border-t p-3">
            <ThemeToggle collapsed={collapsed} />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed((c) => !c)}
              className={cn(
                "w-full justify-start gap-3 text-muted-foreground",
                collapsed && "justify-center px-0",
              )}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4 shrink-0" />
              ) : (
                <PanelLeftClose className="size-4 shrink-0" />
              )}
              {!collapsed && <span className="text-sm">Collapse</span>}
            </Button>
          </div>
        </aside>

        {/* Mobile top nav */}
        <div className="fixed inset-x-0 top-0 z-20 flex h-12 items-center gap-1 border-b bg-background/90 px-2 backdrop-blur md:hidden">
          <div className="grid size-6 place-items-center rounded bg-primary text-primary-foreground">
            <Compass className="size-3.5" />
          </div>
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className={cn(
                "rounded-md p-2",
                pathname === href
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
            </Link>
          ))}
          <div className="ml-auto">
            <ThemeToggle collapsed />
          </div>
        </div>

        <main className="min-w-0 flex-1 pt-12 md:pt-0">{children}</main>
      </div>
    </TooltipProvider>
  );
}
