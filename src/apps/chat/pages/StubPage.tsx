import { CaretLeft } from '@phosphor-icons/react';

interface StubPageProps {
  onBack: () => void;
  title: string;
  description: string;
}

export default function StubPage({ onBack, title, description }: StubPageProps) {
  return (
    <div className="func-fullpage">
      <div className="func-fullpage__header">
        <button className="back-btn" onClick={onBack}><CaretLeft size={18} /> 返回</button>
        <h1>{title}</h1>
      </div>
      <div className="func-fullpage__body" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <p style={{ color: 'var(--app-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>{description}</p>
      </div>
    </div>
  );
}
