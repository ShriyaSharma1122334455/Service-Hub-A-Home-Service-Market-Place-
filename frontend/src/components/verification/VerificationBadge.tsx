import React from 'react';
import { CheckCircle, Clock, XCircle, MinusCircle } from 'lucide-react';

export type VerificationStatus = 'verified' | 'pending' | 'unverified' | 'failed';

interface VerificationBadgeProps {
  status: VerificationStatus;
  onClick?: () => void;
  className?: string;
  showText?: boolean;
}

export const VerificationBadge = ({ 
  status, 
  onClick, 
  className = '',
  showText = false
}: VerificationBadgeProps) => {
  const config = {
    verified: {
      color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      icon: <CheckCircle className="w-4 h-4" />,
      label: 'Identity Verified',
    },
    pending: {
      color: 'bg-amber-100 text-amber-700 border-amber-200',
      icon: <Clock className="w-4 h-4" />,
      label: 'Verification Pending',
    },
    failed: {
      color: 'bg-rose-100 text-rose-700 border-rose-200',
      icon: <XCircle className="w-4 h-4" />,
      label: 'Verification Failed',
    },
    unverified: {
      color: 'bg-slate-100 text-slate-500 border-slate-200',
      icon: <MinusCircle className="w-4 h-4" />,
      label: 'Not Verified',
    },
  };

  const { color, icon, label } = config[status || 'unverified'] || config['unverified'];

  return (
    <div
      onClick={onClick}
      title={label}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shadow-sm transition-all
        ${onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} 
        ${color} ${className}`}
    >
      {icon}
      {showText && <span>{label}</span>}
    </div>
  );
};
