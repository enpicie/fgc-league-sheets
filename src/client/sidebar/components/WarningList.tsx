import React from 'react';

interface Props {
  warnings: string[];
  title?: string;
}

export default function WarningList({ warnings, title = 'Warnings' }: Props) {
  if (warnings.length === 0) return null;
  return (
    <div className="warnings">
      <h3>{title}</h3>
      <ul>
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
