"use client";
import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { 
  Cpu, BarChart3, Loader2, Play, Sparkles, 
  RotateCcw, ClipboardPaste, Trash2, Zap
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, 
  ResponsiveContainer, Cell, CartesianGrid 
} from 'recharts';

export default function Home() {
  const [input, setInput] = useState<string>('# วางโค้ด Python หรือ Prompt สำหรับงานคำนวณที่นี่...');
  const [isSingleRunning, setIsSingleRunning] = useState(false);
  const [isClusterRunning, setIsClusterRunning] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'optimizing'>('idle');
  const [isCopied, setIsCopied] = useState(false);

  const [original, setOriginal] = useState({ output: '', time: 0 });
  const [cluster, setCluster] = useState({ code: '', output: '', time: 0 });
  const [benchmarkData, setBenchmarkData] = useState<any[]>([]);

  // อัปเดตกราฟเปรียบเทียบ
  const updateBenchmark = (singleTime: number, clusterTime: number) => {
    const data = [];
    if (singleTime > 0) data.push({ name: 'Single Core', time: singleTime, fill: '#64748b' });
    if (clusterTime > 0) data.push({ name: 'Cluster (4-Core)', time: clusterTime, fill: '#2563eb' });
    setBenchmarkData(data);
  };

  const handleClearCode = () => {
    setInput('# วางโค้ด Python หรือ Prompt สำหรับงานคำนวณที่นี่...');
    setCluster({ code: '', output: '', time: 0 });
    setOriginal({ output: '', time: 0 });
    setBenchmarkData([]);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setInput(text);
    } catch (err) { alert("กรุณากด Ctrl+V"); }
  };

  // API 1: Optimize Code (AI สร้างโค้ดทั้ง Single และ Cluster เก็บไว้ที่ Backend)
  const handleOptimize = async () => {
    if (!input || input.length < 5) return;
    setAiStatus('optimizing');
    try {
      const response = await fetch('http://localhost:8080/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: input }),
      });
      const data = await response.json();
      if (data.optimized_code) {
        setCluster(prev => ({ ...prev, code: data.optimized_code }));
        alert("AI เตรียมโค้ดเสร็จแล้ว! สามารถกดรันได้ทั้งสองฝั่ง");
      }
    } catch (error) {
      alert("Error: ติดต่อ Server ไม่ได้");
    } finally {
      setAiStatus('idle');
    }
  };

  // API 2: Run Single Core (รันโค้ดที่ Optimize ไว้สำหรับ Single Core)
  const runSingle = async () => {
    if (!cluster.code) return alert("กรุณากด Optimize ก่อน เพื่อให้ AI เตรียมโค้ด");
    setIsSingleRunning(true);
    try {
      const res = await fetch('http://localhost:8080/api/run/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      
      // ดึงค่า Result และ Time จาก Output ด้วย Regex
      const timeMatch = data.output.match(/Time taken: ([\d.]+) seconds/);
      const time = timeMatch ? parseFloat(timeMatch[1]) : 0;
      const resultMatch = data.output.match(/Result: .*/);
      const resultTxt = resultMatch ? resultMatch[0] : "No Result Found";

      setOriginal({ output: resultTxt, time: time });
      updateBenchmark(time, cluster.time);
    } catch (error) {
      alert("Single Core Execution Error");
    } finally {
      setIsSingleRunning(false);
    }
  };

  // API 3: Run Cluster (รันโค้ดที่ Optimize ไว้สำหรับ Cluster/MPI)
  const runCluster = async () => {
    if (!cluster.code) return alert("กรุณากด Optimize ก่อน");
    setIsClusterRunning(true);
    try {
      const res = await fetch('http://localhost:8080/api/run/cluster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      const timeMatch = data.output.match(/Time taken: ([\d.]+) seconds/);
      const time = timeMatch ? parseFloat(timeMatch[1]) : 0;
      const resultMatch = data.output.match(/Result: .*/);
      const resultTxt = resultMatch ? resultMatch[0] : "No Result Found";

      setCluster(prev => ({ ...prev, output: resultTxt, time: time }));
      updateBenchmark(original.time, time);
    } catch (error) {
      alert("Cluster Execution Error");
    } finally {
      setIsClusterRunning(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] p-6 text-slate-900 font-sans">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6 bg-slate-900 rounded-2xl p-6 flex justify-between items-center shadow-xl border border-slate-800">
        <div className="flex items-center gap-4 text-white">
          <Cpu className="text-blue-400" size={32} />
          <h1 className="text-2xl font-black italic uppercase tracking-tight">Faster Processor</h1>
        </div>
        <button onClick={() => window.location.reload()} className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 px-5 rounded-xl transition-all flex items-center gap-2 border border-slate-700">
          <RotateCcw size={18} /> RESET SYSTEM
        </button>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-2 gap-6">
        {/* Left Side: Input & Single Core Run */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden relative">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Input (Code/Prompt)</span>
              <div className="flex gap-2">
                <button onClick={handleClearCode} className="text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors"><Trash2 size={14}/></button>
                <button onClick={handlePaste} className="bg-white border border-slate-300 text-slate-600 text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm active:bg-slate-50 transition-colors"><ClipboardPaste size={12} /> PASTE</button>
                <button onClick={runSingle} disabled={isSingleRunning || !cluster.code} className="bg-slate-700 hover:bg-slate-800 text-white text-[10px] font-bold px-4 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-40 transition-all">
                  {isSingleRunning ? <Loader2 className="animate-spin" size={12}/> : <Play size={12} />} RUN SINGLE
                </button>
              </div>
            </div>
            <Editor height="400px" defaultLanguage="python" value={input} onChange={(v) => setInput(v || '')} options={{ minimap: { enabled: false }, fontSize: 13, padding: {top: 10} }} />
            
            {/* Optimization Button (Floating) */}
            <div className="absolute top-1/2 right-4 -translate-y-1/2 z-10">
               <button onClick={handleOptimize} disabled={aiStatus !== 'idle'} className="bg-indigo-600 text-white p-4 rounded-full shadow-2xl hover:bg-indigo-500 hover:scale-110 transition-all active:scale-90 disabled:opacity-50 group border-4 border-white">
                  {aiStatus === 'optimizing' ? <Loader2 className="animate-spin" size={24}/> : <Sparkles className="group-hover:rotate-12 transition-transform" size={24}/>}
               </button>
            </div>
          </div>
          
          <div className="bg-[#0d1117] p-5 rounded-2xl text-xs text-green-400 min-h-[100px] border border-slate-800 shadow-inner">
            <div className="flex justify-between items-center mb-2">
              <p className="text-slate-500 text-[9px] font-bold uppercase tracking-widest">Single Core Console</p>
              {original.time > 0 && <span className="bg-green-500/10 text-green-500 px-2 py-0.5 rounded text-[10px]">{original.time.toFixed(4)}s</span>}
            </div>
            <p className="font-mono leading-relaxed">{original.output || "> System idle. Optimize then run single core..."}</p>
          </div>
        </div>

        {/* Right Side: Cluster Code & Cluster Run */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden relative">
            <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex justify-between items-center">
              <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Optimized Cluster (MPI)</span>
              <div className="flex gap-2">
                {cluster.code && (
                  <button onClick={() => { navigator.clipboard.writeText(cluster.code); setIsCopied(true); setTimeout(()=>setIsCopied(false),2000)}} className="text-blue-600 text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
                    {isCopied ? "COPIED!" : "COPY CODE"}
                  </button>
                )}
                <button onClick={runCluster} disabled={isClusterRunning || !cluster.code} className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-4 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-40 transition-all">
                  {isClusterRunning ? <Loader2 className="animate-spin" size={12}/> : <Zap size={12} />} RUN CLUSTER
                </button>
              </div>
            </div>
            <Editor height="400px" defaultLanguage="python" value={cluster.code} options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, padding: {top: 10} }} />
          </div>

          <div className="bg-[#0d1117] p-5 rounded-2xl text-xs text-blue-400 min-h-[100px] border border-slate-800 shadow-inner">
            <div className="flex justify-between items-center mb-2">
              <p className="text-slate-500 text-[9px] font-bold uppercase tracking-widest">Cluster MPI Console</p>
              {cluster.time > 0 && <span className="bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded text-[10px]">{cluster.time.toFixed(4)}s</span>}
            </div>
            <p className="font-mono leading-relaxed">{cluster.output || "> Waiting for AI optimization..."}</p>
          </div>
        </div>
      </div>

      {/* Benchmark Graph */}
      <div className="max-w-7xl mx-auto mt-6 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <BarChart3 size={18} className="text-indigo-500" /> Performance Analysis
          </h3>
          {benchmarkData.length === 2 && (
            <div className="text-[10px] font-bold text-slate-500">
              SPEEDUP: <span className="text-blue-600">{(benchmarkData[0].time / benchmarkData[1].time).toFixed(2)}x Faster</span>
            </div>
          )}
        </div>
        
        <div className="h-[250px]">
          {benchmarkData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={benchmarkData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} />
                <YAxis scale="log" domain={['auto', 'auto']} hide />
                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="time" radius={[12, 12, 12, 12]} barSize={80}>
                  {benchmarkData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
              <BarChart3 size={40} className="opacity-20" />
              <p className="italic text-sm">Run both modes to compare parallel efficiency.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}