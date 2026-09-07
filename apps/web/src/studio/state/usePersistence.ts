import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectDoc } from '@ui-builder/schema';
import { ApiError } from '../../api/client.js';
import * as documentsApi from '../../api/documents.js';

/**
 * Autosave — PLAN.md §12, Phase 8.
 *
 * How long the document has to stop changing before it is sent. A styling gesture is a
 * burst of commits (a field, then the next field, then a colour), and one request per
 * commit would put the save indicator into a permanent flicker for no extra safety —
 * a save that lands 900ms after the last edit is not meaningfully riskier than one that
 * lands 90ms after it. {@link MAX_SAVE_DELAY_MS} is what stops a long unbroken burst
 * from deferring the save indefinitely.
 */
export const SAVE_DEBOUNCE_MS = 900;

/** The longest the document may stay unsaved while edits keep arriving. */
export const MAX_SAVE_DELAY_MS = 5_000;

/**
 * What the topbar shows.
 *
 * `conflict` is terminal until the user chooses a side: autosave stops, because every
 * further attempt would be refused for the same reason and the retries would bury the
 * message explaining why.
 */
export type SaveStatus = 'loading' | 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

export interface Persistence {
  status: SaveStatus;
  /** The version the last accepted save landed on. */
  version: number;
  /** Set for `error` and `conflict` — what to put in front of the user. */
  problem: string | null;
  /** True while a save is owed or in flight; drives the unload guard. */
  unsaved: boolean;
  /** The other side of a conflict, fetched when one is detected. */
  serverDoc: ProjectDoc | null;

  /** Sends now rather than on the debounce — for ⌘S and for "Save version". */
  saveNow: (options?: { label?: string }) => Promise<void>;
  /** Conflict resolution: overwrite the server with what is on screen. */
  keepMine: () => Promise<void>;
  /**
   * Replaces the saved baseline with a document the server already holds — a restore,
   * or a conflict resolved by taking the other side. The caller installs it in the
   * document state; this only stops it being sent straight back.
   */
  markSaved: (doc: ProjectDoc, version: number) => void;
}

interface Options {
  projectId: string;
  /** The live document. `null` while it is still being loaded. */
  doc: ProjectDoc | null;
  /** Whether this user may write. A viewer loads the document and never saves it. */
  writable: boolean;
  /**
   * The load has answered. `null` means the project has never been saved and the caller
   * should seed a starter document — which will then look dirty and be written.
   *
   * Must be stable: it is a dependency of the load effect, and a handler rebuilt every
   * render would re-fetch the document on every keystroke.
   */
  onLoaded: (doc: ProjectDoc | null) => void;
}

/**
 * Owns the conversation with the API about one project's document.
 *
 * Deliberately not TanStack Query: this is not a cache with a refetch policy, it is a
 * write loop over state the studio already holds. What Query would contribute — dedupe,
 * staleness, retries — is either wrong here (a retried save would race the debounce) or
 * already handled (the version lock, not a cache key, is what makes a save safe).
 *
 * The mount is per project — the caller keys it on `projectId` — so nothing here has to
 * reset itself when the project changes.
 */
export function usePersistence({ projectId, doc, writable, onLoaded }: Options): Persistence {
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [version, setVersion] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [serverDoc, setServerDoc] = useState<ProjectDoc | null>(null);

  /**
   * The document as the server last acknowledged it.
   *
   * State rather than a ref, because the render reads it: "is anything unsaved?" is the
   * question the indicator and the unload guard are both asking. It changes once per
   * save, not once per edit, so it costs nothing to keep in state.
   */
  const [savedDoc, setSavedDoc] = useState<ProjectDoc | null>(null);

  /**
   * The document a save was last refused for.
   *
   * Without it, a failure would leave the document dirty, the effect would re-arm, and
   * an unreachable server would be hammered once a second forever. Editing anything
   * produces a new document and so retries on its own, which is the right trigger: the
   * user did something, and the attempt is worth making again.
   */
  const [failedDoc, setFailedDoc] = useState<ProjectDoc | null>(null);

  // Refs only for what is read from an async callback, never during a render.
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When the current run of unsaved edits began, so a burst cannot defer a save forever.
  const dirtySince = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const markSaved = useCallback(
    (next: ProjectDoc, nextVersion: number) => {
      setSavedDoc(next);
      setVersion(nextVersion);
      dirtySince.current = null;
      setProblem(null);
      setServerDoc(null);
      clearTimer();
      setStatus('saved');
    },
    [clearTimer],
  );

  /**
   * The single writer. Every path in — the debounce, ⌘S, "Save version", "keep mine" —
   * goes through here so that only one save can ever be in flight and the "did anything
   * change while it was in flight?" question is asked in one place.
   */
  const flush = useCallback(
    async (candidate: ProjectDoc, baseVersion: number, label?: string) => {
      if (inFlight.current) return;

      inFlight.current = true;
      clearTimer();
      setStatus('saving');

      try {
        const result = await documentsApi.saveDocument(projectId, {
          doc: candidate,
          baseVersion,
          ...(label === undefined ? {} : { label }),
        });

        setSavedDoc(candidate);
        setVersion(result.version);
        setProblem(null);
        setServerDoc(null);
        setFailedDoc(null);
        dirtySince.current = null;
        // The document may well have moved on while the request was out; the effect
        // watching `doc` re-arms the debounce, so this only says "nothing is owed as
        // of what was sent".
        setStatus('saved');
      } catch (error) {
        if (error instanceof ApiError && error.code === 'conflict') {
          setProblem(error.message);
          setStatus('conflict');

          // Fetch the other side straight away: the choice being offered is between two
          // documents, and one of them has to be in hand to offer it.
          try {
            const remote = await documentsApi.getDocument(projectId);
            if (remote.doc) {
              setServerDoc(remote.doc);
              // Adopting their version as the base is what makes a subsequent "keep
              // mine" a deliberate overwrite rather than a second refusal.
              setVersion(remote.version);
            }
          } catch {
            // Leave `serverDoc` null — the dialog falls back to offering a reload.
          }
        } else {
          setProblem(error instanceof Error ? error.message : 'The document could not be saved.');
          setFailedDoc(candidate);
          setStatus('error');
        }
      } finally {
        inFlight.current = false;
      }
    },
    [clearTimer, projectId],
  );

  /* Load. Runs once, because the hook is mounted per project. */
  useEffect(() => {
    let cancelled = false;

    documentsApi
      .getDocument(projectId)
      .then((response) => {
        if (cancelled) return;
        setVersion(response.version);
        // `savedDoc` stays null when the project has never been saved, which is exactly
        // what makes the seeded starter document look dirty and get written.
        setSavedDoc(response.doc);
        setStatus(response.doc ? 'saved' : 'dirty');
        onLoaded(response.doc);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setProblem(error instanceof Error ? error.message : 'The document could not be loaded.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [onLoaded, projectId]);

  const unsaved = writable && doc !== null && doc !== savedDoc && status !== 'loading';

  /* Autosave. */
  useEffect(() => {
    if (!unsaved) return;
    if (status === 'conflict') return;
    if (doc === null || doc === failedDoc) return;

    dirtySince.current ??= Date.now();

    // A save is already out for an older document. Its completion re-renders, and this
    // effect arms the next one then — arming now would race the response.
    if (inFlight.current) return;

    const waited = Date.now() - dirtySince.current;
    const delay = Math.max(0, Math.min(SAVE_DEBOUNCE_MS, MAX_SAVE_DELAY_MS - waited));

    clearTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      void flush(doc, version);
    }, delay);

    return clearTimer;
  }, [clearTimer, doc, failedDoc, flush, status, unsaved, version]);

  /**
   * `dirty` is the state between an edit and the request going out. It is derived here
   * rather than set in the effect above, because setting state synchronously in an
   * effect is what makes a render cascade — and this is exactly the fact `unsaved`
   * already knows.
   *
   * `error` and `conflict` are not overwritten: both mean the document is unsaved *and*
   * something needs attention, and "Unsaved" alone would read as the ordinary state
   * that clears itself in a second.
   */
  const visibleStatus: SaveStatus = unsaved && status === 'saved' ? 'dirty' : status;

  /* The last line of defence: a reload with edits still in the debounce window. */
  useEffect(() => {
    if (!unsaved) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // Browsers ignore the message and show their own, but preventDefault is still
      // what asks for the prompt at all.
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsaved]);

  const saveNow = useCallback(
    async (options: { label?: string } = {}) => {
      if (!writable || !doc) return;
      // A labelled save is a deliberate bookmark, so it goes even when nothing changed —
      // "Save version" that silently did nothing would be the worse surprise.
      if (doc === savedDoc && options.label === undefined) return;
      await flush(doc, version, options.label);
    },
    [doc, flush, savedDoc, version, writable],
  );

  const keepMine = useCallback(async () => {
    if (!doc) return;
    // `version` moved to the server's when the conflict was detected, so this save is
    // now based on it and will be accepted — deliberately overwriting.
    await flush(doc, version);
  }, [doc, flush, version]);

  return {
    status: visibleStatus,
    version,
    problem,
    unsaved,
    serverDoc,
    saveNow,
    keepMine,
    markSaved,
  };
}
