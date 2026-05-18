import PCApp from './pc/PCApp.jsx';
import MobileApp from './mobile/MobileApp.jsx';
import { usePlatform } from './lib/usePlatform.js';

export default function App() {
  const platform = usePlatform();
  return platform === 'mobile' ? <MobileApp /> : <PCApp />;
}
