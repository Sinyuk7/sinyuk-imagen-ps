interface TipProps {
  label: string;
  children: React.ReactNode;
  right?: boolean;
}

export function Tip({ label, children, right }: TipProps) {
  return (
    <div className="tt-wrap" style={right ? { display: 'inline-flex' } : {}}>
      {children}
      <div className="tt" style={right ? { left: 'auto', right: 0, transform: 'none' } : {}}>
        {label}
      </div>
    </div>
  );
}
