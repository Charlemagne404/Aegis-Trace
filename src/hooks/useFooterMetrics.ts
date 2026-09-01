import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { PlatformAdapter } from "@/platform/platformAdapter";
import type { SystemMetrics } from "@/core/types";

const FOOTER_POLL_INTERVAL_MS = 4_000;
const FOOTER_HISTORY_LIMIT = 12;

type FooterMetricsState = {
  source: SystemMetrics["source"];
  collectedAt: string | null;
  uptimeSeconds: number | null;
  cpuUsagePercent: number | null;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
  memoryUsagePercent: number | null;
  downloadBitsPerSecond: number | null;
  uploadBitsPerSecond: number | null;
  cpuHistory: Array<number | null>;
  memoryHistory: Array<number | null>;
};

const EMPTY_HISTORY = Array<number | null>(FOOTER_HISTORY_LIMIT).fill(null);

const INITIAL_STATE: FooterMetricsState = {
  source: "unavailable",
  collectedAt: null,
  uptimeSeconds: null,
  cpuUsagePercent: null,
  memoryUsedBytes: null,
  memoryTotalBytes: null,
  memoryUsagePercent: null,
  downloadBitsPerSecond: null,
  uploadBitsPerSecond: null,
  cpuHistory: EMPTY_HISTORY,
  memoryHistory: EMPTY_HISTORY
};

function appendSample(history: Array<number | null>, nextValue: number | null) {
  return [...history.slice(-(FOOTER_HISTORY_LIMIT - 1)), nextValue];
}

export function useFooterMetrics(adapter: PlatformAdapter) {
  const [metrics, setMetrics] = useState(INITIAL_STATE);
  const previousSampleRef = useRef<SystemMetrics | null>(null);

  const pollMetrics = useEffectEvent(async () => {
    const nextSample = await adapter.getSystemMetrics();
    const previousSample = previousSampleRef.current;
    previousSampleRef.current = nextSample;

    const memoryUsagePercent =
      nextSample.memoryUsedBytes !== null &&
      nextSample.memoryTotalBytes !== null &&
      nextSample.memoryTotalBytes > 0
        ? (nextSample.memoryUsedBytes / nextSample.memoryTotalBytes) * 100
        : null;

    const elapsedSeconds = previousSample
      ? (new Date(nextSample.collectedAt).getTime() -
          new Date(previousSample.collectedAt).getTime()) /
        1000
      : 0;

    const hasUsableNetworkDelta =
      previousSample &&
      elapsedSeconds > 0 &&
      nextSample.networkReceivedBytes !== null &&
      previousSample.networkReceivedBytes !== null &&
      nextSample.networkTransmittedBytes !== null &&
      previousSample.networkTransmittedBytes !== null &&
      nextSample.networkReceivedBytes >= previousSample.networkReceivedBytes &&
      nextSample.networkTransmittedBytes >= previousSample.networkTransmittedBytes;

    const downloadBitsPerSecond = hasUsableNetworkDelta
      ? ((nextSample.networkReceivedBytes! - previousSample.networkReceivedBytes!) * 8) /
        elapsedSeconds
      : null;

    const uploadBitsPerSecond = hasUsableNetworkDelta
      ? ((nextSample.networkTransmittedBytes! - previousSample.networkTransmittedBytes!) * 8) /
        elapsedSeconds
      : null;

    setMetrics((current) => ({
      source: nextSample.source,
      collectedAt: nextSample.collectedAt,
      uptimeSeconds: nextSample.uptimeSeconds,
      cpuUsagePercent: nextSample.cpuUsagePercent,
      memoryUsedBytes: nextSample.memoryUsedBytes,
      memoryTotalBytes: nextSample.memoryTotalBytes,
      memoryUsagePercent,
      downloadBitsPerSecond,
      uploadBitsPerSecond,
      cpuHistory: appendSample(current.cpuHistory, nextSample.cpuUsagePercent),
      memoryHistory: appendSample(current.memoryHistory, memoryUsagePercent)
    }));
  });

  useEffect(() => {
    previousSampleRef.current = null;
    setMetrics(INITIAL_STATE);

    let disposed = false;

    const run = async () => {
      try {
        if (!disposed) {
          await pollMetrics();
        }
      } catch (error) {
        console.warn("Failed to refresh footer metrics", error);
      }
    };

    void run();
    const intervalId = window.setInterval(() => {
      void run();
    }, FOOTER_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [adapter]);

  return metrics;
}
