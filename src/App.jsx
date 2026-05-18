import { useEffect } from 'react';
import PCApp from './pc/PCApp.jsx';
import MobileApp from './mobile/MobileApp.jsx';
import { usePlatform } from './lib/usePlatform.js';
import { useNeo4jPoll } from './hooks/useNeo4jPoll.js';
import { summarizePoll } from './lib/dataAdapter.js';

export default function App() {
  const platform = usePlatform();
  const { data, errors, hasAnyData, error, loading } = useNeo4jPoll();

  // Console telemetry per first-poll verification. Logs once per successful
  // poll cycle with the per-query row counts. With Promise.allSettled, "OK"
  // means the cycle settled — individual query failures land in `errors`.
  useEffect(() => {
    if (data) {
      // eslint-disable-next-line no-console
      console.info('[signaldelta] poll cycle settled', {
        ...summarizePoll(data),
        failed: Object.keys(errors),
        hasAnyData,
      });
    }
  }, [data, errors, hasAnyData]);

  useEffect(() => {
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[signaldelta] poll FATAL', error);
    }
  }, [error]);

  const props = { data, errors, hasAnyData, error, loading };
  return platform === 'mobile' ? <MobileApp {...props} /> : <PCApp {...props} />;
}
