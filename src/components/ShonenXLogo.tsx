import React from 'react';

interface ShizuTvLogoProps {
  className?: string;
  size?: number;
}

export const ShizuTvLogo: React.FC<ShizuTvLogoProps> = ({
  className = '',
  size = 28,
}) => {
  return (
    <img
      src="/assets/aistudio/Vector_4e933b84.svg"
      alt="ShizuTv"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`object-contain select-none shrink-0 ${className}`}
      draggable={false}
    />
  );
};

// Backwards-compatible export alias
export const ShonenXLogo = ShizuTvLogo;
