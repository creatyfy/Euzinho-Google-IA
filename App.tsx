import React from 'react';
import EuzinhoChat from './components/EuzinhoChat';

const App: React.FC = () => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center font-sans text-white p-4">
      <EuzinhoChat />
    </div>
  );
};

export default App;
