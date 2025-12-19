import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatsWidgetProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  subtext?: string;
}

export const StatsWidget: React.FC<StatsWidgetProps> = ({ label, value, icon: Icon, color, subtext }) => (
  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-start gap-4 hover:shadow-md transition-shadow">
    <div className={`p-3 rounded-lg ${color} bg-opacity-10 text-white`}>
      <Icon size={24} className={color.replace('bg-', 'text-')} />
    </div>
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
      {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
    </div>
  </div>
);
