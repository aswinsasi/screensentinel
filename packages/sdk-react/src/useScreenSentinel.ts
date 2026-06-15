import { useEffect, useRef } from 'react';
import { ScreenSentinel, InitConfig } from '@screensentinel/sdk';

export function useScreenSentinel(config: InitConfig) {
  const instanceRef = useRef<ScreenSentinel | null>(null);

  useEffect(() => {
    instanceRef.current = ScreenSentinel.init(config);
    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [config.userId, config.sessionId]);

  return {
    isReady: instanceRef.current?.isReady ?? false,
    setDebug: (enabled: boolean) => instanceRef.current?.setDebug(enabled),
    destroy: () => instanceRef.current?.destroy(),
  };
}
