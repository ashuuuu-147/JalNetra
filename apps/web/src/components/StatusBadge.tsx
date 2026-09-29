import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  labelOverride?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, labelOverride }) => {
  const norm = (status || 'unknown').toLowerCase();

  let icon = <HelpCircle size={15} aria-hidden="true" />;
  let defaultLabel = status;
  let badgeClass = 'badge-unavailable';

  switch (norm) {
    case 'advisory':
      icon = <ShieldCheck size={15} aria-hidden="true" />;
      defaultLabel = 'Advisory (Routine)';
      badgeClass = 'badge-advisory';
      break;
    case 'watch':
      icon = <Clock size={15} aria-hidden="true" />;
      defaultLabel = 'Watch (Elevated)';
      badgeClass = 'badge-watch';
      break;
    case 'warning':
      icon = <AlertTriangle size={15} aria-hidden="true" />;
      defaultLabel = 'Warning (High Risk)';
      badgeClass = 'badge-warning';
      break;
    case 'critical':
      icon = <AlertOctagon size={15} aria-hidden="true" />;
      defaultLabel = 'Critical (Immediate Action)';
      badgeClass = 'badge-critical';
      break;
    case 'healthy':
    case 'valid':
    case 'online_receiving':
      icon = <CheckCircle2 size={15} aria-hidden="true" />;
      defaultLabel = norm === 'online_receiving' ? 'Online — Telemetry Active' : 'Healthy';
      badgeClass = 'badge-healthy';
      break;
    case 'verified':
      icon = <ShieldCheck size={15} aria-hidden="true" />;
      defaultLabel = 'Verified Official Relief Shelter';
      badgeClass = 'badge-verified';
      break;
    case 'verification_required':
      icon = <AlertTriangle size={15} aria-hidden="true" />;
      defaultLabel = 'Shelter location found — verification required';
      badgeClass = 'badge-verification_required';
      break;
    case 'authentication_required':
      icon = <KeyRound size={15} aria-hidden="true" />;
      defaultLabel = 'Authentication Required';
      badgeClass = 'badge-authentication_required';
      break;
    case 'stale':
    case 'stale_observation':
      icon = <Clock size={15} aria-hidden="true" />;
      defaultLabel = 'Data Stale';
      badgeClass = 'badge-stale';
      break;
    case 'awaiting_telemetry':
    case 'empty':
      icon = <Clock size={15} aria-hidden="true" />;
      defaultLabel = norm === 'awaiting_telemetry' ? 'No observation received' : 'No Data / Empty';
      badgeClass = 'badge-empty';
      break;
    case 'processing_error':
    case 'impossible_value':
      icon = <XCircle size={15} aria-hidden="true" />;
      defaultLabel = 'Processing / Quality Error';
      badgeClass = 'badge-processing_error';
      break;
    case 'official_warning':
      icon = <ShieldAlert size={15} aria-hidden="true" />;
      defaultLabel = 'Official Government Warning';
      badgeClass = 'badge-warning';
      break;
    case 'floodguard_ai_advisory':
      icon = <ShieldCheck size={15} aria-hidden="true" />;
      defaultLabel = 'FloodGuard AI Advisory (Decision Support)';
      badgeClass = 'badge-advisory';
      break;
    default:
      icon = <HelpCircle size={15} aria-hidden="true" />;
      defaultLabel = labelOverride || status || 'Source Unavailable';
      badgeClass = 'badge-unavailable';
      break;
  }

  return (
    <span className={`status-badge ${badgeClass}`}>
      {icon}
      <span>{labelOverride || defaultLabel}</span>
    </span>
  );
};
