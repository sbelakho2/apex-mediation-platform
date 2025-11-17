// Reference: Design.md § "Scalloped Edges"
// Reusable scalloped edge divider component for visual separation between sections

interface ScallopedDividerProps {
  /**
   * Accepts one of the predefined tokens or any valid CSS color string (e.g., hex, rgb, var(--token)).
   */
  color?: 'yellow' | 'blue' | 'cream' | 'white' | string;
  position?: 'top' | 'bottom';
  className?: string;
}

export default function ScallopedDivider({
  color = 'yellow',
  position = 'bottom',
  className = ''
}: ScallopedDividerProps) {
  const colors = {
    yellow: '#FECB00',
    blue: '#005293',
    cream: '#E8E3D1',
    white: '#FFFFFF',
  };

  const fillColor = (colors as Record<string, string>)[color as string] || (color as string);
  const rotation = position === 'top' ? 'rotate-180' : '';

  return (
    <div className={`relative w-full h-6 overflow-hidden ${className}`}>
      <svg
        className={`absolute ${position === 'bottom' ? 'bottom-0' : 'top-0'} left-0 w-full h-6 ${rotation}`}
        viewBox="0 0 1200 24"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M0,12 Q30,0 60,12 T120,12 T180,12 T240,12 T300,12 T360,12 T420,12 T480,12 T540,12 T600,12 T660,12 T720,12 T780,12 T840,12 T900,12 T960,12 T1020,12 T1080,12 T1140,12 T1200,12 L1200,24 L0,24 Z"
          fill={fillColor}
        />
      </svg>
    </div>
  );
}
