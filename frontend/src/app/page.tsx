"use client";
import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Cpu, BarChart3, Loader2, Play, Timer, Copy, Check, Sparkles, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';

export default function Home() {
  const [code, setCode] = useState<string>('# วางโค้ด Python ของคุณที่นี่...');
  const [status, setStatus] = useState<'idle' | 'processing'>('idle');
  const [aiStatus, setAiStatus] = useState<'idle' | 'optimizing'>('idle');
  const [isCopied, setIsCopied] = useState(false);
  
  const [original, setOriginal] = useState({ output: '', time: 0 });
  const [cluster, setCluster] = useState({ code: '', output: '', time: 0 });
  const [benchmarkData, setBenchmarkData] = useState<any[]>([]);

  // --- 1. ฟังก์ชันเรียก AI เมื่อกดปุ่มเท่านั้น ---
  const handleOptimize = async () => {
    if (!code || code.length < 5) return;
    setAiStatus('optimizing');
    try {
      const response = await fetch('http://localhost:8080/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code, mode: 'cluster', onlyOptimize: true }), 
      });
      const data = await response.json();
      if (data.optimized_code) {
        setCluster(prev => ({ ...prev, code: data.optimized_code }));
      } else if (data.error) {
        alert("AI Error: " + data.error);
      }
    } catch (error) {
      alert("ไม่สามารถติดต่อ AI ได้");
    } finally {
      setAiStatus('idle');
    }
  };

  const handleRunBenchmark = async () => {
    if (!cluster.code) {
      alert("กรุณากดแปลงโค้ด (Optimize) ก่อนรัน Cluster");
      return;
    }
    setStatus('processing');
    try {
      // รัน Single Core
      const resSingle = await fetch('http://localhost:8080/deploy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code, mode: 'single' }),
      });
      const dataSingle = await resSingle.json();
      const timeSingle = parseFloat(dataSingle.output.match(/Time taken: ([\d.]+) seconds/)?.[1] || "0");
      setOriginal({ output: dataSingle.output.match(/Result: .*/)?.[0] || "No result", time: timeSingle });

      // รัน Cluster (ใช้โค้ดที่ AI แปลงไว้แล้ว)
      const resCluster = await fetch('http://localhost:8080/deploy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cluster.code, mode: 'cluster_run_only' }),
      });
      const dataCluster = await resCluster.json();
      const timeCluster = parseFloat(dataCluster.output.match(/Time taken: ([\d.]+) seconds/)?.[1] || "0");
      setCluster(prev => ({ ...prev, output: dataCluster.output.match(/Result: .*/)?.[0] || "No result", time: timeCluster }));

      setBenchmarkData([
        { name: 'Single Core', time: timeSingle, fill: '#64748b' },
        { name: '12-Core Cluster', time: timeCluster, fill: '#2563eb' }
      ]);
    } catch (error) {
      alert("Execution Err or: " + error);
    } finally {
      setStatus('idle');
    }
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6 bg-slate-900 rounded-2xl p-6 flex justify-between items-center shadow-lg border border-slate-800">
        <div className="flex items-center gap-4 text-white">
          <Cpu className="text-blue-400" size={32} />
          <h1 className="text-2xl font-black italic uppercase">Faster Processor</h1>
        </div>
        <button 
          onClick={handleRunBenchmark} 
          disabled={status !== 'idle' || !cluster.code}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-xl shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
        >
          {status === 'processing' ? <Loader2 className="animate-spin" size={20} /> : <Play size={20} />}
          START BENCHMARK
        </button>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-2 gap-6">
        {/* Left: Input & Optimize Button */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden relative">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
              <span className="text-[10px] font-black text-slate-400 uppercase">OriginalCode.py</span>
              <button 
                onClick={handleOptimize}
                disabled={aiStatus !== 'idle'}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
              >
                {aiStatus === 'optimizing' ? <RefreshCw className="animate-spin" size={12}/> : <Sparkles size={12}/>}
                OPTIMIZE FOR CLUSTER
              </button>
            </div>
            <Editor height="350px" defaultLanguage="python" value={code} onChange={(v) => setCode(v || '')} options={{ minimap: { enabled: false }, fontSize: 13 }} />
          </div>
          <div className="bg-[#0d1117] p-4 rounded-xl text-xs text-green-400 min-h-[80px] border border-slate-800">
            <p className="text-slate-500 text-[9px] mb-2 font-bold uppercase tracking-widest">Single Core Output:</p>
            {original.output || "> Ready to test..."}
          </div>
        </div>

        {/* Right: AI Result (Read Only) */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden relative">
            <div className="bg-blue-50 px-4 py-2 border-b border-blue-100 flex justify-between items-center">
              <span className="text-[10px] font-black text-blue-600 uppercase">ClusterCode.py (Generated)</span>
              {cluster.code && (
                <button 
                  onClick={() => {navigator.clipboard.writeText(cluster.code); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000)}}
                  className="text-[10px] font-bold text-blue-600 bg-white border border-blue-200 px-2 py-1 rounded"
                >
                  {isCopied ? "COPIED" : "COPY"}
                </button>
              )}
            </div>
            <Editor height="350px" defaultLanguage="python" value={cluster.code} options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }} />
          </div>
          <div className="bg-[#0d1117] p-4 rounded-xl text-xs text-blue-400 min-h-[80px] border border-slate-800">
            <p className="text-slate-500 text-[9px] mb-2 font-bold uppercase tracking-widest">Cluster MPI Output:</p>
            {cluster.output || "> Waiting for optimized code..."}
          </div>
        </div>
      </div>

      {/* Comparison Chart */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 h-[450px] relative">
          <div className="absolute top-8 left-8">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-1 flex items-center gap-2">
              <BarChart3 size={18} /> Performance Benchmark
            </h3>
            {benchmarkData.length > 0 && (
              <p className="text-green-600 font-bold text-xs bg-green-50 px-3 py-1 rounded-full border border-green-100 inline-block">
                {(benchmarkData[0].time / benchmarkData[1].time).toFixed(2)}x Faster than Sequential
              </p>
            )}
          </div>
          
          <div className="h-full pt-16">
            {benchmarkData.length > 0 ? (
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={benchmarkData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 600}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '12px' }} 
                    itemStyle={{ color: '#ffffff', fontWeight: 'bold' }} // ตัวหนังสือข้างในสีขาว
                    labelStyle={{ color: '#94a3b8', marginBottom: '4px', fontSize: '10px', textTransform: 'uppercase' }}
                  />
                  <Bar dataKey="time" radius={[8, 8, 8, 8]} barSize={60}>
                    {benchmarkData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4">
                <BarChart3 size={64} strokeWidth={1} />
                <p className="font-medium">Please run code to visualize comparison data</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}