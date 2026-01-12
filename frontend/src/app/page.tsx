"use client";
import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { 
  Cpu, BarChart3, Loader2, Play, Sparkles, 
  RotateCcw, ClipboardPaste, Trash2, Zap, TrendingUp, Timer, Activity
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, 
  ResponsiveContainer, Cell, CartesianGrid, LabelList
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

  // ฟังก์ชันสำหรับล้างค่าผลลัพธ์การรันทั้งหมด
  const clearExecutionData = () => {
    setOriginal({ output: '', time: 0 });
    setCluster({ code: '', output: '', time: 0 });
    setBenchmarkData([]);
  };

  const updateBenchmark = (singleTime: number, clusterTime: number) => {
    const data = [];
    if (singleTime > 0) data.push({ name: 'Single Core', time: singleTime, fill: '#94a3b8' });
    if (clusterTime > 0) data.push({ name: 'Cluster (12-Core)', time: clusterTime, fill: '#2563eb' });
    setBenchmarkData(data);
  };

  const handleClearCode = () => {
    setInput('# วางโค้ด Python หรือ Prompt สำหรับงานคำนวณที่นี่...');
    clearExecutionData();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInput(text);
        clearExecutionData(); // ล้างค่าทันทีเมื่อมีการวางโค้ดใหม่
      }
    } catch (err) { alert("กรุณากด Ctrl+V"); }
  };

  const handleInputChange = (value: string | undefined) => {
    setInput(value || '');
    // ถ้ามีการแก้ไขโค้ด ให้ล้างผลลัพธ์การรันเก่าออกเพื่อป้องกันข้อมูลผิดพลาด
    if (original.time > 0 || cluster.time > 0) {
      clearExecutionData();
    }
  };

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
        alert("AI เตรียมโค้ดและส่งไปยัง Cluster สำเร็จ! พร้อมรันแล้ว");
      }
    } catch (error) {
      alert("Error: ไม่สามารถเชื่อมต่อกับ Server ได้");
    } finally {
      setAiStatus('idle');
    }
  };

  const runSingle = async () => {
    if (!cluster.code) return alert("กรุณากด Optimize ก่อน");
    setIsSingleRunning(true);
    try {
      const res = await fetch('http://localhost:8080/api/run/single', { method: 'POST' });
      const data = await res.json();
      const timeMatch = data.output.match(/Time taken: ([\d.]+) seconds/);
      const time = timeMatch ? parseFloat(timeMatch[1]) : 0;
      const resultMatch = data.output.match(/Result: .*/);
      const resultTxt = resultMatch ? resultMatch[0] : "No Result Found";

      setOriginal({ output: resultTxt, time: time });
      updateBenchmark(time, cluster.time);
    } catch (error) {
      alert("Single Core Error");
    } finally {
      setIsSingleRunning(false);
    }
  };

  const runCluster = async () => {
    if (!cluster.code) return alert("กรุณากด Optimize ก่อน");
    setIsClusterRunning(true);
    try {
      const res = await fetch('http://localhost:8080/api/run/cluster', { method: 'POST' });
      const data = await res.json();
      const timeMatch = data.output.match(/Time taken: ([\d.]+) seconds/);
      const time = timeMatch ? parseFloat(timeMatch[1]) : 0;
      const resultMatch = data.output.match(/Result: .*/);
      const resultTxt = resultMatch ? resultMatch[0] : "No Result Found";

      setCluster(prev => ({ ...prev, output: resultTxt, time: time }));
      updateBenchmark(original.time, time);
    } catch (error) {
      alert("Cluster Error");
    } finally {
      setIsClusterRunning(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f1f5f9] p-8 text-slate-900 font-sans">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8 bg-slate-900 rounded-3xl p-8 flex justify-between items-center shadow-2xl border border-slate-800">
        <div className="flex items-center gap-6 text-white">
          <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-500/20">
            <Cpu size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black italic uppercase tracking-tighter">Faster Processor</h1>
            <p className="text-slate-400 text-xs font-bold tracking-[0.2em]">RPI CLUSTER COMPUTING ENGINE</p>
          </div>
        </div>
        <button onClick={handleClearCode} className="bg-slate-800 hover:bg-red-500/10 hover:text-red-500 text-slate-400 font-black py-3 px-6 rounded-2xl transition-all flex items-center gap-2 border border-slate-700">
          <Trash2 size={18} /> PURGE SESSION
        </button>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Side: Input */}
        <div className="space-y-6">
          <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden relative">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Input Task / Prompt</span>
              <div className="flex gap-3">
                <button onClick={handlePaste} className="bg-white border border-slate-200 text-slate-600 text-[10px] font-bold px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all">
                  <ClipboardPaste size={14} /> PASTE
                </button>
                <button onClick={runSingle} disabled={isSingleRunning || !cluster.code} className="bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black px-6 py-2 rounded-xl flex items-center gap-2 shadow-xl disabled:opacity-20 transition-all active:scale-95">
                  {isSingleRunning ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />} RUN SINGLE
                </button>
              </div>
            </div>
            <Editor 
              height="450px" 
              defaultLanguage="python" 
              value={input} 
              onChange={handleInputChange} 
              options={{ minimap: { enabled: false }, fontSize: 14, padding: { top: 20 }, fontFamily: 'JetBrains Mono' }} 
            />
            
            <div className="absolute top-1/2 right-6 -translate-y-1/2 z-10">
              <button onClick={handleOptimize} disabled={aiStatus !== 'idle'} className="bg-indigo-600 text-white p-6 rounded-full shadow-[0_0_50px_-12px_rgba(79,70,229,0.5)] hover:bg-indigo-500 hover:scale-110 transition-all active:scale-90 disabled:opacity-50 border-[6px] border-white">
                {aiStatus === 'optimizing' ? <Loader2 className="animate-spin" size={28} /> : <Sparkles size={28} />}
              </button>
            </div>
          </div>

          <div className="bg-[#0f172a] p-6 rounded-[2rem] text-sm text-emerald-400 min-h-[120px] border border-slate-800 shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/30"></div>
             <div className="flex justify-between items-center mb-4">
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Single Core Output</p>
              {original.time > 0 && <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-black">{original.time.toFixed(4)}s</span>}
            </div>
            <p className="font-mono leading-relaxed opacity-90">{original.output || "> Ready to execute single-core task..."}</p>
          </div>
        </div>

        {/* Right Side: Cluster Output */}
        <div className="space-y-6">
          <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden relative">
            <div className="bg-blue-50 px-6 py-4 border-b border-blue-100 flex justify-between items-center">
              <span className="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em]">Optimized Cluster (MPI)</span>
              <button onClick={runCluster} disabled={isClusterRunning || !cluster.code} className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black px-6 py-2 rounded-xl flex items-center gap-2 shadow-xl shadow-blue-500/20 disabled:opacity-20 transition-all active:scale-95">
                {isClusterRunning ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} />} RUN CLUSTER
              </button>
            </div>
            <Editor height="450px" defaultLanguage="python" value={cluster.code} options={{ readOnly: true, minimap: { enabled: false }, fontSize: 14, padding: { top: 20 }, fontFamily: 'JetBrains Mono' }} />
          </div>

          <div className="bg-[#0f172a] p-6 rounded-[2rem] text-sm text-blue-400 min-h-[120px] border border-slate-800 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/30"></div>
            <div className="flex justify-between items-center mb-4">
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Cluster Node Output</p>
              {cluster.time > 0 && <span className="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full text-[10px] font-black">{cluster.time.toFixed(4)}s</span>}
            </div>
            <p className="font-mono leading-relaxed opacity-90">{cluster.output || "> Cluster idle. Waiting for optimization..."}</p>
          </div>
        </div>
      </div>

      {/* Benchmark Graph Section */}
      <div className="max-w-7xl mx-auto mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Comparison Stats */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-4 mb-4 text-blue-600">
               <TrendingUp size={20} />
               <span className="text-[11px] font-black uppercase tracking-widest">Speedup Analysis</span>
            </div>
            {benchmarkData.length === 2 ? (
              <div>
                <h2 className="text-5xl font-black text-slate-900 mb-1">
                  {(benchmarkData[0].time / benchmarkData[1].time).toFixed(2)}<span className="text-2xl text-blue-600">x</span>
                </h2>
                <p className="text-slate-400 text-[10px] font-bold">FASTER THAN SINGLE CORE</p>
              </div>
            ) : (
              <p className="text-slate-300 text-xs italic">Run both modes to see speedup.</p>
            )}
          </div>

          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl">
            <div className="flex items-center gap-4 mb-4 text-emerald-400">
               <Activity size={20} />
               <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Node Efficiency</span>
            </div>
            {benchmarkData.length === 2 ? (
              <div>
                <h2 className="text-4xl font-black text-white mb-1">
                  {((benchmarkData[0].time / benchmarkData[1].time) / 12 * 100).toFixed(1)}<span className="text-xl text-emerald-400">%</span>
                </h2>
                <p className="text-slate-500 text-[10px] font-bold">12-CORE SCALING FACTOR</p>
              </div>
            ) : (
              <p className="text-slate-600 text-xs italic">Waiting for execution...</p>
            )}
          </div>
        </div>

        {/* Real-time Graph */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-50 p-2 rounded-xl text-indigo-600">
                <BarChart3 size={20} />
              </div>
              <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Execution Latency (Seconds)</h3>
            </div>
          </div>
          
          <div className="h-[250px] w-full">
            {benchmarkData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={benchmarkData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} />
                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="time" radius={[12, 12, 12, 12]} barSize={80}>
                    <LabelList dataKey="time" position="top" formatter={(v: any) => `${v.toFixed(3)}s`} style={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }} />
                    {benchmarkData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} fillOpacity={index === 0 ? 0.3 : 1} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4">
                <Timer size={48} className="opacity-20 animate-pulse" />
                <p className="text-sm font-bold tracking-widest uppercase opacity-30">Waiting for Benchmark</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}