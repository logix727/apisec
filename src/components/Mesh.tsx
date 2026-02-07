import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Asset } from "../types";
import { Globe, ZoomIn, ZoomOut, RefreshCw, Maximize2, ShieldAlert, ShieldCheck, Zap } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

interface Node {
    id: string;
    label: string;
    type: "root" | "domain" | "asset";
    x: number;
    y: number;
    vx: number;
    vy: number;
    findings: number;
    color?: string;
}

interface Link {
    source: string;
    target: string;
}

export default function Mesh() {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [links, setLinks] = useState<Link[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [zoom, setZoom] = useState(1);
    const requestRef = useRef<number>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await invoke<Asset[]>("get_assets");
            processMesh(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const processMesh = (assets: Asset[]) => {
        const newNodes: Node[] = [];
        const newLinks: Link[] = [];
        const domains = new Set<string>();

        // Center Root Node
        newNodes.push({
            id: "API_GATEWAY",
            label: "GATEWAY",
            type: "root",
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            findings: 0
        });

        assets.forEach(asset => {
            let domain = "unknown";
            try {
                domain = new URL(asset.url).hostname;
            } catch {
                domain = asset.url.split('/')[0];
            }

            if (!domains.has(domain)) {
                domains.add(domain);
                newNodes.push({
                    id: domain,
                    label: domain,
                    type: "domain",
                    x: (Math.random() - 0.5) * 400,
                    y: (Math.random() - 0.5) * 400,
                    vx: 0,
                    vy: 0,
                    findings: 0
                });
                newLinks.push({ source: "API_GATEWAY", target: domain });
            }

            const nodeId = asset.id.toString();
            newNodes.push({
                id: nodeId,
                label: asset.url.replace(/https?:\/\//, '').split('/').pop() || asset.url,
                type: "asset",
                x: (Math.random() - 0.5) * 800,
                y: (Math.random() - 0.5) * 800,
                vx: 0,
                vy: 0,
                findings: asset.findings_count || 0,
                color: (asset.findings_count || 0) > 0 ? "#ef4444" : "#22c55e"
            });
            newLinks.push({ source: domain, target: nodeId });
        });

        setNodes(newNodes);
        setLinks(newLinks);
    };

    useEffect(() => {
        loadData();
    }, []);

    // Simple Force-Directed Graph Simulation
    const animate = () => {
        setNodes(prevNodes => {
            const nextNodes = [...prevNodes];
            const k = 0.05; // Force constant
            const repulsion = 1500;
            const centerForce = 0.01;

            // Apply repulsion between all pairs
            for (let i = 0; i < nextNodes.length; i++) {
                for (let j = i + 1; j < nextNodes.length; j++) {
                    const dx = nextNodes[i].x - nextNodes[j].x;
                    const dy = nextNodes[i].y - nextNodes[j].y;
                    const distance = Math.sqrt(dx * dx + dy * dy) + 1;
                    const force = repulsion / (distance * distance);
                    const fx = (dx / distance) * force;
                    const fy = (dy / distance) * force;

                    nextNodes[i].vx += fx;
                    nextNodes[i].vy += fy;
                    nextNodes[j].vx -= fx;
                    nextNodes[j].vy -= fy;
                }
            }

            // Apply attraction for links
            links.forEach(link => {
                const source = nextNodes.find(n => n.id === link.source);
                const target = nextNodes.find(n => n.id === link.target);
                if (source && target) {
                    const dx = target.x - source.x;
                    const dy = target.y - source.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const force = distance * k;
                    const fx = (dx / distance) * force;
                    const fy = (dy / distance) * force;

                    source.vx += fx;
                    source.vy += fy;
                    target.vx -= fx;
                    target.vy -= fy;
                }
            });

            // Apply center force and update positions
            nextNodes.forEach(node => {
                node.vx -= node.x * centerForce;
                node.vy -= node.y * centerForce;

                // Friction
                node.vx *= 0.9;
                node.vy *= 0.9;

                node.x += node.vx;
                node.y += node.vy;
            });

            return nextNodes;
        });

        requestRef.current = requestAnimationFrame(animate);
    };

    useEffect(() => {
        if (nodes.length > 0) {
            requestRef.current = requestAnimationFrame(animate);
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [nodes.length > 0]); // Only restart if nodes count changes

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-16 w-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin shadow-[0_0_20px_theme('colors.brand.500')]" />
                    <p className="text-zinc-500 font-black uppercase tracking-widest animate-pulse">Mapping Neural Attack Surface...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full gap-8 animate-in fade-in duration-700">
            <div className="flex items-center justify-between shrink-0">
                <div className="space-y-1">
                    <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic flex items-center gap-4">
                        <Zap className="text-brand-400 h-8 w-8" />
                        Attack Mesh Visualizer
                    </h2>
                    <p className="text-zinc-500 font-medium">Interactive topology of discovered API infrastructure and risk clusters.</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-zinc-900/50 border border-white/5 p-1 rounded-xl">
                        <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} className="p-2 hover:bg-white/5 rounded-lg text-zinc-500 hover:text-white transition-colors">
                            <ZoomOut size={18} />
                        </button>
                        <div className="px-2 text-[10px] font-black font-mono text-zinc-600 uppercase">{(zoom * 100).toFixed(0)}%</div>
                        <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-2 hover:bg-white/5 rounded-lg text-zinc-500 hover:text-white transition-colors">
                            <ZoomIn size={18} />
                        </button>
                    </div>
                    <Button variant="outline" onClick={loadData} className="border-white/5 bg-zinc-900/40 backdrop-blur-md">
                        <RefreshCw className="mr-2 h-4 w-4" /> Reset Layout
                    </Button>
                    <Button className="bg-brand-500 hover:bg-brand-400 text-black font-black">
                        <Maximize2 className="mr-2 h-4 w-4" /> Fullscreen
                    </Button>
                </div>
            </div>

            <div className="flex-1 relative glass rounded-[48px] border border-white/5 overflow-hidden group/mesh shadow-2xl">
                {/* Graph Canvas */}
                <div
                    className="absolute inset-0 cursor-grab active:cursor-grabbing"
                    style={{ transform: `scale(${zoom})`, transition: 'transform 0.2s ease-out' }}
                >
                    <svg className="w-full h-full overflow-visible" viewBox="-1000 -1000 2000 2000">
                        {/* Links */}
                        {links.map((link, i) => {
                            const source = nodes.find(n => n.id === link.source);
                            const target = nodes.find(n => n.id === link.target);
                            if (!source || !target) return null;
                            return (
                                <line
                                    key={i}
                                    x1={source.x}
                                    y1={source.y}
                                    x2={target.x}
                                    y2={target.y}
                                    stroke="currentColor"
                                    className="text-white/5 stroke-[1px]"
                                />
                            );
                        })}

                        {/* Nodes */}
                        {nodes.map((node) => (
                            <g
                                key={node.id}
                                transform={`translate(${node.x},${node.y})`}
                                onClick={() => setSelectedNode(node)}
                                className="cursor-pointer group/node"
                            >
                                <circle
                                    r={node.type === 'root' ? 12 : node.type === 'domain' ? 8 : 4}
                                    fill={node.color || (node.type === 'root' ? "#3b82f6" : "#6366f1")}
                                    className={cn(
                                        "transition-all duration-300",
                                        node.type === 'root' ? "shadow-[0_0_20px_theme('colors.blue.500')]" :
                                            node.findings > 0 ? "shadow-[0_0_15px_theme('colors.red.500')]" : ""
                                    )}
                                />
                                {node.type !== 'asset' && (
                                    <text
                                        y={-20}
                                        textAnchor="middle"
                                        className="text-[14px] font-black fill-zinc-500 uppercase tracking-widest pointer-events-none group-hover/node:fill-white transition-colors"
                                    >
                                        {node.label}
                                    </text>
                                )}
                            </g>
                        ))}
                    </svg>
                </div>

                {/* Legend & Stats Overlay */}
                <div className="absolute bottom-8 left-8 flex flex-col gap-4">
                    <div className="glass p-6 rounded-3xl border border-white/10 space-y-4 shadow-2xl backdrop-blur-3xl">
                        <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] italic">Mesh Integrity</h4>
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_theme('colors.green.500')]" />
                                <span className="text-[10px] font-bold text-zinc-300 uppercase">Secure Endpoints</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_theme('colors.red.500')]" />
                                <span className="text-[10px] font-bold text-zinc-300 uppercase">Threat Clusters</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Selected Node Inspector */}
                {selectedNode && (
                    <div className="absolute top-8 right-8 w-80 animate-in slide-in-from-right-8 duration-500">
                        <div className="glass p-8 rounded-[32px] border border-white/10 shadow-2xl space-y-6 backdrop-blur-3xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 blur-3xl rounded-full" />

                            <div className="flex items-center justify-between relative">
                                <div className="h-12 w-12 rounded-2xl bg-zinc-950 flex items-center justify-center border border-white/5">
                                    <Globe className="text-zinc-500" />
                                </div>
                                <button onClick={() => setSelectedNode(null)} className="text-zinc-500 hover:text-white transition-colors">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="space-y-1 relative">
                                <h4 className="text-lg font-black text-white uppercase tracking-tighter leading-tight">{selectedNode.label}</h4>
                                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Type: {selectedNode.type}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 relative">
                                <div className="p-4 rounded-2xl bg-zinc-950/50 border border-white/5">
                                    <span className="text-[10px] font-black text-zinc-600 uppercase">Risk Level</span>
                                    <div className="flex items-center gap-2 mt-1">
                                        {selectedNode.findings > 0 ? (
                                            <>
                                                <ShieldAlert className="h-3 w-3 text-red-500" />
                                                <span className="text-xs font-bold text-red-500">EXPOSED</span>
                                            </>
                                        ) : (
                                            <>
                                                <ShieldCheck className="h-3 w-3 text-green-500" />
                                                <span className="text-xs font-bold text-green-500">CLEAN</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="p-4 rounded-2xl bg-zinc-950/50 border border-white/5">
                                    <span className="text-[10px] font-black text-zinc-600 uppercase">Violations</span>
                                    <div className="text-sm font-black text-white mt-1">{selectedNode.findings}</div>
                                </div>
                            </div>

                            {selectedNode.findings > 0 && (
                                <div className="p-6 rounded-2xl bg-red-500/5 border border-red-500/10 text-xs text-red-400 font-bold leading-relaxed relative">
                                    Critical vulnerability clusters detected on this endpoint. Cluster analysis suggests possible PII exposure.
                                </div>
                            )}

                            <Button className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-black h-12 rounded-2xl shadow-lg shadow-indigo-500/20">
                                Trace Traffic
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function X({ className, size }: { className?: string, size?: number }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size || 24} height={size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
        </svg>
    );
}
