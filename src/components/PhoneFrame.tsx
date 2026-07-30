import StatusBar from './StatusBar';

interface PhoneFrameProps {
  children: React.ReactNode;
}

export default function PhoneFrame({ children }: PhoneFrameProps) {
  return (
    <div className="phone-frame">
      <StatusBar />
      <div className="phone-frame__content">
        {children}
      </div>
    </div>
  );
}
