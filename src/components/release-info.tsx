"use client";

import { useCallback, useState } from "react";
import releases from "@/lib/releases.json";
import { Modal } from "./ui";

/** Release metadata is bundled with the app, so the log also works locally offline.
 * It never reads or writes draft storage. App versions are separate from save versions.
 */
export default function ReleaseInfo() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        className="version-chip"
        aria-label={`Version ${releases[0].version} — open release log`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        v{releases[0].version}
      </button>
      {open && (
        <Modal
          title="Release log"
          subtitle="How your War Room is growing."
          onClose={close}
        >
          <p className="release-storage-note">
            Your draft saves in this browser. To continue on another device,
            export a JSON backup, transfer the file, then restore it there. Use
            one device to record picks at a time.
          </p>
          <ol className="release-list">
            {releases.map((release, index) => (
              <li key={release.version}>
                <div className="release-meta">
                  <strong>v{release.version}</strong>
                  <time dateTime={release.date}>{release.date}</time>
                  {index === 0 && <span>Current</span>}
                </div>
                <h3>{release.title}</h3>
                <p>{release.summary}</p>
                <ul>
                  {release.changes.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
                <p className="release-compatibility">{release.compatibility}</p>
              </li>
            ))}
          </ol>
        </Modal>
      )}
    </>
  );
}
