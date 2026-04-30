interface SIProps {
  d: string | string[];
  sz?: number;
  w?: number;
  style?: React.CSSProperties;
  className?: string;
}

export function SI({ d, sz = 14, w = 2, style, className }: SIProps) {
  return (
    <svg
      width={sz}
      height={sz}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={w}
      style={style}
      className={className}
    >
      {Array.isArray(d)
        ? d.map((x, i) => <path key={i} d={x} />)
        : <path d={d} />
      }
    </svg>
  );
}
