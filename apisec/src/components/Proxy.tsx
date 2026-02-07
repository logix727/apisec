import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Play, Square, Activity, Wifi, WifiOff, Terminal, Clock, ShieldAlert, Zap, Download, ShieldCheck } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { cn } from "../lib/utils";

interface TrafficEntry {
    method: string;
    url: string;
    status: number;
    timestamp: string;
    is_websocket?: boolean;
    captured_vulnerabilities?: number;
}

interface InterceptedItem {
    id: string;
    type: "request" | "response";
    method: string;
    url: string;
    status?: number;
    headers: Record<string, string>;
    body: string | null;
}

export default function Proxy() {
    const [isRunning, setIsRunning] = useState(false);
    const [traffic, setTraffic] = useState<TrafficEntry[]>([]);
    const [port] = useState(8080);
    const [isCaptureEnabled, setIsCaptureEnabled] = useState(false);
    const [isInterceptReqEnabled, setIsInterceptReqEnabled] = useState(false);
    const [isInterceptResEnabled, setIsInterceptResEnabled] = useState(false);
    const [heldItems, setHeldItems] = useState<InterceptedItem[]>([]);
    const [selectedHeld, setSelectedHeld] = useState<InterceptedItem | null>(null);
    const [editedItem, setEditedItem] = useState<InterceptedItem | null>(null);

    useEffect(() => {
        const unlistenTraffic = listen("proxy-traffic", (event: any) => {
            const payload = event.payload;
            const newEntry: TrafficEntry = {
                ...payload,
                timestamp: new Date().toLocaleTimeString()
            };
            setTraffic(prev => [newEntry, ...prev].slice(0, 50));
        });

        const unlistenInterceptReq = listen("proxy-intercept-request", (event: { payload: any }) => {
            const item: InterceptedItem = { ...event.payload, type: "request" };
            setHeldItems(prev => [...prev, item]);
            if (!selectedHeld) {
                setSelectedHeld(item);
                setEditedItem(JSON.parse(JSON.stringify(item)));
            }
        });

        const unlistenInterceptRes = listen("proxy-intercept-response", (event: { payload: any }) => {
            const item: InterceptedItem = { ...event.payload, type: "response" };
            setHeldItems(prev => [...prev, item]);
            if (!selectedHeld) {
                setSelectedHeld(item);
                setEditedItem(JSON.parse(JSON.stringify(item)));
            }
        });

        return () => {
            unlistenTraffic.then(f => f());
            unlistenInterceptReq.then(f => f());
            unlistenInterceptRes.then(f => f());
        };
    }, [selectedHeld]);

    const updateProxyConfig = async (capture: boolean, req: boolean, res: boolean) => {
        try {
            await invoke("set_proxy_interception_config", {
                captureBody: capture,
                interceptRequests: req,
                interceptResponses: res
            });
        } catch (e) {
            console.error(e);
        }
    };

    const handleResolve = async (id: string, action: any) => {
        try {
            await invoke("resolve_interception", { id, action });
            const nextHeld = heldItems.filter(r => r.id !== id);
            setHeldItems(nextHeld);
            if (nextHeld.length > 0) {
                setSelectedHeld(nextHeld[0]);
                setEditedItem(JSON.parse(JSON.stringify(nextHeld[0])));
            } else {
                setSelectedHeld(null);
                setEditedItem(null);
            }
        } catch (e) {
            alert(e);
        }
    };

    const handleDownloadCA = async () => {
        try {
            const pem = await invoke<string>("get_root_ca");
            const blob = new Blob([pem], { type: 'application/x-x509-ca-cert' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'apisec-root-ca.crt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (e) {
            alert(e);
        }
    };

    const toggleProxy = async () => {
        try {
            if (isRunning) {
                await invoke("stop_proxy_server");
                setIsRunning(false);
            } else {
                await invoke("start_proxy_server");
                setIsRunning(true);
            }
        } catch (e) {
            alert(e);
        }
    };

    return (
        <div className="flex flex-col h-full gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between shrink-0 border-b border-white/5 pb-6">
                <div className="flex items-center gap-4">
                    <div className={cn(
                        "h-12 w-12 rounded-2xl flex items-center justify-center border shadow-lg transition-all duration-500",
                        isRunning
                            ? "bg-green-500/10 border-green-500/20 shadow-green-500/10"
                            : "bg-zinc-500/10 border-white/5 shadow-zinc-500/5"
                    )}>
                        {isRunning ? <Wifi className="text-green-400 h-6 w-6 animate-pulse" /> : <WifiOff className="text-zinc-500 h-6 w-6" />}
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">Live Proxy Server</h2>
                        <p className="text-xs text-zinc-500 font-bold tracking-widest uppercase">Intercept & Record HTTP Traffic</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end mr-4">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Listening on</span>
                        <span className="text-sm font-bold text-white font-mono">127.0.0.1:{port}</span>
                    </div>
                    <Button
                        onClick={toggleProxy}
                        className={cn(
                            "h-12 px-8 font-black flex gap-3 items-center shadow-lg transition-all duration-300",
                            isRunning
                                ? "bg-red-500 hover:bg-red-400 text-white shadow-red-500/20"
                                : "bg-brand-500 hover:bg-brand-400 text-black shadow-brand-500/20"
                        )}
                    >
                        {isRunning ? <Square fill="currentColor" size={16} /> : <Play fill="currentColor" size={16} />}
                        {isRunning ? "STOP PROXY" : "START PROXY"}
                    </Button>
                </div>
            </div>

            <div className="flex flex-1 gap-6 min-h-0">
                {/* Control Panel */}
                <div className="w-1/3 flex flex-col gap-6">
                    <div className="glass-card space-y-4">
                        <div className="flex items-center gap-2">
                            <Activity className="text-brand-400 h-4 w-4" />
                            <h3 className="text-sm font-black text-white uppercase italic">Interception Engine</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 group hover:border-brand-500/30 transition-all cursor-pointer"
                                onClick={async () => {
                                    const next = !isCaptureEnabled;
                                    setIsCaptureEnabled(next);
                                    updateProxyConfig(next, isInterceptReqEnabled, isInterceptResEnabled);
                                }}>
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-white">Capture Body</span>
                                    <span className="text-[10px] text-zinc-500">Record full payloads for analysis</span>
                                </div>
                                <div className={cn(
                                    "h-6 w-10 rounded-full transition-all flex items-center p-1",
                                    isCaptureEnabled ? "bg-brand-500 justify-end" : "bg-zinc-800 justify-start"
                                )}>
                                    <div className="h-4 w-4 rounded-full bg-white shadow-sm" />
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 group hover:border-brand-500/30 transition-all cursor-pointer"
                                onClick={async () => {
                                    const next = !isInterceptReqEnabled;
                                    setIsInterceptReqEnabled(next);
                                    updateProxyConfig(isCaptureEnabled, next, isInterceptResEnabled);
                                }}>
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-white">Intercept Requests</span>
                                    <span className="text-[10px] text-zinc-500">Hold & Edit outgoing requests</span>
                                </div>
                                <div className={cn(
                                    "h-6 w-10 rounded-full transition-all flex items-center p-1",
                                    isInterceptReqEnabled ? "bg-accent-500 justify-end" : "bg-zinc-800 justify-start"
                                )}>
                                    <div className="h-4 w-4 rounded-full bg-white shadow-sm" />
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 group hover:border-brand-500/30 transition-all cursor-pointer"
                                onClick={async () => {
                                    const next = !isInterceptResEnabled;
                                    setIsInterceptResEnabled(next);
                                    updateProxyConfig(isCaptureEnabled, isInterceptReqEnabled, next);
                                }}>
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-white">Intercept Responses</span>
                                    <span className="text-[10px] text-zinc-500">Hold & Edit incoming responses</span>
                                </div>
                                <div className={cn(
                                    "h-6 w-10 rounded-full transition-all flex items-center p-1",
                                    isInterceptResEnabled ? "bg-purple-500 justify-end" : "bg-zinc-800 justify-start"
                                )}>
                                    <div className="h-4 w-4 rounded-full bg-white shadow-sm" />
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-white italic flex items-center gap-2">
                                        WebSockets <span className="bg-brand-500/10 text-brand-400 text-[8px] px-1.5 py-0.5 rounded leading-none uppercase">Live</span>
                                    </span>
                                    <span className="text-[10px] text-zinc-500">Capture binary & text frames</span>
                                </div>
                                <div className="h-6 w-10 rounded-full bg-brand-500 flex items-center justify-end p-1 opacity-50">
                                    <div className="h-4 w-4 rounded-full bg-white shadow-sm" />
                                </div>
                            </div>

                            <div
                                onClick={handleDownloadCA}
                                className="p-4 rounded-xl border border-brand-500/30 bg-brand-500/5 flex items-center justify-between group hover:bg-brand-500/10 transition-all cursor-pointer"
                            >
                                <div className="flex items-center gap-3">
                                    <ShieldCheck size={18} className="text-brand-400" />
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-white">Trust Root CA</span>
                                        <span className="text-[10px] text-zinc-500 italic">Generate & Download CRT</span>
                                    </div>
                                </div>
                                <Download size={14} className="text-brand-500 group-hover:translate-y-0.5 transition-transform" />
                            </div>
                        </div>
                    </div>

                    <div className="p-8 glass rounded-[32px] border border-brand-500/20 bg-brand-500/5 relative overflow-hidden group">
                        <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-brand-500/10 blur-[100px] rounded-full group-hover:bg-brand-500/20 transition-all duration-700" />
                        <div className="relative flex flex-col gap-4">
                            <h4 className="text-lg font-black text-white italic uppercase tracking-tight">Manual Config</h4>
                            <p className="text-sm text-zinc-400 leading-relaxed">
                                To capture web traffic, set your browser or system proxy to <span className="text-brand-400 font-mono font-bold">127.0.0.1:{port}</span>.
                                APISec will automatically scan all passing JSON traffic for secrets.
                            </p>
                            <div className="pt-4 flex gap-2">
                                <span className="px-3 py-1 bg-zinc-900 rounded-lg text-[10px] font-black text-brand-400 uppercase">HTTP OK</span>
                                <span className="px-3 py-1 bg-zinc-900 rounded-lg text-[10px] font-black text-brand-400 uppercase">HTTPS MITM</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Traffic Log */}
                <div className="flex-1 flex flex-col gap-4 min-h-0 relative">
                    {selectedHeld && editedItem && (
                        <div className="absolute inset-0 z-20 glass rounded-[32px] border border-accent-500/50 flex flex-col overflow-hidden animate-in zoom-in-95 duration-500 shadow-2xl shadow-accent-500/10">
                            <div className="p-6 border-b border-white/5 bg-accent-500/10 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "h-10 w-10 rounded-xl flex items-center justify-center shadow-lg shadow-accent-500/20",
                                        selectedHeld.type === "request" ? "bg-accent-500" : "bg-purple-500"
                                    )}>
                                        <Zap className="text-black h-5 w-5" />
                                    </div>
                                    <div className="flex flex-col">
                                        <h3 className="text-sm font-black text-white uppercase italic tracking-widest">
                                            Intercept {selectedHeld.type === "request" ? "Request" : "Response"}
                                        </h3>
                                        <span className="text-[10px] font-bold text-accent-400 uppercase tracking-widest">Awaiting Analyst Action...</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-zinc-500 uppercase">{heldItems.length} HELD</span>
                                    <Button
                                        onClick={() => handleResolve(selectedHeld.id, "Forward")}
                                        className="bg-green-500 hover:bg-green-400 text-black font-black h-9 px-6 rounded-lg shadow-lg shadow-green-500/20"
                                    >
                                        FORWARD
                                    </Button>
                                    <Button
                                        onClick={() => handleResolve(selectedHeld.id,
                                            selectedHeld.type === "request"
                                                ? { ModifyRequest: { method: editedItem.method, url: editedItem.url, headers: editedItem.headers, body: editedItem.body } }
                                                : { ModifyResponse: { status: editedItem.status || 200, headers: editedItem.headers, body: editedItem.body } }
                                        )}
                                        className="bg-accent-500 hover:bg-accent-400 text-black font-black h-9 px-6 rounded-lg shadow-lg shadow-accent-500/20"
                                    >
                                        MOD & FORWARD
                                    </Button>
                                    <Button
                                        onClick={() => handleResolve(selectedHeld.id, "Drop")}
                                        className="bg-red-500 hover:bg-red-400 text-white font-black h-9 px-6 rounded-lg"
                                    >
                                        DROP
                                    </Button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8 space-y-6">
                                {selectedHeld.type === "request" ? (
                                    <div className="grid grid-cols-6 gap-4">
                                        <div className="col-span-1">
                                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 block">Method</label>
                                            <input
                                                className="w-full h-10 bg-zinc-950 border border-white/5 rounded-lg px-3 text-xs font-black text-brand-400 focus:border-brand-500 outline-none"
                                                value={editedItem.method}
                                                onChange={e => setEditedItem({ ...editedItem, method: e.target.value })}
                                            />
                                        </div>
                                        <div className="col-span-5">
                                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 block">Request URL</label>
                                            <input
                                                className="w-full h-10 bg-zinc-950 border border-white/5 rounded-lg px-3 text-xs font-mono text-white focus:border-brand-500 outline-none"
                                                value={editedItem.url}
                                                onChange={e => setEditedItem({ ...editedItem, url: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-6 gap-4">
                                        <div className="col-span-1">
                                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 block">Status</label>
                                            <input
                                                type="number"
                                                className="w-full h-10 bg-zinc-950 border border-white/5 rounded-lg px-3 text-xs font-black text-green-400 focus:border-green-500 outline-none"
                                                value={editedItem.status}
                                                onChange={e => setEditedItem({ ...editedItem, status: parseInt(e.target.value) })}
                                            />
                                        </div>
                                        <div className="col-span-5">
                                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 block">Original URL</label>
                                            <div className="w-full h-10 bg-zinc-900/50 border border-white/5 rounded-lg px-3 text-xs font-mono text-zinc-500 flex items-center overflow-hidden truncate">
                                                {editedItem.url}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Payload (Body)</label>
                                    <textarea
                                        className="w-full h-64 bg-zinc-950 border border-white/5 rounded-2xl p-6 text-sm font-mono text-zinc-300 focus:ring-1 focus:ring-accent-500/50 outline-none resize-none"
                                        value={editedItem.body || ""}
                                        onChange={e => setEditedItem({ ...editedItem, body: e.target.value })}
                                        placeholder="No body present..."
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {!isRunning && (
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-10 flex items-center justify-center rounded-[32px] animate-in fade-in duration-300">
                            <div className="flex flex-col items-center gap-4">
                                <WifiOff size={48} className="text-zinc-600" />
                                <span className="text-sm font-black text-zinc-500 italic uppercase">Server Offline</span>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 glass rounded-[32px] border border-white/5 flex flex-col overflow-hidden shadow-2xl">
                        <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-4">
                                <Terminal className="text-brand-400 h-5 w-5" />
                                <h3 className="text-sm font-black text-white italic uppercase tracking-widest">Traffic Feed</h3>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-500">{traffic.length} events recorded</span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {traffic.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-20 gap-4">
                                    <Activity size={64} className="text-zinc-700" />
                                    <p className="text-zinc-500 font-black uppercase tracking-tighter text-2xl italic">No Traffic Detected</p>
                                </div>
                            ) : (
                                traffic.map((entry, i) => (
                                    <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-950/50 border border-white/5 hover:border-brand-500/30 transition-all group animate-in slide-in-from-right-2 duration-300">
                                        <div className={cn(
                                            "px-3 py-1 rounded-lg text-xs font-black w-20 text-center uppercase tracking-tighter",
                                            entry.is_websocket ? "bg-purple-500/10 text-purple-400" :
                                                entry.method === "POST" ? "bg-orange-500/10 text-orange-400" :
                                                    entry.method === "GET" ? "bg-blue-500/10 text-blue-400" :
                                                        "bg-zinc-800 text-zinc-400"
                                        )}>
                                            {entry.is_websocket ? "WS UP" : entry.method}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-mono text-white truncate group-hover:text-brand-400 transition-colors flex items-center gap-2">
                                                {entry.is_websocket && <Zap size={10} className="text-purple-400 shrink-0" />}
                                                {entry.url}
                                            </div>
                                        </div>
                                        <div className={cn(
                                            "px-2 py-0.5 rounded text-[10px] font-black font-mono",
                                            entry.status < 300 ? "text-green-500" : "text-red-500"
                                        )}>
                                            {entry.status}
                                        </div>
                                        {entry.captured_vulnerabilities && entry.captured_vulnerabilities > 0 ? (
                                            <div className="px-2 py-0.5 rounded bg-red-500/10 text-red-500 text-[10px] font-black flex items-center gap-1 animate-pulse">
                                                <ShieldAlert size={10} />
                                                {entry.captured_vulnerabilities}
                                            </div>
                                        ) : null}
                                        <div className="text-[10px] font-mono text-zinc-600 flex items-center gap-1">
                                            <Clock size={10} />
                                            {entry.timestamp}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
