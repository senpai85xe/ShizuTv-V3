import React from 'react';
import { parseSubtitleSegments } from '../utils/inlinePlayer';

interface SubtitleFormattedTextProps {
  text: string;
}

export const SubtitleFormattedText: React.FC<SubtitleFormattedTextProps> = ({ text }) => {
  const segments = parseSubtitleSegments(text);
  return (
    <>
      {segments.map((seg, idx) => {
        const classNames = [
          seg.italic ? 'italic' : '',
          seg.bold ? 'font-black' : '',
          seg.underline ? 'underline underline-offset-2' : '',
        ]
          .filter(Boolean)
          .join(' ');
        if (!classNames) {
          return <React.Fragment key={idx}>{seg.text}</React.Fragment>;
        }
        return (
          <span key={idx} className={classNames}>
            {seg.text}
          </span>
        );
      })}
    </>
  );
};
