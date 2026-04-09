import React from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import { ParsedCitation } from '../services/chat';

interface SourceCitationProps {
  citations: ParsedCitation[];
  ragChunks?: { regulation: string; jurisdiction: string }[];
  compact?: boolean;
}

const JURISDICTION_FLAG: Record<string, string> = {
  eu: '🇪🇺',
  france: '🇫🇷',
  morocco: '🇲🇦',
  usa: '🇺🇸',
  canada: '🇨🇦',
  international: '🌐',
};

const REGULATION_COLORS: Record<string, string> = {
  RGPD: 'bg-blue-100 text-blue-800 border-blue-200',
  GDPR: 'bg-blue-100 text-blue-800 border-blue-200',
  'AI ACT': 'bg-purple-100 text-purple-800 border-purple-200',
  'AI_ACT': 'bg-purple-100 text-purple-800 border-purple-200',
  DGA: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'LOI 09-08': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'LOI 09_08': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'NIST AI RMF': 'bg-orange-100 text-orange-800 border-orange-200',
  'NIST': 'bg-orange-100 text-orange-800 border-orange-200',
  'ISO 27001': 'bg-red-100 text-red-800 border-red-200',
  'ISO 42001': 'bg-pink-100 text-pink-800 border-pink-200',
  AIDA: 'bg-teal-100 text-teal-800 border-teal-200',
  CNIL: 'bg-violet-100 text-violet-800 border-violet-200',
};

function getCitationColor(regulation: string): string {
  const key = regulation.toUpperCase().trim();
  for (const [pattern, color] of Object.entries(REGULATION_COLORS)) {
    if (key.includes(pattern)) return color;
  }
  return 'bg-zinc-100 text-zinc-700 border-zinc-200';
}

interface CitationBadgeProps {
  citation: ParsedCitation;
}

export const CitationBadge: React.FC<CitationBadgeProps> = ({ citation }) => {
  const color = getCitationColor(citation.regulation);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${color}`}
      title={citation.label}
    >
      <BookOpen className="w-2.5 h-2.5" />
      {citation.label}
    </span>
  );
};

export const SourceCitation: React.FC<SourceCitationProps> = ({ citations, ragChunks, compact }) => {
  if (citations.length === 0 && (!ragChunks || ragChunks.length === 0)) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {citations.map((c, i) => (
          <CitationBadge key={i} citation={c} />
        ))}
      </div>
    );
  }

  // Group RAG chunks by jurisdiction
  const ragByJurisdiction: Record<string, string[]> = {};
  for (const chunk of ragChunks || []) {
    if (!ragByJurisdiction[chunk.jurisdiction]) ragByJurisdiction[chunk.jurisdiction] = [];
    if (!ragByJurisdiction[chunk.jurisdiction].includes(chunk.regulation)) {
      ragByJurisdiction[chunk.jurisdiction].push(chunk.regulation);
    }
  }

  return (
    <div className="mt-3 p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-3">
      {/* Citations */}
      {citations.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            Sources citées ({citations.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {citations.map((c, i) => (
              <CitationBadge key={i} citation={c} />
            ))}
          </div>
        </div>
      )}

      {/* RAG Corpus used */}
      {Object.keys(ragByJurisdiction).length > 0 && (
        <div className="space-y-1.5 border-t border-zinc-100 pt-2">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
            <ExternalLink className="w-3 h-3" />
            Corpus réglementaire consulté
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(ragByJurisdiction).map(([jurisdiction, regs]) => (
              <span key={jurisdiction} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white border border-zinc-200 text-zinc-600">
                {JURISDICTION_FLAG[jurisdiction] || '🌐'}
                {regs.join(', ')}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
