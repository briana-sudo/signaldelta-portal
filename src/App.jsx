import { useEffect } from 'react';
import PCApp from './pc/PCApp.jsx';
import MobileApp from './mobile/MobileApp.jsx';
import { usePlatform } from './lib/usePlatform.js';
import { useNeo4jPoll } from './hooks/useNeo4jPoll.js';
import { summarizePoll } from './lib/dataAdapter.js';

export default function App() {
  const platform = usePlatform();
  const { data, error, loading } = useNeo4jPoll();

  // Console telemetry per first-poll verification. Logs once per successful
  // poll cycle with the per-query row counts.
  useEffect(() => {
    if (data) {
      // eslint-disable-next-line no-console
      console.info('[signaldelta] poll OK', summarizePoll(data));
    }
  }, [data]);

  useEffect(() => {
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[signaldelta] poll FAIL', error);
    }
  }, [error]);

  const props = { data, error, loading };
  return platform === 'mobile' ? <MobileApp {...props} /> : <PCApp {...props} />;
}
