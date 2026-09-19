"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, errorText, type Page } from "../../lib/kitchen/client";
import { flavorName, type FlavorEntry } from "../../lib/kitchen/flavors";

const FlavorContext = createContext({
  entries: [] as FlavorEntry[],
  loading: false,
  error: "",
  reload: () => {},
  upsert: (_entry: FlavorEntry) => {},
});
export const useFlavors = () => useContext(FlavorContext);
export function FlavorName({ id }: { id: string }) {
  return <>{flavorName(id, useFlavors().entries)}</>;
}
export function FlavorProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<FlavorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const request = useMemo(() => ({ path: "/flavor-profiles", revision }), [revision]);
  const mutations = useRef(0);
  useEffect(() => {
    const abort = new AbortController();
    const start = mutations.current;
    setLoading(true);
    setError("");
    (async () => {
      const result: FlavorEntry[] = [];
      const cursors = new Set<string>();
      let after = "";
      for (;;) {
        if (cursors.has(after))
          throw new Error("The flavour library repeated a page. Please retry.");
        cursors.add(after);
        const { data } = await api<Page<FlavorEntry>>(
          `${request.path}?limit=100&after=${encodeURIComponent(after)}`,
          { signal: abort.signal },
        );
        result.push(...data.items);
        if (result.length > 2000)
          throw new Error("This library exceeds the current 2,000-profile display limit.");
        if (data.nextAfter === null) break;
        after = data.nextAfter;
      }
      if (!abort.signal.aborted && mutations.current === start) setEntries(result);
    })()
      .catch((cause) => {
        if (!abort.signal.aborted) setError(errorText(cause));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [request]);
  function upsert(entry: FlavorEntry) {
    mutations.current++;
    setEntries((current) => [...current.filter((item) => item.id !== entry.id), entry]);
  }
  return (
    <FlavorContext.Provider
      value={{ entries, loading, error, reload: () => setRevision((value) => value + 1), upsert }}
    >
      {children}
    </FlavorContext.Provider>
  );
}
