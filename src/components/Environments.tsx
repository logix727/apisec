import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Globe, Plus, Trash2, Check, Zap } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../lib/utils";

interface Environment {
    id: number;
    name: string;
    base_url: string;
    variables: string;
    is_active: boolean;
}

export default function Environments() {
    const [environments, setEnvironments] = useState<Environment[]>([]);
    const [activeEnv, setActiveEnv] = useState<Environment | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [newEnv, setNewEnv] = useState({ name: "", base_url: "", variables: "{}" });

    useEffect(() => {
        loadEnvironments();
    }, []);

    const loadEnvironments = async () => {
        try {
            const envs = await invoke<Environment[]>("get_environments");
            setEnvironments(envs);
            const active = envs.find(e => e.is_active);
            if (active) setActiveEnv(active);
        } catch (e) {
            console.error("Failed to load environments:", e);
        }
    };

    const handleCreate = async () => {
        try {
            await invoke("create_environment", {
                name: newEnv.name,
                baseUrl: newEnv.base_url,
                variables: newEnv.variables
            });
            setNewEnv({ name: "", base_url: "", variables: "{}" });
            setShowCreate(false);
            loadEnvironments();
        } catch (e) {
            console.error("Failed to create environment:", e);
        }
    };

    const handleSetActive = async (id: number) => {
        try {
            await invoke("set_active_environment", { id });
            loadEnvironments();
        } catch (e) {
            console.error("Failed to set active environment:", e);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await invoke("delete_environment", { id });
            loadEnvironments();
        } catch (e) {
            console.error("Failed to delete environment:", e);
        }
    };

    return (
        <div className="h-full flex flex-col gap-8 p-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                        <Globe className="h-8 w-8 text-brand-400" />
                        Environments
                    </h1>
                    <p className="text-sm text-zinc-500 font-bold mt-1">Manage deployment contexts and variable injection</p>
                </div>
                <Button
                    onClick={() => setShowCreate(!showCreate)}
                    className="h-12 px-6 rounded-xl bg-brand-500 hover:bg-brand-400 text-black font-bold shadow-lg shadow-brand-500/20"
                >
                    <Plus size={16} className="mr-2" />
                    New Environment
                </Button>
            </div>

            {/* Active Environment Badge */}
            {activeEnv && (
                <div className="p-6 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-brand-500/20 flex items-center justify-center">
                            <Zap className="h-6 w-6 text-brand-400" />
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-brand-400">Active Environment</div>
                            <div className="text-lg font-bold text-white">{activeEnv.name}</div>
                            <div className="text-xs text-zinc-400 font-mono">{activeEnv.base_url}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Form */}
            {showCreate && (
                <div className="p-6 rounded-2xl bg-zinc-900/50 border border-white/5 space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Create New Environment</h3>
                    <input
                        type="text"
                        placeholder="Environment Name (e.g., Production)"
                        value={newEnv.name}
                        onChange={(e) => setNewEnv({ ...newEnv, name: e.target.value })}
                        className="w-full h-12 bg-zinc-950 border border-white/5 rounded-xl px-4 text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                    />
                    <input
                        type="text"
                        placeholder="Base URL (e.g., https://api.prod.com)"
                        value={newEnv.base_url}
                        onChange={(e) => setNewEnv({ ...newEnv, base_url: e.target.value })}
                        className="w-full h-12 bg-zinc-950 border border-white/5 rounded-xl px-4 text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                    />
                    <textarea
                        placeholder='Variables (JSON, e.g., {"apiKey": "xyz"})'
                        value={newEnv.variables}
                        onChange={(e) => setNewEnv({ ...newEnv, variables: e.target.value })}
                        className="w-full h-24 bg-zinc-950 border border-white/5 rounded-xl p-4 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                    />
                    <div className="flex gap-3">
                        <Button onClick={handleCreate} className="bg-brand-500 hover:bg-brand-400 text-black font-bold">
                            Create
                        </Button>
                        <Button onClick={() => setShowCreate(false)} variant="outline" className="border-white/5 text-zinc-400">
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            {/* Environment List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {environments.map((env) => (
                    <div
                        key={env.id}
                        className={cn(
                            "p-6 rounded-2xl border transition-all cursor-pointer group",
                            env.is_active
                                ? "bg-brand-500/5 border-brand-500/20"
                                : "bg-zinc-900/30 border-white/5 hover:border-white/10"
                        )}
                        onClick={() => !env.is_active && handleSetActive(env.id!)}
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                                <div className="text-sm font-black uppercase tracking-widest text-white mb-1">{env.name}</div>
                                <div className="text-xs text-zinc-500 font-mono break-all">{env.base_url}</div>
                            </div>
                            {env.is_active && (
                                <div className="h-6 w-6 rounded-full bg-brand-500 flex items-center justify-center">
                                    <Check size={14} className="text-black" />
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(env.id!);
                                }}
                                className="h-8 px-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/20 transition-all"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
