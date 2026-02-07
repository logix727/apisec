import Dashboard from "./components/Dashboard";
import AssetInventory from "./components/AssetInventory";
import GlobalSearch from "./components/GlobalSearch";
import Analytics from "./components/Analytics";
import Settings from "./components/Settings";
import Repeater from "./components/Repeater";
import Proxy from "./components/Proxy";
import Mesh from "./components/Mesh";
import Recon from "./components/Recon";
import Auditor from "./components/Auditor";
import Fuzzer from "./components/Fuzzer";
import Environments from "./components/Environments";
import "./App.css";
import { useState, useEffect } from "react";
import { LayoutDashboard, Database, Settings as SettingsIcon, Shield, Zap, Search, Bell, Sun, Moon, ChevronDown, Plus, Check, BarChart3, Terminal, Wifi, Globe, Gauge, Bug } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "./lib/utils";

function App() {
  const [currentView, setCurrentView] = useState<"dashboard" | "inventory" | "search" | "analytics" | "settings" | "repeater" | "proxy" | "mesh" | "recon" | "auditor" | "fuzzer" | "environments">("dashboard");
  const [repeaterInit, setRepeaterInit] = useState<any>(null);
  const [workspace, setWorkspace] = useState("Main Workspace");
  const [availableWorkspaces, setAvailableWorkspaces] = useState<string[]>([]);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("apisec-theme");
    return (saved as "dark" | "light") || "dark";
  });

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("apisec-theme", next);
      return next;
    });
  };

  const loadWorkspaces = async () => {
    try {
      const current = await invoke<string>("get_current_workspace");
      const list = await invoke<string[]>("list_workspaces");
      setWorkspace(current);
      setAvailableWorkspaces(list);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSwitchWorkspace = async (name: string) => {
    try {
      await invoke("switch_workspace", { name });
      setWorkspace(name);
      setShowWorkspaceMenu(false);
      // Force reload current view data
      if (currentView === "inventory") {
        // This might need a custom event or a key change to force re-render
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey)) {
        if (e.key === "k") {
          e.preventDefault();
          setCurrentView("search");
        } else if (e.key === "d") {
          e.preventDefault();
          setCurrentView("dashboard");
        } else if (e.key === "a") {
          e.preventDefault();
          setCurrentView("inventory");
        } else if (e.key === "i") {
          e.preventDefault();
          setCurrentView("analytics");
        } else if (e.key.toLowerCase() === 'p') {
          e.preventDefault();
          setCurrentView("proxy");
        } else if (e.key.toLowerCase() === 'r') {
          e.preventDefault();
          setCurrentView("repeater");
        } else if (e.key.toLowerCase() === 'm') {
          e.preventDefault();
          setCurrentView("mesh");
        } else if (e.key.toLowerCase() === 'n') {
          e.preventDefault();
          setCurrentView("recon");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSendToRepeater = (data: any) => {
    setRepeaterInit(data);
    setCurrentView("repeater");
  };

  const handleCreateWorkspace = async () => {
    const name = prompt("Enter new workspace name:");
    if (name) {
      await handleSwitchWorkspace(name);
      await loadWorkspaces();
    }
  };

  return (
    <main className={cn(
      "flex h-screen overflow-hidden font-sans transition-colors duration-500",
      theme === "light" ? "light bg-zinc-50 text-zinc-950" : "bg-zinc-950 text-white"
    )}>
      {/* Background Decor */}
      <div className={cn("fixed inset-0 pointer-events-none opacity-50 bg-grid-white", theme === "light" ? "invert opacity-10" : "")} />
      <div className="fixed top-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Sidebar */}
      <aside className={cn(
        "relative w-64 border-r p-6 flex flex-col gap-8 z-10 transition-colors duration-500",
        theme === "light" ? "bg-white border-zinc-200" : "bg-zinc-900/30 border-white/5 backdrop-blur-2xl"
      )}>
        <div className="flex items-center gap-3 px-2">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center shadow-lg shadow-brand-500/20 glow-primary">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div className="flex flex-col">
            <span className={cn("font-bold text-xl tracking-tight leading-none", theme === "light" ? "text-zinc-950" : "text-white")}>APISec</span>
            <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-brand-400 mt-1">Analyst Pro</span>
          </div>
        </div>

        <nav className="flex flex-col gap-2">
          <button
            onClick={() => setCurrentView("dashboard")}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group",
              currentView === "dashboard"
                ? "bg-brand-500/10 text-brand-400 border border-brand-500/20 shadow-inner shadow-brand-500/5 font-bold"
                : theme === "light" ? "text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100" : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
            )}
          >
            <LayoutDashboard className={cn("h-5 w-5 transition-transform duration-300 group-hover:scale-110", currentView === "dashboard" ? "text-brand-400" : "text-zinc-500")} />
            Dashboard
          </button>
          <button
            onClick={() => setCurrentView("analytics")}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group",
              currentView === "analytics"
                ? "bg-brand-500/10 text-brand-400 border border-brand-500/20 shadow-inner shadow-brand-500/5 font-bold"
                : theme === "light" ? "text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100" : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
            )}
          >
            <BarChart3 className={cn("h-5 w-5 transition-transform duration-300 group-hover:scale-110", currentView === "analytics" ? "text-brand-400" : "text-zinc-500")} />
            Insights
          </button>
          <button
            onClick={() => setCurrentView("mesh")}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group",
              currentView === "mesh"
                ? "bg-brand-500/10 text-brand-400 border border-brand-500/20 shadow-inner shadow-brand-500/5 font-bold"
                : theme === "light" ? "text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100" : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
            )}
          >
            <Zap className={cn("h-5 w-5 transition-transform duration-300 group-hover:scale-110", currentView === "mesh" ? "text-brand-400" : "text-zinc-500")} />
            Attack Mesh
          </button>
          <button
            onClick={() => setCurrentView("inventory")}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group",
              currentView === "inventory"
                ? "bg-accent-500/10 text-accent-400 border border-accent-500/20 shadow-inner shadow-accent-500/5 font-bold"
                : theme === "light" ? "text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100" : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
            )}
          >
            <Database className={cn("h-5 w-5 transition-transform duration-300 group-hover:scale-110", currentView === "inventory" ? "text-accent-400" : "text-zinc-500")} />
            Inventory
          </button>
          <button
            onClick={() => setCurrentView("recon")}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group",
              currentView === "recon"
                ? "bg-brand-500/10 text-brand-400 border border-brand-500/20 shadow-inner shadow-brand-500/5 font-bold"
                : theme === "light" ? "text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100" : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
            )}
          >
            <Globe className={cn("h-5 w-5 transition-transform duration-300 group-hover:scale-110", currentView === "recon" ? "text-brand-400" : "text-zinc-500")} />
            Network Recon
          </button>
          <button
            onClick={() => setCurrentView("search")}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group",
              currentView === "search"
                ? "bg-brand-500/10 text-brand-400 border border-brand-500/20 shadow-inner shadow-brand-500/5 font-bold"
                : theme === "light" ? "text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100" : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
            )}
          >
            <Search className={cn("h-5 w-5 transition-transform duration-300 group-hover:scale-110", currentView === "search" ? "text-brand-400" : "text-zinc-500")} />
            Global Search
          </button>
          <button
            onClick={() => setCurrentView("proxy")}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group",
              currentView === "proxy"
                ? "bg-brand-500/10 text-brand-400 border border-brand-500/20 shadow-inner shadow-brand-500/5 font-bold"
                : theme === "light" ? "text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100" : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
            )}
          >
            <Wifi className={cn("h-5 w-5 transition-transform duration-300 group-hover:scale-110", currentView === "proxy" ? "text-brand-400" : "text-zinc-500")} />
            Live Proxy
          </button>
          <button
            onClick={() => setCurrentView("repeater")}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group",
              currentView === "repeater"
                ? "bg-brand-500/10 text-brand-400 border border-brand-500/20 shadow-inner shadow-brand-500/5 font-bold"
                : theme === "light" ? "text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100" : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
            )}
          >
            <Terminal className={cn("h-5 w-5 transition-transform duration-300 group-hover:scale-110", currentView === "repeater" ? "text-brand-400" : "text-zinc-500")} />
            Repeater
          </button>
          <button
            onClick={() => setCurrentView("auditor")}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group",
              currentView === "auditor"
                ? "bg-accent-500/10 text-accent-400 border border-accent-500/20 shadow-inner shadow-accent-500/5 font-bold"
                : theme === "light" ? "text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100" : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
            )}
          >
            <Gauge className={cn("h-5 w-5 transition-transform duration-300 group-hover:scale-110", currentView === "auditor" ? "text-accent-400" : "text-zinc-500")} />
            Auditor Tools
          </button>
          <button
            onClick={() => setCurrentView("fuzzer")}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group",
              currentView === "fuzzer"
                ? "bg-accent-500/10 text-accent-400 border border-accent-500/20 shadow-inner shadow-accent-500/5 font-bold"
                : theme === "light" ? "text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100" : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
            )}
          >
            <Bug className={cn("h-5 w-5 transition-transform duration-300 group-hover:scale-110", currentView === "fuzzer" ? "text-accent-400" : "text-zinc-500")} />
            Active Fuzzer
          </button>
          <button
            onClick={() => setCurrentView("environments")}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all group",
              currentView === "environments"
                ? theme === "light" ? "text-brand-600 bg-brand-50" : "text-brand-400 bg-brand-500/10"
                : theme === "light" ? "text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100" : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
            )}
          >
            <Globe className={cn("h-5 w-5 transition-transform duration-300 group-hover:scale-110", currentView === "environments" ? "text-brand-400" : "text-zinc-500")} />
            Environments
          </button>
        </nav>

        <div className="mt-auto flex flex-col gap-2 pt-6 border-t border-zinc-200 dark:border-white/5">
          <button
            onClick={() => setCurrentView("settings")}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
              currentView === "settings" ? "text-brand-400 bg-brand-500/5" : "text-zinc-500 hover:text-brand-400"
            )}
          >
            <SettingsIcon className="h-5 w-5" />
            Settings
          </button>
          <div className={cn("flex items-center justify-between px-4 py-3 rounded-xl border mt-4 transition-colors", theme === "light" ? "bg-zinc-100 border-zinc-200" : "bg-white/5 border-white/5")}>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">v0.1.0-READY</span>
            </div>
            <Zap className="h-3 w-3 text-brand-400" />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-auto z-0 flex flex-col">
        {/* Header Bar */}
        <header className={cn(
          "h-16 border-b flex items-center justify-between px-8 absolute top-0 left-0 right-0 z-20 backdrop-blur-md transition-colors duration-500",
          theme === "light" ? "bg-white/50 border-zinc-200" : "bg-zinc-950/20 border-white/5"
        )}>
          <div className="relative group/workspace">
            <button
              onClick={() => { loadWorkspaces(); setShowWorkspaceMenu(!showWorkspaceMenu); }}
              className="flex items-center gap-2 text-xs font-medium text-zinc-500 tracking-wider uppercase hover:text-brand-400 transition-colors"
            >
              <span>Project</span>
              <span className="text-zinc-300">/</span>
              <span className={cn("transition-colors", theme === "light" ? "text-zinc-900" : "text-zinc-300")}>{workspace}</span>
              <ChevronDown className="h-3 w-3" />
            </button>

            {showWorkspaceMenu && (
              <div className={cn(
                "absolute top-full left-0 mt-2 w-64 glass rounded-2xl border border-white/10 shadow-2xl p-2 z-[100] animate-in slide-in-from-top-2 duration-200",
                theme === "light" ? "bg-white" : "bg-zinc-900"
              )}>
                <div className="px-3 py-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest border-b border-white/5 mb-1">
                  Switch Workspace
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {availableWorkspaces.map(w => (
                    <button
                      key={w}
                      onClick={() => handleSwitchWorkspace(w)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between",
                        w === workspace
                          ? "bg-brand-500/10 text-brand-400"
                          : "text-zinc-400 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      {w}
                      {w === workspace && <Check className="h-3 w-3" />}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleCreateWorkspace}
                  className="w-full text-left px-3 py-2 mt-2 border-t border-white/5 text-xs font-bold text-brand-400 hover:bg-brand-500/10 rounded-xl transition-all flex items-center gap-2"
                >
                  <Plus className="h-3 w-3" /> New Workspace
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className={cn(
                "h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-500",
                theme === "light" ? "bg-zinc-100 text-zinc-950" : "bg-zinc-900 text-zinc-400 hover:text-white"
              )}
            >
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <div className="h-8 w-px bg-zinc-200 dark:bg-white/5 mx-2" />
            <button className={cn(
              "h-9 w-9 rounded-full flex items-center justify-center transition-colors relative",
              theme === "light" ? "bg-zinc-100 text-zinc-600" : "bg-zinc-900 text-zinc-400 hover:text-white"
            )}>
              <Bell className="h-4 w-4" />
              <span className="absolute top-0 right-0 h-2 w-2 bg-accent-500 rounded-full border-2 border-inherit" />
            </button>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 border border-white/10" />
              <span className={cn("text-sm font-bold uppercase tracking-tighter", theme === "light" ? "text-zinc-900" : "text-zinc-300")}>Security Lead</span>
            </div>
          </div>
        </header>

        <div className="pt-24 pb-8 px-8 flex-1 flex flex-col" key={workspace}>
          {currentView === "dashboard" && <Dashboard />}
          {currentView === "inventory" && <AssetInventory onSendToRepeater={handleSendToRepeater} />}
          {currentView === "analytics" && <Analytics />}
          {currentView === "search" && <GlobalSearch />}
          {currentView === "repeater" && <Repeater initialRequest={repeaterInit} />}
          {currentView === "proxy" && <Proxy />}
          {currentView === "mesh" && <Mesh />}
          {currentView === "recon" && <Recon />}
          {currentView === "auditor" && <Auditor />}
          {currentView === "fuzzer" && <Fuzzer />}
          {currentView === "environments" && <Environments />}
          {currentView === "settings" && <Settings />}
        </div>
      </div>
    </main>
  );
}

export default App;
